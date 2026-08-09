"use strict";

const jwt =
  require("jsonwebtoken");

const {
  pool
} = require(
  "../config/database"
);

/* ==========================
   Verify Access Token
========================== */

async function requireAuth(
  request,
  response,
  next,
) {
  const authorization =
    request.headers.authorization ||
    "";

  const [
    scheme,
    token,
  ] = authorization.split(" ");

  if (
    scheme !== "Bearer" ||
    !token
  ) {
    return response
      .status(401)
      .json({
        success: false,

        code:
          "AUTH_TOKEN_REQUIRED",

        message:
          "Authentication token is required.",
      });
  }

  let decoded;

  try {
    decoded = jwt.verify(
      token,
      process.env.JWT_SECRET,
      {
        algorithms: [
          "HS256",
        ],
      },
    );
  } catch (error) {
    const tokenExpired =
      error.name ===
      "TokenExpiredError";

    return response
      .status(401)
      .json({
        success: false,

        code:
          tokenExpired
            ? "AUTH_TOKEN_EXPIRED"
            : "AUTH_TOKEN_INVALID",

        message:
          tokenExpired
            ? "Your login session has expired."
            : "Invalid authentication token.",
      });
  }

  const userId =
    Number.parseInt(
      decoded.id,
      10,
    );

  if (
    !Number.isInteger(userId) ||
    userId < 1
  ) {
    return response
      .status(401)
      .json({
        success: false,

        code:
          "AUTH_USER_INVALID",

        message:
          "Invalid authentication token.",
      });
  }

  try {
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

    const user =
      userRows[0] || null;

    if (!user) {
      return response
        .status(401)
        .json({
          success: false,

          code:
            "AUTH_USER_NOT_FOUND",

          message:
            "User account was not found.",
        });
    }

    if (
      String(
        user.account_status || "",
      ).toLowerCase() !== "active"
    ) {
      return response
        .status(403)
        .json({
          success: false,

          code:
            "ACCOUNT_INACTIVE",

          message:
            "This account is not active.",
        });
    }

    request.user = {
      id: Number(user.id),

      uid:
        user.uid ||
        null,

      role:
        String(
          user.role || ""
        )
          .trim()
          .toLowerCase(),
    };

    request.accessToken = token;

    return next();
  } catch (error) {
    console.error(
      "LIVE AUTH DATABASE ERROR:",
      error,
    );

    return response
      .status(500)
      .json({
        success: false,

        code:
          "AUTH_DATABASE_ERROR",

        message:
          "Authentication service is temporarily unavailable.",
      });
  }
}

/* ==========================
   Live Admin Validation
========================== */

async function requireAdmin(
  request,
  response,
  next
) {
  try {
    if (!request.user?.id) {
      return response
        .status(401)
        .json({
          success: false,

          message:
            "Authentication is required."
        });
    }

    const [rows] =
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
        [
          request.user.id
        ]
      );

    const admin =
      rows[0] || null;

    if (!admin) {
      return response
        .status(401)
        .json({
          success: false,

          message:
            "Admin account was not found."
        });
    }

    if (
      String(
        admin.account_status ||
        ""
      ).toLowerCase() !==
        "active"
    ) {
      return response
        .status(403)
        .json({
          success: false,

          message:
            "This admin account is not active."
        });
    }

    if (
      String(
        admin.role ||
        ""
      ).toLowerCase() !==
        "admin"
    ) {
      return response
        .status(403)
        .json({
          success: false,

          message:
            "Admin access is required."
        });
    }

    /*
     * Controllerগুলো এখন verified
     * current database identity পাবে।
     */

    request.user = {
      id:
        Number(admin.id),

      uid:
        admin.uid ||
        request.user.uid ||
        null,

      role:
        "admin"
    };

    next();
  } catch (error) {
    next(error);
  }
}

module.exports = {
  requireAuth,
  requireAdmin
};