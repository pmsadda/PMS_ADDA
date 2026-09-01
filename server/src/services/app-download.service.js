"use strict";

const {
  pool,
} = require("../config/database");


/* =========================================================
   CONSTANTS
========================================================= */

const MAX_APK_SIZE =
  100 * 1024 * 1024; // 100 MB

const ALLOWED_APK_MIME_TYPES =
  new Set([
    "application/vnd.android.package-archive",
    "application/octet-stream",
  ]);


/* =========================================================
   ERROR
========================================================= */

function createServiceError(
  message,
  statusCode = 500,
  code = "APP_DOWNLOAD_ERROR",
) {
  const error =
    new Error(message);

  error.statusCode =
    statusCode;

  error.code =
    code;

  return error;
}


/* =========================================================
   HELPERS
========================================================= */

function normalizeBoolean(
  value,
  defaultValue = false,
) {
  if (
    value === true ||
    value === 1 ||
    value === "1" ||
    String(value).toLowerCase() === "true"
  ) {
    return true;
  }

  if (
    value === false ||
    value === 0 ||
    value === "0" ||
    String(value).toLowerCase() === "false"
  ) {
    return false;
  }

  return defaultValue;
}


function normalizeVersion(
  value,
) {
  const version =
    String(value || "")
      .trim();

  if (!version) {
    throw createServiceError(
      "App version is required.",
      400,
      "APP_VERSION_REQUIRED",
    );
  }

  if (
    version.length > 50
  ) {
    throw createServiceError(
      "App version cannot exceed 50 characters.",
      400,
      "INVALID_APP_VERSION",
    );
  }

  return version;
}


function normalizeFileName(
  value,
) {
  const fileName =
    String(
      value ||
      "PMS_ADDA.apk",
    )
      .replace(
        /[^a-zA-Z0-9._-]/g,
        "_",
      );

  return fileName
    .toLowerCase()
    .endsWith(".apk")
    ? fileName
    : `${fileName}.apk`;
}


function mapSettings(
  row,
) {
  if (!row) {
    return null;
  }

  return {
    id:
      Number(row.id),

    appName:
      row.app_name ||
      "PMS ADDA",

    appVersion:
      row.app_version ||
      null,

    apkFileName:
      row.apk_file_name ||
      null,

    apkSize:
      Number(
        row.apk_size || 0,
      ),

    apkMimeType:
      row.apk_mime_type ||
      null,

    downloadEnabled:
      Boolean(
        Number(
          row.download_enabled,
        ),
      ),

    downloadCount:
      Number(
        row.download_count || 0,
      ),

    hasApk:
      Boolean(
        Number(
          row.has_apk || 0,
        ),
      ),

    uploadedAt:
      row.uploaded_at ||
      null,

    createdAt:
      row.created_at ||
      null,

    updatedAt:
      row.updated_at ||
      null,
  };
}


/* =========================================================
   ENSURE SETTINGS ROW
========================================================= */

async function ensureSettingsRow(
  connection = pool,
) {
  await connection.query(
    `
      INSERT INTO
        app_download_settings
      (
        id,
        app_name,
        download_enabled
      )
      VALUES
      (
        1,
        'PMS ADDA',
        1
      )

      ON DUPLICATE KEY UPDATE
        id = id
    `,
  );
}


/* =========================================================
   ADMIN DASHBOARD DATA
========================================================= */

async function getAdminAppDownload() {
  await ensureSettingsRow();

  const [
    rows,
  ] =
    await pool.query(
      `
        SELECT
          id,
          app_name,
          app_version,
          apk_file_name,
          apk_size,
          apk_mime_type,
          download_enabled,
          download_count,

          (
            apk_data IS NOT NULL
            AND OCTET_LENGTH(
              apk_data
            ) > 0
          ) AS has_apk,

          uploaded_at,
          created_at,
          updated_at

        FROM
          app_download_settings

        WHERE
          id = 1

        LIMIT 1
      `,
    );

  return mapSettings(
    rows[0],
  );
}


/* =========================================================
   PUBLIC APP INFO
========================================================= */

async function getPublicAppInfo() {
  const settings =
    await getAdminAppDownload();

  if (!settings) {
    return {
      available: false,
      downloadEnabled: false,
    };
  }

  return {
    appName:
      settings.appName,

    appVersion:
      settings.appVersion,

    apkSize:
      settings.apkSize,

    downloadEnabled:
      settings.downloadEnabled,

    available:
      settings.downloadEnabled &&
      settings.hasApk,

    uploadedAt:
      settings.uploadedAt,
  };
}


/* =========================================================
   UPLOAD APK
========================================================= */

async function uploadApp({
  file,
  appVersion,
}) {
  if (!file) {
    throw createServiceError(
      "Please select an APK file.",
      400,
      "APK_FILE_REQUIRED",
    );
  }

  if (
    !Buffer.isBuffer(
      file.buffer,
    ) ||
    file.buffer.length < 1
  ) {
    throw createServiceError(
      "APK file is empty.",
      400,
      "EMPTY_APK_FILE",
    );
  }

  if (
    file.buffer.length >
    MAX_APK_SIZE
  ) {
    throw createServiceError(
      "APK file cannot exceed 100 MB.",
      400,
      "APK_TOO_LARGE",
    );
  }

  const originalName =
    String(
      file.originalname ||
      "",
    );

  if (
    !originalName
      .toLowerCase()
      .endsWith(".apk")
  ) {
    throw createServiceError(
      "Only APK files are allowed.",
      400,
      "INVALID_APK_FILE",
    );
  }

  const mimeType =
    String(
      file.mimetype ||
      "application/octet-stream",
    )
      .toLowerCase();

  if (
    !ALLOWED_APK_MIME_TYPES
      .has(mimeType)
  ) {
    throw createServiceError(
      "Invalid APK file type.",
      400,
      "INVALID_APK_MIME_TYPE",
    );
  }

  const version =
    normalizeVersion(
      appVersion,
    );

  const fileName =
    normalizeFileName(
      originalName,
    );

  const connection =
    await pool.getConnection();

  try {
    await connection
      .beginTransaction();

    await ensureSettingsRow(
      connection,
    );

    await connection.query(
      `
        UPDATE
          app_download_settings

        SET
          app_version = ?,
          apk_file_name = ?,
          apk_storage_name = ?,
          apk_mime_type = ?,
          apk_size = ?,
          apk_data = ?,
          uploaded_at =
            CURRENT_TIMESTAMP,
          updated_at =
            CURRENT_TIMESTAMP

        WHERE
          id = 1
      `,
      [
        version,
        fileName,
        "database",
        mimeType,
        file.buffer.length,
        file.buffer,
      ],
    );

    await connection
      .commit();

  } catch (error) {
    await connection
      .rollback();

    throw error;

  } finally {
    connection.release();
  }

  return getAdminAppDownload();
}


/* =========================================================
   ENABLE / DISABLE DOWNLOAD
========================================================= */

async function updateDownloadSettings(
  payload = {},
) {
  const enabled =
    normalizeBoolean(
      payload.downloadEnabled,
      true,
    );

  await ensureSettingsRow();

  await pool.query(
    `
      UPDATE
        app_download_settings

      SET
        download_enabled = ?,
        updated_at =
          CURRENT_TIMESTAMP

      WHERE
        id = 1
    `,
    [
      enabled
        ? 1
        : 0,
    ],
  );

  return getAdminAppDownload();
}


/* =========================================================
   GET APK FOR DOWNLOAD
========================================================= */

async function getApkDownload() {
  const [
    rows,
  ] =
    await pool.query(
      `
        SELECT
          id,
          app_name,
          app_version,
          apk_file_name,
          apk_mime_type,
          apk_size,
          apk_data,
          download_enabled

        FROM
          app_download_settings

        WHERE
          id = 1

        LIMIT 1
      `,
    );

  const row =
    rows[0];

  if (!row) {
    throw createServiceError(
      "App download is not available.",
      404,
      "APP_NOT_AVAILABLE",
    );
  }

  if (
    !Boolean(
      Number(
        row.download_enabled,
      ),
    )
  ) {
    throw createServiceError(
      "App download is currently disabled.",
      403,
      "APP_DOWNLOAD_DISABLED",
    );
  }

  if (
    !Buffer.isBuffer(
      row.apk_data,
    ) ||
    row.apk_data.length < 1
  ) {
    throw createServiceError(
      "APK has not been uploaded yet.",
      404,
      "APK_NOT_UPLOADED",
    );
  }

  /*
   * Download count increase
   */

  await pool.query(
    `
      UPDATE
        app_download_settings

      SET
        download_count =
          download_count + 1

      WHERE
        id = 1
    `,
  );

  return {
    appName:
      row.app_name ||
      "PMS ADDA",

    appVersion:
      row.app_version ||
      null,

    fileName:
      normalizeFileName(
        row.apk_file_name ||
        "PMS_ADDA.apk",
      ),

    mimeType:
      row.apk_mime_type ||
      "application/vnd.android.package-archive",

    size:
      Number(
        row.apk_size ||
        row.apk_data.length,
      ),

    data:
      row.apk_data,
  };
}


/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  MAX_APK_SIZE,
  ALLOWED_APK_MIME_TYPES,

  getAdminAppDownload,
  getPublicAppInfo,
  uploadApp,
  updateDownloadSettings,
  getApkDownload,
};