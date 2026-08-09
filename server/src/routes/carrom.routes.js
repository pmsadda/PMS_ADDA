"use strict";

const express =
  require("express");

const controller =
  require(
    "../controllers/carrom.controller",
  );

const {
  requireAuth,
} = require(
  "../middleware/auth.middleware",
);

const router =
  express.Router();

/* ==========================================
   PMS ADDA Carrom Routes
========================================== */

/*
 * Available Carrom rooms
 */
router.get(
  "/rooms",
  requireAuth,
  controller.getAvailableRooms,
);

/*
 * Join Carrom matchmaking
 */
router.post(
  "/matchmaking/join",
  requireAuth,
  controller.joinMatchmaking,
);

/*
 * Current Carrom match state
 */
router.get(
  "/matches/:matchId",
  requireAuth,
  controller.getMatchState,
);

module.exports =
  router;