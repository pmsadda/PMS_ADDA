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
  calculateAviatorMultiplier,
} = require("../services/aviator.service");

const {
  placeBet,
  cashOutBet,
  processAutoCashouts,
  cancelRoundAndRefund,
  getPlayerAviatorState,
} = require("../services/aviator-wallet.service");

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

/*
 * প্রতি 100ms-এ server
 * multiplier broadcast করবে।
 */
const TICK_MS = 100;

const FINALIZE_RETRY_LIMIT = 8;
const FINALIZE_RETRY_DELAY_MS = 500;
const EARLY_CRASH_RETRY_MS = 200;



/* ==========================
   Runtime Timers
========================== */

let bettingTimer = null;

let flightTimer = null;

let nextRoundTimer = null;

let loopBusy = false;

let loopRerunRequested = false;

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
  return calculateAviatorMultiplier(flightStartedAtMs, nowMs);
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

async function completeCrash(
  namespace,
  roundId,
) {
  clearFlightTimer();

  try {
    const crashedRound =
      await crashRound(roundId);

    const publicRound =
      mapRoundRow(crashedRound, {
        revealResult: true,
      });

    namespace
      .to(PUBLIC_ROOM)
      .emit(
        "aviator:crashed",
        {
          success: true,

          serverTime:
            new Date()
              .toISOString(),

          data: {
            round:
              publicRound,

            crashMultiplier:
              Number(
                crashedRound
                  .crash_multiplier,
              ),
          },
        },
      );

    console.log(
      `AVIATOR CRASHED: round=${Number(
        roundId,
      )} multiplier=${Number(
        crashedRound
          .crash_multiplier,
      ).toFixed(2)}x`,
    );

    await emitPublicState(
      namespace,
    );

    await scheduleNextRound(
      namespace,
    );

    return crashedRound;
  } catch (error) {
    console.error(
      "AVIATOR CRASH ERROR:",
      error,
    );

    /*
     * Error swallow করা যাবে না।
     * Finalizer সিদ্ধান্ত নেবে
     * retry নাকি refund করবে।
     */
    throw error;
  }
}

async function finalizeCrashWithAutoCashouts(
  namespace,
  roundId,
  retryCount = 0,
) {
  /*
   * একই round-এর finalization
   * retry schedule করার helper।
   */
  const scheduleRetry = (
    nextRetryCount,
    delayMs,
  ) => {
    clearFlightTimer();

    flightTimer =
      setTimeout(
        () => {
          void finalizeCrashWithAutoCashouts(
            namespace,
            roundId,
            nextRetryCount,
          );
        },
        delayMs,
      );

    flightTimer.unref?.();
  };

  /*
   * অনেকবার settlement fail হলে
   * user-এর remaining placed bets
   * loss না করে refund করবে।
   */
  const emergencyCancelAndRefund =
    async (reason) => {
      clearFlightTimer();

      console.error(
        `AVIATOR EMERGENCY CANCEL: round=${Number(
          roundId,
        )} reason=${reason}`,
      );

      try {
        const refundResult =
          await cancelRoundAndRefund({
            roundId:
              Number(roundId),

            adminId:
              null,
          });

        namespace
          .to(PUBLIC_ROOM)
          .emit(
            "aviator:round-cancelled",
            {
              success: true,

              serverTime:
                new Date()
                  .toISOString(),

              message:
                "Round cancelled and unsettled bets refunded.",

              data:
                refundResult,
            },
          );

        await emitPublicState(
          namespace,
        );

        await scheduleNextRound(
          namespace,
        );
      } catch (refundError) {
        /*
         * Refund fail হলে crash/loss
         * করা যাবে না।
         *
         * Fail closed:
         * admin intervention পর্যন্ত
         * round untouched থাকবে।
         */
        console.error(
          "AVIATOR EMERGENCY REFUND ERROR:",
          refundError,
        );
      }
    };

  /*
   * Step 1:
   * Eligible auto cashouts settle.
   */
  try {
    await processAutoCashouts(
      roundId,
    );
  } catch (error) {
    console.error(
      "AVIATOR FINAL AUTO CASHOUT ERROR:",
      error,
    );

    if (
      retryCount <
      FINALIZE_RETRY_LIMIT
    ) {
      scheduleRetry(
        retryCount + 1,
        FINALIZE_RETRY_DELAY_MS,
      );

      return;
    }

    await emergencyCancelAndRefund(
      "AUTO_CASHOUT_RETRY_LIMIT",
    );

    return;
  }

  /*
   * Step 2:
   * Auto cashout successful হওয়ার
   * পর round crash করা যাবে।
   */
  try {
    await completeCrash(
      namespace,
      roundId,
    );
  } catch (error) {
    /*
     * App clock একটু ahead হলে
     * DB guard AVIATOR_CRASH_TOO_EARLY
     * দিতে পারে।
     *
     * এটা settlement failure নয়।
     * Retry count বাড়াব না।
     */
    if (
      error?.code ===
      "AVIATOR_CRASH_TOO_EARLY"
    ) {
      scheduleRetry(
        retryCount,
        EARLY_CRASH_RETRY_MS,
      );

      return;
    }

    console.error(
      "AVIATOR FINAL CRASH ERROR:",
      error,
    );

    if (
      retryCount <
      FINALIZE_RETRY_LIMIT
    ) {
      scheduleRetry(
        retryCount + 1,
        FINALIZE_RETRY_DELAY_MS,
      );

      return;
    }

    await emergencyCancelAndRefund(
      "CRASH_RETRY_LIMIT",
    );
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

  let autoCashoutBusy = false;

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

      void finalizeCrashWithAutoCashouts(namespace, roundId);

      return;
    }

    if (!autoCashoutBusy) {
      autoCashoutBusy = true;

      void processAutoCashouts(roundId)
        .catch((error) => {
          console.error("AVIATOR AUTO CASHOUT ERROR:", error);
        })
        .finally(() => {
          autoCashoutBusy = false;
        });
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
    if (!hasActiveUsers(namespace)) {
  console.log(
    `AVIATOR ROUND CANCELLED: no active players, round=${Number(roundId)}`,
  );

  const refundResult =
    await cancelRoundAndRefund({
      roundId: Number(roundId),
      adminId: null,
    });

  namespace
    .to(PUBLIC_ROOM)
    .emit(
      "aviator:round-cancelled",
      {
        success: true,
        serverTime:
          new Date().toISOString(),
        message:
          "Round cancelled because no players are connected.",
        data: refundResult,
      },
    );

  await emitPublicState(namespace);

  return;
}
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
    /*
     * Loop এখন busy।
     * শেষ হলেই latest settings/state
     * দিয়ে আরেকবার run করবে।
     */
    loopRerunRequested = true;

    return;
  }

  loopBusy = true;

  try {
    clearNextRoundTimer();

    const settings = await getGameSettings();

    /*
     * আগে active round বের করতে হবে।
     * Game OFF করলেও flying round
     * safe settlement পর্যন্ত চলবে।
     */
    let activeRound = await getActiveRound();

    /*
     * Admin game OFF করলে:
     *
     * 1. Active BETTING round থাকলে
     *    cancel + refund.
     *
     * 2. Active FLYING round থাকলে
     *    নিচের normal flying recovery
     *    logic চালু থাকবে।
     *
     * 3. Active round না থাকলে
     *    নতুন round তৈরি হবে না।
     */
    if (!settings.isEnabled) {
      clearNextRoundTimer();

      if (activeRound && String(activeRound.status) === ROUND_STATUS.BETTING) {
        clearBettingTimer();

        const refundResult = await cancelRoundAndRefund({
          roundId: Number(activeRound.id),

          adminId: null,
        });

        namespace.to(PUBLIC_ROOM).emit("aviator:round-cancelled", {
          success: true,

          serverTime: new Date().toISOString(),

          data: refundResult,
        });

        activeRound = null;

        await emitPublicState(namespace);
      }

      /*
       * Flying round থাকলে return নয়।
       * নিচের FLYING branch সেটাকে
       * safely finish করবে।
       */
      if (!activeRound || String(activeRound.status) !== ROUND_STATUS.FLYING) {
        namespace.to(PUBLIC_ROOM).emit("aviator:disabled", {
          success: true,

          message: "Aviator is currently disabled.",
        });

        return;
      }
    }

    if (settings.maintenanceMode) {
      /*
       * Maintenance ON + betting round
       * = bet cancel + full refund.
       */
      if (activeRound && String(activeRound.status) === ROUND_STATUS.BETTING) {
        clearBettingTimer();

        const refundResult = await cancelRoundAndRefund({
          roundId: Number(activeRound.id),

          adminId: null,
        });

        namespace.to(PUBLIC_ROOM).emit("aviator:round-cancelled", {
          success: true,

          serverTime: new Date().toISOString(),

          data: refundResult,
        });

        activeRound = null;

        await emitPublicState(namespace);
      }

      /*
       * Flying round থাকলে এখান থেকে
       * return নয় — নিচের FLYING logic
       * safe settlement পর্যন্ত চালাবে।
       */
      if (!activeRound || String(activeRound.status) !== ROUND_STATUS.FLYING) {
        namespace.to(PUBLIC_ROOM).emit("aviator:maintenance", {
          success: true,

          message: "Aviator is under maintenance.",
        });

        return;
      }
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
       * Server restart হওয়ার সময়
       * যেসব auto cashout threshold
       * downtime-এর মধ্যে cross করেছে,
       * সেগুলো আগে process হবে।
       */
      try {
        await processAutoCashouts(Number(activeRound.id));
      } catch (error) {
        console.error("AVIATOR RECOVERY AUTO CASHOUT ERROR:", error);
      }

      /*
       * Restart-এর মধ্যে crash time
       * পার হয়ে গেলে সরাসরি crash।
       */
      if (currentMultiplier >= crashPoint) {
        await finalizeCrashWithAutoCashouts(namespace, Number(activeRound.id));

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

    /*
     * Busy থাকার সময় আরেকটি
     * refresh/start request এলে
     * এখন সেটি execute হবে।
     */
    if (loopRerunRequested) {
      loopRerunRequested = false;

      setTimeout(() => {
        void startOrResumeRound(namespace);
      }, 0);
    }
  }
}

/* ==========================
   Admin Cancel + Refund
========================== */

async function cancelAviatorRoundByAdmin(io, { roundId, adminId }) {
  const namespace = io.of("/aviator");

  clearBettingTimer();
  clearFlightTimer();
  clearNextRoundTimer();

  try {
    const result = await cancelRoundAndRefund({
      roundId,
      adminId,
    });

    namespace.to(PUBLIC_ROOM).emit("aviator:round-cancelled", {
      success: true,

      serverTime: new Date().toISOString(),

      data: result,
    });

    await emitPublicState(namespace);

    void startOrResumeRound(namespace);

    return result;
  } catch (error) {
    /*
     * Refund/cancel fail করলে
     * game loop আবার recover করবে।
     */
    void startOrResumeRound(namespace);

    throw error;
  }
}

/* ==========================
   Refresh After Admin Settings
========================== */

async function refreshAviatorAfterSettingsChange(io) {
  const namespace = io.of("/aviator");

  /*
   * পুরোনো next-round timer থাকলে
   * আগে clear করে current settings
   * অনুযায়ী state আবার evaluate করবে।
   */
  clearNextRoundTimer();

  await startOrResumeRound(namespace);

  return true;
}

async function emitPlayerState(socket) {
  try {
    const state = await getPlayerAviatorState({
      userId: socket.user.id,
    });

    socket.emit("aviator:player-state", {
      success: true,
      data: state,
    });

    return state;
  } catch (error) {
    socket.emit("aviator:error", {
      success: false,
      message:
        error.message ||
        "Player Aviator state could not be loaded.",
      code:
        error.code ||
        "AVIATOR_PLAYER_STATE_ERROR",
    });

    return null;
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

    await emitPlayerState(socket);

    let lastBetRequestAt = 0;

    socket.on("aviator:place-bet", async (payload = {}, acknowledgement) => {
      const respond =
        typeof acknowledgement === "function" ? acknowledgement : () => {};

      try {
        const now = Date.now();

        if (now - lastBetRequestAt < 300) {
          return respond({
            success: false,
            statusCode: 429,
            code: "AVIATOR_BET_TOO_FAST",
            message: "Bet request is too fast.",
          });
        }

        lastBetRequestAt = now;

        const result = await placeBet({
          userId: socket.user.id,

          roundId: payload.roundId,

          betSlot: payload.betSlot,

          betAmount: payload.betAmount,

          autoCashoutMultiplier: payload.autoCashoutMultiplier,
        });

        respond({
          success: true,
          data: result,
        });

await emitPlayerState(socket);

        await emitPublicState(namespace);
      } catch (error) {
        respond({
          success: false,

          statusCode: Number(error.statusCode || 500),

          code: error.code || "AVIATOR_BET_ERROR",

          message: error.message || "Aviator bet could not be placed.",
        });
      }
    });

    socket.on("aviator:cash-out", async (payload = {}, acknowledgement) => {
      const respond =
        typeof acknowledgement === "function" ? acknowledgement : () => {};

      try {
        const result = await cashOutBet({
          userId: socket.user.id,

          roundId: payload.roundId,

          betSlot: payload.betSlot,
        });

        respond({
          success: true,
          data: result,
        });
        await emitPlayerState(socket);

        await emitPublicState(namespace);
      } catch (error) {
        respond({
          success: false,

          statusCode: Number(error.statusCode || 500),

          code: error.code || "AVIATOR_CASHOUT_ERROR",

          message: error.message || "Aviator cash out failed.",
        });
      }
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

    socket.on(
  "aviator:get-player-state",
  async (_payload = {}, acknowledgement) => {
    const respond =
      typeof acknowledgement === "function"
        ? acknowledgement
        : () => {};

    try {
      const state = await getPlayerAviatorState({
        userId: socket.user.id,
      });

      respond({
        success: true,
        data: state,
      });

      socket.emit("aviator:player-state", {
        success: true,
        data: state,
      });
    } catch (error) {
      respond({
        success: false,
        statusCode: Number(
          error.statusCode || 500,
        ),
        code:
          error.code ||
          "AVIATOR_PLAYER_STATE_ERROR",
        message:
          error.message ||
          "Player state could not be loaded.",
      });
    }
  },
);

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
  cancelAviatorRoundByAdmin,
  refreshAviatorAfterSettingsChange,
};
