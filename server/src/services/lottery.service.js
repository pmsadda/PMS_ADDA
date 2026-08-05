"use strict";

const crypto = require("crypto");

const { pool } = require("../config/database");

/* ==========================================
   Lottery Constants
========================================== */

const ALLOWED_TICKET_PRICES = Object.freeze([20, 50, 100]);

const PUBLIC_DRAW_STATUSES = Object.freeze([
  "selling",
  "paused",
  "sold_out",
  "countdown",
  "ready_to_draw",
  "drawing",
  "completed",
]);

/* ==========================================
   Common Helpers
========================================== */

function createServiceError(message, statusCode = 400, code = "LOTTERY_ERROR") {
  const error = new Error(message);

  error.statusCode = statusCode;

  error.code = code;

  return error;
}

function parsePositiveInteger(value, fieldName) {
  const number = Number.parseInt(String(value), 10);

  if (!Number.isInteger(number) || number < 1) {
    throw createServiceError(
      `${fieldName} is invalid.`,
      400,
      "INVALID_LOTTERY_INPUT",
    );
  }

  return number;
}

function parseMoney(value) {
  const number = Number(value || 0);

  if (!Number.isFinite(number)) {
    return 0;
  }

  return Number(number.toFixed(2));
}

function parseListLimit(value, fallback = 30, maximum = 100) {
  const parsed = Number.parseInt(String(value || ""), 10);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(parsed, maximum);
}

function calculateAmountByPercent(grossAmount, percent) {
  return parseMoney((parseMoney(grossAmount) * parseMoney(percent)) / 100);
}

function isCompletedDraw(status) {
  return String(status) === "completed";
}

/* ==========================================
   Fair Draw Cryptography
========================================== */

const LOTTERY_SEED_KEY_NAME = "LOTTERY_SEED_ENCRYPTION_KEY";

const ZERO_AUDIT_HASH = "0".repeat(64);

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function canonicalizeJson(value) {
  if (value === undefined) {
    return "null";
  }

  if (value === null) {
    return "null";
  }

  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonicalizeJson).join(",")}]`;
  }

  if (typeof value === "object") {
    const keys = Object.keys(value).sort();

    const entries = keys.map(
      (key) => `${JSON.stringify(key)}:${canonicalizeJson(value[key])}`,
    );

    return `{${entries.join(",")}}`;
  }

  if (typeof value === "number" && !Number.isFinite(value)) {
    return "null";
  }

  return JSON.stringify(value);
}

function formatMysqlDateTime(date = new Date()) {
  const iso = date.toISOString();

  return iso.slice(0, 23).replace("T", " ") + "000";
}

function getSeedEncryptionKey() {
  const rawKey = String(process.env[LOTTERY_SEED_KEY_NAME] || "").trim();

  if (!rawKey) {
    throw createServiceError(
      `${LOTTERY_SEED_KEY_NAME} is not configured.`,
      500,
      "LOTTERY_SEED_KEY_MISSING",
    );
  }

  if (/^[a-fA-F0-9]{64}$/.test(rawKey)) {
    return Buffer.from(rawKey, "hex");
  }

  let base64Key;

  try {
    base64Key = Buffer.from(rawKey, "base64");
  } catch (_error) {
    base64Key = null;
  }

  if (base64Key && base64Key.length === 32) {
    return base64Key;
  }

  throw createServiceError(
    `${LOTTERY_SEED_KEY_NAME} must be a 64-character hex key or a 32-byte base64 key.`,
    500,
    "LOTTERY_SEED_KEY_INVALID",
  );
}

function encryptServerSeed(serverSeed) {
  const encryptionKey = getSeedEncryptionKey();

  const initializationVector = crypto.randomBytes(12);

  const cipher = crypto.createCipheriv(
    "aes-256-gcm",
    encryptionKey,
    initializationVector,
  );

  const ciphertext = Buffer.concat([cipher.update(serverSeed), cipher.final()]);

  const authenticationTag = cipher.getAuthTag();

  return [
    "v1",

    initializationVector.toString("base64"),

    authenticationTag.toString("base64"),

    ciphertext.toString("base64"),
  ].join(":");
}

function decryptServerSeed(encryptedValue) {
  const parts = String(encryptedValue || "").split(":");

  if (parts.length !== 4 || parts[0] !== "v1") {
    throw createServiceError(
      "Lottery seed data is invalid.",
      500,
      "LOTTERY_SEED_DATA_INVALID",
    );
  }

  const encryptionKey = getSeedEncryptionKey();

  try {
    const initializationVector = Buffer.from(parts[1], "base64");

    const authenticationTag = Buffer.from(parts[2], "base64");

    const ciphertext = Buffer.from(parts[3], "base64");

    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      encryptionKey,
      initializationVector,
    );

    decipher.setAuthTag(authenticationTag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch (_error) {
    throw createServiceError(
      "Lottery seed could not be decrypted.",
      500,
      "LOTTERY_SEED_DECRYPT_FAILED",
    );
  }
}

function createEncryptedSeedBundle() {
  const serverSeed = crypto.randomBytes(32);

  return {
    seedCommitment: sha256Hex(serverSeed),

    serverSeedCiphertext: encryptServerSeed(serverSeed),
  };
}

function generateDrawCode(ticketPrice) {
  const timePart = Date.now().toString(36).toUpperCase();

  const randomPart = crypto.randomBytes(4).toString("hex").toUpperCase();

  return ["LOT", String(ticketPrice), timePart, randomPart].join("-");
}

function generateTicketCode() {
  const numericPart = crypto
    .randomInt(0, 1_000_000_000_000)
    .toString()
    .padStart(12, "0");

  return `PMS-LT-${numericPart}`;
}

/* ==========================================
   Tamper-evident Audit Chain
========================================== */

async function appendLotteryAuditEvent(
  connection,
  {
    drawId,
    ticketId = null,
    actorType,
    actorUserId = null,
    eventType,
    eventData = {},
  },
) {
  const validDrawId = parsePositiveInteger(drawId, "Draw ID");

  const normalizedActorType = String(actorType || "")
    .trim()
    .toLowerCase();

  if (!["system", "admin", "player"].includes(normalizedActorType)) {
    throw createServiceError(
      "Lottery audit actor type is invalid.",
      500,
      "LOTTERY_AUDIT_ACTOR_INVALID",
    );
  }

  const normalizedEventType = String(eventType || "")
    .trim()
    .toUpperCase();

  if (!normalizedEventType || normalizedEventType.length > 60) {
    throw createServiceError(
      "Lottery audit event type is invalid.",
      500,
      "LOTTERY_AUDIT_EVENT_INVALID",
    );
  }

  const [previousRows] = await connection.query(
    `
        SELECT
          sequence_no,
          event_hash

        FROM lottery_audit_logs

        WHERE draw_id = ?

        ORDER BY
          sequence_no DESC

        LIMIT 1

        FOR UPDATE
      `,
    [validDrawId],
  );

  const previousEvent = previousRows[0] || null;

  const sequenceNo = previousEvent ? Number(previousEvent.sequence_no) + 1 : 1;

  const previousEventHash = previousEvent?.event_hash || ZERO_AUDIT_HASH;

  const occurredAt = formatMysqlDateTime();

  const normalizedTicketId =
    ticketId === null ? null : parsePositiveInteger(ticketId, "Ticket ID");

  const normalizedActorUserId =
    actorUserId === null
      ? null
      : parsePositiveInteger(actorUserId, "Actor user ID");

  const auditEnvelope = {
    drawId: validDrawId,

    sequenceNo,

    ticketId: normalizedTicketId,

    actorType: normalizedActorType,

    actorUserId: normalizedActorUserId,

    eventType: normalizedEventType,

    eventData,

    occurredAt,
  };

  const eventHash = sha256Hex(
    [previousEventHash, canonicalizeJson(auditEnvelope)].join("|"),
  );

  await connection.query(
    `
      INSERT INTO lottery_audit_logs (
        draw_id,
        sequence_no,
        ticket_id,
        actor_type,
        actor_user_id,
        event_type,
        event_data,
        previous_event_hash,
        event_hash,
        occurred_at
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
        ?
      )
    `,
    [
      validDrawId,
      sequenceNo,
      normalizedTicketId,
      normalizedActorType,
      normalizedActorUserId,
      normalizedEventType,
      JSON.stringify(eventData),
      previousEventHash,
      eventHash,
      occurredAt,
    ],
  );

  return {
    sequenceNo,
    previousEventHash,
    eventHash,
    occurredAt,
  };
}

/* ==========================================
   Row Mappers
========================================== */

function mapDrawRow(row) {
  const ticketPrice = parseMoney(row.ticket_price);

  const targetQuantity = Number(row.target_ticket_quantity || 0);

  const activeTicketCount = Number(row.active_ticket_count || 0);

  const cancelledTicketCount = Number(row.cancelled_ticket_count || 0);

  const projectedGross = parseMoney(ticketPrice * targetQuantity);

  const storedGross = parseMoney(row.gross_sales_amount);

  const grossAmount = storedGross > 0 ? storedGross : projectedGross;

  const firstPercent = parseMoney(row.first_prize_percent);

  const secondPercent = parseMoney(row.second_prize_percent);

  const thirdPercent = parseMoney(row.third_prize_percent);

  const servicePercent = parseMoney(row.service_charge_percent);

  const storedFirstPrize = parseMoney(row.first_prize_amount);

  const storedSecondPrize = parseMoney(row.second_prize_amount);

  const storedThirdPrize = parseMoney(row.third_prize_amount);

  const storedServiceCharge = parseMoney(row.service_charge_amount);

  const status = String(row.status || "");

  const remainingTicketCount = Math.max(0, targetQuantity - activeTicketCount);

  const progressPercent =
    targetQuantity > 0
      ? Number(
          Math.min(
            100,
            ((activeTicketCount / targetQuantity) * 100).toFixed(2),
          ),
        )
      : 0;

  const completed = isCompletedDraw(status);

  return {
    drawId: Number(row.id),

    drawCode: row.draw_code,

    title: row.draw_title,

    status,

    ticketPrice,

    targetTicketQuantity: targetQuantity,

    maxTicketsPerUser: Number(row.max_tickets_per_user || 0),

    minimumUniquePlayers: Number(row.minimum_unique_players || 0),

    activeTicketCount,

    cancelledTicketCount,

    remainingTicketCount,

    progressPercent,

    countdownSeconds: Number(row.countdown_seconds || 0),

    remainingSeconds: Math.max(0, Number(row.remaining_seconds || 0)),

    prizeDistribution: {
      grossAmount,

      first: {
        percent: firstPercent,

        amount:
          storedFirstPrize > 0
            ? storedFirstPrize
            : calculateAmountByPercent(grossAmount, firstPercent),
      },

      second: {
        percent: secondPercent,

        amount:
          storedSecondPrize > 0
            ? storedSecondPrize
            : calculateAmountByPercent(grossAmount, secondPercent),
      },

      third: {
        percent: thirdPercent,

        amount:
          storedThirdPrize > 0
            ? storedThirdPrize
            : calculateAmountByPercent(grossAmount, thirdPercent),
      },

      serviceCharge: {
        percent: servicePercent,

        amount:
          storedServiceCharge > 0
            ? storedServiceCharge
            : calculateAmountByPercent(grossAmount, servicePercent),
      },
    },

    cancellationFeePercent: parseMoney(row.cancellation_fee_percent),

    myTicketCount: Number(row.my_ticket_count || 0),

    canBuy: status === "selling" && remainingTicketCount > 0,

    proof: {
      seedCommitment: row.seed_commitment || null,

      ticketSetHash: row.ticket_set_hash || null,

      shuffleProofHash: completed ? row.shuffle_proof_hash || null : null,

      revealedSeed: completed ? row.revealed_seed || null : null,
    },

    timeline: {
      salesStartedAt: row.sales_started_at || null,

      soldOutAt: row.sold_out_at || null,

      countdownStartedAt: row.countdown_started_at || null,

      countdownEndsAt: row.countdown_ends_at || null,

      drawnAt: row.drawn_at || null,
    },

    createdAt: row.created_at || null,

    updatedAt: row.updated_at || null,
  };
}

function mapTicketRow(row) {
  const ticketStatus = String(row.status || "");

  const drawStatus = String(row.draw_status || "");

  return {
    ticketId: Number(row.id),

    ticketCode: row.ticket_code,

    drawId: Number(row.draw_id),

    drawCode: row.draw_code || null,

    drawTitle: row.draw_title || null,

    ticketPrice: parseMoney(row.ticket_price),

    status: ticketStatus,

    drawStatus,

    turnoverApplied: Boolean(Number(row.turnover_applied || 0)),

    turnoverAmount: parseMoney(row.turnover_amount),

    refundAmount: parseMoney(row.refund_amount),

    cancellationFeeAmount: parseMoney(row.cancellation_fee_amount),

    winnerRank: row.winner_rank === null ? null : Number(row.winner_rank),

    prizeAmount: parseMoney(row.prize_amount),

    cancellationSource: row.cancellation_source || null,

    cancellationReason: row.cancellation_reason || null,

    canCancel: ticketStatus === "active" && drawStatus === "selling",

    purchasedAt: row.purchased_at || null,

    lockedAt: row.locked_at || null,

    cancelledAt: row.cancelled_at || null,

    refundedAt: row.refunded_at || null,

    resultedAt: row.resulted_at || null,
  };
}

function mapWinnerRow(row) {
  return {
    winnerId: Number(row.id),

    drawId: Number(row.draw_id),

    drawCode: row.draw_code || null,

    drawTitle: row.draw_title || null,

    prizeRank: Number(row.prize_rank),

    ticketCode: row.ticket_code_snapshot,

    winnerUid: row.winner_uid,

    winnerName: row.winner_name,

    prizePercent: parseMoney(row.prize_percent),

    prizeAmount: parseMoney(row.prize_amount),

    winnerMessage: row.winner_message || null,

    announcedAt: row.announced_at || null,

    createdAt: row.created_at || null,
  };
}

/* ==========================================
   Public Draw List
========================================== */

async function getPublicDraws(userId) {
  const validUserId = parsePositiveInteger(userId, "User ID");

  const [rows] = await pool.query(
    `
        SELECT
          ld.id,
          ld.draw_code,
          ld.draw_title,
          ld.ticket_price,
          ld.target_ticket_quantity,
          ld.max_tickets_per_user,
          ld.minimum_unique_players,
          ld.countdown_seconds,
          ld.first_prize_percent,
          ld.second_prize_percent,
          ld.third_prize_percent,
          ld.service_charge_percent,
          ld.cancellation_fee_percent,
          ld.status,
          ld.active_ticket_count,
          ld.cancelled_ticket_count,
          ld.gross_sales_amount,
          ld.first_prize_amount,
          ld.second_prize_amount,
          ld.third_prize_amount,
          ld.service_charge_amount,
          ld.seed_commitment,
          ld.ticket_set_hash,
          ld.shuffle_proof_hash,
          ld.revealed_seed,
          ld.sales_started_at,
          ld.sold_out_at,
          ld.countdown_started_at,
          ld.countdown_ends_at,
          ld.drawn_at,
          ld.created_at,
          ld.updated_at,

          COALESCE(
            my_tickets.my_ticket_count,
            0
          ) AS my_ticket_count,

          CASE
            WHEN ld.countdown_ends_at
              IS NULL
            THEN 0
            ELSE GREATEST(
              0,
              TIMESTAMPDIFF(
                SECOND,
                UTC_TIMESTAMP(),
                ld.countdown_ends_at
              )
            )
          END AS remaining_seconds

        FROM lottery_draws ld

        LEFT JOIN (
          SELECT
            draw_id,
            COUNT(*) AS my_ticket_count

          FROM lottery_tickets

          WHERE user_id = ?
            AND status IN (
              'active',
              'locked',
              'winner',
              'non_winner'
            )

          GROUP BY draw_id
        ) my_tickets
          ON my_tickets.draw_id =
            ld.id

        WHERE ld.status IN (
          'selling',
          'paused',
          'sold_out',
          'countdown',
          'ready_to_draw',
          'drawing',
          'completed'
        )

        ORDER BY
          CASE ld.status
            WHEN 'drawing' THEN 1
            WHEN 'ready_to_draw' THEN 2
            WHEN 'countdown' THEN 3
            WHEN 'sold_out' THEN 4
            WHEN 'selling' THEN 5
            WHEN 'paused' THEN 6
            WHEN 'completed' THEN 7
            ELSE 8
          END ASC,
          ld.id DESC

        LIMIT 60
      `,
    [validUserId],
  );

  return rows.map(mapDrawRow);
}

/* ==========================================
   Public Draw Details
========================================== */

async function getDrawDetails(userId, drawId) {
  const validUserId = parsePositiveInteger(userId, "User ID");

  const validDrawId = parsePositiveInteger(drawId, "Draw ID");

  const [drawRows] = await pool.query(
    `
        SELECT
          ld.*,

          (
            SELECT COUNT(*)

            FROM lottery_tickets lt

            WHERE lt.draw_id = ld.id
              AND lt.user_id = ?
              AND lt.status IN (
                'active',
                'locked',
                'winner',
                'non_winner'
              )
          ) AS my_ticket_count,

          CASE
            WHEN ld.countdown_ends_at
              IS NULL
            THEN 0
            ELSE GREATEST(
              0,
              TIMESTAMPDIFF(
                SECOND,
                UTC_TIMESTAMP(),
                ld.countdown_ends_at
              )
            )
          END AS remaining_seconds

        FROM lottery_draws ld

        WHERE ld.id = ?
          AND ld.status IN (
            'selling',
            'paused',
            'sold_out',
            'countdown',
            'ready_to_draw',
            'drawing',
            'completed'
          )

        LIMIT 1
      `,
    [validUserId, validDrawId],
  );

  const drawRow = drawRows[0] || null;

  if (!drawRow) {
    throw createServiceError(
      "Lottery draw was not found.",
      404,
      "LOTTERY_DRAW_NOT_FOUND",
    );
  }

  const [ticketRows] = await pool.query(
    `
        SELECT
          lt.id,
          lt.ticket_code,
          lt.draw_id,
          lt.ticket_price,
          lt.status,
          lt.turnover_applied,
          lt.turnover_amount,
          lt.refund_amount,
          lt.cancellation_fee_amount,
          lt.winner_rank,
          lt.prize_amount,
          lt.cancellation_source,
          lt.cancellation_reason,
          lt.purchased_at,
          lt.locked_at,
          lt.cancelled_at,
          lt.refunded_at,
          lt.resulted_at,

          ld.draw_code,
          ld.draw_title,
          ld.status AS draw_status

        FROM lottery_tickets lt

        INNER JOIN lottery_draws ld
          ON ld.id = lt.draw_id

        WHERE lt.draw_id = ?
          AND lt.user_id = ?

        ORDER BY
          lt.id DESC
      `,
    [validDrawId, validUserId],
  );

  let winners = [];

  if (isCompletedDraw(drawRow.status)) {
    const [winnerRows] = await pool.query(
      `
          SELECT
            lw.*,

            ld.draw_code,
            ld.draw_title

          FROM lottery_winners lw

          INNER JOIN lottery_draws ld
            ON ld.id = lw.draw_id

          WHERE lw.draw_id = ?
            AND lw.settlement_status =
              'completed'

          ORDER BY
            lw.prize_rank ASC
        `,
      [validDrawId],
    );

    winners = winnerRows.map(mapWinnerRow);
  }

  return {
    draw: mapDrawRow(drawRow),

    myTickets: ticketRows.map(mapTicketRow),

    winners,
  };
}

/* ==========================================
   Current User Ticket History
========================================== */

async function getMyTickets(userId, options = {}) {
  const validUserId = parsePositiveInteger(userId, "User ID");

  const limit = parseListLimit(options.limit, 40, 100);

  const page = parsePositiveInteger(options.page || 1, "Page");

  const offset = (page - 1) * limit;

  const [countResult, ticketResult] = await Promise.all([
    pool.query(
      `
        SELECT
          COUNT(*) AS total

        FROM lottery_tickets

        WHERE user_id = ?
      `,
      [validUserId],
    ),

    pool.query(
      `
        SELECT
          lt.id,
          lt.ticket_code,
          lt.draw_id,
          lt.ticket_price,
          lt.status,
          lt.turnover_applied,
          lt.turnover_amount,
          lt.refund_amount,
          lt.cancellation_fee_amount,
          lt.winner_rank,
          lt.prize_amount,
          lt.cancellation_source,
          lt.cancellation_reason,
          lt.purchased_at,
          lt.locked_at,
          lt.cancelled_at,
          lt.refunded_at,
          lt.resulted_at,

          ld.draw_code,
          ld.draw_title,
          ld.status AS draw_status

        FROM lottery_tickets lt

        INNER JOIN lottery_draws ld
          ON ld.id = lt.draw_id

        WHERE lt.user_id = ?

        ORDER BY
          lt.id DESC

        LIMIT ?
        OFFSET ?
      `,
      [validUserId, limit, offset],
    ),
  ]);

  const countRows = countResult[0];

  const ticketRows = ticketResult[0];

  const total = Number(countRows[0]?.total || 0);

  return {
    tickets: ticketRows.map(mapTicketRow),

    pagination: {
      page,
      limit,
      total,

      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}

/* ==========================================
   Recent Public Winners
========================================== */

async function getRecentWinners(requestedLimit = 20) {
  const limit = parseListLimit(requestedLimit, 20, 50);

  const [rows] = await pool.query(
    `
        SELECT
          lw.*,

          ld.draw_code,
          ld.draw_title

        FROM lottery_winners lw

        INNER JOIN lottery_draws ld
          ON ld.id = lw.draw_id

        WHERE
          lw.settlement_status =
            'completed'
          AND ld.status =
            'completed'

        ORDER BY
          lw.created_at DESC,
          lw.prize_rank ASC

        LIMIT ?
      `,
    [limit],
  );

  return rows.map(mapWinnerRow);
}

/* ==========================================
   Admin Draw Validation
========================================== */

function parseBoundedInteger(value, fieldName, minimum, maximum) {
  const parsed = Number.parseInt(String(value), 10);

  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw createServiceError(
      `${fieldName} must be between ${minimum} and ${maximum}.`,
      400,
      "INVALID_LOTTERY_DRAW_CONFIG",
    );
  }

  return parsed;
}

function parsePercentage(value, fieldName, fallbackValue, allowZero = false) {
  const resolvedValue =
    value === undefined || value === null || value === ""
      ? fallbackValue
      : value;

  const percentage = parseMoney(resolvedValue);

  const minimum = allowZero ? 0 : 0.01;

  if (percentage < minimum || percentage > 100) {
    throw createServiceError(
      `${fieldName} is invalid.`,
      400,
      "INVALID_LOTTERY_PERCENTAGE",
    );
  }

  return percentage;
}

function validateAdminDrawInput(input = {}) {
  const ticketPrice = parseMoney(input.ticketPrice);

  if (!ALLOWED_TICKET_PRICES.includes(ticketPrice)) {
    throw createServiceError(
      "Ticket price must be Tk 20, Tk 50 or Tk 100.",
      400,
      "INVALID_LOTTERY_TICKET_PRICE",
    );
  }

  const targetTicketQuantity = parseBoundedInteger(
    input.targetTicketQuantity,
    "Target ticket quantity",
    3,
    100000,
  );

  const maxTicketsPerUser = parseBoundedInteger(
    input.maxTicketsPerUser ?? 10,
    "Maximum tickets per user",
    1,
    targetTicketQuantity,
  );

  const minimumUniquePlayers = parseBoundedInteger(
    input.minimumUniquePlayers ?? 3,
    "Minimum unique players",
    3,
    targetTicketQuantity,
  );

  let countdownSeconds;

  if (
    input.countdownSeconds !== undefined &&
    input.countdownSeconds !== null &&
    input.countdownSeconds !== ""
  ) {
    countdownSeconds = parseBoundedInteger(
      input.countdownSeconds,
      "Countdown seconds",
      60,
      86400,
    );
  } else {
    const countdownMinutes = parseBoundedInteger(
      input.countdownMinutes ?? 10,
      "Countdown minutes",
      1,
      1440,
    );

    countdownSeconds = countdownMinutes * 60;
  }

  const firstPrizePercent = parsePercentage(
    input.firstPrizePercent,
    "First prize percentage",
    50,
  );

  const secondPrizePercent = parsePercentage(
    input.secondPrizePercent,
    "Second prize percentage",
    30,
  );

  const thirdPrizePercent = parsePercentage(
    input.thirdPrizePercent,
    "Third prize percentage",
    10,
  );

  const serviceChargePercent = parsePercentage(
    input.serviceChargePercent,
    "Service charge percentage",
    10,
    true,
  );

  const cancellationFeePercent = parsePercentage(
    input.cancellationFeePercent,
    "Cancellation fee percentage",
    20,
    true,
  );

  const distributionTotal = parseMoney(
    firstPrizePercent +
      secondPrizePercent +
      thirdPrizePercent +
      serviceChargePercent,
  );

  if (distributionTotal !== 100) {
    throw createServiceError(
      "First, second, third and service charge percentages must total 100%.",
      400,
      "INVALID_LOTTERY_DISTRIBUTION",
    );
  }

  const defaultTitle = `PMS Lucky Draw - Tk ${ticketPrice}`;

  const drawTitle = String(input.drawTitle || defaultTitle)
    .trim()
    .replace(/\s+/g, " ");

  if (drawTitle.length < 3 || drawTitle.length > 120) {
    throw createServiceError(
      "Draw title must contain 3 to 120 characters.",
      400,
      "INVALID_LOTTERY_DRAW_TITLE",
    );
  }

  return {
    drawTitle,
    ticketPrice,
    targetTicketQuantity,
    maxTicketsPerUser,
    minimumUniquePlayers,
    countdownSeconds,
    firstPrizePercent,
    secondPrizePercent,
    thirdPrizePercent,
    serviceChargePercent,
    cancellationFeePercent,
  };
}

/* ==========================================
   Locked Admin Validation
========================================== */

async function getLockedLotteryAdmin(adminId, connection) {
  const validAdminId = parsePositiveInteger(adminId, "Admin ID");

  const [rows] = await connection.query(
    `
        SELECT
          id,
          uid,
          full_name,
          role,
          account_status

        FROM users

        WHERE id = ?

        LIMIT 1

        FOR UPDATE
      `,
    [validAdminId],
  );

  const admin = rows[0] || null;

  if (!admin) {
    throw createServiceError(
      "Admin account was not found.",
      404,
      "LOTTERY_ADMIN_NOT_FOUND",
    );
  }

  if (
    String(admin.account_status || "").toLowerCase() !== "active" ||
    String(admin.role || "").toLowerCase() !== "admin"
  ) {
    throw createServiceError(
      "Active admin access is required.",
      403,
      "LOTTERY_ADMIN_ACCESS_REQUIRED",
    );
  }

  return admin;
}

/* ==========================================
   Create Draft Lottery Draw
========================================== */

async function createAdminDraw(adminId, input = {}) {
  const drawConfig = validateAdminDrawInput(input);

  /*
   * Encryption configuration is validated
   * before opening a database transaction.
   */
  const seedBundle = createEncryptedSeedBundle();

  const connection = await pool.getConnection();

  let transactionStarted = false;

  try {
    await connection.beginTransaction();

    transactionStarted = true;

    const admin = await getLockedLotteryAdmin(adminId, connection);

    const drawCode = generateDrawCode(drawConfig.ticketPrice);

    const [insertResult] = await connection.query(
      `
          INSERT INTO lottery_draws (
            draw_code,
            draw_title,
            ticket_price,
            target_ticket_quantity,
            max_tickets_per_user,
            minimum_unique_players,
            countdown_seconds,
            first_prize_percent,
            second_prize_percent,
            third_prize_percent,
            service_charge_percent,
            cancellation_fee_percent,
            status,
            seed_commitment,
            server_seed_ciphertext,
            created_by
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
            'draft',
            ?,
            ?,
            ?
          )
        `,
      [
        drawCode,
        drawConfig.drawTitle,
        drawConfig.ticketPrice,
        drawConfig.targetTicketQuantity,
        drawConfig.maxTicketsPerUser,
        drawConfig.minimumUniquePlayers,
        drawConfig.countdownSeconds,
        drawConfig.firstPrizePercent,
        drawConfig.secondPrizePercent,
        drawConfig.thirdPrizePercent,
        drawConfig.serviceChargePercent,
        drawConfig.cancellationFeePercent,
        seedBundle.seedCommitment,
        seedBundle.serverSeedCiphertext,
        Number(admin.id),
      ],
    );

    const drawId = Number(insertResult.insertId);

    await appendLotteryAuditEvent(connection, {
      drawId,

      actorType: "admin",

      actorUserId: Number(admin.id),

      eventType: "DRAW_CREATED",

      eventData: {
        drawCode,

        drawTitle: drawConfig.drawTitle,

        ticketPrice: drawConfig.ticketPrice,

        targetTicketQuantity: drawConfig.targetTicketQuantity,

        maxTicketsPerUser: drawConfig.maxTicketsPerUser,

        minimumUniquePlayers: drawConfig.minimumUniquePlayers,

        countdownSeconds: drawConfig.countdownSeconds,

        distribution: {
          first: drawConfig.firstPrizePercent,

          second: drawConfig.secondPrizePercent,

          third: drawConfig.thirdPrizePercent,

          serviceCharge: drawConfig.serviceChargePercent,
        },

        cancellationFeePercent: drawConfig.cancellationFeePercent,

        seedCommitment: seedBundle.seedCommitment,
      },
    });

    const [drawRows] = await connection.query(
      `
          SELECT
            ld.*,

            0 AS my_ticket_count,

            0 AS remaining_seconds

          FROM lottery_draws ld

          WHERE ld.id = ?

          LIMIT 1
        `,
      [drawId],
    );

    await connection.commit();

    transactionStarted = false;

    return mapDrawRow(drawRows[0]);
  } catch (error) {
    if (transactionStarted) {
      await connection.rollback();
    }

    if (error.code === "ER_DUP_ENTRY") {
      throw createServiceError(
        "A duplicate lottery draw was detected. Please try again.",
        409,
        "LOTTERY_DRAW_DUPLICATE",
      );
    }

    throw error;
  } finally {
    connection.release();
  }
}

/* ==========================================
   Open Draft Lottery Draw
========================================== */

async function openAdminDraw(adminId, drawId) {
  const validDrawId = parsePositiveInteger(drawId, "Draw ID");

  const connection = await pool.getConnection();

  let transactionStarted = false;

  try {
    await connection.beginTransaction();

    transactionStarted = true;

    const admin = await getLockedLotteryAdmin(adminId, connection);

    const [drawRows] = await connection.query(
      `
          SELECT
            *

          FROM lottery_draws

          WHERE id = ?

          LIMIT 1

          FOR UPDATE
        `,
      [validDrawId],
    );

    const draw = drawRows[0] || null;

    if (!draw) {
      throw createServiceError(
        "Lottery draw was not found.",
        404,
        "LOTTERY_DRAW_NOT_FOUND",
      );
    }

    if (String(draw.status) !== "draft") {
      throw createServiceError(
        "Only a draft lottery draw can be opened.",
        409,
        "LOTTERY_DRAW_NOT_DRAFT",
      );
    }

    const [ticketRows] = await connection.query(
      `
          SELECT
            COUNT(*) AS total

          FROM lottery_tickets

          WHERE draw_id = ?
        `,
      [validDrawId],
    );

    if (Number(ticketRows[0]?.total || 0) !== 0) {
      throw createServiceError(
        "A draw containing tickets cannot be opened as a new draw.",
        409,
        "LOTTERY_DRAW_HAS_TICKETS",
      );
    }

    const [updateResult] = await connection.query(
      `
          UPDATE lottery_draws

          SET
            status = 'selling',
            sales_started_at =
              UTC_TIMESTAMP(),
            state_version =
              state_version + 1

          WHERE id = ?
            AND status = 'draft'
        `,
      [validDrawId],
    );

    if (Number(updateResult.affectedRows) !== 1) {
      throw createServiceError(
        "Lottery draw could not be opened.",
        409,
        "LOTTERY_DRAW_OPEN_FAILED",
      );
    }

    await appendLotteryAuditEvent(connection, {
      drawId: validDrawId,

      actorType: "admin",

      actorUserId: Number(admin.id),

      eventType: "SALES_OPENED",

      eventData: {
        previousStatus: "draft",

        newStatus: "selling",
      },
    });

    const [updatedRows] = await connection.query(
      `
          SELECT
            ld.*,

            0 AS my_ticket_count,

            0 AS remaining_seconds

          FROM lottery_draws ld

          WHERE ld.id = ?

          LIMIT 1
        `,
      [validDrawId],
    );

    await connection.commit();

    transactionStarted = false;

    return mapDrawRow(updatedRows[0]);
  } catch (error) {
    if (transactionStarted) {
      await connection.rollback();
    }

    throw error;
  } finally {
    connection.release();
  }
}

/* ==========================================
   Service Exports
========================================== */

module.exports = {
  ALLOWED_TICKET_PRICES,
  PUBLIC_DRAW_STATUSES,

  getPublicDraws,
  getDrawDetails,
  getMyTickets,
  getRecentWinners,
  createAdminDraw,
  openAdminDraw,
};
