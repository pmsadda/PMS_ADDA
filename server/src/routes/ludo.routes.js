"use strict";

const express =
  require("express");

const controller =
  require(
    "../controllers/ludo.controller"
  );

const {
  requireAuth,
} = require(
  "../middleware/auth.middleware"
);

const router =
  express.Router();

/* ==========================================
   TPL22
   Ludo Routes
========================================== */

/*
 * Ludo matchmaking join
 */

/*
 * Available Ludo rooms
 */
router.get(
  "/rooms",
  requireAuth,
  controller.getAvailableRooms,
);

router.post(
  "/matchmaking/join",
  requireAuth,
  controller.joinMatchmaking
);

/*
 * Current match state
 */
router.get(
  "/match/:matchId",
  requireAuth,
  controller.getMatchState
);

module.exports = router;