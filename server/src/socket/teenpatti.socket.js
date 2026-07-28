"use strict";

const jwt = require("jsonwebtoken");

const teenPattiService = require("../services/teenpatti.service");

/* =========================================================
   SOCKET RUNTIME STATE
========================================================= */

const turnTimers = new Map();
const botTimers = new Map();
const sideShowTimers = new Map();
const nextHandTimers = new Map();
const disconnectTimers = new Map();
const matchmakingTimers = new Map();

const CARD_REVEAL_DURATION_MS = 2000;
const WINNER_OVERLAY_DURATION_MS = 4000;
const NEXT_ROUND_COUNTDOWN_MS = 5000;

const NEXT_HAND_DELAY_MS =
  CARD_REVEAL_DURATION_MS +
  WINNER_OVERLAY_DURATION_MS +
  NEXT_ROUND_COUNTDOWN_MS;

/* =========================================================
   AUTHENTICATION
========================================================= */

function socketAuthentication(socket, next) {
  try {
    const authorizationHeader = socket.handshake.headers?.authorization;

    const headerToken =
      typeof authorizationHeader === "string" &&
      authorizationHeader.startsWith("Bearer ")
        ? authorizationHeader.slice(7)
        : null;

    const token = socket.handshake.auth?.token || headerToken;

    if (!token) {
      const error = new Error("Authentication token is required.");

      error.data = {
        statusCode: 401,
        code: "SOCKET_TOKEN_REQUIRED",
      };

      return next(error);
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const userId = Number(decoded.id);

    if (!Number.isInteger(userId) || userId <= 0) {
      throw new Error("Invalid authenticated user.");
    }

    socket.user = {
      id: userId,
      uid: decoded.uid || null,
      role: decoded.role || "user",
    };

    return next();
  } catch (error) {
    console.error("TEEN PATTI SOCKET AUTH ERROR:", error.message);

    const socketError = new Error("Invalid or expired authentication token.");

    socketError.data = {
      statusCode: 401,
      code: "SOCKET_AUTH_FAILED",
    };

    return next(socketError);
  }
}

/* =========================================================
   VALUE HELPERS
========================================================= */

function parsePositiveInteger(value) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function getTableRoomName(tableId) {
  return `teenpatti:table:${tableId}`;
}

function getErrorPayload(error) {
  return {
    success: false,

    statusCode: Number(error?.status || error?.statusCode) || 500,

    code: error?.code || "TEEN_PATTI_SOCKET_ERROR",

    message: error?.message || "Teen Patti request failed.",
  };
}

function sendCallback(callback, payload) {
  if (typeof callback === "function") {
    callback(payload);
  }
}

function emitSocketError(socket, error, callback) {
  const payload = getErrorPayload(error);

  sendCallback(callback, payload);

  if (typeof callback !== "function") {
    socket.emit("table:error", payload);
  }
}

function resolveSocketTableId(socket, payload = {}) {
  const tableId = parsePositiveInteger(payload.tableId || socket.data.tableId);

  if (!tableId) {
    const error = new Error("Valid Teen Patti table ID is required.");

    error.statusCode = 400;
    error.code = "INVALID_TABLE_ID";

    throw error;
  }

  if (socket.data.tableId && Number(socket.data.tableId) !== tableId) {
    const error = new Error("Socket is not joined to this table.");

    error.statusCode = 403;
    error.code = "SOCKET_NOT_IN_TABLE";

    throw error;
  }

  return tableId;
}

/* =========================================================
   TIMER HELPERS
========================================================= */

function createTimerKey(tableId, suffix = "") {
  return `${tableId}:${suffix}`;
}

function clearTimerFromMap(timerMap, key) {
  const timer = timerMap.get(key);

  if (timer) {
    clearTimeout(timer);
    timerMap.delete(key);
  }
}

function clearTableGameTimers(tableId) {
  clearTimerFromMap(turnTimers, tableId);

  clearTimerFromMap(botTimers, tableId);

  clearTimerFromMap(sideShowTimers, tableId);

  clearTimerFromMap(nextHandTimers, tableId);
}

function clearDisconnectTimer(tableId, userId) {
  const key = createTimerKey(tableId, userId);

  clearTimerFromMap(disconnectTimers, key);
}

/* =========================================================
   SAFE STATE BROADCAST
========================================================= */

async function emitPrivateHandStates(namespace, tableId) {
  const roomName = getTableRoomName(tableId);

  const connectedSockets = await namespace.in(roomName).fetchSockets();

  await Promise.all(
    connectedSockets.map(async (connectedSocket) => {
      const connectedUserId = parsePositiveInteger(connectedSocket.user?.id);

      if (!connectedUserId) {
        return;
      }

      try {
        const handState = await teenPattiService.getTeenPattiHandState(
          tableId,
          connectedUserId,
        );

        connectedSocket.emit("hand:state", handState);
      } catch (error) {
        const ignorableCodes = [
          "NOT_TABLE_PLAYER",
          "NOT_HAND_PLAYER",
          "ACTIVE_SEAT_NOT_FOUND",
        ];

        if (!ignorableCodes.includes(error.code)) {
          console.error("TEEN PATTI PRIVATE STATE ERROR:", error);
        }
      }
    }),
  );
}

async function broadcastTableState(namespace, tableId) {
  const roomName = getTableRoomName(tableId);

  const tableState = await teenPattiService.getTableState(tableId);

  namespace.to(roomName).emit("table:state", tableState);

  return tableState;
}

async function broadcastAllStates(namespace, tableId) {
  const tableState = await broadcastTableState(namespace, tableId);

  await emitPrivateHandStates(namespace, tableId);

  return tableState;
}

/* =========================================================
   RUNTIME STATE AND SCHEDULER
========================================================= */

function getRemainingMilliseconds(dateValue, fallback = 0) {
  const timestamp = dateValue ? new Date(dateValue).getTime() : NaN;

  if (!Number.isFinite(timestamp)) {
    return Math.max(0, Number(fallback) || 0);
  }

  return Math.max(0, timestamp - Date.now());
}

function registerTimer(timerMap, key, delay, work) {
  clearTimerFromMap(timerMap, key);

  const safeDelay = Math.max(0, Number(delay) || 0);

  const timer = setTimeout(async () => {
    timerMap.delete(key);

    try {
      await work();
    } catch (error) {
      console.error("TEEN PATTI TIMER ERROR:", error);
    }
  }, safeDelay);

  /*
   * Runtime timer Node process বন্ধ হওয়া আটকাবে না।
   */
  if (typeof timer.unref === "function") {
    timer.unref();
  }

  timerMap.set(key, timer);

  return timer;
}

async function getConnectedTableUserId(namespace, tableId) {
  const roomName = getTableRoomName(tableId);

  const connectedSockets = await namespace.in(roomName).fetchSockets();

  for (const connectedSocket of connectedSockets) {
    const userId = parsePositiveInteger(connectedSocket.user?.id);

    if (userId) {
      return userId;
    }
  }

  return null;
}

async function getRuntimeHandState(namespace, tableId) {
  const roomName = getTableRoomName(tableId);

  const connectedSockets = await namespace.in(roomName).fetchSockets();

  for (const connectedSocket of connectedSockets) {
    const userId = parsePositiveInteger(connectedSocket.user?.id);

    if (!userId) {
      continue;
    }

    try {
      return await teenPattiService.getTeenPattiHandState(tableId, userId);
    } catch (error) {
      const ignorableCodes = ["NOT_TABLE_PLAYER", "NOT_HAND_PLAYER"];

      if (!ignorableCodes.includes(error.code)) {
        console.error("TEEN PATTI RUNTIME STATE ERROR:", error);
      }
    }
  }

  return null;
}

function emitPublicAction(namespace, tableId, eventName, payload) {
  namespace.to(getTableRoomName(tableId)).emit(eventName, payload);
}

async function scheduleTeenPattiMatchmaking(namespace, tableId, tableState) {
  const matchmaking = tableState?.matchmaking;

  if (!matchmaking?.isWaiting) {
    clearTimerFromMap(matchmakingTimers, tableId);

    return {
      scheduled: false,
      reason: "matchmaking_not_waiting",
    };
  }

  const remainingMilliseconds =
    getRemainingMilliseconds(matchmaking.expiresAt, 0) + 50;

  registerTimer(matchmakingTimers, tableId, remainingMilliseconds, async () => {
    const completionResult =
      await teenPattiService.completeTeenPattiMatchmaking(tableId);

    /*
     * Deadline এখনো শেষ না হলে service যে remaining time
     * দিয়েছে, সেই অনুযায়ী আবার timer schedule হবে।
     */
    if (completionResult?.completed !== true) {
      const refreshedTableState = await teenPattiService.getTableState(tableId);

      await broadcastTableState(namespace, tableId);

      await scheduleTeenPattiMatchmaking(
        namespace,
        tableId,
        refreshedTableState,
      );

      return;
    }

    emitPublicAction(namespace, tableId, "matchmaking:completed", {
      tableId,
      completed: true,
      botJoined: completionResult?.botJoined === true,
      joinedBot: completionResult?.joinedBot || null,
      tableState: completionResult?.tableState || null,
    });

    await broadcastAllStates(namespace, tableId);

    /*
     * Hand start করার জন্য table room-এর একজন
     * authenticated real user ব্যবহার হবে।
     */
    const requestingUserId = await getConnectedTableUserId(namespace, tableId);

    if (!requestingUserId) {
      /*
       * সবাই disconnect থাকলে matchmaking DB-তে completed থাকবে।
       * পরের reconnect-এর সময় synchronizeTableRuntime hand শুরু করবে।
       */
      return;
    }

    let startedHand = null;

    try {
      startedHand = await teenPattiService.startTeenPattiHand(
        tableId,
        requestingUserId,
      );
    } catch (error) {
      if (
        error.code !== "HAND_ALREADY_RUNNING" &&
        Number(error.statusCode || error.status) !== 409
      ) {
        throw error;
      }
    }

    if (startedHand) {
      emitPublicAction(namespace, tableId, "hand:started", {
        tableId,
        handId: startedHand?.handId || startedHand?.hand?.id || null,
        roundNumber:
          startedHand?.roundNumber || startedHand?.hand?.roundNumber || null,
        message: "Teen Patti hand started automatically.",
      });
    }

    await broadcastAllStates(namespace, tableId);

    await synchronizeTableRuntime(namespace, tableId);
  });

  return {
    scheduled: true,
    type: "matchmaking",
    remainingMilliseconds,
  };
}

async function synchronizeTableRuntime(namespace, tableId) {
  clearTableGameTimers(tableId);

  const tableState = await teenPattiService.getTableState(tableId);

  if (tableState?.matchmaking?.isWaiting === true) {
    return scheduleTeenPattiMatchmaking(namespace, tableId, tableState);
  }

  clearTimerFromMap(matchmakingTimers, tableId);

  const handState = await getRuntimeHandState(namespace, tableId);

  if (!handState || !handState.hand) {
    return {
      scheduled: false,
      reason: "no_runtime_hand",
    };
  }

  const hand = handState.hand;

  /*
   * ==========================================
   * COMPLETED → AUTO NEXT HAND
   * ==========================================
   */
  if (hand.status === "completed" && hand.settlementCompleted === true) {
    registerTimer(nextHandTimers, tableId, NEXT_HAND_DELAY_MS, async () => {
      const result = await teenPattiService.prepareNextTeenPattiHand(
        tableId,
        hand.handId,
      );

      emitPublicAction(namespace, tableId, "hand:next-round", result);

      await broadcastAllStates(namespace, tableId);

      if (result.handStarted === true) {
        emitPublicAction(namespace, tableId, "hand:started", {
          tableId,

          handId: result.startedHand.handId,

          roundNumber: result.startedHand.roundNumber,

          message: "New Teen Patti hand started.",
        });
      }

      await synchronizeTableRuntime(namespace, tableId);
    });

    return {
      scheduled: true,
      type: "next_hand",
    };
  }

  if (hand.status !== "playing") {
    return {
      scheduled: false,
      reason: "hand_not_playing",
    };
  }

  /*
   * ==========================================
   * PENDING SIDE SHOW
   * ==========================================
   */
  if (handState.sideShow) {
    const sideShow = handState.sideShow;

    const targetPlayer = handState.players.find(
      (player) =>
        Number(player.handPlayerId) === Number(sideShow.targetHandPlayerId),
    );

    /*
     * Target bot হলে প্রায় 1.2 seconds পরে
     * fair Accept/Reject করবে।
     */
    if (targetPlayer?.isBot === true) {
      registerTimer(botTimers, tableId, 1200, async () => {
        const result = await teenPattiService.respondTeenPattiBotSideShow(
          tableId,
          sideShow.requestId,
        );

        emitPublicAction(namespace, tableId, "side-show:resolved", result);

        await broadcastAllStates(namespace, tableId);

        await synchronizeTableRuntime(namespace, tableId);
      });
    }

    const expiryDelay =
      getRemainingMilliseconds(sideShow.expiresAt, 10000) + 50;

    registerTimer(sideShowTimers, tableId, expiryDelay, async () => {
      const result = await teenPattiService.expireTeenPattiSideShow(
        tableId,
        sideShow.requestId,
      );

      if (result.ignored !== true) {
        emitPublicAction(namespace, tableId, "side-show:expired", result);

        await broadcastAllStates(namespace, tableId);
      }

      await synchronizeTableRuntime(namespace, tableId);
    });

    return {
      scheduled: true,
      type: targetPlayer?.isBot ? "bot_side_show" : "real_side_show",
    };
  }

  const currentPlayer = handState.players.find(
    (player) =>
      Number(player.handPlayerId) === Number(hand.currentTurnHandPlayerId),
  );

  if (!currentPlayer) {
    return {
      scheduled: false,
      reason: "current_player_not_found",
    };
  }

  /*
   * ==========================================
   * BOT TURN
   * ==========================================
   */
  if (currentPlayer.isBot === true) {
    /*
     * প্রথম turn-এর actionStartedAt card distribution
     * শেষ হওয়ার সময় সেট করা হয়েছে।
     */
    const botTurnStartDelay = getRemainingMilliseconds(hand.actionStartedAt, 0);

    /*
     * Distribution শেষ হওয়ার ১.২ সেকেন্ড পরে
     * bot তার action নেবে।
     */
    const botActionDelay = botTurnStartDelay + 1200;

    registerTimer(botTimers, tableId, botActionDelay, async () => {
      const result = await teenPattiService.performTeenPattiBotAction(
        tableId,
        hand.handId,
        currentPlayer.handPlayerId,
      );

      if (result.ignored !== true) {
        emitPublicAction(namespace, tableId, "hand:action", result);

        if (result.handCompleted === true) {
          emitPublicAction(
            namespace,
            tableId,
            "hand:completed",
            result.settlement,
          );
        }

        await broadcastAllStates(namespace, tableId);
      }

      await synchronizeTableRuntime(namespace, tableId);
    });
  }

  /*
   * ==========================================
   * 15-SECOND TURN TIMEOUT
   * ==========================================
   */
  const timeoutDelay =
    getRemainingMilliseconds(hand.actionExpiresAt, 15000) + 50;

  registerTimer(turnTimers, tableId, timeoutDelay, async () => {
    const result = await teenPattiService.timeoutTeenPattiTurn(
      tableId,
      hand.handId,
    );

    if (result.ignored !== true) {
      emitPublicAction(namespace, tableId, "hand:timeout", result);

      if (result.handCompleted === true) {
        emitPublicAction(
          namespace,
          tableId,
          "hand:completed",
          result.settlement,
        );
      }

      await broadcastAllStates(namespace, tableId);
    }

    await synchronizeTableRuntime(namespace, tableId);
  });

  return {
    scheduled: true,

    type: currentPlayer.isBot ? "bot_turn" : "real_turn",

    handId: hand.handId,

    currentTurnHandPlayerId: currentPlayer.handPlayerId,
  };
}

/* =========================================================
   SOCKET INITIALIZATION
========================================================= */

function initializeTeenPattiSocket(io) {
  const namespace = io.of("/teenpatti");

  namespace.use(socketAuthentication);

  namespace.on("connection", (socket) => {
    console.log(`✅ Teen Patti socket connected: User ${socket.user.id}`);

    socket.data.tableId = null;
    socket.data.tableRoom = null;
    socket.data.explicitLeave = false;

    /* =====================================================
         JOIN / RECONNECT TABLE
      ===================================================== */

    socket.on("table:join", async (payload = {}, callback) => {
      try {
        const tableId = parsePositiveInteger(payload.tableId);

        if (!tableId) {
          const error = new Error("Valid Teen Patti table ID is required.");

          error.statusCode = 400;
          error.code = "INVALID_TABLE_ID";

          throw error;
        }

        const reconnectResult = await teenPattiService.reconnectTeenPattiPlayer(
          tableId,
          socket.user.id,
        );

        /*
         * Player ২০ সেকেন্ডের মধ্যে reconnect করলে
         * pending disconnect-forfeit timer বন্ধ হবে।
         */
        const disconnectTimerKey = `${tableId}:${socket.user.id}`;

        const existingDisconnectTimer =
          disconnectTimers.get(disconnectTimerKey);

        if (existingDisconnectTimer) {
          clearTimeout(existingDisconnectTimer);
          disconnectTimers.delete(disconnectTimerKey);
        }

        clearDisconnectTimer(tableId, socket.user.id);

        const roomName = getTableRoomName(tableId);

        if (socket.data.tableRoom && socket.data.tableRoom !== roomName) {
          await socket.leave(socket.data.tableRoom);
        }

        await socket.join(roomName);

        socket.data.tableId = tableId;

        socket.data.tableRoom = roomName;

        socket.data.explicitLeave = false;

        socket.emit("table:joined", {
          success: true,
          tableId,
          userId: socket.user.id,
        });

        await broadcastAllStates(namespace, tableId);

        await synchronizeTableRuntime(namespace, tableId);

        socket.to(roomName).emit("table:player-connected", {
          tableId,
          userId: socket.user.id,
        });

        sendCallback(callback, {
          success: true,

          message: "Teen Patti table joined successfully.",

          data: reconnectResult,
        });
      } catch (error) {
        console.error("TEEN PATTI TABLE JOIN ERROR:", error);

        emitSocketError(socket, error, callback);
      }
    });

    /* =====================================================
         GET TABLE STATE
      ===================================================== */

    socket.on("table:get-state", async (payload = {}, callback) => {
      try {
        const tableId = resolveSocketTableId(socket, payload);

        const tableState = await teenPattiService.getTableState(tableId);

        socket.emit("table:state", tableState);

        sendCallback(callback, {
          success: true,
          data: tableState,
        });
      } catch (error) {
        emitSocketError(socket, error, callback);
      }
    });

    /* =====================================================
         GET PRIVATE HAND STATE
      ===================================================== */

    socket.on("hand:get-state", async (payload = {}, callback) => {
      try {
        const tableId = resolveSocketTableId(socket, payload);

        const handState = await teenPattiService.getTeenPattiHandState(
          tableId,
          socket.user.id,
        );

        socket.emit("hand:state", handState);

        sendCallback(callback, {
          success: true,
          data: handState,
        });
      } catch (error) {
        emitSocketError(socket, error, callback);
      }
    });

    /* =========================================================
       START HAND
    ========================================================= */

    socket.on("hand:start", async (payload = {}, callback) => {
      try {
        const tableId = resolveSocketTableId(socket, payload);

        const tableState = await teenPattiService.getTableState(tableId);

        /*
         * Matchmaking শেষ হওয়ার আগে hand শুরু করা যাবে না।
         * Runtime timer চালু বা refresh করে waiting response পাঠাবে।
         */
        if (tableState?.matchmaking?.isWaiting === true) {
          const scheduleResult = await scheduleTeenPattiMatchmaking(
            namespace,
            tableId,
            tableState,
          );

          sendCallback(callback, {
            success: true,
            waiting: true,
            matchmakingCompleted: false,

            message: "Waiting for Teen Patti players.",

            data: {
              tableId,
              matchmaking: tableState.matchmaking,
              schedule: scheduleResult,
            },
          });

          return;
        }

        clearTimerFromMap(matchmakingTimers, tableId);

        let result = null;
        let alreadyRunning = false;

        try {
          result = await teenPattiService.startTeenPattiHand(
            tableId,
            socket.user.id,
          );
        } catch (error) {
          /*
           * শুধু running hand idempotent হিসেবে গ্রহণ করা হবে।
           * অন্য 409 error আর লুকানো হবে না।
           */
          if (error.code === "HAND_ALREADY_RUNNING") {
            alreadyRunning = true;
          } else {
            throw error;
          }
        }

        /*
         * নতুন hand সত্যিই শুরু হলেই hand:started emit হবে।
         */
        if (result) {
          emitPublicAction(namespace, tableId, "hand:started", {
            tableId,

            handId: result?.handId || result?.hand?.id || null,

            roundNumber:
              result?.roundNumber || result?.hand?.roundNumber || null,

            message: "Teen Patti hand started successfully.",
          });
        }

        await broadcastAllStates(namespace, tableId);

        await synchronizeTableRuntime(namespace, tableId);

        sendCallback(callback, {
          success: true,
          waiting: false,
          matchmakingCompleted: true,
          alreadyRunning,

          message: result
            ? "Teen Patti hand started successfully."
            : "Teen Patti hand is already running.",

          data: result,
        });
      } catch (error) {
        console.error("TEEN PATTI START HAND ERROR:", error);

        emitSocketError(socket, error, callback);
      }
    });

    /* =========================================================
       SEE PRIVATE CARDS
    ========================================================= */

    socket.on("hand:see-cards", async (payload = {}, callback) => {
      try {
        const tableId = resolveSocketTableId(socket, payload);

        const result = await teenPattiService.seeTeenPattiCards(
          tableId,
          socket.user.id,
        );

        /*
         * Private cards শুধু এই socket-এ যাবে।
         */
        socket.emit("hand:cards-seen", {
          tableId,
          cards: result?.cards || result?.myCards || [],
          handPlayerId: result?.handPlayerId || result?.myHandPlayerId || null,
        });

        /*
         * অন্য player শুধু জানবে player Seen হয়েছে।
         * তার cards পাবে না।
         */
        await emitPublicAction(namespace, tableId, "hand:action", {
          tableId,
          userId: socket.user.id,
          action: "seen",
        });

        await broadcastAllStates(namespace, tableId);
        await synchronizeTableRuntime(namespace, tableId);

        if (typeof callback === "function") {
          callback({
            success: true,
            message: "Cards seen successfully.",
            data: result,
          });
        }
      } catch (error) {
        console.error("TEEN PATTI SEE CARDS ERROR:", error);

        const response = {
          success: false,
          statusCode: Number(error.statusCode || error.status) || 500,
          code: error.code || "SEE_CARDS_FAILED",
          message: error.message || "Failed to see cards.",
        };

        if (typeof callback === "function") {
          callback(response);
        } else {
          socket.emit("table:error", response);
        }
      }
    });

    /* =========================================================
       BLIND / CHAAL / RAISE
    ========================================================= */

    socket.on("hand:bet", async (payload = {}, callback) => {
      try {
        const tableId = resolveSocketTableId(socket, payload);

        const action = String(payload.action || "")
          .trim()
          .toLowerCase();

        if (!["blind", "chaal", "raise"].includes(action)) {
          const invalidActionError = new Error(
            "Action must be blind, chaal or raise.",
          );

          invalidActionError.statusCode = 400;
          invalidActionError.code = "INVALID_BET_ACTION";

          throw invalidActionError;
        }

        const result = await teenPattiService.performTeenPattiBetAction(
          tableId,
          socket.user.id,
          action,
        );

        await emitPublicAction(namespace, tableId, "hand:action", {
          tableId,
          userId: socket.user.id,
          action,
          contributionAmount: result?.contributionAmount || result?.amount || 0,
          potAmount: result?.potAmount || null,
          currentBet: result?.currentBet || null,
        });

        await broadcastAllStates(namespace, tableId);
        await synchronizeTableRuntime(namespace, tableId);

        if (typeof callback === "function") {
          callback({
            success: true,
            message: `Teen Patti ${action} successful.`,
            data: result,
          });
        }
      } catch (error) {
        console.error("TEEN PATTI BET ACTION ERROR:", error);

        const response = {
          success: false,
          statusCode: Number(error.statusCode || error.status) || 500,
          code: error.code || "BET_ACTION_FAILED",
          message: error.message || "Teen Patti action failed.",
        };

        if (typeof callback === "function") {
          callback(response);
        } else {
          socket.emit("table:error", response);
        }
      }
    });

    /* =========================================================
       PACK
    ========================================================= */

    socket.on("hand:pack", async (payload = {}, callback) => {
      try {
        const tableId = resolveSocketTableId(socket, payload);

        const result = await teenPattiService.packTeenPattiHand(
          tableId,
          socket.user.id,
        );

        await emitPublicAction(namespace, tableId, "hand:action", {
          tableId,
          userId: socket.user.id,
          action: "pack",
        });

        if (result?.settlementCompleted || result?.handCompleted) {
          await emitPublicAction(namespace, tableId, "hand:completed", {
            tableId,
            settlement: result?.settlement || result,
          });
        }

        await broadcastAllStates(namespace, tableId);
        await synchronizeTableRuntime(namespace, tableId);

        if (typeof callback === "function") {
          callback({
            success: true,
            message: "Teen Patti hand packed successfully.",
            data: result,
          });
        }
      } catch (error) {
        console.error("TEEN PATTI PACK ERROR:", error);

        const response = {
          success: false,
          statusCode: Number(error.statusCode || error.status) || 500,
          code: error.code || "PACK_FAILED",
          message: error.message || "Failed to pack Teen Patti hand.",
        };

        if (typeof callback === "function") {
          callback(response);
        } else {
          socket.emit("table:error", response);
        }
      }
    });

    /* =========================================================
       SHOW — ONLY TWO ACTIVE PLAYERS
    ========================================================= */

    socket.on("hand:show", async (payload = {}, callback) => {
      try {
        const tableId = resolveSocketTableId(socket, payload);

        const result = await teenPattiService.showTeenPattiHand(
          tableId,
          socket.user.id,
        );

        await emitPublicAction(namespace, tableId, "hand:action", {
          tableId,
          userId: socket.user.id,
          action: "show",
        });

        await emitPublicAction(namespace, tableId, "hand:completed", {
          tableId,
          reason: "show",
          settlement: result?.settlement || result,
        });

        /*
         * Completed state পাঠানোর সময় server service
         * active এবং winner player-এর cards reveal করবে।
         */
        await broadcastAllStates(namespace, tableId);
        await synchronizeTableRuntime(namespace, tableId);

        if (typeof callback === "function") {
          callback({
            success: true,
            message: "Teen Patti show completed successfully.",
            data: result,
          });
        }
      } catch (error) {
        console.error("TEEN PATTI SHOW ERROR:", error);

        const response = {
          success: false,
          statusCode: Number(error.statusCode || error.status) || 500,
          code: error.code || "SHOW_FAILED",
          message: error.message || "Teen Patti show failed.",
        };

        if (typeof callback === "function") {
          callback(response);
        } else {
          socket.emit("table:error", response);
        }
      }
    });

    /* =========================================================
       SIDE SHOW REQUEST
    ========================================================= */

    socket.on("side-show:request", async (payload = {}, callback) => {
      try {
        const tableId = resolveSocketTableId(socket, payload);

        const result = await teenPattiService.requestTeenPattiSideShow(
          tableId,
          socket.user.id,
        );

        await emitPublicAction(namespace, tableId, "side-show:requested", {
          tableId,
          requestId:
            result?.requestId ||
            result?.sideShowRequestId ||
            result?.request?.id ||
            null,

          requesterHandPlayerId:
            result?.requesterHandPlayerId ||
            result?.request?.requesterHandPlayerId ||
            null,

          targetHandPlayerId:
            result?.targetHandPlayerId ||
            result?.request?.targetHandPlayerId ||
            null,

          expiresAt: result?.expiresAt || result?.request?.expiresAt || null,
        });

        await broadcastAllStates(namespace, tableId);
        await synchronizeTableRuntime(namespace, tableId);

        if (typeof callback === "function") {
          callback({
            success: true,
            message: "Side Show request sent successfully.",
            data: result,
          });
        }
      } catch (error) {
        console.error("TEEN PATTI SIDE SHOW REQUEST ERROR:", error);

        const response = {
          success: false,
          statusCode: Number(error.statusCode || error.status) || 500,
          code: error.code || "SIDE_SHOW_REQUEST_FAILED",
          message: error.message || "Failed to request Side Show.",
        };

        if (typeof callback === "function") {
          callback(response);
        } else {
          socket.emit("table:error", response);
        }
      }
    });

    /* =========================================================
       SIDE SHOW ACCEPT / REJECT
    ========================================================= */

    socket.on("side-show:respond", async (payload = {}, callback) => {
      try {
        const tableId = resolveSocketTableId(socket, payload);

        const requestId = Number(payload.requestId);

        if (!Number.isInteger(requestId) || requestId <= 0) {
          const invalidRequestError = new Error(
            "Valid Side Show request ID is required.",
          );

          invalidRequestError.statusCode = 400;
          invalidRequestError.code = "INVALID_SIDE_SHOW_REQUEST_ID";

          throw invalidRequestError;
        }

        const decision = String(payload.decision || payload.response || "")
          .trim()
          .toLowerCase();

        if (!["accepted", "rejected"].includes(decision)) {
          const invalidDecisionError = new Error(
            "Side Show decision must be accepted or rejected.",
          );

          invalidDecisionError.statusCode = 400;
          invalidDecisionError.code = "INVALID_SIDE_SHOW_DECISION";

          throw invalidDecisionError;
        }

        const result = await teenPattiService.respondTeenPattiSideShow(
          tableId,
          socket.user.id,
          requestId,
          decision,
        );

        await emitPublicAction(namespace, tableId, "side-show:responded", {
          tableId,
          requestId,
          decision,

          packedHandPlayerId: result?.packedHandPlayerId || null,

          winnerHandPlayerId: result?.winnerHandPlayerId || null,
        });

        if (result?.settlementCompleted || result?.handCompleted) {
          await emitPublicAction(namespace, tableId, "hand:completed", {
            tableId,
            reason: "side_show",
            settlement: result?.settlement || result,
          });
        }

        await broadcastAllStates(namespace, tableId);
        await synchronizeTableRuntime(namespace, tableId);

        if (typeof callback === "function") {
          callback({
            success: true,
            message:
              decision === "accepted"
                ? "Side Show accepted successfully."
                : "Side Show rejected successfully.",
            data: result,
          });
        }
      } catch (error) {
        console.error("TEEN PATTI SIDE SHOW RESPONSE ERROR:", error);

        const response = {
          success: false,
          statusCode: Number(error.statusCode || error.status) || 500,
          code: error.code || "SIDE_SHOW_RESPONSE_FAILED",
          message: error.message || "Failed to respond to Side Show request.",
        };

        if (typeof callback === "function") {
          callback(response);
        } else {
          socket.emit("table:error", response);
        }
      }
    });

    /* =====================================================
         EXPLICIT EXIT
      ===================================================== */

    socket.on("table:leave", async (payload = {}, callback) => {
      try {
        const tableId = resolveSocketTableId(socket, payload);

        socket.data.explicitLeave = true;

        clearDisconnectTimer(tableId, socket.user.id);

        const leaveResult = await teenPattiService.leaveTeenPattiTable(
          tableId,
          socket.user.id,
        );

        const roomName = getTableRoomName(tableId);

        namespace.to(roomName).emit("table:player-left", {
          tableId,
          userId: socket.user.id,

          result: leaveResult,
        });

        await broadcastAllStates(namespace, tableId);

        await socket.leave(roomName);

        socket.data.tableId = null;

        socket.data.tableRoom = null;

        sendCallback(callback, {
          success: true,

          message: "Teen Patti table left successfully.",

          data: leaveResult,
        });
      } catch (error) {
        socket.data.explicitLeave = false;

        emitSocketError(socket, error, callback);
      }
    });

    /* =====================================================
         DISCONNECT MARK
      ===================================================== */

    /* =========================================================
       DISCONNECT + 20 SECOND RECONNECT GRACE
    ========================================================= */

    socket.on("disconnect", async (reason) => {
      const tableId = Number(socket.data.tableId);
      const userId = Number(socket.user?.id);

      if (
        !Number.isInteger(tableId) ||
        tableId <= 0 ||
        !Number.isInteger(userId) ||
        userId <= 0
      ) {
        return;
      }

      console.log(
        `Teen Patti socket disconnected: user=${userId}, table=${tableId}, reason=${reason}`,
      );

      try {
        const result = await teenPattiService.markTeenPattiDisconnected(
          tableId,
          userId,
        );

        /*
         * Player ইতোমধ্যে explicit Exit করলে
         * reconnect-forfeit timer লাগবে না।
         */
        if (
          result?.alreadyLeft ||
          result?.playerStatus === "left" ||
          result?.status === "left"
        ) {
          return;
        }

        const disconnectedAt =
          result?.disconnectedAt || new Date().toISOString();

        const graceSeconds = Math.max(
          1,
          Number(result?.reconnectGraceSeconds) || 20,
        );

        const disconnectTimerKey = `${tableId}:${userId}`;

        /*
         * একই user-এর আগের timer থাকলে বন্ধ করবে।
         */
        const previousTimer = disconnectTimers.get(disconnectTimerKey);

        if (previousTimer) {
          clearTimeout(previousTimer);
          disconnectTimers.delete(disconnectTimerKey);
        }

        namespace
          .to(getTableRoomName(tableId))
          .emit("table:player-disconnected", {
            tableId,
            userId,
            disconnectedAt,
            reconnectGraceSeconds: graceSeconds,
          });

        await broadcastAllStates(namespace, tableId);

        const disconnectTimer = setTimeout(async () => {
          disconnectTimers.delete(disconnectTimerKey);

          try {
            /*
             * disconnectedAt service-এ পাঠানো হচ্ছে।
             * পুরোনো timer যেন নতুন connection-কে
             * ভুল করে forfeit না করতে পারে।
             */
            const forfeitResult =
              await teenPattiService.forfeitDisconnectedTeenPattiPlayer(
                tableId,
                userId,
                disconnectedAt,
              );

            if (forfeitResult?.skipped || forfeitResult?.reconnected) {
              return;
            }

            await emitPublicAction(
              namespace,
              tableId,
              "table:player-forfeited",
              {
                tableId,
                userId,
                reason: "disconnect_timeout",
              },
            );

            if (
              forfeitResult?.settlementCompleted ||
              forfeitResult?.handCompleted
            ) {
              await emitPublicAction(namespace, tableId, "hand:completed", {
                tableId,
                reason: "disconnect_forfeit",
                settlement: forfeitResult?.settlement || forfeitResult,
              });
            }

            await broadcastAllStates(namespace, tableId);
            await synchronizeTableRuntime(namespace, tableId);
          } catch (forfeitError) {
            /*
             * Player reconnect করলে service stale timer
             * reject করতে পারে—এটি server crash নয়।
             */
            if (
              forfeitError.code === "PLAYER_ALREADY_RECONNECTED" ||
              forfeitError.code === "STALE_DISCONNECT_FORFEIT"
            ) {
              return;
            }

            console.error("TEEN PATTI DISCONNECT FORFEIT ERROR:", forfeitError);
          }
        }, graceSeconds * 1000);

        disconnectTimers.set(disconnectTimerKey, disconnectTimer);
      } catch (error) {
        console.error("TEEN PATTI DISCONNECT HANDLER ERROR:", error);
      }
    });
  }); // namespace connection বন্ধ

  console.log("✅ New Teen Patti Socket.IO initialized");
}

module.exports = {
  initializeTeenPattiSocket,
};
