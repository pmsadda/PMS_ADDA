"use strict";
const jwt =
  require("jsonwebtoken");

const {
  getAdminAppDownload,
  getPublicAppInfo,
  uploadApp,
  updateDownloadSettings,
  getApkDownload,
  finalizeAppDownload,
  getAdminDownloadHistory,
} = require("../services/app-download.service");


/* =========================================================
   ERROR RESPONSE
========================================================= */

function handleError(
  res,
  error,
) {
  console.error(
    "APP DOWNLOAD ERROR:",
    error,
  );

  return res
    .status(
      Number(
        error.statusCode || 500,
      ),
    )
    .json({
      success: false,

      code:
        error.code ||
        "APP_DOWNLOAD_ERROR",

      message:
        error.message ||
        "Something went wrong.",
    });
}

/* =========================================================
   ADMIN — GET DOWNLOAD HISTORY
========================================================= */

async function getDownloadHistory(
  req,
  res
) {
  try {
    const history =
      await getAdminDownloadHistory({
        page:
          req.query?.page,

        limit:
          req.query?.limit,

        search:
          req.query?.search
      });

    return res.json({
      success: true,

      data: {
        history:
          history.items,

        pagination:
          history.pagination
      }
    });
  } catch (error) {
    return handleError(
      res,
      error
    );
  }
}

/* =========================================================
   ADMIN — GET APP SETTINGS
========================================================= */

async function getAdminAppSettings(
  req,
  res,
) {
  try {
    const settings =
      await getAdminAppDownload();

    return res.json({
      success: true,

      data: {
        settings,
      },
    });

  } catch (error) {
    return handleError(
      res,
      error,
    );
  }
}


/* =========================================================
   PUBLIC — APP INFO
========================================================= */

async function getAppInfo(
  req,
  res,
) {
  try {
    const app =
      await getPublicAppInfo();

    return res.json({
      success: true,

      data: {
        app,
      },
    });

  } catch (error) {
    return handleError(
      res,
      error,
    );
  }
}


/* =========================================================
   ADMIN — UPLOAD APK
========================================================= */

async function uploadApk(
  req,
  res,
) {
  try {
    const result =
      await uploadApp({
        file:
          req.file,

        appVersion:
          req.body
            ?.appVersion,
      });

    return res.json({
      success: true,

      message:
        "APK uploaded successfully.",

      data: {
        settings:
          result,
      },
    });

  } catch (error) {
    return handleError(
      res,
      error,
    );
  }
}


/* =========================================================
   ADMIN — ENABLE / DISABLE DOWNLOAD
========================================================= */

async function updateAppSettings(
  req,
  res,
) {
  try {
    const settings =
      await updateDownloadSettings(
        req.body || {},
      );

    return res.json({
      success: true,

      message:
        settings.downloadEnabled
          ? "App download enabled."
          : "App download disabled.",

      data: {
        settings,
      },
    });

  } catch (error) {
    return handleError(
      res,
      error,
    );
  }
}
/* =========================================================
   AUTHENTICATED — CREATE DOWNLOAD TICKET
========================================================= */

async function createDownloadTicket(
  req,
  res
) {
  try {
    const userId =
      Number(
        req.user?.id
      );

    if (
      !Number.isInteger(userId) ||
      userId < 1
    ) {
      return res
        .status(401)
        .json({
          success: false,
          code:
            "AUTH_REQUIRED",
          message:
            "Authentication is required."
        });
    }

    const downloadTicket =
      jwt.sign(
        {
          id:
            userId,

          purpose:
            "app_download"
        },
        process.env.JWT_SECRET,
        {
          algorithm:
            "HS256",

          expiresIn:
            "2m"
        }
      );

    return res.json({
      success: true,

      data: {
        downloadTicket,
        expiresInSeconds:
          120
      }
    });
  } catch (error) {
    return handleError(
      res,
      error
    );
  }
}

/* =========================================================
   PUBLIC — DOWNLOAD APK
========================================================= */

async function downloadApk(
  req,
  res
) {
  let historyId =
    null;

  let finalized =
    false;

  function finalize(
    succeeded
  ) {
    if (
      finalized ||
      !historyId
    ) {
      return;
    }

    finalized = true;

    finalizeAppDownload(
      historyId,
      succeeded
    ).catch((error) => {
      console.error(
        "APP DOWNLOAD FINALIZE ERROR:",
        error
      );
    });
  }

  try {
    const forwardedFor =
      String(
        req.headers[
          "x-forwarded-for"
        ] || ""
      )
        .split(",")[0]
        .trim();

    const ipAddress =
      String(
        req.headers[
          "cf-connecting-ip"
        ] ||
        forwardedFor ||
        req.ip ||
        req.socket?.remoteAddress ||
        ""
      )
        .replace(
          /^::ffff:/,
          ""
        )
        .trim()
        .slice(0, 45) ||
      null;

    const userAgent =
      String(
        req.headers[
          "user-agent"
        ] || ""
      )
        .trim()
        .slice(0, 2000) ||
      null;

    const apk =
      await getApkDownload({
        user:
          req.user ||
          null,

        ipAddress,
        userAgent
      });

    historyId =
      apk.historyId;

    const safeFileName =
      String(
        apk.fileName ||
        "TPL22.apk"
      )
        .replace(
          /["\r\n]/g,
          ""
        );

    res.once(
      "finish",
      () => {
        const succeeded =
          res.statusCode >= 200 &&
          res.statusCode < 300;

        finalize(
          succeeded
        );
      }
    );

    res.once(
      "close",
      () => {
        if (
          !res.writableEnded
        ) {
          finalize(false);
        }
      }
    );

    res.setHeader(
      "Content-Type",
      apk.mimeType
    );

    res.setHeader(
      "Content-Length",
      String(
        apk.data.length
      )
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeFileName}"`
    );

    res.setHeader(
      "Cache-Control",
      "no-store"
    );

    return res.send(
      apk.data
    );
  } catch (error) {
    finalize(false);

    return handleError(
      res,
      error
    );
  }
}
/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  getAdminAppSettings,
  getDownloadHistory,
  getAppInfo,
  uploadApk,
  updateAppSettings,
  createDownloadTicket,
  downloadApk,
};