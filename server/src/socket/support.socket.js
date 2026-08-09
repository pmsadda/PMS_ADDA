"use strict";

const jwt = require("jsonwebtoken");

function authenticateSupportSocket(socket, next) {
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

    const userId = Number(decoded.id);

    if (!Number.isInteger(userId) || userId < 1) {
      const error = new Error("Invalid authentication token.");

      error.data = {
        statusCode: 401,
      };

      return next(error);
    }

    socket.user = {
      id: userId,
      uid: decoded.uid,
      role: decoded.role,
    };

    return next();
  } catch {
    const error = new Error("Invalid or expired authentication token.");

    error.data = {
      statusCode: 401,
    };

    return next(error);
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
