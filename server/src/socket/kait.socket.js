"use strict";

const jwt =
  require("jsonwebtoken");

const {
  pool
} = require(
  "../config/database"
);

const {
  ensureCurrentRound,
  getPublicGameState,
  beginKaitDealing,
  recordKaitDealPair,
  settleKaitRound
} = require(
  "../services/kait.service"
);

function wait(milliseconds) {
  return new Promise(
    (resolve) => {
      setTimeout(
        resolve,
        Math.max(
          0,
          Number(milliseconds) || 0
        )
      );
    }
  );
}

function getSocketToken(socket) {
  const authToken =
    String(
      socket.handshake
        ?.auth?.token ||
      ""
    ).trim();

  if (authToken) {
    return authToken;
  }

  const authorization =
    String(
      socket.handshake
        ?.headers
        ?.authorization ||
      ""
    ).trim();

  if (
    authorization.startsWith(
      "Bearer "
    )
  ) {
    return authorization
      .slice(7)
      .trim();
  }

  return "";
}

async function authenticateSocket(
  socket,
  next
) {
  try {
    const token =
      getSocketToken(socket);

    if (!token) {
      return next(
        new Error(
          "AUTH_TOKEN_REQUIRED"
        )
      );
    }

    const decoded =
      jwt.verify(
        token,
        process.env.JWT_SECRET,
        {
          algorithms: [
            "HS256"
          ]
        }
      );

    const userId =
      Number(decoded.id);

    if (
      !Number.isInteger(userId) ||
      userId < 1
    ) {
      return next(
        new Error(
          "AUTH_TOKEN_INVALID"
        )
      );
    }

    const [rows] =
      await pool.query(
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
        [
          userId
        ]
      );

    const user =
      rows[0];

    if (
      !user ||
      user.account_status !==
        "active" ||
      user.role === "agent"
    ) {
      return next(
        new Error(
          "AUTH_USER_FORBIDDEN"
        )
      );
    }

    socket.user = {
      id:
        Number(user.id),

      uid:
        user.uid,

      role:
        user.role
    };

    socket.accessToken =
      token;

    return next();
  } catch (_error) {
    return next(
      new Error(
        "AUTH_TOKEN_INVALID"
      )
    );
  }
}

function initializeKaitSocket(io) {
  const namespace =
    io.of("/kait");

  namespace.use(
    authenticateSocket
  );

  let engineRunning = false;
  let engineStopped = false;

  async function emitPublicState() {
    const state =
      await getPublicGameState();

    namespace.emit(
      "kait:state",
      state
    );

    return state;
  }

  async function runRound(
    round
  ) {
    const roundId =
      Number(round.id);

    if (
      round.roundStatus ===
      "betting"
    ) {
      namespace.emit(
        "kait:betting-open",
        {
          round
        }
      );

      const bettingEndsAt =
        new Date(
          round.bettingEndsAt
        ).getTime();

      await wait(
        bettingEndsAt -
        Date.now()
      );
    }

    const dealPlan =
      await beginKaitDealing(
        roundId
      );

    namespace.emit(
      "kait:dealing-started",
      {
        roundId:
          dealPlan.roundId,

        roundCode:
          dealPlan.roundCode,

        serverSeedHash:
          dealPlan.serverSeedHash,

        serverSeedReveal:
          dealPlan.serverSeedReveal,

        cardDealIntervalMs:
          dealPlan
            .cardDealIntervalMs
      }
    );

    for (
      const pair of
      dealPlan.pairs
    ) {
      /*
       * Render restart হলে already dealt
       * pair skip করে পরের pair থেকে চলবে।
       */
      if (
        Number(
          pair.back.deckPosition
        ) <=
        Number(
          dealPlan
            .lastDealtPosition
        )
      ) {
        continue;
      }

      await wait(
        dealPlan
          .cardDealIntervalMs
      );

      const progress =
        await recordKaitDealPair({
          roundId,
          pair
        });

      namespace.emit(
        "kait:pair-dealt",
        progress
      );

      if (
        progress
          .allRanksResolved
      ) {
        break;
      }
    }

    const settlement =
      await settleKaitRound(
        roundId
      );

    namespace.emit(
      "kait:round-completed",
      settlement
    );

    return settlement;
  }

  async function runEngine() {
    if (engineRunning) {
      return;
    }

    engineRunning = true;

    while (!engineStopped) {
      try {
        const {
          settings,
          round
        } =
          await ensureCurrentRound();

        await runRound(round);

        await wait(
          (
            Number(
              settings
                .resultDisplaySeconds
            ) +
            Number(
              settings
                .nextRoundDelaySeconds
            )
          ) * 1000
        );

        await emitPublicState();
      } catch (error) {
        console.error(
          "KAIT ROUND ENGINE ERROR:",
          {
            message:
              error.message,

            code:
              error.code ||
              null
          }
        );

        /*
         * Temporary database error অথবা
         * game disabled হলে controlled retry।
         */
        await wait(5000);
      }
    }

    engineRunning = false;
  }

  namespace.on(
    "connection",
    async (socket) => {
      socket.join(
        "kait-public"
      );

      try {
        const state =
          await getPublicGameState();

        socket.emit(
          "kait:state",
          state
        );
      } catch (error) {
        socket.emit(
          "kait:error",
          {
            code:
              error.code ||
              "KAIT_STATE_ERROR",

            message:
              error.message ||
              "Kait state could not be loaded."
          }
        );
      }

      socket.on(
        "kait:refresh",
        async (_payload, callback) => {
          try {
            const state =
              await getPublicGameState();

            if (
              typeof callback ===
              "function"
            ) {
              callback({
                success: true,
                data: state
              });
            }
          } catch (error) {
            if (
              typeof callback ===
              "function"
            ) {
              callback({
                success: false,

                code:
                  error.code ||
                  "KAIT_REFRESH_FAILED",

                message:
                  error.message
              });
            }
          }
        }
      );
    }
  );

  void runEngine();

  console.log(
    "✅ Kait Socket.IO initialized"
  );

  return {
    namespace,

    stop() {
      engineStopped = true;
    }
  };
}

module.exports = {
  initializeKaitSocket
};