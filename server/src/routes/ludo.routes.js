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
   PMS ADDA
   Ludo Routes
========================================== */

/*
 * Ludo matchmaking join
 */
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