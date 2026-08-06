"use strict";

const carromService =
  require(
    "../services/carrom.service",
  );

/* ==========================================
   Controller Error Response
========================================== */

function sendCarromError(
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

      code:
        error.code ||
        "CARROM_REQUEST_FAILED",

      message:
        error.message ||
        fallbackMessage,
    });
}

/* ==========================================
   Get Available Carrom Rooms
========================================== */

async function getAvailableRooms(
  request,
  response,
) {
  try {
    const playerMode =
      request.query
        .playerMode || 2;

    const rooms =
      await carromService
        .getAvailableRooms(
          playerMode,
        );

    return response
      .status(200)
      .json({
        success: true,

        message:
          "Carrom rooms loaded successfully.",

        data: {
          playerMode:
            Number(playerMode),

          rooms,
        },
      });
  } catch (error) {
    console.error(
      "GET CARROM ROOMS ERROR:",
      error,
    );

    return sendCarromError(
      response,
      error,
      "Unable to load Carrom rooms.",
    );
  }
}

/* ==========================================
   Controller Exports
========================================== */

module.exports = {
  getAvailableRooms,
};