"use strict";

const express =
  require("express");

const {
  rateLimit,
} = require(
  "express-rate-limit",
);

const {
  requireAuth,
  requireAdmin,
} = require(
  "../middleware/auth.middleware",
);

const controller =
  require(
    "../controllers/admin-andar-bahar.controller",
  );

const router =
  express.Router();

/* =========================================================
   ADMIN RATE LIMITER
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
        "ADMIN_ANDAR_BAHAR_LIMIT",

      message:
        "Too many admin requests. Please wait a moment.",
    },
  });

/* =========================================================
   ADMIN AUTHENTICATION
========================================================= */

router.use(
  requireAuth,
  requireAdmin,
  adminLimiter,
);

/* =========================================================
   ROUTES
========================================================= */

/*
 * GET /api/admin/andar-bahar/dashboard
 */
router.get(
  "/dashboard",
  controller.getDashboard,
);

/*
 * PUT /api/admin/andar-bahar/settings
 */
router.put(
  "/settings",
  controller.updateSettings,
);

/*
 * GET /api/admin/andar-bahar/rounds
 */
router.get(
  "/rounds",
  controller.getRounds,
);

/*
 * GET /api/admin/andar-bahar/rounds/:roundId/bets
 */
router.get(
  "/rounds/:roundId/bets",
  controller.getRoundBets,
);

module.exports = router;