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
  "../controllers/admin-balloon-burst.controller",
);

const router =
  express.Router();

/*
 * সব BalloonBurst admin route
 * login + admin protected.
 */
router.use(
  requireAuth,
  requireAdmin,
);

/*
 * GET
 * /api/admin/balloon-burst/settings
 */
router.get(
  "/settings",
  getSettings,
);

/*
 * GET
 * /api/admin/balloon-burst/analytics
 */
router.get(
  "/analytics",
  getAnalytics,
);

/*
 * PATCH
 * /api/admin/balloon-burst/settings
 */
router.patch(
  "/settings",
  updateSettings,
);

/*
 * POST
 * /api/admin/balloon-burst/rounds/:roundId/cancel-refund
 */
router.post(
  "/rounds/:roundId/cancel-refund",
  cancelRound,
);

module.exports =
  router;