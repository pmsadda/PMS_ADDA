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
  const grossAmount =
  ["cancelled", "failed"].includes(
    String(row.status || ""),
  )
    ? storedGross
    : storedGross > 0
      ? storedGross
      : projectedGross;

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

  const seedCanBeRevealed = completed || status === "cancelled";

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

      revealedSeed: seedCanBeRevealed ? row.revealed_seed || null : null,
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

    canCancel:
      ticketStatus === "active" && ["selling", "paused"].includes(drawStatus),

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

   const limit = parseListLimit(options.limit, 20, 50);

  const page = parsePositiveInteger(options.page || 1, "Page");

  const offset = (page - 1) * limit;

  const [countResult, ticketResult] = await Promise.all([
    pool.query(
      `
        SELECT
          COUNT(*) AS total

        FROM lottery_tickets

                WHERE user_id = ?
          AND (
            purchased_at >=
              DATE_SUB(
                CURRENT_TIMESTAMP,
                INTERVAL 30 DAY
              )
            OR status IN (
              'active',
              'locked'
            )
          )
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
          AND (
            lt.purchased_at >=
              DATE_SUB(
                CURRENT_TIMESTAMP,
                INTERVAL 30 DAY
              )
            OR lt.status IN (
              'active',
              'locked'
            )
          )

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
   Player Ticket Purchase
========================================== */

function normalizePurchaseRequestKey(value) {
  const requestKey = String(value || "").trim();

  if (
    requestKey.length < 16 ||
    requestKey.length > 80 ||
    !/^[a-zA-Z0-9._:-]+$/.test(requestKey)
  ) {
    throw createServiceError(
      "A valid ticket purchase request key is required.",
      400,
      "INVALID_PURCHASE_REQUEST_KEY",
    );
  }

  return requestKey;
}

function createLotteryWalletTransactionId(prefix = "LT") {
  const timePart = Date.now().toString(36).toUpperCase();

  const randomPart = crypto.randomBytes(6).toString("hex").toUpperCase();

  return `${prefix}-${timePart}-${randomPart}`;
}

function mapPurchasedTicketRow(row) {
  return {
    ticketId: Number(row.id),

    ticketCode: row.ticket_code,

    drawId: Number(row.draw_id),

    ticketPrice: parseMoney(row.ticket_price),

    status: String(row.status),

    turnoverApplied: Number(row.turnover_applied || 0) === 1,

    turnoverAmount: parseMoney(row.turnover_amount),

    purchasedAt: row.purchased_at || null,

    lockedAt: row.locked_at || null,
    refundAmount: parseMoney(row.refund_amount),

    cancellationFeeAmount: parseMoney(row.cancellation_fee_amount),

    cancellationSource: row.cancellation_source || null,

    cancelledAt: row.cancelled_at || null,

    refundedAt: row.refunded_at || null,
  };
}

async function purchaseTickets(userId, drawId, input = {}) {
  const validUserId = parsePositiveInteger(userId, "User ID");

  const validDrawId = parsePositiveInteger(drawId, "Draw ID");

  const quantity = parseBoundedInteger(
    input.quantity,
    "Ticket quantity",
    1,
    10,
  );

  const requestKey = normalizePurchaseRequestKey(input.requestKey);

  const connection = await pool.getConnection();

  let transactionStarted = false;

  try {
    await connection.beginTransaction();

    transactionStarted = true;

    /*
     * INSERT IGNORE prevents the same browser request
     * from charging the player twice.
     */
    const [batchInsertResult] = await connection.query(
      `
          INSERT IGNORE INTO lottery_purchase_batches (
            request_key,
            draw_id,
            user_id,
            ticket_quantity,
            total_amount,
            status
          )
          VALUES (
            ?,
            ?,
            ?,
            ?,
            0.00,
            'processing'
          )
        `,
      [requestKey, validDrawId, validUserId, quantity],
    );

    const newBatchCreated = Number(batchInsertResult.affectedRows) === 1;

    const [batchRows] = await connection.query(
      `
          SELECT
            *

          FROM lottery_purchase_batches

          WHERE request_key = ?

          LIMIT 1

          FOR UPDATE
        `,
      [requestKey],
    );

    const purchaseBatch = batchRows[0] || null;

    if (!purchaseBatch) {
      throw createServiceError(
        "Ticket purchase request could not be created.",
        409,
        "PURCHASE_BATCH_CREATE_FAILED",
      );
    }

    if (
      Number(purchaseBatch.draw_id) !== validDrawId ||
      Number(purchaseBatch.user_id) !== validUserId ||
      Number(purchaseBatch.ticket_quantity) !== quantity
    ) {
      throw createServiceError(
        "This purchase request key has already been used.",
        409,
        "PURCHASE_REQUEST_KEY_REUSED",
      );
    }

    /*
     * A completed request is returned again without
     * charging the wallet a second time.
     */
    if (!newBatchCreated && String(purchaseBatch.status) === "completed") {
      const [existingTicketRows] = await connection.query(
        `
            SELECT
              *

            FROM lottery_tickets

            WHERE purchase_batch_id = ?

            ORDER BY id ASC
          `,
        [purchaseBatch.id],
      );

      const expectedTicketQuantity = Number(purchaseBatch.ticket_quantity);

      if (existingTicketRows.length !== expectedTicketQuantity) {
        throw createServiceError(
          "Completed lottery purchase ticket count is inconsistent.",
          500,
          "LOTTERY_PURCHASE_INTEGRITY_ERROR",
        );
      }

      const [retryDrawRows] = await connection.query(
        `
            SELECT
              status,
              countdown_ends_at,

              GREATEST(
                0,
                TIMESTAMPDIFF(
                  SECOND,
                  UTC_TIMESTAMP(),
                  countdown_ends_at
                )
              ) AS remaining_seconds

            FROM lottery_draws

            WHERE id = ?

            LIMIT 1
          `,
        [validDrawId],
      );

      const retryDraw = retryDrawRows[0] || null;

      const retryDrawStatus = String(retryDraw?.status || "");

      const [currentUserRows] = await connection.query(
        `
            SELECT
              wallet_balance

            FROM users

            WHERE id = ?

            LIMIT 1
          `,
        [validUserId],
      );

      await connection.commit();

      transactionStarted = false;

      return {
        alreadyProcessed: true,

        requestKey,

        purchaseBatchId: Number(purchaseBatch.id),

        quantity: Number(purchaseBatch.ticket_quantity),

        totalAmount: parseMoney(purchaseBatch.total_amount),

        walletBalance: parseMoney(currentUserRows[0]?.wallet_balance),

        tickets: existingTicketRows.map(mapPurchasedTicketRow),

        countdownStarted: [
          "countdown",
          "ready_to_draw",
          "drawing",
          "completed",
        ].includes(retryDrawStatus),

        countdownEndsAt: retryDraw?.countdown_ends_at || null,

        remainingSeconds: Number(retryDraw?.remaining_seconds || 0),
      };
    }

    if (!newBatchCreated) {
      throw createServiceError(
        "This ticket purchase is currently being processed.",
        409,
        "PURCHASE_REQUEST_PROCESSING",
      );
    }

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

    if (String(draw.status) !== "selling") {
      throw createServiceError(
        "Lottery tickets are not currently available for this draw.",
        409,
        "LOTTERY_DRAW_NOT_SELLING",
      );
    }

    const ticketPrice = parseMoney(draw.ticket_price);

    if (!ALLOWED_TICKET_PRICES.includes(ticketPrice)) {
      throw createServiceError(
        "Lottery ticket price is invalid.",
        500,
        "LOTTERY_TICKET_PRICE_INVALID",
      );
    }

    const targetQuantity = Number(draw.target_ticket_quantity);

    const maximumPerUser = Number(draw.max_tickets_per_user);

    const minimumUniquePlayers = Number(draw.minimum_unique_players);

    const [ticketSummaryRows] = await connection.query(
      `
          SELECT
            COUNT(*) AS active_ticket_count,

            COUNT(
              DISTINCT user_id
            ) AS unique_player_count,

            COALESCE(
              SUM(ticket_price),
              0
            ) AS gross_amount

          FROM lottery_tickets

          WHERE draw_id = ?
            AND status = 'active'
        `,
      [validDrawId],
    );

    const ticketSummary = ticketSummaryRows[0] || {};

    const activeTicketCount = Number(ticketSummary.active_ticket_count || 0);

    const uniquePlayerCount = Number(ticketSummary.unique_player_count || 0);

    const remainingTickets = targetQuantity - activeTicketCount;

    if (remainingTickets < 1) {
      throw createServiceError(
        "All lottery tickets have already been sold.",
        409,
        "LOTTERY_SOLD_OUT",
      );
    }

    if (quantity > remainingTickets) {
      throw createServiceError(
        `Only ${remainingTickets} lottery ticket(s) are currently available.`,
        409,
        "LOTTERY_QUANTITY_EXCEEDS_REMAINING",
      );
    }

    const [userTicketRows] = await connection.query(
      `
          SELECT
            COUNT(*) AS total

          FROM lottery_tickets

          WHERE draw_id = ?
            AND user_id = ?
            AND status = 'active'
        `,
      [validDrawId, validUserId],
    );

    const existingUserTicketCount = Number(userTicketRows[0]?.total || 0);

    if (existingUserTicketCount + quantity > maximumPerUser) {
      const availableForUser = Math.max(
        0,
        maximumPerUser - existingUserTicketCount,
      );

      throw createServiceError(
        `You can buy only ${availableForUser} more ticket(s) in this draw.`,
        409,
        "LOTTERY_USER_TICKET_LIMIT",
      );
    }

    const willReachTarget = activeTicketCount + quantity === targetQuantity;

    if (willReachTarget) {
      const userAlreadyParticipating = existingUserTicketCount > 0;

      const finalUniquePlayerCount =
        uniquePlayerCount + (userAlreadyParticipating ? 0 : 1);

      if (finalUniquePlayerCount < minimumUniquePlayers) {
        throw createServiceError(
          `At least ${minimumUniquePlayers} different players are required before the final ticket can be sold.`,
          409,
          "LOTTERY_MINIMUM_PLAYERS_REQUIRED",
        );
      }
    }

    const [userRows] = await connection.query(
      `
          SELECT
            id,
            uid,
            full_name,
            account_status,
            wallet_balance

          FROM users

          WHERE id = ?

          LIMIT 1

          FOR UPDATE
        `,
      [validUserId],
    );

    const user = userRows[0] || null;

    if (!user) {
      throw createServiceError(
        "Player account was not found.",
        404,
        "LOTTERY_PLAYER_NOT_FOUND",
      );
    }

    if (String(user.account_status).trim().toLowerCase() !== "active") {
      throw createServiceError(
        "Your account is not active.",
        403,
        "LOTTERY_PLAYER_NOT_ACTIVE",
      );
    }

    const totalAmount = parseMoney(ticketPrice * quantity);

    const balanceBefore = parseMoney(user.wallet_balance);

    if (balanceBefore < totalAmount) {
      throw createServiceError(
        `Minimum ৳${totalAmount.toFixed(2)} wallet balance is required.`,
        409,
        "LOTTERY_INSUFFICIENT_BALANCE",
      );
    }

    const balanceAfter = parseMoney(balanceBefore - totalAmount);

    const [walletUpdateResult] = await connection.query(
      `
          UPDATE users

          SET
            wallet_balance =
              wallet_balance - ?

          WHERE id = ?
            AND account_status = 'active'
            AND wallet_balance >= ?
        `,
      [totalAmount, validUserId, totalAmount],
    );

    if (Number(walletUpdateResult.affectedRows) !== 1) {
      throw createServiceError(
        "Lottery ticket payment could not be completed.",
        409,
        "LOTTERY_WALLET_DEBIT_FAILED",
      );
    }



    const purchasedTickets = [];

    for (let ticketIndex = 0; ticketIndex < quantity; ticketIndex += 1) {
      let insertedTicket = null;

      for (let attempt = 1; attempt <= 10; attempt += 1) {
        const ticketCode = generateTicketCode();

        const purchaseTransactionId = createLotteryWalletTransactionId("LTBUY");

        try {
          const [ticketInsertResult] = await connection.query(
            `
                INSERT INTO lottery_tickets (
                  ticket_code,
                  draw_id,
                  user_id,
                  purchase_batch_id,
                  ticket_price,
                  status,
                  turnover_applied,
                  turnover_amount,
                  purchase_transaction_id
                )
                VALUES (
                  ?,
                  ?,
                  ?,
                  ?,
                  ?,
                  'active',
                  0,
                  0.00,
                  ?
                )
              `,
            [
              ticketCode,
              validDrawId,
              validUserId,
              purchaseBatch.id,
              ticketPrice,
              purchaseTransactionId,
            ],
          );

          insertedTicket = {
            ticketId: Number(ticketInsertResult.insertId),

            ticketCode,

            purchaseTransactionId,
          };

          break;
        } catch (error) {
          const duplicateTicketCode =
            error.code === "ER_DUP_ENTRY" &&
            String(error.message || "").includes("uq_lottery_ticket_code");

          if (duplicateTicketCode && attempt < 10) {
            continue;
          }

          throw error;
        }
      }

      if (!insertedTicket) {
        throw createServiceError(
          "A unique lottery ticket number could not be generated.",
          500,
          "LOTTERY_TICKET_CODE_GENERATION_FAILED",
        );
      }

      const transactionBalanceBefore = parseMoney(
        balanceBefore - ticketPrice * ticketIndex,
      );

      const transactionBalanceAfter = parseMoney(
        transactionBalanceBefore - ticketPrice,
      );

      await connection.query(
        `
          INSERT INTO wallet_transactions (
            transaction_id,
            user_id,
            transaction_type,
            direction,
            amount,
            balance_before,
            balance_after,
            status,
            reference_type,
            reference_id,
            description,
            created_by
          )
          VALUES (
            ?,
            ?,
            'game_buy_in',
            'debit',
            ?,
            ?,
            ?,
            'completed',
            'lottery_ticket',
            ?,
            ?,
            NULL
          )
        `,
        [
          insertedTicket.purchaseTransactionId,

          validUserId,

          ticketPrice,

          transactionBalanceBefore,

          transactionBalanceAfter,

          String(insertedTicket.ticketId),

          `Lottery draw ${draw.draw_code} ticket ${insertedTicket.ticketCode} purchase`,
        ],
      );

      await appendLotteryAuditEvent(connection, {
        drawId: validDrawId,

        ticketId: insertedTicket.ticketId,

        actorType: "player",

        actorUserId: validUserId,

        eventType: "TICKET_PURCHASED",

        eventData: {
          requestKey,

          purchaseBatchId: Number(purchaseBatch.id),

          ticketCode: insertedTicket.ticketCode,

          ticketPrice,
        },
      });

      purchasedTickets.push(insertedTicket);
    }

    const newActiveTicketCount = activeTicketCount + quantity;

    const newGrossAmount = parseMoney(
      Number(ticketSummary.gross_amount || 0) + totalAmount,
    );

    let countdownStarted = false;

    let countdownEndsAt = null;

    if (newActiveTicketCount === targetQuantity) {
      const [lockedTicketRows] = await connection.query(
        `
            SELECT
              id,
              ticket_code,
              user_id,
              ticket_price

            FROM lottery_tickets

            WHERE draw_id = ?
              AND status = 'active'

            ORDER BY
              ticket_code ASC,
              id ASC

            FOR UPDATE
          `,
        [validDrawId],
      );

      const ticketSetHash = sha256Hex(
        canonicalizeJson(
          lockedTicketRows.map((ticket) => ({
            ticketId: Number(ticket.id),

            ticketCode: ticket.ticket_code,

            userId: Number(ticket.user_id),

            ticketPrice: parseMoney(ticket.ticket_price),
          })),
        ),
      );

      const [turnoverRows] = await connection.query(
        `
            SELECT
              user_id,

              COALESCE(
                SUM(ticket_price),
                0
              ) AS turnover_amount

            FROM lottery_tickets

            WHERE draw_id = ?
              AND status = 'active'
              AND turnover_applied = 0

            GROUP BY user_id

            FOR UPDATE
          `,
        [validDrawId],
      );

      for (const turnoverRow of turnoverRows) {
        const turnoverAmount = parseMoney(turnoverRow.turnover_amount);

        const [turnoverUpdateResult] = await connection.query(
          `
              UPDATE users

              SET
                turnover_amount =
                  turnover_amount + ?

              WHERE id = ?
            `,
          [turnoverAmount, Number(turnoverRow.user_id)],
        );

        if (Number(turnoverUpdateResult.affectedRows) !== 1) {
          throw createServiceError(
            "Lottery turnover could not be applied.",
            409,
            "LOTTERY_TURNOVER_APPLY_FAILED",
          );
        }
      }

      const countdownSeconds = Number(draw.countdown_seconds);

      const countdownStartDate = new Date();

      const countdownEndDate = new Date(
        countdownStartDate.getTime() + countdownSeconds * 1000,
      );

      countdownEndsAt = countdownEndDate.toISOString();

      const firstPrizeAmount = calculateAmountByPercent(
        newGrossAmount,
        draw.first_prize_percent,
      );

      const secondPrizeAmount = calculateAmountByPercent(
        newGrossAmount,
        draw.second_prize_percent,
      );

      const thirdPrizeAmount = calculateAmountByPercent(
        newGrossAmount,
        draw.third_prize_percent,
      );

      const serviceChargeAmount = calculateAmountByPercent(
        newGrossAmount,
        draw.service_charge_percent,
      );

      const totalPrizeAmount = parseMoney(
        firstPrizeAmount + secondPrizeAmount + thirdPrizeAmount,
      );

      const [ticketLockResult] = await connection.query(
        `
            UPDATE lottery_tickets

            SET
              status = 'locked',
              turnover_applied = 1,
              turnover_amount =
                ticket_price,
              locked_at = ?

            WHERE draw_id = ?
              AND status = 'active'
              AND turnover_applied = 0
          `,
        [formatMysqlDateTime(countdownStartDate), validDrawId],
      );

      if (Number(ticketLockResult.affectedRows) !== targetQuantity) {
        throw createServiceError(
          "Lottery ticket set could not be locked.",
          409,
          "LOTTERY_TICKET_LOCK_FAILED",
        );
      }

      const [drawLockResult] = await connection.query(
        `
            UPDATE lottery_draws

            SET
              status = 'countdown',
              active_ticket_count = ?,
              gross_sales_amount = ?,
              total_prize_amount = ?,
              first_prize_amount = ?,
              second_prize_amount = ?,
              third_prize_amount = ?,
              service_charge_amount = ?,
              ticket_set_hash = ?,
              sold_out_at = ?,
              countdown_started_at = ?,
              countdown_ends_at = ?,
              state_version =
                state_version + 1

            WHERE id = ?
              AND status = 'selling'
          `,
        [
          newActiveTicketCount,
          newGrossAmount,
          totalPrizeAmount,
          firstPrizeAmount,
          secondPrizeAmount,
          thirdPrizeAmount,
          serviceChargeAmount,
          ticketSetHash,
          formatMysqlDateTime(countdownStartDate),
          formatMysqlDateTime(countdownStartDate),
          formatMysqlDateTime(countdownEndDate),
          validDrawId,
        ],
      );

      if (Number(drawLockResult.affectedRows) !== 1) {
        throw createServiceError(
          "Lottery countdown could not be started.",
          409,
          "LOTTERY_COUNTDOWN_START_FAILED",
        );
      }

      await appendLotteryAuditEvent(connection, {
        drawId: validDrawId,

        actorType: "system",

        eventType: "TICKET_SET_LOCKED",

        eventData: {
          activeTicketCount: newActiveTicketCount,

          uniquePlayerCount:
            uniquePlayerCount + (existingUserTicketCount > 0 ? 0 : 1),

          grossAmount: newGrossAmount,

          ticketSetHash,

          countdownSeconds,

          countdownEndsAt,
        },
      });

      countdownStarted = true;
    } else {
      const [drawUpdateResult] = await connection.query(
        `
            UPDATE lottery_draws

            SET
              active_ticket_count = ?,
              gross_sales_amount = ?,
              state_version =
                state_version + 1

            WHERE id = ?
              AND status = 'selling'
          `,
        [newActiveTicketCount, newGrossAmount, validDrawId],
      );

      if (Number(drawUpdateResult.affectedRows) !== 1) {
        throw createServiceError(
          "Lottery draw ticket count could not be updated.",
          409,
          "LOTTERY_DRAW_UPDATE_FAILED",
        );
      }
    }

    const [batchAmountUpdateResult] = await connection.query(
      `
          UPDATE lottery_purchase_batches

          SET
            total_amount = ?

          WHERE id = ?
            AND status = 'processing'
        `,
      [totalAmount, purchaseBatch.id],
    );

    if (Number(batchAmountUpdateResult.affectedRows) !== 1) {
      throw createServiceError(
        "Lottery purchase amount could not be recorded.",
        409,
        "PURCHASE_BATCH_AMOUNT_UPDATE_FAILED",
      );
    }

          const [batchCompleteResult] =
      await connection.query(
        `
          UPDATE lottery_purchase_batches

          SET
            status = 'completed',
            completed_at =
              UTC_TIMESTAMP()

          WHERE id = ?
            AND status = 'processing'
        `,
        [purchaseBatch.id],
      );


    if (Number(batchCompleteResult.affectedRows) !== 1) {
      throw createServiceError(
        "Ticket purchase could not be completed.",
        409,
        "PURCHASE_BATCH_COMPLETE_FAILED",
      );
    }

    const [completedTicketRows] = await connection.query(
      `
          SELECT
            *

          FROM lottery_tickets

          WHERE purchase_batch_id = ?

          ORDER BY id ASC
        `,
      [purchaseBatch.id],
    );

    await connection.commit();

    transactionStarted = false;

    return {
      alreadyProcessed: false,

      requestKey,

      purchaseBatchId: Number(purchaseBatch.id),

      quantity,

      totalAmount,

      walletBalance: balanceAfter,

      tickets: completedTicketRows.map(mapPurchasedTicketRow),

      countdownStarted,

      countdownEndsAt,
    };
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
   Player Ticket Cancellation
========================================== */

async function cancelTicket(userId, ticketId) {
  const validUserId = parsePositiveInteger(userId, "User ID");

  const validTicketId = parsePositiveInteger(ticketId, "Ticket ID");

  const connection = await pool.getConnection();

  let transactionStarted = false;

  try {
    await connection.beginTransaction();

    transactionStarted = true;

    /*
     * First identify the ticket's draw.
     * The draw row will then be locked before
     * locking the ticket to keep lock order safe.
     */
    const [identityRows] = await connection.query(
      `
          SELECT
            id,
            draw_id,
            user_id

          FROM lottery_tickets

          WHERE id = ?

          LIMIT 1
        `,
      [validTicketId],
    );

    const ticketIdentity = identityRows[0] || null;

    if (!ticketIdentity) {
      throw createServiceError(
        "Lottery ticket was not found.",
        404,
        "LOTTERY_TICKET_NOT_FOUND",
      );
    }

    if (Number(ticketIdentity.user_id) !== validUserId) {
      throw createServiceError(
        "This lottery ticket does not belong to you.",
        403,
        "LOTTERY_TICKET_NOT_OWNED",
      );
    }

    const validDrawId = Number(ticketIdentity.draw_id);

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

    const [ticketRows] = await connection.query(
      `
          SELECT
            *

          FROM lottery_tickets

          WHERE id = ?

          LIMIT 1

          FOR UPDATE
        `,
      [validTicketId],
    );

    const ticket = ticketRows[0] || null;

    if (!ticket) {
      throw createServiceError(
        "Lottery ticket was not found.",
        404,
        "LOTTERY_TICKET_NOT_FOUND",
      );
    }

    if (Number(ticket.user_id) !== validUserId) {
      throw createServiceError(
        "This lottery ticket does not belong to you.",
        403,
        "LOTTERY_TICKET_NOT_OWNED",
      );
    }

    /*
     * Repeated cancel request will return the
     * previous result without refunding twice.
     */
    if (
      String(ticket.status) === "cancelled" &&
      String(ticket.cancellation_source) === "player" &&
      ticket.refund_transaction_id
    ) {
      const [currentUserRows] = await connection.query(
        `
            SELECT
              wallet_balance

            FROM users

            WHERE id = ?

            LIMIT 1
          `,
        [validUserId],
      );

      await connection.commit();

      transactionStarted = false;

      return {
        alreadyCancelled: true,

        refundAmount: parseMoney(ticket.refund_amount),

        cancellationFeeAmount: parseMoney(ticket.cancellation_fee_amount),

        walletBalance: parseMoney(currentUserRows[0]?.wallet_balance),

        ticket: mapPurchasedTicketRow(ticket),
      };
    }

    if (!["selling", "paused"].includes(String(draw.status))) {
      throw createServiceError(
        "This ticket can no longer be cancelled because the lottery countdown has started.",
        409,
        "LOTTERY_CANCELLATION_CLOSED",
      );
    }

    if (String(ticket.status) !== "active") {
      throw createServiceError(
        "Only an active lottery ticket can be cancelled.",
        409,
        "LOTTERY_TICKET_NOT_ACTIVE",
      );
    }

    if (Number(ticket.turnover_applied || 0) === 1) {
      throw createServiceError(
        "A locked lottery ticket cannot be cancelled.",
        409,
        "LOTTERY_TICKET_ALREADY_LOCKED",
      );
    }

    const ticketPrice = parseMoney(ticket.ticket_price);

    const cancellationFeePercent = parseMoney(draw.cancellation_fee_percent);

    const cancellationFeeAmount = calculateAmountByPercent(
      ticketPrice,
      cancellationFeePercent,
    );

    const refundAmount = parseMoney(ticketPrice - cancellationFeeAmount);

    if (refundAmount < 0 || refundAmount > ticketPrice) {
      throw createServiceError(
        "Lottery ticket refund calculation is invalid.",
        500,
        "LOTTERY_REFUND_INVALID",
      );
    }

    const [userRows] = await connection.query(
      `
          SELECT
            id,
            wallet_balance

          FROM users

          WHERE id = ?

          LIMIT 1

          FOR UPDATE
        `,
      [validUserId],
    );

    const user = userRows[0] || null;

    if (!user) {
      throw createServiceError(
        "Player account was not found.",
        404,
        "LOTTERY_PLAYER_NOT_FOUND",
      );
    }

    const balanceBefore = parseMoney(user.wallet_balance);

    const balanceAfter = parseMoney(balanceBefore + refundAmount);

    const refundTransactionId = createLotteryWalletTransactionId("LTREF");

    const [walletUpdateResult] = await connection.query(
      `
          UPDATE users

          SET
            wallet_balance =
              wallet_balance + ?

          WHERE id = ?
        `,
      [refundAmount, validUserId],
    );

    if (Number(walletUpdateResult.affectedRows) !== 1) {
      throw createServiceError(
        "Lottery ticket refund could not be credited.",
        409,
        "LOTTERY_REFUND_CREDIT_FAILED",
      );
    }

    await connection.query(
      `
        INSERT INTO wallet_transactions (
          transaction_id,
          user_id,
          transaction_type,
          direction,
          amount,
          balance_before,
          balance_after,
          status,
          reference_type,
          reference_id,
          description,
          created_by
        )
        VALUES (
          ?,
          ?,
          'game_cash_out',
          'credit',
          ?,
          ?,
          ?,
          'completed',
          'lottery_ticket',
          ?,
          ?,
          NULL
        )
      `,
      [
        refundTransactionId,
        validUserId,
        refundAmount,
        balanceBefore,
        balanceAfter,
        String(validTicketId),
        `Lottery ticket ${ticket.ticket_code} cancellation refund`,
      ],
    );

    const cancellationDate = new Date();

    const [ticketUpdateResult] = await connection.query(
      `
          UPDATE lottery_tickets

          SET
            status = 'cancelled',
            refund_transaction_id = ?,
            refund_amount = ?,
            cancellation_fee_amount = ?,
            cancellation_source =
              'player',
            cancelled_by_user_id = ?,
            cancellation_reason =
              'Cancelled by player before countdown',
            cancelled_at = ?,
            refunded_at = ?

          WHERE id = ?
            AND user_id = ?
            AND status = 'active'
            AND turnover_applied = 0
        `,
      [
        refundTransactionId,
        refundAmount,
        cancellationFeeAmount,
        validUserId,
        formatMysqlDateTime(cancellationDate),
        formatMysqlDateTime(cancellationDate),
        validTicketId,
        validUserId,
      ],
    );

    if (Number(ticketUpdateResult.affectedRows) !== 1) {
      throw createServiceError(
        "Lottery ticket cancellation could not be completed.",
        409,
        "LOTTERY_TICKET_CANCEL_FAILED",
      );
    }

    /*
     * The retained 20% cancellation fee is stored
     * separately as platform revenue.
     */
    await connection.query(
      `
        INSERT INTO lottery_revenue_history (
          revenue_key,
          draw_id,
          ticket_id,
          user_id,
          revenue_type,
          gross_amount,
          revenue_percent,
          revenue_amount,
          related_transaction_id,
          description
        )
        VALUES (
          ?,
          ?,
          ?,
          ?,
          'ticket_cancellation_fee',
          ?,
          ?,
          ?,
          ?,
          ?
        )
      `,
      [
        `TICKET-CANCEL-FEE-${validTicketId}`,
        validDrawId,
        validTicketId,
        validUserId,
        ticketPrice,
        cancellationFeePercent,
        cancellationFeeAmount,
        refundTransactionId,
        `Cancellation fee for lottery ticket ${ticket.ticket_code}`,
      ],
    );

    const [summaryRows] = await connection.query(
      `
          SELECT
            COUNT(*) AS active_ticket_count,

            COALESCE(
              SUM(ticket_price),
              0
            ) AS gross_amount

          FROM lottery_tickets

          WHERE draw_id = ?
            AND status = 'active'
        `,
      [validDrawId],
    );

    const activeTicketCount = Number(summaryRows[0]?.active_ticket_count || 0);

    const grossAmount = parseMoney(summaryRows[0]?.gross_amount);

    const [drawUpdateResult] = await connection.query(
      `
          UPDATE lottery_draws

          SET
            active_ticket_count = ?,
            cancelled_ticket_count =
              cancelled_ticket_count + 1,
            gross_sales_amount = ?,
            state_version =
              state_version + 1

          WHERE id = ?
            AND status IN (
              'selling',
              'paused'
            )
        `,
      [activeTicketCount, grossAmount, validDrawId],
    );

    if (Number(drawUpdateResult.affectedRows) !== 1) {
      throw createServiceError(
        "Lottery draw totals could not be updated.",
        409,
        "LOTTERY_DRAW_CANCEL_UPDATE_FAILED",
      );
    }

    await appendLotteryAuditEvent(connection, {
      drawId: validDrawId,

      ticketId: validTicketId,

      actorType: "player",

      actorUserId: validUserId,

      eventType: "TICKET_CANCELLED",

      eventData: {
        ticketCode: ticket.ticket_code,

        ticketPrice,

        refundAmount,

        cancellationFeePercent,

        cancellationFeeAmount,

        turnoverApplied: false,

        activeTicketCount,

        grossAmount,
      },
    });

    const [updatedTicketRows] = await connection.query(
      `
          SELECT
            *

          FROM lottery_tickets

          WHERE id = ?

          LIMIT 1
        `,
      [validTicketId],
    );

    await connection.commit();

    transactionStarted = false;

    return {
      alreadyCancelled: false,

      refundAmount,

      cancellationFeeAmount,

      walletBalance: balanceAfter,

      ticket: mapPurchasedTicketRow(updatedTicketRows[0]),
    };
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
   Admin Lottery Draw List
========================================== */

async function getAdminLotteryDraws(
  options = {},
) {
  const page =
    Math.max(
      1,
      Number.parseInt(
        String(
          options.page ||
            "1",
        ),
        10,
      ) || 1,
    );

  const limit =
    parseListLimit(
      options.limit,
      20,
      100,
    );

  const offset =
    (page - 1) *
    limit;

  const requestedStatus =
    String(
      options.status ||
        "",
    )
      .trim()
      .toLowerCase();

  const allDrawStatuses = [
    "draft",
    "selling",
    "paused",
    "sold_out",
    "countdown",
    "ready_to_draw",
    "drawing",
    "completed",
    "cancelling",
    "cancelled",
    "failed",
  ];

  if (
    requestedStatus &&
    !allDrawStatuses.includes(
      requestedStatus,
    )
  ) {
    throw createServiceError(
      "Lottery draw status filter is invalid.",
      400,
      "INVALID_LOTTERY_STATUS_FILTER",
    );
  }

  const requestedTicketPrice =
    options.ticketPrice ===
      undefined ||
    options.ticketPrice ===
      null ||
    options.ticketPrice ===
      ""
      ? null
      : parseMoney(
          options.ticketPrice,
        );

  if (
    requestedTicketPrice !==
      null &&
    !ALLOWED_TICKET_PRICES.includes(
      requestedTicketPrice,
    )
  ) {
    throw createServiceError(
      "Lottery ticket price filter is invalid.",
      400,
      "INVALID_LOTTERY_PRICE_FILTER",
    );
  }

  const search =
    String(
      options.search ||
        "",
    )
      .trim()
      .slice(
        0,
        100,
      );

  const whereConditions = [];

  const queryParameters = [];

  if (requestedStatus) {
    whereConditions.push(
      "ld.status = ?",
    );

    queryParameters.push(
      requestedStatus,
    );
  }

  if (
    requestedTicketPrice !==
    null
  ) {
    whereConditions.push(
      "ld.ticket_price = ?",
    );

    queryParameters.push(
      requestedTicketPrice,
    );
  }

  if (search) {
    whereConditions.push(
      "(ld.draw_code LIKE ? OR ld.draw_title LIKE ?)",
    );

    const searchPattern =
      `%${search}%`;

    queryParameters.push(
      searchPattern,
      searchPattern,
    );
  }

  const whereSql =
    whereConditions.length
      ? `WHERE ${whereConditions.join(
          " AND ",
        )}`
      : "";

  const [countRows] =
    await pool.query(
      `
        SELECT
          COUNT(*) AS total

        FROM lottery_draws ld

        ${whereSql}
      `,
      queryParameters,
    );

  const total =
    Number(
      countRows[0]
        ?.total || 0,
    );

  const [drawRows] =
    await pool.query(
      `
        SELECT
          ld.*,

          creator.uid AS
            creator_uid,

          creator.full_name AS
            creator_name,

          0 AS
            my_ticket_count,

          GREATEST(
            0,
            TIMESTAMPDIFF(
              SECOND,
              UTC_TIMESTAMP(),
              ld.countdown_ends_at
            )
          ) AS
            remaining_seconds,

          (
            SELECT
              COUNT(
                DISTINCT
                lt.user_id
              )

            FROM lottery_tickets lt

            WHERE
              lt.draw_id =
                ld.id

              AND lt.status IN (
                'active',
                'locked',
                'winner',
                'non_winner'
              )
          ) AS
            unique_player_count,

          (
            SELECT
              COUNT(*)

            FROM lottery_winners lw

            WHERE
              lw.draw_id =
                ld.id

              AND
                lw.settlement_status =
                  'completed'
          ) AS
            winner_count

        FROM lottery_draws ld

        INNER JOIN users creator
          ON creator.id =
             ld.created_by

        ${whereSql}

        ORDER BY
          ld.id DESC

        LIMIT ${limit}
        OFFSET ${offset}
      `,
      queryParameters,
    );

  const draws =
    drawRows.map(
      (row) => ({
        ...mapDrawRow(
          row,
        ),

        uniquePlayerCount:
          Number(
            row
              .unique_player_count ||
              0,
          ),

        winnerCount:
          Number(
            row
              .winner_count ||
              0,
          ),

        cancellationReason:
          row
            .cancellation_reason ||
          null,

        cancelledAt:
          row.cancelled_at ||
          null,

        createdBy: {
          userId:
            Number(
              row.created_by,
            ),

          uid:
            row.creator_uid ||
            null,

          name:
            row.creator_name ||
            null,
        },
      }),
    );

  return {
    draws,

    pagination: {
      page,

      limit,

      total,

      totalPages:
        Math.max(
          1,
          Math.ceil(
            total /
            limit,
          ),
        ),
    },
  };
}

async function getAdminLotteryDrawDetails(
  drawId,
  options = {},
) {
  const validDrawId =
    parsePositiveInteger(
      drawId,
      "Draw ID",
    );

  const page =
    Math.max(
      1,
      Number.parseInt(
        String(
          options.page ||
            "1",
        ),
        10,
      ) || 1,
    );

  const limit =
    parseListLimit(
      options.limit,
      50,
      100,
    );

  const offset =
    (page - 1) *
    limit;

  const [drawRows] =
    await pool.query(
      `
        SELECT
          ld.*,

          creator.uid AS
            creator_uid,

          creator.full_name AS
            creator_name,

          0 AS
            my_ticket_count,

          GREATEST(
            0,
            TIMESTAMPDIFF(
              SECOND,
              UTC_TIMESTAMP(),
              ld.countdown_ends_at
            )
          ) AS
            remaining_seconds,

          (
            SELECT
              COUNT(
                DISTINCT
                lt.user_id
              )

            FROM lottery_tickets lt

            WHERE
              lt.draw_id =
                ld.id

              AND lt.status IN (
                'active',
                'locked',
                'winner',
                'non_winner'
              )
          ) AS
            unique_player_count,

          (
            SELECT
              COUNT(*)

            FROM lottery_winners lw

            WHERE
              lw.draw_id =
                ld.id

              AND
                lw.settlement_status =
                  'completed'
          ) AS
            winner_count

        FROM lottery_draws ld

        INNER JOIN users creator
          ON creator.id =
             ld.created_by

        WHERE ld.id = ?

        LIMIT 1
      `,
      [
        validDrawId,
      ],
    );

  const drawRow =
    drawRows[0] || null;

  if (!drawRow) {
    throw createServiceError(
      "Lottery draw was not found.",
      404,
      "LOTTERY_DRAW_NOT_FOUND",
    );
  }

  const [ticketCountRows] =
    await pool.query(
      `
        SELECT
          COUNT(*) AS total

        FROM lottery_tickets

        WHERE draw_id = ?
      `,
      [
        validDrawId,
      ],
    );

  const ticketTotal =
    Number(
      ticketCountRows[0]
        ?.total || 0,
    );

  const [ticketRows] =
    await pool.query(
      `
        SELECT
          lt.*,

          ld.draw_code,
          ld.draw_title,

          ld.status AS
            draw_status,

          buyer.uid AS
            buyer_uid,

          buyer.full_name AS
            buyer_name,

          buyer.phone AS
            buyer_phone

        FROM lottery_tickets lt

        INNER JOIN lottery_draws ld
          ON ld.id =
             lt.draw_id

        INNER JOIN users buyer
          ON buyer.id =
             lt.user_id

        WHERE lt.draw_id = ?

        ORDER BY
          lt.id DESC

        LIMIT ${limit}
        OFFSET ${offset}
      `,
      [
        validDrawId,
      ],
    );

  const tickets =
    ticketRows.map(
      (row) => ({
        ...mapTicketRow(
          row,
        ),

        purchaseTransactionId:
          row
            .purchase_transaction_id,

        refundTransactionId:
          row
            .refund_transaction_id ||
          null,

        buyer: {
          userId:
            Number(
              row.user_id,
            ),

          uid:
            row.buyer_uid ||
            null,

          name:
            row.buyer_name ||
            null,

          phone:
            row.buyer_phone ||
            null,
        },
      }),
    );

  const [winnerRows] =
    await pool.query(
      `
        SELECT
          lw.*,
          ld.draw_code,
          ld.draw_title

        FROM lottery_winners lw

        INNER JOIN lottery_draws ld
          ON ld.id =
             lw.draw_id

        WHERE lw.draw_id = ?

        ORDER BY
          lw.prize_rank ASC
      `,
      [
        validDrawId,
      ],
    );

  const [revenueRows] =
    await pool.query(
      `
        SELECT
          id,
          revenue_key,
          ticket_id,
          user_id,
          revenue_type,
          gross_amount,
          revenue_percent,
          revenue_amount,
          related_transaction_id,
          description,
          created_at

        FROM lottery_revenue_history

        WHERE draw_id = ?

        ORDER BY id ASC
      `,
      [
        validDrawId,
      ],
    );

  const [statusRows] =
    await pool.query(
      `
        SELECT
          status,
          COUNT(*) AS total

        FROM lottery_tickets

        WHERE draw_id = ?

        GROUP BY status
      `,
      [
        validDrawId,
      ],
    );

  const ticketStatusCounts =
    {};

  for (
    const row of statusRows
  ) {
    ticketStatusCounts[
      String(row.status)
    ] =
      Number(
        row.total || 0,
      );
  }

  return {
    draw: {
      ...mapDrawRow(
        drawRow,
      ),

      uniquePlayerCount:
        Number(
          drawRow
            .unique_player_count ||
            0,
        ),

      winnerCount:
        Number(
          drawRow
            .winner_count ||
            0,
        ),

      cancellationReason:
        drawRow
          .cancellation_reason ||
        null,

      cancelledAt:
        drawRow
          .cancelled_at ||
        null,

      createdBy: {
        userId:
          Number(
            drawRow.created_by,
          ),

        uid:
          drawRow
            .creator_uid ||
          null,

        name:
          drawRow
            .creator_name ||
          null,
      },
    },

    tickets,

    winners:
      winnerRows.map(
        mapWinnerRow,
      ),

    revenue:
      revenueRows.map(
        (row) => ({
          revenueId:
            Number(row.id),

          revenueKey:
            row.revenue_key,

          ticketId:
            row.ticket_id ===
              null
              ? null
              : Number(
                  row.ticket_id,
                ),

          userId:
            row.user_id ===
              null
              ? null
              : Number(
                  row.user_id,
                ),

          type:
            row.revenue_type,

          grossAmount:
            parseMoney(
              row.gross_amount,
            ),

          percent:
            parseMoney(
              row
                .revenue_percent,
            ),

          amount:
            parseMoney(
              row.revenue_amount,
            ),

          relatedTransactionId:
            row
              .related_transaction_id ||
            null,

          description:
            row.description ||
            null,

          createdAt:
            row.created_at ||
            null,
        }),
      ),

    ticketStatusCounts,

    pagination: {
      page,

      limit,

      total:
        ticketTotal,

      totalPages:
        Math.max(
          1,
          Math.ceil(
            ticketTotal /
            limit,
          ),
        ),
    },
  };
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
   Admin Full Draw Cancellation
========================================== */

async function cancelAdminDraw(adminId, drawId, reason) {
  const validAdminId = parsePositiveInteger(adminId, "Admin ID");

  const validDrawId = parsePositiveInteger(drawId, "Draw ID");

  const cancellationReason = String(reason || "").trim();

  if (cancellationReason.length < 5 || cancellationReason.length > 255) {
    throw createServiceError(
      "Cancellation reason must be between 5 and 255 characters.",
      400,
      "INVALID_DRAW_CANCELLATION_REASON",
    );
  }

  const connection = await pool.getConnection();

  let transactionStarted = false;

  try {
    await connection.beginTransaction();

    transactionStarted = true;

    /*
     * Lock draw first so purchase, player cancellation
     * and admin cancellation cannot run together.
     */
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

    const admin = await getLockedLotteryAdmin(validAdminId, connection);

    if (String(draw.status) === "cancelled") {
      await connection.commit();

      transactionStarted = false;

      return {
        alreadyCancelled: true,

        drawId: validDrawId,

        drawCode: draw.draw_code,

        status: "cancelled",

        refundedTicketCount: 0,

        totalRefundAmount: 0,

        turnoverReversed: 0,

        cancellationReason: draw.cancellation_reason || null,

        cancelledAt: draw.cancelled_at || null,
      };
    }

    const cancellableStatuses = [
      "draft",
      "selling",
      "paused",
      "sold_out",
      "countdown",
      "ready_to_draw",
      "failed",
    ];

    if (!cancellableStatuses.includes(String(draw.status))) {
      throw createServiceError(
        "This lottery draw can no longer be cancelled.",
        409,
        "LOTTERY_DRAW_CANNOT_BE_CANCELLED",
      );
    }

    const [refundableTicketRows] = await connection.query(
      `
          SELECT
            *

          FROM lottery_tickets

          WHERE draw_id = ?
            AND status IN (
              'active',
              'locked'
            )

          ORDER BY
            user_id ASC,
            id ASC

          FOR UPDATE
        `,
      [validDrawId],
    );

    /*
     * Lock all affected users in the same order.
     */
    const refundableUserIds = [
      ...new Set(refundableTicketRows.map((ticket) => Number(ticket.user_id))),
    ].sort((firstId, secondId) => firstId - secondId);

    const lockedUsers = new Map();

    if (refundableUserIds.length > 0) {
      const placeholders = refundableUserIds.map(() => "?").join(",");

      const [userRows] = await connection.query(
        `
            SELECT
              id,
              wallet_balance,
              turnover_amount

            FROM users

            WHERE id IN (
              ${placeholders}
            )

            ORDER BY id ASC

            FOR UPDATE
          `,
        refundableUserIds,
      );

      for (const user of userRows) {
        lockedUsers.set(Number(user.id), {
          id: Number(user.id),

          walletBalance: parseMoney(user.wallet_balance),

          turnoverAmount: parseMoney(user.turnover_amount),
        });
      }

      if (lockedUsers.size !== refundableUserIds.length) {
        throw createServiceError(
          "One or more lottery players could not be locked for refund.",
          409,
          "LOTTERY_REFUND_PLAYER_MISSING",
        );
      }
    }

    let totalRefundAmount = 0;

    let turnoverReversed = 0;

    for (const ticket of refundableTicketRows) {
      const ticketUserId = Number(ticket.user_id);

      const lockedUser = lockedUsers.get(ticketUserId);

      if (!lockedUser) {
        throw createServiceError(
          "Lottery refund player was not found.",
          409,
          "LOTTERY_REFUND_PLAYER_MISSING",
        );
      }

      const ticketPrice = parseMoney(ticket.ticket_price);

      const ticketTurnoverApplied = Number(ticket.turnover_applied || 0) === 1;

      const ticketTurnoverAmount = ticketTurnoverApplied
        ? parseMoney(ticket.turnover_amount || ticketPrice)
        : 0;

      const balanceBefore = lockedUser.walletBalance;

      const balanceAfter = parseMoney(balanceBefore + ticketPrice);

      const turnoverBefore = lockedUser.turnoverAmount;

      const turnoverAfter = parseMoney(
        Math.max(0, turnoverBefore - ticketTurnoverAmount),
      );

      const refundTransactionId = createLotteryWalletTransactionId("LTAREF");

      const [walletUpdateResult] = await connection.query(
        `
            UPDATE users

            SET
              wallet_balance =
                wallet_balance + ?,

              turnover_amount =
                GREATEST(
                  0,
                  turnover_amount - ?
                )

            WHERE id = ?
          `,
        [ticketPrice, ticketTurnoverAmount, ticketUserId],
      );

      if (Number(walletUpdateResult.affectedRows) !== 1) {
        throw createServiceError(
          "Admin lottery refund could not be credited.",
          409,
          "LOTTERY_ADMIN_REFUND_FAILED",
        );
      }

      await connection.query(
        `
          INSERT INTO wallet_transactions (
            transaction_id,
            user_id,
            transaction_type,
            direction,
            amount,
            balance_before,
            balance_after,
            status,
            reference_type,
            reference_id,
            description,
            created_by
          )
          VALUES (
            ?,
            ?,
            'game_cash_out',
            'credit',
            ?,
            ?,
            ?,
            'completed',
            'lottery_draw_cancel',
            ?,
            ?,
            ?
          )
        `,
        [
          refundTransactionId,
          ticketUserId,
          ticketPrice,
          balanceBefore,
          balanceAfter,
          String(ticket.id),
          `Full refund for cancelled lottery draw ${draw.draw_code}, ticket ${ticket.ticket_code}`,
          Number(admin.id),
        ],
      );

      const refundDate = new Date();

      const [ticketUpdateResult] = await connection.query(
        `
            UPDATE lottery_tickets

            SET
              status =
                'admin_refunded',
              refund_transaction_id = ?,
              refund_amount = ?,
              cancellation_fee_amount =
                0.00,
              cancellation_source =
                'admin',
              cancelled_by_user_id = ?,
              cancellation_reason = ?,
              cancelled_at = ?,
              refunded_at = ?

            WHERE id = ?
              AND status IN (
                'active',
                'locked'
              )
          `,
        [
          refundTransactionId,
          ticketPrice,
          Number(admin.id),
          cancellationReason,
          formatMysqlDateTime(refundDate),
          formatMysqlDateTime(refundDate),
          Number(ticket.id),
        ],
      );

      if (Number(ticketUpdateResult.affectedRows) !== 1) {
        throw createServiceError(
          "Lottery ticket could not be marked as admin refunded.",
          409,
          "LOTTERY_ADMIN_TICKET_UPDATE_FAILED",
        );
      }

      await appendLotteryAuditEvent(connection, {
        drawId: validDrawId,

        ticketId: Number(ticket.id),

        actorType: "admin",

        actorUserId: Number(admin.id),

        eventType: "TICKET_ADMIN_REFUNDED",

        eventData: {
          ticketCode: ticket.ticket_code,

          userId: ticketUserId,

          refundAmount: ticketPrice,

          turnoverReversed: ticketTurnoverAmount,

          previousStatus: String(ticket.status),

          newStatus: "admin_refunded",
        },
      });

      lockedUser.walletBalance = balanceAfter;

      lockedUser.turnoverAmount = turnoverAfter;

      totalRefundAmount = parseMoney(totalRefundAmount + ticketPrice);

      turnoverReversed = parseMoney(turnoverReversed + ticketTurnoverAmount);
    }

    /*
     * Reveal the cancelled draw seed so the public
     * commitment can still be independently verified.
     */
    const serverSeed = decryptServerSeed(draw.server_seed_ciphertext);

    const calculatedCommitment = sha256Hex(serverSeed);

    if (calculatedCommitment !== String(draw.seed_commitment || "")) {
      throw createServiceError(
        "Lottery draw seed commitment verification failed.",
        500,
        "LOTTERY_SEED_COMMITMENT_MISMATCH",
      );
    }

    const revealedSeed = serverSeed.toString("hex");

    const [cancelledCountRows] = await connection.query(
      `
          SELECT
            COUNT(*) AS total

          FROM lottery_tickets

          WHERE draw_id = ?
            AND status IN (
              'cancelled',
              'admin_refunded'
            )
        `,
      [validDrawId],
    );

    const cancelledTicketCount = Number(cancelledCountRows[0]?.total || 0);

    const cancelledAt = new Date();

    const [drawUpdateResult] = await connection.query(
      `
          UPDATE lottery_draws

          SET
            status = 'cancelled',
            active_ticket_count = 0,
            cancelled_ticket_count = ?,
            gross_sales_amount = 0.00,
            total_prize_amount = 0.00,
            first_prize_amount = 0.00,
            second_prize_amount = 0.00,
            third_prize_amount = 0.00,
            service_charge_amount = 0.00,
            revealed_seed = ?,
            cancelled_at = ?,
            cancellation_reason = ?,
            state_version =
              state_version + 1

          WHERE id = ?
            AND status IN (
              'draft',
              'selling',
              'paused',
              'sold_out',
              'countdown',
              'ready_to_draw',
              'failed'
            )
        `,
      [
        cancelledTicketCount,
        revealedSeed,
        formatMysqlDateTime(cancelledAt),
        cancellationReason,
        validDrawId,
      ],
    );

    if (Number(drawUpdateResult.affectedRows) !== 1) {
      throw createServiceError(
        "Lottery draw cancellation could not be completed.",
        409,
        "LOTTERY_ADMIN_DRAW_CANCEL_FAILED",
      );
    }

    await appendLotteryAuditEvent(connection, {
      drawId: validDrawId,

      actorType: "admin",

      actorUserId: Number(admin.id),

      eventType: "DRAW_CANCELLED",

      eventData: {
        previousStatus: String(draw.status),

        newStatus: "cancelled",

        cancellationReason,

        refundedTicketCount: refundableTicketRows.length,

        totalRefundAmount,

        turnoverReversed,

        playerCancelledTicketsRefunded: false,

        revealedSeed,

        seedCommitment: draw.seed_commitment,
      },
    });

    await connection.commit();

    transactionStarted = false;

    return {
      alreadyCancelled: false,

      drawId: validDrawId,

      drawCode: draw.draw_code,

      status: "cancelled",

      refundedTicketCount: refundableTicketRows.length,

      totalRefundAmount,

      turnoverReversed,

      cancellationReason,

      cancelledAt: cancelledAt.toISOString(),

      revealedSeed,
    };
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
   Deterministic Fair Shuffle
========================================== */

function buildLotteryTicketSetHash(tickets) {
  return sha256Hex(
    canonicalizeJson(
      tickets.map((ticket) => ({
        ticketId:
          Number(ticket.id),

        ticketCode:
          ticket.ticket_code,

        userId:
          Number(ticket.user_id),

        ticketPrice:
          parseMoney(
            ticket.ticket_price,
          ),
      })),
    ),
  );
}

function createDeterministicRandomInteger(
  serverSeed,
  context,
) {
  let counter = 0;

  let randomBlock =
    Buffer.alloc(0);

  let blockOffset = 0;

  function nextUInt32() {
    if (
      blockOffset + 4 >
      randomBlock.length
    ) {
      randomBlock =
        crypto
          .createHmac(
            "sha256",
            serverSeed,
          )
          .update(
            String(context),
          )
          .update("|")
          .update(
            String(counter),
          )
          .digest();

      counter += 1;

      blockOffset = 0;
    }

    const value =
      randomBlock.readUInt32BE(
        blockOffset,
      );

    blockOffset += 4;

    return value;
  }

  return function nextInteger(
    maxExclusive,
  ) {
    const maximum =
      Number(maxExclusive);

    if (
      !Number.isInteger(
        maximum,
      ) ||
      maximum < 1
    ) {
      throw createServiceError(
        "Lottery shuffle range is invalid.",
        500,
        "LOTTERY_SHUFFLE_RANGE_INVALID",
      );
    }

    if (maximum === 1) {
      return 0;
    }

    const uint32Range =
      0x100000000;

    const acceptanceLimit =
      Math.floor(
        uint32Range / maximum,
      ) * maximum;

    let randomValue;

    do {
      randomValue =
        nextUInt32();
    } while (
      randomValue >=
      acceptanceLimit
    );

    return (
      randomValue %
      maximum
    );
  };
}

function shuffleLotteryTickets(
  tickets,
  serverSeed,
  context,
) {
  const shuffledTickets = [
    ...tickets,
  ];

  const nextInteger =
    createDeterministicRandomInteger(
      serverSeed,
      context,
    );

  for (
    let index =
      shuffledTickets.length - 1;
    index > 0;
    index -= 1
  ) {
    const replacementIndex =
      nextInteger(
        index + 1,
      );

    [
      shuffledTickets[index],
      shuffledTickets[
        replacementIndex
      ],
    ] = [
      shuffledTickets[
        replacementIndex
      ],
      shuffledTickets[index],
    ];
  }

  return shuffledTickets;
}

function selectDistinctLotteryWinners(
  shuffledTickets,
) {
  const selectedWinners = [];

  const selectedUserIds =
    new Set();

  for (
    const ticket of
    shuffledTickets
  ) {
    const userId =
      Number(ticket.user_id);

    if (
      selectedUserIds.has(
        userId,
      )
    ) {
      continue;
    }

    selectedUserIds.add(
      userId,
    );

    selectedWinners.push(
      ticket,
    );

    if (
      selectedWinners.length ===
      3
    ) {
      break;
    }
  }

  if (
    selectedWinners.length !==
    3
  ) {
    throw createServiceError(
      "At least three unique players are required for the lottery draw.",
      409,
      "LOTTERY_UNIQUE_WINNERS_REQUIRED",
    );
  }

  return selectedWinners;
}

function prepareLotteryFairSelection(
  draw,
  lockedTickets,
) {
  const validDrawId =
    Number(draw.id);

  const calculatedTicketSetHash =
    buildLotteryTicketSetHash(
      lockedTickets,
    );

  if (
    calculatedTicketSetHash !==
    String(
      draw.ticket_set_hash ||
        "",
    )
  ) {
    throw createServiceError(
      "Lottery ticket set verification failed.",
      500,
      "LOTTERY_TICKET_SET_HASH_MISMATCH",
    );
  }

  const serverSeed =
    decryptServerSeed(
      draw
        .server_seed_ciphertext,
    );

  const calculatedSeedCommitment =
    sha256Hex(serverSeed);

  if (
    calculatedSeedCommitment !==
    String(
      draw.seed_commitment ||
        "",
    )
  ) {
    throw createServiceError(
      "Lottery seed commitment verification failed.",
      500,
      "LOTTERY_SEED_COMMITMENT_MISMATCH",
    );
  }

  const algorithm =
    "PMS_LOTTERY_HMAC_FY_V1";

  const shuffleContext =
    canonicalizeJson({
      algorithm,

      drawId:
        validDrawId,

      drawCode:
        draw.draw_code,

      seedCommitment:
        draw.seed_commitment,

      ticketSetHash:
        calculatedTicketSetHash,
    });

  const shuffledTickets =
    shuffleLotteryTickets(
      lockedTickets,
      serverSeed,
      shuffleContext,
    );

  const selectedWinnerTickets =
    selectDistinctLotteryWinners(
      shuffledTickets,
    );

  const shuffleProofHash =
    sha256Hex(
      canonicalizeJson({
        algorithm,

        drawId:
          validDrawId,

        drawCode:
          draw.draw_code,

        seedCommitment:
          draw.seed_commitment,

        ticketSetHash:
          calculatedTicketSetHash,

        shuffledTicketIds:
          shuffledTickets.map(
            (ticket) =>
              Number(ticket.id),
          ),

        winnerTicketIds:
          selectedWinnerTickets.map(
            (ticket) =>
              Number(ticket.id),
          ),
      }),
    );

  const grossAmount =
    parseMoney(
      lockedTickets.reduce(
        (
          total,
          ticket,
        ) =>
          total +
          parseMoney(
            ticket.ticket_price,
          ),
        0,
      ),
    );

  const prizeDefinitions = [
    {
      rank: 1,

      percent:
        parseMoney(
          draw
            .first_prize_percent,
        ),

      amount:
        calculateAmountByPercent(
          grossAmount,
          draw
            .first_prize_percent,
        ),
    },

    {
      rank: 2,

      percent:
        parseMoney(
          draw
            .second_prize_percent,
        ),

      amount:
        calculateAmountByPercent(
          grossAmount,
          draw
            .second_prize_percent,
        ),
    },

    {
      rank: 3,

      percent:
        parseMoney(
          draw
            .third_prize_percent,
        ),

      amount:
        calculateAmountByPercent(
          grossAmount,
          draw
            .third_prize_percent,
        ),
    },
  ];

  const totalPrizeAmount =
    parseMoney(
      prizeDefinitions.reduce(
        (
          total,
          prize,
        ) =>
          total +
          prize.amount,
        0,
      ),
    );

  const serviceChargeAmount =
    calculateAmountByPercent(
      grossAmount,
      draw
        .service_charge_percent,
    );

  return {
    algorithm,

    calculatedTicketSetHash,

    selectedWinnerTickets,

    shuffledTickets,

    shuffleProofHash,

    revealedSeed:
      serverSeed.toString(
        "hex",
      ),

    grossAmount,

    prizeDefinitions,

    totalPrizeAmount,

    serviceChargeAmount,
  };
}

async function settleSelectedLotteryWinners(
  connection,
  {
    admin,
    draw,
    lockedTickets,
    selectedWinnerTickets,
    prizeDefinitions,
  },
) {
  const validDrawId =
    Number(draw.id);

  const winnerUserIds =
    selectedWinnerTickets
      .map(
        (ticket) =>
          Number(
            ticket.user_id,
          ),
      )
      .sort(
        (
          firstId,
          secondId,
        ) =>
          firstId -
          secondId,
      );

  const placeholders =
    winnerUserIds
      .map(() => "?")
      .join(", ");

  const [winnerUserRows] =
    await connection.query(
      `
        SELECT
          id,
          uid,
          full_name,
          wallet_balance,
          account_status

        FROM users

        WHERE id IN (
          ${placeholders}
        )

        ORDER BY id ASC

        FOR UPDATE
      `,
      winnerUserIds,
    );

  if (
    winnerUserRows.length !==
    3
  ) {
    throw createServiceError(
      "One or more lottery winners could not be locked.",
      409,
      "LOTTERY_WINNER_USER_MISSING",
    );
  }

  const winnerUsers =
    new Map(
      winnerUserRows.map(
        (user) => [
          Number(user.id),
          user,
        ],
      ),
    );

  const [
    nonWinnerUpdateResult,
  ] =
    await connection.query(
      `
        UPDATE lottery_tickets

        SET
          status =
            'non_winner',

          winner_rank =
            NULL,

          prize_amount =
            0.00,

          resulted_at =
            UTC_TIMESTAMP()

        WHERE draw_id = ?
          AND status =
              'locked'
      `,
      [
        validDrawId,
      ],
    );

  if (
    Number(
      nonWinnerUpdateResult
        .affectedRows,
    ) !==
    lockedTickets.length
  ) {
    throw createServiceError(
      "Lottery ticket results could not be prepared.",
      409,
      "LOTTERY_TICKET_RESULT_PREPARE_FAILED",
    );
  }

  const winnerResults = [];

  for (
    let index = 0;
    index <
    selectedWinnerTickets.length;
    index += 1
  ) {
    const ticket =
      selectedWinnerTickets[
        index
      ];

    const prize =
      prizeDefinitions[
        index
      ];

    const winnerUser =
      winnerUsers.get(
        Number(
          ticket.user_id,
        ),
      );

    if (
      !winnerUser ||
      String(
        winnerUser
          .account_status,
      ) !== "active"
    ) {
      throw createServiceError(
        "A selected lottery winner account is not active.",
        409,
        "LOTTERY_WINNER_ACCOUNT_INACTIVE",
      );
    }

    const balanceBefore =
      parseMoney(
        winnerUser
          .wallet_balance,
      );

    const balanceAfter =
      parseMoney(
        balanceBefore +
          prize.amount,
      );

    const payoutTransactionId =
      createLotteryWalletTransactionId(
        `LTWIN${prize.rank}`,
      );

    const winnerMessage =
      `Congratulations! You won rank ${prize.rank} in ${draw.draw_code}.`;

    const [
      walletUpdateResult,
    ] =
      await connection.query(
        `
          UPDATE users

          SET
            wallet_balance =
              wallet_balance + ?

          WHERE id = ?
            AND account_status =
                'active'
        `,
        [
          prize.amount,

          Number(
            winnerUser.id,
          ),
        ],
      );

    if (
      Number(
        walletUpdateResult
          .affectedRows,
      ) !== 1
    ) {
      throw createServiceError(
        "Lottery winner payout could not be credited.",
        409,
        "LOTTERY_WINNER_PAYOUT_FAILED",
      );
    }

    await connection.query(
      `
        INSERT INTO wallet_transactions (
          transaction_id,
          user_id,
          transaction_type,
          direction,
          amount,
          balance_before,
          balance_after,
          status,
          reference_type,
          reference_id,
          description,
          created_by
        )
        VALUES (
          ?,
          ?,
          'game_win',
          'credit',
          ?,
          ?,
          ?,
          'completed',
          'lottery_draw',
          ?,
          ?,
          ?
        )
      `,
      [
        payoutTransactionId,

        Number(
          winnerUser.id,
        ),

        prize.amount,

        balanceBefore,

        balanceAfter,

        String(
          validDrawId,
        ),

        `Lottery ${draw.draw_code} rank ${prize.rank} prize for ticket ${ticket.ticket_code}`,

        Number(
          admin.id,
        ),
      ],
    );

    const [
      ticketUpdateResult,
    ] =
      await connection.query(
        `
          UPDATE lottery_tickets

          SET
            status =
              'winner',

            winner_rank = ?,

            prize_amount = ?,

            resulted_at =
              UTC_TIMESTAMP()

          WHERE id = ?
            AND draw_id = ?
            AND status =
                'non_winner'
        `,
        [
          prize.rank,

          prize.amount,

          Number(
            ticket.id,
          ),

          validDrawId,
        ],
      );

    if (
      Number(
        ticketUpdateResult
          .affectedRows,
      ) !== 1
    ) {
      throw createServiceError(
        "Lottery winning ticket could not be updated.",
        409,
        "LOTTERY_WINNING_TICKET_UPDATE_FAILED",
      );
    }

    await connection.query(
      `
        INSERT INTO lottery_winners (
          draw_id,
          prize_rank,
          ticket_id,
          user_id,
          winner_uid,
          winner_name,
          ticket_code_snapshot,
          prize_percent,
          prize_amount,
          settlement_status,
          payout_transaction_id,
          payout_balance_before,
          payout_balance_after,
          winner_message,
          settled_at,
          announced_at
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
          'completed',
          ?,
          ?,
          ?,
          ?,
          UTC_TIMESTAMP(),
          UTC_TIMESTAMP()
        )
      `,
      [
        validDrawId,

        prize.rank,

        Number(
          ticket.id,
        ),

        Number(
          winnerUser.id,
        ),

        winnerUser.uid,

        winnerUser.full_name,

        ticket.ticket_code,

        prize.percent,

        prize.amount,

        payoutTransactionId,

        balanceBefore,

        balanceAfter,

        winnerMessage,
      ],
    );

    await appendLotteryAuditEvent(
      connection,
      {
        drawId:
          validDrawId,

        ticketId:
          Number(
            ticket.id,
          ),

        actorType:
          "system",

        eventType:
          "WINNER_PAID",

        eventData: {
          prizeRank:
            prize.rank,

          ticketCode:
            ticket
              .ticket_code,

          winnerUserId:
            Number(
              winnerUser.id,
            ),

          prizePercent:
            prize.percent,

          prizeAmount:
            prize.amount,

          payoutTransactionId,
        },
      },
    );

    winnerUser.wallet_balance =
      balanceAfter;

    winnerResults.push({
      drawId:
        validDrawId,

      drawCode:
        draw.draw_code,

            drawTitle:
        draw.draw_title,

      winnerUserId:
        Number(
          winnerUser.id,
        ),

      prizeRank:
        prize.rank,

      ticketCode:
        ticket.ticket_code,

      winnerUid:
        winnerUser.uid,

      winnerName:
        winnerUser.full_name,

      prizePercent:
        prize.percent,

      prizeAmount:
        prize.amount,

      winnerMessage,

      payoutTransactionId,

      payoutBalanceBefore:
        balanceBefore,

      payoutBalanceAfter:
        balanceAfter,
    });
  }

  return winnerResults;
}

async function executeAdminFairDraw(
  adminId,
  drawId,
  options = {},
) {
  const validDrawId =
    parsePositiveInteger(
      drawId,
      "Draw ID",
    );

      const onDrawingStarted =
    typeof options
      .onDrawingStarted ===
    "function"
      ? options
          .onDrawingStarted
      : null;

  const connection =
    await pool.getConnection();

  let transactionStarted =
    false;

  try {
    await connection
      .beginTransaction();

    transactionStarted = true;

    const admin =
      await getLockedLotteryAdmin(
        adminId,
        connection,
      );

    const [drawRows] =
      await connection.query(
        `
          SELECT
            ld.*,

            GREATEST(
              0,
              TIMESTAMPDIFF(
                SECOND,
                UTC_TIMESTAMP(),
                ld.countdown_ends_at
              )
            ) AS remaining_seconds

          FROM lottery_draws ld

          WHERE ld.id = ?

          LIMIT 1

          FOR UPDATE
        `,
        [
          validDrawId,
        ],
      );

    const draw =
      drawRows[0] || null;

    if (!draw) {
      throw createServiceError(
        "Lottery draw was not found.",
        404,
        "LOTTERY_DRAW_NOT_FOUND",
      );
    }

    /*
     * একই draw button পুনরায় চাপলে
     * দ্বিতীয়বার prize দেওয়া হবে না।
     */
    if (
      String(draw.status) ===
      "completed"
    ) {
      const [
        completedWinnerRows,
      ] =
        await connection.query(
          `
            SELECT
              lw.*,
              ld.draw_code,
              ld.draw_title

            FROM lottery_winners lw

            INNER JOIN lottery_draws ld
              ON ld.id =
                 lw.draw_id

            WHERE lw.draw_id = ?
              AND lw.settlement_status =
                  'completed'

            ORDER BY
              lw.prize_rank ASC
          `,
          [
            validDrawId,
          ],
        );

      if (
        completedWinnerRows.length !==
        3
      ) {
        throw createServiceError(
          "Completed lottery draw winner data is inconsistent.",
          500,
          "LOTTERY_COMPLETED_WINNER_INTEGRITY_ERROR",
        );
      }

      await connection.commit();

      transactionStarted =
        false;

      return {
        alreadyCompleted:
          true,

        drawId:
          validDrawId,

        drawCode:
          draw.draw_code,

        status:
          "completed",

        winners:
          completedWinnerRows.map(
            mapWinnerRow,
          ),

        ticketSetHash:
          draw.ticket_set_hash,

        shuffleProofHash:
          draw
            .shuffle_proof_hash,

        revealedSeed:
          draw.revealed_seed,

        drawnAt:
          draw.drawn_at ||
          null,
      };
    }

    if (
      ![
        "countdown",
        "ready_to_draw",
      ].includes(
        String(draw.status),
      )
    ) {
      throw createServiceError(
        "This lottery draw is not ready to run.",
        409,
        "LOTTERY_DRAW_NOT_READY",
      );
    }

    const remainingSeconds =
      Number(
        draw.remaining_seconds ||
          0,
      );

    if (
      remainingSeconds > 0
    ) {
      throw createServiceError(
        `Lottery countdown has ${remainingSeconds} seconds remaining.`,
        409,
        "LOTTERY_COUNTDOWN_ACTIVE",
      );
    }

    /*
     * Unfinished draw-এর জন্য আগে থেকে
     * winner row থাকা নিরাপদ নয়।
     */
    const [
      existingWinnerRows,
    ] =
      await connection.query(
        `
          SELECT
            COUNT(*) AS total

          FROM lottery_winners

          WHERE draw_id = ?
        `,
        [
          validDrawId,
        ],
      );

    if (
      Number(
        existingWinnerRows[0]
          ?.total || 0,
      ) !== 0
    ) {
      throw createServiceError(
        "Lottery winner records already exist for this unfinished draw.",
        500,
        "LOTTERY_WINNER_STATE_CONFLICT",
      );
    }

    const [lockedTickets] =
      await connection.query(
        `
          SELECT
            id,
            ticket_code,
            user_id,
            ticket_price

          FROM lottery_tickets

          WHERE draw_id = ?
            AND status =
                'locked'
            AND turnover_applied =
                1

          ORDER BY
            ticket_code ASC,
            id ASC

          FOR UPDATE
        `,
        [
          validDrawId,
        ],
      );

    const targetTicketQuantity =
      Number(
        draw
          .target_ticket_quantity ||
          0,
      );

    if (
      targetTicketQuantity < 3 ||
      lockedTickets.length !==
        targetTicketQuantity ||
      Number(
        draw
          .active_ticket_count ||
          0,
      ) !==
        targetTicketQuantity
    ) {
      throw createServiceError(
        "Locked lottery ticket set is incomplete.",
        409,
        "LOTTERY_LOCKED_TICKET_SET_INCOMPLETE",
      );
    }

    const uniquePlayerCount =
      new Set(
        lockedTickets.map(
          (ticket) =>
            Number(
              ticket.user_id,
            ),
        ),
      ).size;

    if (
      uniquePlayerCount <
      Number(
        draw
          .minimum_unique_players ||
          3,
      )
    ) {
      throw createServiceError(
        "Lottery draw does not have enough unique players.",
        409,
        "LOTTERY_MINIMUM_PLAYERS_REQUIRED",
      );
    }

    /*
     * Seed, commitment, ticket-set hash,
     * deterministic shuffle এবং prize হিসাব।
     */
    const fairSelection =
      prepareLotteryFairSelection(
        draw,
        lockedTickets,
      );

    const [
      drawingUpdateResult,
    ] =
      await connection.query(
        `
          UPDATE lottery_draws

          SET
            status =
              'drawing',

            state_version =
              state_version + 1

          WHERE id = ?
            AND status IN (
              'countdown',
              'ready_to_draw'
            )
        `,
        [
          validDrawId,
        ],
      );

    if (
      Number(
        drawingUpdateResult
          .affectedRows,
      ) !== 1
    ) {
      throw createServiceError(
        "Lottery draw could not enter drawing state.",
        409,
        "LOTTERY_DRAW_START_FAILED",
      );
    }

    await appendLotteryAuditEvent(
      connection,
      {
        drawId:
          validDrawId,

        actorType:
          "admin",

        actorUserId:
          Number(admin.id),

        eventType:
          "FAIR_DRAW_STARTED",

        eventData: {
          algorithm:
            fairSelection
              .algorithm,

          ticketCount:
            lockedTickets.length,

          uniquePlayerCount,

          ticketSetHash:
            fairSelection
              .calculatedTicketSetHash,

          seedCommitment:
            draw
              .seed_commitment,
        },
      },
    );

        /*
     * Socket animation event financial transaction-কে
     * ব্যর্থ করতে পারবে না।
     */
    if (onDrawingStarted) {
      try {
        await onDrawingStarted({
          drawId:
            validDrawId,

          drawCode:
            draw.draw_code,

          drawTitle:
            draw.draw_title,

          ticketCount:
            lockedTickets.length,

                   uniquePlayerCount,

          /*
           * Animation-এর জন্য সর্বোচ্চ 60টি real sold ticket।
           * বড় draw-এর সব ticket socket-এ পাঠানো হবে না।
           */
          ticketPreview:
            lockedTickets
              .slice(
                0,
                60,
              )
              .map(
                (ticket) =>
                  ticket
                    .ticket_code,
              ),

          animationDurationMs:
            9000,

          revealIntervalMs:
            2200,
        });
      } catch (socketError) {
        console.error(
          "LOTTERY DRAW START SOCKET ERROR:",
          socketError,
        );
      }
    }

    /*
     * তিন winner payout।
     * Prize turnover বাড়াবে না।
     */
    const winnerResults =
      await settleSelectedLotteryWinners(
        connection,
        {
          admin,

          draw,

          lockedTickets,

          selectedWinnerTickets:
            fairSelection
              .selectedWinnerTickets,

          prizeDefinitions:
            fairSelection
              .prizeDefinitions,
        },
      );

    /*
     * Platform-এর 10% service revenue।
     */
    await connection.query(
      `
        INSERT INTO lottery_revenue_history (
          revenue_key,
          draw_id,
          ticket_id,
          user_id,
          revenue_type,
          gross_amount,
          revenue_percent,
          revenue_amount,
          related_transaction_id,
          description
        )
        VALUES (
          ?,
          ?,
          NULL,
          NULL,
          'draw_service_charge',
          ?,
          ?,
          ?,
          NULL,
          ?
        )
      `,
      [
        `DRAW_SERVICE:${validDrawId}`,

        validDrawId,

        fairSelection
          .grossAmount,

        parseMoney(
          draw
            .service_charge_percent,
        ),

        fairSelection
          .serviceChargeAmount,

        `Lottery ${draw.draw_code} service charge`,
      ],
    );

    const drawnAt =
      new Date();

    const [
      drawCompleteResult,
    ] =
      await connection.query(
        `
          UPDATE lottery_draws

          SET
            status =
              'completed',

            gross_sales_amount = ?,

            total_prize_amount = ?,

            first_prize_amount = ?,

            second_prize_amount = ?,

            third_prize_amount = ?,

            service_charge_amount = ?,

            shuffle_proof_hash = ?,

            revealed_seed = ?,

            drawn_at = ?,

            state_version =
              state_version + 1

          WHERE id = ?
            AND status =
                'drawing'
        `,
        [
          fairSelection
            .grossAmount,

          fairSelection
            .totalPrizeAmount,

          fairSelection
            .prizeDefinitions[0]
            .amount,

          fairSelection
            .prizeDefinitions[1]
            .amount,

          fairSelection
            .prizeDefinitions[2]
            .amount,

          fairSelection
            .serviceChargeAmount,

          fairSelection
            .shuffleProofHash,

          fairSelection
            .revealedSeed,

          formatMysqlDateTime(
            drawnAt,
          ),

          validDrawId,
        ],
      );

    if (
      Number(
        drawCompleteResult
          .affectedRows,
      ) !== 1
    ) {
      throw createServiceError(
        "Lottery draw could not be completed.",
        409,
        "LOTTERY_DRAW_COMPLETE_FAILED",
      );
    }

    await appendLotteryAuditEvent(
      connection,
      {
        drawId:
          validDrawId,

        actorType:
          "system",

        eventType:
          "FAIR_DRAW_COMPLETED",

        eventData: {
          algorithm:
            fairSelection
              .algorithm,

          grossAmount:
            fairSelection
              .grossAmount,

          totalPrizeAmount:
            fairSelection
              .totalPrizeAmount,

          serviceChargeAmount:
            fairSelection
              .serviceChargeAmount,

          ticketSetHash:
            fairSelection
              .calculatedTicketSetHash,

          shuffleProofHash:
            fairSelection
              .shuffleProofHash,

          revealedSeed:
            fairSelection
              .revealedSeed,

          winners:
            winnerResults.map(
              (winner) => ({
                prizeRank:
                  winner
                    .prizeRank,

                ticketCode:
                  winner
                    .ticketCode,

                winnerUid:
                  winner
                    .winnerUid,

                prizeAmount:
                  winner
                    .prizeAmount,
              }),
            ),
        },
      },
    );

    await connection.commit();

    transactionStarted =
      false;

    return {
      alreadyCompleted:
        false,

      drawId:
        validDrawId,

      drawCode:
        draw.draw_code,

      status:
        "completed",

      algorithm:
        fairSelection
          .algorithm,

      grossAmount:
        fairSelection
          .grossAmount,

      totalPrizeAmount:
        fairSelection
          .totalPrizeAmount,

      serviceChargeAmount:
        fairSelection
          .serviceChargeAmount,

      winners:
        winnerResults,

      ticketSetHash:
        fairSelection
          .calculatedTicketSetHash,

      shuffleProofHash:
        fairSelection
          .shuffleProofHash,

      revealedSeed:
        fairSelection
          .revealedSeed,

      drawnAt:
        drawnAt.toISOString(),
    };
  } catch (error) {
    if (
      transactionStarted
    ) {
      await connection
        .rollback();
    }

    if (
      error.code ===
      "ER_DUP_ENTRY"
    ) {
      throw createServiceError(
        "Lottery draw settlement already exists.",
        409,
        "LOTTERY_DRAW_ALREADY_SETTLED",
      );
    }

    throw error;
  } finally {
    connection.release();
  }
}

/* ==========================================
   Player Lottery Winner Notifications
========================================== */

async function getMyLotteryNotifications(
  userId,
  options = {},
) {
  const validUserId =
    parsePositiveInteger(
      userId,
      "User ID",
    );

  const limit =
    parseListLimit(
      options.limit,
      20,
      50,
    );

  const unreadOnly =
    [
      "1",
      "true",
      "yes",
    ].includes(
      String(
        options.unreadOnly ||
          "",
      )
        .trim()
        .toLowerCase(),
    );

  const whereConditions = [
    "lw.user_id = ?",
    "lw.settlement_status = 'completed'",
  ];

  const queryParameters = [
    validUserId,
  ];

  if (unreadOnly) {
    whereConditions.push(
      "lw.notification_read_at IS NULL",
    );
  }

  const whereSql =
    whereConditions.join(
      " AND ",
    );

  const [
    countRows,
  ] =
    await pool.query(
      `
        SELECT
          COUNT(*) AS total

        FROM lottery_winners lw

        WHERE ${whereSql}
      `,
      queryParameters,
    );

  const [
    unreadRows,
  ] =
    await pool.query(
      `
        SELECT
          COUNT(*) AS total

        FROM lottery_winners lw

        WHERE lw.user_id = ?
          AND lw.settlement_status =
              'completed'
          AND lw.notification_read_at
              IS NULL
      `,
      [
        validUserId,
      ],
    );

  const [
    notificationRows,
  ] =
    await pool.query(
      `
        SELECT
          lw.id AS notification_id,
          lw.draw_id,
          lw.prize_rank,
          lw.winner_uid,
          lw.winner_name,
          lw.ticket_code_snapshot,
          lw.prize_percent,
          lw.prize_amount,
          lw.winner_message,
          lw.notification_read_at,
          lw.announced_at,
          lw.created_at,

          ld.draw_code,
          ld.draw_title,
          ld.drawn_at

        FROM lottery_winners lw

        INNER JOIN lottery_draws ld
          ON ld.id =
             lw.draw_id

        WHERE ${whereSql}

        ORDER BY
          lw.created_at DESC,
          lw.id DESC

        LIMIT ${limit}
      `,
      queryParameters,
    );

  return {
    notifications:
      notificationRows.map(
        (row) => ({
          notificationId:
            Number(
              row.notification_id,
            ),

          type:
            "lottery_win",

          drawId:
            Number(
              row.draw_id,
            ),

          drawCode:
            row.draw_code,

          drawTitle:
            row.draw_title,

          prizeRank:
            Number(
              row.prize_rank,
            ),

          ticketCode:
            row
              .ticket_code_snapshot,

          winnerUid:
            row.winner_uid,

          winnerName:
            row.winner_name,

          prizePercent:
            parseMoney(
              row.prize_percent,
            ),

          prizeAmount:
            parseMoney(
              row.prize_amount,
            ),

          winnerMessage:
            row.winner_message,

          isRead:
            Boolean(
              row
                .notification_read_at,
            ),

          readAt:
            row
              .notification_read_at ||
            null,

          announcedAt:
            row.announced_at ||
            null,

          drawnAt:
            row.drawn_at ||
            null,

          createdAt:
            row.created_at ||
            null,
        })),
    total:
      Number(
        countRows[0]
          ?.total || 0,
      ),

    unreadCount:
      Number(
        unreadRows[0]
          ?.total || 0,
      ),
  };
}

async function markLotteryNotificationRead(
  userId,
  drawId,
) {
  const validUserId =
    parsePositiveInteger(
      userId,
      "User ID",
    );

  const validDrawId =
    parsePositiveInteger(
      drawId,
      "Draw ID",
    );

  const [
    updateResult,
  ] =
    await pool.query(
      `
        UPDATE lottery_winners

        SET
          notification_read_at =
            COALESCE(
              notification_read_at,
              UTC_TIMESTAMP()
            )

        WHERE draw_id = ?
          AND user_id = ?
          AND settlement_status =
              'completed'
      `,
      [
        validDrawId,
        validUserId,
      ],
    );

  const [
    notificationRows,
  ] =
    await pool.query(
      `
        SELECT
          id AS notification_id,
          draw_id,
          notification_read_at

        FROM lottery_winners

        WHERE draw_id = ?
          AND user_id = ?
          AND settlement_status =
              'completed'

        LIMIT 1
      `,
      [
        validDrawId,
        validUserId,
      ],
    );

  const notification =
    notificationRows[0] ||
    null;

      if (!notification) {
    throw createServiceError(
      "Lottery winner notification was not found.",
      404,
      "LOTTERY_NOTIFICATION_NOT_FOUND",
    );
  }

  return {
    notificationId:
      Number(
        notification
          ?.notification_id,
      ),

    drawId:
      Number(
        notification
          ?.draw_id,
      ),

    isRead:
      true,

    readAt:
      notification
        ?.notification_read_at ||
      null,
  };
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
    getMyLotteryNotifications,
  markLotteryNotificationRead,
  getAdminLotteryDraws,
  getAdminLotteryDrawDetails,
  purchaseTickets,
  cancelTicket,
  cancelAdminDraw,
  createAdminDraw,
  openAdminDraw,
  executeAdminFairDraw,
};
