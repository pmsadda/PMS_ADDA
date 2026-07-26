const express = require("express");

const adminGamesController = require(
    "../controllers/admin-games.controller"
);

const router = express.Router();

router.get(
    "/summary",
    adminGamesController.getGameSummary
);

router.get(
    "/",
    adminGamesController.getRooms
);

router.get(
    "/:roomId",
    adminGamesController.getRoomById
);

router.post(
    "/",
    adminGamesController.createRoom
);

router.patch(
    "/:roomId",
    adminGamesController.updateRoom
);

router.patch(
    "/:roomId/status",
    adminGamesController.updateRoomStatus
);

router.delete(
    "/:roomId",
    adminGamesController.deleteRoom
);

module.exports = router;