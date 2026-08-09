"use strict";

const crypto =
  require("crypto");

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
   Matchmaking Identifiers
========================================== */

function createCarromMatchCode() {
  return [
    "CRM",
    Date.now().toString(36).toUpperCase(),
    crypto
      .randomBytes(5)
      .toString("hex")
      .toUpperCase(),
  ].join("_");
}

function createCarromWalletTransactionId(
  prefix = "CRM",
) {
  return [
    prefix,
    Date.now().toString(36).toUpperCase(),
    crypto
      .randomBytes(5)
      .toString("hex")
      .toUpperCase(),
  ].join("_");
}

/* ==========================================
   User Lock and Validation
========================================== */

async function getLockedCarromUser(
  userId,
  connection,
) {
  const validUserId =
    parsePositiveInteger(
      userId,
      "User ID",
    );

  const [rows] =
    await connection.query(
      `
        SELECT
          id,
          uid,
          full_name,
          username,
          email,
          phone,
          avatar_url,
          role,
          account_status,
          wallet_balance,
          turnover_amount,
          turnover_required,
          is_online

        FROM users

        WHERE id = ?

        LIMIT 1

        FOR UPDATE
      `,
      [
        validUserId,
      ],
    );

  return rows[0] || null;
}

function validateUserForCarrom(
  user,
  entryAmount,
) {
  if (!user) {
    throw createServiceError(
      "User account was not found.",
      404,
      "CARROM_USER_NOT_FOUND",
    );
  }

  if (
    String(
      user.account_status || "",
    ).toLowerCase() !==
    "active"
  ) {
    throw createServiceError(
      "Your account is not active.",
      403,
      "CARROM_ACCOUNT_INACTIVE",
    );
  }

  if (
    String(
      user.role || "",
    ).toLowerCase() !==
    "user"
  ) {
    throw createServiceError(
      "Only player accounts can join Carrom matches.",
      403,
      "CARROM_PLAYER_ACCOUNT_REQUIRED",
    );
  }

  const validEntryAmount =
    parseMoney(entryAmount);

  if (
    validEntryAmount <= 0
  ) {
    throw createServiceError(
      "Carrom entry amount is invalid.",
      400,
      "CARROM_INVALID_ENTRY_AMOUNT",
    );
  }

  const walletBalance =
    parseMoney(
      user.wallet_balance,
    );

  if (
    walletBalance <
    validEntryAmount
  ) {
    throw createServiceError(
      `Minimum ৳${validEntryAmount.toFixed(
        2,
      )} balance required.`,
      400,
      "CARROM_INSUFFICIENT_BALANCE",
    );
  }

  return {
    userId:
      Number(user.id),

    walletBalance,

    entryAmount:
      validEntryAmount,
  };
}

/* ==========================================
   Seat and Team Helpers
========================================== */

function resolveCarromTeamNo(
  playerMode,
  seatNo,
) {
  const validPlayerMode =
    parsePlayerMode(
      playerMode,
    );

  const validSeatNo =
    parsePositiveInteger(
      seatNo,
      "Seat number",
    );

  if (
    validSeatNo >
    validPlayerMode
  ) {
    throw createServiceError(
      "Carrom seat number is outside the selected player mode.",
      400,
      "CARROM_INVALID_SEAT",
    );
  }

  /*
   * 2-player:
   * Seat 1 = Team 1
   * Seat 2 = Team 2
   *
   * 4-player:
   * Seats 1 and 3 = Team 1
   * Seats 2 and 4 = Team 2
   */
  return validSeatNo % 2 === 1
    ? 1
    : 2;
}

function findAvailableCarromSeat(
  playerMode,
  occupiedSeats,
) {
  const validPlayerMode =
    parsePlayerMode(
      playerMode,
    );

  const occupied =
    new Set(
      occupiedSeats
        .map(Number)
        .filter(Number.isInteger),
    );

  for (
    let seatNo = 1;
    seatNo <= validPlayerMode;
    seatNo += 1
  ) {
    if (!occupied.has(seatNo)) {
      return seatNo;
    }
  }

  throw createServiceError(
    "This Carrom match is already full.",
    409,
    "CARROM_MATCH_FULL",
  );
}

/* ==========================================
   Initial Server Board State
========================================== */

function createInitialCarromBoardState() {
  const boardSize = 1000;

  const center =
    boardSize / 2;

  const pieces = [
    {
      id: "queen",
      type: "queen",
      x: center,
      y: center,
      radius: 19,
      pocketed: false,
    },
  ];

  const firstRingRadius = 42;

  for (
    let index = 0;
    index < 6;
    index += 1
  ) {
    const angle =
      -Math.PI / 2 +
      index *
        (
          Math.PI *
          2 /
          6
        );

    pieces.push({
      id:
        `ring-one-${index}`,

      type:
        index % 2 === 0
          ? "white"
          : "black",

      x:
        Number(
          (
            center +
            Math.cos(angle) *
              firstRingRadius
          ).toFixed(4),
        ),

      y:
        Number(
          (
            center +
            Math.sin(angle) *
              firstRingRadius
          ).toFixed(4),
        ),

      radius: 19,

      pocketed: false,
    });
  }

  const secondRingRadius = 79;

  for (
    let index = 0;
    index < 12;
    index += 1
  ) {
    const angle =
      -Math.PI / 2 +
      index *
        (
          Math.PI *
          2 /
          12
        );

    pieces.push({
      id:
        `ring-two-${index}`,

      type:
        index % 2 === 0
          ? "black"
          : "white",

      x:
        Number(
          (
            center +
            Math.cos(angle) *
              secondRingRadius
          ).toFixed(4),
        ),

      y:
        Number(
          (
            center +
            Math.sin(angle) *
              secondRingRadius
          ).toFixed(4),
        ),

      radius: 19,

      pocketed: false,
    });
  }

  return {
    version:
      "carrom-v1",

    boardSize,

    boardEdge:
      64,

    pocketRadius:
      43,

    pieces,

    striker: {
      id:
        "striker",

      type:
        "striker",

      x:
        center,

      y:
        835,

      radius:
        27,

      pocketed:
        false,
    },

    scores: {
      team1:
        0,

      team2:
        0,
    },

    queen: {
      status:
        "on_board",

      ownerPlayerId:
        null,

      pendingCoverPlayerId:
        null,
    },

    lastShot:
      null,
  };
}

function createCarromBoardHash(
  boardState,
) {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify(
        boardState,
      ),
    )
    .digest("hex");
}

/* ==========================================
   Atomic Player Entry Debit
========================================== */

async function debitCarromPlayerEntry(
  match,
  player,
  user,
  connection,
) {
  const userId =
    Number(
      player.user_id,
    );

  const entryAmount =
    parseMoney(
      player.entry_amount,
    );

  const validation =
    validateUserForCarrom(
      user,
      entryAmount,
    );

  if (
    validation.userId !==
    userId
  ) {
    throw createServiceError(
      "Carrom player and wallet owner do not match.",
      409,
      "CARROM_WALLET_OWNER_MISMATCH",
    );
  }

  if (
    String(
      player.entry_status,
    ) === "collected"
  ) {
    return {
      alreadyCollected:
        true,

      balanceBefore:
        parseMoney(
          player
            .entry_balance_before,
        ),

      balanceAfter:
        parseMoney(
          player
            .entry_balance_after,
        ),

      transactionId:
        player
          .entry_transaction_id,
    };
  }

  const balanceBefore =
    parseMoney(
      user.wallet_balance,
    );

  const balanceAfter =
    parseMoney(
      balanceBefore -
        entryAmount,
    );

  const transactionId =
    createCarromWalletTransactionId(
      "CRMBUY",
    );

  const [walletResult] =
    await connection.query(
      `
        UPDATE users

        SET
          wallet_balance =
            wallet_balance - ?,

          turnover_amount =
            turnover_amount + ?

        WHERE id = ?
          AND account_status = 'active'
          AND wallet_balance >= ?
      `,
      [
        entryAmount,

        entryAmount,

        userId,

        entryAmount,
      ],
    );

  if (
    Number(
      walletResult.affectedRows,
    ) !== 1
  ) {
    throw createServiceError(
      `Minimum ৳${entryAmount.toFixed(
        2,
      )} balance required.`,
      400,
      "CARROM_INSUFFICIENT_BALANCE",
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
        'game_buy_in',
        'debit',
        ?,
        ?,
        ?,
        'completed',
        'carrom_match',
        ?,
        ?,
        NULL
      )
    `,
    [
      transactionId,

      userId,

      entryAmount,

      balanceBefore,

      balanceAfter,

      String(match.id),

      `Carrom match ${match.match_code} entry fee`,
    ],
  );

  const [playerResult] =
    await connection.query(
      `
        UPDATE carrom_match_players

        SET
          entry_status =
            'collected',

          turnover_applied =
            1,

          turnover_amount =
            ?,

          entry_transaction_id =
            ?,

          entry_balance_before =
            ?,

          entry_balance_after =
            ?

        WHERE id = ?
          AND entry_status =
              'pending'
      `,
      [
        entryAmount,

        transactionId,

        balanceBefore,

        balanceAfter,

        Number(player.id),
      ],
    );

  if (
    Number(
      playerResult.affectedRows,
    ) !== 1
  ) {
    throw createServiceError(
      "Unable to record Carrom entry debit.",
      409,
      "CARROM_ENTRY_RECORD_FAILED",
    );
  }

  user.wallet_balance =
    balanceAfter;

  return {
    alreadyCollected:
      false,

    balanceBefore,

    balanceAfter,

    transactionId,
  };
}

/* ==========================================
   Expired Matchmaking Cleanup
========================================== */

async function cleanupExpiredCarromMatches(
  roomId,
  connection,
) {
  const validRoomId =
    parsePositiveInteger(
      roomId,
      "Room ID",
    );

  const [expiredRows] =
    await connection.query(
      `
        SELECT
          id

        FROM carrom_matches

        WHERE room_id = ?
          AND match_status = 'waiting'
          AND entry_collected = 0
          AND matchmaking_expires_at <= NOW()

        ORDER BY id ASC

        FOR UPDATE
      `,
      [
        validRoomId,
      ],
    );

  if (!expiredRows.length) {
    return [];
  }

  const expiredMatchIds =
    expiredRows.map(
      (row) =>
        Number(row.id),
    );

  const placeholders =
    expiredMatchIds
      .map(() => "?")
      .join(", ");

  await connection.query(
    `
      UPDATE carrom_match_players

      SET
        player_status = 'left',

        is_connected = 0

      WHERE match_id IN (
        ${placeholders}
      )
        AND player_status IN (
          'joined',
          'ready'
        )
        AND entry_status = 'pending'
    `,
    expiredMatchIds,
  );

  await connection.query(
    `
      UPDATE carrom_matches

      SET
        match_status = 'cancelled',

        current_players = 0,

        cancelled_at = NOW(),

        cancellation_reason =
          'Matchmaking expired before enough players joined.',

        state_version =
          state_version + 1

      WHERE id IN (
        ${placeholders}
      )
        AND match_status = 'waiting'
        AND entry_collected = 0
    `,
    expiredMatchIds,
  );

  return expiredMatchIds;
}

/* ==========================================
   Existing Active Match
========================================== */

async function getExistingCarromMatchForUser(
  userId,
  connection,
) {
  const validUserId =
    parsePositiveInteger(
      userId,
      "User ID",
    );

  const [rows] =
    await connection.query(
      `
        SELECT
          cm.id,
          cm.match_code,
          cm.room_id,
          cm.player_mode,
          cm.required_players,
          cm.current_players,
          cm.entry_amount,
          cm.service_charge_percent,
          cm.gross_pool_amount,
          cm.service_charge_amount,
          cm.prize_pool_amount,
          cm.prize_per_winner,
          cm.match_status,
          cm.entry_collected,
          cm.settlement_completed,
          cm.state_version,
          cm.matchmaking_started_at,
          cm.matchmaking_expires_at,
          cm.countdown_started_at,
          cm.started_at,

          cmp.id AS match_player_id,
          cmp.seat_no,
          cmp.team_no,
          cmp.player_status,
          cmp.entry_status

        FROM carrom_match_players cmp

        INNER JOIN carrom_matches cm
          ON cm.id =
             cmp.match_id

        WHERE cmp.user_id = ?
          AND cmp.player_status IN (
            'joined',
            'ready',
            'active',
            'disconnected'
          )
          AND cm.match_status IN (
            'waiting',
            'countdown',
            'playing',
            'paused',
            'settling'
          )

          AND (
  cm.match_status <> 'waiting'
  OR cm.matchmaking_expires_at > NOW()
)

        ORDER BY cm.id DESC

        LIMIT 1

        FOR UPDATE
      `,
      [
        validUserId,
      ],
    );

  return rows[0] || null;
}

/* ==========================================
   Create Waiting Match
========================================== */

async function createWaitingCarromMatch(
  room,
  connection,
) {
  const now =
    new Date();

  const waitSeconds =
    Math.max(
      5,
      Number(
        room
          .matchmakingWaitSeconds ||
          20,
      ),
    );

  const expiresAt =
    new Date(
      now.getTime() +
      waitSeconds * 1000,
    );

  const matchCode =
    createCarromMatchCode();

  const [result] =
    await connection.query(
      `
        INSERT INTO carrom_matches (
          match_code,
          room_id,
          player_mode,
          required_players,
          current_players,
          entry_amount,
          service_charge_percent,
          gross_pool_amount,
          service_charge_amount,
          prize_pool_amount,
          prize_per_winner,
          match_status,
          entry_collected,
          settlement_completed,
          state_version,
          matchmaking_started_at,
          matchmaking_expires_at
        )
        VALUES (
          ?,
          ?,
          ?,
          ?,
          0,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          'waiting',
          0,
          0,
          1,
          ?,
          ?
        )
      `,
      [
        matchCode,

        Number(room.id),

        Number(room.playerMode),

        Number(room.playerMode),

        parseMoney(
          room.entryAmount,
        ),

        parseMoney(
          room.serviceChargePercent,
        ),

        parseMoney(
          room.grossPoolAmount,
        ),

        parseMoney(
          room.serviceChargeAmount,
        ),

        parseMoney(
          room.prizePoolAmount,
        ),

        parseMoney(
          room.prizePerWinner,
        ),

        now,

        expiresAt,
      ],
    );

  const matchId =
    Number(
      result.insertId,
    );

  if (
    !Number.isInteger(matchId) ||
    matchId < 1
  ) {
    throw createServiceError(
      "Unable to create Carrom match.",
      500,
      "CARROM_MATCH_CREATE_FAILED",
    );
  }

  const [rows] =
    await connection.query(
      `
        SELECT
          *

        FROM carrom_matches

        WHERE id = ?

        LIMIT 1

        FOR UPDATE
      `,
      [
        matchId,
      ],
    );

  return rows[0] || null;
}

/* ==========================================
   Find Waiting Match
========================================== */

async function getWaitingCarromMatch(
  roomId,
  playerMode,
  connection,
) {
  const validRoomId =
    parsePositiveInteger(
      roomId,
      "Room ID",
    );

  const validPlayerMode =
    parsePlayerMode(
      playerMode,
    );

  const [rows] =
    await connection.query(
      `
        SELECT
          *

        FROM carrom_matches

        WHERE room_id = ?
          AND player_mode = ?
          AND match_status = 'waiting'
          AND entry_collected = 0
          AND current_players <
              required_players
          AND matchmaking_expires_at >
              NOW()

        ORDER BY
          current_players DESC,
          id ASC

        LIMIT 1

        FOR UPDATE
      `,
      [
        validRoomId,

        validPlayerMode,
      ],
    );

  return rows[0] || null;
}

/* ==========================================
   Locked Match Players
========================================== */

async function getLockedCarromMatchPlayers(
  matchId,
  connection,
) {
  const validMatchId =
    parsePositiveInteger(
      matchId,
      "Match ID",
    );

  const [rows] =
    await connection.query(
      `
        SELECT
          cmp.id,
          cmp.match_id,
          cmp.user_id,
          cmp.seat_no,
          cmp.team_no,
          cmp.player_status,
          cmp.entry_status,
          cmp.entry_amount,
          cmp.turnover_applied,
          cmp.turnover_amount,
          cmp.entry_transaction_id,
          cmp.entry_balance_before,
          cmp.entry_balance_after,
          cmp.prize_amount,
          cmp.payout_transaction_id,
          cmp.refund_amount,
          cmp.refund_transaction_id,
          cmp.score,
          cmp.pocketed_coin_count,
          cmp.foul_count,
          cmp.queen_pocketed,
          cmp.queen_covered,
          cmp.is_connected,
          cmp.joined_at,
          cmp.ready_at,
          cmp.last_connected_at,
          cmp.disconnected_at,

          u.uid,
          u.full_name,
          u.username,
          u.avatar_url,
          u.wallet_balance,
          u.account_status

        FROM carrom_match_players cmp

        INNER JOIN users u
          ON u.id =
             cmp.user_id

        WHERE cmp.match_id = ?
          AND cmp.player_status IN (
            'joined',
            'ready',
            'active',
            'disconnected'
          )

        ORDER BY
          cmp.seat_no ASC,
          cmp.id ASC

        FOR UPDATE
      `,
      [
        validMatchId,
      ],
    );

  return rows;
}

/* ==========================================
   Add Player to Waiting Match
========================================== */

async function addPlayerToCarromMatch(
  match,
  user,
  connection,
) {
  const matchId =
    parsePositiveInteger(
      match.id,
      "Match ID",
    );

  const playerMode =
    parsePlayerMode(
      match.player_mode,
    );

  const players =
    await getLockedCarromMatchPlayers(
      matchId,
      connection,
    );

  const existingPlayer =
    players.find(
      (player) =>
        Number(player.user_id) ===
        Number(user.id),
    );

  if (existingPlayer) {
    return {
      player:
        existingPlayer,

      alreadyJoined:
        true,
    };
  }

  if (
    players.length >=
    playerMode
  ) {
    throw createServiceError(
      "This Carrom match is already full.",
      409,
      "CARROM_MATCH_FULL",
    );
  }

  const seatNo =
    findAvailableCarromSeat(
      playerMode,
      players.map(
        (player) =>
          player.seat_no,
      ),
    );

  const teamNo =
    resolveCarromTeamNo(
      playerMode,
      seatNo,
    );

  const [insertResult] =
    await connection.query(
      `
        INSERT INTO carrom_match_players (
          match_id,
          user_id,
          seat_no,
          team_no,
          player_status,
          entry_status,
          entry_amount,
          turnover_applied,
          turnover_amount,
          prize_amount,
          refund_amount,
          score,
          pocketed_coin_count,
          foul_count,
          queen_pocketed,
          queen_covered,
          is_connected,
          joined_at
        )
        VALUES (
          ?,
          ?,
          ?,
          ?,
          'joined',
          'pending',
          ?,
          0,
          0.00,
          0.00,
          0.00,
          0,
          0,
          0,
          0,
          0,
          0,
          NOW()
        )
      `,
      [
        matchId,

        Number(user.id),

        seatNo,

        teamNo,

        parseMoney(
          match.entry_amount,
        ),
      ],
    );

  const matchPlayerId =
    Number(
      insertResult.insertId,
    );

  if (
    !Number.isInteger(
      matchPlayerId,
    ) ||
    matchPlayerId < 1
  ) {
    throw createServiceError(
      "Unable to join Carrom match.",
      500,
      "CARROM_PLAYER_JOIN_FAILED",
    );
  }

  const [matchResult] =
    await connection.query(
      `
        UPDATE carrom_matches

        SET
          current_players =
            current_players + 1,

          state_version =
            state_version + 1

        WHERE id = ?
          AND match_status = 'waiting'
          AND current_players <
              required_players
          AND matchmaking_expires_at >
              NOW()
      `,
      [
        matchId,
      ],
    );

  if (
    Number(
      matchResult.affectedRows,
    ) !== 1
  ) {
    throw createServiceError(
      "Carrom match became unavailable while joining.",
      409,
      "CARROM_MATCH_JOIN_CONFLICT",
    );
  }

  const [playerRows] =
    await connection.query(
      `
        SELECT
          cmp.*,

          u.uid,
          u.full_name,
          u.username,
          u.avatar_url,
          u.wallet_balance,
          u.account_status

        FROM carrom_match_players cmp

        INNER JOIN users u
          ON u.id =
             cmp.user_id

        WHERE cmp.id = ?

        LIMIT 1
      `,
      [
        matchPlayerId,
      ],
    );

  return {
    player:
      playerRows[0] ||
      null,

    alreadyJoined:
      false,
  };
}

/* ==========================================
   Lock All Match Users
========================================== */

async function getLockedCarromMatchUsers(
  players,
  connection,
) {
  const userIds =
    [
      ...new Set(
        players.map(
          (player) =>
            Number(
              player.user_id,
            ),
        ),
      ),
    ]
      .filter(
        (userId) =>
          Number.isInteger(
            userId,
          ) &&
          userId > 0,
      )
      .sort(
        (
          firstUserId,
          secondUserId,
        ) =>
          firstUserId -
          secondUserId,
      );

  if (
    userIds.length !==
    players.length
  ) {
    throw createServiceError(
      "Carrom match contains an invalid or duplicate player.",
      409,
      "CARROM_INVALID_MATCH_PLAYERS",
    );
  }

  const placeholders =
    userIds
      .map(() => "?")
      .join(", ");

  const [users] =
    await connection.query(
      `
        SELECT
          id,
          uid,
          full_name,
          username,
          email,
          phone,
          avatar_url,
          role,
          account_status,
          wallet_balance,
          turnover_amount,
          turnover_required,
          is_online

        FROM users

        WHERE id IN (
          ${placeholders}
        )

        ORDER BY id ASC

        FOR UPDATE
      `,
      userIds,
    );

  if (
    users.length !==
    userIds.length
  ) {
    throw createServiceError(
      "One or more Carrom player accounts were not found.",
      404,
      "CARROM_MATCH_USER_NOT_FOUND",
    );
  }

  return users;
}

/* ==========================================
   Finalize Full Match Entry
========================================== */

async function finalizeFullCarromMatch(
  matchId,
  connection,
) {
  const validMatchId =
    parsePositiveInteger(
      matchId,
      "Match ID",
    );

  const [matchRows] =
    await connection.query(
      `
        SELECT
          *

        FROM carrom_matches

        WHERE id = ?

        LIMIT 1

        FOR UPDATE
      `,
      [
        validMatchId,
      ],
    );

  const match =
    matchRows[0] || null;

  if (!match) {
    throw createServiceError(
      "Carrom match was not found.",
      404,
      "CARROM_MATCH_NOT_FOUND",
    );
  }

  if (
    Number(
      match.entry_collected,
    ) === 1
  ) {
    return match;
  }

  if (
    String(
      match.match_status,
    ) !== "waiting"
  ) {
    throw createServiceError(
      "Carrom match is not waiting for entry collection.",
      409,
      "CARROM_MATCH_NOT_WAITING",
    );
  }

  if (
    new Date(
      match
        .matchmaking_expires_at,
    ).getTime() <=
    Date.now()
  ) {
    throw createServiceError(
      "Carrom matchmaking time has expired.",
      409,
      "CARROM_MATCHMAKING_EXPIRED",
    );
  }

  const requiredPlayers =
    Number(
      match.required_players,
    );

  const players =
    await getLockedCarromMatchPlayers(
      validMatchId,
      connection,
    );

  if (
    players.length !==
      requiredPlayers ||
    Number(
      match.current_players,
    ) !==
      requiredPlayers
  ) {
    throw createServiceError(
      "Carrom match does not have enough players.",
      409,
      "CARROM_PLAYERS_NOT_READY",
    );
  }

  const users =
    await getLockedCarromMatchUsers(
      players,
      connection,
    );

  const usersById =
    new Map(
      users.map(
        (user) => [
          Number(user.id),
          user,
        ],
      ),
    );

  /*
   * সবার balance প্রথমে validate হবে।
   * একজনের balance কম হলে কারও wallet debit হবে না।
   */
  for (const player of players) {
    const user =
      usersById.get(
        Number(
          player.user_id,
        ),
      );

    validateUserForCarrom(
      user,
      player.entry_amount,
    );
  }

  const debitResults = [];

  for (const player of players) {
    const user =
      usersById.get(
        Number(
          player.user_id,
        ),
      );

    const debitResult =
      await debitCarromPlayerEntry(
        match,
        player,
        user,
        connection,
      );

    debitResults.push({
      matchPlayerId:
        Number(player.id),

      userId:
        Number(player.user_id),

      ...debitResult,
    });
  }

  const firstPlayer =
    players
      .slice()
      .sort(
        (
          firstPlayerItem,
          secondPlayerItem,
        ) =>
          Number(
            firstPlayerItem
              .seat_no,
          ) -
          Number(
            secondPlayerItem
              .seat_no,
          ),
      )[0];

  if (!firstPlayer) {
    throw createServiceError(
      "Carrom first turn player was not found.",
      409,
      "CARROM_FIRST_PLAYER_NOT_FOUND",
    );
  }

  const boardState =
    createInitialCarromBoardState();

  const boardHash =
    createCarromBoardHash(
      boardState,
    );

  const [playerStatusResult] =
    await connection.query(
      `
        UPDATE carrom_match_players

        SET
          player_status =
            'active',

          ready_at =
            COALESCE(
              ready_at,
              NOW()
            )

        WHERE match_id = ?
          AND player_status IN (
            'joined',
            'ready'
          )
          AND entry_status =
              'collected'
      `,
      [
        validMatchId,
      ],
    );

  if (
    Number(
      playerStatusResult.affectedRows,
    ) !==
    requiredPlayers
  ) {
    throw createServiceError(
      "Unable to activate all Carrom players.",
      409,
      "CARROM_PLAYER_ACTIVATION_FAILED",
    );
  }

  await connection.query(
    `
      INSERT INTO carrom_game_states (
        match_id,
        current_turn_player_id,
        turn_number,
        shot_number,
        game_phase,
        board_state,
        state_hash,
        queen_status,
        queen_player_id,
        pending_cover_player_id,
        shot_in_progress,
        turn_started_at,
        turn_expires_at,
        last_action_at,
        state_version
      )
      VALUES (
        ?,
        ?,
        1,
        0,
        'setup',
        ?,
        ?,
        'on_board',
        NULL,
        NULL,
        0,
        NULL,
        NULL,
        NOW(),
        1
      )
    `,
    [
      validMatchId,

      Number(
        firstPlayer.id,
      ),

      JSON.stringify(
        boardState,
      ),

      boardHash,
    ],
  );

  const [matchUpdateResult] =
    await connection.query(
      `
        UPDATE carrom_matches

        SET
          match_status =
            'countdown',

          entry_collected =
            1,

          countdown_started_at =
            NOW(),

          state_version =
            state_version + 1

        WHERE id = ?
          AND match_status =
              'waiting'
          AND entry_collected =
              0
          AND current_players =
              required_players
      `,
      [
        validMatchId,
      ],
    );

  if (
    Number(
      matchUpdateResult.affectedRows,
    ) !== 1
  ) {
    throw createServiceError(
      "Unable to start Carrom match countdown.",
      409,
      "CARROM_MATCH_START_FAILED",
    );
  }

  const [updatedRows] =
    await connection.query(
      `
        SELECT
          *

        FROM carrom_matches

        WHERE id = ?

        LIMIT 1
      `,
      [
        validMatchId,
      ],
    );

  return {
    ...updatedRows[0],

    debitResults,
  };
}

/* ==========================================
   JSON Helper
========================================== */

function parseCarromJson(
  value,
  fallback = null,
) {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  if (
    typeof value === "object"
  ) {
    return value;
  }

  try {
    return JSON.parse(
      String(value),
    );
  } catch (_error) {
    return fallback;
  }
}

/* ==========================================
   Public Match State
========================================== */

async function getCarromMatchState(
  matchId,
  requestingUserId = null,
  connection = pool,
) {
  const validMatchId =
    parsePositiveInteger(
      matchId,
      "Match ID",
    );

  const [matchRows] =
    await connection.query(
      `
        SELECT
          cm.id,
          cm.match_code,
          cm.room_id,
          cm.player_mode,
          cm.required_players,
          cm.current_players,
          cm.entry_amount,
          cm.service_charge_percent,
          cm.gross_pool_amount,
          cm.service_charge_amount,
          cm.prize_pool_amount,
          cm.prize_per_winner,
          cm.match_status,
          cm.entry_collected,
          cm.settlement_completed,
          cm.winning_team_no,
          cm.winning_reason,
          cm.state_version,
          cm.matchmaking_started_at,
          cm.matchmaking_expires_at,
          cm.countdown_started_at,
          cm.started_at,
          cm.ended_at,
          cm.cancelled_at,
          cm.cancellation_reason,
          cm.created_at,
          cm.updated_at,

          cr.room_code,
          cr.room_name,
          cr.matchmaking_wait_seconds,
          cr.turn_seconds,
          cr.room_status

        FROM carrom_matches cm

        INNER JOIN carrom_rooms cr
          ON cr.id =
             cm.room_id

        WHERE cm.id = ?

        LIMIT 1
      `,
      [
        validMatchId,
      ],
    );

  const match =
    matchRows[0] || null;

  if (!match) {
    throw createServiceError(
      "Carrom match was not found.",
      404,
      "CARROM_MATCH_NOT_FOUND",
    );
  }

  const [playerRows] =
    await connection.query(
      `
        SELECT
          cmp.id,
          cmp.match_id,
          cmp.user_id,
          cmp.seat_no,
          cmp.team_no,
          cmp.player_status,
          cmp.entry_status,
          cmp.entry_amount,
          cmp.prize_amount,
          cmp.refund_amount,
          cmp.score,
          cmp.pocketed_coin_count,
          cmp.foul_count,
          cmp.queen_pocketed,
          cmp.queen_covered,
          cmp.is_connected,
          cmp.joined_at,
          cmp.ready_at,
          cmp.last_connected_at,
          cmp.disconnected_at,
          cmp.forfeited_at,
          cmp.resulted_at,

          u.uid,
          u.full_name,
          u.username,
          u.avatar_url,
          u.wallet_balance

        FROM carrom_match_players cmp

        INNER JOIN users u
          ON u.id =
             cmp.user_id

        WHERE cmp.match_id = ?
          AND cmp.player_status <>
              'left'

        ORDER BY
          cmp.seat_no ASC,
          cmp.id ASC
      `,
      [
        validMatchId,
      ],
    );

  if (
    requestingUserId !== null
  ) {
    const validRequestingUserId =
      parsePositiveInteger(
        requestingUserId,
        "User ID",
      );

    const isMatchPlayer =
      playerRows.some(
        (player) =>
          Number(
            player.user_id,
          ) ===
          validRequestingUserId,
      );

    if (!isMatchPlayer) {
      throw createServiceError(
        "You are not a player of this Carrom match.",
        403,
        "CARROM_MATCH_ACCESS_DENIED",
      );
    }
  }

  const [stateRows] =
    await connection.query(
      `
        SELECT
          id,
          match_id,
          current_turn_player_id,
          turn_number,
          shot_number,
          game_phase,
          board_state,
          state_hash,
          queen_status,
          queen_player_id,
          pending_cover_player_id,
          shot_in_progress,
          turn_started_at,
          turn_expires_at,
          last_action_at,
          paused_at,
          state_version,
          created_at,
          updated_at

        FROM carrom_game_states

        WHERE match_id = ?

        LIMIT 1
      `,
      [
        validMatchId,
      ],
    );

  const gameStateRow =
    stateRows[0] || null;

  const expiresAtTime =
    match
      .matchmaking_expires_at
      ? new Date(
          match
            .matchmaking_expires_at,
        ).getTime()
      : 0;

  const remainingMilliseconds =
    Math.max(
      0,
      expiresAtTime -
        Date.now(),
    );

  const players =
    playerRows.map(
      (player) => ({
        id:
          Number(player.id),

        matchId:
          Number(
            player.match_id,
          ),

        userId:
          Number(
            player.user_id,
          ),

        uid:
          player.uid,

        name:
          player.full_name ||
          player.username ||
          player.uid,

        username:
          player.username,

        avatarUrl:
          player.avatar_url ||
          null,

        seatNo:
          Number(
            player.seat_no,
          ),

        teamNo:
          Number(
            player.team_no,
          ),

        status:
          player.player_status,

        entryStatus:
          player.entry_status,

        entryAmount:
          parseMoney(
            player.entry_amount,
          ),

        walletBalance:
          parseMoney(
            player.wallet_balance,
          ),

        prizeAmount:
          parseMoney(
            player.prize_amount,
          ),

        refundAmount:
          parseMoney(
            player.refund_amount,
          ),

        score:
          Number(
            player.score || 0,
          ),

        pocketedCoinCount:
          Number(
            player
              .pocketed_coin_count ||
            0,
          ),

        foulCount:
          Number(
            player.foul_count ||
            0,
          ),

        queenPocketed:
          Boolean(
            Number(
              player
                .queen_pocketed,
            ),
          ),

        queenCovered:
          Boolean(
            Number(
              player
                .queen_covered,
            ),
          ),

        isConnected:
          Boolean(
            Number(
              player
                .is_connected,
            ),
          ),

        joinedAt:
          player.joined_at ||
          null,

        readyAt:
          player.ready_at ||
          null,

        lastConnectedAt:
          player
            .last_connected_at ||
          null,

        disconnectedAt:
          player
            .disconnected_at ||
          null,

        forfeitedAt:
          player.forfeited_at ||
          null,

        resultedAt:
          player.resulted_at ||
          null,
      }),
    );

  const currentPlayer =
    gameStateRow
      ? players.find(
          (player) =>
            Number(player.id) ===
            Number(
              gameStateRow
                .current_turn_player_id,
            ),
        ) || null
      : null;

  return {
    match: {
      id:
        Number(match.id),

      matchCode:
        match.match_code,

      roomId:
        Number(
          match.room_id,
        ),

      roomCode:
        match.room_code,

      roomName:
        match.room_name,

      playerMode:
        Number(
          match.player_mode,
        ),

      requiredPlayers:
        Number(
          match.required_players,
        ),

      currentPlayers:
        Number(
          match.current_players,
        ),

      entryAmount:
        parseMoney(
          match.entry_amount,
        ),

      serviceChargePercent:
        parseMoney(
          match
            .service_charge_percent,
        ),

      grossPoolAmount:
        parseMoney(
          match
            .gross_pool_amount,
        ),

      serviceChargeAmount:
        parseMoney(
          match
            .service_charge_amount,
        ),

      prizePoolAmount:
        parseMoney(
          match
            .prize_pool_amount,
        ),

      prizePerWinner:
        parseMoney(
          match
            .prize_per_winner,
        ),

      status:
        match.match_status,

      entryCollected:
        Boolean(
          Number(
            match.entry_collected,
          ),
        ),

      settlementCompleted:
        Boolean(
          Number(
            match
              .settlement_completed,
          ),
        ),

      winningTeamNo:
        match.winning_team_no ===
        null
          ? null
          : Number(
              match
                .winning_team_no,
            ),

      winningReason:
        match.winning_reason ||
        null,

      stateVersion:
        Number(
          match.state_version,
        ),

      matchmakingStartedAt:
        match
          .matchmaking_started_at ||
        null,

      matchmakingExpiresAt:
        match
          .matchmaking_expires_at ||
        null,

      countdownStartedAt:
        match
          .countdown_started_at ||
        null,

      startedAt:
        match.started_at ||
        null,

      endedAt:
        match.ended_at ||
        null,

      cancelledAt:
        match.cancelled_at ||
        null,

      cancellationReason:
        match
          .cancellation_reason ||
        null,
    },

    players,

    currentPlayer,

    gameState:
      gameStateRow
        ? {
            id:
              Number(
                gameStateRow.id,
              ),

            currentTurnPlayerId:
              gameStateRow
                .current_turn_player_id ===
              null
                ? null
                : Number(
                    gameStateRow
                      .current_turn_player_id,
                  ),

            turnNumber:
              Number(
                gameStateRow
                  .turn_number,
              ),

            shotNumber:
              Number(
                gameStateRow
                  .shot_number,
              ),

            phase:
              gameStateRow
                .game_phase,

            boardState:
              parseCarromJson(
                gameStateRow
                  .board_state,
                null,
              ),

            stateHash:
              gameStateRow
                .state_hash ||
              null,

            queenStatus:
              gameStateRow
                .queen_status,

            queenPlayerId:
              gameStateRow
                .queen_player_id ===
              null
                ? null
                : Number(
                    gameStateRow
                      .queen_player_id,
                  ),

            pendingCoverPlayerId:
              gameStateRow
                .pending_cover_player_id ===
              null
                ? null
                : Number(
                    gameStateRow
                      .pending_cover_player_id,
                  ),

            shotInProgress:
              Boolean(
                Number(
                  gameStateRow
                    .shot_in_progress,
                ),
              ),

            turnStartedAt:
              gameStateRow
                .turn_started_at ||
              null,

            turnExpiresAt:
              gameStateRow
                .turn_expires_at ||
              null,

            lastActionAt:
              gameStateRow
                .last_action_at ||
              null,

            stateVersion:
              Number(
                gameStateRow
                  .state_version,
              ),
          }
        : null,

    matchmaking: {
      waiting:
        match.match_status ===
        "waiting",

      waitSeconds:
        Number(
          match
            .matchmaking_wait_seconds ||
          20,
        ),

      remainingSeconds:
        Math.ceil(
          remainingMilliseconds /
          1000,
        ),

      joinedPlayers:
        players.length,

      requiredPlayers:
        Number(
          match.required_players,
        ),
    },
  };
}

/* ==========================================
   Join Carrom Matchmaking
========================================== */

async function joinCarromMatchmaking(
  userId,
  roomId,
) {
  const validUserId =
    parsePositiveInteger(
      userId,
      "User ID",
    );

  const validRoomId =
    parsePositiveInteger(
      roomId,
      "Room ID",
    );

  const connection =
    await pool.getConnection();

  let transactionStarted =
    false;

  try {
    await connection
      .beginTransaction();

    transactionStarted = true;

    /*
     * Room row প্রথমে lock হচ্ছে।
     * একই room-এর concurrent join request
     * ধারাবাহিকভাবে process হবে।
     */
    const room =
      await getActiveRoomById(
        validRoomId,
        connection,
        {
          forUpdate:
            true,
        },
      );

    await cleanupExpiredCarromMatches(
      room.id,
      connection,
    );

    const user =
      await getLockedCarromUser(
        validUserId,
        connection,
      );

    validateUserForCarrom(
      user,
      room.entryAmount,
    );

    const existingMatch =
      await getExistingCarromMatchForUser(
        validUserId,
        connection,
      );

    if (existingMatch) {
      await connection.commit();

      transactionStarted =
        false;

      const existingState =
        await getCarromMatchState(
          existingMatch.id,
          validUserId,
          connection,
        );

      const existingPlayer =
        existingState.players.find(
          (player) =>
            Number(
              player.userId,
            ) ===
            validUserId,
        ) || null;

      return {
        ...existingState,

        joinedPlayer:
          existingPlayer,

        matchmaking: {
          ...existingState
            .matchmaking,

          alreadyJoined:
            true,

          newMatchCreated:
            false,

          matchStarted:
            [
              "countdown",
              "playing",
              "paused",
              "settling",
            ].includes(
              existingState
                .match.status,
            ),
        },
      };
    }

    let match =
      await getWaitingCarromMatch(
        room.id,
        room.playerMode,
        connection,
      );

    let newMatchCreated =
      false;

    if (!match) {
      match =
        await createWaitingCarromMatch(
          room,
          connection,
        );

      newMatchCreated =
        true;
    }

    const joinResult =
      await addPlayerToCarromMatch(
        match,
        user,
        connection,
      );

    const [updatedMatchRows] =
      await connection.query(
        `
          SELECT
            *

          FROM carrom_matches

          WHERE id = ?

          LIMIT 1

          FOR UPDATE
        `,
        [
          Number(match.id),
        ],
      );

    let updatedMatch =
      updatedMatchRows[0] ||
      null;

    if (!updatedMatch) {
      throw createServiceError(
        "Carrom match disappeared while joining.",
        409,
        "CARROM_MATCH_JOIN_FAILED",
      );
    }

    let matchStarted =
      false;

    if (
      Number(
        updatedMatch
          .current_players,
      ) ===
      Number(
        updatedMatch
          .required_players,
      )
    ) {
      updatedMatch =
        await finalizeFullCarromMatch(
          updatedMatch.id,
          connection,
        );

      matchStarted =
        true;
    }

    await connection.commit();

    transactionStarted =
      false;

    const publicState =
      await getCarromMatchState(
        updatedMatch.id,
        validUserId,
        connection,
      );

    const joinedPlayer =
      publicState.players.find(
        (player) =>
          Number(
            player.userId,
          ) ===
          validUserId,
      ) || null;

    return {
      ...publicState,

      joinedPlayer,

      matchmaking: {
        ...publicState
          .matchmaking,

        alreadyJoined:
          joinResult
            .alreadyJoined,

        newMatchCreated,

        matchStarted,
      },
    };
  } catch (error) {
    if (transactionStarted) {
      await connection
        .rollback();
    }

    if (
      error.code ===
      "ER_DUP_ENTRY"
    ) {
      throw createServiceError(
        "You are already joining this Carrom match.",
        409,
        "CARROM_DUPLICATE_JOIN",
      );
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
  ALLOWED_PLAYER_MODES,

  createServiceError,

  parsePositiveInteger,

  parsePlayerMode,

  parseMoney,

  calculateRoomPrize,

  getAvailableRooms,

  getActiveRoomById,
  getCarromMatchState,
  joinCarromMatchmaking,
};