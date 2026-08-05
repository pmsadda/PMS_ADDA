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
   Get Admin Lottery Draws
========================================== */

async function getDraws(
  request,
  response,
) {
  try {
    const data =
      await lotteryService
        .getAdminLotteryDraws(
          request.query,
        );

    return response
      .status(200)
      .json({
        success: true,

        message:
          "Admin lottery draws loaded successfully.",

        data,
      });
  } catch (error) {
    console.error(
      "GET ADMIN LOTTERY DRAWS ERROR:",
      error,
    );

    return sendAdminLotteryError(
      response,
      error,
      "Unable to load admin lottery draws.",
    );
  }
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

/* ==========================================
   Cancel Lottery Draw
========================================== */

async function cancelAdminDraw(
  request,
  response,
) {
  try {
    const data =
      await lotteryService
        .cancelAdminDraw(
          request.user.id,
          request.params.drawId,
          request.body?.reason,
        );

    return response
      .status(200)
      .json({
        success: true,

        message:
          data.alreadyCancelled
            ? "Lottery draw was already cancelled."
            : "Lottery draw cancelled and all eligible tickets refunded successfully.",

        data,
      });
  } catch (error) {
    console.error(
      "ADMIN LOTTERY DRAW CANCEL ERROR:",
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
          "ADMIN_LOTTERY_CANCEL_ERROR",

        message:
          error.message ||
          "Lottery draw cancellation failed.",
      });
  }
}

/* ==========================================
   Execute Cryptographic Fair Draw
========================================== */

async function executeFairDraw(
  request,
  response,
) {
  try {
    const data =
      await lotteryService
        .executeAdminFairDraw(
          request.user.id,
          request.params.drawId,
        );

    return response
      .status(200)
      .json({
        success: true,

        message:
          data.alreadyCompleted
            ? "Lottery draw was already completed."
            : "Fair lottery draw completed and prizes paid successfully.",

        data,
      });
  } catch (error) {
    console.error(
      "EXECUTE FAIR LOTTERY DRAW ERROR:",
      error,
    );

    return sendAdminLotteryError(
      response,
      error,
      "Unable to execute fair lottery draw.",
    );
  }
}

module.exports = {
  getDraws,
  createDraw,
  openDraw,
  cancelAdminDraw,
  executeFairDraw,
};