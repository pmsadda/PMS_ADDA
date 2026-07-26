"use strict";

const pokerService =
  require(
    "../services/poker.service",
  );

async function joinMatchmaking(
  req,
  res,
) {
  try {
    const userId =
      req.user.id;

    const {
      bigBlind,
      buyInAmount,
    } = req.body;

    const data =
      await pokerService
        .joinMatchmaking(
          userId,
          bigBlind,
          buyInAmount,
        );

    return res.status(200).json({
      success: true,

      message:
        data.alreadyJoined
          ? "Existing Poker table loaded."
          : "Poker matchmaking successful.",

      data,
    });
  } catch (error) {
    console.error(
      "POKER MATCHMAKING ERROR:",
      error,
    );

    return res
      .status(
        error.statusCode ||
        error.status ||
        500,
      )
      .json({
        success: false,

        message:
          error.message ||
          "Poker matchmaking failed.",
      });
  }
}

async function getTableState(
  req,
  res,
) {
  try {
    const data =
      await pokerService
        .getTableState(
          req.params.tableId,
        );

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error(
      "GET POKER TABLE ERROR:",
      error,
    );

    return res
      .status(
        error.statusCode ||
        error.status ||
        500,
      )
      .json({
        success: false,

        message:
          error.message ||
          "Unable to load Poker table.",
      });
  }
}

module.exports = {
  joinMatchmaking,
  getTableState,
};