"use strict";

const express = require("express");

const {
  getSettings,
  updateSettings,
  getDashboard,
} = require("../controllers/admin-slot.controller");

const {
  requireAuth,
  requireAdmin,
} = require("../middleware/auth.middleware");

const router = express.Router();

router.use(requireAuth, requireAdmin);

router.get("/settings", getSettings);
router.patch("/settings", updateSettings);
router.get("/dashboard", getDashboard);

module.exports = router;