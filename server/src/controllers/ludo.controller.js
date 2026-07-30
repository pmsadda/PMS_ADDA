"use strict";

const ludoService =
  require("../services/ludo.service");


  /* ==========================================
   Get Available Ludo Rooms
========================================== */

async function getAvailableRooms(
  req,
  res,
) {
  try {
    const rooms =
      await ludoService
        .getAvailableRooms();

    return res
      .status(200)
      .json({
        success: true,

        message:
          "Ludo rooms loaded successfully.",

        data: {
          rooms,
        },
      });
  } catch (error) {
    console.error(
      "GET LUDO ROOMS ERROR:",
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
          "Unable to load Ludo rooms.",
      });
  }
}

/* ==========================================
   Join Ludo Matchmaking
========================================== */

async function joinMatchmaking(
  req,
  res
) {
  try {
    const userId =
      req.user.id;

    const {
      entryAmount,
      playerMode = 2,
    } = req.body;

    const data =
      await ludoService.joinMatchmaking(
        userId,
        entryAmount,
        playerMode
      );

    return res.status(200).json({
      success: true,

      message:
        data.matchmaking.alreadyJoined
          ? "Existing Ludo match loaded."
          : "Ludo matchmaking successful.",

      data,
    });
  } catch (error) {
    console.error(
      "LUDO MATCHMAKING ERROR:",
      error
    );

    return res
      .status(
        error.statusCode ||
          error.status ||
          500
      )
      .json({
        success: false,

        message:
          error.message ||
          "Ludo matchmaking failed.",
      });
  }
}

/* ==========================================
   Get Ludo Match State
========================================== */

async function getMatchState(
  req,
  res
) {
  try {
    const matchId =
      req.params.matchId;

    const data =
      await ludoService.getMatchState(
        matchId
      );

    return res.status(200).json({
      success: true,

      message:
        "Ludo match state loaded successfully.",

      data,
    });
  } catch (error) {
    console.error(
      "GET LUDO MATCH ERROR:",
      error
    );

    return res
      .status(
        error.statusCode ||
          error.status ||
          500
      )
      .json({
        success: false,

        message:
          error.message ||
          "Unable to load Ludo match.",
      });
  }
}

module.exports = {
  getAvailableRooms,
  joinMatchmaking,
  getMatchState,
};