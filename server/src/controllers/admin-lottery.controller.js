"use strict";

const lotteryService =
  require(
    "../services/lottery.service",
  );

function sendAdminLotteryError(
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
        "ADMIN_LOTTERY_REQUEST_FAILED",
    });
}

/* ==========================================
   Create Draft Draw
========================================== */

async function createDraw(
  request,
  response,
) {
  try {
    const draw =
      await lotteryService
        .createAdminDraw(
          request.user.id,
          request.body,
        );

    return response
      .status(201)
      .json({
        success: true,

        message:
          "Lottery draft created successfully.",

        data: {
          draw,
        },
      });
  } catch (error) {
    console.error(
      "CREATE LOTTERY DRAW ERROR:",
      error,
    );

    return sendAdminLotteryError(
      response,
      error,
      "Unable to create lottery draw.",
    );
  }
}

/* ==========================================
   Open Draft Draw for Ticket Sales
========================================== */

async function openDraw(
  request,
  response,
) {
  try {
    const draw =
      await lotteryService
        .openAdminDraw(
          request.user.id,
          request.params.drawId,
        );

    return response
      .status(200)
      .json({
        success: true,

        message:
          "Lottery ticket sales opened successfully.",

        data: {
          draw,
        },
      });
  } catch (error) {
    console.error(
      "OPEN LOTTERY DRAW ERROR:",
      error,
    );

    return sendAdminLotteryError(
      response,
      error,
      "Unable to open lottery draw.",
    );
  }
}

module.exports = {
  createDraw,
  openDraw,
};