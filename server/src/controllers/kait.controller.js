"use strict";

const {
  getPublicGameState,
  placeKaitBet,
  getMyKaitBet
} = require(
  "../services/kait.service"
);

async function getKaitState(
  request,
  response,
  next
) {
  try {
    const data =
      await getPublicGameState();

    return response
      .status(200)
      .json({
        success: true,
        data
      });
  } catch (error) {
    return next(error);
  }
}

async function createKaitBet(
  request,
  response,
  next
) {
  try {
    const data =
      await placeKaitBet({
        userId:
          request.user.id,

        roundId:
          request.body?.roundId,

        selectedRank:
          request.body?.selectedRank,

        betAmount:
          request.body?.betAmount
      });

    return response
      .status(201)
      .json({
        success: true,

        message:
          "Kait bet accepted.",

        data
      });
  } catch (error) {
    return next(error);
  }
}

async function getCurrentKaitBet(
  request,
  response,
  next
) {
  try {
    const roundId =
      Number(
        request.params.roundId
      );

    const data =
      await getMyKaitBet({
        userId:
          request.user.id,

        roundId
      });

    return response
      .status(200)
      .json({
        success: true,
        data
      });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getKaitState,
  createKaitBet,
  getCurrentKaitBet
};