"use strict";

const {
  getBlackjackState,
  startBlackjackHand,
  playBlackjackAction,
} = require("../services/blackjack.service");

async function state(req, res, next) {
  try {
    const data = await getBlackjackState({
      userId: req.user.id,
    });

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function start(req, res, next) {
  try {
    const data = await startBlackjackHand({
      userId: req.user.id,
      betAmount: req.body?.betAmount,
      requestId: req.body?.requestId,
    });

    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function action(req, res, next) {
  try {
    const data = await playBlackjackAction({
      userId: req.user.id,
      handId: req.body?.handId,
      action: req.params.action,
      actionId: req.body?.actionId,
    });

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  state,
  start,
  action,
};