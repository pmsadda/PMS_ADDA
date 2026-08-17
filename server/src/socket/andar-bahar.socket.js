"use strict";

const jwt =
  require("jsonwebtoken");

const {
  pool,
} = require(
  "../config/database",
);

const {
  createRound,
  getActiveRound,
  getGameSettings,
  getPublicGameState,
} = require(
  "../services/andar-bahar.service",
);

const {
  placeBet,
  getUserRoundBet,
  getUserRoundBets,
  getRoundBetTotals,
} = require(
  "../services/andar-bahar-wallet.service",
);

const {
  settleRound,
} = require(
  "../services/andar-bahar-settlement.service",
);

/* =========================================================
   RUNTIME STATE
========================================================= */

let roundTimer = null;
let nextRoundTimer = null;
let loopBusy = false;

const CARD_DEAL_INTERVAL_MS =
  750;

const CARD_RESULT_BUFFER_MS =
  700;

const PUBLIC_ROOM =
  "andar-bahar:public";

function getUserRoom(
  userId,
) {
  return `andar-bahar:user:${Number(
    userId,
  )}`;
}

/* =========================================================
   AUTHENTICATION
========================================================= */

async function authenticateSocket(
  socket,
  next,
) {
  try {
    const authorizationHeader =
      socket.handshake.headers
        ?.authorization;

    const headerToken =
      typeof authorizationHeader ===
        "string" &&
      authorizationHeader
        .startsWith("Bearer ")
        ? authorizationHeader
            .slice(7)
        : null;

    const token =
      socket.handshake.auth
        ?.token ||
      headerToken;

    if (!token) {
      const error =
        new Error(
          "Authentication token is required.",
        );

      error.data = {
        statusCode: 401,
        code:
          "SOCKET_TOKEN_REQUIRED",
      };

      return next(error);
    }

    const decoded =
      jwt.verify(
        token,
        process.env.JWT_SECRET,
        {
          algorithms: [
            "HS256",
          ],
        },
      );

    const userId =
      Number.parseInt(
        decoded.id,
        10,
      );

    if (
      !Number.isInteger(userId) ||
      userId < 1
    ) {
      const error =
        new Error(
          "Invalid authenticated user.",
        );

      error.data = {
        statusCode: 401,
        code:
          "SOCKET_USER_INVALID",
      };

      return next(error);
    }

    const [userRows] =
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
        [userId],
      );

    const user =
      userRows[0] || null;

    if (!user) {
      const error =
        new Error(
          "User account was not found.",
        );

      error.data = {
        statusCode: 401,
        code:
          "SOCKET_USER_NOT_FOUND",
      };

      return next(error);
    }

    if (
      String(
        user.account_status ||
          "",
      ).toLowerCase() !==
      "active"
    ) {
      const error =
        new Error(
          "This account is not active.",
        );

      error.data = {
        statusCode: 403,
        code:
          "SOCKET_ACCOUNT_INACTIVE",
      };

      return next(error);
    }

    socket.user = {
      id: Number(user.id),

      uid:
        user.uid || null,

      role:
        String(
          user.role || "user",
        ).toLowerCase(),
    };

    return next();
  } catch (error) {
    console.error(
      "ANDAR BAHAR SOCKET AUTH ERROR:",
      error.message,
    );

    const isTokenError = [
      "JsonWebTokenError",
      "TokenExpiredError",
      "NotBeforeError",
    ].includes(error.name);

    const socketError =
      new Error(
        isTokenError
          ? "Invalid or expired authentication token."
          : "Socket authentication is temporarily unavailable.",
      );

    socketError.data = {
      statusCode:
        isTokenError
          ? 401
          : 500,

      code:
        isTokenError
          ? "SOCKET_AUTH_FAILED"
          : "SOCKET_AUTH_DATABASE_ERROR",
    };

    return next(socketError);
  }
}

/* =========================================================
   TIMER HELPERS
========================================================= */

function clearRoundTimer() {
  if (roundTimer) {
    clearTimeout(
      roundTimer,
    );

    roundTimer = null;
  }
}

function clearNextRoundTimer() {
  if (nextRoundTimer) {
    clearTimeout(
      nextRoundTimer,
    );

    nextRoundTimer = null;
  }
}

function getDelayMilliseconds(
  dateValue,
) {
  const targetTime =
    new Date(
      dateValue,
    ).getTime();

  if (
    !Number.isFinite(targetTime)
  ) {
    return 0;
  }

  return Math.max(
    0,
    targetTime - Date.now(),
  );
}

/* =========================================================
   STATE EMISSION
========================================================= */

async function emitGameState(
  namespace,
) {
  const state =
    await getPublicGameState();

  let betTotals = null;

  if (
    state.activeRound?.id
  ) {
    betTotals =
      await getRoundBetTotals(
        state.activeRound.id,
      );
  }

  namespace
    .to(PUBLIC_ROOM)
    .emit(
      "andar-bahar:state",
      {
        success: true,

        data: {
          ...state,
          betTotals,
        },
      },
    );

  return state;
}

async function emitPrivateState(
  socket,
) {
  const state =
    await getPublicGameState();

  let userBet = null;

  let userBetState = {
    bets: [],
    summary: {
      totalBets: 0,
      totalBetAmount: 0,
      andarBetAmount: 0,
      baharBetAmount: 0,
    },
  };

  let betTotals = null;

  if (
    state.activeRound?.id
  ) {
    [
      userBetState,
      betTotals,
    ] = await Promise.all([
      getUserRoundBets(
        socket.user.id,
        state.activeRound.id,
      ),

      getRoundBetTotals(
        state.activeRound.id,
      ),
    ]);

    userBet =
      userBetState.bets[
        userBetState.bets.length -
          1
      ] ||
      null;
  }

  socket.emit(
    "andar-bahar:state",
    {
      success: true,

      data: {
        ...state,

        /*
         * পুরোনো client compatibility-এর জন্য
         * সর্বশেষ bet userBet-এ রাখা হচ্ছে।
         */
        userBet,

        userBets:
          userBetState.bets,

        userBetSummary:
          userBetState.summary,

        betTotals,
      },
    },
  );
}

/* =========================================================
   ROUND LOOP
========================================================= */

async function scheduleRoundSettlement(
  namespace,
  round,
) {
  clearRoundTimer();

  const delay =
    getDelayMilliseconds(
      round.bettingClosesAt,
    );

  roundTimer =
    setTimeout(
      () => {
        settleCurrentRound(
          namespace,
          round.id,
        ).catch(
          (error) => {
            console.error(
              "ANDAR BAHAR SETTLEMENT TIMER ERROR:",
              error,
            );
          },
        );
      },
      delay + 150,
    );

  roundTimer.unref?.();
}

async function startOrResumeRound(
  namespace,
) {
  if (loopBusy) {
    return;
  }

  loopBusy = true;

  try {
    let activeRound =
      await getActiveRound();

    if (!activeRound) {
      const result =
        await createRound();

      activeRound =
        result.round;

      namespace
        .to(PUBLIC_ROOM)
        .emit(
          "andar-bahar:round-started",
          {
            success: true,
            round:
              activeRound,
            settings:
              result.settings,
          },
        );
    }

    const closesAt =
      new Date(
        activeRound
          .bettingClosesAt,
      ).getTime();

    if (
      Number.isFinite(
        closesAt,
      ) &&
      closesAt <= Date.now()
    ) {
      setImmediate(() => {
        settleCurrentRound(
          namespace,
          activeRound.id,
        ).catch(
          (error) => {
            console.error(
              "ANDAR BAHAR RECOVERY SETTLEMENT ERROR:",
              error,
            );
          },
        );
      });
    } else {
      await scheduleRoundSettlement(
        namespace,
        activeRound,
      );
    }

    await emitGameState(
      namespace,
    );
  } finally {
    loopBusy = false;
  }
}

async function settleCurrentRound(
  namespace,
  roundId,
) {
  if (loopBusy) {
    return;
  }

  loopBusy = true;

  clearRoundTimer();

  try {
    namespace
      .to(PUBLIC_ROOM)
      .emit(
        "andar-bahar:betting-closed",
        {
          success: true,
          roundId:
            Number(roundId),
          serverTime:
            new Date()
              .toISOString(),
        },
      );

    namespace
      .to(PUBLIC_ROOM)
      .emit(
        "andar-bahar:dealing",
        {
          success: true,
          roundId:
            Number(roundId),
        },
      );

    const result =
      await settleRound(
        roundId,
      );

    namespace
      .to(PUBLIC_ROOM)
      .emit(
        "andar-bahar:result",
        {
          success: true,
          data: result,
        },
      );

    /*
     * প্রত্যেক connected user-কে তার updated wallet ও
     * bet result আলাদাভাবে পাঠানো হবে।
     */
   const dealtCardCount =
  Array.isArray(
    result.cards,
  )
    ? result.cards.filter(
        (card) =>
          card.side !==
          "joker",
      ).length
    : 0;

const visualDealDuration =
  dealtCardCount *
    CARD_DEAL_INTERVAL_MS +
  CARD_RESULT_BUFFER_MS;

const privateResultTimer =
  setTimeout(
    async () => {
      try {
        const connectedSockets =
          await namespace
            .in(PUBLIC_ROOM)
            .fetchSockets();

        await Promise.all(
          connectedSockets.map(
            async (
              connectedSocket,
            ) => {
              try {
                const [userRows] =
                  await pool.query(
                    `
                      SELECT
                        wallet_balance

                      FROM users

                      WHERE id = ?

                      LIMIT 1
                    `,
                    [
                      connectedSocket
                        .user.id,
                    ],
                  );

               const userBetState =
  await getUserRoundBets(
    connectedSocket
      .user.id,
    roundId,
  );

const userBet =
  userBetState.bets[
    userBetState.bets.length -
      1
  ] ||
  null;

const resultSummary =
  userBetState.bets.reduce(
    (
      summary,
      bet
    ) => {
      if (
        bet.betStatus ===
        "won"
      ) {
        summary.winningBets +=
          1;

        summary.grossPayout +=
          Number(
            bet.grossPayout ||
              0
          );

        summary.serviceCharge +=
          Number(
            bet.serviceCharge ||
              0
          );

        summary.netPayout +=
          Number(
            bet.netPayout ||
              0
          );
      }

      if (
        bet.betStatus ===
        "lost"
      ) {
        summary.losingBets +=
          1;
      }

      return summary;
    },
    {
      winningBets: 0,
      losingBets: 0,
      grossPayout: 0,
      serviceCharge: 0,
      netPayout: 0,
    },
  );

connectedSocket.emit(
  "andar-bahar:user-result",
  {
    success: true,

    data: {
      /*
       * পুরোনো client compatibility
       */
      userBet,

      userBets:
        userBetState.bets,

      userBetSummary:
        userBetState.summary,

      resultSummary,

      walletBalance:
        Number(
          userRows[0]
            ?.wallet_balance ||
          0,
        ),
    },
  },
);
              } catch (error) {
                console.error(
                  "ANDAR BAHAR PRIVATE RESULT ERROR:",
                  error.message,
                );
              }
            },
          ),
        );
      } catch (error) {
        console.error(
          "ANDAR BAHAR DELAYED WALLET ERROR:",
          error.message,
        );
      }
    },
    visualDealDuration,
  );

privateResultTimer.unref?.();

    const settings =
      await getGameSettings();

    const nextRoundDelay =
  visualDealDuration +
  (
    Number(
      settings
        .resultDisplaySeconds,
    ) +
    Number(
      settings
        .nextRoundDelaySeconds,
    )
  ) * 1000;

    clearNextRoundTimer();

    nextRoundTimer =
      setTimeout(
        () => {
          /*
           * কোনো player connected না থাকলে নতুন খালি round
           * অনবরত তৈরি করা হবে না।
           */
          if (
            namespace.sockets
              .size < 1
          ) {
            return;
          }

          startOrResumeRound(
            namespace,
          ).catch(
            (error) => {
              console.error(
                "ANDAR BAHAR NEXT ROUND ERROR:",
                error,
              );
            },
          );
        },
        Math.max(
          1000,
          nextRoundDelay,
        ),
      );

    nextRoundTimer.unref?.();
  } catch (error) {
    console.error(
      "ANDAR BAHAR ROUND SETTLEMENT ERROR:",
      error,
    );

    namespace
      .to(PUBLIC_ROOM)
      .emit(
        "andar-bahar:error",
        {
          success: false,

          code:
            error.code ||
            "ROUND_SETTLEMENT_FAILED",

          message:
            error.message ||
            "Andar Bahar round settlement failed.",
        },
      );

    throw error;
  } finally {
    loopBusy = false;
  }
}

/* =========================================================
   SOCKET INITIALIZATION
========================================================= */

function initializeAndarBaharSocket(
  io,
) {
  const namespace =
    io.of(
      "/andar-bahar",
    );

  namespace.use(
    authenticateSocket,
  );

  namespace.on(
    "connection",
    async (socket) => {
      socket.join(
        PUBLIC_ROOM,
      );

      socket.join(
        getUserRoom(
          socket.user.id,
        ),
      );

      socket.emit(
        "andar-bahar:connected",
        {
          success: true,

          userId:
            socket.user.id,

          serverTime:
            new Date()
              .toISOString(),
        },
      );

      try {
        await startOrResumeRound(
          namespace,
        );

        await emitPrivateState(
          socket,
        );
      } catch (error) {
        socket.emit(
          "andar-bahar:error",
          {
            success: false,

            code:
              error.code ||
              "GAME_START_FAILED",

            message:
              error.message ||
              "Andar Bahar game could not be started.",
          },
        );
      }

      let lastBetRequestAt = 0;

      socket.on(
        "andar-bahar:place-bet",
        async (
          payload = {},
          acknowledgement,
        ) => {
          const respond =
            typeof acknowledgement ===
            "function"
              ? acknowledgement
              : () => {};

          try {
            const now =
              Date.now();

            if (
              now -
                lastBetRequestAt <
              500
            ) {
              const error =
                new Error(
                  "Please wait before submitting another bet.",
                );

              error.statusCode =
                429;

              error.code =
                "BET_REQUEST_TOO_FAST";

              throw error;
            }

            lastBetRequestAt =
              now;

            const result =
              await placeBet({
                userId:
                  socket.user.id,

                roundId:
                  payload.roundId,

                selectedSide:
                  payload.selectedSide,

                betAmount:
                  payload.betAmount,
              });

            const totals =
              await getRoundBetTotals(
                payload.roundId,
              );

            namespace
              .to(PUBLIC_ROOM)
              .emit(
                "andar-bahar:bet-totals",
                {
                  success: true,
                  roundId:
                    Number(
                      payload.roundId,
                    ),
                  totals,
                },
              );

            respond({
              success: true,

              message:
                "Bet placed successfully.",

              data: result,
            });
          } catch (error) {
            respond({
              success: false,

              statusCode:
                error.statusCode ||
                500,

              code:
                error.code ||
                "BET_FAILED",

              message:
                error.message ||
                "Andar Bahar bet failed.",
            });
          }
        },
      );

      socket.on(
        "andar-bahar:request-state",
        async (
          acknowledgement,
        ) => {
          const respond =
            typeof acknowledgement ===
            "function"
              ? acknowledgement
              : () => {};

          try {
            await emitPrivateState(
              socket,
            );

            respond({
              success: true,
            });
          } catch (error) {
            respond({
              success: false,

              code:
                error.code ||
                "STATE_FAILED",

              message:
                error.message ||
                "Game state could not be loaded.",
            });
          }
        },
      );
    },
  );

  console.log(
    "✅ Andar Bahar Socket.IO initialized",
  );

  return namespace;
}

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  initializeAndarBaharSocket,
};