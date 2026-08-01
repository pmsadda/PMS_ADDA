"use strict";

const teenPattiService = require("../services/teenpatti.service");

function sendControllerError(response, error, fallbackMessage) {
  const statusCode = Number(error.statusCode || error.status) || 500;

  return response.status(statusCode).json({
    success: false,

    code: error.code || "TEEN_PATTI_REQUEST_FAILED",

    message: error.message || fallbackMessage,
  });
}

/* =========================================================
   MATCHMAKING
========================================================= */

async function joinMatchmaking(request, response) {
  try {
    const userId = Number(request.user.id);

    const bootAmount = request.body?.bootAmount;

    const result = await teenPattiService.joinMatchmaking(userId, bootAmount);

    return response.status(200).json({
      success: true,

      message: "Teen Patti matchmaking successful.",

      data: result,
    });
  } catch (error) {
    console.error("TEEN PATTI MATCHMAKING ERROR:", error);

    return sendControllerError(
      response,
      error,
      "Teen Patti matchmaking failed.",
    );
  }
}

/* =========================================================
   SAFE PUBLIC TABLE STATE
========================================================= */

async function getTableState(request, response) {
  try {
    const tableId = Number(request.params.tableId);

    const userId = Number(request.user.id);

    /*
     * HTTP route শুধু public table state দেবে।
     * Private cards Socket.IO hand:get-state
     * event দিয়েই পাঠানো হবে।
     */
    const result = await teenPattiService.getTableState(tableId, userId);

    return response.status(200).json({
      success: true,

      message: "Teen Patti table state loaded.",

      data: result,
    });
  } catch (error) {
    console.error("GET TEEN PATTI TABLE STATE ERROR:", error);

    return sendControllerError(
      response,
      error,
      "Failed to load Teen Patti table state.",
    );
  }
}

/* =========================================================
   EXPLICIT TABLE EXIT
========================================================= */

async function leaveTable(request, response) {
  try {
    const tableId = Number(request.params.tableId);
    const userId = Number(request.user.id);

    const result = await teenPattiService.leaveTeenPattiTable(tableId, userId);

    return response.status(200).json({
      success: true,
      message: "Teen Patti table cleared successfully.",
      data: result,
    });
  } catch (error) {
    console.error("LEAVE TEEN PATTI TABLE ERROR:", error);

    return sendControllerError(
      response,
      error,
      "Failed to leave Teen Patti table.",
    );
  }
}

module.exports = {
  joinMatchmaking,
  getTableState,
  leaveTable,
};
