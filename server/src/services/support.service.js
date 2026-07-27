"use strict";

const crypto = require("crypto");

const {
  pool,
} = require("../config/database");

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

const ALLOWED_CATEGORIES = new Set(
  Object.values(TICKET_CATEGORY),
);

const ALLOWED_STATUSES = new Set(
  Object.values(TICKET_STATUS),
);

const ALLOWED_PRIORITIES = new Set(
  Object.values(TICKET_PRIORITY),
);

function createServiceError(
  message,
  statusCode = 500,
  code = "SUPPORT_ERROR",
) {
  const error = new Error(message);

  error.statusCode = statusCode;
  error.code = code;

  return error;
}

function parsePositiveInteger(value) {
  const number = Number.parseInt(
    value,
    10,
  );

  if (
    !Number.isInteger(number) ||
    number < 1
  ) {
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
  const timestamp =
    Date.now().toString(36).toUpperCase();

  const randomPart =
    crypto
      .randomBytes(4)
      .toString("hex")
      .toUpperCase();

  return `SUP-${timestamp}-${randomPart}`;
}

function mapTicketRow(row) {
  return {
    id: Number(row.id),
    ticketId: Number(row.id),

    ticketCode: row.ticket_code,

    userId: Number(row.user_id),

    category: row.category,
    subject: row.subject,

    status: row.ticket_status,
    priority: row.priority,

    assignedAdminId:
      row.assigned_admin_id === null
        ? null
        : Number(row.assigned_admin_id),

    assignedAdminName:
      row.assigned_admin_name || null,

    lastMessage:
      row.last_message || null,

    unreadMessages:
      Number(row.unread_messages || 0),

    messageCount:
      Number(row.message_count || 0),

    lastMessageAt:
      row.last_message_at,

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

    senderUserId:
      Number(row.sender_user_id),

    senderType: row.sender_type,

    senderName:
      row.sender_name || null,

    messageText: row.message_text,

    isReadByUser:
      Boolean(row.is_read_by_user),

    isReadByAdmin:
      Boolean(row.is_read_by_admin),

    createdAt: row.created_at,
  };
}

async function withTransaction(callback) {
  const connection =
    await pool.getConnection();

  try {
    await connection.beginTransaction();

    const result =
      await callback(connection);

    await connection.commit();

    return result;
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error(
        "SUPPORT TRANSACTION ROLLBACK ERROR:",
        rollbackError,
      );
    }

    throw error;
  } finally {
    connection.release();
  }
}

async function getLockedUser(
  connection,
  userId,
) {
  const [rows] =
    await connection.query(
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

async function getLockedUserTicket(
  connection,
  ticketId,
  userId,
) {
  const [rows] =
    await connection.query(
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
      [
        ticketId,
        userId,
      ],
    );

  return rows[0] || null;
}

async function createTicket(
  requestingUserId,
  payload = {},
) {
  const userId =
    parsePositiveInteger(
      requestingUserId,
    );

  if (!userId) {
    throw createServiceError(
      "Valid user ID is required.",
      400,
      "INVALID_USER_ID",
    );
  }

  const category =
    normalizeOption(
      payload.category,
    );

  const subject =
    normalizeText(
      payload.subject,
    ).replace(/\s+/g, " ");

  const messageText =
    normalizeText(
      payload.message ??
        payload.messageText,
    );

  if (!ALLOWED_CATEGORIES.has(category)) {
    throw createServiceError(
      "Please select a valid support category.",
      400,
      "INVALID_SUPPORT_CATEGORY",
    );
  }

  if (
    subject.length < 5 ||
    subject.length > 150
  ) {
    throw createServiceError(
      "Support subject must contain 5 to 150 characters.",
      400,
      "INVALID_SUPPORT_SUBJECT",
    );
  }

  if (
    messageText.length < 10 ||
    messageText.length > 3000
  ) {
    throw createServiceError(
      "Support message must contain 10 to 3000 characters.",
      400,
      "INVALID_SUPPORT_MESSAGE",
    );
  }

  const result =
    await withTransaction(
      async connection => {
        const user =
          await getLockedUser(
            connection,
            userId,
          );

        if (!user) {
          throw createServiceError(
            "User account was not found.",
            404,
            "USER_NOT_FOUND",
          );
        }

        if (
          user.account_status !==
          "active"
        ) {
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
        for (
          let attempt = 1;
          attempt <= 3;
          attempt += 1
        ) {
          ticketCode =
            createTicketCode();

          try {
            [ticketResult] =
              await connection.query(
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
                [
                  ticketCode,
                  userId,
                  category,
                  subject,
                ],
              );

            break;
          } catch (error) {
            if (
              error.code !==
                "ER_DUP_ENTRY" ||
              attempt === 3
            ) {
              throw error;
            }
          }
        }

        const ticketId =
          Number(
            ticketResult.insertId,
          );

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
          [
            ticketId,
            userId,
            messageText,
          ],
        );

        return {
          ticketId,
          ticketCode,
        };
      },
    );

  return getUserTicketDetails(
    userId,
    result.ticketId,
  );
}

async function getUserTickets(
  requestingUserId,
  query = {},
) {
  const userId =
    parsePositiveInteger(
      requestingUserId,
    );

  if (!userId) {
    throw createServiceError(
      "Valid user ID is required.",
      400,
      "INVALID_USER_ID",
    );
  }

  const requestedStatus =
    normalizeOption(
      query.status,
    );

  const parameters = [userId];

  let statusCondition = "";

  if (requestedStatus) {
    if (
      !ALLOWED_STATUSES.has(
        requestedStatus,
      )
    ) {
      throw createServiceError(
        "Invalid support ticket status.",
        400,
        "INVALID_TICKET_STATUS",
      );
    }

    statusCondition =
      "AND st.ticket_status = ?";

    parameters.push(
      requestedStatus,
    );
  }

  const [rows] =
    await pool.query(
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

  return rows.map(
    mapTicketRow,
  );
}

async function getUserTicketDetails(
  requestingUserId,
  ticketIdValue,
) {
  const userId =
    parsePositiveInteger(
      requestingUserId,
    );

  const ticketId =
    parsePositiveInteger(
      ticketIdValue,
    );

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

  const [ticketRows] =
    await pool.query(
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
      [
        ticketId,
        userId,
      ],
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

  const [messageRows] =
    await pool.query(
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
    ticket:
      mapTicketRow(
        ticketRows[0],
      ),

    messages:
      messageRows.map(
        mapMessageRow,
      ),
  };
}

async function replyToUserTicket(
  requestingUserId,
  ticketIdValue,
  payload = {},
) {
  const userId =
    parsePositiveInteger(
      requestingUserId,
    );

  const ticketId =
    parsePositiveInteger(
      ticketIdValue,
    );

  const messageText =
    normalizeText(
      payload.message ??
        payload.messageText,
    );

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

  if (
    messageText.length < 1 ||
    messageText.length > 3000
  ) {
    throw createServiceError(
      "Reply must contain 1 to 3000 characters.",
      400,
      "INVALID_SUPPORT_REPLY",
    );
  }

  await withTransaction(
    async connection => {
      const ticket =
        await getLockedUserTicket(
          connection,
          ticketId,
          userId,
        );

      if (!ticket) {
        throw createServiceError(
          "Support ticket was not found.",
          404,
          "TICKET_NOT_FOUND",
        );
      }

      if (
        ticket.ticket_status ===
        TICKET_STATUS.CLOSED
      ) {
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
        [
          ticketId,
          userId,
          messageText,
        ],
      );

      const nextStatus =
        ticket.ticket_status ===
        TICKET_STATUS.RESOLVED
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
        [
          nextStatus,
          nextStatus,
          ticketId,
          userId,
        ],
      );
    },
  );

  return getUserTicketDetails(
    userId,
    ticketId,
  );
}

async function closeUserTicket(
  requestingUserId,
  ticketIdValue,
) {
  const userId =
    parsePositiveInteger(
      requestingUserId,
    );

  const ticketId =
    parsePositiveInteger(
      ticketIdValue,
    );

  if (!userId || !ticketId) {
    throw createServiceError(
      "Valid user and ticket IDs are required.",
      400,
      "INVALID_SUPPORT_REQUEST",
    );
  }

  await withTransaction(
    async connection => {
      const ticket =
        await getLockedUserTicket(
          connection,
          ticketId,
          userId,
        );

      if (!ticket) {
        throw createServiceError(
          "Support ticket was not found.",
          404,
          "TICKET_NOT_FOUND",
        );
      }

      if (
        ticket.ticket_status ===
        TICKET_STATUS.CLOSED
      ) {
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
        [
          ticketId,
          userId,
        ],
      );
    },
  );

  return getUserTicketDetails(
    userId,
    ticketId,
  );
}

module.exports = {
  createTicket,
  getUserTickets,
  getUserTicketDetails,
  replyToUserTicket,
  closeUserTicket,

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
    ALLOWED_CATEGORIES,
    ALLOWED_STATUSES,
    ALLOWED_PRIORITIES,
  },
};