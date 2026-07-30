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

function requireAuth(
  request,
  response,
  next
) {
  try {
    const authorization =
      request.headers.authorization ||
      "";

    const [
      scheme,
      token
    ] =
      authorization.split(" ");

    if (
      scheme !== "Bearer" ||
      !token
    ) {
      return response
        .status(401)
        .json({
          success: false,

          message:
            "Authentication token is required."
        });
    }

    const decoded =
      jwt.verify(
        token,
        process.env.JWT_SECRET,
        {
          algorithms: [
            "HS256"
          ]
        }
      );

    const userId =
      Number.parseInt(
        decoded.id,
        10
      );

    if (
      !Number.isInteger(userId) ||
      userId < 1
    ) {
      return response
        .status(401)
        .json({
          success: false,

          message:
            "Invalid authentication token."
        });
    }

    request.user = {
      id: userId,

      uid:
        decoded.uid ||
        null,

      role:
        String(
          decoded.role || ""
        )
          .trim()
          .toLowerCase()
    };

    request.accessToken =
      token;

    next();
  } catch (error) {
    if (
      error.name ===
      "TokenExpiredError"
    ) {
      return response
        .status(401)
        .json({
          success: false,

          message:
            "Your login session has expired."
        });
    }

    return response
      .status(401)
      .json({
        success: false,

        message:
          "Invalid authentication token."
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