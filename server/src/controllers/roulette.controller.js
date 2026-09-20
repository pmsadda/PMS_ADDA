"use strict";

const {
  spinRoulette,
  getRouletteState,
} = require("../services/roulette.service");

async function state(req, res, next) {
  try {
    const data = await getRouletteState({
      userId: req.user.id,
    });

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function spin(req, res, next) {
  try {
    const data = await spinRoulette({
      userId: req.user.id,
      betAmount: req.body?.betAmount,
      selectionType: req.body?.selectionType,
      selectedNumber: req.body?.selectedNumber,
      requestId: req.body?.requestId,
    });

    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  state,
  spin,
};