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
  getAnalytics,
  getSettings,
  updateSettings,
  cancelRound,
} = require(
  "../controllers/admin-dragon-flight.controller",
);

const router =
  express.Router();

/*
 * সব DragonFlight admin route
 * login + admin protected.
 */
router.use(
  requireAuth,
  requireAdmin,
);

/*
 * GET
 * /api/admin/dragon-flight/settings
 */
router.get(
  "/settings",
  getSettings,
);

/*
 * GET
 * /api/admin/dragon-flight/analytics
 */
router.get(
  "/analytics",
  getAnalytics,
);

/*
 * PATCH
 * /api/admin/dragon-flight/settings
 */
router.patch(
  "/settings",
  updateSettings,
);

/*
 * POST
 * /api/admin/dragon-flight/rounds/:roundId/cancel-refund
 */
router.post(
  "/rounds/:roundId/cancel-refund",
  cancelRound,
);

module.exports =
  router;