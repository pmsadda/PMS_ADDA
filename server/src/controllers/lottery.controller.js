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
   Purchase Lottery Tickets
========================================== */

async function purchaseTickets(
  request,
  response,
) {
  try {
    const data =
      await lotteryService.purchaseTickets(
        request.user.id,
        request.params.drawId,
        {
          quantity:
            request.body?.quantity,

          requestKey:
            request.body?.requestKey,
        },
      );

    return response
      .status(
        data.alreadyProcessed
          ? 200
          : 201,
      )
      .json({
        success: true,

        message:
          data.alreadyProcessed
            ? "Existing lottery ticket purchase loaded successfully."
            : "Lottery ticket purchase completed successfully.",

        data,
      });
  } catch (error) {
    console.error(
      "LOTTERY TICKET PURCHASE ERROR:",
      error,
    );

    return response
      .status(
        error.statusCode ||
          error.status ||
          500,
      )
      .json({
        success: false,

        code:
          error.code ||
          "LOTTERY_PURCHASE_ERROR",

        message:
          error.message ||
          "Lottery ticket purchase failed.",
      });
  }
}

/* ==========================================
   Cancel Lottery Ticket
========================================== */

async function cancelTicket(
  request,
  response,
) {
  try {
    const data =
      await lotteryService.cancelTicket(
        request.user.id,
        request.params.ticketId,
      );

    return response
      .status(200)
      .json({
        success: true,

        message:
          data.alreadyCancelled
            ? "Existing ticket cancellation loaded successfully."
            : "Lottery ticket cancelled and refund completed successfully.",

        data,
      });
  } catch (error) {
    console.error(
      "LOTTERY TICKET CANCEL ERROR:",
      error,
    );

    return response
      .status(
        error.statusCode ||
          error.status ||
          500,
      )
      .json({
        success: false,

        code:
          error.code ||
          "LOTTERY_CANCEL_ERROR",

        message:
          error.message ||
          "Lottery ticket cancellation failed.",
      });
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
  purchaseTickets,
    cancelTicket,
};