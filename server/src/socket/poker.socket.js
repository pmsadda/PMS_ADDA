"use strict";

const jwt = require("jsonwebtoken");

const pokerService = require("../services/poker.service");

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

function parsePositiveInteger(value) {
  const number = Number(value);

  return Number.isInteger(number) && number > 0 ? number : null;
}

function getRoomName(tableId) {
  return `poker:table:${tableId}`;
}

function sendCallback(callback, payload) {
  if (typeof callback === "function") {
    callback(payload);
  }
}

function getErrorStatus(error) {
  return Number(error?.statusCode || error?.status || 500);
}

function initializePokerSocket(io) {
  const namespace = io.of("/poker");

  namespace.use(authenticateSocket);

  const matchmakingTimers = new Map();
  const pokerTurnTimers = new Map();
  const nextHandTimers = new Map();

  function validatePlayer(state, userId) {
    const player = state.players.find(
      (item) => !item.isBot && Number(item.userId) === Number(userId),
    );

    if (!player) {
      const error = new Error("You are not a player of this Poker table.");

      error.statusCode = 403;

      throw error;
    }

    return player;
  }

  function scheduleMatchmaking(state) {
    const tableId = parsePositiveInteger(state?.table?.id);

    if (
      !tableId ||
      state.table.status !== "waiting" ||
      matchmakingTimers.has(tableId)
    ) {
      return;
    }

    const rawExpiresAt = String(state.table.matchmakingExpiresAt || "");

    const normalizedExpiresAt = rawExpiresAt.includes("T")
      ? rawExpiresAt
      : rawExpiresAt.replace(" ", "T");

    const expiresAt = new Date(normalizedExpiresAt).getTime();

    const delay = Number.isFinite(expiresAt)
      ? Math.max(expiresAt - Date.now(), 0)
      : pokerService.MATCHMAKING_WAIT_SECONDS * 1000;

    const timer = setTimeout(async () => {
      matchmakingTimers.delete(tableId);

      try {
        const finalState = await pokerService.finalizeMatchmaking(tableId);

        const roomName = getRoomName(tableId);

        namespace.to(roomName).emit("matchmaking:completed", {
          table: finalState.table,

          players: finalState.players,

          botJoined: finalState.botJoined,
        });

        /*
         * প্রত্যেক real player আলাদা secure state পাবে।
         * এতে শুধু নিজের hole cards দেখা যাবে।
         */
        await emitPersonalizedTableState(tableId);

        await schedulePokerTurn(tableId);
      } catch (error) {
        console.error("POKER MATCHMAKING FINALIZE ERROR:", error);

        namespace.to(getRoomName(tableId)).emit("table:error", {
          statusCode: getErrorStatus(error),

          message: error.message || "Poker matchmaking failed.",
        });
      }
    }, delay);

    matchmakingTimers.set(tableId, timer);
  }

  async function recoverStartingHand(state) {
    const tableId = parsePositiveInteger(state?.table?.id);

    const needsRecovery =
      tableId &&
      state?.table?.status === "starting" &&
      Number(state?.table?.currentHandNumber || 0) === 0;

    if (!needsRecovery) {
      return state;
    }

    console.log(`🃏 Recovering Poker first hand: Table ${tableId}`);

    return pokerService.finalizeMatchmaking(tableId);
  }

  async function emitPersonalizedTableState(tableId) {
    const roomName = getRoomName(tableId);

    const connectedSockets = await namespace.in(roomName).fetchSockets();

    await Promise.all(
      connectedSockets.map(async (connectedSocket) => {
        try {
          const userId = Number(connectedSocket.user?.id);

          if (!userId) {
            return;
          }

          const personalizedState = await pokerService.getTableGameState(
            tableId,
            userId,
          );

          connectedSocket.emit("table:state", personalizedState);
        } catch (error) {
          console.error("POKER PERSONALIZED STATE ERROR:", error);
        }
      }),
    );
  }

  function clearPokerTurnTimer(tableId) {
    const validTableId = parsePositiveInteger(tableId);

    if (!validTableId) {
      return;
    }

    const timer = pokerTurnTimers.get(validTableId);

    if (timer) {
      clearTimeout(timer);

      pokerTurnTimers.delete(validTableId);
    }
  }

  function clearNextHandTimer(tableId) {
    const validTableId = parsePositiveInteger(tableId);

    if (!validTableId) {
      return;
    }

    const timer = nextHandTimers.get(validTableId);

    if (timer) {
      clearTimeout(timer);

      nextHandTimers.delete(validTableId);
    }
  }

  function scheduleNextPokerHand(tableId, delay = 5000) {
    const validTableId = parsePositiveInteger(tableId);

    if (!validTableId) {
      return;
    }

    clearNextHandTimer(validTableId);

    const timer = setTimeout(
      async () => {
        nextHandTimers.delete(validTableId);

        try {
          const handResult =
            await pokerService.startNextPokerHand(validTableId);

          if (handResult?.skipped) {
            console.log(`🃏 Next Poker hand skipped: ${handResult.reason}`);

            await emitPersonalizedTableState(validTableId);

            return;
          }

          const handStartedEvent = {
            tableId: validTableId,

            handId: handResult.handId,

            handNumber: handResult.handNumber,

            dealerPlayerId: handResult.dealerPlayerId,

            smallBlindPlayerId: handResult.smallBlindPlayerId,

            bigBlindPlayerId: handResult.bigBlindPlayerId,

            currentTurnPlayerId: handResult.currentTurnPlayerId,

            potAmount: handResult.potAmount,

            currentBet: handResult.currentBet,
          };

          namespace
            .to(getRoomName(validTableId))
            .emit("hand:started", handStartedEvent);

          await emitPersonalizedTableState(validTableId);

          await schedulePokerTurn(validTableId);
        } catch (error) {
          console.error("POKER NEXT HAND ERROR:", error);

          namespace.to(getRoomName(validTableId)).emit("table:error", {
            statusCode: getErrorStatus(error),

            message: error.message || "Unable to start the next Poker hand.",
          });
        }
      },
      Math.max(Number(delay) || 5000, 1000),
    );

    nextHandTimers.set(validTableId, timer);
  }

  function createPublicAction(actionResult) {
    const publicDealtStreets = Array.isArray(actionResult.dealtStreets)
      ? actionResult.dealtStreets.map((street) => ({
          street: street.street,

          cards: Array.isArray(street.cards) ? street.cards : [],
        }))
      : [];

    return {
      tableId: actionResult.tableId,

      handId: actionResult.handId,

      handNumber: actionResult.handNumber,

      action: actionResult.action,

      actionSequence: actionResult.actionSequence,

      actorTablePlayerId: actionResult.actorTablePlayerId,

      contribution: actionResult.contribution,

      stackBefore: actionResult.stackBefore,

      stackAfter: actionResult.stackAfter,

      roundBetAfter: actionResult.roundBetAfter,

      potAmount: actionResult.potAmount,

      currentBet: actionResult.currentBet,

      minimumRaise: actionResult.minimumRaise,

      nextTurnPlayerId: actionResult.nextTurnPlayerId,

      bettingRound: actionResult.bettingRound,

      bettingRoundComplete: actionResult.bettingRoundComplete,

      communityCards: actionResult.communityCards,

      dealtStreets: publicDealtStreets,

      handNeedsShowdown: actionResult.handNeedsShowdown,

      automatic: Boolean(actionResult.automatic),

      automaticReason: actionResult.automaticReason || null,

      actorIsBot: Boolean(actionResult.actorIsBot),
    };
  }

  async function settleAndPublishPokerHand(tableId, actionResult) {
    if (!actionResult?.handNeedsShowdown) {
      return null;
    }

    clearPokerTurnTimer(tableId);

    const settlement = await pokerService.settlePokerHand(tableId);

    if (settlement?.alreadySettled) {
      return settlement;
    }

    const publicSettlement = {
      tableId: settlement.tableId,

      handId: settlement.handId,

      handNumber: settlement.handNumber,

      communityCards: settlement.communityCards,

      grossAmount: settlement.grossAmount,

      serviceChargeAmount: settlement.serviceChargeAmount,

      distributableAmount: settlement.distributableAmount,

      winners: Array.isArray(settlement.winners)
        ? settlement.winners.map((winner) => ({
            handPlayerId: winner.handPlayerId,

            tablePlayerId: winner.tablePlayerId,

            seatNo: winner.seatNo,

            isBot: winner.isBot,

            handRankName: winner.handRankName,

            /*
             * সবাই fold করলে winner-এর
             * cards reveal হবে না।
             */
            holeCards:
              winner.handRankName === "Won by Fold" ? [] : winner.holeCards,

            prizeAmount: winner.prizeAmount,
          }))
        : [],

      pots: settlement.pots,
    };

    namespace.to(getRoomName(tableId)).emit("hand:completed", publicSettlement);

    scheduleNextPokerHand(tableId, 5000);

    return publicSettlement;
  }

  async function publishPokerAction(tableId, actionResult) {
    const publicAction = createPublicAction(actionResult);

    namespace.to(getRoomName(tableId)).emit("hand:action", publicAction);

    const settlement = await settleAndPublishPokerHand(tableId, actionResult);

    await emitPersonalizedTableState(tableId);

    return {
      publicAction,
      settlement,
    };
  }

  async function schedulePokerTurn(tableId) {
    const validTableId = parsePositiveInteger(tableId);

    if (!validTableId) {
      return;
    }

    clearPokerTurnTimer(validTableId);

    const turn = await pokerService.getCurrentPokerTurn(validTableId);

    if (!turn) {
      return;
    }

    let delay;

    if (turn.isBot) {
      /*
       * Bot যেন instant action না নেয়।
       * Natural 1.2–2 second delay।
       */
      delay = 1200 + Math.floor(Math.random() * 801);
    } else {
      const expiresAt = new Date(turn.actionExpiresAt).getTime();

      delay = Number.isFinite(expiresAt)
        ? Math.max(expiresAt - Date.now(), 0)
        : 15000;
    }

    const expectedHandId = Number(turn.handId);

    const expectedTablePlayerId = Number(turn.tablePlayerId);

    const timer = setTimeout(async () => {
      pokerTurnTimers.delete(validTableId);

      try {
        const result = await pokerService.performAutomaticTurn(validTableId, {
          requireExpired: !turn.isBot,

          expectedHandId,

          expectedTablePlayerId,
        });

        if (result?.skipped) {
          return;
        }

        await publishPokerAction(validTableId, result);

        await schedulePokerTurn(validTableId);
      } catch (error) {
        /*
         * পুরোনো timer fire করলে 409 আসতে পারে।
         * এটি server crash করাবে না।
         */
        if (getErrorStatus(error) !== 409) {
          console.error("POKER AUTOMATIC TURN ERROR:", error);
        }
      }
    }, delay);

    pokerTurnTimers.set(validTableId, timer);
  }

  namespace.on("connection", (socket) => {
    console.log(`🃏 Poker connected: User ${socket.user.id}`);

    socket.on("table:join", async (payload = {}, callback) => {
      try {
        const tableId = parsePositiveInteger(payload.tableId);

        if (!tableId) {
          throw Object.assign(new Error("Valid Poker table ID is required."), {
            statusCode: 400,
          });
        }

        let state = await pokerService.getTableState(tableId);

        state = await recoverStartingHand(state);

        state = await pokerService.getTableGameState(tableId, socket.user.id);

        if (state?.hand?.status === "showdown") {
          await pokerService.settlePokerHand(tableId);

          scheduleNextPokerHand(tableId, 5000);

          state = await pokerService.getTableGameState(tableId, socket.user.id);
        }

        /*
         * Server restart বা পুরোনো completed hand হলে
         * page join করার পর next hand schedule হবে।
         */
        if (state?.hand?.status === "completed") {
          scheduleNextPokerHand(tableId, 5000);
        }

        const player = validatePlayer(state, socket.user.id);

        const roomName = getRoomName(tableId);

        if (socket.data.roomName && socket.data.roomName !== roomName) {
          await socket.leave(socket.data.roomName);
        }

        await socket.join(roomName);

        socket.data.tableId = tableId;

        socket.data.roomName = roomName;

        socket.data.tablePlayerId = Number(player.id);

        socket.emit("table:state", state);

        socket.to(roomName).emit("table:player-joined", {
          tableId,

          userId: socket.user.id,

          tablePlayerId: Number(player.id),
        });

        sendCallback(callback, {
          success: true,

          data: {
            tableId,

            tablePlayerId: Number(player.id),
          },
        });

        scheduleMatchmaking(state);

        await schedulePokerTurn(tableId);
      } catch (error) {
        console.error("POKER TABLE JOIN ERROR:", error);

        sendCallback(callback, {
          success: false,

          statusCode: getErrorStatus(error),

          message: error.message || "Unable to join Poker table.",
        });
      }
    });

    socket.on("hand:action", async (payload = {}, callback) => {
      try {
        const tableId = parsePositiveInteger(
          payload.tableId || socket.data.tableId,
        );

        if (!tableId) {
          throw Object.assign(new Error("Valid Poker table ID is required."), {
            statusCode: 400,
          });
        }

        if (Number(socket.data.tableId) !== tableId) {
          throw Object.assign(
            new Error("Join the Poker table before taking an action."),
            {
              statusCode: 403,
            },
          );
        }

        const actionResult = await pokerService.performPlayerAction({
          tableId,

          userId: socket.user.id,

          actionType: payload.action,

          amount: payload.amount,

          isAutomatic: false,
        });

        /*
         * Burned cards কখনো client-এ যাবে না।
         */
        const publicDealtStreets = Array.isArray(actionResult.dealtStreets)
          ? actionResult.dealtStreets.map((street) => ({
              street: street.street,

              cards: Array.isArray(street.cards) ? street.cards : [],
            }))
          : [];

        const publicAction = {
          tableId: actionResult.tableId,

          handId: actionResult.handId,

          handNumber: actionResult.handNumber,

          action: actionResult.action,

          actionSequence: actionResult.actionSequence,

          actorTablePlayerId: actionResult.actorTablePlayerId,

          contribution: actionResult.contribution,

          stackBefore: actionResult.stackBefore,

          stackAfter: actionResult.stackAfter,

          roundBetAfter: actionResult.roundBetAfter,

          potAmount: actionResult.potAmount,

          currentBet: actionResult.currentBet,

          minimumRaise: actionResult.minimumRaise,

          nextTurnPlayerId: actionResult.nextTurnPlayerId,

          bettingRound: actionResult.bettingRound,

          bettingRoundComplete: actionResult.bettingRoundComplete,

          communityCards: actionResult.communityCards,

          dealtStreets: publicDealtStreets,

          handNeedsShowdown: actionResult.handNeedsShowdown,
        };

        namespace.to(getRoomName(tableId)).emit("hand:action", publicAction);

        await settleAndPublishPokerHand(tableId, actionResult);

        await emitPersonalizedTableState(tableId);

        if (!actionResult.handNeedsShowdown) {
          await schedulePokerTurn(tableId);
        }

        sendCallback(callback, {
          success: true,

          data: publicAction,
        });
      } catch (error) {
        console.error("POKER HAND ACTION ERROR:", error);

        sendCallback(callback, {
          success: false,

          statusCode: getErrorStatus(error),

          message: error.message || "Poker action failed.",
        });
      }
    });

    socket.on("table:exit", async (payload = {}, callback) => {
      try {
        const tableId = parsePositiveInteger(
          payload.tableId || socket.data.tableId,
        );

        if (!tableId) {
          throw Object.assign(new Error("Valid Poker table ID is required."), {
            statusCode: 400,
          });
        }

        if (Number(socket.data.tableId) !== tableId) {
          throw Object.assign(
            new Error("You are not connected to this Poker table."),
            {
              statusCode: 403,
            },
          );
        }

        clearPokerTurnTimer(tableId);

        clearNextHandTimer(tableId);

        const exitResult = await pokerService.exitPokerTable(
          tableId,
          socket.user.id,
        );

        if (exitResult.exitAction) {
          await publishPokerAction(tableId, exitResult.exitAction);
        } else {
          await emitPersonalizedTableState(tableId);
        }

        namespace.to(getRoomName(tableId)).emit("table:player-left", {
          tableId,

          tablePlayerId: exitResult.tablePlayerId,

          remainingPlayers: exitResult.remainingPlayers,
        });

        if (
          !exitResult.handNeedsShowdown &&
          Number(exitResult.remainingPlayers) >= 2
        ) {
          await schedulePokerTurn(tableId);
        }

        sendCallback(callback, {
          success: true,

          data: {
            cashOutAmount: exitResult.cashOutAmount,

            walletBalance: exitResult.walletBalance,
          },
        });

        if (socket.data.roomName) {
          await socket.leave(socket.data.roomName);
        }

        socket.data.tableId = null;

        socket.data.roomName = null;

        socket.data.tablePlayerId = null;
      } catch (error) {
        console.error("POKER TABLE EXIT ERROR:", error);

        sendCallback(callback, {
          success: false,

          statusCode: getErrorStatus(error),

          message: error.message || "Unable to exit Poker table.",
        });
      }
    });

    socket.on("table:get-state", async (payload = {}, callback) => {
      try {
        const tableId = parsePositiveInteger(
          payload.tableId || socket.data.tableId,
        );

        if (!tableId) {
          throw Object.assign(new Error("Valid Poker table ID is required."), {
            statusCode: 400,
          });
        }

        if (state?.hand?.status === "completed") {
          scheduleNextPokerHand(tableId, 5000);
        }

        let state = await pokerService.getTableState(tableId);

        state = await recoverStartingHand(state);

        state = await pokerService.getTableGameState(tableId, socket.user.id);

        validatePlayer(state, socket.user.id);

        socket.emit("table:state", state);

        sendCallback(callback, {
          success: true,
        });

        scheduleMatchmaking(state);

        await schedulePokerTurn(tableId);
      } catch (error) {
        sendCallback(callback, {
          success: false,

          statusCode: getErrorStatus(error),

          message: error.message,
        });
      }
    });

    socket.on("disconnect", (reason) => {
      console.log(`🔌 Poker disconnected: User ${socket.user.id}; ${reason}`);

      if (socket.data.roomName && socket.data.tableId) {
        socket.to(socket.data.roomName).emit("table:player-disconnected", {
          tableId: socket.data.tableId,

          userId: socket.user.id,
        });
      }
    });
  });

  console.log("✅ Poker Socket.IO initialized");
}

module.exports = {
  initializePokerSocket,
};
