"use strict";

const pokerService = require("../services/poker.service");

const { publishPokerExitFromHttp } = require("../socket/poker.socket");

function sendPokerControllerError(
  response,
  error,
  fallbackMessage,
) {
  const requestedStatus =
    Number(
      error?.statusCode ||
      error?.status,
    );

  const statusCode =
    requestedStatus >= 400 &&
    requestedStatus < 500
      ? requestedStatus
      : 500;

  const publicMessage =
    statusCode === 500
      ? fallbackMessage
      : (
          error?.message ||
          fallbackMessage
        );

  return response
    .status(statusCode)
    .json({
      success: false,

      code:
        statusCode === 500
          ? "POKER_INTERNAL_ERROR"
          : (
              error?.code ||
              "POKER_REQUEST_FAILED"
            ),

      message: publicMessage,
    });
}

async function joinMatchmaking(req, res) {
  try {
    const userId = req.user.id;

    const { bigBlind, buyInAmount } = req.body;

    const data = await pokerService.joinMatchmaking(
      userId,
      bigBlind,
      buyInAmount,
    );

    return res.status(200).json({
      success: true,

      message: data.alreadyJoined
        ? "Existing Poker table loaded."
        : "Poker matchmaking successful.",

      data,
    });
  } catch (error) {
    console.error("POKER MATCHMAKING ERROR:", error);

   return sendPokerControllerError(
  res,
  error,
  "Poker matchmaking failed.",
);
  }
}

async function getTableState(req, res) {
  try {
    const data = await pokerService.getTableState(req.params.tableId);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("GET POKER TABLE ERROR:", error);

    return sendPokerControllerError(
  res,
  error,
  "Unable to load Poker table.",
);
  }
}

async function exitTable(req, res) {
  try {
    const data = await pokerService.exitPokerTable(
      req.params.tableId,
      req.user.id,
    );

    try {
      await publishPokerExitFromHttp(req.params.tableId, data);
    } catch (publishError) {
      /*
       * Cash-out ইতোমধ্যে database-এ
       * commit হয়েছে। তাই socket publish
       * failure-এর জন্য user-কে আবার
       * Exit retry করতে বলা হবে না।
       */
      console.error("POKER HTTP EXIT PUBLISH ERROR:", publishError);
    }

    return res.status(200).json({
      success: true,
      message: "Poker table exited successfully.",
      data,
    });
  } catch (error) {
    console.error("POKER TABLE EXIT ERROR:", error);

    return sendPokerControllerError(
  res,
  error,
  "Unable to exit Poker table.",
);
  }
}

module.exports = {
  joinMatchmaking,
  getTableState,
  exitTable,
};
