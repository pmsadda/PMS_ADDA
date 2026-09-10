"use strict";

const express =
  require("express");

const {
  rateLimit
} = require(
  "express-rate-limit"
);

const {
  requireAuth,
  requireAdmin
} = require(
  "../middleware/auth.middleware"
);

const {
  trackVisit,
  getTrafficHistory
} = require(
  "../controllers/marketing-traffic.controller"
);

const router =
  express.Router();

const visitLimiter =
  rateLimit({
    windowMs:
      60 * 1000,

    limit:
      30,

    standardHeaders:
      true,

    legacyHeaders:
      false
  });

const adminLimiter =
  rateLimit({
    windowMs:
      60 * 1000,

    limit:
      60,

    standardHeaders:
      true,

    legacyHeaders:
      false
  });

router.post(
  "/visit",
  visitLimiter,
  express.json({
    limit:
      "10kb"
  }),
  trackVisit
);

router.get(
  "/admin/history",
  requireAuth,
  requireAdmin,
  adminLimiter,
  getTrafficHistory
);

module.exports =
  router;