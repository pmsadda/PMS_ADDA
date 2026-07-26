"use strict";

const express = require("express");

const {
  getWalletSummary,
} = require("../controllers/wallet.controller");

const {
  requireAuth,
} = require("../middleware/auth.middleware");

const router = express.Router();

/*
 * GET /api/wallet/summary
 *
 * Authenticated user-এর wallet,
 * statistics এবং recent transactions।
 */
router.get(
  "/summary",
  requireAuth,
  getWalletSummary,
);

module.exports = router;