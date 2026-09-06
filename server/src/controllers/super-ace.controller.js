"use strict";

const {
  spinSuperAce,
  getSuperAcePlayerState,
  getMySuperAceHistory,
} = require("../services/super-ace.service");

async function getState(req, res, next) {
  try {
    const state = await getSuperAcePlayerState({
      userId: req.user.id,
    });

    return res.status(200).json({
      success: true,
      data: {
        state,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function spin(req, res, next) {
  try {
    const result = await spinSuperAce({
      userId: req.user.id,
      betAmount: req.body?.betAmount,
    });

    return res.status(201).json({
      success: true,
      message: "Super Ace spin completed.",
      data: {
        spin: result,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function getHistory(req, res, next) {
  try {
    const history = await getMySuperAceHistory({
      userId: req.user.id,
      limit: req.query?.limit,
    });

    return res.status(200).json({
      success: true,
      data: {
        history,
      },
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getState,
  spin,
  getHistory,
};