"use strict";

const {
  cancelAviatorRoundByAdmin,
  refreshAviatorAfterSettingsChange,
} = require(
  "../socket/aviator.socket",
);

const {
  getAdminAnalytics,
  getGameSettings,
  updateGameSettings,
} = require(
  "../services/aviator.service",
);
/* ==========================
   Error Response
========================== */

function sendError(
  res,
  error,
) {
  const statusCode =
    Number(
      error?.statusCode,
    ) || 500;

  return res
    .status(statusCode)
    .json({
      success: false,

      code:
        error?.code ||
        "AVIATOR_ADMIN_ERROR",

      message:
        statusCode === 500
          ? "Aviator admin request failed."
          : error.message,
    });
}

/* ==========================
   Get Profit / Loss Report
========================== */

async function getAnalytics(
  req,
  res,
) {
  try {
    const result =
      await getAdminAnalytics({
        period:
          req.query?.period,
      });

    return res
      .status(200)
      .json({
        success: true,
        data: result,
      });
  } catch (error) {
    console.error(
      "ADMIN AVIATOR ANALYTICS ERROR:",
      error,
    );

    return sendError(
      res,
      error,
    );
  }
}

/* ==========================
   Get Aviator Settings
========================== */

async function getSettings(
  req,
  res,
) {
  try {
    const settings =
      await getGameSettings();

    return res
      .status(200)
      .json({
        success: true,
        data: settings,
      });
  } catch (error) {
    console.error(
      "ADMIN AVIATOR GET SETTINGS ERROR:",
      error,
    );

    return sendError(
      res,
      error,
    );
  }
}

/* ==========================
   Update Aviator Settings
========================== */

async function updateSettings(
  req,
  res,
) {
  try {
    const result =
      await updateGameSettings({
        adminId:
          req.user.id,

        isEnabled:
          req.body?.isEnabled,

        maintenanceMode:
          req.body?.maintenanceMode,

        minBet:
          req.body?.minBet,

        maxBet:
          req.body?.maxBet,

        maxPayout:
          req.body?.maxPayout,

        bettingSeconds:
          req.body?.bettingSeconds,

        roundGapSeconds:
          req.body?.roundGapSeconds,

        maxMultiplier:
          req.body?.maxMultiplier,

        houseEdgePercent:
          req.body?.houseEdgePercent,

          volatilityProfile:
  req.body?.volatilityProfile,
      });

    const io =
      req.app.get("io");

    if (io) {
  io.of("/aviator")
    .emit(
      "aviator:settings-updated",
      {
        success: true,

        serverTime:
          new Date()
            .toISOString(),

        data:
          result,
      },
    );

  try {
    await refreshAviatorAfterSettingsChange(
      io,
    );
  } catch (refreshError) {
    /*
     * Settings DB-তে already save হয়েছে।
     * Socket refresh fail হলেও
     * settings update response fail করব না।
     */
    console.error(
      "AVIATOR SETTINGS REFRESH ERROR:",
      refreshError,
    );
  }
}

    return res
      .status(200)
      .json({
        success: true,

        message:
          "Aviator settings updated.",

        data:
          result,
      });
  } catch (error) {
    console.error(
      "ADMIN AVIATOR UPDATE SETTINGS ERROR:",
      error,
    );

    return sendError(
      res,
      error,
    );
  }
}

/* ==========================
   Cancel Round + Refund
========================== */

async function cancelRound(
  req,
  res,
) {
  try {
    const roundId =
      Number(
        req.params.roundId,
      );

    if (
      !Number.isInteger(
        roundId,
      ) ||
      roundId <= 0
    ) {
      return res
        .status(400)
        .json({
          success: false,

          code:
            "AVIATOR_INVALID_ROUND",

          message:
            "Valid Aviator round ID is required.",
        });
    }

    const adminId =
      Number(
        req.user.id,
      );

    if (
      !Number.isInteger(
        adminId,
      ) ||
      adminId <= 0
    ) {
      return res
        .status(401)
        .json({
          success: false,

          code:
            "AVIATOR_INVALID_ADMIN",

          message:
            "Valid admin session is required.",
        });
    }

    const io =
      req.app.get("io");

    if (!io) {
      const error =
        new Error(
          "Socket.IO is unavailable.",
        );

      error.statusCode =
        503;

      error.code =
        "AVIATOR_SOCKET_UNAVAILABLE";

      throw error;
    }

    const result =
      await cancelAviatorRoundByAdmin(
        io,
        {
          roundId,
          adminId,
        },
      );

    return res
      .status(200)
      .json({
        success: true,

        message:
          "Aviator round cancelled and eligible bets refunded.",

        data:
          result,
      });
  } catch (error) {
    console.error(
      "ADMIN AVIATOR CANCEL ERROR:",
      error,
    );

    return sendError(
      res,
      error,
    );
  }
}

module.exports = {
  getAnalytics,
  getSettings,
  updateSettings,
  cancelRound,
};