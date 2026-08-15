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
  getMyRoundBet,
  getCompletedResult,
  getRecentResults,
} = require(
  "../controllers/andar-bahar.controller",
);

const router =
  express.Router();

/* =========================================================
   RATE LIMITERS
========================================================= */

const gameReadLimiter =
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
        "ANDAR_BAHAR_READ_LIMIT",

      message:
        "Too many Andar Bahar requests. Please wait a moment.",
    },
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
        "ANDAR_BAHAR_BET_LIMIT",

      message:
        "Too many bet requests. Please wait a moment.",
    },
  });

/* =========================================================
   AUTHENTICATION
========================================================= */

router.use(
  requireAuth,
);

/* =========================================================
   GAME ROUTES
========================================================= */

/*
 * GET /api/andar-bahar/state
 */
router.get(
  "/state",
  gameReadLimiter,
  getGameState,
);

/*
 * POST /api/andar-bahar/bets
 *
 * Body:
 * {
 *   "roundId": 1,
 *   "selectedSide": "andar",
 *   "betAmount": 50
 * }
 */
router.post(
  "/bets",
  betLimiter,
  placeUserBet,
);

/*
 * GET /api/andar-bahar/bets/:roundId/me
 */
router.get(
  "/bets/:roundId/me",
  gameReadLimiter,
  getMyRoundBet,
);

/*
 * GET /api/andar-bahar/results/recent
 *
 * এই route অবশ্যই /results/:roundId-এর আগে থাকবে।
 */
router.get(
  "/results/recent",
  gameReadLimiter,
  getRecentResults,
);

/*
 * GET /api/andar-bahar/results/:roundId
 */
router.get(
  "/results/:roundId",
  gameReadLimiter,
  getCompletedResult,
);

module.exports = router;