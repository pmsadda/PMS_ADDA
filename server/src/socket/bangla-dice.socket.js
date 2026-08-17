"use strict";

const jwt =
  require("jsonwebtoken");

const {
  pool,
} = require("../config/database");

const {
  ROUND_STATUS,
  createGameError,
  createRound,
  startRoll,
  getActiveRound,
  getGameSettings,
  getPublicGameState,
  mapRoundRow,
} = require(
  "../services/bangla-dice.service",
);

const {
  placeBet,
  getUserRoundBets,
  getRoundBetTotals,
} = require(
  "../services/bangla-dice-wallet.service",
);

const {
  settleRound,
} = require(
  "../services/bangla-dice-settlement.service",
);

const {
  refundRound,
} = require(
  "../services/bangla-dice-refund.service",
);

const PUBLIC_ROOM =
  "bangla-dice:public";

let roundTimer = null;
let settlementTimer = null;
let nextRoundTimer = null;

let loopBusy = false;

function getUserRoom(
  userId,
) {
  return `bangla-dice:user:${Number(
    userId,
  )}`;
}

function clearTimer(timer) {
  if (timer) {
    clearTimeout(timer);
  }

  return null;
}

function clearAllTimers() {
  roundTimer =
    clearTimer(
      roundTimer,
    );

  settlementTimer =
    clearTimer(
      settlementTimer,
    );

  nextRoundTimer =
    clearTimer(
      nextRoundTimer,
    );
}

function getDelay(
  dateValue,
) {
  const target =
    new Date(
      dateValue,
    ).getTime();

  if (
    !Number.isFinite(target)
  ) {
    return 0;
  }

  return Math.max(
    0,
    target - Date.now(),
  );
}

async function authenticateSocket(
  socket,
  next,
) {
  try {
    const headerToken =
      socket.handshake.headers
        ?.authorization
        ?.replace(
          /^Bearer\s+/i,
          "",
        );

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
      Number(decoded.id);

    if (
      !Number.isInteger(
        userId,
      ) ||
      userId <= 0
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
      uid: user.uid || null,

      role:
        String(
          user.role ||
          "user",
        ).toLowerCase(),
    };

    return next();
  } catch (error) {
    console.error(
      "BANGLA DICE SOCKET AUTH ERROR:",
      error.message,
    );

    const isTokenError =
      [
        "JsonWebTokenError",
        "TokenExpiredError",
        "NotBeforeError",
      ].includes(
        error.name,
      );

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

    return next(
      socketError,
    );
  }
}

async function getWalletBalance(
  userId,
) {
  const [rows] =
    await pool.query(
      `
        SELECT
          wallet_balance

        FROM users

        WHERE id = ?

        LIMIT 1
      `,
      [Number(userId)],
    );

  return Number(
    rows[0]
      ?.wallet_balance ||
    0,
  );
}

async function emitPrivateState(
  socket,
) {
  const state =
    await getPublicGameState();

  let userBetState = {
    bets: [],

    summary: {
      totalBets: 0,
      totalBetAmount: 0,
      symbolBetAmounts: {},
    },
  };

  let betTotals = {
    totalBets: 0,
    totalBetAmount: 0,
    symbols: [],
  };

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
  }

  const walletBalance =
    await getWalletBalance(
      socket.user.id,
    );

  socket.emit(
    "bangla-dice:state",
    {
      success: true,

      data: {
        ...state,

        userBets:
          userBetState.bets,

        userBetSummary:
          userBetState.summary,

        betTotals,

        walletBalance,
      },
    },
  );
}

async function emitPublicState(
  namespace,
) {
  const state =
    await getPublicGameState();

  namespace
    .to(PUBLIC_ROOM)
    .emit(
      "bangla-dice:state",
      {
        success: true,
        data: state,
      },
    );
}

function buildResultSummary(
  bets,
) {
  return bets.reduce(
    (
      result,
      bet,
    ) => {
      if (
        bet.betStatus ===
        "won"
      ) {
        result.winningBets +=
          1;

        result.grossPayout +=
          Number(
            bet.grossPayout ||
            0,
          );

        result.serviceCharge +=
          Number(
            bet.serviceCharge ||
            0,
          );

        result.netPayout +=
          Number(
            bet.netPayout ||
            0,
          );
      }

      if (
        bet.betStatus ===
        "lost"
      ) {
        result.losingBets +=
          1;
      }

      if (
        bet.betStatus ===
        "refunded"
      ) {
        result.refundedBets +=
          1;

        result.refundedAmount +=
          Number(
            bet.betAmount ||
            0,
          );
      }

      return result;
    },
    {
      winningBets: 0,
      losingBets: 0,
      refundedBets: 0,

      grossPayout: 0,
      serviceCharge: 0,
      netPayout: 0,
      refundedAmount: 0,
    },
  );
}

async function emitUserResults(
  namespace,
  roundId,
) {
  const sockets =
    await namespace
      .in(PUBLIC_ROOM)
      .fetchSockets();

  await Promise.all(
    sockets.map(
      async (
        connectedSocket,
      ) => {
        try {
          const [
            userBetState,
            walletBalance,
          ] = await Promise.all([
            getUserRoundBets(
              connectedSocket
                .user.id,
              roundId,
            ),

            getWalletBalance(
              connectedSocket
                .user.id,
            ),
          ]);

          connectedSocket.emit(
            "bangla-dice:user-result",
            {
              success: true,

              data: {
                userBets:
                  userBetState.bets,

                userBetSummary:
                  userBetState
                    .summary,

                resultSummary:
                  buildResultSummary(
                    userBetState
                      .bets,
                  ),

                walletBalance,
              },
            },
          );
        } catch (error) {
          console.error(
            "BANGLA DICE USER RESULT ERROR:",
            error.message,
          );
        }
      },
    ),
  );
}

function scheduleNextRound(
  namespace,
  delay,
) {
  nextRoundTimer =
    clearTimer(
      nextRoundTimer,
    );

  nextRoundTimer =
    setTimeout(
      () => {
        void startOrResumeRound(
          namespace,
        );
      },
      Math.max(
        0,
        delay,
      ),
    );

  nextRoundTimer
    .unref?.();
}

async function completeRound(
  namespace,
  roundId,
) {
  if (loopBusy) {
    return;
  }

  loopBusy = true;

  try {
    settlementTimer =
      clearTimer(
        settlementTimer,
      );

    const result =
      await settleRound(
        roundId,
      );

    const completedRound =
      result.round;

    namespace
      .to(PUBLIC_ROOM)
      .emit(
        "bangla-dice:result",
        {
          success: true,

          serverTime:
            new Date()
              .toISOString(),

          data: {
            round:
              completedRound,

            winningSymbol: {
              id:
                completedRound
                  .winningSymbolId,

              symbolCode:
                completedRound
                  .winningSymbolCode,

              symbolName:
                completedRound
                  .winningSymbolName,

              faceNumber:
                completedRound
                  .winningFaceNumber,

              multiplier:
                completedRound
                  .winningMultiplier,
            },

            settlement:
              result.settlement ||
              null,
          },
        },
      );

    await emitUserResults(
      namespace,
      Number(roundId),
    );

    const settings =
      await getGameSettings();

    const delay =
      (
        settings
          .resultDisplaySeconds +
        settings
          .nextRoundDelaySeconds
      ) *
      1000;

    scheduleNextRound(
      namespace,
      delay,
    );
  } catch (error) {
    console.error(
      "BANGLA DICE SETTLEMENT ERROR:",
      error,
    );

    try {
      const refundResult =
        await refundRound(
          roundId,
          "Dice settlement failed.",
        );

      namespace
        .to(PUBLIC_ROOM)
        .emit(
          "bangla-dice:round-refunded",
          {
            success: true,
            data:
              refundResult,
          },
        );

      await emitUserResults(
        namespace,
        Number(roundId),
      );

      scheduleNextRound(
        namespace,
        5000,
      );
    } catch (
      refundError
    ) {
      console.error(
        "BANGLA DICE REFUND ERROR:",
        refundError,
      );

      scheduleNextRound(
        namespace,
        10000,
      );
    }
  } finally {
    loopBusy = false;
  }
}

async function beginRoll(
  namespace,
  roundId,
) {
  if (loopBusy) {
    return;
  }

  loopBusy = true;

  try {
    roundTimer =
      clearTimer(
        roundTimer,
      );

    namespace
      .to(PUBLIC_ROOM)
      .emit(
        "bangla-dice:betting-closed",
        {
          success: true,
          roundId:
            Number(roundId),
        },
      );

    const rollingRound =
      await startRoll(
        roundId,
      );

    namespace
      .to(PUBLIC_ROOM)
      .emit(
        "bangla-dice:roll-started",
        {
          success: true,

          serverTime:
            new Date()
              .toISOString(),

          data: {
            round:
              rollingRound,

            winningFaceNumber:
              rollingRound
                .winningFaceNumber,
          },
        },
      );

    const delay =
      getDelay(
        rollingRound
          .rollingEndsAt,
      );

    settlementTimer =
      setTimeout(
        () => {
          void completeRound(
            namespace,
            Number(roundId),
          );
        },
        delay,
      );

    settlementTimer
      .unref?.();
  } catch (error) {
    console.error(
      "BANGLA DICE ROLL ERROR:",
      error,
    );

    try {
      await refundRound(
        roundId,
        "Dice roll failed.",
      );

      await emitUserResults(
        namespace,
        Number(roundId),
      );
    } catch (
      refundError
    ) {
      console.error(
        "BANGLA DICE ROLL REFUND ERROR:",
        refundError,
      );
    }

    scheduleNextRound(
      namespace,
      5000,
    );
  } finally {
    loopBusy = false;
  }
}

async function startOrResumeRound(
  namespace,
) {
  if (loopBusy) {
    return;
  }

  loopBusy = true;

  try {
    clearAllTimers();

    let activeRound =
      await getActiveRound();

    if (!activeRound) {
      const createdRound =
        await createRound();

      namespace
        .to(PUBLIC_ROOM)
        .emit(
          "bangla-dice:round-started",
          {
            success: true,

            serverTime:
              new Date()
                .toISOString(),

            data: {
              round:
                createdRound,
            },
          },
        );

      activeRound =
        await getActiveRound();
    }

    if (!activeRound) {
      return;
    }

    const status =
      String(
        activeRound
          .round_status,
      );

    if (
      status ===
      ROUND_STATUS.BETTING
    ) {
      const delay =
        getDelay(
          activeRound
            .betting_ends_at,
        );

      roundTimer =
        setTimeout(
          () => {
            void beginRoll(
              namespace,
              Number(
                activeRound.id,
              ),
            );
          },
          delay,
        );

      roundTimer.unref?.();

      await emitPublicState(
        namespace,
      );

      return;
    }

    if (
      status ===
      ROUND_STATUS.ROLLING
    ) {
      const rollingRound =
        mapRoundRow(
          activeRound,
          {
            revealResult: true,
          },
        );

      namespace
        .to(PUBLIC_ROOM)
        .emit(
          "bangla-dice:roll-started",
          {
            success: true,
            data: {
              round:
                rollingRound,

              winningFaceNumber:
                rollingRound
                  .winningFaceNumber,
            },
          },
        );

      const delay =
        getDelay(
          activeRound
            .rolling_ends_at,
        );

      settlementTimer =
        setTimeout(
          () => {
            void completeRound(
              namespace,
              Number(
                activeRound.id,
              ),
            );
          },
          delay,
        );

      settlementTimer
        .unref?.();

      return;
    }

    if (
      status ===
      ROUND_STATUS.SETTLING
    ) {
      setTimeout(
        () => {
          void completeRound(
            namespace,
            Number(
              activeRound.id,
            ),
          );
        },
        0,
      );

      return;
    }

    if (
      status ===
      ROUND_STATUS.REFUNDING
    ) {
      await refundRound(
        activeRound.id,
        "Recovered interrupted Dice refund.",
      );

      scheduleNextRound(
        namespace,
        3000,
      );
    }
  } catch (error) {
    console.error(
      "BANGLA DICE START ERROR:",
      error.message,
    );

    scheduleNextRound(
      namespace,
      10000,
    );
  } finally {
    loopBusy = false;
  }
}

function initializeBanglaDiceSocket(
  io,
) {
  const namespace =
    io.of(
      "/bangla-dice",
    );

  namespace.use(
    authenticateSocket,
  );

  namespace.on(
    "connection",
    async (
      socket,
    ) => {
      socket.join(
        PUBLIC_ROOM,
      );

      socket.join(
        getUserRoom(
          socket.user.id,
        ),
      );

      socket.emit(
        "bangla-dice:connected",
        {
          success: true,
          message:
            "Bangla Dice connected.",
        },
      );

      try {
        await emitPrivateState(
          socket,
        );
      } catch (error) {
        socket.emit(
          "bangla-dice:error",
          {
            success: false,
            message:
              error.message,
            code:
              error.code ||
              "DICE_STATE_ERROR",
          },
        );
      }

      let lastBetRequestAt = 0;

      socket.on(
        "bangla-dice:place-bet",
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
              300
            ) {
              throw createGameError(
                "Bet request is too fast.",
                429,
                "DICE_BET_TOO_FAST",
              );
            }

            lastBetRequestAt =
              now;

            const result =
              await placeBet({
                userId:
                  socket.user.id,

                roundId:
                  payload.roundId,

                symbolId:
                  payload.symbolId,

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
                "bangla-dice:bet-totals",
                {
                  success: true,
                  data: totals,
                },
              );

            respond({
              success: true,
              data: result,
            });
          } catch (error) {
            respond({
              success: false,

              statusCode:
                Number(
                  error
                    .statusCode ||
                  500,
                ),

              code:
                error.code ||
                "DICE_BET_ERROR",

              message:
                error.message ||
                "Dice bet could not be placed.",
            });
          }
        },
      );
    },
  );

  void startOrResumeRound(
    namespace,
  );

  console.log(
    "✅ Bangla Dice Socket.IO initialized",
  );

  return namespace;
}

module.exports = {
  initializeBanglaDiceSocket,
};