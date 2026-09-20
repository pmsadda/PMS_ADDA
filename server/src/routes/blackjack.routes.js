"use strict";

const express = require("express");
const { requireAuth } = require("../middleware/auth.middleware");

const {
  state,
  start,
  action,
} = require("../controllers/blackjack.controller");

const router = express.Router();

router.get("/state", requireAuth, state);
router.post("/start", requireAuth, start);
router.post("/:action", requireAuth, action);

module.exports = router;