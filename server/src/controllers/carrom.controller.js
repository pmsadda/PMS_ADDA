"use strict";

const carromService =
  require("../services/carrom.service");

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
    const rooms =
      await carromService
        .getAvailableRooms(
          request.query?.playerMode,
        );

    return response
      .status(200)
      .json({
        success: true,

        message:
          "Carrom rooms loaded successfully.",

        data: {
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
   Join Carrom Matchmaking
========================================== */

async function joinMatchmaking(
  request,
  response,
) {
  return response
    .status(503)
    .json({
      success: false,

      code:
        "CARROM_UNDER_DEVELOPMENT",

      message:
        "Carrom-এর কাজ চলছে। শীঘ্রই চালু হবে।",
    });
}

/* ==========================================
   Get Carrom Match State
========================================== */

async function getMatchState(
  request,
  response,
) {
  try {
    const data =
      await carromService
        .getCarromMatchState(
          request.params.matchId,
          request.user.id,
        );

    return response
      .status(200)
      .json({
        success: true,

        message:
          "Carrom match state loaded successfully.",

        data,
      });
  } catch (error) {
    console.error(
      "GET CARROM MATCH STATE ERROR:",
      error,
    );

    return sendCarromError(
      response,
      error,
      "Unable to load Carrom match.",
    );
  }
}

/* ==========================================
   Controller Exports
========================================== */

module.exports = {
  getAvailableRooms,
  joinMatchmaking,
  getMatchState,
};