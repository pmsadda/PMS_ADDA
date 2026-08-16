"use strict";

const express =
  require("express");

const {
  rateLimit
} = require(
  "express-rate-limit"
);

const {
  requireAuth,
  requireAdmin
} = require(
  "../middleware/auth.middleware"
);

const controller =
  require(
    "../controllers/admin-bangla-wheel.controller"
  );

const router =
  express.Router();

/* =========================================================
   RATE LIMIT
========================================================= */

const adminLimiter =
  rateLimit({
    windowMs:
      60 * 1000,

    limit: 120,

    standardHeaders:
      "draft-8",

    legacyHeaders: false,

    message: {
      success: false,

      code:
        "ADMIN_BANGLA_WHEEL_LIMIT",

      message:
        "Too many Bangla Wheel admin requests."
    }
  });

/* =========================================================
   ADMIN AUTHENTICATION
========================================================= */

router.use(
  requireAuth,
  requireAdmin,
  adminLimiter
);

/* =========================================================
   ROUTES
========================================================= */

router.get(
  "/dashboard",
  controller.getDashboard
);

router.post(
  "/configuration",
  controller.scheduleConfiguration
);

router.get(
  "/rounds",
  controller.getRounds
);

router.get(
  "/rounds/:roundId/bets",
  controller.getRoundBets
);

router.get(
  "/audit-logs",
  controller.getAuditLogs
);

module.exports = router;