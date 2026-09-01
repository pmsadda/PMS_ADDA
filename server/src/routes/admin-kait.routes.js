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

const controller =
  require(
    "../controllers/admin-kait.controller"
  );

const router =
  express.Router();


/* =========================================================
   ADMIN RATE LIMIT
========================================================= */

const adminLimiter =
  rateLimit({
    windowMs:
      60 * 1000,

    limit: 120,

    standardHeaders:
      "draft-8",

    legacyHeaders:
      false,

    message: {
      success: false,

      code:
        "ADMIN_KAIT_LIMIT",

      message:
        "Too many admin requests. Please wait a moment."
    }
  });


/* =========================================================
   ADMIN SECURITY
========================================================= */

router.use(
  requireAuth,
  requireAdmin,
  adminLimiter
);


/* =========================================================
   GET KAIT DASHBOARD
========================================================= */

router.get(
  "/dashboard",
  controller
    .getKaitAdminDashboard
);


/* =========================================================
   UPDATE KAIT SETTINGS
========================================================= */

router.put(
  "/settings",
  controller
    .updateKaitSettings
);


module.exports =
  router;