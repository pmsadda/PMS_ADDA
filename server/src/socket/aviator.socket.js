"use strict";

const jwt = require("jsonwebtoken");

const { pool } = require("../config/database");

const {
  ROUND_STATUS,
  createRound,
  startFlight,
  crashRound,
  getActiveRound,
  getGameSettings,
  getPublicGameState,
  mapRoundRow,
} = require("../services/aviator.service");

/* ==========================
   Socket Settings
========================== */

const PUBLIC_ROOM = "aviator:public";

/*
 * Multiplier কত দ্রুত বাড়বে।
 *
 * 0.08 হলে আনুমানিক:
 * 2x    ≈ 8.7 sec
 * 5x    ≈ 20 sec
 * 10x   ≈ 28.8 sec
 * 100x  ≈ 57.6 sec
 */
const GROWTH_RATE = 0.08;

/*
 * প্রতি 100ms-এ server
 * multiplier broadcast করবে।
 */
const TICK_MS = 100;

/* ==========================
   Runtime Timers
========================== */

let bettingTimer = null;

let flightTimer = null;

let nextRoundTimer = null;

let loopBusy = false;

/* ==========================
   Socket Authentication
========================== */

async function authenticateSocket(socket, next) {
  try {
    const headerToken = socket.handshake.headers?.authorization?.replace(
      /^Bearer\s+/i,
      "",
    );

    const token = socket.handshake.auth?.token || headerToken;

    if (!token) {
      const error = new Error("Authentication token is required.");

      error.data = {
        statusCode: 401,
        code: "SOCKET_TOKEN_REQUIRED",
      };

      return next(error);
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ["HS256"],
    });

    const userId = Number(decoded.id);

    if (!Number.isInteger(userId) || userId <= 0) {
      const error = new Error("Invalid authenticated user.");

      error.data = {
        statusCode: 401,
        code: "SOCKET_USER_INVALID",
      };

      return next(error);
    }

    const [rows] = await pool.query(
      `
          SELECT
            id,
            uid,
            role,
            account_status
          FROM users
          WHERE id = ?
          LIMIT 1
        `,
      [userId],
    );

    const user = rows[0] || null;

    if (!user) {
      const error = new Error("User account was not found.");

      error.data = {
        statusCode: 401,
        code: "SOCKET_USER_NOT_FOUND",
      };

      return next(error);
    }

    if (String(user.account_status || "").toLowerCase() !== "active") {
      const error = new Error("This account is not active.");

      error.data = {
        statusCode: 403,
        code: "SOCKET_ACCOUNT_INACTIVE",
      };

      return next(error);
    }

    socket.user = {
      id: Number(user.id),

      uid: user.uid || null,

      role: String(user.role || "user").toLowerCase(),
    };

    return next();
  } catch (error) {
    const isTokenError = [
      "JsonWebTokenError",
      "TokenExpiredError",
      "NotBeforeError",
    ].includes(error.name);

    const socketError = new Error(
      isTokenError
        ? "Invalid or expired authentication token."
        : "Socket authentication is temporarily unavailable.",
    );

    socketError.data = {
      statusCode: isTokenError ? 401 : 500,

      code: isTokenError ? "SOCKET_AUTH_FAILED" : "SOCKET_AUTH_DATABASE_ERROR",
    };

    return next(socketError);
  }
}

/* ==========================
   Clear Timers
========================== */

function clearBettingTimer() {
  if (bettingTimer) {
    clearTimeout(bettingTimer);

    bettingTimer = null;
  }
}

function clearFlightTimer() {
  if (flightTimer) {
    clearInterval(flightTimer);

    flightTimer = null;
  }
}

function clearNextRoundTimer() {
  if (nextRoundTimer) {
    clearTimeout(nextRoundTimer);

    nextRoundTimer = null;
  }
}

/* ==========================
   Active Users
========================== */

function hasActiveUsers(namespace) {
  return namespace.sockets.size > 0;
}

/* ==========================
   Calculate Multiplier
========================== */

function calculateMultiplier(flightStartedAtMs, nowMs = Date.now()) {
  const startTime = Number(flightStartedAtMs);

  if (!Number.isFinite(startTime) || startTime <= 0) {
    return 1.0;
  }

  const elapsedMs = Math.max(0, nowMs - startTime);

  const elapsedSeconds = elapsedMs / 1000;

  /*
   * Exponential growth:
   *
   * multiplier =
   * e^(growthRate * time)
   */
  const multiplier = Math.exp(GROWTH_RATE * elapsedSeconds);

  return Number(Math.max(1, multiplier).toFixed(2));
}

/* ==========================
   Emit Public State
========================== */

async function emitPublicState(namespace) {
  try {
    const state = await getPublicGameState();

    namespace.to(PUBLIC_ROOM).emit("aviator:state", {
      success: true,

      data: state,
    });

    return state;
  } catch (error) {
    console.error("AVIATOR STATE ERROR:", error);

    return null;
  }
}

/* ==========================
   Schedule Next Round
========================== */

async function scheduleNextRound(namespace) {
  clearNextRoundTimer();

  const settings = await getGameSettings();

  if (!settings.isEnabled || settings.maintenanceMode) {
    return;
  }

  /*
   * নতুন round শুধু তখনই
   * বানাব যখন অন্তত একজন
   * player Aviator page-এ আছে।
   */
  if (!hasActiveUsers(namespace)) {
    console.log("AVIATOR WAITING FOR PLAYERS");

    return;
  }

  const delay = Math.max(1, Number(settings.roundGapSeconds) || 3) * 1000;

  nextRoundTimer = setTimeout(() => {
    void startOrResumeRound(namespace);
  }, delay);

  nextRoundTimer.unref?.();
}

/* ==========================
   Complete Crash
========================== */

async function completeCrash(namespace, roundId) {
  clearFlightTimer();

  try {
    const crashedRound = await crashRound(roundId);

    const publicRound = mapRoundRow(crashedRound, {
      revealResult: true,
    });

    namespace.to(PUBLIC_ROOM).emit("aviator:crashed", {
      success: true,

      serverTime: new Date().toISOString(),

      data: {
        round: publicRound,

        crashMultiplier: Number(crashedRound.crash_multiplier),
      },
    });

    console.log(
      `AVIATOR CRASHED: round=${Number(roundId)} multiplier=${Number(
        crashedRound.crash_multiplier,
      ).toFixed(2)}x`,
    );

    await emitPublicState(namespace);

    await scheduleNextRound(namespace);
  } catch (error) {
    console.error("AVIATOR CRASH ERROR:", error);

    /*
     * Temporary retry.
     */
    nextRoundTimer = setTimeout(() => {
      void startOrResumeRound(namespace);
    }, 1000);

    nextRoundTimer.unref?.();
  }
}

/* ==========================
   Start Multiplier Loop
========================== */

function beginMultiplierLoop(namespace, rawRound) {
  clearFlightTimer();

  const roundId = Number(rawRound.id);

  const crashPoint = Number(rawRound.crash_multiplier);

  const flightStartedAtMs = Number(rawRound.flight_started_at_ms);

  if (!Number.isFinite(crashPoint) || crashPoint < 1.01) {
    console.error("AVIATOR INVALID CRASH POINT");

    return;
  }

  if (!Number.isFinite(flightStartedAtMs) || flightStartedAtMs <= 0) {
    console.error("AVIATOR INVALID FLIGHT START TIME");

    return;
  }

  /*
   * Immediate first value.
   */
  namespace.to(PUBLIC_ROOM).emit("aviator:multiplier", {
    success: true,

    data: {
      roundId,

      multiplier: calculateMultiplier(flightStartedAtMs),
    },
  });

  flightTimer = setInterval(() => {
    const multiplier = calculateMultiplier(flightStartedAtMs);

    /*
     * Crash point cross করলে
     * exact locked multiplier-এই
     * round crash হবে।
     */
    if (multiplier >= crashPoint) {
      clearFlightTimer();

      void completeCrash(namespace, roundId);

      return;
    }

    namespace.to(PUBLIC_ROOM).emit("aviator:multiplier", {
      success: true,

      serverTime: new Date().toISOString(),

      data: {
        roundId,

        multiplier,
      },
    });
  }, TICK_MS);

  flightTimer.unref?.();
}

/* ==========================
   Begin Flight
========================== */

async function beginFlight(namespace, roundId) {
  clearBettingTimer();

  try {
    /*
     * Database transaction
     * status betting → flying করবে।
     */
    const flyingRound = await startFlight(roundId);

    const publicRound = mapRoundRow(flyingRound, {
      revealResult: false,
    });

    namespace.to(PUBLIC_ROOM).emit("aviator:flight-started", {
      success: true,

      serverTime: new Date().toISOString(),

      data: {
        round: publicRound,

        multiplier: 1.0,
      },
    });

    console.log(`AVIATOR FLIGHT STARTED: round=${Number(roundId)}`);

    /*
     * IMPORTANT:
     * crash_multiplier client-কে
     * পাঠানো হচ্ছে না।
     *
     * শুধু server-side loop
     * এটা জানে।
     */
    beginMultiplierLoop(namespace, flyingRound);
  } catch (error) {
    console.error("AVIATOR FLIGHT START ERROR:", error);

    void startOrResumeRound(namespace);
  }
}

/* ==========================
   Schedule Betting End
========================== */

function scheduleFlight(namespace, rawRound) {
  clearBettingTimer();

  const roundId = Number(rawRound.id);

  const bettingEndsAtMs = Number(rawRound.betting_ends_at_ms);

  const delay = Math.max(0, bettingEndsAtMs - Date.now());

  bettingTimer = setTimeout(() => {
    void beginFlight(namespace, roundId);
  }, delay);

  bettingTimer.unref?.();
}

/* ==========================
   Start / Resume Round
========================== */

async function startOrResumeRound(namespace) {
  if (loopBusy) {
    return;
  }

  loopBusy = true;

  try {
    clearNextRoundTimer();

    const settings = await getGameSettings();

    /*
     * Admin game OFF করলে
     * নতুন round হবে না।
     */
    if (!settings.isEnabled) {
      clearBettingTimer();

      namespace.to(PUBLIC_ROOM).emit("aviator:disabled", {
        success: true,

        message: "Aviator is currently disabled.",
      });

      return;
    }

    /*
     * Maintenance ON হলে
     * নতুন round হবে না।
     *
     * Existing flying round
     * থাকলে নিচে resume হবে।
     */
    let activeRound = await getActiveRound();

    if (!activeRound && settings.maintenanceMode) {
      namespace.to(PUBLIC_ROOM).emit("aviator:maintenance", {
        success: true,

        message: "Aviator is under maintenance.",
      });

      return;
    }

    /*
     * কোনো active round নেই।
     */
    if (!activeRound) {
      if (!hasActiveUsers(namespace)) {
        console.log("AVIATOR WAITING FOR PLAYERS");

        return;
      }

      activeRound = await createRound();

      const publicRound = mapRoundRow(activeRound, {
        revealResult: false,
      });

      namespace.to(PUBLIC_ROOM).emit("aviator:round-started", {
        success: true,

        serverTime: new Date().toISOString(),

        data: {
          round: publicRound,
        },
      });

      console.log(`AVIATOR ROUND STARTED: ${activeRound.round_code}`);
    }

    const status = String(activeRound.status);

    /*
     * Betting round resume
     */
    if (status === ROUND_STATUS.BETTING) {
      const publicRound = mapRoundRow(activeRound, {
        revealResult: false,
      });

      namespace.to(PUBLIC_ROOM).emit("aviator:round-started", {
        success: true,

        serverTime: new Date().toISOString(),

        data: {
          round: publicRound,
        },
      });

      const bettingEnd = Number(activeRound.betting_ends_at_ms);

      /*
       * Server restart হয়ে যদি
       * betting time already শেষ হয়,
       * সঙ্গে সঙ্গে flight start।
       */
      if (Number.isFinite(bettingEnd) && bettingEnd <= Date.now()) {
        await beginFlight(namespace, Number(activeRound.id));

        return;
      }

      scheduleFlight(namespace, activeRound);

      await emitPublicState(namespace);

      return;
    }

    /*
     * Server restart হওয়ার সময়
     * round যদি already flying থাকে,
     * multiplier সময় অনুযায়ী resume।
     */
    if (status === ROUND_STATUS.FLYING) {
      const publicRound = mapRoundRow(activeRound, {
        revealResult: false,
      });

      const currentMultiplier = calculateMultiplier(
        activeRound.flight_started_at_ms,
      );

      const crashPoint = Number(activeRound.crash_multiplier);

      /*
       * Restart-এর মধ্যে crash time
       * পার হয়ে গেলে সরাসরি crash।
       */
      if (currentMultiplier >= crashPoint) {
        await completeCrash(namespace, Number(activeRound.id));

        return;
      }

      namespace.to(PUBLIC_ROOM).emit("aviator:flight-started", {
        success: true,

        resumed: true,

        serverTime: new Date().toISOString(),

        data: {
          round: publicRound,

          multiplier: currentMultiplier,
        },
      });

      beginMultiplierLoop(namespace, activeRound);
    }
  } catch (error) {
    console.error("AVIATOR LOOP ERROR:", error);
  } finally {
    loopBusy = false;
  }
}

/* ==========================
   Initialize Socket
========================== */

function initializeAviatorSocket(io) {
  const namespace = io.of("/aviator");

  namespace.use(authenticateSocket);

  namespace.on("connection", async (socket) => {
    socket.join(PUBLIC_ROOM);

    console.log(`AVIATOR PLAYER CONNECTED: ${socket.id}`);

    socket.emit("aviator:connected", {
      success: true,

      message: "Aviator connected.",

      serverTime: new Date().toISOString(),
    });

    try {
      const state = await getPublicGameState();

      socket.emit("aviator:state", {
        success: true,

        data: state,
      });
    } catch (error) {
      socket.emit("aviator:error", {
        success: false,

        message: error.message,

        code: error.code || "AVIATOR_STATE_ERROR",
      });
    }

    /*
     * প্রথম player connect করলেই
     * game loop শুরু/resume হবে।
     */
    void startOrResumeRound(namespace);

    socket.on("disconnect", () => {
      console.log(`AVIATOR PLAYER DISCONNECTED: ${socket.id}`);

      /*
       * চলমান round stop করছি না।
       *
       * কারণ future-এ real bet থাকলে
       * user disconnect করলেও
       * round অবশ্যই finish করতে হবে।
       */
    });
  });

  console.log("✅ Aviator Socket.IO initialized");

  return namespace;
}

/* ==========================
   Exports
========================== */

module.exports = {
  initializeAviatorSocket,
  calculateMultiplier,
};
