"use strict";

const express = require("express");
const { requireAuth } = require("../middleware/auth.middleware");

const {
  state,
  spin,
} = require("../controllers/roulette.controller");

const router = express.Router();

router.get("/state", requireAuth, state);
router.post("/spin", requireAuth, spin);

module.exports = router;