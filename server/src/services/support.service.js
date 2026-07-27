"use strict";

const crypto = require("crypto");

const { pool } = require("../config/database");

const TICKET_STATUS = Object.freeze({
  OPEN: "open",
  IN_PROGRESS: "in_progress",
  WAITING_USER: "waiting_user",
  RESOLVED: "resolved",
  CLOSED: "closed",
});

const TICKET_PRIORITY = Object.freeze({
  LOW: "low",
  NORMAL: "normal",
  HIGH: "high",
  URGENT: "urgent",
});

const TICKET_CATEGORY = Object.freeze({
  DEPOSIT: "deposit",
  WITHDRAW: "withdraw",
  WALLET: "wallet",
  TEEN_PATTI: "teen_patti",
  POKER: "poker",
  LUDO: "ludo",
  ACCOUNT: "account",
  TECHNICAL: "technical",
  OTHER: "other",
});

const ALLOWED_CATEGORIES = new Set(Object.values(TICKET_CATEGORY));

const ALLOWED_STATUSES = new Set(Object.values(TICKET_STATUS));

const ALLOWED_PRIORITIES = new Set(Object.values(TICKET_PRIORITY));

function createServiceError(message, statusCode = 500, code = "SUPPORT_ERROR") {
  const error = new Error(message);

  error.statusCode = statusCode;
  error.code = code;

  return error;
}

function parsePositiveInteger(value) {
  const number = Number.parseInt(value, 10);

  if (!Number.isInteger(number) || number < 1) {
    return null;
  }

  return number;
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .trim();
}

function normalizeOption(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function createTicketCode() {
  const timestamp = Date.now().toString(36).toUpperCase();

  const randomPart = crypto.randomBytes(4).toString("hex").toUpperCase();

  return `SUP-${timestamp}-${randomPart}`;
}

function mapTicketRow(row) {
  return {
    id: Number(row.id),
    ticketId: Number(row.id),

    ticketCode: row.ticket_code,

    userId: Number(row.user_id),
    userName: row.user_name || null,
    userUid: row.user_uid || null,
    userPhone: row.user_phone || null,
    userEmail: row.user_email || null,

    category: row.category,
    subject: row.subject,

    status: row.ticket_status,
    priority: row.priority,

    assignedAdminId:
      row.assigned_admin_id === null ? null : Number(row.assigned_admin_id),

    assignedAdminName: row.assigned_admin_name || null,

    lastMessage: row.last_message || null,

    unreadMessages: Number(row.unread_messages || 0),

    messageCount: Number(row.message_count || 0),

    lastMessageAt: row.last_message_at,

    resolvedAt: row.resolved_at,
    closedAt: row.closed_at,

    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMessageRow(row) {
  return {
    id: Number(row.id),
    messageId: Number(row.id),

    ticketId: Number(row.ticket_id),

    senderUserId: Number(row.sender_user_id),

    senderType: row.sender_type,

    senderName: row.sender_name || null,

    messageText: row.message_text,

    isReadByUser: Boolean(row.is_read_by_user),

    isReadByAdmin: Boolean(row.is_read_by_admin),

    createdAt: row.created_at,
  };
}

async function withTransaction(callback) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const result = await callback(connection);

    await connection.commit();

    return result;
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error("SUPPORT TRANSACTION ROLLBACK ERROR:", rollbackError);
    }

    throw error;
  } finally {
    connection.release();
  }
}

async function getLockedUser(connection, userId) {
  const [rows] = await connection.query(
    `
        SELECT
          id,
          full_name,
          account_status

        FROM users

        WHERE id = ?

        LIMIT 1

        FOR UPDATE
      `,
    [userId],
  );

  return rows[0] || null;
}

async function getLockedUserTicket(connection, ticketId, userId) {
  const [rows] = await connection.query(
    `
        SELECT
          id,
          ticket_code,
          user_id,
          category,
          subject,
          ticket_status,
          priority,
          assigned_admin_id,
          last_message_at,
          resolved_at,
          closed_at,
          created_at,
          updated_at

        FROM support_tickets

        WHERE id = ?
          AND user_id = ?

        LIMIT 1

        FOR UPDATE
      `,
    [ticketId, userId],
  );

  return rows[0] || null;
}

async function createTicket(requestingUserId, payload = {}) {
  const userId = parsePositiveInteger(requestingUserId);

  if (!userId) {
    throw createServiceError(
      "Valid user ID is required.",
      400,
      "INVALID_USER_ID",
    );
  }

  const category = normalizeOption(payload.category);

  const subject = normalizeText(payload.subject).replace(/\s+/g, " ");

  const messageText = normalizeText(payload.message ?? payload.messageText);

  if (!ALLOWED_CATEGORIES.has(category)) {
    throw createServiceError(
      "Please select a valid support category.",
      400,
      "INVALID_SUPPORT_CATEGORY",
    );
  }

  if (subject.length < 5 || subject.length > 150) {
    throw createServiceError(
      "Support subject must contain 5 to 150 characters.",
      400,
      "INVALID_SUPPORT_SUBJECT",
    );
  }

  if (messageText.length < 10 || messageText.length > 3000) {
    throw createServiceError(
      "Support message must contain 10 to 3000 characters.",
      400,
      "INVALID_SUPPORT_MESSAGE",
    );
  }

  const result = await withTransaction(async (connection) => {
    const user = await getLockedUser(connection, userId);

    if (!user) {
      throw createServiceError(
        "User account was not found.",
        404,
        "USER_NOT_FOUND",
      );
    }

    if (user.account_status !== "active") {
      throw createServiceError(
        "Your account is not active.",
        403,
        "ACCOUNT_NOT_ACTIVE",
      );
    }

    let ticketCode = null;
    let ticketResult = null;

    /*
     * Extremely rare duplicate code হলেও
     * সর্বোচ্চ তিনবার নতুন code চেষ্টা করবে।
     */
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      ticketCode = createTicketCode();

      try {
        [ticketResult] = await connection.query(
          `
                  INSERT INTO support_tickets (
                    ticket_code,
                    user_id,
                    category,
                    subject,
                    ticket_status,
                    priority,
                    last_message_at
                  )
                  VALUES (
                    ?,
                    ?,
                    ?,
                    ?,
                    'open',
                    'normal',
                    NOW()
                  )
                `,
          [ticketCode, userId, category, subject],
        );

        break;
      } catch (error) {
        if (error.code !== "ER_DUP_ENTRY" || attempt === 3) {
          throw error;
        }
      }
    }

    const ticketId = Number(ticketResult.insertId);

    await connection.query(
      `
            INSERT INTO support_messages (
              ticket_id,
              sender_user_id,
              sender_type,
              message_text,
              is_read_by_user,
              is_read_by_admin
            )
            VALUES (
              ?,
              ?,
              'user',
              ?,
              1,
              0
            )
          `,
      [ticketId, userId, messageText],
    );

    return {
      ticketId,
      ticketCode,
    };
  });

  return getUserTicketDetails(userId, result.ticketId);
}

async function getUserTickets(requestingUserId, query = {}) {
  const userId = parsePositiveInteger(requestingUserId);

  if (!userId) {
    throw createServiceError(
      "Valid user ID is required.",
      400,
      "INVALID_USER_ID",
    );
  }

  const requestedStatus = normalizeOption(query.status);

  const parameters = [userId];

  let statusCondition = "";

  if (requestedStatus) {
    if (!ALLOWED_STATUSES.has(requestedStatus)) {
      throw createServiceError(
        "Invalid support ticket status.",
        400,
        "INVALID_TICKET_STATUS",
      );
    }

    statusCondition = "AND st.ticket_status = ?";

    parameters.push(requestedStatus);
  }

  const [rows] = await pool.query(
    `
        SELECT
          st.id,
          st.ticket_code,
          st.user_id,
          st.category,
          st.subject,
          st.ticket_status,
          st.priority,
          st.assigned_admin_id,
          st.last_message_at,
          st.resolved_at,
          st.closed_at,
          st.created_at,
          st.updated_at,

          admin_user.full_name
            AS assigned_admin_name,

          (
            SELECT sm.message_text

            FROM support_messages sm

            WHERE sm.ticket_id = st.id

            ORDER BY
              sm.created_at DESC,
              sm.id DESC

            LIMIT 1
          ) AS last_message,

          (
            SELECT COUNT(*)

            FROM support_messages sm

            WHERE sm.ticket_id = st.id
              AND sm.sender_type = 'admin'
              AND sm.is_read_by_user = 0
          ) AS unread_messages,

          (
            SELECT COUNT(*)

            FROM support_messages sm

            WHERE sm.ticket_id = st.id
          ) AS message_count

        FROM support_tickets st

        LEFT JOIN users admin_user
          ON admin_user.id =
             st.assigned_admin_id

        WHERE st.user_id = ?

        ${statusCondition}

        ORDER BY
          st.last_message_at DESC,
          st.id DESC
      `,
    parameters,
  );

  return rows.map(mapTicketRow);
}

async function getUserTicketDetails(requestingUserId, ticketIdValue) {
  const userId = parsePositiveInteger(requestingUserId);

  const ticketId = parsePositiveInteger(ticketIdValue);

  if (!userId) {
    throw createServiceError(
      "Valid user ID is required.",
      400,
      "INVALID_USER_ID",
    );
  }

  if (!ticketId) {
    throw createServiceError(
      "Valid support ticket ID is required.",
      400,
      "INVALID_TICKET_ID",
    );
  }

  const [ticketRows] = await pool.query(
    `
        SELECT
          st.id,
          st.ticket_code,
          st.user_id,
          st.category,
          st.subject,
          st.ticket_status,
          st.priority,
          st.assigned_admin_id,
          st.last_message_at,
          st.resolved_at,
          st.closed_at,
          st.created_at,
          st.updated_at,

          admin_user.full_name
            AS assigned_admin_name,

          NULL AS last_message,
          0 AS unread_messages,

          (
            SELECT COUNT(*)

            FROM support_messages sm

            WHERE sm.ticket_id = st.id
          ) AS message_count

        FROM support_tickets st

        LEFT JOIN users admin_user
          ON admin_user.id =
             st.assigned_admin_id

        WHERE st.id = ?
          AND st.user_id = ?

        LIMIT 1
      `,
    [ticketId, userId],
  );

  if (!ticketRows.length) {
    throw createServiceError(
      "Support ticket was not found.",
      404,
      "TICKET_NOT_FOUND",
    );
  }

  await pool.query(
    `
      UPDATE support_messages

      SET is_read_by_user = 1

      WHERE ticket_id = ?
        AND sender_type = 'admin'
        AND is_read_by_user = 0
    `,
    [ticketId],
  );

  const [messageRows] = await pool.query(
    `
        SELECT
          sm.id,
          sm.ticket_id,
          sm.sender_user_id,
          sm.sender_type,
          sm.message_text,
          sm.is_read_by_user,
          sm.is_read_by_admin,
          sm.created_at,

          sender.full_name
            AS sender_name

        FROM support_messages sm

        INNER JOIN users sender
          ON sender.id =
             sm.sender_user_id

        WHERE sm.ticket_id = ?

        ORDER BY
          sm.created_at ASC,
          sm.id ASC
      `,
    [ticketId],
  );

  return {
    ticket: mapTicketRow(ticketRows[0]),

    messages: messageRows.map(mapMessageRow),
  };
}

async function replyToUserTicket(
  requestingUserId,
  ticketIdValue,
  payload = {},
) {
  const userId = parsePositiveInteger(requestingUserId);

  const ticketId = parsePositiveInteger(ticketIdValue);

  const messageText = normalizeText(payload.message ?? payload.messageText);

  if (!userId) {
    throw createServiceError(
      "Valid user ID is required.",
      400,
      "INVALID_USER_ID",
    );
  }

  if (!ticketId) {
    throw createServiceError(
      "Valid support ticket ID is required.",
      400,
      "INVALID_TICKET_ID",
    );
  }

  if (messageText.length < 1 || messageText.length > 3000) {
    throw createServiceError(
      "Reply must contain 1 to 3000 characters.",
      400,
      "INVALID_SUPPORT_REPLY",
    );
  }

  await withTransaction(async (connection) => {
    const ticket = await getLockedUserTicket(connection, ticketId, userId);

    if (!ticket) {
      throw createServiceError(
        "Support ticket was not found.",
        404,
        "TICKET_NOT_FOUND",
      );
    }

    if (ticket.ticket_status === TICKET_STATUS.CLOSED) {
      throw createServiceError(
        "A closed support ticket cannot receive new messages.",
        409,
        "TICKET_ALREADY_CLOSED",
      );
    }

    await connection.query(
      `
          INSERT INTO support_messages (
            ticket_id,
            sender_user_id,
            sender_type,
            message_text,
            is_read_by_user,
            is_read_by_admin
          )
          VALUES (
            ?,
            ?,
            'user',
            ?,
            1,
            0
          )
        `,
      [ticketId, userId, messageText],
    );

    const nextStatus =
      ticket.ticket_status === TICKET_STATUS.RESOLVED
        ? TICKET_STATUS.OPEN
        : ticket.ticket_status;

    await connection.query(
      `
          UPDATE support_tickets

          SET
            ticket_status = ?,
            resolved_at =
              CASE
                WHEN ? = 'open'
                THEN NULL
                ELSE resolved_at
              END,
            last_message_at = NOW()

          WHERE id = ?
            AND user_id = ?
        `,
      [nextStatus, nextStatus, ticketId, userId],
    );
  });

  return getUserTicketDetails(userId, ticketId);
}

async function closeUserTicket(requestingUserId, ticketIdValue) {
  const userId = parsePositiveInteger(requestingUserId);

  const ticketId = parsePositiveInteger(ticketIdValue);

  if (!userId || !ticketId) {
    throw createServiceError(
      "Valid user and ticket IDs are required.",
      400,
      "INVALID_SUPPORT_REQUEST",
    );
  }

  await withTransaction(async (connection) => {
    const ticket = await getLockedUserTicket(connection, ticketId, userId);

    if (!ticket) {
      throw createServiceError(
        "Support ticket was not found.",
        404,
        "TICKET_NOT_FOUND",
      );
    }

    if (ticket.ticket_status === TICKET_STATUS.CLOSED) {
      return;
    }

    await connection.query(
      `
          UPDATE support_tickets

          SET
            ticket_status = 'closed',
            closed_at = NOW(),
            last_message_at = NOW()

          WHERE id = ?
            AND user_id = ?
        `,
      [ticketId, userId],
    );
  });

  return getUserTicketDetails(userId, ticketId);
}

async function getAdminTickets(requestingAdminId, query = {}) {
  const adminId = parsePositiveInteger(requestingAdminId);

  if (!adminId) {
    throw createServiceError(
      "Valid admin ID is required.",
      400,
      "INVALID_ADMIN_ID",
    );
  }

  const requestedStatus = normalizeOption(query.status);

  const requestedPriority = normalizeOption(query.priority);

  const requestedCategory = normalizeOption(query.category);

  const search = normalizeText(query.search).replace(/\s+/g, " ");

  const page = Math.max(parsePositiveInteger(query.page) || 1, 1);

  const limit = Math.min(
    Math.max(parsePositiveInteger(query.limit) || 20, 1),
    100,
  );

  if (requestedStatus && !ALLOWED_STATUSES.has(requestedStatus)) {
    throw createServiceError(
      "Invalid support ticket status.",
      400,
      "INVALID_TICKET_STATUS",
    );
  }

  if (requestedPriority && !ALLOWED_PRIORITIES.has(requestedPriority)) {
    throw createServiceError(
      "Invalid support ticket priority.",
      400,
      "INVALID_TICKET_PRIORITY",
    );
  }

  if (requestedCategory && !ALLOWED_CATEGORIES.has(requestedCategory)) {
    throw createServiceError(
      "Invalid support ticket category.",
      400,
      "INVALID_SUPPORT_CATEGORY",
    );
  }

  if (search.length > 150) {
    throw createServiceError(
      "Support search text is too long.",
      400,
      "INVALID_SUPPORT_SEARCH",
    );
  }

  const conditions = [];
  const parameters = [];

  if (requestedStatus) {
    conditions.push("st.ticket_status = ?");

    parameters.push(requestedStatus);
  }

  if (requestedPriority) {
    conditions.push("st.priority = ?");

    parameters.push(requestedPriority);
  }

  if (requestedCategory) {
    conditions.push("st.category = ?");

    parameters.push(requestedCategory);
  }

  if (search) {
    const searchPattern = `%${search}%`;

    conditions.push(
      `(
        st.ticket_code LIKE ?
        OR st.subject LIKE ?
        OR ticket_user.full_name LIKE ?
        OR ticket_user.uid LIKE ?
        OR ticket_user.phone LIKE ?
        OR ticket_user.email LIKE ?
      )`,
    );

    parameters.push(
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
    );
  }

  const whereClause = conditions.length
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  const [countRows] = await pool.query(
    `
        SELECT COUNT(*) AS total

        FROM support_tickets st

        INNER JOIN users ticket_user
          ON ticket_user.id = st.user_id

        ${whereClause}
      `,
    parameters,
  );

  const total = Number(countRows[0]?.total || 0);

  const totalPages = Math.max(Math.ceil(total / limit), 1);

  const safePage = Math.min(page, totalPages);

  const offset = (safePage - 1) * limit;

  const [rows] = await pool.query(
    `
        SELECT
          st.id,
          st.ticket_code,
          st.user_id,
          st.category,
          st.subject,
          st.ticket_status,
          st.priority,
          st.assigned_admin_id,
          st.last_message_at,
          st.resolved_at,
          st.closed_at,
          st.created_at,
          st.updated_at,

          ticket_user.full_name
            AS user_name,

          ticket_user.uid
            AS user_uid,

          ticket_user.phone
            AS user_phone,

          ticket_user.email
            AS user_email,

          admin_user.full_name
            AS assigned_admin_name,

          (
            SELECT sm.message_text

            FROM support_messages sm

            WHERE sm.ticket_id = st.id

            ORDER BY
              sm.created_at DESC,
              sm.id DESC

            LIMIT 1
          ) AS last_message,

          (
            SELECT COUNT(*)

            FROM support_messages sm

            WHERE sm.ticket_id = st.id
              AND sm.sender_type = 'user'
              AND sm.is_read_by_admin = 0
          ) AS unread_messages,

          (
            SELECT COUNT(*)

            FROM support_messages sm

            WHERE sm.ticket_id = st.id
          ) AS message_count

        FROM support_tickets st

        INNER JOIN users ticket_user
          ON ticket_user.id = st.user_id

        LEFT JOIN users admin_user
          ON admin_user.id =
             st.assigned_admin_id

        ${whereClause}

        ORDER BY
          CASE st.priority
            WHEN 'urgent' THEN 1
            WHEN 'high' THEN 2
            WHEN 'normal' THEN 3
            ELSE 4
          END ASC,

          CASE st.ticket_status
            WHEN 'open' THEN 1
            WHEN 'in_progress' THEN 2
            WHEN 'waiting_user' THEN 3
            WHEN 'resolved' THEN 4
            ELSE 5
          END ASC,

          st.last_message_at DESC,
          st.id DESC

        LIMIT ?
        OFFSET ?
      `,
    [...parameters, limit, offset],
  );

  const [summaryRows] = await pool.query(
    `
        SELECT
          COUNT(*) AS total,

          SUM(
            ticket_status = 'open'
          ) AS open_count,

          SUM(
            ticket_status = 'in_progress'
          ) AS in_progress_count,

          SUM(
            ticket_status = 'waiting_user'
          ) AS waiting_user_count,

          SUM(
            ticket_status = 'resolved'
          ) AS resolved_count,

          SUM(
            ticket_status = 'closed'
          ) AS closed_count,

          SUM(
            priority = 'urgent'
            AND ticket_status NOT IN (
              'resolved',
              'closed'
            )
          ) AS urgent_count

        FROM support_tickets
      `,
  );

  const summary = summaryRows[0] || {};

  return {
    tickets: rows.map(mapTicketRow),

    pagination: {
      page: safePage,
      limit,
      total,
      totalPages,
    },

    summary: {
      total: Number(summary.total || 0),

      open: Number(summary.open_count || 0),

      inProgress: Number(summary.in_progress_count || 0),

      waitingUser: Number(summary.waiting_user_count || 0),

      resolved: Number(summary.resolved_count || 0),

      closed: Number(summary.closed_count || 0),

      urgent: Number(summary.urgent_count || 0),
    },
  };
}

async function getAdminTicketDetails(requestingAdminId, ticketIdValue) {
  const adminId = parsePositiveInteger(requestingAdminId);

  const ticketId = parsePositiveInteger(ticketIdValue);

  if (!adminId || !ticketId) {
    throw createServiceError(
      "Valid admin and ticket IDs are required.",
      400,
      "INVALID_ADMIN_TICKET_REQUEST",
    );
  }

  const [ticketRows] = await pool.query(
    `
        SELECT
          st.id,
          st.ticket_code,
          st.user_id,
          st.category,
          st.subject,
          st.ticket_status,
          st.priority,
          st.assigned_admin_id,
          st.last_message_at,
          st.resolved_at,
          st.closed_at,
          st.created_at,
          st.updated_at,

          ticket_user.full_name
            AS user_name,

          ticket_user.uid
            AS user_uid,

          ticket_user.phone
            AS user_phone,

          ticket_user.email
            AS user_email,

          admin_user.full_name
            AS assigned_admin_name,

          NULL AS last_message,
          0 AS unread_messages,

          (
            SELECT COUNT(*)

            FROM support_messages sm

            WHERE sm.ticket_id = st.id
          ) AS message_count

        FROM support_tickets st

        INNER JOIN users ticket_user
          ON ticket_user.id = st.user_id

        LEFT JOIN users admin_user
          ON admin_user.id =
             st.assigned_admin_id

        WHERE st.id = ?

        LIMIT 1
      `,
    [ticketId],
  );

  if (!ticketRows.length) {
    throw createServiceError(
      "Support ticket was not found.",
      404,
      "TICKET_NOT_FOUND",
    );
  }

  await pool.query(
    `
      UPDATE support_messages

      SET is_read_by_admin = 1

      WHERE ticket_id = ?
        AND sender_type = 'user'
        AND is_read_by_admin = 0
    `,
    [ticketId],
  );

  const [messageRows] = await pool.query(
    `
        SELECT
          sm.id,
          sm.ticket_id,
          sm.sender_user_id,
          sm.sender_type,
          sm.message_text,
          sm.is_read_by_user,
          sm.is_read_by_admin,
          sm.created_at,

          sender.full_name
            AS sender_name

        FROM support_messages sm

        INNER JOIN users sender
          ON sender.id =
             sm.sender_user_id

        WHERE sm.ticket_id = ?

        ORDER BY
          sm.created_at ASC,
          sm.id ASC
      `,
    [ticketId],
  );

  return {
    ticket: mapTicketRow(ticketRows[0]),

    messages: messageRows.map(mapMessageRow),
  };
}

async function getLockedAdmin(connection, adminId) {
  const [rows] = await connection.query(
    `
        SELECT
          id,
          full_name,
          role,
          account_status

        FROM users

        WHERE id = ?

        LIMIT 1

        FOR UPDATE
      `,
    [adminId],
  );

  return rows[0] || null;
}

async function getLockedAdminTicket(connection, ticketId) {
  const [rows] = await connection.query(
    `
        SELECT
          id,
          ticket_code,
          user_id,
          category,
          subject,
          ticket_status,
          priority,
          assigned_admin_id,
          last_message_at,
          resolved_at,
          closed_at,
          created_at,
          updated_at

        FROM support_tickets

        WHERE id = ?

        LIMIT 1

        FOR UPDATE
      `,
    [ticketId],
  );

  return rows[0] || null;
}

function validateAdminAccount(admin) {
  if (!admin) {
    throw createServiceError(
      "Admin account was not found.",
      404,
      "ADMIN_NOT_FOUND",
    );
  }

  if (admin.role !== "admin" || admin.account_status !== "active") {
    throw createServiceError(
      "An active admin account is required.",
      403,
      "ADMIN_ACCESS_DENIED",
    );
  }
}

async function replyToTicketAsAdmin(
  requestingAdminId,
  ticketIdValue,
  payload = {},
) {
  const adminId = parsePositiveInteger(requestingAdminId);

  const ticketId = parsePositiveInteger(ticketIdValue);

  const messageText = normalizeText(payload.message ?? payload.messageText);

  if (!adminId || !ticketId) {
    throw createServiceError(
      "Valid admin and ticket IDs are required.",
      400,
      "INVALID_ADMIN_REPLY_REQUEST",
    );
  }

  if (messageText.length < 1 || messageText.length > 3000) {
    throw createServiceError(
      "Admin reply must contain 1 to 3000 characters.",
      400,
      "INVALID_ADMIN_REPLY",
    );
  }

  await withTransaction(async (connection) => {
    const admin = await getLockedAdmin(connection, adminId);

    validateAdminAccount(admin);

    const ticket = await getLockedAdminTicket(connection, ticketId);

    if (!ticket) {
      throw createServiceError(
        "Support ticket was not found.",
        404,
        "TICKET_NOT_FOUND",
      );
    }

    if (ticket.ticket_status === TICKET_STATUS.CLOSED) {
      throw createServiceError(
        "A closed support ticket cannot receive new messages.",
        409,
        "TICKET_ALREADY_CLOSED",
      );
    }

    await connection.query(
      `
          INSERT INTO support_messages (
            ticket_id,
            sender_user_id,
            sender_type,
            message_text,
            is_read_by_user,
            is_read_by_admin
          )
          VALUES (
            ?,
            ?,
            'admin',
            ?,
            0,
            1
          )
        `,
      [ticketId, adminId, messageText],
    );

    await connection.query(
      `
          UPDATE support_tickets

          SET
            ticket_status = 'waiting_user',

            assigned_admin_id =
              COALESCE(
                assigned_admin_id,
                ?
              ),

            resolved_at = NULL,
            closed_at = NULL,

            last_message_at = NOW()

          WHERE id = ?
        `,
      [adminId, ticketId],
    );
  });

  return getAdminTicketDetails(adminId, ticketId);
}

async function updateTicketAsAdmin(
  requestingAdminId,
  ticketIdValue,
  payload = {},
) {
  const adminId = parsePositiveInteger(requestingAdminId);

  const ticketId = parsePositiveInteger(ticketIdValue);

  if (!adminId || !ticketId) {
    throw createServiceError(
      "Valid admin and ticket IDs are required.",
      400,
      "INVALID_ADMIN_UPDATE_REQUEST",
    );
  }

  const hasStatus = Object.prototype.hasOwnProperty.call(payload, "status");

  const hasPriority = Object.prototype.hasOwnProperty.call(payload, "priority");

  const hasAssignedAdmin = Object.prototype.hasOwnProperty.call(
    payload,
    "assignedAdminId",
  );

  if (!hasStatus && !hasPriority && !hasAssignedAdmin) {
    throw createServiceError(
      "Status, priority or assigned admin is required.",
      400,
      "EMPTY_ADMIN_TICKET_UPDATE",
    );
  }

  const requestedStatus = hasStatus ? normalizeOption(payload.status) : null;

  const requestedPriority = hasPriority
    ? normalizeOption(payload.priority)
    : null;

  if (hasStatus && !ALLOWED_STATUSES.has(requestedStatus)) {
    throw createServiceError(
      "Invalid support ticket status.",
      400,
      "INVALID_TICKET_STATUS",
    );
  }

  if (hasPriority && !ALLOWED_PRIORITIES.has(requestedPriority)) {
    throw createServiceError(
      "Invalid support ticket priority.",
      400,
      "INVALID_TICKET_PRIORITY",
    );
  }

  let requestedAssignedAdminId = null;

  if (
    hasAssignedAdmin &&
    payload.assignedAdminId !== null &&
    payload.assignedAdminId !== ""
  ) {
    requestedAssignedAdminId = parsePositiveInteger(payload.assignedAdminId);

    if (!requestedAssignedAdminId) {
      throw createServiceError(
        "Assigned admin ID is invalid.",
        400,
        "INVALID_ASSIGNED_ADMIN_ID",
      );
    }
  }

  await withTransaction(async (connection) => {
    const requestingAdmin = await getLockedAdmin(connection, adminId);

    validateAdminAccount(requestingAdmin);

    const ticket = await getLockedAdminTicket(connection, ticketId);

    if (!ticket) {
      throw createServiceError(
        "Support ticket was not found.",
        404,
        "TICKET_NOT_FOUND",
      );
    }

    if (requestedAssignedAdminId !== null) {
      const assignedAdmin =
        requestedAssignedAdminId === adminId
          ? requestingAdmin
          : await getLockedAdmin(connection, requestedAssignedAdminId);

      validateAdminAccount(assignedAdmin);
    }

    const nextStatus = hasStatus ? requestedStatus : ticket.ticket_status;

    const nextPriority = hasPriority ? requestedPriority : ticket.priority;

    const nextAssignedAdminId = hasAssignedAdmin
      ? requestedAssignedAdminId
      : ticket.assigned_admin_id;

    const resolvedAt =
      nextStatus === TICKET_STATUS.RESOLVED ? new Date() : null;

    const closedAt = nextStatus === TICKET_STATUS.CLOSED ? new Date() : null;

    await connection.query(
      `
          UPDATE support_tickets

          SET
            ticket_status = ?,
            priority = ?,
            assigned_admin_id = ?,
            resolved_at = ?,
            closed_at = ?,
            updated_at = CURRENT_TIMESTAMP

          WHERE id = ?
        `,
      [
        nextStatus,
        nextPriority,
        nextAssignedAdminId,
        resolvedAt,
        closedAt,
        ticketId,
      ],
    );
  });

  return getAdminTicketDetails(adminId, ticketId);
}

module.exports = {
  createTicket,
  getUserTickets,
  getUserTicketDetails,
  replyToUserTicket,
  closeUserTicket,
  getAdminTickets,
  getAdminTicketDetails,
  replyToTicketAsAdmin,
  updateTicketAsAdmin,

  TICKET_STATUS,
  TICKET_PRIORITY,
  TICKET_CATEGORY,

  _internal: {
    createServiceError,
    parsePositiveInteger,
    normalizeText,
    normalizeOption,
    createTicketCode,
    mapTicketRow,
    mapMessageRow,
    withTransaction,
    getLockedUser,
    getLockedUserTicket,
    getLockedAdmin,
    getLockedAdminTicket,
    validateAdminAccount,
    ALLOWED_CATEGORIES,
    ALLOWED_STATUSES,
    ALLOWED_PRIORITIES,
  },
};
