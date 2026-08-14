"use strict";

const adminService =
  require(
    "../services/admin-andar-bahar.service",
  );

/* =========================================================
   ERROR RESPONSE
========================================================= */

function sendAdminError(
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
        "ADMIN_ANDAR_BAHAR_ERROR",

      message:
        error.message ||
        fallbackMessage,
    });
}

/* =========================================================
   GET DASHBOARD
========================================================= */

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
          "Andar Bahar admin dashboard loaded successfully.",

        data,
      });
  } catch (error) {
    console.error(
      "GET ANDAR BAHAR ADMIN DASHBOARD ERROR:",
      error,
    );

    return sendAdminError(
      response,
      error,
      "Unable to load Andar Bahar admin dashboard.",
    );
  }
}

/* =========================================================
   UPDATE SETTINGS
========================================================= */

async function updateSettings(
  request,
  response,
) {
  try {
    const forwardedAddress =
      String(
        request.headers[
          "x-forwarded-for"
        ] || "",
      )
        .split(",")[0]
        .trim();

    const ipAddress =
      forwardedAddress ||
      request.ip ||
      request.socket
        ?.remoteAddress ||
      null;

    const settings =
      await adminService
        .updateGameSettings(
          request.user.id,
          request.body,
          {
            ipAddress,

            userAgent:
              request.headers[
                "user-agent"
              ] ||
              null,
          },
        );

    /*
     * Connected game clients-কে নতুন settings জানানো।
     * বর্তমান round-এর locked setting বদলাবে না;
     * পরের round থেকে timing কার্যকর হবে।
     */
    const io =
      request.app.get("io");

    if (io) {
      io.of(
        "/andar-bahar",
      ).emit(
        "andar-bahar:settings-updated",
        {
          success: true,
          settings,
          serverTime:
            new Date()
              .toISOString(),
        },
      );
    }

    return response
      .status(200)
      .json({
        success: true,

        message:
          "Andar Bahar settings updated successfully.",

        data: {
          settings,
        },
      });
  } catch (error) {
    console.error(
      "UPDATE ANDAR BAHAR SETTINGS ERROR:",
      error,
    );

    return sendAdminError(
      response,
      error,
      "Unable to update Andar Bahar settings.",
    );
  }
}

/* =========================================================
   GET ROUND HISTORY
========================================================= */

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
          "Andar Bahar rounds loaded successfully.",

        data,
      });
  } catch (error) {
    console.error(
      "GET ANDAR BAHAR ADMIN ROUNDS ERROR:",
      error,
    );

    return sendAdminError(
      response,
      error,
      "Unable to load Andar Bahar round history.",
    );
  }
}

/* =========================================================
   GET ROUND BETS
========================================================= */

async function getRoundBets(
  request,
  response,
) {
  try {
    const data =
      await adminService
        .getAdminRoundBets(
          request.params.roundId,
        );

    return response
      .status(200)
      .json({
        success: true,

        message:
          "Andar Bahar round bets loaded successfully.",

        data,
      });
  } catch (error) {
    console.error(
      "GET ANDAR BAHAR ROUND BETS ERROR:",
      error,
    );

    return sendAdminError(
      response,
      error,
      "Unable to load Andar Bahar round bets.",
    );
  }
}

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  getDashboard,
  updateSettings,
  getRounds,
  getRoundBets,
};