"use strict";

const express = require("express");

const teenPattiController = require(
  "../controllers/teenpatti.controller",
);

const {
  requireAuth,
} = require(
  "../middleware/auth.middleware",
);

const router = express.Router();

/* =========================================================
   MATCHMAKING
========================================================= */

router.post(
  "/matchmaking/join",
  requireAuth,
  teenPattiController.joinMatchmaking,
);

/* =========================================================
   AUTHENTICATED PUBLIC TABLE STATE
========================================================= */

router.get(
  "/table/:tableId",
  requireAuth,
  teenPattiController.getTableState,
);

module.exports = router;