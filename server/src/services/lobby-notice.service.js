"use strict";

const { pool } = require("../config/database");

const NOTICE_STATUS = Object.freeze({
  DRAFT: "draft",
  PUBLISHED: "published",
  INACTIVE: "inactive",
});

const ALLOWED_STATUSES = new Set(
  Object.values(NOTICE_STATUS),
);

function createServiceError(
  message,
  statusCode = 500,
  code = "NOTICE_ERROR",
) {
  const error = new Error(message);

  error.statusCode = statusCode;
  error.code = code;

  return error;
}

function parseNoticeId(value) {
  const noticeId = Number.parseInt(value, 10);

  if (
    !Number.isInteger(noticeId) ||
    noticeId < 1
  ) {
    return null;
  }

  return noticeId;
}

function normalizeNoticeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeStatus(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function parseOptionalDate(value, fieldName) {
  if (
    value === undefined ||
    value === null ||
    String(value).trim() === ""
  ) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw createServiceError(
      `${fieldName} is invalid.`,
      400,
      "INVALID_NOTICE_DATE",
    );
  }

  return date;
}

function validateDateRange(startsAt, endsAt) {
  if (
    startsAt &&
    endsAt &&
    endsAt.getTime() <= startsAt.getTime()
  ) {
    throw createServiceError(
      "Notice end time must be after its start time.",
      400,
      "INVALID_NOTICE_DATE_RANGE",
    );
  }
}

function mapNoticeRow(row) {
  return {
    id: Number(row.id),

    noticeText: row.notice_text,
    status: row.notice_status,

    startsAt: row.starts_at,
    endsAt: row.ends_at,

    publishedBy:
      row.published_by === null
        ? null
        : Number(row.published_by),

    publisherName:
      row.publisher_name || null,

    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getPublicNotices() {
  const [rows] = await pool.query(
    `
      SELECT
        ln.id,
        ln.notice_text,
        ln.notice_status,
        ln.starts_at,
        ln.ends_at,
        ln.published_by,
        ln.published_at,
        ln.created_at,
        ln.updated_at

      FROM lobby_notices ln

      WHERE ln.notice_status = 'published'

        AND (
          ln.starts_at IS NULL
          OR ln.starts_at <= NOW()
        )

        AND (
          ln.ends_at IS NULL
          OR ln.ends_at > NOW()
        )

      ORDER BY
        ln.published_at DESC,
        ln.id DESC
    `,
  );

  return rows.map(mapNoticeRow);
}

async function getAdminNotices(query = {}) {
  const requestedStatus = normalizeStatus(
    query.status,
  );

  const searchText = String(
    query.search || "",
  ).trim();

  const conditions = [];
  const parameters = [];

  if (requestedStatus) {
    if (!ALLOWED_STATUSES.has(requestedStatus)) {
      throw createServiceError(
        "Invalid notice status.",
        400,
        "INVALID_NOTICE_STATUS",
      );
    }

    conditions.push(
      "ln.notice_status = ?",
    );

    parameters.push(requestedStatus);
  }

  if (searchText) {
    conditions.push(
      "ln.notice_text LIKE ?",
    );

    parameters.push(`%${searchText}%`);
  }

  const whereClause = conditions.length
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  const [rows] = await pool.query(
    `
      SELECT
        ln.id,
        ln.notice_text,
        ln.notice_status,
        ln.starts_at,
        ln.ends_at,
        ln.published_by,
        ln.published_at,
        ln.created_at,
        ln.updated_at,

        u.full_name AS publisher_name

      FROM lobby_notices ln

      LEFT JOIN users u
        ON u.id = ln.published_by

      ${whereClause}

      ORDER BY
        ln.created_at DESC,
        ln.id DESC
    `,
    parameters,
  );

  return rows.map(mapNoticeRow);
}

async function getNoticeById(noticeId) {
  const validNoticeId = parseNoticeId(
    noticeId,
  );

  if (!validNoticeId) {
    throw createServiceError(
      "Invalid notice ID.",
      400,
      "INVALID_NOTICE_ID",
    );
  }

  const [rows] = await pool.query(
    `
      SELECT
        ln.id,
        ln.notice_text,
        ln.notice_status,
        ln.starts_at,
        ln.ends_at,
        ln.published_by,
        ln.published_at,
        ln.created_at,
        ln.updated_at,

        u.full_name AS publisher_name

      FROM lobby_notices ln

      LEFT JOIN users u
        ON u.id = ln.published_by

      WHERE ln.id = ?

      LIMIT 1
    `,
    [validNoticeId],
  );

  return rows.length
    ? mapNoticeRow(rows[0])
    : null;
}

async function createNotice(
  payload = {},
  adminUserId,
) {
  const noticeText = normalizeNoticeText(
    payload.noticeText ??
      payload.notice_text,
  );

  if (!noticeText) {
    throw createServiceError(
      "Notice text is required.",
      400,
      "NOTICE_TEXT_REQUIRED",
    );
  }

  if (noticeText.length > 500) {
    throw createServiceError(
      "Notice text cannot exceed 500 characters.",
      400,
      "NOTICE_TEXT_TOO_LONG",
    );
  }

  const requestedStatus =
    normalizeStatus(
      payload.status ??
        payload.noticeStatus ??
        payload.notice_status,
    ) || NOTICE_STATUS.DRAFT;

  if (!ALLOWED_STATUSES.has(requestedStatus)) {
    throw createServiceError(
      "Invalid notice status.",
      400,
      "INVALID_NOTICE_STATUS",
    );
  }

  const startsAt = parseOptionalDate(
    payload.startsAt ??
      payload.starts_at,
    "Notice start time",
  );

  const endsAt = parseOptionalDate(
    payload.endsAt ??
      payload.ends_at,
    "Notice end time",
  );

  validateDateRange(startsAt, endsAt);

  const isPublished =
    requestedStatus ===
    NOTICE_STATUS.PUBLISHED;

  const [result] = await pool.query(
    `
      INSERT INTO lobby_notices (
        notice_text,
        notice_status,
        starts_at,
        ends_at,
        published_by,
        published_at
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    [
      noticeText,
      requestedStatus,
      startsAt,
      endsAt,

      isPublished
        ? Number(adminUserId)
        : null,

      isPublished
        ? new Date()
        : null,
    ],
  );

  return getNoticeById(
    result.insertId,
  );
}

async function updateNotice(
  noticeId,
  payload = {},
  adminUserId,
) {
  const validNoticeId = parseNoticeId(
    noticeId,
  );

  if (!validNoticeId) {
    throw createServiceError(
      "Invalid notice ID.",
      400,
      "INVALID_NOTICE_ID",
    );
  }

  const existingNotice =
    await getNoticeById(validNoticeId);

  if (!existingNotice) {
    throw createServiceError(
      "Lobby notice not found.",
      404,
      "NOTICE_NOT_FOUND",
    );
  }

  const hasNoticeText =
    payload.noticeText !== undefined ||
    payload.notice_text !== undefined;

  const noticeText = hasNoticeText
    ? normalizeNoticeText(
        payload.noticeText ??
          payload.notice_text,
      )
    : existingNotice.noticeText;

  if (!noticeText) {
    throw createServiceError(
      "Notice text is required.",
      400,
      "NOTICE_TEXT_REQUIRED",
    );
  }

  if (noticeText.length > 500) {
    throw createServiceError(
      "Notice text cannot exceed 500 characters.",
      400,
      "NOTICE_TEXT_TOO_LONG",
    );
  }

  const hasStatus =
    payload.status !== undefined ||
    payload.noticeStatus !== undefined ||
    payload.notice_status !== undefined;

  const noticeStatus = hasStatus
    ? normalizeStatus(
        payload.status ??
          payload.noticeStatus ??
          payload.notice_status,
      )
    : existingNotice.status;

  if (!ALLOWED_STATUSES.has(noticeStatus)) {
    throw createServiceError(
      "Invalid notice status.",
      400,
      "INVALID_NOTICE_STATUS",
    );
  }

  const hasStartsAt =
    payload.startsAt !== undefined ||
    payload.starts_at !== undefined;

  const hasEndsAt =
    payload.endsAt !== undefined ||
    payload.ends_at !== undefined;

  const startsAt = hasStartsAt
    ? parseOptionalDate(
        payload.startsAt ??
          payload.starts_at,
        "Notice start time",
      )
    : existingNotice.startsAt;

  const endsAt = hasEndsAt
    ? parseOptionalDate(
        payload.endsAt ??
          payload.ends_at,
        "Notice end time",
      )
    : existingNotice.endsAt;

  validateDateRange(
    startsAt ? new Date(startsAt) : null,
    endsAt ? new Date(endsAt) : null,
  );

  const isBeingPublished =
    noticeStatus ===
    NOTICE_STATUS.PUBLISHED;

  const publishedBy = isBeingPublished
    ? Number(adminUserId)
    : existingNotice.publishedBy;

  const publishedAt = isBeingPublished
    ? existingNotice.status ===
      NOTICE_STATUS.PUBLISHED
      ? existingNotice.publishedAt
      : new Date()
    : existingNotice.publishedAt;

  await pool.query(
    `
      UPDATE lobby_notices

      SET
        notice_text = ?,
        notice_status = ?,
        starts_at = ?,
        ends_at = ?,
        published_by = ?,
        published_at = ?

      WHERE id = ?
    `,
    [
      noticeText,
      noticeStatus,
      startsAt,
      endsAt,
      publishedBy,
      publishedAt,
      validNoticeId,
    ],
  );

  return getNoticeById(
    validNoticeId,
  );
}

module.exports = {
  NOTICE_STATUS,

  getPublicNotices,
  getAdminNotices,
  getNoticeById,
  createNotice,
  updateNotice,

  _internal: {
    parseNoticeId,
    normalizeNoticeText,
    normalizeStatus,
    parseOptionalDate,
    validateDateRange,
    mapNoticeRow,
  },
};