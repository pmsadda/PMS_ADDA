"use strict";

const jwt =
  require("jsonwebtoken");

const carromService =
  require(
    "../services/carrom.service",
  );

/* ==========================================
   Constants
========================================== */

const CARROM_COUNTDOWN_MS =
  3 * 1000;

/* ==========================================
   Socket Authentication
========================================== */

function authenticateCarromSocket(
  socket,
  next,
) {
  try {
    const headerToken =
      socket.handshake
        .headers
        ?.authorization
        ?.replace(
          /^Bearer\s+/i,
          "",
        );

    const token =
      socket.handshake
        .auth
        ?.token ||
      headerToken;

    if (!token) {
      const error =
        new Error(
          "Authentication token is required.",
        );

      error.data = {
        statusCode:
          401,
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
      Number(
        decoded.id,
      );

    if (
      !Number.isInteger(userId) ||
      userId < 1
    ) {
      throw new Error(
        "Invalid Carrom socket user.",
      );
    }

    socket.user = {
      id:
        userId,

      uid:
        decoded.uid ||
        null,

      role:
        decoded.role ||
        "user",
    };

    return next();
  } catch (_error) {
    const socketError =
      new Error(
        "Invalid or expired authentication token.",
      );

    socketError.data = {
      statusCode:
        401,
    };

    return next(socketError);
  }
}

/* ==========================================
   Helpers
========================================== */

function parsePositiveInteger(
  value,
) {
  const number =
    Number(value);

  if (
    !Number.isInteger(number) ||
    number < 1
  ) {
    return null;
  }

  return number;
}

function getCarromRoomName(
  matchId,
) {
  return `carrom:match:${matchId}`;
}

function sendCallback(
  callback,
  payload,
) {
  if (
    typeof callback ===
    "function"
  ) {
    callback(payload);
  }
}

function getErrorPayload(
  error,
  fallbackMessage,
) {
  return {
    success:
      false,

    statusCode:
      Number(
        error?.statusCode ||
        error?.status ||
        500,
      ),

    code:
      error?.code ||
      "CARROM_SOCKET_ERROR",

    message:
      error?.message ||
      fallbackMessage,
  };
}

/* ==========================================
   Socket Initialization
========================================== */

function initializeCarromSocket(
  io,
) {
  const namespace =
    io.of("/carrom");

  namespace.use(
    authenticateCarromSocket,
  );

  const matchmakingTimers =
    new Map();

  const countdownTimers =
    new Map();

  /* ========================================
     Broadcast Match State
  ======================================== */

  async function broadcastMatchState(
    matchId,
  ) {
    const validMatchId =
      parsePositiveInteger(
        matchId,
      );

    if (!validMatchId) {
      return null;
    }

    const matchState =
      await carromService
        .getCarromMatchState(
          validMatchId,
        );

    namespace
      .to(
        getCarromRoomName(
          validMatchId,
        ),
      )
      .emit(
        "match:state",
        matchState,
      );

    return matchState;
  }

  /* ========================================
     Countdown Scheduler
  ======================================== */

  function scheduleMatchStart(
    matchState,
  ) {
    const matchId =
      parsePositiveInteger(
        matchState?.match?.id,
      );

    if (!matchId) {
      return;
    }

    if (
      String(
        matchState.match.status,
      ) !== "countdown"
    ) {
      return;
    }

    if (
      countdownTimers.has(
        matchId,
      )
    ) {
      return;
    }

    const countdownStartedAt =
      new Date(
        matchState
          .match
          .countdownStartedAt ||
        Date.now(),
      ).getTime();

    const elapsed =
      Math.max(
        0,
        Date.now() -
        countdownStartedAt,
      );

    const delay =
      Math.max(
        0,
        CARROM_COUNTDOWN_MS -
        elapsed,
      );

    const timer =
      setTimeout(
        async () => {
          countdownTimers.delete(
            matchId,
          );

          try {
            const result =
              await carromService
                .startCarromPlayingMatch(
                  matchId,
                );

            const startedState =
              result.matchState;

            namespace
              .to(
                getCarromRoomName(
                  matchId,
                ),
              )
              .emit(
                "match:started",
                startedState,
              );

            namespace
              .to(
                getCarromRoomName(
                  matchId,
                ),
              )
              .emit(
                "match:state",
                startedState,
              );
          } catch (error) {
            console.error(
              "CARROM MATCH START ERROR:",
              error,
            );

            namespace
              .to(
                getCarromRoomName(
                  matchId,
                ),
              )
              .emit(
                "match:error",
                getErrorPayload(
                  error,
                  "Unable to start Carrom match.",
                ),
              );
          }
        },
        delay,
      );

    countdownTimers.set(
      matchId,
      timer,
    );
  }

  /* ========================================
     Bot Matchmaking Scheduler
  ======================================== */

  function scheduleBotMatchmaking(
    matchState,
  ) {
    const matchId =
      parsePositiveInteger(
        matchState?.match?.id,
      );

    if (!matchId) {
      return;
    }

    if (
      String(
        matchState.match.status,
      ) !== "waiting"
    ) {
      return;
    }

    if (
      matchmakingTimers.has(
        matchId,
      )
    ) {
      return;
    }

    const expiresAt =
      new Date(
        matchState
          .match
          .matchmakingExpiresAt,
      ).getTime();

    const delay =
      Number.isFinite(expiresAt)
        ? Math.max(
            0,
            expiresAt -
            Date.now(),
          )
        : 0;

    const timer =
      setTimeout(
        async () => {
          matchmakingTimers.delete(
            matchId,
          );

          try {
            const result =
              await carromService
                .finalizeExpiredCarromMatchWithBots(
                  matchId,
                );

            const updatedState =
              result.matchState;

            if (
              !updatedState
            ) {
              return;
            }

            if (
              Array.isArray(
                result.addedBots,
              ) &&
              result.addedBots.length > 0
            ) {
              namespace
                .to(
                  getCarromRoomName(
                    matchId,
                  ),
                )
                .emit(
                  "match:bots-joined",
                  {
                    matchId,

                    bots:
                      result.addedBots,
                  },
                );
            }

            namespace
              .to(
                getCarromRoomName(
                  matchId,
                ),
              )
              .emit(
                "match:state",
                updatedState,
              );

            scheduleMatchStart(
              updatedState,
            );
          } catch (error) {
            console.error(
              "CARROM BOT MATCHMAKING ERROR:",
              error,
            );

            namespace
              .to(
                getCarromRoomName(
                  matchId,
                ),
              )
              .emit(
                "match:error",
                getErrorPayload(
                  error,
                  "Unable to complete Carrom matchmaking.",
                ),
              );
          }
        },
        delay,
      );

    matchmakingTimers.set(
      matchId,
      timer,
    );
  }

  /* ========================================
     Recover after Render Restart
  ======================================== */

  async function recoverCarromMatches() {
    try {
      const matches =
        await carromService
          .getRecoverableCarromMatches();

      for (const match of matches) {
        const matchState =
          await carromService
            .getCarromMatchState(
              match.matchId,
            );

        if (
          match.status ===
          "waiting"
        ) {
          scheduleBotMatchmaking(
            matchState,
          );
        }

        if (
          match.status ===
          "countdown"
        ) {
          scheduleMatchStart(
            matchState,
          );
        }
      }

      console.log(
        `✅ Carrom recovery scheduled for ${matches.length} match(es)`,
      );
    } catch (error) {
      console.error(
        "CARROM RESTART RECOVERY ERROR:",
        error,
      );
    }
  }

  /* ========================================
     Client Connection
  ======================================== */

  namespace.on(
    "connection",
    (socket) => {
      socket.on(
        "match:join",
        async (
          payload = {},
          callback,
        ) => {
          try {
            const matchId =
              parsePositiveInteger(
                payload.matchId,
              );

            if (!matchId) {
              const error =
                new Error(
                  "Valid Carrom match ID is required.",
                );

              error.statusCode =
                400;

              error.code =
                "CARROM_INVALID_MATCH_ID";

              throw error;
            }

            const matchState =
              await carromService
                .getCarromMatchState(
                  matchId,
                  socket.user.id,
                );

            const roomName =
              getCarromRoomName(
                matchId,
              );

            await socket.join(
              roomName,
            );

            socket.data
              .carromMatchId =
              matchId;

            socket.emit(
              "match:state",
              matchState,
            );

            if (
              matchState
                .match
                .status ===
              "waiting"
            ) {
              scheduleBotMatchmaking(
                matchState,
              );
            }

            if (
              matchState
                .match
                .status ===
              "countdown"
            ) {
              scheduleMatchStart(
                matchState,
              );
            }

            sendCallback(
              callback,
              {
                success:
                  true,

                data:
                  matchState,
              },
            );
          } catch (error) {
            console.error(
              "CARROM SOCKET JOIN ERROR:",
              error,
            );

            sendCallback(
              callback,
              getErrorPayload(
                error,
                "Unable to join Carrom socket match.",
              ),
            );
          }
        },
      );

      socket.on(
        "match:refresh",
        async (
          payload = {},
          callback,
        ) => {
          try {
            const matchId =
              parsePositiveInteger(
                payload.matchId ||
                socket.data
                  .carromMatchId,
              );

            const matchState =
              await carromService
                .getCarromMatchState(
                  matchId,
                  socket.user.id,
                );

            sendCallback(
              callback,
              {
                success:
                  true,

                data:
                  matchState,
              },
            );
          } catch (error) {
            sendCallback(
              callback,
              getErrorPayload(
                error,
                "Unable to refresh Carrom match.",
              ),
            );
          }
        },
      );
    },
  );

  /*
   * Database connection startup-এর কিছুক্ষণ পরে
   * waiting/countdown matches recover হবে।
   */
  setTimeout(() => {
    recoverCarromMatches();
  }, 1500);

  console.log(
    "✅ Carrom Socket.IO initialized",
  );

 return {
  namespace,

  recoverCarromMatches,

  broadcastMatchState,

  scheduleBotMatchmaking,

  scheduleMatchStart,
};
}

module.exports = {
  initializeCarromSocket,
};