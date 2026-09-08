"use strict";

const {
  pool,
} = require("../config/database");

const MAX_BANNERS = 5;

const MAX_BANNER_SIZE =
  3 * 1024 * 1024;

const BANNER_STATUS =
  Object.freeze({
    ACTIVE: "active",
    DISABLED: "disabled",
  });

const ALLOWED_STATUSES =
  new Set(
    Object.values(
      BANNER_STATUS,
    ),
  );

const ALLOWED_IMAGE_TYPES =
  new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);

const BANNER_SELECT_COLUMNS = `
  id,
  display_order,
  title,
  image_file_name,
  image_mime_type,
  image_size,

  (
    image_data IS NOT NULL
  ) AS has_image,

  target_url,
status,
show_as_popup,
popup_message,
popup_button_text,
updated_by,
  created_at,
  updated_at
`;

function createServiceError(
  message,
  statusCode = 500,
  code = "LOBBY_BANNER_ERROR",
) {
  const error =
    new Error(message);

  error.statusCode =
    statusCode;

  error.code =
    code;

  return error;
}

function parseAdminId(value) {
  const adminId =
    Number.parseInt(
      value,
      10,
    );

  if (
    !Number.isInteger(adminId) ||
    adminId < 1
  ) {
    throw createServiceError(
      "Valid admin authentication is required.",
      401,
      "INVALID_ADMIN_ID",
    );
  }

  return adminId;
}

function parseBannerId(value) {
  const bannerId =
    Number.parseInt(
      value,
      10,
    );

  if (
    !Number.isInteger(bannerId) ||
    bannerId < 1 ||
    bannerId > MAX_BANNERS
  ) {
    throw createServiceError(
      "Invalid lobby banner ID.",
      400,
      "INVALID_BANNER_ID",
    );
  }

  return bannerId;
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
      "INVALID_BANNER_TITLE",
    );
  }

  return title;
}

function normalizeStatus(value) {
  const status =
    String(
      value ||
      BANNER_STATUS.DISABLED,
    )
      .trim()
      .toLowerCase();

  if (
    !ALLOWED_STATUSES.has(
      status,
    )
  ) {
    throw createServiceError(
      "Invalid banner status.",
      400,
      "INVALID_BANNER_STATUS",
    );
  }

  return status;
}

function normalizeShowAsPopup(value) {
  const normalized =
    String(value ?? "")
      .trim()
      .toLowerCase();

  return [
    "1",
    "true",
    "yes",
    "on",
  ].includes(normalized);
}

function normalizePopupMessage(
  value,
  showAsPopup,
) {
  const message =
    String(value || "")
      .replace(/\r\n/g, "\n")
      .trim();

  if (
    showAsPopup &&
    !message
  ) {
    throw createServiceError(
      "Popup message is required when popup is enabled.",
      400,
      "POPUP_MESSAGE_REQUIRED",
    );
  }

  if (message.length > 1000) {
    throw createServiceError(
      "Popup message cannot exceed 1000 characters.",
      400,
      "INVALID_POPUP_MESSAGE",
    );
  }

  return message || null;
}

function normalizePopupButtonText(
  value,
) {
  const buttonText =
    String(
      value ||
      "View Offer",
    )
      .replace(/\s+/g, " ")
      .trim();

  if (buttonText.length > 60) {
    throw createServiceError(
      "Popup button text cannot exceed 60 characters.",
      400,
      "INVALID_POPUP_BUTTON_TEXT",
    );
  }

  return buttonText ||
    "View Offer";
}

function normalizeTargetUrl(value) {
  const targetUrl =
    String(value || "")
      .trim();

  if (!targetUrl) {
    return null;
  }

  if (
    targetUrl.length > 500
  ) {
    throw createServiceError(
      "Banner link cannot exceed 500 characters.",
      400,
      "INVALID_BANNER_URL",
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
      "INVALID_BANNER_URL",
    );
  }

  if (
    parsedUrl.protocol !==
      "https:" &&
    parsedUrl.protocol !==
      "http:"
  ) {
    throw createServiceError(
      "Banner link must use HTTP or HTTPS.",
      400,
      "INVALID_BANNER_PROTOCOL",
    );
  }

  return parsedUrl.toString();
}

function detectBannerImageMimeType(
  buffer,
) {
  if (
    !Buffer.isBuffer(buffer) ||
    buffer.length < 12
  ) {
    return null;
  }

  if (
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return "image/jpeg";
  }

  const pngSignature = [
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
  ];

  if (
    pngSignature.every(
      (byte, index) =>
        buffer[index] === byte,
    )
  ) {
    return "image/png";
  }

  if (
    buffer.toString(
      "ascii",
      0,
      4,
    ) === "RIFF" &&
    buffer.toString(
      "ascii",
      8,
      12,
    ) === "WEBP"
  ) {
    return "image/webp";
  }

  return null;
}

function validateUploadedImage(file) {
  if (
    !file ||
    !Buffer.isBuffer(file.buffer) ||
    file.buffer.length < 1
  ) {
    throw createServiceError(
      "A valid banner image is required.",
      400,
      "BANNER_IMAGE_REQUIRED",
    );
  }

  const declaredMimeType =
    String(file.mimetype || "")
      .trim()
      .toLowerCase();

  /*
   * Browser-এর declared MIME type আগে
   * allowlist দিয়ে পরীক্ষা করা হচ্ছে।
   */
  if (
    !ALLOWED_IMAGE_TYPES.has(
      declaredMimeType,
    )
  ) {
    throw createServiceError(
      "Only JPG, PNG and WebP banner images are allowed.",
      400,
      "INVALID_BANNER_IMAGE_TYPE",
    );
  }

  if (
    file.buffer.length >
    MAX_BANNER_SIZE
  ) {
    throw createServiceError(
      "Banner image cannot exceed 3 MB.",
      400,
      "BANNER_IMAGE_TOO_LARGE",
    );
  }

  /*
   * File extension বা browser MIME বিশ্বাস
   * না করে actual image bytes পরীক্ষা।
   */
  const detectedMimeType =
    detectBannerImageMimeType(
      file.buffer,
    );

  if (
    !detectedMimeType ||
    detectedMimeType !==
      declaredMimeType
  ) {
    throw createServiceError(
      "Banner image content does not match its declared image type.",
      400,
      "BANNER_IMAGE_SIGNATURE_MISMATCH",
    );
  }

  return {
    fileName:
      String(
        file.originalname ||
        "lobby-banner",
      ).slice(0, 255),

    mimeType:
      detectedMimeType,

    imageSize:
      file.buffer.length,

    imageData:
      file.buffer,
  };
}

function mapBannerRow(row) {
  if (!row) {
    return null;
  }

  return {
    id:
      Number(row.id),

    displayOrder:
      Number(
        row.display_order ||
        1,
      ),

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
        : Number(
            row.image_size,
          ),

    hasImage:
      Boolean(
        row.has_image ??
        row.image_data,
      ),

    targetUrl:
      row.target_url ||
      null,

   status:
  row.status,

showAsPopup:
  Boolean(
    row.show_as_popup,
  ),

popupMessage:
  row.popup_message ||
  "",

popupButtonText:
  row.popup_button_text ||
  "View Offer",

updatedBy:
      row.updated_by === null
        ? null
        : Number(
            row.updated_by,
          ),

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,
  };
}

function findAvailableBannerId(
  rows,
) {
  const usedIds =
    new Set(
      rows.map(
        (row) =>
          Number(row.id),
      ),
    );

  for (
    let bannerId = 1;
    bannerId <= MAX_BANNERS;
    bannerId += 1
  ) {
    if (
      !usedIds.has(bannerId)
    ) {
      return bannerId;
    }
  }

  return null;
}

async function normalizeBannerOrder(
  connection,
) {
  const [rows] =
    await connection.query(`
      SELECT id
      FROM lobby_banner_settings
      ORDER BY
        display_order ASC,
        id ASC
      FOR UPDATE
    `);

  for (
    let index = 0;
    index < rows.length;
    index += 1
  ) {
    await connection.query(
      `
        UPDATE lobby_banner_settings
        SET display_order = ?
        WHERE id = ?
      `,
      [
        index + 1,
        Number(rows[index].id),
      ],
    );
  }
}

async function getAdminBanners() {
  const [rows] =
    await pool.query(`
      SELECT
        ${BANNER_SELECT_COLUMNS}

      FROM lobby_banner_settings

      ORDER BY
        display_order ASC,
        id ASC
    `);

  return rows.map(
    mapBannerRow,
  );
}

async function getActiveBanners() {
  const [rows] =
    await pool.query(
      `
        SELECT
          ${BANNER_SELECT_COLUMNS}

        FROM lobby_banner_settings

        WHERE status = 'active'
          AND image_data IS NOT NULL

        ORDER BY
          display_order ASC,
          id ASC

        LIMIT ${MAX_BANNERS}
      `,
    );

  return rows.map(
    mapBannerRow,
  );
}

async function getBannerImage({
  bannerId,
  includeDisabled = false,
} = {}) {
  const validBannerId =
    parseBannerId(bannerId);

  const conditions = [
    "id = ?",
    "image_data IS NOT NULL",
  ];

  if (!includeDisabled) {
    conditions.push(
      "status = 'active'",
    );
  }

  const [rows] =
    await pool.query(
      `
        SELECT
          id,
          image_data,
          image_mime_type,
          image_size,
          updated_at

        FROM lobby_banner_settings

        WHERE ${conditions.join(
          " AND ",
        )}

        LIMIT 1
      `,
      [validBannerId],
    );

  const row =
    rows[0] || null;

  if (!row) {
    throw createServiceError(
      "Lobby banner image was not found.",
      404,
      "BANNER_IMAGE_NOT_FOUND",
    );
  }

  return {
    id:
      Number(row.id),

    imageData:
      row.image_data,

    mimeType:
      row.image_mime_type,

    imageSize:
      Number(
        row.image_size || 0,
      ),

    updatedAt:
      row.updated_at,
  };
}

async function createBanner({
  adminId,
  title,
  targetUrl,
  status,
  showAsPopup,
  popupMessage,
  popupButtonText,
  imageFile,
}) {
  const validAdminId =
    parseAdminId(adminId);

  const validTitle =
    normalizeTitle(title);

  const validTargetUrl =
    normalizeTargetUrl(
      targetUrl,
    );

  const validStatus =
    normalizeStatus(status);

    const validShowAsPopup =
  normalizeShowAsPopup(
    showAsPopup,
  );

const validPopupMessage =
  normalizePopupMessage(
    popupMessage,
    validShowAsPopup,
  );

const validPopupButtonText =
  normalizePopupButtonText(
    popupButtonText,
  );

  const uploadedImage =
    validateUploadedImage(
      imageFile,
    );

  if (!uploadedImage) {
    throw createServiceError(
      "A banner image is required.",
      400,
      "BANNER_IMAGE_REQUIRED",
    );
  }

  const connection =
    await pool.getConnection();

  try {
    await connection
      .beginTransaction();

    const [existingRows] =
      await connection.query(`
        SELECT
          id,
          display_order

        FROM lobby_banner_settings

        ORDER BY
          display_order ASC,
          id ASC

        FOR UPDATE
      `);

    if (
      existingRows.length >=
      MAX_BANNERS
    ) {
      throw createServiceError(
        `Maximum ${MAX_BANNERS} lobby banners are allowed.`,
        409,
        "BANNER_LIMIT_REACHED",
      );
    }

    const bannerId =
      findAvailableBannerId(
        existingRows,
      );

    if (!bannerId) {
      throw createServiceError(
        "No lobby banner slot is available.",
        409,
        "BANNER_SLOT_UNAVAILABLE",
      );
    }

    const displayOrder =
      existingRows.length + 1;

   if (validShowAsPopup) {
  /*
   * একই সময়ে শুধু একটি banner
   * lobby popup হিসেবে চালু থাকবে।
   */
  await connection.query(
    `
      UPDATE lobby_banner_settings

      SET show_as_popup = 0

      WHERE show_as_popup = 1
    `,
  );
}

await connection.query(
  `
    INSERT INTO
      lobby_banner_settings (
        id,
        display_order,
        title,
        image_file_name,
        image_mime_type,
        image_size,
        image_data,
        target_url,
        status,
        show_as_popup,
        popup_message,
        popup_button_text,
        updated_by
      )

    VALUES (
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?
    )
  `,
  [
    bannerId,
    displayOrder,
    validTitle,
    uploadedImage.fileName,
    uploadedImage.mimeType,
    uploadedImage.imageSize,
    uploadedImage.imageData,
    validTargetUrl,
    validStatus,
    validShowAsPopup ? 1 : 0,
    validPopupMessage,
    validPopupButtonText,
    validAdminId,
  ],
);

    const [createdRows] =
      await connection.query(
        `
          SELECT
            ${BANNER_SELECT_COLUMNS}

          FROM lobby_banner_settings

          WHERE id = ?

          LIMIT 1
        `,
        [bannerId],
      );

    await connection.commit();

    return mapBannerRow(
      createdRows[0] ||
      null,
    );
  } catch (error) {
    await connection.rollback();

    throw error;
  } finally {
    connection.release();
  }
}

async function updateBanner({
  bannerId,
  adminId,
  title,
  targetUrl,
  status,
  imageFile = null,
}) {
  const validBannerId =
    parseBannerId(bannerId);

  const validAdminId =
    parseAdminId(adminId);

  const validTitle =
    normalizeTitle(title);

  const validTargetUrl =
    normalizeTargetUrl(
      targetUrl,
    );

  const validStatus =
    normalizeStatus(status);

  const uploadedImage =
  imageFile
    ? validateUploadedImage(
        imageFile,
      )
    : null;

  const connection =
    await pool.getConnection();

  try {
    await connection
      .beginTransaction();

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
        [validBannerId],
      );

    const currentBanner =
      currentRows[0] || null;

    if (!currentBanner) {
      throw createServiceError(
        "Lobby banner was not found.",
        404,
        "BANNER_NOT_FOUND",
      );
    }

    const hasBannerImage =
      Boolean(
        uploadedImage
          ?.imageData ||
        currentBanner
          .image_data,
      );

    if (
      validStatus ===
        BANNER_STATUS.ACTIVE &&
      !hasBannerImage
    ) {
      throw createServiceError(
        "Upload a banner image before activating it.",
        400,
        "ACTIVE_BANNER_REQUIRES_IMAGE",
      );
    }

const updateFields = [
  "title = ?",
  "target_url = ?",
  "status = ?",
  "show_as_popup = ?",
  "popup_message = ?",
  "popup_button_text = ?",
  "updated_by = ?",
];

const parameters = [
  validTitle,
  validTargetUrl,
  validStatus,
  validShowAsPopup
    ? 1
    : 0,
  validPopupMessage,
  validPopupButtonText,
  validAdminId,
];

    if (uploadedImage) {
      updateFields.push(
        "image_file_name = ?",
        "image_mime_type = ?",
        "image_size = ?",
        "image_data = ?",
      );

      parameters.push(
        uploadedImage.fileName,
        uploadedImage.mimeType,
        uploadedImage.imageSize,
        uploadedImage.imageData,
      );
    }

    parameters.push(
      validBannerId,
    );

    if (validShowAsPopup) {
  await connection.query(
    `
      UPDATE lobby_banner_settings

      SET show_as_popup = 0

      WHERE id <> ?
        AND show_as_popup = 1
    `,
    [validBannerId],
  );
}

    await connection.query(
      `
        UPDATE lobby_banner_settings

        SET
          ${updateFields.join(
            ",\n",
          )}

        WHERE id = ?
      `,
      parameters,
    );

    const [updatedRows] =
      await connection.query(
        `
          SELECT
            ${BANNER_SELECT_COLUMNS}

          FROM lobby_banner_settings

          WHERE id = ?

          LIMIT 1
        `,
        [validBannerId],
      );

    await connection.commit();

    return mapBannerRow(
      updatedRows[0] ||
      null,
    );
  } catch (error) {
    await connection.rollback();

    throw error;
  } finally {
    connection.release();
  }
}

async function deleteBanner({
  bannerId,
  adminId,
}) {
  const validBannerId =
    parseBannerId(bannerId);

  parseAdminId(adminId);

  const connection =
    await pool.getConnection();

  try {
    await connection
      .beginTransaction();

    const [bannerRows] =
      await connection.query(
        `
          SELECT
            id,
            title

          FROM lobby_banner_settings

          WHERE id = ?

          LIMIT 1
          FOR UPDATE
        `,
        [validBannerId],
      );

    const banner =
      bannerRows[0] || null;

    if (!banner) {
      throw createServiceError(
        "Lobby banner was not found.",
        404,
        "BANNER_NOT_FOUND",
      );
    }

    await connection.query(
      `
        DELETE FROM
          lobby_banner_settings

        WHERE id = ?
      `,
      [validBannerId],
    );

    await normalizeBannerOrder(
      connection,
    );

    await connection.commit();

    return {
      id:
        validBannerId,

      title:
        banner.title,
    };
  } catch (error) {
    await connection.rollback();

    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  MAX_BANNERS,
  MAX_BANNER_SIZE,
  BANNER_STATUS,
  ALLOWED_IMAGE_TYPES,

  getAdminBanners,
  getActiveBanners,
  getBannerImage,
  createBanner,
  updateBanner,
  deleteBanner,
};