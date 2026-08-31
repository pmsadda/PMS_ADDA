"use strict";

const express =
  require("express");

const {
  requireAuth
} = require(
  "../middleware/auth.middleware"
);

const {
  getKaitState,
  createKaitBet,
  getCurrentKaitBet
} = require(
  "../controllers/kait.controller"
);

const router =
  express.Router();

router.get(
  "/state",
  requireAuth,
  getKaitState
);

router.get(
  "/bets/my/:roundId",
  requireAuth,
  getCurrentKaitBet
);

router.post(
  "/bets",
  requireAuth,
  createKaitBet
);

module.exports = router;