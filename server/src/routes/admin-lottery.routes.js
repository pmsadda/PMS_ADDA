"use strict";

const express =
  require("express");

const controller =
  require(
    "../controllers/admin-lottery.controller",
  );

const {
  requireAuth,
  requireAdmin,
} = require(
  "../middleware/auth.middleware",
);

const router =
  express.Router();

/* ==========================================
   Admin-only Lottery Routes
========================================== */

router.use(
  requireAuth,
  requireAdmin,
);

router.post(
  "/draws",
  controller.createDraw,
);

router.patch(
  "/draws/:drawId/open",
  controller.openDraw,
);

/* Cancel Draw and Refund Eligible Tickets */

router.patch(
  "/draws/:drawId/cancel",
  controller.cancelAdminDraw,
);

module.exports =
  router;