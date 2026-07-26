"use strict";

const express =
  require("express");

const controller =
  require(
    "../controllers/poker.controller",
  );

const {
  requireAuth,
} = require(
  "../middleware/auth.middleware",
);

const router =
  express.Router();

router.post(
  "/matchmaking/join",
  requireAuth,
  controller.joinMatchmaking,
);

router.get(
  "/table/:tableId",
  requireAuth,
  controller.getTableState,
);

module.exports = router;