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
  "../controllers/admin-rocket-rise.controller",
);

const router =
  express.Router();

/*
 * সব RocketRise admin route
 * login + admin protected.
 */
router.use(
  requireAuth,
  requireAdmin,
);

/*
 * GET
 * /api/admin/rocket-rise/settings
 */
router.get(
  "/settings",
  getSettings,
);

/*
 * GET
 * /api/admin/rocket-rise/analytics
 */
router.get(
  "/analytics",
  getAnalytics,
);

/*
 * PATCH
 * /api/admin/rocket-rise/settings
 */
router.patch(
  "/settings",
  updateSettings,
);

/*
 * POST
 * /api/admin/rocket-rise/rounds/:roundId/cancel-refund
 */
router.post(
  "/rounds/:roundId/cancel-refund",
  cancelRound,
);

module.exports =
  router;