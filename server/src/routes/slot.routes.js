"use strict";

const express =
  require("express");

const {
  getState,
  spin,
  getHistory,
} = require(
  "../controllers/slot.controller",
);

const {
  requireAuth,
} = require(
  "../middleware/auth.middleware",
);

const router =
  express.Router();

/* Player wallet, settings, free spins */
router.get(
  "/state",
  requireAuth,
  getState,
);

/* Execute one secure spin */
router.post(
  "/spin",
  requireAuth,
  spin,
);

/* Player spin history */
router.get(
  "/history",
  requireAuth,
  getHistory,
);

module.exports = router;