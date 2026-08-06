"use strict";

const {
  pool,
} = require(
  "../config/database",
);

/* ==========================================
   Carrom Constants
========================================== */

const ALLOWED_PLAYER_MODES =
  new Set([
    2,
    4,
  ]);

/* ==========================================
   Error Helpers
========================================== */

function createServiceError(
  message,
  statusCode = 400,
  code = "CARROM_SERVICE_ERROR",
) {
  const error =
    new Error(message);

  error.statusCode =
    statusCode;

  error.code =
    code;

  return error;
}

/* ==========================================
   Validation Helpers
========================================== */

function parsePositiveInteger(
  value,
  fieldName = "ID",
) {
  const parsed =
    Number.parseInt(
      String(value),
      10,
    );

  if (
    !Number.isInteger(parsed) ||
    parsed < 1
  ) {
    throw createServiceError(
      `${fieldName} is invalid.`,
      400,
      "CARROM_INVALID_ID",
    );
  }

  return parsed;
}

function parsePlayerMode(value) {
  const playerMode =
    Number.parseInt(
      String(value),
      10,
    );

  if (
    !ALLOWED_PLAYER_MODES.has(
      playerMode,
    )
  ) {
    throw createServiceError(
      "Carrom player mode must be 2 or 4.",
      400,
      "CARROM_INVALID_PLAYER_MODE",
    );
  }

  return playerMode;
}

function parseMoney(value) {
  const amount =
    Number(value || 0);

  if (
    !Number.isFinite(amount) ||
    amount < 0
  ) {
    return 0;
  }

  return Number(
    amount.toFixed(2),
  );
}

/* ==========================================
   Prize Calculation
========================================== */

function calculateRoomPrize({
  entryAmount,
  playerMode,
  serviceChargePercent,
}) {
  const validEntryAmount =
    parseMoney(entryAmount);

  const validPlayerMode =
    parsePlayerMode(playerMode);

  const validServiceChargePercent =
    parseMoney(
      serviceChargePercent,
    );

  const grossPoolAmount =
    parseMoney(
      validEntryAmount *
        validPlayerMode,
    );

  const serviceChargeAmount =
    parseMoney(
      grossPoolAmount *
        validServiceChargePercent /
        100,
    );

  const prizePoolAmount =
    parseMoney(
      grossPoolAmount -
        serviceChargeAmount,
    );

  /*
   * 2-player:
   * One winner receives the whole prize.
   *
   * 4-player:
   * Winning team contains two players.
   * Both teammates receive an equal share.
   */
  const winnerCount =
    validPlayerMode === 4
      ? 2
      : 1;

  const prizePerWinner =
    parseMoney(
      prizePoolAmount /
        winnerCount,
    );

  return {
    grossPoolAmount,

    serviceChargeAmount,

    prizePoolAmount,

    winnerCount,

    prizePerWinner,
  };
}

/* ==========================================
   Room Normalization
========================================== */

function normalizeCarromRoom(row) {
  if (!row) {
    return null;
  }

  const entryAmount =
    parseMoney(
      row.entry_amount,
    );

  const playerMode =
    Number(
      row.player_mode,
    );

  const serviceChargePercent =
    parseMoney(
      row.service_charge_percent,
    );

  const prize =
    calculateRoomPrize({
      entryAmount,
      playerMode,
      serviceChargePercent,
    });

  return {
    id:
      Number(row.id),

    roomCode:
      row.room_code,

    roomName:
      row.room_name,

    playerMode,

    entryAmount,

    serviceChargePercent,

    matchmakingWaitSeconds:
      Number(
        row.matchmaking_wait_seconds,
      ),

    turnSeconds:
      Number(
        row.turn_seconds,
      ),

    status:
      row.room_status,

    sortOrder:
      Number(
        row.sort_order || 0,
      ),

    grossPoolAmount:
      prize.grossPoolAmount,

    serviceChargeAmount:
      prize.serviceChargeAmount,

    prizePoolAmount:
      prize.prizePoolAmount,

    winnerCount:
      prize.winnerCount,

    prizePerWinner:
      prize.prizePerWinner,

    createdAt:
      row.created_at || null,

    updatedAt:
      row.updated_at || null,
  };
}

/* ==========================================
   Get Available Rooms
========================================== */

async function getAvailableRooms(
  requestedPlayerMode,
) {
  const playerMode =
    parsePlayerMode(
      requestedPlayerMode,
    );

  const [rows] =
    await pool.query(
      `
        SELECT
          id,
          room_code,
          room_name,
          player_mode,
          entry_amount,
          service_charge_percent,
          matchmaking_wait_seconds,
          turn_seconds,
          room_status,
          sort_order,
          created_at,
          updated_at

        FROM carrom_rooms

        WHERE room_status = 'active'
          AND player_mode = ?

        ORDER BY
          sort_order ASC,
          entry_amount ASC,
          id ASC
      `,
      [
        playerMode,
      ],
    );

  return rows
    .map(
      normalizeCarromRoom,
    )
    .filter(Boolean);
}

/* ==========================================
   Get Single Active Room
========================================== */

async function getActiveRoomById(
  roomId,
  connection = pool,
  options = {},
) {
  const validRoomId =
    parsePositiveInteger(
      roomId,
      "Room ID",
    );

  const shouldLock =
    options.forUpdate === true;

  const [rows] =
    await connection.query(
      `
        SELECT
          id,
          room_code,
          room_name,
          player_mode,
          entry_amount,
          service_charge_percent,
          matchmaking_wait_seconds,
          turn_seconds,
          room_status,
          sort_order,
          created_at,
          updated_at

        FROM carrom_rooms

        WHERE id = ?
          AND room_status = 'active'

        LIMIT 1

        ${shouldLock
          ? "FOR UPDATE"
          : ""}
      `,
      [
        validRoomId,
      ],
    );

  const room =
    normalizeCarromRoom(
      rows[0],
    );

  if (!room) {
    throw createServiceError(
      "Active Carrom room was not found.",
      404,
      "CARROM_ROOM_NOT_FOUND",
    );
  }

  return room;
}

/* ==========================================
   Service Exports
========================================== */

module.exports = {
  ALLOWED_PLAYER_MODES,

  createServiceError,

  parsePositiveInteger,

  parsePlayerMode,

  parseMoney,

  calculateRoomPrize,

  getAvailableRooms,

  getActiveRoomById,
};