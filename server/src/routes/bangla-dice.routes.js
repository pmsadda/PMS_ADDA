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
} = require(
  "../middleware/auth.middleware",
);

const {
  getGameState,
  placeUserBet,
  getMyRoundBets,
  getRecentResults,
} = require(
  "../controllers/bangla-dice.controller",
);

const router =
  express.Router();

const readLimiter =
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
        "BANGLA_DICE_READ_LIMIT",

      message:
        "Too many Dice requests. Please wait.",
    },
  });

const betLimiter =
  rateLimit({
    windowMs:
      60 * 1000,

    limit: 30,

    standardHeaders:
      "draft-8",

    legacyHeaders: false,

    message: {
      success: false,
      code:
        "BANGLA_DICE_BET_LIMIT",

      message:
        "Too many Dice bet requests. Please wait.",
    },
  });

router.use(
  requireAuth,
);

router.get(
  "/state",
  readLimiter,
  getGameState,
);

router.post(
  "/bets",
  betLimiter,
  placeUserBet,
);

router.get(
  "/bets/:roundId/me",
  readLimiter,
  getMyRoundBets,
);

router.get(
  "/results/recent",
  readLimiter,
  getRecentResults,
);

module.exports =
  router;