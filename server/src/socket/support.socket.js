"use strict";

const jwt = require("jsonwebtoken");

const {
  pool,
} = require("../config/database");

async function authenticateSupportSocket(
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
      socket.handshake.auth?.token ||
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

    const userId = Number(decoded.id);

    if (
      !Number.isInteger(userId) ||
      userId <= 0
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
      uid: user.uid || null,
      role: String(
        user.role || "user",
      ).toLowerCase(),
    };

    return next();
  } catch (error) {
    console.error(
      "SUPPORT SOCKET AUTH ERROR:",
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

function getSupportUserRoom(userId) {
  return `support:user:${Number(userId)}`;
}

function initializeSupportSocket(io) {
  const namespace = io.of("/support");

  namespace.use(authenticateSupportSocket);

  namespace.on("connection", (socket) => {
    if (socket.user.role === "admin") {
      socket.join("support:admins");
    } else {
      socket.join(getSupportUserRoom(socket.user.id));
    }

    socket.emit("support:ready", {
      connected: true,
      userId: socket.user.id,
      role: socket.user.role,
    });
  });

  return namespace;
}

module.exports = {
  initializeSupportSocket,
  getSupportUserRoom,
};
