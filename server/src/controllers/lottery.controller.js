"use strict";

const lotteryService =
  require(
    "../services/lottery.service",
  );

/* ==========================================
   Controller Error Response
========================================== */

function sendControllerError(
  response,
  error,
  fallbackMessage,
) {
  const statusCode =
    Number(
      error.statusCode ||
        error.status ||
        500,
    );

  return response
    .status(statusCode)
    .json({
      success: false,

      message:
        error.message ||
        fallbackMessage,

      code:
        error.code ||
        "LOTTERY_REQUEST_FAILED",
    });
}

/* ==========================================
   Get Public Lottery Draws
========================================== */

async function getPublicDraws(
  request,
  response,
) {
  try {
    const draws =
      await lotteryService
        .getPublicDraws(
          request.user.id,
        );

    return response
      .status(200)
      .json({
        success: true,

        message:
          "Lottery draws loaded successfully.",

        data: {
          draws,
        },
      });
  } catch (error) {
    console.error(
      "GET LOTTERY DRAWS ERROR:",
      error,
    );

    return sendControllerError(
      response,
      error,
      "Unable to load lottery draws.",
    );
  }
}

/* ==========================================
   Get Lottery Draw Details
========================================== */

async function getDrawDetails(
  request,
  response,
) {
  try {
    const data =
      await lotteryService
        .getDrawDetails(
          request.user.id,
          request.params.drawId,
        );

    return response
      .status(200)
      .json({
        success: true,

        message:
          "Lottery draw loaded successfully.",

        data,
      });
  } catch (error) {
    console.error(
      "GET LOTTERY DRAW ERROR:",
      error,
    );

    return sendControllerError(
      response,
      error,
      "Unable to load lottery draw.",
    );
  }
}

/* ==========================================
   Get Current User Lottery Tickets
========================================== */

async function getMyTickets(
  request,
  response,
) {
  try {
    const data =
      await lotteryService
        .getMyTickets(
          request.user.id,
          {
            page:
              request.query.page,

            limit:
              request.query.limit,
          },
        );

    return response
      .status(200)
      .json({
        success: true,

        message:
          "Lottery tickets loaded successfully.",

        data,
      });
  } catch (error) {
    console.error(
      "GET MY LOTTERY TICKETS ERROR:",
      error,
    );

    return sendControllerError(
      response,
      error,
      "Unable to load lottery tickets.",
    );
  }
}

/* ==========================================
   Get Recent Lottery Winners
========================================== */

async function getRecentWinners(
  request,
  response,
) {
  try {
    const winners =
      await lotteryService
        .getRecentWinners(
          request.query.limit,
        );

    return response
      .status(200)
      .json({
        success: true,

        message:
          "Lottery winners loaded successfully.",

        data: {
          winners,
        },
      });
  } catch (error) {
    console.error(
      "GET LOTTERY WINNERS ERROR:",
      error,
    );

    return sendControllerError(
      response,
      error,
      "Unable to load lottery winners.",
    );
  }
}

/* ==========================================
   Controller Exports
========================================== */

module.exports = {
  getPublicDraws,
  getDrawDetails,
  getMyTickets,
  getRecentWinners,
};