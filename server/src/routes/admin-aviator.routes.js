"use strict";

const express =
  require("express");

const {
  requireAuth,
  requireAdmin,
} = require(
  "../middleware/auth.middleware",
);

const {
  getSettings,
  updateSettings,
  cancelRound,
} = require(
  "../controllers/admin-aviator.controller",
);

const router =
  express.Router();

/*
 * সব Aviator admin route
 * login + admin protected.
 */
router.use(
  requireAuth,
  requireAdmin,
);

/*
 * GET
 * /api/admin/aviator/settings
 */
router.get(
  "/settings",
  getSettings,
);

/*
 * PATCH
 * /api/admin/aviator/settings
 */
router.patch(
  "/settings",
  updateSettings,
);

/*
 * POST
 * /api/admin/aviator/rounds/:roundId/cancel-refund
 */
router.post(
  "/rounds/:roundId/cancel-refund",
  cancelRound,
);

module.exports =
  router;