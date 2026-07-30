"use strict";

const express =
  require("express");

const adminGamesController =
  require(
    "../controllers/admin-games.controller"
  );

const {
  requireAuth,
  requireAdmin
} = require(
  "../middleware/auth.middleware"
);

const router =
  express.Router();

/*
 * Room create, update, status এবং
 * delete—সব endpoint Admin-only।
 */

router.use(
  requireAuth,
  requireAdmin
);

router.get(
  "/summary",
  adminGamesController
    .getGameSummary
);

router.get(
  "/",
  adminGamesController
    .getRooms
);

router.get(
  "/:roomId",
  adminGamesController
    .getRoomById
);

router.post(
  "/",
  adminGamesController
    .createRoom
);

router.patch(
  "/:roomId",
  adminGamesController
    .updateRoom
);

router.patch(
  "/:roomId/status",
  adminGamesController
    .updateRoomStatus
);

router.delete(
  "/:roomId",
  adminGamesController
    .deleteRoom
);

module.exports = router;