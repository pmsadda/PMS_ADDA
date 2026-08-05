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

router.get(
  "/draws",
  controller.getDraws,
);

router.post(
  "/draws",
  controller.createDraw,
);

router.patch(
  "/draws/:drawId/open",
  controller.openDraw,
);
/* Run Fair Draw and Pay Winners */

router.patch(
  "/draws/:drawId/draw",
  controller.executeFairDraw,
);
/* Cancel Draw and Refund Eligible Tickets */

router.patch(
  "/draws/:drawId/cancel",
  controller.cancelAdminDraw,
);

module.exports =
  router;