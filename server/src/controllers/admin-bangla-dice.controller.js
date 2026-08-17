"use strict";

const adminService =
  require(
    "../services/admin-bangla-dice.service",
  );

function sendError(
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
        "ADMIN_BANGLA_DICE_ERROR",

      message:
        error.message ||
        fallbackMessage,
    });
}

function getIpAddress(
  request,
) {
  const forwarded =
    String(
      request.headers[
        "x-forwarded-for"
      ] ||
      "",
    )
      .split(",")[0]
      .trim();

  return (
    forwarded ||
    request.ip ||
    request.socket
      ?.remoteAddress ||
    null
  );
}

async function getDashboard(
  request,
  response,
) {
  try {
    const data =
      await adminService
        .getAdminDashboard();

    return response
      .status(200)
      .json({
        success: true,

        message:
          "Bangla Dice admin dashboard loaded.",

        data,
      });
  } catch (error) {
    console.error(
      "DICE ADMIN DASHBOARD ERROR:",
      error,
    );

    return sendError(
      response,
      error,
      "Unable to load Dice admin dashboard.",
    );
  }
}

async function updateSettings(
  request,
  response,
) {
  try {
    const data =
      await adminService
        .updateSettings({
          adminUserId:
            request.user.id,

          payload:
            request.body,

          ipAddress:
            getIpAddress(
              request,
            ),
        });

    const io =
      request.app.get("io");

    if (io) {
      io.of(
        "/bangla-dice",
      ).emit(
        "bangla-dice:settings-updated",
        {
          success: true,
          data: {
            settings: data,
          },
        },
      );
    }

    return response
      .status(200)
      .json({
        success: true,

        message:
          "Bangla Dice settings updated. Changes apply from the next round.",

        data,
      });
  } catch (error) {
    console.error(
      "DICE ADMIN SETTINGS ERROR:",
      error,
    );

    return sendError(
      response,
      error,
      "Unable to update Dice settings.",
    );
  }
}

async function updateSymbols(
  request,
  response,
) {
  try {
    const data =
      await adminService
        .updateSymbols({
          adminUserId:
            request.user.id,

          symbols:
            request.body
              ?.symbols,

          ipAddress:
            getIpAddress(
              request,
            ),
        });

    const io =
      request.app.get("io");

    if (io) {
      io.of(
        "/bangla-dice",
      ).emit(
        "bangla-dice:symbols-updated",
        {
          success: true,
          data: {
            symbols: data,
          },
        },
      );
    }

    return response
      .status(200)
      .json({
        success: true,

        message:
          "Dice multipliers and probability weights updated. Changes apply from the next round.",

        data: {
          symbols: data,
        },
      });
  } catch (error) {
    console.error(
      "DICE ADMIN SYMBOL ERROR:",
      error,
    );

    return sendError(
      response,
      error,
      "Unable to update Dice symbols.",
    );
  }
}

async function getRounds(
  request,
  response,
) {
  try {
    const data =
      await adminService
        .getAdminRounds(
          request.query,
        );

    return response
      .status(200)
      .json({
        success: true,

        message:
          "Bangla Dice rounds loaded.",

        data,
      });
  } catch (error) {
    return sendError(
      response,
      error,
      "Unable to load Dice rounds.",
    );
  }
}

async function getRoundBets(
  request,
  response,
) {
  try {
    const data =
      await adminService
        .getAdminRoundBets(
          request.params
            ?.roundId,
        );

    return response
      .status(200)
      .json({
        success: true,

        message:
          "Bangla Dice round bets loaded.",

        data,
      });
  } catch (error) {
    return sendError(
      response,
      error,
      "Unable to load Dice round bets.",
    );
  }
}

module.exports = {
  getDashboard,
  updateSettings,
  updateSymbols,
  getRounds,
  getRoundBets,
};