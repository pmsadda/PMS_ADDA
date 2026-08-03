"use strict";

/* ==========================================
   PMS ADDA LUDO SOCKET
   Matchmaking + Real Player + Bot
========================================== */

const jwt = require("jsonwebtoken");

const ludoService = require("../services/ludo.service");

/* ==========================================
   Socket Authentication
========================================== */

function authenticateSocket(socket, next) {
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
      };

      return next(error);
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    socket.user = {
      id: Number(decoded.id),

      uid: decoded.uid,

      role: decoded.role,
    };

    return next();
  } catch (error) {
    const socketError = new Error("Invalid or expired authentication token.");

    socketError.data = {
      statusCode: 401,
    };

    return next(socketError);
  }
}

/* ==========================================
   Basic Helpers
========================================== */

function parsePositiveInteger(value) {
  const number = Number(value);

  if (!Number.isInteger(number) || number <= 0) {
    return null;
  }

  return number;
}

function getMatchRoomName(matchId) {
  return `ludo:match:${matchId}`;
}

function sendCallback(callback, payload) {
  if (typeof callback === "function") {
    callback(payload);
  }
}

function getErrorStatus(error) {
  return Number(error?.statusCode || error?.status || 500);
}

function validateSocketPlayer(matchState, userId) {
  const player = matchState.players.find(
    (item) => !item.isBot && Number(item.userId) === Number(userId),
  );

  if (!player) {
    const error = new Error("You are not a player of this Ludo match.");

    error.statusCode = 403;

    throw error;
  }

  return player;
}

function wait(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

/* ==========================================
   Socket Initialization
========================================== */

function initializeLudoSocket(io) {
  const namespace = io.of("/ludo");

  namespace.use(authenticateSocket);

  /*
   * একই match-এর জন্য duplicate
   * timer তৈরি বন্ধ করবে।
   */
  const matchmakingTimers = new Map();

  const botTimers = new Map();
  const turnTimers = new Map();

  const disconnectTimers = new Map();

  const DISCONNECT_GRACE_MS = 10 * 1000;

  /* ========================================
     Broadcast State
  ======================================== */

  async function broadcastMatchState(matchId) {
    const state = await ludoService.getMatchState(matchId);

    namespace.to(getMatchRoomName(matchId)).emit("match:state", state);

    return state;
  }

  /* ========================================
     Bot Turn Scheduler
  ======================================== */

  function scheduleBotTurn(matchId, delay = 350) {
    const validMatchId = parsePositiveInteger(matchId);

    if (!validMatchId) {
      return;
    }

    if (botTimers.has(validMatchId)) {
      return;
    }

    const timer = setTimeout(async () => {
      botTimers.delete(validMatchId);

      try {
        const result = await ludoService.runBotTurn(validMatchId);

        if (result.skipped) {
          return;
        }

        const roomName = getMatchRoomName(validMatchId);

        /*
         * Bot actions client-কে
         * animation-এর জন্য পাঠানো হবে।
         */
        for (const action of result.actions) {
          if (action.type === "dice") {
            namespace.to(roomName).emit("dice:rolled", action.data);
          }

          if (action.type === "pawn") {
            namespace.to(roomName).emit("pawn:moved", action.data);
          }

          await wait(280);
        }

        namespace.to(roomName).emit("match:state", result.matchState);

        /*
         * Final state-তেও Bot turn
         * থাকলে safety reschedule।
         */
        const currentPlayer = result.matchState.players.find(
          (player) =>
            Number(player.id) ===
            Number(result.matchState.gameState?.currentTurnPlayerId),
        );

        if (
          result.matchState.match.status === "playing" &&
          currentPlayer?.isBot
        ) {
          scheduleBotTurn(validMatchId, 500);
        }
      } catch (error) {
        console.error("LUDO BOT TURN ERROR:", error);

        namespace.to(getMatchRoomName(validMatchId)).emit("match:error", {
          statusCode: getErrorStatus(error),

          message: error.message || "Bot action failed.",
        });
      }
    }, delay);

    botTimers.set(validMatchId, timer);
  }

  /* ========================================
     Inspect State for Bot Turn
  ======================================== */

  function inspectBotTurn(matchState) {
    scheduleTurnTimer(matchState);
    if (
      !matchState ||
      matchState.match?.status !== "playing" ||
      !matchState.gameState
    ) {
      return;
    }

    const currentPlayerId = Number(matchState.gameState.currentTurnPlayerId);

    const currentPlayer = matchState.players.find(
      (player) => Number(player.id) === currentPlayerId,
    );

    if (currentPlayer?.isBot) {
      scheduleBotTurn(matchState.match.id);
    }
  }

  /* ========================================
   Server-authoritative Turn Timer
======================================== */

  function clearTurnTimer(matchId) {
    const validMatchId = parsePositiveInteger(matchId);

    if (!validMatchId || !turnTimers.has(validMatchId)) {
      return;
    }

    clearTimeout(turnTimers.get(validMatchId));

    turnTimers.delete(validMatchId);
  }

  function scheduleTurnTimer(matchState) {
    const matchId = parsePositiveInteger(matchState?.match?.id);

    if (!matchId) {
      return;
    }

    clearTurnTimer(matchId);

    if (
      matchState.match.status !== "playing" ||
      !matchState.gameState ||
      !matchState.gameState.currentTurnPlayerId
    ) {
      return;
    }

    const expiresAtValue = matchState.gameState.turnExpiresAt;

    const normalizedExpiresAt = String(expiresAtValue || "").includes("T")
      ? String(expiresAtValue)
      : String(expiresAtValue || "").replace(" ", "T");

    const expiresAt = new Date(normalizedExpiresAt).getTime();

    const delay = Number.isFinite(expiresAt)
      ? Math.max(expiresAt - Date.now() + 120, 120)
      : ludoService.TURN_DURATION_SECONDS * 1000;

    const expectedStateVersion = Number(matchState.gameState.stateVersion);

    const timer = setTimeout(async () => {
      turnTimers.delete(matchId);

      try {
        const result = await ludoService.handleTurnTimeout(
          matchId,
          expectedStateVersion,
        );

        if (!result.skipped) {
          namespace
            .to(getMatchRoomName(matchId))
            .emit("turn:timeout", result.timeout);
        }

        namespace
          .to(getMatchRoomName(matchId))
          .emit("match:state", result.matchState);

        /*
         * নতুন turn-এর timer এবং
         * Bot turn দুটোই এখান থেকে
         * পুনরায় চালু হবে।
         */
        inspectBotTurn(result.matchState);
      } catch (error) {
        console.error("LUDO TURN TIMEOUT ERROR:", error);

        namespace.to(getMatchRoomName(matchId)).emit("match:error", {
          statusCode: getErrorStatus(error),

          message: error.message || "Turn timeout failed.",
        });

        /*
         * Temporary database timing
         * difference হলে latest state
         * নিয়ে timer আবার বসাবে।
         */
        try {
          const latestState = await ludoService.getMatchState(matchId);

          inspectBotTurn(latestState);
        } catch (stateError) {
          console.error("LUDO TIMEOUT RECOVERY ERROR:", stateError);
        }
      }
    }, delay);

    turnTimers.set(matchId, timer);
  }

  /* ========================================
   Disconnect Grace Timer
======================================== */

  function getDisconnectKey(matchId, userId) {
    return `${matchId}:${userId}`;
  }

  function clearDisconnectTimer(matchId, userId) {
    const key = getDisconnectKey(matchId, userId);

    if (!disconnectTimers.has(key)) {
      return false;
    }

    clearTimeout(disconnectTimers.get(key));

    disconnectTimers.delete(key);

    return true;
  }

  async function hasConnectedUserSocket(
    matchId,
    userId,
    excludedSocketId = null,
  ) {
    const validMatchId = parsePositiveInteger(matchId);

    const validUserId = parsePositiveInteger(userId);

    if (!validMatchId || !validUserId) {
      return false;
    }

    const roomName = getMatchRoomName(validMatchId);

    const connectedSockets = await namespace.in(roomName).fetchSockets();

    return connectedSockets.some(
      (connectedSocket) =>
        connectedSocket.id !== excludedSocketId &&
        Number(connectedSocket.user?.id) === validUserId,
    );
  }

  function scheduleDisconnectForfeit(matchId, userId, excludedSocketId = null) {
    const validMatchId = parsePositiveInteger(matchId);

    const validUserId = parsePositiveInteger(userId);

    if (!validMatchId || !validUserId) {
      return;
    }

    clearDisconnectTimer(validMatchId, validUserId);

    const key = getDisconnectKey(validMatchId, validUserId);

    const timer = setTimeout(async () => {
      disconnectTimers.delete(key);

      try {
        /*
         * Grace timer শেষ হওয়ার সময়ও
         * আরেকটি connected socket আছে
         * কি না server আবার যাচাই করবে।
         */
        const stillConnected = await hasConnectedUserSocket(
          validMatchId,
          validUserId,
          excludedSocketId,
        );

        if (stillConnected) {
          return;
        }

        const result = await ludoService.forfeitPlayer(
          validMatchId,
          validUserId,
        );

        const roomName = getMatchRoomName(validMatchId);

        namespace.to(roomName).emit("player:forfeited", {
          matchId: validMatchId,

          userId: validUserId,

          matchPlayerId: result.forfeitedPlayerId,

          reason: "disconnect",

          completed: result.completed,
        });

        namespace.to(roomName).emit("match:state", result.matchState);

        if (result.completed) {
          clearTurnTimer(validMatchId);

          namespace.to(roomName).emit("match:completed", {
            match: result.matchState.match,

            players: result.matchState.players,
          });
        } else {
          inspectBotTurn(result.matchState);
        }
      } catch (error) {
        console.error("LUDO DISCONNECT FORFEIT ERROR:", error);
      }
    }, DISCONNECT_GRACE_MS);

    disconnectTimers.set(key, timer);
  }

  /* ========================================
     Matchmaking Finalizer
  ======================================== */

  function scheduleMatchmaking(matchState) {
    if (!matchState || matchState.match?.status !== "waiting") {
      return;
    }

    const matchId = Number(matchState.match.id);

    if (!Number.isInteger(matchId) || matchId <= 0) {
      return;
    }

    if (matchmakingTimers.has(matchId)) {
      return;
    }

    const expiresAt = new Date(matchState.match.matchmakingExpiresAt).getTime();

    const delay = Number.isFinite(expiresAt)
      ? Math.max(expiresAt - Date.now(), 0)
      : ludoService.MATCHMAKING_WAIT_SECONDS * 1000;

    const timer = setTimeout(async () => {
      matchmakingTimers.delete(matchId);

      try {
        const finalState = await ludoService.finalizeMatchmaking(matchId);

        namespace.to(getMatchRoomName(matchId)).emit("match:state", finalState);

        namespace.to(getMatchRoomName(matchId)).emit("matchmaking:completed", {
          match: finalState.match,

          players: finalState.players,
        });

        inspectBotTurn(finalState);
      } catch (error) {
        console.error("LUDO MATCHMAKING FINALIZE ERROR:", error);

        namespace.to(getMatchRoomName(matchId)).emit("match:error", {
          statusCode: getErrorStatus(error),

          message: error.message || "Matchmaking failed.",
        });
      }
    }, delay);

    matchmakingTimers.set(matchId, timer);
  }

  /* ========================================
     Client Connection
  ======================================== */

  namespace.on("connection", (socket) => {
    console.log(`🎲 Ludo connected: User ${socket.user.id}`);

    /* ====================================
         Join Match Socket Room
      ==================================== */

    socket.on("match:join", async (payload = {}, callback) => {
      try {
        const matchId = parsePositiveInteger(payload.matchId);

        if (!matchId) {
          throw Object.assign(new Error("Valid Ludo match ID is required."), {
            statusCode: 400,
          });
        }

        const matchState = await ludoService.getMatchState(matchId);

        const player = validateSocketPlayer(matchState, socket.user.id);

        const roomName = getMatchRoomName(matchId);

        if (socket.data.matchRoom && socket.data.matchRoom !== roomName) {
          await socket.leave(socket.data.matchRoom);
        }

        await socket.join(roomName);

        socket.data.matchId = matchId;

        socket.data.matchRoom = roomName;

        socket.data.matchPlayerId = Number(player.id);

        clearDisconnectTimer(matchId, socket.user.id);

        socket.emit("match:state", matchState);

        socket.to(roomName).emit("match:player-joined", {
          matchId,
          userId: socket.user.id,
          matchPlayerId: Number(player.id),
        });

        sendCallback(callback, {
          success: true,

          message: "Ludo match connected.",

          data: {
            matchId,

            matchPlayerId: Number(player.id),
          },
        });

        scheduleMatchmaking(matchState);

        inspectBotTurn(matchState);
      } catch (error) {
        console.error("LUDO MATCH JOIN ERROR:", error);

        sendCallback(callback, {
          success: false,

          statusCode: getErrorStatus(error),

          message: error.message || "Unable to join match.",
        });
      }
    });

    /* ====================================
         Get Latest State
      ==================================== */

    socket.on("match:get-state", async (payload = {}, callback) => {
      try {
        const matchId = parsePositiveInteger(
          payload.matchId || socket.data.matchId,
        );

        if (!matchId) {
          throw Object.assign(new Error("Valid match ID is required."), {
            statusCode: 400,
          });
        }

        const state = await ludoService.getMatchState(matchId);

        validateSocketPlayer(state, socket.user.id);

        socket.emit("match:state", state);

        sendCallback(callback, {
          success: true,
        });

        scheduleMatchmaking(state);

        inspectBotTurn(state);
      } catch (error) {
        sendCallback(callback, {
          success: false,

          statusCode: getErrorStatus(error),

          message: error.message,
        });
      }
    });

    /* ====================================
         Real Player Dice
      ==================================== */

    socket.on("dice:roll", async (payload = {}, callback) => {
      try {
        const matchId = parsePositiveInteger(
          payload.matchId || socket.data.matchId,
        );

        if (!matchId || Number(socket.data.matchId) !== matchId) {
          throw Object.assign(
            new Error("Socket is not joined to this match."),
            {
              statusCode: 403,
            },
          );
        }

        const result = await ludoService.rollDice(matchId, socket.user.id);

        const roomName = getMatchRoomName(matchId);

        namespace.to(roomName).emit("dice:rolled", result.diceResult);

        namespace.to(roomName).emit("match:state", result.matchState);

        sendCallback(callback, {
          success: true,

          message: result.diceResult.noValidMoves
            ? "No legal move. Turn passed."
            : result.diceResult.thirdSixForfeited
              ? "Third six. Turn passed."
              : "Dice rolled.",

          data: result.diceResult,
        });

        inspectBotTurn(result.matchState);
      } catch (error) {
        console.error("LUDO DICE ERROR:", error);

        sendCallback(callback, {
          success: false,

          statusCode: getErrorStatus(error),

          message: error.message || "Dice roll failed.",
        });
      }
    });

    /* ====================================
         Real Player Pawn Move
      ==================================== */

    socket.on("pawn:move", async (payload = {}, callback) => {
      try {
        const matchId = parsePositiveInteger(
          payload.matchId || socket.data.matchId,
        );

        const pawnNo = parsePositiveInteger(payload.pawnNo);

        if (!matchId || Number(socket.data.matchId) !== matchId) {
          throw Object.assign(
            new Error("Socket is not joined to this match."),
            {
              statusCode: 403,
            },
          );
        }

        if (!pawnNo || pawnNo > 4) {
          throw Object.assign(
            new Error("Pawn number must be between 1 and 4."),
            {
              statusCode: 400,
            },
          );
        }

        const result = await ludoService.movePawn(
          matchId,
          socket.user.id,
          pawnNo,
        );

        const roomName = getMatchRoomName(matchId);

        namespace.to(roomName).emit("pawn:moved", result.pawnMove);

        namespace.to(roomName).emit("match:state", result.matchState);

        if (result.pawnMove.matchCompleted) {
          namespace.to(roomName).emit("match:completed", {
            match: result.matchState.match,

            players: result.matchState.players,
          });
        }

        sendCallback(callback, {
          success: true,

          message: "Pawn moved.",

          data: result.pawnMove,
        });

        inspectBotTurn(result.matchState);
      } catch (error) {
        console.error("LUDO PAWN ERROR:", error);

        sendCallback(callback, {
          success: false,

          statusCode: getErrorStatus(error),

          message: error.message || "Pawn movement failed.",
        });
      }
    });

    /* ====================================
         Leave Socket Room
      ==================================== */

    socket.on("match:leave", async (payload = {}, callback) => {
      try {
        const matchId = parsePositiveInteger(
          payload.matchId || socket.data.matchId,
        );

        if (!matchId) {
          throw Object.assign(new Error("Valid match ID is required."), {
            statusCode: 400,
          });
        }

        if (Number(socket.data.matchId) !== matchId) {
          throw Object.assign(
            new Error("Socket is not joined to this match."),
            {
              statusCode: 403,
            },
          );
        }

        clearDisconnectTimer(matchId, socket.user.id);

        const result = await ludoService.forfeitPlayer(matchId, socket.user.id);

        const roomName = getMatchRoomName(matchId);

        namespace.to(roomName).emit("player:forfeited", {
          matchId,

          userId: socket.user.id,

          matchPlayerId: result.forfeitedPlayerId,

          reason: "exit",

          completed: result.completed,
        });

        namespace.to(roomName).emit("match:state", result.matchState);

        if (result.completed) {
          clearTurnTimer(matchId);

          namespace.to(roomName).emit("match:completed", {
            match: result.matchState.match,

            players: result.matchState.players,
          });
        } else {
          inspectBotTurn(result.matchState);
        }

        socket.data.intentionalLeave = true;

        await socket.leave(roomName);

        socket.data.matchId = null;

        socket.data.matchRoom = null;

        socket.data.matchPlayerId = null;

        sendCallback(callback, {
          success: true,

          message: "You left the Ludo match.",

          data: {
            completed: result.completed,

            winnerPlayerId: result.winnerPlayerId,
          },
        });
      } catch (error) {
        console.error("LUDO MATCH LEAVE ERROR:", error);

        sendCallback(callback, {
          success: false,

          statusCode: getErrorStatus(error),

          message: error.message || "Unable to leave match.",
        });
      }
    });

    /* ====================================
         Disconnect
      ==================================== */

    socket.on("disconnect", async (reason) => {
      console.log(`🔌 Ludo disconnected: User ${socket.user.id}; ${reason}`);

      const matchId = parsePositiveInteger(socket.data.matchId);

      if (socket.data.intentionalLeave || !matchId) {
        return;
      }

      const userId = parsePositiveInteger(socket.user.id);

      if (!userId) {
        return;
      }

      const roomName = getMatchRoomName(matchId);

      try {
        /*
         * একই user-এর অন্য tab/device
         * match room-এ connected থাকলে
         * disconnect forfeit শুরু হবে না।
         */
        const anotherSocketConnected = await hasConnectedUserSocket(
          matchId,
          userId,
          socket.id,
        );

        if (anotherSocketConnected) {
          clearDisconnectTimer(matchId, userId);

          return;
        }

        namespace.to(roomName).emit("match:player-disconnected", {
          matchId,

          userId,

          reconnectSeconds: DISCONNECT_GRACE_MS / 1000,
        });

        scheduleDisconnectForfeit(matchId, userId, socket.id);
      } catch (error) {
        console.error("LUDO DISCONNECT CHECK ERROR:", error);

        /*
         * Socket check সাময়িকভাবে fail হলেও
         * grace timer ছাড়া সঙ্গে সঙ্গে
         * player forfeit করা হবে না।
         */
        scheduleDisconnectForfeit(matchId, userId, socket.id);
      }
    });
  });

  console.log("✅ New Ludo Socket.IO initialized");
}

module.exports = {
  initializeLudoSocket,
};
