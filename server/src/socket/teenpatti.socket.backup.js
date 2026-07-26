"use strict";

const jwt = require("jsonwebtoken");
const teenPattiService = require("../services/teenpatti.service");

/**
 * Socket connection-এর token verify করবে।
 */
function socketAuthentication(socket, next) {
  try {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace("Bearer ", "");

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
    console.error("SOCKET AUTHENTICATION ERROR:", error.message);

    const socketError = new Error("Invalid or expired authentication token.");

    socketError.data = {
      statusCode: 401,
    };

    return next(socketError);
  }
}

/**
 * একটি table-এর জন্য Socket.IO room name তৈরি করবে।
 */
function getTableRoomName(tableId) {
  return `teenpatti:table:${tableId}`;
}

/**
 * Socket.IO Teen Patti events।
 */
function initializeTeenPattiSocket(io) {
  const teenPattiNamespace = io.of("/teenpatti");

  teenPattiNamespace.use(socketAuthentication);

  teenPattiNamespace.on("connection", (socket) => {
    console.log(`🎮 Teen Patti socket connected: User ${socket.user.id}`);

    /**
     * User game table page-এ ঢুকলে call হবে।
     */
    socket.on("table:join", async (payload = {}, callback) => {
      try {
        const tableId = Number(payload.tableId);

        if (!Number.isInteger(tableId) || tableId <= 0) {
          throw new Error("Valid table ID is required.");
        }

        const tableState = await teenPattiService.getTableState(tableId);

        const roomName = getTableRoomName(tableId);

        /*
         * User আগে অন্য table room-এ থাকলে
         * সেই room থেকে বের করা হবে।
         */
        if (socket.data.tableRoom && socket.data.tableRoom !== roomName) {
          await socket.leave(socket.data.tableRoom);
        }

        await socket.join(roomName);

        socket.data.tableId = tableId;
        socket.data.tableRoom = roomName;

        /*
         * যে user join করেছে তাকে
         * complete table state দেওয়া হবে।
         */
        socket.emit("table:state", tableState);

        /*
         * Table-এর অন্য player-দের জানানো হবে
         * যে state update হয়েছে।
         */
        socket.to(roomName).emit("table:player-joined", {
          userId: socket.user.id,
          tableId,
        });

        socket.to(roomName).emit("table:state", tableState);

        if (typeof callback === "function") {
          callback({
            success: true,
            message: "Socket table joined successfully.",
            data: tableState,
          });
        }
      } catch (error) {
        console.error("SOCKET TABLE JOIN ERROR:", error);

        if (typeof callback === "function") {
          callback({
            success: false,
            message: error.message || "Failed to join table.",
          });

          return;
        }

        socket.emit("table:error", {
          message: error.message || "Failed to join table.",
        });
      }
    });

    /**
     * Client table-এর সর্বশেষ state চাইলে।
     */
    socket.on("table:get-state", async (payload = {}, callback) => {
      try {
        const tableId = Number(payload.tableId || socket.data.tableId);

        if (!Number.isInteger(tableId) || tableId <= 0) {
          throw new Error("Valid table ID is required.");
        }

        const tableState = await teenPattiService.getTableState(tableId);

        socket.emit("table:state", tableState);

        if (typeof callback === "function") {
          callback({
            success: true,
            data: tableState,
          });
        }
      } catch (error) {
        if (typeof callback === "function") {
          callback({
            success: false,
            message: error.message || "Failed to load table state.",
          });
        }
      }
    });

    /* =========================================================
   START SERVER-AUTHORITATIVE HAND
========================================================= */

    socket.on("hand:start", async (payload = {}, callback) => {
      try {
        const tableId = Number(payload.tableId || socket.data.tableId);

        if (!Number.isInteger(tableId) || tableId <= 0) {
          throw new Error("Valid Teen Patti table ID is required.");
        }

        if (Number(socket.data.tableId) !== tableId) {
          throw new Error("Socket is not joined to this table.");
        }

        let startResult = null;
        let alreadyRunning = false;

        try {
          startResult = await teenPattiService.startTeenPattiHand(
            tableId,
            socket.user.id,
          );
        } catch (startError) {
          /*
           * একাধিক client একই সময়ে start
           * request পাঠাতে পারে।
           *
           * প্রথম request hand তৈরি করবে।
           * পরের request 409 পেলে running
           * hand state load করবে।
           */
          if (Number(startError.status || startError.statusCode) === 409) {
            alreadyRunning = true;
          } else {
            throw startError;
          }
        }

        const roomName = getTableRoomName(tableId);

        const connectedSockets = await teenPattiNamespace
          .in(roomName)
          .fetchSockets();

        /*
         * প্রত্যেক socket-এর জন্য আলাদা
         * safe hand state তৈরি করা হচ্ছে।
         *
         * তাই একজন অন্য player-এর cards
         * পাবে না।
         */
        await Promise.all(
          connectedSockets.map(async (connectedSocket) => {
            const connectedUserId = Number(connectedSocket.user?.id);

            if (!Number.isInteger(connectedUserId) || connectedUserId <= 0) {
              return;
            }

            try {
              const privateHandState =
                await teenPattiService.getTeenPattiHandState(
                  tableId,
                  connectedUserId,
                );

              connectedSocket.emit("hand:state", privateHandState);
            } catch (privateStateError) {
              console.error(
                "TEEN PATTI PRIVATE HAND STATE ERROR:",
                privateStateError,
              );
            }
          }),
        );

        const requesterHandState = await teenPattiService.getTeenPattiHandState(
          tableId,
          socket.user.id,
        );

        teenPattiNamespace.to(roomName).emit("hand:started", {
          tableId,

          handId: requesterHandState.hand?.id || null,

          roundNumber: requesterHandState.hand?.roundNumber || null,

          alreadyRunning,

          message: alreadyRunning
            ? "Teen Patti hand already running."
            : "Teen Patti hand started.",
        });

        if (typeof callback === "function") {
          callback({
            success: true,

            message: alreadyRunning
              ? "Teen Patti hand already running."
              : "Teen Patti hand started successfully.",

            data: {
              startResult,

              handState: requesterHandState,

              alreadyRunning,
            },
          });
        }
      } catch (error) {
        console.error("SOCKET TEEN PATTI HAND START ERROR:", error);

        if (typeof callback === "function") {
          callback({
            success: false,

            statusCode: error.status || error.statusCode || 500,

            message: error.message || "Teen Patti hand could not start.",
          });
        }
      }
    });

    /* =========================================================
   GET PRIVATE HAND STATE
========================================================= */

    socket.on("hand:get-state", async (payload = {}, callback) => {
      try {
        const tableId = Number(payload.tableId || socket.data.tableId);

        if (!Number.isInteger(tableId) || tableId <= 0) {
          throw new Error("Valid Teen Patti table ID is required.");
        }

        if (Number(socket.data.tableId) !== tableId) {
          throw new Error("Socket is not joined to this table.");
        }

        const handState = await teenPattiService.getTeenPattiHandState(
          tableId,
          socket.user.id,
        );

        socket.emit("hand:state", handState);

        if (typeof callback === "function") {
          callback({
            success: true,

            message: "Teen Patti hand state loaded.",

            data: handState,
          });
        }
      } catch (error) {
        console.error("SOCKET TEEN PATTI HAND STATE ERROR:", error);

        if (typeof callback === "function") {
          callback({
            success: false,

            statusCode: error.status || error.statusCode || 500,

            message: error.message || "Teen Patti hand state could not load.",
          });
        }
      }
    });

    

    /* =========================================================
   SERVER-AUTHORITATIVE PACK EVENT
========================================================= */

    socket.on("hand:pack", async (payload = {}, callback) => {
      try {
        const tableId = Number(payload.tableId || socket.data.tableId);

        if (!Number.isInteger(tableId) || tableId <= 0) {
          throw new Error("Valid Teen Patti table ID is required.");
        }

        if (Number(socket.data.tableId) !== tableId) {
          throw new Error("Socket is not joined to this table.");
        }

        const actionResult = await teenPattiService.packTeenPattiPlayer(
          tableId,
          socket.user.id,
        );

        const roomName = getTableRoomName(tableId);

        /*
         * Public action event:
         * এখানে কোনো private card নেই।
         */
        teenPattiNamespace.to(roomName).emit("hand:action", actionResult);

        /*
         * প্রত্যেক connected real player
         * নিজের private state পাবে।
         */
        const connectedSockets = await teenPattiNamespace
          .in(roomName)
          .fetchSockets();

        await Promise.all(
          connectedSockets.map(async (connectedSocket) => {
            const connectedUserId = Number(connectedSocket.user?.id);

            if (!Number.isInteger(connectedUserId) || connectedUserId <= 0) {
              return;
            }

            try {
              const privateHandState =
                await teenPattiService.getTeenPattiHandState(
                  tableId,
                  connectedUserId,
                );

              connectedSocket.emit("hand:state", privateHandState);
            } catch (stateError) {
              console.error("PACK PRIVATE STATE ERROR:", stateError);
            }
          }),
        );

        const requesterHandState = await teenPattiService.getTeenPattiHandState(
          tableId,
          socket.user.id,
        );

        if (typeof callback === "function") {
          callback({
            success: true,

            message: actionResult.roundEnded
              ? "Player packed. Round winner resolved."
              : "Player packed successfully.",

            data: {
              action: actionResult,

              handState: requesterHandState,
            },
          });
        }
      } catch (error) {
        console.error("SOCKET TEEN PATTI PACK ERROR:", error);

        if (typeof callback === "function") {
          callback({
            success: false,

            statusCode: error.status || error.statusCode || 500,

            message: error.message || "Teen Patti Pack failed.",
          });
        }
      }
    });

    /**
     * Finished round settlement।
     */
    socket.on("round:settle", async (payload = {}, callback) => {
      try {
        const tableId = Number(payload.tableId || socket.data.tableId);

        if (!Number.isInteger(tableId) || tableId <= 0) {
          throw new Error("Valid table ID is required.");
        }

        /*
         * Socket যে table-এ join করেছে,
         * শুধু সেই table settle করতে পারবে।
         */
        if (Number(socket.data.tableId) !== tableId) {
          throw new Error("Socket is not joined to this table.");
        }

        const settlement = await teenPattiService.settleRound(
          tableId,
          socket.user.id,
          {
            winnerId: payload.winnerId,

            winnerType: payload.winnerType,

            grossAmount: payload.grossAmount,

            expectedRound: payload.expectedRound,
          },
        );

        const tableState = await teenPattiService.getTableState(tableId);

        const roomName = getTableRoomName(tableId);

        /*
         * Table-এর সবাই updated
         * balance পাবে।
         */
        teenPattiNamespace.to(roomName).emit("round:settled", {
          settlement,
          tableState,
        });

        if (typeof callback === "function") {
          callback({
            success: true,

            message: "Round settled successfully.",

            data: settlement,
          });
        }
      } catch (error) {
        console.error("SOCKET ROUND SETTLEMENT ERROR:", error);

        if (typeof callback === "function") {
          callback({
            success: false,

            statusCode: error.status || error.statusCode || 500,

            message: error.message || "Round settlement failed.",
          });
        }
      }
    });

    /**
     * Page থেকে table leave করলে।
     */
    socket.on("table:leave", async (payload = {}, callback) => {
      try {
        const tableId = Number(payload.tableId || socket.data.tableId);

        if (!Number.isInteger(tableId) || tableId <= 0) {
          throw new Error("Valid table ID is required.");
        }

        const roomName = getTableRoomName(tableId);

        await socket.leave(roomName);

        socket.data.tableId = null;
        socket.data.tableRoom = null;

        socket.to(roomName).emit("table:player-left", {
          userId: socket.user.id,
          tableId,
        });

        if (typeof callback === "function") {
          callback({
            success: true,
            message: "Socket table left successfully.",
          });
        }
      } catch (error) {
        if (typeof callback === "function") {
          callback({
            success: false,
            message: error.message || "Failed to leave table.",
          });
        }
      }
    });

    socket.on("disconnect", (reason) => {
      console.log(
        `🔌 Teen Patti socket disconnected: User ${socket.user.id}. Reason: ${reason}`,
      );

      if (socket.data.tableRoom && socket.data.tableId) {
        socket.to(socket.data.tableRoom).emit("table:player-disconnected", {
          userId: socket.user.id,
          tableId: socket.data.tableId,
        });
      }
    });
  });

  console.log("✅ Teen Patti Socket.IO initialized");
}

module.exports = {
  initializeTeenPattiSocket,
};
