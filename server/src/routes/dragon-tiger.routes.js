"use strict";

const express = require("express");
const game = require("../services/dragon-tiger.service");
const {
  requireAuth,
  requireAdmin
} = require("../middleware/auth.middleware");

const playerRouter = express.Router();
const adminRouter = express.Router();

const handle = (action) => async (req, res) => {
  try {
    res.json({
      success: true,
      data: await action(req)
    });
  } catch (error) {
    const status = Number(error.statusCode) || 500;

    if (status >= 500) console.error("DRAGON TIGER:", error);

    res.status(status).json({
      success: false,
      message: status >= 500
        ? "Dragon Tiger request failed."
        : error.message
    });
  }
};

playerRouter.use(requireAuth);

playerRouter.get("/state", handle(req => game.getState(req.user.id)));
playerRouter.get("/history", handle(req => game.getHistory(req.user.id)));
playerRouter.post("/play", handle(req => game.play(req.user.id, req.body)));

adminRouter.use(requireAuth, requireAdmin);

adminRouter.get("/settings", handle(() => game.settings()));
adminRouter.patch("/settings", handle(req => game.updateSettings(req.body)));
adminRouter.get("/report", handle(() => game.getReport()));

module.exports = { playerRouter, adminRouter };