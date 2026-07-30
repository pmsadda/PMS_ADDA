"use strict";

const {
  pool
} = require("../config/database");

const BANNER_ID = 1;

const MAX_BANNER_SIZE =
  3 * 1024 * 1024;

const BANNER_STATUS =
  Object.freeze({
    ACTIVE: "active",
    DISABLED: "disabled"
  });

const ALLOWED_STATUSES =
  new Set(
    Object.values(BANNER_STATUS)
  );

const ALLOWED_IMAGE_TYPES =
  new Set([
    "image/jpeg",
    "image/png",
    "image/webp"
  ]);

function createServiceError(
  message,
  statusCode = 500,
  code = "LOBBY_BANNER_ERROR"
) {
  const error = new Error(message);

  error.statusCode = statusCode;
  error.code = code;

  return error;
}

function parseAdminId(value) {
  const adminId =
    Number.parseInt(value, 10);

  if (
    !Number.isInteger(adminId) ||
    adminId < 1
  ) {
    throw createServiceError(
      "Valid admin authentication is required.",
      401,
      "INVALID_ADMIN_ID"
    );
  }

  return adminId;
}

function normalizeTitle(value) {
  const title =
    String(value || "")
      .replace(/\s+/g, " ")
      .trim();

  if (!title) {
    return "Lobby Banner";
  }

  if (title.length > 100) {
    throw createServiceError(
      "Banner title cannot exceed 100 characters.",
      400,
      "INVALID_BANNER_TITLE"
    );
  }

  return title;
}

function normalizeStatus(value) {
  const status =
    String(value || "")
      .trim()
      .toLowerCase();

  if (!ALLOWED_STATUSES.has(status)) {
    throw createServiceError(
      "Invalid banner status.",
      400,
      "INVALID_BANNER_STATUS"
    );
  }

  return status;
}

function normalizeTargetUrl(value) {
  const targetUrl =
    String(value || "").trim();

  if (!targetUrl) {
    return null;
  }

  if (targetUrl.length > 500) {
    throw createServiceError(
      "Banner link cannot exceed 500 characters.",
      400,
      "INVALID_BANNER_URL"
    );
  }

  let parsedUrl;

  try {
    parsedUrl =
      new URL(targetUrl);
  } catch (error) {
    throw createServiceError(
      "Banner link must be a valid URL.",
      400,
      "INVALID_BANNER_URL"
    );
  }

  if (
    parsedUrl.protocol !== "https:" &&
    parsedUrl.protocol !== "http:"
  ) {
    throw createServiceError(
      "Banner link must use HTTP or HTTPS.",
      400,
      "INVALID_BANNER_PROTOCOL"
    );
  }

  return parsedUrl.toString();
}

function validateUploadedImage(file) {
  if (!file) {
    return null;
  }

  if (
    !Buffer.isBuffer(file.buffer) ||
    file.buffer.length < 1
  ) {
    throw createServiceError(
      "Uploaded banner image is empty.",
      400,
      "EMPTY_BANNER_IMAGE"
    );
  }

  if (
    !ALLOWED_IMAGE_TYPES.has(
      file.mimetype
    )
  ) {
    throw createServiceError(
      "Only JPG, PNG and WebP banner images are allowed.",
      400,
      "INVALID_BANNER_IMAGE_TYPE"
    );
  }

  if (
    file.buffer.length >
    MAX_BANNER_SIZE
  ) {
    throw createServiceError(
      "Banner image cannot exceed 3 MB.",
      400,
      "BANNER_IMAGE_TOO_LARGE"
    );
  }

  return {
    fileName:
      String(
        file.originalname ||
        "lobby-banner"
      ).slice(0, 255),

    mimeType: file.mimetype,

    imageSize:
      file.buffer.length,

    imageData:
      file.buffer
  };
}

function mapBannerRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),

    title:
      row.title ||
      "Lobby Banner",

    fileName:
      row.image_file_name ||
      null,

    mimeType:
      row.image_mime_type ||
      null,

    imageSize:
      row.image_size === null
        ? null
        : Number(row.image_size),

    hasImage:
      Boolean(
        row.has_image ??
        row.image_data
      ),

    targetUrl:
      row.target_url ||
      null,

    status:
      row.status,

    updatedBy:
      row.updated_by === null
        ? null
        : Number(row.updated_by),

    updatedAt:
      row.updated_at,

    createdAt:
      row.created_at
  };
}

async function ensureBannerRow(
  connection = pool
) {
  await connection.query(
    `
      INSERT INTO
        lobby_banner_settings (
          id,
          title,
          status
        )
      VALUES (
        ?,
        'Lobby Banner',
        'disabled'
      )
      ON DUPLICATE KEY UPDATE
        id = id
    `,
    [BANNER_ID]
  );
}

async function getAdminBanner() {
  await ensureBannerRow();

  const [rows] =
    await pool.query(
      `
        SELECT
          id,
          title,
          image_file_name,
          image_mime_type,
          image_size,

          (
            image_data IS NOT NULL
          ) AS has_image,

          target_url,
          status,
          updated_by,
          created_at,
          updated_at

        FROM lobby_banner_settings

        WHERE id = ?

        LIMIT 1
      `,
      [BANNER_ID]
    );

  return mapBannerRow(
    rows[0] || null
  );
}

async function getActiveBanner() {
  const [rows] =
    await pool.query(
      `
        SELECT
          id,
          title,
          image_file_name,
          image_mime_type,
          image_size,

          (
            image_data IS NOT NULL
          ) AS has_image,

          target_url,
          status,
          updated_by,
          created_at,
          updated_at

        FROM lobby_banner_settings

        WHERE id = ?
          AND status = 'active'
          AND image_data IS NOT NULL

        LIMIT 1
      `,
      [BANNER_ID]
    );

  return mapBannerRow(
    rows[0] || null
  );
}

async function getBannerImage({
  includeDisabled = false
} = {}) {
  const conditions = [
    "id = ?",
    "image_data IS NOT NULL"
  ];

  if (!includeDisabled) {
    conditions.push(
      "status = 'active'"
    );
  }

  const [rows] =
    await pool.query(
      `
        SELECT
          image_data,
          image_mime_type,
          image_size,
          updated_at

        FROM lobby_banner_settings

        WHERE ${conditions.join(
          " AND "
        )}

        LIMIT 1
      `,
      [BANNER_ID]
    );

  const row =
    rows[0] || null;

  if (!row) {
    throw createServiceError(
      "Lobby banner image was not found.",
      404,
      "BANNER_IMAGE_NOT_FOUND"
    );
  }

  return {
    imageData:
      row.image_data,

    mimeType:
      row.image_mime_type,

    imageSize:
      Number(row.image_size || 0),

    updatedAt:
      row.updated_at
  };
}

async function updateBanner({
  adminId,
  title,
  targetUrl,
  status,
  imageFile = null
}) {
  const validAdminId =
    parseAdminId(adminId);

  const validTitle =
    normalizeTitle(title);

  const validTargetUrl =
    normalizeTargetUrl(targetUrl);

  const validStatus =
    normalizeStatus(status);

  const uploadedImage =
    validateUploadedImage(
      imageFile
    );

  const connection =
    await pool.getConnection();

  try {
    await connection.beginTransaction();

    await ensureBannerRow(
      connection
    );

    const [currentRows] =
      await connection.query(
        `
          SELECT
            id,
            image_data

          FROM lobby_banner_settings

          WHERE id = ?

          LIMIT 1
          FOR UPDATE
        `,
        [BANNER_ID]
      );

    const currentBanner =
      currentRows[0] || null;

    const hasBannerImage =
      Boolean(
        uploadedImage?.imageData ||
        currentBanner?.image_data
      );

    if (
      validStatus ===
        BANNER_STATUS.ACTIVE &&
      !hasBannerImage
    ) {
      throw createServiceError(
        "Upload a banner image before activating it.",
        400,
        "ACTIVE_BANNER_REQUIRES_IMAGE"
      );
    }

    const updateFields = [
      "title = ?",
      "target_url = ?",
      "status = ?",
      "updated_by = ?"
    ];

    const parameters = [
      validTitle,
      validTargetUrl,
      validStatus,
      validAdminId
    ];

    if (uploadedImage) {
      updateFields.push(
        "image_file_name = ?",
        "image_mime_type = ?",
        "image_size = ?",
        "image_data = ?"
      );

      parameters.push(
        uploadedImage.fileName,
        uploadedImage.mimeType,
        uploadedImage.imageSize,
        uploadedImage.imageData
      );
    }

    parameters.push(BANNER_ID);

    await connection.query(
      `
        UPDATE lobby_banner_settings

        SET
          ${updateFields.join(",\n")}

        WHERE id = ?
      `,
      parameters
    );

    const [updatedRows] =
      await connection.query(
        `
          SELECT
            id,
            title,
            image_file_name,
            image_mime_type,
            image_size,

            (
              image_data IS NOT NULL
            ) AS has_image,

            target_url,
            status,
            updated_by,
            created_at,
            updated_at

          FROM lobby_banner_settings

          WHERE id = ?

          LIMIT 1
        `,
        [BANNER_ID]
      );

    await connection.commit();

    return mapBannerRow(
      updatedRows[0] || null
    );
  } catch (error) {
    await connection.rollback();

    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  BANNER_ID,
  MAX_BANNER_SIZE,
  BANNER_STATUS,
  ALLOWED_IMAGE_TYPES,

  getAdminBanner,
  getActiveBanner,
  getBannerImage,
  updateBanner
};