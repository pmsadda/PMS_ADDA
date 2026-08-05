"use strict";

const jwt = require("jsonwebtoken");

/* ==========================================
   Lottery Socket Rooms
========================================== */

const LOTTERY_PUBLIC_ROOM =
  "lottery:public";

function getLotteryUserRoomName(
  userId,
) {
  return `lottery:user:${Number(
    userId,
  )}`;
}

/* ==========================================
   Socket Authentication
========================================== */

function authenticateLotterySocket(
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
      !Number.isInteger(
        userId,
      ) ||
      userId < 1
    ) {
      const error =
        new Error(
          "Invalid authentication token.",
        );

      error.data = {
        statusCode: 401,
      };

      return next(error);
    }

    socket.user = {
      id: userId,

      uid:
        decoded.uid ||
        null,

      role:
        String(
          decoded.role ||
          "",
        )
          .trim()
          .toLowerCase(),
    };

    return next();
  } catch (_error) {
    const error =
      new Error(
        "Invalid or expired authentication token.",
      );

    error.data = {
      statusCode: 401,
    };

    return next(error);
  }
}

/* ==========================================
   Socket Initialization
========================================== */

function initializeLotterySocket(
  io,
) {
  const namespace =
    io.of(
      "/lottery",
    );

  namespace.use(
    authenticateLotterySocket,
  );

  namespace.on(
    "connection",
    (socket) => {
      socket.join(
        LOTTERY_PUBLIC_ROOM,
      );

      socket.join(
        getLotteryUserRoomName(
          socket.user.id,
        ),
      );

      socket.emit(
        "lottery:connected",
        {
          success: true,

          userId:
            socket.user.id,

          serverTime:
            new Date()
              .toISOString(),
        },
      );
    },
  );

  console.log(
    "✅ Lottery Socket.IO initialized",
  );

  return namespace;
}

/* ==========================================
   Server-side Emit Helpers
========================================== */

function emitLotteryDrawStarted(
  io,
  payload,
) {
  io.of(
    "/lottery",
  )
    .to(
      LOTTERY_PUBLIC_ROOM,
    )
    .emit(
      "lottery:draw-started",
      {
        ...payload,

        startedAt:
          new Date()
            .toISOString(),
      },
    );
}

function emitLotteryDrawCompleted(
  io,
  payload,
) {
  io.of(
    "/lottery",
  )
    .to(
      LOTTERY_PUBLIC_ROOM,
    )
    .emit(
      "lottery:draw-completed",
      {
        ...payload,

        completedAt:
          new Date()
            .toISOString(),
      },
    );
}

function emitLotteryDrawFailed(
  io,
  payload,
) {
  io.of(
    "/lottery",
  )
    .to(
      LOTTERY_PUBLIC_ROOM,
    )
    .emit(
      "lottery:draw-failed",
      {
        ...payload,

        failedAt:
          new Date()
            .toISOString(),
      },
    );
}

function emitLotteryWinnerNotification(
  io,
  userId,
  payload,
) {
  io.of(
    "/lottery",
  )
    .to(
      getLotteryUserRoomName(
        userId,
      ),
    )
    .emit(
      "lottery:winner-notification",
      {
        ...payload,

        sentAt:
          new Date()
            .toISOString(),
      },
    );
}

module.exports = {
  initializeLotterySocket,

  emitLotteryDrawStarted,
  emitLotteryDrawCompleted,
  emitLotteryDrawFailed,
  emitLotteryWinnerNotification,
};