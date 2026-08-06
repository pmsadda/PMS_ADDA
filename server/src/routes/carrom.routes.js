"use strict";

const express =
  require("express");

const controller =
  require(
    "../controllers/carrom.controller",
  );

const {
  requireAuth,
} = require(
  "../middleware/auth.middleware",
);

const router =
  express.Router();

/* ==========================================
   PMS ADDA Carrom Routes
========================================== */

/*
 * GET /api/carrom/rooms?playerMode=2
 *
 * GET /api/carrom/rooms?playerMode=4
 */
router.get(
  "/rooms",
  requireAuth,
  controller.getAvailableRooms,
);

module.exports =
  router;