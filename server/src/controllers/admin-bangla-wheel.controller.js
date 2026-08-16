"use strict";

const adminService =
  require(
    "../services/admin-bangla-wheel.service"
  );

/* =========================================================
   ERROR RESPONSE
========================================================= */

function sendAdminError(
  response,
  error,
  fallbackMessage
) {
  const statusCode =
    Number(
      error.statusCode ||
      error.status ||
      500
    );

  return response
    .status(statusCode)
    .json({
      success: false,

      code:
        error.code ||
        "ADMIN_BANGLA_WHEEL_ERROR",

      message:
        error.message ||
        fallbackMessage
    });
}

function getRequestMetadata(
  request
) {
  const forwardedAddress =
    String(
      request.headers[
        "x-forwarded-for"
      ] || ""
    )
      .split(",")[0]
      .trim();

  return {
    ipAddress:
      forwardedAddress ||
      request.ip ||
      request.socket
        ?.remoteAddress ||
      null,

    userAgent:
      request.headers[
        "user-agent"
      ] ||
      null
  };
}

/* =========================================================
   DASHBOARD
========================================================= */

async function getDashboard(
  request,
  response
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
          "Bangla Wheel admin dashboard loaded successfully.",

        data
      });
  } catch (error) {
    console.error(
      "GET BANGLA WHEEL ADMIN DASHBOARD ERROR:",
      error
    );

    return sendAdminError(
      response,
      error,
      "Unable to load Bangla Wheel admin dashboard."
    );
  }
}

/* =========================================================
   SCHEDULE CONFIGURATION
========================================================= */

async function scheduleConfiguration(
  request,
  response
) {
  try {
    const data =
      await adminService
        .scheduleConfiguration(
          request.user.id,
          request.body,
          getRequestMetadata(
            request
          )
        );

    const io =
      request.app.get("io");

    if (io) {
      io.of(
        "/bangla-wheel"
      ).emit(
        "bangla-wheel:configuration-scheduled",
        {
          success: true,

          configVersion:
            data.configVersion,

          message:
            "New configuration will apply from the next round.",

          serverTime:
            new Date()
              .toISOString()
        }
      );
    }

    return response
      .status(202)
      .json({
        success: true,

        message:
          "Bangla Wheel configuration scheduled for the next round.",

        data
      });
  } catch (error) {
    console.error(
      "SCHEDULE BANGLA WHEEL CONFIG ERROR:",
      error
    );

    return sendAdminError(
      response,
      error,
      "Unable to schedule Bangla Wheel configuration."
    );
  }
}

/* =========================================================
   ROUND HISTORY
========================================================= */

async function getRounds(
  request,
  response
) {
  try {
    const data =
      await adminService
        .getAdminRounds(
          request.query
        );

    return response
      .status(200)
      .json({
        success: true,

        message:
          "Bangla Wheel rounds loaded successfully.",

        data
      });
  } catch (error) {
    console.error(
      "GET BANGLA WHEEL ADMIN ROUNDS ERROR:",
      error
    );

    return sendAdminError(
      response,
      error,
      "Unable to load Bangla Wheel rounds."
    );
  }
}

/* =========================================================
   ROUND BETS
========================================================= */

async function getRoundBets(
  request,
  response
) {
  try {
    const data =
      await adminService
        .getAdminRoundBets(
          request.params.roundId
        );

    return response
      .status(200)
      .json({
        success: true,

        message:
          "Bangla Wheel round bets loaded successfully.",

        data
      });
  } catch (error) {
    console.error(
      "GET BANGLA WHEEL ROUND BETS ERROR:",
      error
    );

    return sendAdminError(
      response,
      error,
      "Unable to load Bangla Wheel round bets."
    );
  }
}

/* =========================================================
   AUDIT LOGS
========================================================= */

async function getAuditLogs(
  request,
  response
) {
  try {
    const data =
      await adminService
        .getAdminAuditLogs(
          request.query
        );

    return response
      .status(200)
      .json({
        success: true,

        message:
          "Bangla Wheel audit logs loaded successfully.",

        data
      });
  } catch (error) {
    console.error(
      "GET BANGLA WHEEL AUDIT LOGS ERROR:",
      error
    );

    return sendAdminError(
      response,
      error,
      "Unable to load Bangla Wheel audit logs."
    );
  }
}

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  getDashboard,
  scheduleConfiguration,
  getRounds,
  getRoundBets,
  getAuditLogs
};