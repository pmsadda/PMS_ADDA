"use strict";

const {
  getAdminAppDownload,
  getPublicAppInfo,
  uploadApp,
  updateDownloadSettings,
  getApkDownload,
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
   PUBLIC — DOWNLOAD APK
========================================================= */

async function downloadApk(
  req,
  res,
) {
  try {
    const apk =
      await getApkDownload();

    const safeFileName =
      String(
        apk.fileName ||
        "PMS_ADDA.apk",
      )
        .replace(
          /["\r\n]/g,
          "",
        );

    res.setHeader(
      "Content-Type",
      apk.mimeType,
    );

    res.setHeader(
      "Content-Length",
      String(
        apk.data.length,
      ),
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeFileName}"`,
    );

    res.setHeader(
      "Cache-Control",
      "no-store",
    );

    return res.send(
      apk.data,
    );

  } catch (error) {
    return handleError(
      res,
      error,
    );
  }
}


/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  getAdminAppSettings,
  getAppInfo,
  uploadApk,
  updateAppSettings,
  downloadApk,
};