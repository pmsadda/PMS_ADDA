"use strict";

const jwt = require("jsonwebtoken");

const { pool } = require("../config/database");

const {
  ensureCurrentRound,
  getPublicGameState,
  beginKaitDealing,
  recordKaitDealCard,
  settleKaitRound,
} = require("../services/kait.service");

function wait(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, Number(milliseconds) || 0));
  });
}

function getSocketToken(socket) {
  const authToken = String(socket.handshake?.auth?.token || "").trim();

  if (authToken) {
    return authToken;
  }

  const authorization = String(
    socket.handshake?.headers?.authorization || "",
  ).trim();

  if (authorization.startsWith("Bearer ")) {
    return authorization.slice(7).trim();
  }

  return "";
}

async function authenticateSocket(socket, next) {
  try {
    const token = getSocketToken(socket);

    if (!token) {
      return next(new Error("AUTH_TOKEN_REQUIRED"));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ["HS256"],
    });

    const userId = Number(decoded.id);

    if (!Number.isInteger(userId) || userId < 1) {
      return next(new Error("AUTH_TOKEN_INVALID"));
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

    const user = rows[0];

    if (!user || user.account_status !== "active" || user.role === "agent") {
      return next(new Error("AUTH_USER_FORBIDDEN"));
    }

    socket.user = {
      id: Number(user.id),

      uid: user.uid,

      role: user.role,
    };

    socket.accessToken = token;

    return next();
  } catch (_error) {
    return next(new Error("AUTH_TOKEN_INVALID"));
  }
}

function initializeKaitSocket(io) {
  const namespace = io.of("/kait");

  namespace.use(authenticateSocket);

  let engineRunning = false;
  let engineStopped = false;

  async function emitPublicState() {
    const state = await getPublicGameState();

    namespace.emit("kait:state", state);

    return state;
  }

  async function runRound(round) {
    const roundId = Number(round.id);

    const roundStatus = String(round.roundStatus || "")
      .trim()
      .toLowerCase();

    /*
     * Restart-এর সময় settlement
     * pending থাকলে resume।
     */

    if (roundStatus === "settling") {
      const settlement = await settleKaitRound(roundId);

      namespace.emit("kait:round-completed", settlement);

      return settlement;
    }

    /*
     * BETTING
     */

    if (roundStatus === "betting") {
      namespace.emit("kait:betting-open", {
        round,
      });

      const bettingEndsAt = new Date(round.bettingEndsAt).getTime();

      await wait(bettingEndsAt - Date.now());
    }

    const dealPlan = await beginKaitDealing(roundId);

    /* ===========================================
     ZERO BET = ZERO CARD
  =========================================== */

    if (dealPlan.noBets === true) {
      const noBetResult = {
        roundId: dealPlan.roundId,

        roundCode: dealPlan.roundCode,

        noBets: true,

        totalBets: 0,

        winningBets: 0,

        losingBets: 0,

        totalGrossPayout: 0,

        totalServiceCharge: 0,

        totalNetPayout: 0,
      };

      namespace.emit("kait:no-bets", noBetResult);

      namespace.emit("kait:round-completed", noBetResult);

      return noBetResult;
    }

    /* ===========================================
     DEAL START
  =========================================== */

    namespace.emit("kait:dealing-started", {
      roundId: dealPlan.roundId,

      roundCode: dealPlan.roundCode,

      serverSeedHash: dealPlan.serverSeedHash,

      serverSeedReveal: dealPlan.serverSeedReveal,

      cardDealIntervalMs: dealPlan.cardDealIntervalMs,

      deckSize: 52,

      lastDealtPosition: dealPlan.lastDealtPosition,
    });

    /* ===========================================
     ONE CARD AT A TIME
  =========================================== */

    for (const card of dealPlan.cards) {
      /*
       * Server restart হলে
       * already distributed cards skip।
       */

      if (Number(card.deckPosition) <= Number(dealPlan.lastDealtPosition)) {
        continue;
      }

      await wait(dealPlan.cardDealIntervalMs);

      const progress = await recordKaitDealCard({
        roundId,
        card,
      });

      /*
       * একবারে শুধু ONE CARD emit।
       */

      namespace.emit("kait:card-dealt", progress);

      /*
       * A থেকে K সব rank resolve
       * হয়ে গেলে আর card দরকার নেই।
       */

      if (progress.allRanksResolved) {
        break;
      }
    }

    /* ===========================================
     SETTLEMENT
  =========================================== */

    const settlement = await settleKaitRound(roundId);

    namespace.emit("kait:round-completed", settlement);

    return settlement;
  }

  async function runEngine() {
    if (engineRunning) {
      return;
    }

    engineRunning = true;

    while (!engineStopped) {
      try {
        const { settings, round } = await ensureCurrentRound();

        /*
         * Game OFF এবং কোনো active round নেই।
         * তাই নতুন card/bet round শুরু হবে না।
         */
        if (!round) {
          await wait(5000);

          continue;
        }

        const roundResult = await runRound(round);

        const delaySeconds = roundResult?.noBets
          ? Number(settings.nextRoundDelaySeconds)
          : Number(settings.resultDisplaySeconds) +
            Number(settings.nextRoundDelaySeconds);

        await wait(delaySeconds * 1000);

        await emitPublicState();
      } catch (error) {
        console.error("KAIT ROUND ENGINE ERROR:", {
          message: error.message,

          code: error.code || null,
        });

        /*
         * Temporary database error অথবা
         * game disabled হলে controlled retry।
         */
        await wait(5000);
      }
    }

    engineRunning = false;
  }

  namespace.on("connection", async (socket) => {
    socket.join("kait-public");

    try {
      const state = await getPublicGameState();

      socket.emit("kait:state", state);
    } catch (error) {
      socket.emit("kait:error", {
        code: error.code || "KAIT_STATE_ERROR",

        message: error.message || "Kait state could not be loaded.",
      });
    }

    socket.on("kait:refresh", async (_payload, callback) => {
      try {
        const state = await getPublicGameState();

        if (typeof callback === "function") {
          callback({
            success: true,
            data: state,
          });
        }
      } catch (error) {
        if (typeof callback === "function") {
          callback({
            success: false,

            code: error.code || "KAIT_REFRESH_FAILED",

            message: error.message,
          });
        }
      }
    });
  });

  void runEngine();

  console.log("✅ Kait Socket.IO initialized");

  return {
    namespace,

    stop() {
      engineStopped = true;
    },
  };
}

module.exports = {
  initializeKaitSocket,
};
