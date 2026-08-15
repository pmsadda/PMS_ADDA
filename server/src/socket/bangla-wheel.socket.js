"use strict";

const jwt =
  require("jsonwebtoken");

const {
  pool
} = require(
  "../config/database"
);

const {
  createRound,
  getActiveRound,
  getGameSettings,
  getPublicGameState
} = require(
  "../services/bangla-wheel.service"
);

const {
  placeBet,
  getUserRoundBet,
  getRoundBetTotals
} = require(
  "../services/bangla-wheel-wallet.service"
);

const {
  getRoundResult,
  startSpin,
  settleRound
} = require(
  "../services/bangla-wheel-settlement.service"
);

/* =========================================================
   RUNTIME STATE
========================================================= */

const PUBLIC_ROOM =
  "bangla-wheel:public";

let bettingTimer = null;
let settlementTimer = null;
let nextRoundTimer = null;
let loopBusy = false;

function getUserRoom(
  userId
) {
  return (
    `bangla-wheel:user:` +
    `${Number(userId)}`
  );
}

/* =========================================================
   AUTHENTICATION
========================================================= */

async function authenticateSocket(
  socket,
  next
) {
  try {
    const authorization =
      socket.handshake
        .headers
        ?.authorization;

    const headerToken =
      typeof authorization ===
        "string" &&
      authorization
        .startsWith("Bearer ")
        ? authorization
            .slice(7)
        : null;

    const token =
      socket.handshake
        .auth?.token ||
      headerToken;

    if (!token) {
      const error =
        new Error(
          "Authentication token is required."
        );

      error.data = {
        statusCode: 401,
        code:
          "SOCKET_TOKEN_REQUIRED"
      };

      return next(error);
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
      Number.parseInt(
        decoded.id,
        10
      );

    if (
      !Number.isInteger(userId) ||
      userId < 1
    ) {
      const error =
        new Error(
          "Invalid authenticated user."
        );

      error.data = {
        statusCode: 401,
        code:
          "SOCKET_USER_INVALID"
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
        [userId]
      );

    const user =
      userRows[0] ||
      null;

    if (!user) {
      const error =
        new Error(
          "User account was not found."
        );

      error.data = {
        statusCode: 401,
        code:
          "SOCKET_USER_NOT_FOUND"
      };

      return next(error);
    }

    if (
      String(
        user.account_status ||
          ""
      ).toLowerCase() !==
        "active"
    ) {
      const error =
        new Error(
          "This account is not active."
        );

      error.data = {
        statusCode: 403,
        code:
          "SOCKET_ACCOUNT_INACTIVE"
      };

      return next(error);
    }

    socket.user = {
      id:
        Number(user.id),

      uid:
        user.uid ||
        null,

      role:
        String(
          user.role ||
          "user"
        ).toLowerCase()
    };

    return next();
  } catch (error) {
    console.error(
      "BANGLA WHEEL SOCKET AUTH ERROR:",
      error.message
    );

    const tokenError = [
      "JsonWebTokenError",
      "TokenExpiredError",
      "NotBeforeError"
    ].includes(
      error.name
    );

    const socketError =
      new Error(
        tokenError
          ? "Invalid or expired authentication token."
          : "Socket authentication is temporarily unavailable."
      );

    socketError.data = {
      statusCode:
        tokenError
          ? 401
          : 500,

      code:
        tokenError
          ? "SOCKET_AUTH_FAILED"
          : "SOCKET_AUTH_DATABASE_ERROR"
    };

    return next(
      socketError
    );
  }
}

/* =========================================================
   TIMER HELPERS
========================================================= */

function clearTimer(timer) {
  if (timer) {
    clearTimeout(timer);
  }

  return null;
}

function clearAllTimers() {
  bettingTimer =
    clearTimer(
      bettingTimer
    );

  settlementTimer =
    clearTimer(
      settlementTimer
    );

  nextRoundTimer =
    clearTimer(
      nextRoundTimer
    );
}

function getDelay(
  dateValue
) {
  const targetTime =
    new Date(
      dateValue
    ).getTime();

  if (
    !Number.isFinite(
      targetTime
    )
  ) {
    return 0;
  }

  return Math.max(
    0,
    targetTime -
      Date.now()
  );
}

/* =========================================================
   STATE EMISSION
========================================================= */

async function emitPublicState(
  namespace
) {
  const state =
    await getPublicGameState();

  let betTotals = {
    animals: []
  };

  if (
    state.activeRound?.id
  ) {
    betTotals =
      await getRoundBetTotals(
        state.activeRound.id
      );
  }

  namespace
    .to(PUBLIC_ROOM)
    .emit(
      "bangla-wheel:state",
      {
        success: true,

        data: {
          ...state,
          betTotals
        }
      }
    );

  return state;
}

async function emitPrivateState(
  socket
) {
  const state =
    await getPublicGameState();

  let userBet = null;

  let betTotals = {
    animals: []
  };

  if (
    state.activeRound?.id
  ) {
    [
      userBet,
      betTotals
    ] = await Promise.all([
      getUserRoundBet(
        socket.user.id,
        state.activeRound.id
      ),

      getRoundBetTotals(
        state.activeRound.id
      )
    ]);
  }

  socket.emit(
    "bangla-wheel:state",
    {
      success: true,

      data: {
        ...state,
        userBet,
        betTotals
      }
    }
  );
}

/* =========================================================
   SCHEDULE BETTING CLOSE
========================================================= */

function scheduleBettingClose(
  namespace,
  round
) {
  bettingTimer =
    clearTimer(
      bettingTimer
    );

  const delay =
    getDelay(
      round.bettingClosesAt
    );

  bettingTimer =
    setTimeout(
      () => {
        beginWheelSpin(
          namespace,
          round.id
        ).catch(
          (error) => {
            console.error(
              "BANGLA WHEEL SPIN TIMER ERROR:",
              error
            );
          }
        );
      },
      delay + 150
    );

  bettingTimer.unref?.();
}

/* =========================================================
   SCHEDULE SETTLEMENT
========================================================= */

function scheduleSettlement(
  namespace,
  round
) {
  settlementTimer =
    clearTimer(
      settlementTimer
    );

  const delay =
    getDelay(
      round.spinningEndsAt
    );

  settlementTimer =
    setTimeout(
      () => {
        completeWheelRound(
          namespace,
          round.id
        ).catch(
          (error) => {
            console.error(
              "BANGLA WHEEL SETTLEMENT TIMER ERROR:",
              error
            );
          }
        );
      },
      delay + 150
    );

  settlementTimer.unref?.();
}

/* =========================================================
   START OR RESUME
========================================================= */

async function startOrResumeRound(
  namespace
) {
  if (loopBusy) {
    return;
  }

  loopBusy = true;

  try {
    let activeRound =
      await getActiveRound();

    if (!activeRound) {
      const created =
        await createRound();

      activeRound =
        created.round;

      namespace
        .to(PUBLIC_ROOM)
        .emit(
          "bangla-wheel:round-started",
          {
            success: true,

            round:
              activeRound,

            settings:
              created.settings,

            serverTime:
              new Date()
                .toISOString()
          }
        );
    }

    if (
      activeRound
        .roundStatus ===
        "betting"
    ) {
      const bettingDelay =
        getDelay(
          activeRound
            .bettingClosesAt
        );

      if (
        bettingDelay <= 0
      ) {
        setImmediate(
          () => {
            beginWheelSpin(
              namespace,
              activeRound.id
            ).catch(
              (error) => {
                console.error(
                  "BANGLA WHEEL RECOVERY SPIN ERROR:",
                  error
                );
              }
            );
          }
        );
      } else {
        scheduleBettingClose(
          namespace,
          activeRound
        );
      }
    }

    if (
      [
        "spinning",
        "settling"
      ].includes(
        activeRound
          .roundStatus
      )
    ) {
      const spinResult =
        await getRoundResult(
          activeRound.id
        );

      namespace
        .to(PUBLIC_ROOM)
        .emit(
          "bangla-wheel:spin-started",
          {
            success: true,

            data:
              spinResult,

            resumed: true,

            serverTime:
              new Date()
                .toISOString()
          }
        );

      const settlementDelay =
        getDelay(
          activeRound
            .spinningEndsAt
        );

      if (
        settlementDelay <= 0
      ) {
        setImmediate(
          () => {
            completeWheelRound(
              namespace,
              activeRound.id
            ).catch(
              (error) => {
                console.error(
                  "BANGLA WHEEL RECOVERY SETTLEMENT ERROR:",
                  error
                );
              }
            );
          }
        );
      } else {
        scheduleSettlement(
          namespace,
          activeRound
        );
      }
    }

    await emitPublicState(
      namespace
    );
  } finally {
    loopBusy = false;
  }
}

/* =========================================================
   BEGIN SPIN
========================================================= */

async function beginWheelSpin(
  namespace,
  roundId
) {
  if (loopBusy) {
    return;
  }

  loopBusy = true;

  bettingTimer =
    clearTimer(
      bettingTimer
    );

  try {
    namespace
      .to(PUBLIC_ROOM)
      .emit(
        "bangla-wheel:betting-closed",
        {
          success: true,

          roundId:
            Number(roundId),

          serverTime:
            new Date()
              .toISOString()
        }
      );

    const spinResult =
      await startSpin(
        roundId
      );

    namespace
      .to(PUBLIC_ROOM)
      .emit(
        "bangla-wheel:spin-started",
        {
          success: true,

          data:
            spinResult,

          resumed: false,

          serverTime:
            new Date()
              .toISOString()
        }
      );

    scheduleSettlement(
      namespace,
      spinResult.round
    );
  } catch (error) {
    console.error(
      "BANGLA WHEEL START SPIN ERROR:",
      error
    );

    namespace
      .to(PUBLIC_ROOM)
      .emit(
        "bangla-wheel:error",
        {
          success: false,

          code:
            error.code ||
            "SPIN_START_FAILED",

          message:
            error.message ||
            "Bangla Wheel could not start spinning."
        }
      );

    throw error;
  } finally {
    loopBusy = false;
  }
}

/* =========================================================
   COMPLETE ROUND
========================================================= */

async function completeWheelRound(
  namespace,
  roundId
) {
  if (loopBusy) {
    return;
  }

  loopBusy = true;

  settlementTimer =
    clearTimer(
      settlementTimer
    );

  try {
    const result =
      await settleRound(
        roundId
      );

    namespace
      .to(PUBLIC_ROOM)
      .emit(
        "bangla-wheel:result",
        {
          success: true,

          data:
            result,

          serverTime:
            new Date()
              .toISOString()
        }
      );

    const connectedSockets =
      await namespace
        .in(PUBLIC_ROOM)
        .fetchSockets();

    await Promise.all(
      connectedSockets.map(
        async (
          connectedSocket
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
                    .user.id
                ]
              );

            const userBet =
              await getUserRoundBet(
                connectedSocket
                  .user.id,
                roundId
              );

            connectedSocket.emit(
              "bangla-wheel:user-result",
              {
                success: true,

                data: {
                  userBet,

                  walletBalance:
                    Number(
                      userRows[0]
                        ?.wallet_balance ||
                      0
                    )
                }
              }
            );
          } catch (error) {
            console.error(
              "BANGLA WHEEL PRIVATE RESULT ERROR:",
              error.message
            );
          }
        }
      )
    );

    const settings =
      await getGameSettings();

    const nextDelay =
      (
        Number(
          settings
            .resultDisplaySeconds
        ) +
        Number(
          settings
            .nextRoundDelaySeconds
        )
      ) * 1000;

    nextRoundTimer =
      clearTimer(
        nextRoundTimer
      );

    nextRoundTimer =
      setTimeout(
        () => {
          if (
            namespace.sockets
              .size < 1
          ) {
            return;
          }

          startOrResumeRound(
            namespace
          ).catch(
            (error) => {
              console.error(
                "BANGLA WHEEL NEXT ROUND ERROR:",
                error
              );
            }
          );
        },
        Math.max(
          1000,
          nextDelay
        )
      );

    nextRoundTimer.unref?.();
  } catch (error) {
    console.error(
      "BANGLA WHEEL COMPLETE ROUND ERROR:",
      error
    );

    namespace
      .to(PUBLIC_ROOM)
      .emit(
        "bangla-wheel:error",
        {
          success: false,

          code:
            error.code ||
            "ROUND_SETTLEMENT_FAILED",

          message:
            error.message ||
            "Bangla Wheel settlement failed."
        }
      );

    throw error;
  } finally {
    loopBusy = false;
  }
}

/* =========================================================
   SOCKET INITIALIZATION
========================================================= */

function initializeBanglaWheelSocket(
  io
) {
  const namespace =
    io.of(
      "/bangla-wheel"
    );

  namespace.use(
    authenticateSocket
  );

  namespace.on(
    "connection",
    async (socket) => {
      socket.join(
        PUBLIC_ROOM
      );

      socket.join(
        getUserRoom(
          socket.user.id
        )
      );

      socket.emit(
        "bangla-wheel:connected",
        {
          success: true,

          userId:
            socket.user.id,

          serverTime:
            new Date()
              .toISOString()
        }
      );

      try {
        await startOrResumeRound(
          namespace
        );

        await emitPrivateState(
          socket
        );
      } catch (error) {
        socket.emit(
          "bangla-wheel:error",
          {
            success: false,

            code:
              error.code ||
              "GAME_START_FAILED",

            message:
              error.message ||
              "Bangla Wheel could not be started."
          }
        );
      }

      let lastBetRequestAt = 0;

      socket.on(
        "bangla-wheel:place-bet",
        async (
          payload = {},
          acknowledgement
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
                  "Please wait before submitting another bet."
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

                animalId:
                  payload.animalId,

                betAmount:
                  payload.betAmount
              });

            const totals =
              await getRoundBetTotals(
                payload.roundId
              );

            namespace
              .to(PUBLIC_ROOM)
              .emit(
                "bangla-wheel:bet-totals",
                {
                  success: true,

                  roundId:
                    Number(
                      payload.roundId
                    ),

                  totals
                }
              );

            respond({
              success: true,

              message:
                "Bangla Wheel bet placed successfully.",

              data:
                result
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
                "Bangla Wheel bet failed."
            });
          }
        }
      );

      socket.on(
        "bangla-wheel:request-state",
        async (
          acknowledgement
        ) => {
          const respond =
            typeof acknowledgement ===
              "function"
              ? acknowledgement
              : () => {};

          try {
            await emitPrivateState(
              socket
            );

            respond({
              success: true
            });
          } catch (error) {
            respond({
              success: false,

              code:
                error.code ||
                "STATE_FAILED",

              message:
                error.message ||
                "Bangla Wheel state could not be loaded."
            });
          }
        }
      );
    }
  );

  console.log(
    "✅ Bangla Wheel Socket.IO initialized"
  );

  return namespace;
}

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  initializeBanglaWheelSocket,
  clearAllTimers
};