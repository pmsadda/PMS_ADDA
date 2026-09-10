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
      "TPL22.apk",
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
      "TPL22",

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
        'TPL22',
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

async function getApkDownload(
  downloadMeta = {}
) {
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

   const user =
    downloadMeta.user &&
    Number.isInteger(
      Number(downloadMeta.user.id)
    )
      ? downloadMeta.user
      : null;

  const visitorType =
    user
      ? "user"
      : "guest";

  const ipAddress =
    String(
      downloadMeta.ipAddress || ""
    )
      .trim()
      .slice(0, 45) ||
    null;

  const userAgent =
    String(
      downloadMeta.userAgent || ""
    )
      .trim()
      .slice(0, 2000) ||
    null;

  const apkFileName =
    normalizeFileName(
      row.apk_file_name ||
      "TPL22.apk"
    );

  const [historyResult] =
    await pool.query(
      `
        INSERT INTO app_download_history (
          user_id,
          user_uid,
          username,
          visitor_type,
          ip_address,
          user_agent,
          app_version,
          apk_file_name,
          download_status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'started')
      `,
      [
        user
          ? Number(user.id)
          : null,

        user?.uid ||
          null,

        user?.username ||
          null,

        visitorType,
        ipAddress,
        userAgent,

        row.app_version ||
          null,

        apkFileName
      ]
    );

  const historyId =
    Number(
      historyResult.insertId
    );

  return {
     historyId,
    appName:
      row.app_name ||
      "TPL22",

    appVersion:
      row.app_version ||
      null,

        fileName:
      apkFileName,

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
   FINALIZE APK DOWNLOAD
========================================================= */

async function finalizeAppDownload(
  historyId,
  succeeded
) {
  const validHistoryId =
    Number.parseInt(
      historyId,
      10
    );

  if (
    !Number.isInteger(validHistoryId) ||
    validHistoryId < 1
  ) {
    return;
  }

  if (!succeeded) {
    await pool.query(
      `
        UPDATE app_download_history
        SET download_status = 'failed'
        WHERE id = ?
          AND download_status = 'started'
      `,
      [
        validHistoryId
      ]
    );

    return;
  }

  const connection =
    await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [result] =
      await connection.query(
        `
          UPDATE app_download_history
          SET download_status = 'completed'
          WHERE id = ?
            AND download_status = 'started'
        `,
        [
          validHistoryId
        ]
      );

    if (
      Number(result.affectedRows) === 1
    ) {
      await connection.query(
        `
          UPDATE app_download_settings
          SET download_count =
            download_count + 1
          WHERE id = 1
        `
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/* =========================================================
   ADMIN — GET DOWNLOAD HISTORY
========================================================= */

async function getAdminDownloadHistory(
  options = {}
) {
  const requestedPage =
    Number.parseInt(
      options.page,
      10
    );

  const requestedLimit =
    Number.parseInt(
      options.limit,
      10
    );

  const page =
    Number.isInteger(requestedPage) &&
    requestedPage > 0
      ? requestedPage
      : 1;

  const limit =
    Number.isInteger(requestedLimit)
      ? Math.min(
          Math.max(
            requestedLimit,
            10
          ),
          100
        )
      : 25;

  const offset =
    (page - 1) *
    limit;

  const search =
    String(
      options.search || ""
    )
      .trim()
      .slice(0, 100);

  const whereParts = [];
  const whereValues = [];

  if (search) {
    const searchValue =
      `%${search}%`;

    whereParts.push(`
      (
        username LIKE ?
        OR user_uid LIKE ?
        OR ip_address LIKE ?
        OR apk_file_name LIKE ?
        OR app_version LIKE ?
      )
    `);

    whereValues.push(
      searchValue,
      searchValue,
      searchValue,
      searchValue,
      searchValue
    );
  }

  const whereClause =
    whereParts.length > 0
      ? `WHERE ${whereParts.join(
          " AND "
        )}`
      : "";

  const [countRows] =
    await pool.query(
      `
        SELECT
          COUNT(*) AS total
        FROM app_download_history
        ${whereClause}
      `,
      whereValues
    );

  const [rows] =
    await pool.query(
      `
        SELECT
          id,
          user_id,
          user_uid,
          username,
          visitor_type,
          ip_address,
          user_agent,
          app_version,
          apk_file_name,
          download_status,
          downloaded_at
        FROM app_download_history
        ${whereClause}
        ORDER BY id DESC
        LIMIT ?
        OFFSET ?
      `,
      [
        ...whereValues,
        limit,
        offset
      ]
    );

  const total =
    Number(
      countRows[0]?.total || 0
    );

  return {
    items:
      rows.map((row) => ({
        id:
          Number(row.id),

        userId:
          row.user_id
            ? Number(row.user_id)
            : null,

        userUid:
          row.user_uid ||
          null,

        username:
          row.username ||
          "Guest",

        visitorType:
          row.visitor_type ||
          "guest",

        ipAddress:
          row.ip_address ||
          null,

        userAgent:
          row.user_agent ||
          null,

        appVersion:
          row.app_version ||
          null,

        apkFileName:
          row.apk_file_name ||
          null,

        downloadStatus:
          row.download_status,

        downloadedAt:
          row.downloaded_at
      })),

    pagination: {
      page,
      limit,
      total,

      totalPages:
        Math.max(
          1,
          Math.ceil(
            total / limit
          )
        )
    }
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
  finalizeAppDownload,
  getAdminDownloadHistory,
};