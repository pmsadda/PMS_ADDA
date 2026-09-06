"use strict";

const express = require("express");

const {
  getState,
  spin,
  getHistory,
} = require("../controllers/super-ace.controller");

const {
  requireAuth,
} = require("../middleware/auth.middleware");

const router = express.Router();

router.use(requireAuth);

router.get("/state", getState);
router.post("/spin", spin);
router.get("/history", getHistory);

module.exports = router;