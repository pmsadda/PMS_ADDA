"use strict";

const jwt = require("jsonwebtoken");

const {
  pool,
} = require("../config/database");

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

async function authenticateLotterySocket(
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
      const error = new Error(
        "Authentication token is required.",
      );

      error.data = {
        statusCode: 401,
        code: "SOCKET_TOKEN_REQUIRED",
      };

      return next(error);
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET,
      {
        algorithms: ["HS256"],
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
      const error = new Error(
        "Invalid authentication token.",
      );

      error.data = {
        statusCode: 401,
        code: "SOCKET_USER_INVALID",
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

    const user = userRows[0] || null;

    if (!user) {
      const error = new Error(
        "User account was not found.",
      );

      error.data = {
        statusCode: 401,
        code: "SOCKET_USER_NOT_FOUND",
      };

      return next(error);
    }

    if (
      String(
        user.account_status || "",
      ).toLowerCase() !== "active"
    ) {
      const error = new Error(
        "This account is not active.",
      );

      error.data = {
        statusCode: 403,
        code: "SOCKET_ACCOUNT_INACTIVE",
      };

      return next(error);
    }

    socket.user = {
      id: Number(user.id),

      uid:
        user.uid ||
        null,

      role:
        String(
          user.role || "",
        )
          .trim()
          .toLowerCase(),
    };

    return next();
  } catch (error) {
    console.error(
      "LOTTERY SOCKET AUTH ERROR:",
      error.message,
    );

    const isTokenError = [
      "JsonWebTokenError",
      "TokenExpiredError",
      "NotBeforeError",
    ].includes(error.name);

    const socketError = new Error(
      isTokenError
        ? "Invalid or expired authentication token."
        : "Socket authentication is temporarily unavailable.",
    );

    socketError.data = {
      statusCode:
        isTokenError ? 401 : 500,

      code:
        isTokenError
          ? "SOCKET_AUTH_FAILED"
          : "SOCKET_AUTH_DATABASE_ERROR",
    };

    return next(socketError);
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