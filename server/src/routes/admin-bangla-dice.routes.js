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
    "../controllers/admin-bangla-dice.controller",
  );

const router =
  express.Router();

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
        "ADMIN_BANGLA_DICE_LIMIT",

      message:
        "Too many Bangla Dice admin requests.",
    },
  });

router.use(
  requireAuth,
  requireAdmin,
  adminLimiter,
);

router.get(
  "/dashboard",
  controller.getDashboard,
);

router.put(
  "/settings",
  controller.updateSettings,
);

router.put(
  "/symbols",
  controller.updateSymbols,
);

router.get(
  "/rounds",
  controller.getRounds,
);

router.get(
  "/rounds/:roundId/bets",
  controller.getRoundBets,
);

module.exports =
  router;