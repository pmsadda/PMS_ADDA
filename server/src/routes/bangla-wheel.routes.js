"use strict";

const express =
  require("express");

const {
  rateLimit
} = require(
  "express-rate-limit"
);

const {
  requireAuth
} = require(
  "../middleware/auth.middleware"
);

const {
  getGameState,
  placeUserBet,
  getMyRoundBet,
  getCompletedResult,
  getRecentResults
} = require(
  "../controllers/bangla-wheel.controller"
);

const router =
  express.Router();

/* =========================================================
   RATE LIMITERS
========================================================= */

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
        "BANGLA_WHEEL_READ_LIMIT",

      message:
        "Too many Bangla Wheel requests. Please wait."
    }
  });

const betLimiter =
  rateLimit({
    windowMs:
      60 * 1000,

    limit: 20,

    standardHeaders:
      "draft-8",

    legacyHeaders: false,

    message: {
      success: false,

      code:
        "BANGLA_WHEEL_BET_LIMIT",

      message:
        "Too many bet requests. Please wait."
    }
  });

/* =========================================================
   AUTHENTICATION
========================================================= */

router.use(
  requireAuth
);

/* =========================================================
   GAME ROUTES
========================================================= */

/*
 * GET /api/bangla-wheel/state
 */
router.get(
  "/state",
  readLimiter,
  getGameState
);

/*
 * POST /api/bangla-wheel/bets
 *
 * Body:
 * {
 *   "roundId": 1,
 *   "animalId": 1,
 *   "betAmount": 10
 * }
 */
router.post(
  "/bets",
  betLimiter,
  placeUserBet
);

/*
 * GET /api/bangla-wheel/bets/:roundId/me
 */
router.get(
  "/bets/:roundId/me",
  readLimiter,
  getMyRoundBet
);

/*
 * GET /api/bangla-wheel/results/recent
 *
 * এটি /results/:roundId-এর আগে থাকবে।
 */
router.get(
  "/results/recent",
  readLimiter,
  getRecentResults
);

/*
 * GET /api/bangla-wheel/results/:roundId
 */
router.get(
  "/results/:roundId",
  readLimiter,
  getCompletedResult
);

module.exports =
  router;