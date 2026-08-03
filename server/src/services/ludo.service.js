"use strict";

/* ==========================================
   PMS ADDA LUDO SERVICE
   SECTION 1: CORE + MATCHMAKING
========================================== */

const crypto = require("crypto");

const { pool } = require("../config/database");

const {
  FINISHED_STEP,
  PLAYER_COLORS,
  calculatePawnDestination,
  getPawnPosition,
  isSafeCoordinate,
} = require("../constants/ludo.constants");

/* ==========================================
   Configuration
========================================== */

const TWO_PLAYER_WAIT_SECONDS = 10;
const FOUR_PLAYER_WAIT_SECONDS = 20;

/*
 * পুরোনো socket fallback-এর জন্য সর্বোচ্চ
 * matchmaking সময় রাখা হচ্ছে।
 */
const MATCHMAKING_WAIT_SECONDS = FOUR_PLAYER_WAIT_SECONDS;

const TURN_DURATION_SECONDS = 10;

const ALLOWED_ENTRY_AMOUNTS = Object.freeze([50, 100, 200, 250, 500, 1000]);

const ALLOWED_PLAYER_MODES = Object.freeze([2, 4]);

/*
 * 2-player:
 *
 * প্রথম Real Player:
 * Seat 4 = Blue
 *
 * দ্বিতীয় Real Player অথবা Bot:
 * Seat 2 = Green
 *
 * Blue এবং Green board-এর বিপরীত পাশে।
 */
const SEAT_PLAN_BY_MODE = Object.freeze({
  2: Object.freeze([4, 2]),

  4: Object.freeze([1, 2, 3, 4]),
});

function getMatchmakingWaitSeconds(playerMode) {
  return Number(playerMode) === 4
    ? FOUR_PLAYER_WAIT_SECONDS
    : TWO_PLAYER_WAIT_SECONDS;
}
const MATCH_STATUS = Object.freeze({
  WAITING: "waiting",
  STARTING: "starting",
  PLAYING: "playing",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
});

const PLAYER_STATUS = Object.freeze({
  WAITING: "waiting",
  READY: "ready",
  PLAYING: "playing",
  FINISHED: "finished",
  LEFT: "left",
  DISCONNECTED: "disconnected",
});

/* ==========================================
   Basic Helpers
========================================== */

function parsePositiveInteger(value) {
  const number = Number(value);

  if (!Number.isInteger(number) || number <= 0) {
    return null;
  }

  return number;
}

function createServiceError(message, statusCode = 500) {
  const error = new Error(message);

  error.statusCode = statusCode;
  error.status = statusCode;

  return error;
}

function createMatchCode() {
  const random = crypto.randomInt(100000, 1000000);

  return `LUDO_${Date.now()}_${random}`;
}

function createWalletTransactionId() {
  const random = crypto.randomInt(100000, 1000000);

  return `LTX${Date.now()}${random}`;
}

async function validateEntryAmount(value, connection = pool) {
  const amount = parsePositiveInteger(value);

  if (!amount) {
    throw createServiceError("Please select a valid Ludo entry amount.", 400);
  }

  const [rows] = await connection.query(
    `
        SELECT id
        FROM game_rooms
        WHERE game_type = 'ludo'
          AND boot_amount = ?
          AND status IN (
            'waiting',
            'running'
          )
        LIMIT 1
      `,
    [amount],
  );

  if (!rows[0]) {
    throw createServiceError("This Ludo room is currently unavailable.", 409);
  }

  return amount;
}

async function getAvailableRooms() {
  const [rows] = await pool.query(
    `
        SELECT
          id,
          room_code,
          room_name,
          max_players,
          boot_amount,
          status

        FROM game_rooms

        WHERE game_type = 'ludo'
          AND status IN (
            'waiting',
            'running'
          )

        ORDER BY
          boot_amount ASC,
          id ASC
      `,
  );

  return rows.map((room) => ({
    id: Number(room.id),

    roomCode: room.room_code,

    roomName: room.room_name,

    maxPlayers: Number(room.max_players || 4),

    entryAmount: Number(room.boot_amount || 0),

    status: room.status,
  }));
}

function validatePlayerMode(value) {
  const mode = parsePositiveInteger(value);

  if (!mode || !ALLOWED_PLAYER_MODES.includes(mode)) {
    throw createServiceError("Ludo player mode must be 2 or 4.", 400);
  }

  return mode;
}

function getPlayerColor(seatNo) {
  const index = Number(seatNo) - 1;

  return PLAYER_COLORS[index] || null;
}

function calculateMatchFinance(
  entryAmount,
  finalPlayerMode,
  configuredServiceCharge = 10,
) {
  const amount = Number(entryAmount);

  const playerMode = Number(finalPlayerMode);

  const totalPot = amount * playerMode;

  const parsedServiceCharge = Number(configuredServiceCharge);

  const serviceChargePercent =
    Number.isFinite(parsedServiceCharge) &&
    parsedServiceCharge >= 0 &&
    parsedServiceCharge <= 20
      ? Number(parsedServiceCharge.toFixed(2))
      : 10;

  const serviceChargeAmount = Number(
    (totalPot * (serviceChargePercent / 100)).toFixed(2),
  );

  const distributableAmount = Number(
    (totalPot - serviceChargeAmount).toFixed(2),
  );

  let firstPrize = distributableAmount;

  let secondPrize = 0;

  if (playerMode === 4) {
    secondPrize = Number((amount * 0.5).toFixed(2));

    firstPrize = Number((distributableAmount - secondPrize).toFixed(2));

    if (firstPrize <= secondPrize) {
      throw createServiceError(
        "Entry amount is too low for the configured prize structure.",
        500,
      );
    }
  }

  return {
    totalPot,
    serviceChargePercent,
    serviceChargeAmount,
    distributableAmount,
    firstPrize,
    secondPrize,
  };
}

async function getConfiguredLudoServiceCharge(connection) {
  const [rows] = await connection.query(
    `
    SELECT
      service_charge
    FROM game_settings
    WHERE game_type = 'ludo'
    LIMIT 1
  `,
  );

  const configuredCharge = Number(rows[0]?.service_charge);

  return Number.isFinite(configuredCharge) &&
    configuredCharge >= 0 &&
    configuredCharge <= 20
    ? Number(configuredCharge.toFixed(2))
    : 10;
}

/* ==========================================
   User Validation
========================================== */

async function getLockedUser(userId, connection) {
  const [rows] = await connection.query(
    `
        SELECT
          id,
          uid,
          full_name,
          username,
          role,
          wallet_balance,
          turnover_amount,
          account_status,
          is_online
        FROM users
        WHERE id = ?
        LIMIT 1
        FOR UPDATE
      `,
    [userId],
  );

  return rows[0] || null;
}

function validateUserForLudo(user, entryAmount) {
  if (!user) {
    throw createServiceError("User not found.", 404);
  }

  if (String(user.account_status || "").toLowerCase() !== "active") {
    throw createServiceError("Your account is not active.", 403);
  }

  if (String(user.role || "").toLowerCase() !== "user") {
    throw createServiceError("Only users can join Ludo matches.", 403);
  }

  if (Number(user.wallet_balance) < Number(entryAmount)) {
    throw createServiceError(`Minimum ৳${entryAmount} balance required.`, 400);
  }
}

/* ==========================================
   Existing Match
========================================== */

async function findExistingActiveMatch(userId, connection) {
  const [rows] = await connection.query(
    `
        SELECT
          lm.id,
          lm.match_code,
          lm.entry_amount,
          lm.requested_player_mode,
          lm.player_mode,
          lm.current_players,
          lm.match_status,
          lm.matchmaking_expires_at,

          lmp.id AS match_player_id,
          lmp.seat_no,
          lmp.player_color,
          lmp.player_status

        FROM ludo_match_players lmp

        INNER JOIN ludo_matches lm
          ON lm.id = lmp.match_id

        WHERE lmp.user_id = ?
          AND lm.match_status IN (
            'waiting',
            'starting',
            'playing'
          )
          AND lmp.player_status NOT IN (
            'left',
            'finished'
          )

        ORDER BY lmp.id DESC

        LIMIT 1
        FOR UPDATE
      `,
    [userId],
  );

  return rows[0] || null;
}

/* ==========================================
   Waiting Queue
========================================== */

async function findWaitingMatch(entryAmount, requestedPlayerMode, connection) {
  const [rows] = await connection.query(
    `
        SELECT
          id,
          match_code,
          entry_amount,
          requested_player_mode,
          player_mode,
          current_players,
          service_charge_percent,
          match_status,
          matchmaking_started_at,
          matchmaking_expires_at,
          entry_collected
        FROM ludo_matches
        WHERE entry_amount = ?
          AND requested_player_mode = ?
          AND match_status = 'waiting'
          AND entry_collected = 0
          AND current_players <
              requested_player_mode
          AND matchmaking_expires_at >
              NOW()
        ORDER BY
          current_players DESC,
          id ASC
        LIMIT 1
        FOR UPDATE
      `,
    [entryAmount, requestedPlayerMode],
  );

  return rows[0] || null;
}

async function createWaitingMatch(
  entryAmount,
  requestedPlayerMode,
  connection,
) {
  const matchCode = createMatchCode();

  const serviceChargePercent = await getConfiguredLudoServiceCharge(connection);

  const finance = calculateMatchFinance(
    entryAmount,
    requestedPlayerMode,
    serviceChargePercent,
  );

  const waitSeconds = getMatchmakingWaitSeconds(requestedPlayerMode);
  const [result] = await connection.query(
    `
        INSERT INTO ludo_matches (
          match_code,
          entry_amount,
          requested_player_mode,
          player_mode,
          current_players,
          total_pot,
          service_charge_percent,
          service_charge_amount,
          distributable_amount,
          first_prize,
          second_prize,
          match_status,
          matchmaking_started_at,
          matchmaking_expires_at,
          entry_collected,
          settlement_completed
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
          NOW(),
          DATE_ADD(
            NOW(),
            INTERVAL ${waitSeconds} SECOND
          ),
          0,
          0
        )
      `,
    [
      matchCode,
      entryAmount,
      requestedPlayerMode,
      requestedPlayerMode,
      finance.totalPot,
      finance.serviceChargePercent,
      finance.serviceChargeAmount,
      finance.distributableAmount,
      finance.firstPrize,
      finance.secondPrize,
    ],
  );

  return {
    id: Number(result.insertId),
    matchCode,
    entryAmount,
    requestedPlayerMode,

    service_charge_percent: serviceChargePercent,
  };
}

/* ==========================================
   Seat Management
========================================== */

async function getUsedSeats(matchId, connection) {
  const [rows] = await connection.query(
    `
        SELECT seat_no
        FROM ludo_match_players
        WHERE match_id = ?
          AND player_status != 'left'
        ORDER BY seat_no ASC
        FOR UPDATE
      `,
    [matchId],
  );

  return rows.map((row) => Number(row.seat_no));
}

async function findAvailableSeat(matchId, playerMode, connection) {
  const validPlayerMode = validatePlayerMode(playerMode);

  const seatPlan = SEAT_PLAN_BY_MODE[validPlayerMode];

  const usedSeats = await getUsedSeats(matchId, connection);

  for (const seatNo of seatPlan) {
    if (!usedSeats.includes(seatNo)) {
      return seatNo;
    }
  }

  return null;
}

/* ==========================================
   Real Player Insert
========================================== */

async function insertRealMatchPlayer(
  matchId,
  userId,
  seatNo,
  playerColor,
  entryAmount,
  connection,
) {
  const [result] = await connection.query(
    `
        INSERT INTO ludo_match_players (
          match_id,
          user_id,
          bot_id,
          is_bot,
          bot_level,
          bot_name,
          bot_avatar,
          seat_no,
          player_color,
          player_status,
          finish_position,
          entry_amount,
          entry_debited,
          prize_amount,
          prize_credited
        )
        VALUES (
          ?,
          ?,
          NULL,
          0,
          NULL,
          NULL,
          NULL,
          ?,
          ?,
          'waiting',
          NULL,
          ?,
          0,
          0.00,
          0
        )
      `,
    [matchId, userId, seatNo, playerColor, entryAmount],
  );

  return Number(result.insertId);
}

/* ==========================================
   Bot Selection and Insert
========================================== */

async function selectAvailableBot(matchId, connection) {
  const [rows] = await connection.query(
    `
        SELECT
          lb.id,
          lb.bot_code,
          lb.bot_name,
          lb.avatar_url,
          lb.bot_level
        FROM ludo_bots lb
        WHERE lb.status = 'active'
          AND NOT EXISTS (
            SELECT 1
            FROM ludo_match_players lmp
            WHERE lmp.match_id = ?
              AND lmp.bot_id = lb.id
              AND lmp.player_status !=
                  'left'
          )
        ORDER BY RAND()
        LIMIT 1
        FOR UPDATE
      `,
    [matchId],
  );

  const bot = rows[0] || null;

  if (!bot) {
    throw createServiceError("No active Ludo bot is available.", 409);
  }

  return {
    id: Number(bot.id),
    code: bot.bot_code,
    name: bot.bot_name,
    avatarUrl: bot.avatar_url || null,
    level: bot.bot_level || "smart",
  };
}

async function insertBotMatchPlayer(matchId, entryAmount, seatNo, connection) {
  const bot = await selectAvailableBot(matchId, connection);

  const playerColor = getPlayerColor(seatNo);

  if (!playerColor) {
    throw createServiceError("Unable to assign bot color.", 500);
  }

  const [result] = await connection.query(
    `
        INSERT INTO ludo_match_players (
          match_id,
          user_id,
          bot_id,
          is_bot,
          bot_level,
          bot_name,
          bot_avatar,
          seat_no,
          player_color,
          player_status,
          finish_position,
          entry_amount,
          entry_debited,
          prize_amount,
          prize_credited
        )
        VALUES (
          ?,
          NULL,
          ?,
          1,
          ?,
          ?,
          ?,
          ?,
          ?,
          'waiting',
          NULL,
          ?,
          0,
          0.00,
          0
        )
      `,
    [
      matchId,
      bot.id,
      bot.level,
      bot.name,
      bot.avatarUrl,
      seatNo,
      playerColor,
      entryAmount,
    ],
  );

  return {
    matchPlayerId: Number(result.insertId),

    botId: bot.id,

    name: bot.name,

    color: playerColor,

    seatNo,
  };
}

/* ==========================================
   Player Count
========================================== */

async function updateCurrentPlayers(matchId, connection) {
  const [rows] = await connection.query(
    `
        SELECT
          COUNT(*) AS total
        FROM ludo_match_players
        WHERE match_id = ?
          AND player_status != 'left'
      `,
    [matchId],
  );

  const currentPlayers = Number(rows[0]?.total || 0);

  await connection.query(
    `
      UPDATE ludo_matches
      SET current_players = ?
      WHERE id = ?
    `,
    [currentPlayers, matchId],
  );

  return currentPlayers;
}

async function countRealPlayers(matchId, connection) {
  const [rows] = await connection.query(
    `
        SELECT
          COUNT(*) AS total
        FROM ludo_match_players
        WHERE match_id = ?
          AND is_bot = 0
          AND player_status != 'left'
      `,
    [matchId],
  );

  return Number(rows[0]?.total || 0);
}

/* ==========================================
   Apply Final Player Mode
========================================== */

async function applyFinalPlayerMode(
  matchId,
  entryAmount,
  finalPlayerMode,
  serviceChargePercent,
  connection,
) {
  const finance = calculateMatchFinance(
    entryAmount,
    finalPlayerMode,
    serviceChargePercent,
  );

  await connection.query(
    `
      UPDATE ludo_matches
      SET
        player_mode = ?,
        total_pot = ?,
        service_charge_percent = ?,
        service_charge_amount = ?,
        distributable_amount = ?,
        first_prize = ?,
        second_prize = ?
      WHERE id = ?
        AND match_status = 'waiting'
        AND entry_collected = 0
    `,
    [
      finalPlayerMode,
      finance.totalPot,
      finance.serviceChargePercent,
      finance.serviceChargeAmount,
      finance.distributableAmount,
      finance.firstPrize,
      finance.secondPrize,
      matchId,
    ],
  );

  return finance;
}

/* ==========================================
   Timeout Finalizer

   Rules:
   1 Real -> 1 Bot -> 2 players
   2 Real -> 2 players
   3 Real -> 1 Bot -> 4 players
   4 Real -> 4 players
========================================== */

function resolveFinalPlayerMode(realPlayerCount) {
  const totalRealPlayers = Number(realPlayerCount);

  if (
    totalRealPlayers === 1 ||
    totalRealPlayers === 2
  ) {
    return 2;
  }

  if (
    totalRealPlayers === 3 ||
    totalRealPlayers === 4
  ) {
    return 4;
  }

  throw createServiceError(
    "Invalid number of real Ludo players.",
    409,
  );
}

async function normalizeTwoPlayerRealSeats(
  matchId,
  connection,
) {
  const [realPlayers] = await connection.query(
    `
      SELECT
        id,
        seat_no,
        player_color
      FROM ludo_match_players
      WHERE match_id = ?
        AND is_bot = 0
        AND player_status != 'left'
      ORDER BY id ASC
      FOR UPDATE
    `,
    [matchId],
  );

  if (
    realPlayers.length < 1 ||
    realPlayers.length > 2
  ) {
    throw createServiceError(
      "Two-player Ludo seat assignment is inconsistent.",
      409,
    );
  }

  /*
   * 2-player match-এর বিপরীত seat:
   *
   * Seat 4 = Blue
   * Seat 2 = Green
   */
  const desiredSeats = [4, 2];

  const assignments = [];

  const assignedPlayerIds = new Set();

  const assignedSeats = new Set();

  /*
   * কোনো player ইতোমধ্যে Seat 4 অথবা
   * Seat 2-তে থাকলে সেই বিপরীত seat
   * অপরিবর্তিত রাখা হবে।
   */
  for (const desiredSeat of desiredSeats) {
    const existingPlayer = realPlayers.find(
      (player) =>
        Number(player.seat_no) === desiredSeat &&
        !assignedPlayerIds.has(Number(player.id)),
    );

    if (!existingPlayer) {
      continue;
    }

    assignments.push({
      playerId: Number(existingPlayer.id),
      currentSeat: Number(existingPlayer.seat_no),
      targetSeat: desiredSeat,
    });

    assignedPlayerIds.add(Number(existingPlayer.id));

    assignedSeats.add(desiredSeat);
  }

  const unassignedPlayers = realPlayers.filter(
    (player) =>
      !assignedPlayerIds.has(Number(player.id)),
  );

  const availableSeats = desiredSeats.filter(
    (seatNo) => !assignedSeats.has(seatNo),
  );

  for (
    let index = 0;
    index < unassignedPlayers.length;
    index += 1
  ) {
    const player = unassignedPlayers[index];

    const targetSeat = availableSeats[index];

    if (!targetSeat) {
      throw createServiceError(
        "Unable to assign a two-player Ludo seat.",
        409,
      );
    }

    assignments.push({
      playerId: Number(player.id),
      currentSeat: Number(player.seat_no),
      targetSeat,
    });
  }

  /*
   * একটি Real Player থাকলে তাকে সবসময়
   * Seat 4 = Blue দেওয়া হবে।
   *
   * Bot পরে Seat 2 = Green পাবে।
   */
  if (assignments.length === 1) {
    assignments[0].targetSeat = 4;
  }

  for (const assignment of assignments) {
    const playerColor = getPlayerColor(
      assignment.targetSeat,
    );

    if (!playerColor) {
      throw createServiceError(
        "Unable to assign Ludo player color.",
        500,
      );
    }

    await connection.query(
      `
        UPDATE ludo_match_players
        SET
          seat_no = ?,
          player_color = ?
        WHERE id = ?
          AND match_id = ?
          AND is_bot = 0
          AND player_status != 'left'
      `,
      [
        assignment.targetSeat,
        playerColor,
        assignment.playerId,
        matchId,
      ],
    );
  }
}

/* ==========================================
   Timeout Finalizer

   Rules:
   1 Real -> 1 Bot -> 2 players
   2 Real -> 0 Bot -> 2 players
   3 Real -> 1 Bot -> 4 players
   4 Real -> 0 Bot -> 4 players
========================================== */

async function finalizeMatchmaking(matchId) {
  const validMatchId =
    parsePositiveInteger(matchId);

  if (!validMatchId) {
    throw createServiceError(
      "Invalid Ludo match ID.",
      400,
    );
  }

  const connection =
    await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [matchRows] =
      await connection.query(
        `
          SELECT
            id,
            entry_amount,
            requested_player_mode,
            player_mode,
            current_players,
            service_charge_percent,
            match_status,
            matchmaking_expires_at,
            entry_collected
          FROM ludo_matches
          WHERE id = ?
          LIMIT 1
          FOR UPDATE
        `,
        [validMatchId],
      );

    const match = matchRows[0] || null;

    if (!match) {
      throw createServiceError(
        "Ludo match not found.",
        404,
      );
    }

    /*
     * অন্য request থেকে match ইতোমধ্যে
     * শুরু বা complete হয়ে থাকলে কোনো
     * player, bot অথবা wallet পরিবর্তন হবে না।
     */
    if (
      match.match_status !==
        MATCH_STATUS.WAITING ||
      Boolean(match.entry_collected)
    ) {
      await connection.commit();

      return buildMatchState(
        validMatchId,
      );
    }

    const requestedPlayerMode =
      validatePlayerMode(
        match.requested_player_mode,
      );

    const realPlayerCount =
      await countRealPlayers(
        validMatchId,
        connection,
      );

    /*
     * কোনো Real Player না থাকলে
     * match শুরু না করে cancel হবে।
     */
    if (realPlayerCount === 0) {
      await connection.query(
        `
          UPDATE ludo_matches
          SET
            match_status = 'cancelled',
            cancelled_at = NOW(),
            current_players = 0
          WHERE id = ?
            AND match_status = 'waiting'
            AND entry_collected = 0
        `,
        [validMatchId],
      );

      await connection.commit();

      return buildMatchState(
        validMatchId,
      );
    }

    if (
      realPlayerCount >
      requestedPlayerMode
    ) {
      throw createServiceError(
        "Ludo real player count exceeds selected capacity.",
        409,
      );
    }

    const finalPlayerMode =
      resolveFinalPlayerMode(
        realPlayerCount,
      );

    const requiredBotCount =
      finalPlayerMode -
      realPlayerCount;

    if (
      requiredBotCount < 0 ||
      requiredBotCount > 1
    ) {
      throw createServiceError(
        "Ludo bot count is inconsistent.",
        409,
      );
    }

    /*
     * পুরোনো বা duplicate waiting Bot থাকলে
     * প্রথমে inactive করা হবে।
     *
     * Waiting অবস্থায় entry debit হওয়ার কথা নয়।
     */
    const [existingBots] =
      await connection.query(
        `
          SELECT
            id,
            entry_debited
          FROM ludo_match_players
          WHERE match_id = ?
            AND is_bot = 1
            AND player_status != 'left'
          ORDER BY id ASC
          FOR UPDATE
        `,
        [validMatchId],
      );

    const debitedWaitingBot =
      existingBots.find(
        (bot) =>
          Boolean(bot.entry_debited),
      );

    if (debitedWaitingBot) {
      throw createServiceError(
        "A waiting Ludo bot entry was already debited.",
        409,
      );
    }

    if (existingBots.length > 0) {
      await connection.query(
        `
          UPDATE ludo_match_players
          SET
            player_status = 'left',
            finished_at = NOW()
          WHERE match_id = ?
            AND is_bot = 1
            AND player_status != 'left'
            AND entry_debited = 0
        `,
        [validMatchId],
      );
    }

    /*
     * ১ অথবা ২ Real Player থাকলে
     * Seat 4 এবং Seat 2 ব্যবহার হবে।
     */
    if (finalPlayerMode === 2) {
      await normalizeTwoPlayerRealSeats(
        validMatchId,
        connection,
      );
    }

    /*
     * প্রয়োজন হলে ঠিক একটি Bot যোগ হবে।
     */
    if (requiredBotCount === 1) {
      const botSeatNo =
        await findAvailableSeat(
          validMatchId,
          finalPlayerMode,
          connection,
        );

      if (!botSeatNo) {
        throw createServiceError(
          "No seat is available for the Ludo bot.",
          409,
        );
      }

      await insertBotMatchPlayer(
        validMatchId,
        Number(match.entry_amount),
        botSeatNo,
        connection,
      );
    }

    const finalPlayerCount =
      await updateCurrentPlayers(
        validMatchId,
        connection,
      );

    if (
      finalPlayerCount !==
      finalPlayerMode
    ) {
      throw createServiceError(
        "Final Ludo player count is inconsistent.",
        409,
      );
    }

    await applyFinalPlayerMode(
      validMatchId,
      Number(match.entry_amount),
      finalPlayerMode,
      Number(
        match.service_charge_percent,
      ),
      connection,
    );

    await startMatchIfReady(
      validMatchId,
      connection,
    );

    await connection.commit();

    return buildMatchState(
      validMatchId,
    );
  } catch (error) {
    await connection.rollback();

    throw error;
  } finally {
    connection.release();
  }
}

/* ==========================================
   Join Matchmaking
========================================== */

async function joinMatchmaking(userId, entryAmount, playerMode = 2) {
  const validUserId = parsePositiveInteger(userId);

  if (!validUserId) {
    throw createServiceError("Invalid user ID.", 400);
  }

  const requestedPlayerMode = validatePlayerMode(playerMode);

  const connection = await pool.getConnection();

  let matchId = null;
  let joinedPlayer = null;
  let alreadyJoined = false;
  let newMatchCreated = false;

  try {
    await connection.beginTransaction();

    const validEntryAmount = await validateEntryAmount(entryAmount, connection);

    const user = await getLockedUser(validUserId, connection);

    validateUserForLudo(user, validEntryAmount);

    const existingMatch = await findExistingActiveMatch(
      validUserId,
      connection,
    );

    if (existingMatch) {
      matchId = Number(existingMatch.id);

      alreadyJoined = true;

      joinedPlayer = {
        matchPlayerId: Number(existingMatch.match_player_id),

        userId: validUserId,

        seatNo: Number(existingMatch.seat_no),

        color: existingMatch.player_color,
      };

      await connection.commit();

      const state = await buildMatchState(matchId);

      return {
        ...state,

        joinedPlayer,

        matchmaking: {
          ...state.matchmaking,
          alreadyJoined: true,
          newMatchCreated: false,
        },
      };
    }

    let match = await findWaitingMatch(
      validEntryAmount,
      requestedPlayerMode,
      connection,
    );

    if (!match) {
      match = await createWaitingMatch(
        validEntryAmount,
        requestedPlayerMode,
        connection,
      );

      newMatchCreated = true;
    }

    matchId = Number(match.id);

    const seatNo = await findAvailableSeat(
      matchId,
      requestedPlayerMode,
      connection,
    );

    if (!seatNo) {
      throw createServiceError("No Ludo seat is available.", 409);
    }

    const playerColor = getPlayerColor(seatNo);

    if (!playerColor) {
      throw createServiceError("Unable to assign player color.", 500);
    }

    const matchPlayerId = await insertRealMatchPlayer(
      matchId,
      validUserId,
      seatNo,
      playerColor,
      validEntryAmount,
      connection,
    );

    joinedPlayer = {
      matchPlayerId,
      userId: validUserId,
      seatNo,
      color: playerColor,
    };

    const currentPlayers = await updateCurrentPlayers(matchId, connection);

    /*
     * Selected capacity পূর্ণ হলে
     * timeout-এর আগেই match start।
     */
    if (currentPlayers === requestedPlayerMode) {
      await applyFinalPlayerMode(
        matchId,
        validEntryAmount,
        requestedPlayerMode,
        Number(match.service_charge_percent),
        connection,
      );

      await startMatchIfReady(matchId, connection);
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();

    throw error;
  } finally {
    connection.release();
  }

  const state = await buildMatchState(matchId);

  return {
    ...state,

    joinedPlayer,

    matchmaking: {
      ...state.matchmaking,
      alreadyJoined,
      newMatchCreated,
      waitSeconds: getMatchmakingWaitSeconds(requestedPlayerMode),
    },
  };
}

/* END OF SECTION 1 */

/* ==========================================
   PMS ADDA LUDO SERVICE
   SECTION 2: ENTRY + START + MATCH STATE
========================================== */

/* ==========================================
   Real Player Entry Debit
========================================== */

async function debitRealPlayerEntry(match, player, connection) {
  const userId = Number(player.user_id);

  const entryAmount = Number(player.entry_amount);

  const user = await getLockedUser(userId, connection);

  validateUserForLudo(user, entryAmount);

  const balanceBefore = Number(user.wallet_balance);

  const balanceAfter = Number((balanceBefore - entryAmount).toFixed(2));

  const [walletResult] = await connection.query(
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
    [entryAmount, entryAmount, userId, entryAmount],
  );

  if (Number(walletResult.affectedRows) !== 1) {
    throw createServiceError(`Minimum ৳${entryAmount} balance required.`, 400);
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
        'game_loss',
        'debit',
        ?,
        ?,
        ?,
        'completed',
        'ludo_match',
        ?,
        ?,
        NULL
      )
    `,
    [
      createWalletTransactionId(),
      userId,
      entryAmount,
      balanceBefore,
      balanceAfter,
      String(match.id),
      `Ludo match ${match.match_code} entry fee`,
    ],
  );

  return {
    balanceBefore,
    balanceAfter,
  };
}

/* ==========================================
   Bot Entry Debit
========================================== */

async function debitBotPlayerEntry(player, connection) {
  const botId = Number(player.bot_id);

  const entryAmount = Number(player.entry_amount);

  const [result] = await connection.query(
    `
        UPDATE ludo_bots
        SET
          wallet_balance =
            wallet_balance - ?,

          total_wagered =
            total_wagered + ?,

          total_matches =
            total_matches + 1

        WHERE id = ?
          AND status = 'active'
          AND wallet_balance >= ?
      `,
    [entryAmount, entryAmount, botId, entryAmount],
  );

  if (Number(result.affectedRows) !== 1) {
    throw createServiceError(
      "Selected Ludo bot has insufficient balance.",
      409,
    );
  }

  return true;
}

/* ==========================================
   Initialize Game State and Pawns
========================================== */

async function initializeGameState(matchId, connection) {
  const [matchRows] = await connection.query(
    `
        SELECT
          id,
          player_mode,
          current_players,
          match_status
        FROM ludo_matches
        WHERE id = ?
        LIMIT 1
        FOR UPDATE
      `,
    [matchId],
  );

  const match = matchRows[0] || null;

  if (!match) {
    throw createServiceError("Ludo match not found.", 404);
  }

  if (match.match_status !== MATCH_STATUS.PLAYING) {
    throw createServiceError("Ludo match is not playing.", 409);
  }

  const [players] = await connection.query(
    `
        SELECT
          id,
          user_id,
          bot_id,
          is_bot,
          seat_no,
          player_color,
          player_status
        FROM ludo_match_players
        WHERE match_id = ?
          AND player_status = 'playing'
        ORDER BY seat_no ASC
        FOR UPDATE
      `,
    [matchId],
  );

  if (players.length !== Number(match.player_mode)) {
    throw createServiceError("Ludo match player count is inconsistent.", 409);
  }

  const firstPlayer = players[0];

  if (!firstPlayer) {
    throw createServiceError("First Ludo player was not found.", 409);
  }

  const firstPlayerId = Number(firstPlayer.id);

  const firstUserId = firstPlayer.user_id ? Number(firstPlayer.user_id) : null;

  await connection.query(
    `
      INSERT INTO ludo_game_states (
        match_id,
        current_turn_player_id,
        current_turn_user_id,
        current_turn_seat_no,
        current_turn_color,
        turn_number,
        turn_started_at,
        turn_expires_at,
        dice_value,
        dice_rolled,
        consecutive_sixes,
        game_status,
        last_action_type,
        last_action_user_id,
        last_action_player_id,
        last_action_at,
        state_version
      )
      VALUES (
        ?,
        ?,
        ?,
        ?,
        ?,
        1,
        NOW(),
        DATE_ADD(
          NOW(),
          INTERVAL 10 SECOND
        ),
        NULL,
        0,
        0,
        'playing',
        'game_started',
        ?,
        ?,
        NOW(),
        1
      )
      ON DUPLICATE KEY UPDATE
        match_id =
          VALUES(match_id)
    `,
    [
      matchId,
      firstPlayerId,
      firstUserId,
      Number(firstPlayer.seat_no),
      String(firstPlayer.player_color),
      firstUserId,
      firstPlayerId,
    ],
  );

  for (const player of players) {
    const matchPlayerId = Number(player.id);

    const userId = player.user_id ? Number(player.user_id) : null;

    const seatNo = Number(player.seat_no);

    const color = String(player.player_color);

    for (let pawnNo = 1; pawnNo <= 4; pawnNo += 1) {
      await connection.query(
        `
          INSERT INTO ludo_pawns (
            match_id,
            match_player_id,
            user_id,
            seat_no,
            player_color,
            pawn_no,
            pawn_status,
            path_position,
            total_steps,
            board_coordinate,
            is_safe,
            finished_order,
            last_moved_at
          )
          VALUES (
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            'yard',
            -1,
            0,
            NULL,
            0,
            NULL,
            NULL
          )
          ON DUPLICATE KEY UPDATE
            match_id =
              VALUES(match_id),

            user_id =
              VALUES(user_id),

            seat_no =
              VALUES(seat_no),

            player_color =
              VALUES(player_color)
        `,
        [matchId, matchPlayerId, userId, seatNo, color, pawnNo],
      );
    }
  }

  return true;
}

/* ==========================================
   Start Match
========================================== */

async function startMatchIfReady(matchId, connection) {
  const [matchRows] = await connection.query(
    `
        SELECT
          id,
          match_code,
          entry_amount,
          requested_player_mode,
          player_mode,
          current_players,
          match_status,
          entry_collected
        FROM ludo_matches
        WHERE id = ?
        LIMIT 1
        FOR UPDATE
      `,
    [matchId],
  );

  const match = matchRows[0] || null;

  if (!match) {
    throw createServiceError("Ludo match not found.", 404);
  }

  if (
    match.match_status !== MATCH_STATUS.WAITING ||
    Boolean(match.entry_collected)
  ) {
    return false;
  }

  if (Number(match.current_players) !== Number(match.player_mode)) {
    return false;
  }

  const [players] = await connection.query(
    `
        SELECT
          id,
          user_id,
          bot_id,
          is_bot,
          entry_amount,
          entry_debited,
          player_status
        FROM ludo_match_players
        WHERE match_id = ?
          AND player_status != 'left'
        ORDER BY seat_no ASC
        FOR UPDATE
      `,
    [matchId],
  );

  if (players.length !== Number(match.player_mode)) {
    throw createServiceError(
      "Ludo player count changed before match start.",
      409,
    );
  }

  /*
   * প্রথমে match starting lock করা হবে।
   */
  const [startingResult] = await connection.query(
    `
        UPDATE ludo_matches
        SET match_status = 'starting'
        WHERE id = ?
          AND match_status = 'waiting'
          AND entry_collected = 0
      `,
    [matchId],
  );

  if (Number(startingResult.affectedRows) !== 1) {
    throw createServiceError("Ludo match is already starting.", 409);
  }

  for (const player of players) {
    if (Boolean(player.entry_debited)) {
      throw createServiceError(
        "Ludo entry was already partially collected.",
        409,
      );
    }

    if (Boolean(player.is_bot)) {
      await debitBotPlayerEntry(player, connection);
    } else {
      await debitRealPlayerEntry(match, player, connection);
    }

    const [playerResult] = await connection.query(
      `
          UPDATE ludo_match_players
          SET
            entry_debited = 1,
            player_status = 'playing'
          WHERE id = ?
            AND entry_debited = 0
            AND player_status IN (
              'waiting',
              'ready'
            )
        `,
      [Number(player.id)],
    );

    if (Number(playerResult.affectedRows) !== 1) {
      throw createServiceError("Unable to activate a Ludo player.", 409);
    }
  }

  const [playingResult] = await connection.query(
    `
        UPDATE ludo_matches
        SET
          match_status = 'playing',
          entry_collected = 1,
          started_at =
            COALESCE(
              started_at,
              NOW()
            )
        WHERE id = ?
          AND match_status = 'starting'
          AND entry_collected = 0
      `,
    [matchId],
  );

  if (Number(playingResult.affectedRows) !== 1) {
    throw createServiceError("Unable to start Ludo match.", 409);
  }

  await initializeGameState(matchId, connection);

  return true;
}

/* ==========================================
   Match State Builder
========================================== */

async function buildMatchState(matchId, connection = pool) {
  const [matchRows] = await connection.query(
    `
        SELECT
          id,
          match_code,
          entry_amount,
          requested_player_mode,
          player_mode,
          current_players,
          total_pot,
          service_charge_percent,
          service_charge_amount,
          distributable_amount,
          first_prize,
          second_prize,
          match_status,
          matchmaking_started_at,
          matchmaking_expires_at,
          entry_collected,
          settlement_completed,
          winner_player_id,
          second_player_id,
          winner_user_id,
          second_user_id,
          started_at,
          completed_at,
          cancelled_at,
          created_at,
          updated_at
        FROM ludo_matches
        WHERE id = ?
        LIMIT 1
      `,
    [matchId],
  );

  const match = matchRows[0] || null;

  if (!match) {
    throw createServiceError("Ludo match not found.", 404);
  }

  const [playerRows] = await connection.query(
    `
        SELECT
          lmp.id,
          lmp.match_id,
          lmp.user_id,
          lmp.bot_id,
          lmp.is_bot,
          lmp.bot_level,
          lmp.bot_name,
          lmp.bot_avatar,
          lmp.seat_no,
          lmp.player_color,
          lmp.player_status,
          lmp.finish_position,
          lmp.entry_amount,
          lmp.entry_debited,
          lmp.prize_amount,
          lmp.prize_credited,
          lmp.joined_at,
          lmp.finished_at,

          u.uid,
          u.full_name,
          u.username,
          u.wallet_balance,

          lb.bot_code,
          lb.bot_name
            AS master_bot_name,
          lb.avatar_url
            AS master_bot_avatar,
          lb.wallet_balance
            AS bot_wallet_balance

        FROM ludo_match_players lmp

        LEFT JOIN users u
          ON u.id = lmp.user_id
          AND lmp.is_bot = 0

        LEFT JOIN ludo_bots lb
          ON lb.id = lmp.bot_id
          AND lmp.is_bot = 1

        WHERE lmp.match_id = ?
          AND lmp.player_status !=
              'left'

        ORDER BY lmp.seat_no ASC
      `,
    [matchId],
  );

  const players = playerRows.map((player) => {
    const isBot = Boolean(player.is_bot);

    const name = isBot
      ? player.bot_name || player.master_bot_name || "Ludo Bot"
      : player.full_name || player.username || `Player ${player.seat_no}`;

    const avatarUrl = isBot
      ? player.bot_avatar || player.master_bot_avatar || null
      : null;

    return {
      id: Number(player.id),

      matchPlayerId: Number(player.id),

      userId: player.user_id ? Number(player.user_id) : null,

      botId: player.bot_id ? Number(player.bot_id) : null,

      isBot,

      uid: isBot ? player.bot_code : player.uid,

      name,

      fullName: name,

      username: isBot ? null : player.username,

      avatarUrl,

      botLevel: isBot ? player.bot_level || "smart" : null,

      seatNo: Number(player.seat_no),

      color: player.player_color,

      status: player.player_status,

      finishPosition:
        player.finish_position !== null ? Number(player.finish_position) : null,

      entryAmount: Number(player.entry_amount || 0),

      entryDebited: Boolean(player.entry_debited),

      prizeAmount: Number(player.prize_amount || 0),

      prizeCredited: Boolean(player.prize_credited),

      walletBalance: isBot
        ? Number(player.bot_wallet_balance || 0)
        : Number(player.wallet_balance || 0),

      joinedAt: player.joined_at,

      finishedAt: player.finished_at,
    };
  });

  const [stateRows] = await connection.query(
    `
        SELECT
          id,
          match_id,
          current_turn_player_id,
          current_turn_user_id,
          current_turn_seat_no,
          current_turn_color,
          turn_number,
          turn_started_at,
          turn_expires_at,
          dice_value,
          dice_rolled,
          consecutive_sixes,
          game_status,
          last_action_type,
          last_action_user_id,
          last_action_player_id,
          last_action_at,
          state_version,
          created_at,
          updated_at
        FROM ludo_game_states
        WHERE match_id = ?
        LIMIT 1
      `,
    [matchId],
  );

  const stateRow = stateRows[0] || null;

  const gameState = stateRow
    ? {
        id: Number(stateRow.id),

        matchId: Number(stateRow.match_id),

        currentTurnPlayerId: stateRow.current_turn_player_id
          ? Number(stateRow.current_turn_player_id)
          : null,

        currentTurnUserId: stateRow.current_turn_user_id
          ? Number(stateRow.current_turn_user_id)
          : null,

        currentTurnSeatNo: stateRow.current_turn_seat_no
          ? Number(stateRow.current_turn_seat_no)
          : null,

        currentTurnColor: stateRow.current_turn_color || null,

        turnNumber: Number(stateRow.turn_number || 1),

        turnStartedAt: stateRow.turn_started_at,

        turnExpiresAt: stateRow.turn_expires_at,

        turnDurationSeconds: TURN_DURATION_SECONDS,

        diceValue:
          stateRow.dice_value !== null ? Number(stateRow.dice_value) : null,

        diceRolled: Boolean(stateRow.dice_rolled),

        consecutiveSixes: Number(stateRow.consecutive_sixes || 0),

        status: stateRow.game_status,

        lastActionType: stateRow.last_action_type || null,

        lastActionUserId: stateRow.last_action_user_id
          ? Number(stateRow.last_action_user_id)
          : null,

        lastActionPlayerId: stateRow.last_action_player_id
          ? Number(stateRow.last_action_player_id)
          : null,

        lastActionAt: stateRow.last_action_at,

        stateVersion: Number(stateRow.state_version || 1),

        createdAt: stateRow.created_at,

        updatedAt: stateRow.updated_at,
      }
    : null;

  const [pawnRows] = await connection.query(
    `
        SELECT
          id,
          match_id,
          match_player_id,
          user_id,
          seat_no,
          player_color,
          pawn_no,
          pawn_status,
          path_position,
          total_steps,
          board_coordinate,
          is_safe,
          finished_order,
          last_moved_at,
          created_at,
          updated_at
        FROM ludo_pawns
        WHERE match_id = ?
          AND EXISTS (
            SELECT 1
            FROM ludo_match_players lmp
            WHERE lmp.id =
                  ludo_pawns.match_player_id
              AND lmp.match_id =
                  ludo_pawns.match_id
              AND lmp.player_status !=
                  'left'
          )
        ORDER BY
          seat_no ASC,
          pawn_no ASC
      `,
    [matchId],
  );

  const pawns = pawnRows.map((pawn) => ({
    id: Number(pawn.id),

    matchId: Number(pawn.match_id),

    matchPlayerId: Number(pawn.match_player_id),

    userId: pawn.user_id ? Number(pawn.user_id) : null,

    seatNo: Number(pawn.seat_no),

    color: pawn.player_color,

    pawnNo: Number(pawn.pawn_no),

    status: pawn.pawn_status,

    pathPosition: Number(pawn.path_position),

    totalSteps: Number(pawn.total_steps || 0),

    boardCoordinate: pawn.board_coordinate || null,

    isSafe: Boolean(pawn.is_safe),

    finishedOrder: pawn.finished_order ? Number(pawn.finished_order) : null,

    lastMovedAt: pawn.last_moved_at,

    createdAt: pawn.created_at,

    updatedAt: pawn.updated_at,
  }));

  const currentPlayers = Number(match.current_players || 0);

  const requestedPlayerMode = Number(
    match.requested_player_mode || match.player_mode,
  );

  const finalPlayerMode = Number(match.player_mode);

  return {
    match: {
      id: Number(match.id),

      matchCode: match.match_code,

      entryAmount: Number(match.entry_amount),

      requestedPlayerMode,

      playerMode: finalPlayerMode,

      currentPlayers,

      totalPot: Number(match.total_pot || 0),

      serviceChargePercent: Number(match.service_charge_percent || 10),

      serviceChargeAmount: Number(match.service_charge_amount || 0),

      distributableAmount: Number(match.distributable_amount || 0),

      firstPrize: Number(match.first_prize || 0),

      secondPrize: Number(match.second_prize || 0),

      status: match.match_status,

      entryCollected: Boolean(match.entry_collected),

      settlementCompleted: Boolean(match.settlement_completed),

      winnerPlayerId: match.winner_player_id
        ? Number(match.winner_player_id)
        : null,

      secondPlayerId: match.second_player_id
        ? Number(match.second_player_id)
        : null,

      winnerUserId: match.winner_user_id ? Number(match.winner_user_id) : null,

      secondUserId: match.second_user_id ? Number(match.second_user_id) : null,

      matchmakingStartedAt: match.matchmaking_started_at,

      matchmakingExpiresAt: match.matchmaking_expires_at,

      startedAt: match.started_at,

      completedAt: match.completed_at,

      cancelledAt: match.cancelled_at,

      createdAt: match.created_at,

      updatedAt: match.updated_at,
    },

    players,

    gameState,

    pawns,

    matchmaking: {
      isWaiting: match.match_status === MATCH_STATUS.WAITING,

      requestedPlayerMode,

      currentPlayers,

      waitingForPlayers: Math.max(requestedPlayerMode - currentPlayers, 0),

      waitSeconds: getMatchmakingWaitSeconds(requestedPlayerMode),

      expiresAt: match.matchmaking_expires_at,
    },
  };
}

/* ==========================================
   Public Match State
========================================== */

async function getMatchState(matchId) {
  const validMatchId = parsePositiveInteger(matchId);

  if (!validMatchId) {
    throw createServiceError("Invalid Ludo match ID.", 400);
  }

  return buildMatchState(validMatchId);
}

/* END OF SECTION 2 */

/* ==========================================
   PMS ADDA LUDO SERVICE
   SECTION 3: DICE + MOVEMENT + CAPTURE
========================================== */

/* ==========================================
   Active Player Helpers
========================================== */

async function getNextActivePlayer(matchId, currentSeatNo, connection) {
  const [players] = await connection.query(
    `
        SELECT
          id,
          user_id,
          bot_id,
          is_bot,
          bot_level,
          seat_no,
          player_color,
          player_status
        FROM ludo_match_players
        WHERE match_id = ?
          AND player_status = 'playing'
        ORDER BY seat_no ASC
        FOR UPDATE
      `,
    [matchId],
  );

  if (players.length === 0) {
    throw createServiceError("No active Ludo player was found.", 409);
  }

  const currentIndex = players.findIndex(
    (player) => Number(player.seat_no) === Number(currentSeatNo),
  );

  if (currentIndex === -1) {
    throw createServiceError("Current Ludo seat was not found.", 409);
  }

  const nextIndex = (currentIndex + 1) % players.length;

  const nextPlayer = players[nextIndex];

  const isBot = Boolean(nextPlayer.is_bot);

  return {
    matchPlayerId: Number(nextPlayer.id),

    userId: !isBot && nextPlayer.user_id ? Number(nextPlayer.user_id) : null,

    botId: isBot && nextPlayer.bot_id ? Number(nextPlayer.bot_id) : null,

    isBot,

    botLevel: isBot ? nextPlayer.bot_level || "smart" : null,

    seatNo: Number(nextPlayer.seat_no),

    color: String(nextPlayer.player_color),
  };
}

async function getLockedMatchPlayer(matchId, matchPlayerId, connection) {
  const [rows] = await connection.query(
    `
        SELECT
          id,
          match_id,
          user_id,
          bot_id,
          is_bot,
          bot_level,
          seat_no,
          player_color,
          player_status,
          finish_position
        FROM ludo_match_players
        WHERE id = ?
          AND match_id = ?
        LIMIT 1
        FOR UPDATE
      `,
    [matchPlayerId, matchId],
  );

  return rows[0] || null;
}

async function resolveRealMatchPlayerId(matchId, userId) {
  const [rows] = await pool.query(
    `
        SELECT id
        FROM ludo_match_players
        WHERE match_id = ?
          AND user_id = ?
          AND is_bot = 0
          AND player_status = 'playing'
        LIMIT 1
      `,
    [matchId, userId],
  );

  const player = rows[0] || null;

  if (!player) {
    throw createServiceError(
      "You are not an active player of this Ludo match.",
      403,
    );
  }

  return Number(player.id);
}

/* ==========================================
   Movable Pawn Helpers
========================================== */

function canPawnMove(pawn, diceValue) {
  const status = String(pawn.pawn_status || pawn.status || "").toLowerCase();

  const steps = Number(pawn.total_steps ?? pawn.totalSteps ?? 0);

  if (status === "finished") {
    return false;
  }

  if (status === "yard") {
    return diceValue === 6;
  }

  if (status === "active" || status === "home_path") {
    return steps + diceValue <= FINISHED_STEP;
  }

  return false;
}

async function getLockedPlayerPawns(matchId, matchPlayerId, connection) {
  const [rows] = await connection.query(
    `
        SELECT
          id,
          match_id,
          match_player_id,
          user_id,
          seat_no,
          player_color,
          pawn_no,
          pawn_status,
          path_position,
          total_steps,
          board_coordinate,
          is_safe,
          finished_order
        FROM ludo_pawns
        WHERE match_id = ?
          AND match_player_id = ?
        ORDER BY pawn_no ASC
        FOR UPDATE
      `,
    [matchId, matchPlayerId],
  );

  return rows;
}

/* ==========================================
   Turn State Update
========================================== */

async function moveTurnToPlayer(
  gameStateId,
  expectedCurrentPlayerId,
  nextPlayer,
  actionPlayer,
  actionType,
  connection,
) {
  const [result] = await connection.query(
    `
        UPDATE ludo_game_states
        SET
          current_turn_player_id = ?,
          current_turn_user_id = ?,
          current_turn_seat_no = ?,
          current_turn_color = ?,
          turn_number =
            turn_number + 1,
          turn_started_at = NOW(),
          turn_expires_at =
            DATE_ADD(
              NOW(),
              INTERVAL 10 SECOND
            ),
          dice_value = NULL,
          dice_rolled = 0,
          consecutive_sixes = 0,
          last_action_type = ?,
          last_action_user_id = ?,
          last_action_player_id = ?,
          last_action_at = NOW(),
          state_version =
            state_version + 1
        WHERE id = ?
          AND current_turn_player_id = ?
      `,
    [
      nextPlayer.matchPlayerId,
      nextPlayer.userId,
      nextPlayer.seatNo,
      nextPlayer.color,
      actionType,
      actionPlayer.userId,
      actionPlayer.matchPlayerId,
      gameStateId,
      expectedCurrentPlayerId,
    ],
  );

  if (Number(result.affectedRows) !== 1) {
    throw createServiceError(
      "Ludo turn changed before the action completed.",
      409,
    );
  }
}

async function prepareExtraTurn(
  gameStateId,
  actingPlayer,
  actionType,
  connection,
) {
  const [result] = await connection.query(
    `
        UPDATE ludo_game_states
        SET
          turn_started_at = NOW(),
          turn_expires_at =
            DATE_ADD(
              NOW(),
              INTERVAL 10 SECOND
            ),
          dice_value = NULL,
          dice_rolled = 0,
          last_action_type = ?,
          last_action_user_id = ?,
          last_action_player_id = ?,
          last_action_at = NOW(),
          state_version =
            state_version + 1
        WHERE id = ?
          AND current_turn_player_id = ?
          AND dice_rolled = 1
      `,
    [
      actionType,
      actingPlayer.userId,
      actingPlayer.matchPlayerId,
      gameStateId,
      actingPlayer.matchPlayerId,
    ],
  );

  if (Number(result.affectedRows) !== 1) {
    throw createServiceError("Unable to prepare the Ludo extra turn.", 409);
  }
}

/* ==========================================
   Internal Dice Engine
========================================== */

async function rollDiceForPlayer(matchId, matchPlayerId) {
  const validMatchId = parsePositiveInteger(matchId);

  const validMatchPlayerId = parsePositiveInteger(matchPlayerId);

  if (!validMatchId || !validMatchPlayerId) {
    throw createServiceError("Invalid Ludo dice request.", 400);
  }

  const connection = await pool.getConnection();

  let diceValue = null;
  let noValidMoves = false;
  let thirdSixForfeited = false;
  let nextPlayer = null;
  let actingPlayerResult = null;

  try {
    await connection.beginTransaction();

    const [matchRows] = await connection.query(
      `
          SELECT
            id,
            match_status,
            player_mode,
            current_players
          FROM ludo_matches
          WHERE id = ?
          LIMIT 1
          FOR UPDATE
        `,
      [validMatchId],
    );

    const match = matchRows[0] || null;

    if (!match) {
      throw createServiceError("Ludo match not found.", 404);
    }

    if (match.match_status !== MATCH_STATUS.PLAYING) {
      throw createServiceError("Ludo match is not playing.", 409);
    }

    const player = await getLockedMatchPlayer(
      validMatchId,
      validMatchPlayerId,
      connection,
    );

    if (!player || player.player_status !== PLAYER_STATUS.PLAYING) {
      throw createServiceError("Ludo player is not active.", 403);
    }

    actingPlayerResult = {
      matchPlayerId: Number(player.id),

      userId: player.user_id ? Number(player.user_id) : null,

      botId: player.bot_id ? Number(player.bot_id) : null,

      isBot: Boolean(player.is_bot),

      seatNo: Number(player.seat_no),

      color: String(player.player_color),
    };

    const [stateRows] = await connection.query(
      `
          SELECT
            id,
            current_turn_player_id,
            current_turn_seat_no,
            turn_number,
            dice_value,
            dice_rolled,
            consecutive_sixes,
            game_status,
            state_version
          FROM ludo_game_states
          WHERE match_id = ?
          LIMIT 1
          FOR UPDATE
        `,
      [validMatchId],
    );

    const gameState = stateRows[0] || null;

    if (!gameState) {
      throw createServiceError("Ludo game state was not found.", 409);
    }

    if (gameState.game_status !== MATCH_STATUS.PLAYING) {
      throw createServiceError("Ludo game is not active.", 409);
    }

    if (Number(gameState.current_turn_player_id) !== validMatchPlayerId) {
      throw createServiceError("It is not this player's turn.", 403);
    }

    if (Boolean(gameState.dice_rolled)) {
      throw createServiceError("Dice has already been rolled.", 409);
    }

    diceValue = crypto.randomInt(1, 7);

    const previousSixes = Number(gameState.consecutive_sixes || 0);

    const consecutiveSixes = diceValue === 6 ? previousSixes + 1 : 0;

    /*
     * Third consecutive 6:
     * সঙ্গে সঙ্গে turn শেষ।
     */
    if (consecutiveSixes >= 3) {
      nextPlayer = await getNextActivePlayer(
        validMatchId,
        Number(player.seat_no),
        connection,
      );

      await moveTurnToPlayer(
        Number(gameState.id),
        validMatchPlayerId,
        nextPlayer,
        actingPlayerResult,
        "turn_changed",
        connection,
      );

      thirdSixForfeited = true;
    } else {
      const pawns = await getLockedPlayerPawns(
        validMatchId,
        validMatchPlayerId,
        connection,
      );

      if (pawns.length !== 4) {
        throw createServiceError("Ludo pawn data is incomplete.", 409);
      }

      const hasValidMove = pawns.some((pawn) => canPawnMove(pawn, diceValue));

      if (!hasValidMove) {
        nextPlayer = await getNextActivePlayer(
          validMatchId,
          Number(player.seat_no),
          connection,
        );

        await moveTurnToPlayer(
          Number(gameState.id),
          validMatchPlayerId,
          nextPlayer,
          actingPlayerResult,
          "turn_changed",
          connection,
        );

        noValidMoves = true;
      } else {
        const [stateResult] = await connection.query(
          `
          UPDATE ludo_game_states
SET
  dice_value = ?,
  dice_rolled = 1,
  consecutive_sixes = ?,
  turn_started_at = NOW(),
  turn_expires_at =
    DATE_ADD(
      NOW(),
      INTERVAL 10 SECOND
    ),
                last_action_type =
                  'dice_rolled',
                last_action_user_id = ?,
                last_action_player_id = ?,
                last_action_at = NOW(),
                state_version =
                  state_version + 1
              WHERE id = ?
                AND current_turn_player_id = ?
                AND dice_rolled = 0
            `,
          [
            diceValue,
            consecutiveSixes,
            actingPlayerResult.userId,
            validMatchPlayerId,
            Number(gameState.id),
            validMatchPlayerId,
          ],
        );

        if (Number(stateResult.affectedRows) !== 1) {
          throw createServiceError(
            "Dice state changed before it was saved.",
            409,
          );
        }
      }
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();

    throw error;
  } finally {
    connection.release();
  }

  const matchState = await buildMatchState(validMatchId);

  return {
    matchState,

    diceResult: {
      value: diceValue,

      rolledByPlayerId: validMatchPlayerId,

      rolledByUserId: actingPlayerResult.userId,

      isBot: actingPlayerResult.isBot,

      noValidMoves,

      thirdSixForfeited,

      nextTurnPlayerId: nextPlayer
        ? nextPlayer.matchPlayerId
        : validMatchPlayerId,

      nextTurnUserId: nextPlayer
        ? nextPlayer.userId
        : actingPlayerResult.userId,

      nextTurnColor: nextPlayer ? nextPlayer.color : actingPlayerResult.color,

      stateVersion: Number(matchState.gameState?.stateVersion || 0),
    },
  };
}

/* ==========================================
   Public Real-player Dice
========================================== */

async function rollDice(matchId, userId) {
  const validMatchId = parsePositiveInteger(matchId);

  const validUserId = parsePositiveInteger(userId);

  if (!validMatchId || !validUserId) {
    throw createServiceError("Invalid Ludo dice request.", 400);
  }

  const matchPlayerId = await resolveRealMatchPlayerId(
    validMatchId,
    validUserId,
  );

  return rollDiceForPlayer(validMatchId, matchPlayerId);
}

/* ==========================================
   Internal Pawn Movement
========================================== */

async function movePawnForPlayer(matchId, matchPlayerId, pawnNo) {
  const validMatchId = parsePositiveInteger(matchId);

  const validMatchPlayerId = parsePositiveInteger(matchPlayerId);

  const validPawnNo = parsePositiveInteger(pawnNo);

  if (!validMatchId || !validMatchPlayerId || !validPawnNo || validPawnNo > 4) {
    throw createServiceError("Invalid Ludo pawn move.", 400);
  }

  const connection = await pool.getConnection();

  let pawnMoveResult = null;

  try {
    await connection.beginTransaction();

    const [matchRows] = await connection.query(
      `
          SELECT
            id,
            player_mode,
            match_status,
            settlement_completed
          FROM ludo_matches
          WHERE id = ?
          LIMIT 1
          FOR UPDATE
        `,
      [validMatchId],
    );

    const match = matchRows[0] || null;

    if (!match) {
      throw createServiceError("Ludo match not found.", 404);
    }

    if (match.match_status !== MATCH_STATUS.PLAYING) {
      throw createServiceError("Ludo match is not playing.", 409);
    }

    const player = await getLockedMatchPlayer(
      validMatchId,
      validMatchPlayerId,
      connection,
    );

    if (!player || player.player_status !== PLAYER_STATUS.PLAYING) {
      throw createServiceError("Ludo player is not active.", 403);
    }

    const actingPlayer = {
      matchPlayerId: Number(player.id),

      userId: player.user_id ? Number(player.user_id) : null,

      botId: player.bot_id ? Number(player.bot_id) : null,

      isBot: Boolean(player.is_bot),

      seatNo: Number(player.seat_no),

      color: String(player.player_color),
    };

    const [stateRows] = await connection.query(
      `
          SELECT
            id,
            current_turn_player_id,
            current_turn_seat_no,
            dice_value,
            dice_rolled,
            consecutive_sixes,
            game_status,
            state_version
          FROM ludo_game_states
          WHERE match_id = ?
          LIMIT 1
          FOR UPDATE
        `,
      [validMatchId],
    );

    const gameState = stateRows[0] || null;

    if (!gameState) {
      throw createServiceError("Ludo game state was not found.", 409);
    }

    if (Number(gameState.current_turn_player_id) !== validMatchPlayerId) {
      throw createServiceError("It is not this player's turn.", 403);
    }

    if (!Boolean(gameState.dice_rolled)) {
      throw createServiceError("Roll the dice before moving.", 409);
    }

    const diceValue = Number(gameState.dice_value);

    if (!Number.isInteger(diceValue) || diceValue < 1 || diceValue > 6) {
      throw createServiceError("Valid dice value was not found.", 409);
    }

    const [pawnRows] = await connection.query(
      `
          SELECT
            id,
            match_id,
            match_player_id,
            user_id,
            seat_no,
            player_color,
            pawn_no,
            pawn_status,
            path_position,
            total_steps,
            board_coordinate,
            is_safe,
            finished_order
          FROM ludo_pawns
          WHERE match_id = ?
            AND match_player_id = ?
            AND pawn_no = ?
          LIMIT 1
          FOR UPDATE
        `,
      [validMatchId, validMatchPlayerId, validPawnNo],
    );

    const pawn = pawnRows[0] || null;

    if (!pawn) {
      throw createServiceError("Selected Ludo pawn was not found.", 404);
    }

    if (!canPawnMove(pawn, diceValue)) {
      throw createServiceError(
        "This pawn cannot move with the current dice.",
        409,
      );
    }

    const previousStatus = String(pawn.pawn_status);

    let destination;

    if (previousStatus === "yard") {
      destination = getPawnPosition(actingPlayer.color, 0);
    } else {
      destination = calculatePawnDestination(
        actingPlayer.color,
        Number(pawn.total_steps),
        diceValue,
      );
    }

    if (!destination) {
      throw createServiceError("Unable to calculate pawn destination.", 409);
    }

    const nextStatus =
      destination.status === "home" ? "home_path" : String(destination.status);

    const coordinate = destination.coordinate || null;

    const destinationIsSafe =
      nextStatus === "home_path" ||
      nextStatus === "finished" ||
      isSafeCoordinate(coordinate);

    /*
     * Opponent block:
     * একই unsafe cell-এ 2+ opponent pawn
     * থাকলে সেখানে যাওয়া যাবে না।
     */
    let opponentPawns = [];

    if (nextStatus === "active" && coordinate && !destinationIsSafe) {
      const [rows] = await connection.query(
        `
            SELECT
              id,
              match_player_id,
              pawn_no
            FROM ludo_pawns
            WHERE match_id = ?
              AND board_coordinate = ?
              AND pawn_status = 'active'
              AND match_player_id != ?
              AND EXISTS (
                SELECT 1
                FROM ludo_match_players lmp
                WHERE lmp.id =
                      ludo_pawns.match_player_id
                  AND lmp.match_id =
                      ludo_pawns.match_id
                  AND lmp.player_status =
                      'playing'
              )
            FOR UPDATE
          `,
        [validMatchId, coordinate, validMatchPlayerId],
      );

      opponentPawns = rows;

      if (opponentPawns.length >= 2) {
        throw createServiceError("Opponent pawn block cannot be crossed.", 409);
      }
    }

    let finishedOrder = null;

    if (nextStatus === "finished") {
      const [finishedRows] = await connection.query(
        `
            SELECT COUNT(*) AS total
            FROM ludo_pawns
            WHERE match_id = ?
              AND match_player_id = ?
              AND pawn_status = 'finished'
          `,
        [validMatchId, validMatchPlayerId],
      );

      finishedOrder = Number(finishedRows[0]?.total || 0) + 1;
    }

    const [pawnResult] = await connection.query(
      `
          UPDATE ludo_pawns
          SET
            pawn_status = ?,
            path_position = ?,
            total_steps = ?,
            board_coordinate = ?,
            is_safe = ?,
            finished_order = ?,
            last_moved_at = NOW()
          WHERE id = ?
            AND match_player_id = ?
            AND pawn_status = ?
            AND total_steps = ?
        `,
      [
        nextStatus,
        nextStatus === "finished"
          ? FINISHED_STEP
          : Number(destination.relativePathPosition),
        Number(destination.totalSteps),
        coordinate,
        destinationIsSafe ? 1 : 0,
        finishedOrder,
        Number(pawn.id),
        validMatchPlayerId,
        previousStatus,
        Number(pawn.total_steps),
      ],
    );

    if (Number(pawnResult.affectedRows) !== 1) {
      throw createServiceError(
        "Pawn state changed before the move completed.",
        409,
      );
    }

    /*
     * একটি opponent pawn থাকলে capture।
     */
    const capturedPawnIds = [];

    if (opponentPawns.length === 1) {
      const capturedPawn = opponentPawns[0];

      const [captureResult] = await connection.query(
        `
            UPDATE ludo_pawns
            SET
              pawn_status = 'yard',
              path_position = -1,
              total_steps = 0,
              board_coordinate = NULL,
              is_safe = 0,
              finished_order = NULL,
              last_moved_at = NOW()
            WHERE id = ?
              AND match_player_id = ?
              AND board_coordinate = ?
              AND pawn_status = 'active'
          `,
        [
          Number(capturedPawn.id),
          Number(capturedPawn.match_player_id),
          coordinate,
        ],
      );

      if (Number(captureResult.affectedRows) !== 1) {
        throw createServiceError("Unable to capture opponent pawn.", 409);
      }

      capturedPawnIds.push(Number(capturedPawn.id));
    }

    const [finishedPawnRows] = await connection.query(
      `
          SELECT COUNT(*) AS total
          FROM ludo_pawns
          WHERE match_id = ?
            AND match_player_id = ?
            AND pawn_status = 'finished'
        `,
      [validMatchId, validMatchPlayerId],
    );

    const finishedPawnCount = Number(finishedPawnRows[0]?.total || 0);

    let playerFinished = false;
    let playerFinishPosition = null;
    let matchCompleted = false;

    if (finishedPawnCount === 4) {
      const [positionRows] = await connection.query(
        `
            SELECT COUNT(*) AS total
            FROM ludo_match_players
            WHERE match_id = ?
              AND finish_position
                  IS NOT NULL
          `,
        [validMatchId],
      );

      playerFinishPosition = Number(positionRows[0]?.total || 0) + 1;

      const [finishResult] = await connection.query(
        `
            UPDATE ludo_match_players
            SET
              player_status = 'finished',
              finish_position = ?,
              finished_at = NOW()
            WHERE id = ?
              AND player_status = 'playing'
              AND finish_position IS NULL
          `,
        [playerFinishPosition, validMatchPlayerId],
      );

      if (Number(finishResult.affectedRows) !== 1) {
        throw createServiceError("Unable to finish Ludo player.", 409);
      }

      playerFinished = true;

      const requiredFinishers = Number(match.player_mode) === 2 ? 1 : 2;

      matchCompleted = playerFinishPosition >= requiredFinishers;
    }

    const captured = capturedPawnIds.length > 0;

    const pawnFinished = nextStatus === "finished";

    let extraTurn = diceValue === 6 || captured || pawnFinished;

    let nextPlayer = null;

    if (matchCompleted) {
      await settleMatchPrizes(validMatchId, connection);

      const [stateResult] = await connection.query(
        `
            UPDATE ludo_game_states
            SET
              game_status = 'completed',
              current_turn_player_id = NULL,
              current_turn_user_id = NULL,
              current_turn_seat_no = NULL,
              current_turn_color = NULL,
              turn_started_at = NULL,
              turn_expires_at = NULL,
              dice_value = NULL,
              dice_rolled = 0,
              consecutive_sixes = 0,
              last_action_type =
                'game_completed',
              last_action_user_id = ?,
              last_action_player_id = ?,
              last_action_at = NOW(),
              state_version =
                state_version + 1
            WHERE id = ?
              AND current_turn_player_id = ?
          `,
        [
          actingPlayer.userId,
          validMatchPlayerId,
          Number(gameState.id),
          validMatchPlayerId,
        ],
      );

      if (Number(stateResult.affectedRows) !== 1) {
        throw createServiceError("Unable to complete Ludo game state.", 409);
      }

      extraTurn = false;
    } else if (playerFinished) {
      nextPlayer = await getNextActivePlayer(
        validMatchId,
        actingPlayer.seatNo,
        connection,
      );

      await moveTurnToPlayer(
        Number(gameState.id),
        validMatchPlayerId,
        nextPlayer,
        actingPlayer,
        "pawn_finished",
        connection,
      );

      extraTurn = false;
    } else if (extraTurn) {
      await prepareExtraTurn(
        Number(gameState.id),
        actingPlayer,
        captured
          ? "pawn_killed"
          : pawnFinished
            ? "pawn_finished"
            : "pawn_moved",
        connection,
      );
    } else {
      nextPlayer = await getNextActivePlayer(
        validMatchId,
        actingPlayer.seatNo,
        connection,
      );

      await moveTurnToPlayer(
        Number(gameState.id),
        validMatchPlayerId,
        nextPlayer,
        actingPlayer,
        "pawn_moved",
        connection,
      );
    }

    pawnMoveResult = {
      pawnId: Number(pawn.id),

      pawnNo: validPawnNo,

      matchPlayerId: validMatchPlayerId,

      userId: actingPlayer.userId,

      isBot: actingPlayer.isBot,

      color: actingPlayer.color,

      previousStatus,

      status: nextStatus,

      diceValue,

      totalSteps: Number(destination.totalSteps),

      pathPosition:
        nextStatus === "finished"
          ? FINISHED_STEP
          : Number(destination.relativePathPosition),

      coordinate,

      isSafe: destinationIsSafe,

      capturedPawnIds,

      captured,

      finishedOrder,

      finishedPawnCount,

      playerFinished,

      playerFinishPosition,

      matchCompleted,

      extraTurn,

      nextTurnPlayerId: nextPlayer
        ? nextPlayer.matchPlayerId
        : extraTurn
          ? validMatchPlayerId
          : null,

      nextTurnUserId: nextPlayer
        ? nextPlayer.userId
        : extraTurn
          ? actingPlayer.userId
          : null,

      nextTurnColor: nextPlayer
        ? nextPlayer.color
        : extraTurn
          ? actingPlayer.color
          : null,
    };

    await connection.commit();
  } catch (error) {
    await connection.rollback();

    throw error;
  } finally {
    connection.release();
  }

  const matchState = await buildMatchState(validMatchId);

  return {
    matchState,

    pawnMove: {
      ...pawnMoveResult,

      stateVersion: Number(matchState.gameState?.stateVersion || 0),
    },
  };
}

/* ==========================================
   Public Real-player Pawn Move
========================================== */

async function movePawn(matchId, userId, pawnNo) {
  const validMatchId = parsePositiveInteger(matchId);

  const validUserId = parsePositiveInteger(userId);

  if (!validMatchId || !validUserId) {
    throw createServiceError("Invalid Ludo pawn request.", 400);
  }

  const matchPlayerId = await resolveRealMatchPlayerId(
    validMatchId,
    validUserId,
  );

  return movePawnForPlayer(validMatchId, matchPlayerId, pawnNo);
}

/* END OF SECTION 3 */

/* ==========================================
   PMS ADDA LUDO SERVICE
   SECTION 4: SETTLEMENT + BOT + EXPORTS
========================================== */

/* ==========================================
   Prize Credit: Real Player
========================================== */

async function creditRealPlayerPrize(match, player, prizeAmount, connection) {
  const userId = Number(player.user_id);

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
    [userId],
  );

  const user = userRows[0] || null;

  if (!user) {
    throw createServiceError("Prize winner user was not found.", 404);
  }

  const balanceBefore = Number(user.wallet_balance);

  const balanceAfter = Number((balanceBefore + prizeAmount).toFixed(2));

  const [walletResult] = await connection.query(
    `
        UPDATE users
        SET wallet_balance = ?
        WHERE id = ?
      `,
    [balanceAfter, userId],
  );

  if (Number(walletResult.affectedRows) !== 1) {
    throw createServiceError("Unable to credit Ludo prize.", 409);
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
        'ludo_match',
        ?,
        ?,
        NULL
      )
    `,
    [
      createWalletTransactionId(),
      userId,
      prizeAmount,
      balanceBefore,
      balanceAfter,
      String(match.id),
      `Ludo match ${match.match_code} prize`,
    ],
  );

  return {
    balanceBefore,
    balanceAfter,
  };
}

/* ==========================================
   Prize Credit: Bot
========================================== */

async function creditBotPlayerPrize(player, prizeAmount, isWinner, connection) {
  const botId = Number(player.bot_id);

  const [result] = await connection.query(
    `
        UPDATE ludo_bots
        SET
          wallet_balance =
            wallet_balance + ?,

          total_prize =
            total_prize + ?,

          total_wins =
            total_wins + ?

        WHERE id = ?
      `,
    [prizeAmount, prizeAmount, isWinner ? 1 : 0, botId],
  );

  if (Number(result.affectedRows) !== 1) {
    throw createServiceError("Unable to credit Ludo bot prize.", 409);
  }

  return true;
}

/* ==========================================
   Credit Match Player Prize
========================================== */

async function creditMatchPlayerPrize(
  match,
  player,
  prizeAmount,
  isWinner,
  connection,
) {
  const amount = Number(prizeAmount);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw createServiceError("Invalid Ludo prize amount.", 500);
  }

  if (Boolean(player.prize_credited)) {
    throw createServiceError("Ludo prize was already credited.", 409);
  }

  if (Boolean(player.is_bot)) {
    await creditBotPlayerPrize(player, amount, isWinner, connection);
  } else {
    await creditRealPlayerPrize(match, player, amount, connection);
  }

  const [playerResult] = await connection.query(
    `
        UPDATE ludo_match_players
        SET
          prize_amount = ?,
          prize_credited = 1
        WHERE id = ?
          AND prize_credited = 0
      `,
    [amount, Number(player.id)],
  );

  if (Number(playerResult.affectedRows) !== 1) {
    throw createServiceError("Unable to mark Ludo prize as credited.", 409);
  }

  return true;
}

/* ==========================================
   Final Prize Settlement
========================================== */

async function settleMatchPrizes(matchId, connection, options = {}) {
  const allowMissingRunnerUp = Boolean(options.allowMissingRunnerUp);
  const [matchRows] = await connection.query(
    `
        SELECT
          id,
          match_code,
          player_mode,
          first_prize,
          second_prize,
          match_status,
          settlement_completed
        FROM ludo_matches
        WHERE id = ?
        LIMIT 1
        FOR UPDATE
      `,
    [matchId],
  );

  const match = matchRows[0] || null;

  if (!match) {
    throw createServiceError("Ludo settlement match was not found.", 404);
  }

  if (Boolean(match.settlement_completed)) {
    return false;
  }

  const [finishers] = await connection.query(
    `
        SELECT
          id,
          user_id,
          bot_id,
          is_bot,
          finish_position,
          prize_amount,
          prize_credited
        FROM ludo_match_players
        WHERE match_id = ?
          AND finish_position
              IS NOT NULL
        ORDER BY finish_position ASC
        FOR UPDATE
      `,
    [matchId],
  );

  const winner =
    finishers.find((player) => Number(player.finish_position) === 1) || null;

  if (!winner) {
    throw createServiceError("Ludo winner was not found.", 409);
  }

  const playerMode = Number(match.player_mode);

  const runnerUp =
    playerMode === 4
      ? finishers.find((player) => Number(player.finish_position) === 2) || null
      : null;

  /*
   * Normal 4-player settlement-এ runner-up
   * প্রয়োজন।
   *
   * কিন্তু সব real player Exit করে শুধু একটি
   * active bot বাকি থাকলে runner-up ছাড়াই
   * match complete করা যাবে।
   */
  if (playerMode === 4 && !runnerUp && !allowMissingRunnerUp) {
    throw createServiceError("Ludo runner-up was not found.", 409);
  }

  await creditMatchPlayerPrize(
    match,
    winner,
    Number(match.first_prize),
    true,
    connection,
  );

  /*
   * 4-player match-এ runner-up prize-ও
   * একই transaction-এর মধ্যে credit হবে।
   */
  if (
    playerMode === 4 &&
    runnerUp &&
    Number(match.second_prize) > 0
  ) {
    await creditMatchPlayerPrize(
      match,
      runnerUp,
      Number(match.second_prize),
      false,
      connection,
    );
  }

  const winnerUserId = winner.user_id ? Number(winner.user_id) : null;

  const secondUserId = runnerUp?.user_id ? Number(runnerUp.user_id) : null;

  const [settlementResult] = await connection.query(
    `
        UPDATE ludo_matches
        SET
          match_status = 'completed',
          settlement_completed = 1,
          winner_player_id = ?,
          second_player_id = ?,
          winner_user_id = ?,
          second_user_id = ?,
          completed_at = NOW()
        WHERE id = ?
          AND settlement_completed = 0
          AND match_status = 'playing'
      `,
    [
      Number(winner.id),
      runnerUp ? Number(runnerUp.id) : null,
      winnerUserId,
      secondUserId,
      matchId,
    ],
  );

  if (Number(settlementResult.affectedRows) !== 1) {
    throw createServiceError("Unable to complete Ludo settlement.", 409);
  }

  /*
   * Prize না পাওয়া active players
   * game শেষে finished status পাবে,
   * কিন্তু finish_position NULL থাকবে।
   */
  await connection.query(
    `
      UPDATE ludo_match_players
      SET
        player_status = 'finished',
        finished_at =
          COALESCE(
            finished_at,
            NOW()
          )
      WHERE match_id = ?
        AND player_status IN (
          'playing',
          'disconnected'
        )
    `,
    [matchId],
  );

  return {
    winnerPlayerId: Number(winner.id),

    winnerUserId,

    secondPlayerId: runnerUp ? Number(runnerUp.id) : null,

    secondUserId,

    firstPrize: Number(match.first_prize),

    secondPrize:
      playerMode === 4 && runnerUp
        ? Number(match.second_prize)
        : 0,
  };
}

/* ==========================================
   Turn Timeout
========================================== */

async function handleTurnTimeout(matchId, expectedStateVersion = null) {
  const validMatchId = parsePositiveInteger(matchId);

  if (!validMatchId) {
    throw createServiceError("Invalid timeout match ID.", 400);
  }

  const connection = await pool.getConnection();

  let timedOutPlayer = null;
  let nextPlayer = null;
  let skipped = false;

  try {
    await connection.beginTransaction();

    const [matchRows] = await connection.query(
      `
          SELECT
            id,
            match_status
          FROM ludo_matches
          WHERE id = ?
          LIMIT 1
          FOR UPDATE
        `,
      [validMatchId],
    );

    const match = matchRows[0] || null;

    if (!match || match.match_status !== MATCH_STATUS.PLAYING) {
      skipped = true;

      await connection.commit();
    } else {
      const [stateRows] = await connection.query(
        `
            SELECT
              id,
              current_turn_player_id,
              current_turn_user_id,
              current_turn_seat_no,
              current_turn_color,
              turn_expires_at,
              dice_value,
              dice_rolled,
              state_version,

              CASE
                WHEN turn_expires_at
                     IS NOT NULL
                 AND turn_expires_at
                     <= NOW()
                THEN 1
                ELSE 0
              END AS is_expired

            FROM ludo_game_states
            WHERE match_id = ?
              AND game_status =
                  'playing'
            LIMIT 1
            FOR UPDATE
          `,
        [validMatchId],
      );

      const gameState = stateRows[0] || null;

      const versionChanged =
        expectedStateVersion !== null &&
        Number(gameState?.state_version) !== Number(expectedStateVersion);

      if (!gameState || versionChanged || !Boolean(gameState.is_expired)) {
        skipped = true;

        await connection.commit();
      } else {
        const currentPlayer = await getLockedMatchPlayer(
          validMatchId,
          Number(gameState.current_turn_player_id),
          connection,
        );

        if (
          !currentPlayer ||
          currentPlayer.player_status !== PLAYER_STATUS.PLAYING
        ) {
          skipped = true;

          await connection.commit();
        } else {
          timedOutPlayer = {
            matchPlayerId: Number(currentPlayer.id),

            userId: currentPlayer.user_id
              ? Number(currentPlayer.user_id)
              : null,

            botId: currentPlayer.bot_id ? Number(currentPlayer.bot_id) : null,

            isBot: Boolean(currentPlayer.is_bot),

            seatNo: Number(currentPlayer.seat_no),

            color: String(currentPlayer.player_color),

            diceRolled: Boolean(gameState.dice_rolled),

            diceValue:
              gameState.dice_value !== null
                ? Number(gameState.dice_value)
                : null,
          };

          const [activeRows] = await connection.query(
            `
                SELECT COUNT(*) AS total
                FROM ludo_match_players
                WHERE match_id = ?
                  AND player_status =
                      'playing'
              `,
            [validMatchId],
          );

          const activePlayers = Number(activeRows[0]?.total || 0);

          if (activePlayers <= 1) {
            skipped = true;

            await connection.commit();
          } else {
            nextPlayer = await getNextActivePlayer(
              validMatchId,
              timedOutPlayer.seatNo,
              connection,
            );

            await moveTurnToPlayer(
              Number(gameState.id),
              timedOutPlayer.matchPlayerId,
              nextPlayer,
              timedOutPlayer,
              "turn_changed",
              connection,
            );

            await connection.commit();
          }
        }
      }
    }
  } catch (error) {
    await connection.rollback();

    throw error;
  } finally {
    connection.release();
  }

  const matchState = await buildMatchState(validMatchId);

  return {
    skipped,
    matchState,

    timeout: timedOutPlayer
      ? {
          timedOutPlayerId: timedOutPlayer.matchPlayerId,

          timedOutUserId: timedOutPlayer.userId,

          color: timedOutPlayer.color,

          diceWasRolled: timedOutPlayer.diceRolled,

          forfeitedDiceValue: timedOutPlayer.diceValue,

          nextTurnPlayerId: nextPlayer?.matchPlayerId || null,

          nextTurnUserId: nextPlayer?.userId || null,

          nextTurnColor: nextPlayer?.color || null,
        }
      : null,
  };
}

/* ==========================================
   Real Player Forfeit / Exit
========================================== */

async function getRankedActiveBotPlayers(matchId, connection) {
  const [rows] = await connection.query(
    `
      SELECT
        lmp.id,
        lmp.user_id,
        lmp.bot_id,
        lmp.is_bot,
        lmp.bot_level,
        lmp.seat_no,
        lmp.player_color,
        lmp.player_status,

        COALESCE(
          SUM(
            CASE
              WHEN lp.pawn_status =
                   'finished'
              THEN 1
              ELSE 0
            END
          ),
          0
        ) AS finished_pawns,

        COALESCE(
          SUM(lp.total_steps),
          0
        ) AS total_progress,

        COALESCE(
          MAX(lp.total_steps),
          0
        ) AS furthest_pawn

      FROM ludo_match_players lmp

      LEFT JOIN ludo_pawns lp
        ON lp.match_id = lmp.match_id
       AND lp.match_player_id = lmp.id

      WHERE lmp.match_id = ?
        AND lmp.is_bot = 1
        AND lmp.player_status =
            'playing'

      GROUP BY
        lmp.id,
        lmp.user_id,
        lmp.bot_id,
        lmp.is_bot,
        lmp.bot_level,
        lmp.seat_no,
        lmp.player_color,
        lmp.player_status

      ORDER BY
        finished_pawns DESC,
        total_progress DESC,
        furthest_pawn DESC,
        lmp.seat_no ASC
    `,
    [matchId],
  );

  return rows;
}

async function forfeitPlayer(matchId, userId) {
  const validMatchId = parsePositiveInteger(matchId);

  const validUserId = parsePositiveInteger(userId);

  if (!validMatchId || !validUserId) {
    throw createServiceError("Invalid Ludo forfeit request.", 400);
  }

  const connection = await pool.getConnection();

  let completed = false;
  let alreadyInactive = false;
  let forfeitedPlayerId = null;
  let winnerPlayerId = null;
  let nextPlayer = null;

  try {
    await connection.beginTransaction();

    const [matchRows] = await connection.query(
      `
          SELECT
            id,
            player_mode,
            match_status,
            settlement_completed
          FROM ludo_matches
          WHERE id = ?
          LIMIT 1
          FOR UPDATE
        `,
      [validMatchId],
    );

    const match = matchRows[0] || null;

    if (!match) {
      throw createServiceError("Ludo match was not found.", 404);
    }

    if (
      match.match_status === MATCH_STATUS.COMPLETED ||
      Boolean(match.settlement_completed)
    ) {
      alreadyInactive = true;

      await connection.commit();
    } else {
      const [playerRows] = await connection.query(
        `
            SELECT
              id,
              user_id,
              bot_id,
              is_bot,
              seat_no,
              player_color,
              player_status,
              finish_position
            FROM ludo_match_players
            WHERE match_id = ?
              AND user_id = ?
              AND is_bot = 0
            LIMIT 1
            FOR UPDATE
          `,
        [validMatchId, validUserId],
      );

      const player = playerRows[0] || null;

      if (!player) {
        throw createServiceError(
          "You are not a player of this Ludo match.",
          403,
        );
      }

      forfeitedPlayerId = Number(player.id);

      if (
        player.player_status === PLAYER_STATUS.LEFT ||
        player.player_status === PLAYER_STATUS.FINISHED
      ) {
        alreadyInactive = true;

        await connection.commit();
      } else {
        const wasCurrentStatus = String(player.player_status);

        await connection.query(
          `
            UPDATE ludo_match_players
            SET
              player_status = 'left',
              finished_at = NOW()
            WHERE id = ?
              AND player_status IN (
                'waiting',
                'ready',
                'playing',
                'disconnected'
              )
          `,
          [forfeitedPlayerId],
        );

        await connection.query(
          `
            UPDATE ludo_matches
            SET current_players = (
              SELECT COUNT(*)
              FROM ludo_match_players
              WHERE match_id = ?
                AND player_status !=
                    'left'
            )
            WHERE id = ?
          `,
          [validMatchId, validMatchId],
        );

        if (
          match.match_status === MATCH_STATUS.WAITING ||
          match.match_status === MATCH_STATUS.STARTING
        ) {
          const [remainingRows] = await connection.query(
            `
                SELECT COUNT(*) AS total
                FROM ludo_match_players
                WHERE match_id = ?
                  AND player_status !=
                      'left'
              `,
            [validMatchId],
          );

          if (Number(remainingRows[0]?.total || 0) === 0) {
            await connection.query(
              `
                UPDATE ludo_matches
                SET
                  match_status =
                    'cancelled',
                  cancelled_at = NOW()
                WHERE id = ?
                  AND match_status IN (
                    'waiting',
                    'starting'
                  )
              `,
              [validMatchId],
            );
          }

          await connection.commit();
        } else if (match.match_status === MATCH_STATUS.PLAYING) {
          const [stateRows] = await connection.query(
            `
                SELECT
                  id,
                  current_turn_player_id,
                  current_turn_seat_no,
                  game_status
                FROM ludo_game_states
                WHERE match_id = ?
                LIMIT 1
                FOR UPDATE
              `,
            [validMatchId],
          );

          const gameState = stateRows[0] || null;

          const [activePlayers] = await connection.query(
            `
                SELECT
                  id,
                  user_id,
                  bot_id,
                  is_bot,
                  bot_level,
                  seat_no,
                  player_color,
                  player_status
                FROM ludo_match_players
                WHERE match_id = ?
                  AND player_status =
                      'playing'
                ORDER BY seat_no ASC
                FOR UPDATE
              `,
            [validMatchId],
          );

          const [finishedPlayers] = await connection.query(
            `
                SELECT
                  id,
                  finish_position
                FROM ludo_match_players
                WHERE match_id = ?
                  AND finish_position
                      IS NOT NULL
                ORDER BY
                  finish_position ASC
                FOR UPDATE
              `,
            [validMatchId],
          );

          const firstFinisher =
            finishedPlayers.find(
              (item) => Number(item.finish_position) === 1,
            ) || null;

          const secondFinisher =
            finishedPlayers.find(
              (item) => Number(item.finish_position) === 2,
            ) || null;

          const activeRealPlayers =
            activePlayers.filter(
              (item) => !Boolean(item.is_bot),
            );

          const shouldCompleteBotOnlyMatch =
            Number(match.player_mode) === 4 &&
            activePlayers.length > 0 &&
            activeRealPlayers.length === 0;

          /*
           * 4-player match-এর শেষ real player
           * Exit করলে bots আর autoplay করবে না।
           *
           * Pawn progress অনুযায়ী leading bot
           * 1st এবং পরের bot 2nd হবে। আগে কোনো
           * finisher থাকলে শুধু খালি position
           * progress-ranked bot দিয়ে পূরণ হবে।
           */
          if (shouldCompleteBotOnlyMatch) {
            const rankedBots =
              await getRankedActiveBotPlayers(
                validMatchId,
                connection,
              );

            const openFinishPositions = [];

            if (!firstFinisher) {
              openFinishPositions.push(1);
            }

            if (!secondFinisher) {
              openFinishPositions.push(2);
            }

            for (
              let index = 0;
              index < openFinishPositions.length &&
              index < rankedBots.length;
              index += 1
            ) {
              const bot = rankedBots[index];
              const finishPosition =
                openFinishPositions[index];

              const [finishResult] =
                await connection.query(
                  `
                    UPDATE ludo_match_players
                    SET
                      player_status =
                        'finished',
                      finish_position = ?,
                      finished_at = NOW()
                    WHERE id = ?
                      AND match_id = ?
                      AND is_bot = 1
                      AND player_status =
                          'playing'
                      AND finish_position
                          IS NULL
                  `,
                  [
                    finishPosition,
                    Number(bot.id),
                    validMatchId,
                  ],
                );

              if (
                Number(finishResult.affectedRows) !== 1
              ) {
                throw createServiceError(
                  "Unable to rank the remaining Ludo bot.",
                  409,
                );
              }

              if (finishPosition === 1) {
                winnerPlayerId = Number(bot.id);
              }
            }

            if (!winnerPlayerId && firstFinisher) {
              winnerPlayerId = Number(firstFinisher.id);
            }

            await settleMatchPrizes(
              validMatchId,
              connection,
              {
                allowMissingRunnerUp: true,
              },
            );

            if (gameState) {
              await connection.query(
                `
                  UPDATE ludo_game_states
                  SET
                    game_status =
                      'completed',
                    current_turn_player_id =
                      NULL,
                    current_turn_user_id =
                      NULL,
                    current_turn_seat_no =
                      NULL,
                    current_turn_color =
                      NULL,
                    turn_started_at = NULL,
                    turn_expires_at = NULL,
                    dice_value = NULL,
                    dice_rolled = 0,
                    consecutive_sixes = 0,
                    last_action_type =
                      'game_completed',
                    last_action_user_id = ?,
                    last_action_player_id = ?,
                    last_action_at = NOW(),
                    state_version =
                      state_version + 1
                  WHERE id = ?
                    AND game_status =
                        'playing'
                `,
                [
                  validUserId,
                  forfeitedPlayerId,
                  Number(gameState.id),
                ],
              );
            }

            completed = true;
          /*
           * একজন active player বাকি থাকলে
           * match শেষ হবে।
           *
           * আগে winner থাকলে remaining
           * player হবে runner-up।
           */
          } else if (activePlayers.length <= 1) {
            const remainingPlayer = activePlayers[0] || null;

            if (remainingPlayer && !firstFinisher) {
              await connection.query(
                `
                  UPDATE ludo_match_players
                  SET
                    player_status =
                      'finished',
                    finish_position = 1,
                    finished_at = NOW()
                  WHERE id = ?
                    AND player_status =
                        'playing'
                `,
                [Number(remainingPlayer.id)],
              );

              winnerPlayerId = Number(remainingPlayer.id);
            } else if (
              remainingPlayer &&
              firstFinisher &&
              Number(match.player_mode) === 4
            ) {
              await connection.query(
                `
                  UPDATE ludo_match_players
                  SET
                    player_status =
                      'finished',
                    finish_position = 2,
                    finished_at = NOW()
                  WHERE id = ?
                    AND player_status =
                        'playing'
                `,
                [Number(remainingPlayer.id)],
              );

              winnerPlayerId = Number(firstFinisher.id);
            } else if (firstFinisher) {
              winnerPlayerId = Number(firstFinisher.id);
            }

            await settleMatchPrizes(validMatchId, connection, {
              allowMissingRunnerUp: true,
            });

            if (gameState) {
              await connection.query(
                `
                  UPDATE ludo_game_states
                  SET
                    game_status =
                      'completed',
                    current_turn_player_id =
                      NULL,
                    current_turn_user_id =
                      NULL,
                    current_turn_seat_no =
                      NULL,
                    current_turn_color =
                      NULL,
                    turn_started_at = NULL,
                    turn_expires_at = NULL,
                    dice_value = NULL,
                    dice_rolled = 0,
                    consecutive_sixes = 0,
                    last_action_type =
                      'game_completed',
                    last_action_user_id =
                      ?,
                    last_action_player_id =
                      ?,
                    last_action_at = NOW(),
                    state_version =
                      state_version + 1
                  WHERE id = ?
                    AND game_status =
                        'playing'
                `,
                [validUserId, forfeitedPlayerId, Number(gameState.id)],
              );
            }

            completed = true;
          } else if (
            gameState &&
            Number(gameState.current_turn_player_id) === forfeitedPlayerId
          ) {
            const afterCurrent =
              activePlayers.find(
                (item) => Number(item.seat_no) > Number(player.seat_no),
              ) || activePlayers[0];

            nextPlayer = {
              matchPlayerId: Number(afterCurrent.id),

              userId:
                !Boolean(afterCurrent.is_bot) && afterCurrent.user_id
                  ? Number(afterCurrent.user_id)
                  : null,

              botId:
                Boolean(afterCurrent.is_bot) && afterCurrent.bot_id
                  ? Number(afterCurrent.bot_id)
                  : null,

              isBot: Boolean(afterCurrent.is_bot),

              botLevel: afterCurrent.bot_level || null,

              seatNo: Number(afterCurrent.seat_no),

              color: String(afterCurrent.player_color),
            };

            const actionPlayer = {
              matchPlayerId: forfeitedPlayerId,

              userId: validUserId,

              seatNo: Number(player.seat_no),

              color: String(player.player_color),
            };

            await moveTurnToPlayer(
              Number(gameState.id),
              forfeitedPlayerId,
              nextPlayer,
              actionPlayer,
              "turn_changed",
              connection,
            );
          }

          await connection.commit();
        } else {
          /*
           * Unknown inactive match state।
           */
          if (wasCurrentStatus === PLAYER_STATUS.PLAYING) {
            throw createServiceError(
              "Unable to forfeit this inactive Ludo match.",
              409,
            );
          }

          await connection.commit();
        }
      }
    }
  } catch (error) {
    await connection.rollback();

    throw error;
  } finally {
    connection.release();
  }

  const matchState = await buildMatchState(validMatchId);

  return {
    success: true,
    completed,
    alreadyInactive,
    forfeitedPlayerId,
    winnerPlayerId,

    nextTurnPlayerId: nextPlayer?.matchPlayerId || null,

    matchState,
  };
}

/* ==========================================
   Bot Helpers
========================================== */

function wait(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function getCurrentBotPlayer(matchId) {
  const [rows] = await pool.query(
    `
        SELECT
          lmp.id,
          lmp.bot_id,
          lmp.bot_level,
          lmp.seat_no,
          lmp.player_color
        FROM ludo_game_states lgs

        INNER JOIN ludo_match_players lmp
          ON lmp.id =
             lgs.current_turn_player_id

        INNER JOIN ludo_matches lm
          ON lm.id = lgs.match_id

        WHERE lgs.match_id = ?
          AND lm.match_status = 'playing'
          AND lgs.game_status = 'playing'
          AND lmp.is_bot = 1
          AND lmp.player_status = 'playing'

        LIMIT 1
      `,
    [matchId],
  );

  const bot = rows[0] || null;

  if (!bot) {
    return null;
  }

  return {
    matchPlayerId: Number(bot.id),

    botId: Number(bot.bot_id),

    botLevel: bot.bot_level || "smart",

    seatNo: Number(bot.seat_no),

    color: bot.player_color,
  };
}

/* ==========================================
   Bot Pawn Selection
========================================== */

function chooseBotPawn(matchState, botPlayerId, diceValue, botLevel) {
  const botPawns = matchState.pawns.filter(
    (pawn) =>
      Number(pawn.matchPlayerId) === Number(botPlayerId) &&
      canPawnMove(
        {
          pawn_status: pawn.status,

          total_steps: pawn.totalSteps,
        },
        diceValue,
      ),
  );

  if (botPawns.length === 0) {
    return null;
  }

  const opponentPawns = matchState.pawns.filter(
    (pawn) =>
      Number(pawn.matchPlayerId) !== Number(botPlayerId) &&
      pawn.status === "active" &&
      pawn.boardCoordinate,
  );

  const scoredPawns = botPawns.map((pawn) => {
    let destination;

    if (pawn.status === "yard") {
      destination = getPawnPosition(pawn.color, 0);
    } else {
      destination = calculatePawnDestination(
        pawn.color,
        pawn.totalSteps,
        diceValue,
      );
    }

    if (!destination) {
      return {
        pawn,
        score: -1,
      };
    }

    let score = Number(destination.totalSteps || 0);

    /*
     * Finish সবচেয়ে বেশি priority।
     */
    if (destination.status === "finished") {
      score += 1000;
    }

    /*
     * Opponent capture priority।
     */
    const canCapture =
      destination.status === "active" &&
      destination.coordinate &&
      !isSafeCoordinate(destination.coordinate) &&
      opponentPawns.some(
        (opponent) => opponent.boardCoordinate === destination.coordinate,
      );

    if (canCapture) {
      score += 600;
    }

    /*
     * Yard থেকে pawn বের করা।
     */
    if (pawn.status === "yard") {
      score += 250;
    }

    /*
     * Safe cell bonus।
     */
    if (destination.coordinate && isSafeCoordinate(destination.coordinate)) {
      score += 80;
    }

    /*
     * Smart Bot best move বেশি পছন্দ করবে।
     * Normal Bot-এ কিছু randomness থাকবে।
     */
    if (botLevel === "normal") {
      score += crypto.randomInt(0, 180);
    } else {
      score += crypto.randomInt(0, 35);
    }

    return {
      pawn,
      score,
    };
  });

  scoredPawns.sort((first, second) => second.score - first.score);

  return scoredPawns[0]?.pawn || null;
}

/* ==========================================
   Bot Turn Lock
========================================== */

const runningBotMatches = new Set();

/* ==========================================
   Run Complete Bot Turn
========================================== */

async function runBotTurn(matchId) {
  const validMatchId = parsePositiveInteger(matchId);

  if (!validMatchId) {
    throw createServiceError("Invalid Bot match ID.", 400);
  }

  if (runningBotMatches.has(validMatchId)) {
    return {
      skipped: true,
      actions: [],
      matchState: await buildMatchState(validMatchId),
    };
  }

  runningBotMatches.add(validMatchId);

  const actions = [];

  try {
    /*
     * 6, capture বা finish-এর কারণে
     * Bot extra turn পেতে পারে।
     *
     * Safety limit infinite loop আটকাবে।
     */
    for (let actionCount = 0; actionCount < 12; actionCount += 1) {
      const bot = await getCurrentBotPlayer(validMatchId);

      if (!bot) {
        break;
      }

      await wait(crypto.randomInt(700, 1301));

      const diceResult = await rollDiceForPlayer(
        validMatchId,
        bot.matchPlayerId,
      );

      actions.push({
        type: "dice",
        data: diceResult.diceResult,
      });

      if (
        diceResult.diceResult.thirdSixForfeited ||
        diceResult.diceResult.noValidMoves
      ) {
        continue;
      }

      const diceValue = Number(diceResult.diceResult.value);

      const selectedPawn = chooseBotPawn(
        diceResult.matchState,
        bot.matchPlayerId,
        diceValue,
        bot.botLevel,
      );

      if (!selectedPawn) {
        throw createServiceError("Bot could not select a legal pawn.", 409);
      }

      await wait(crypto.randomInt(450, 901));

      const moveResult = await movePawnForPlayer(
        validMatchId,
        bot.matchPlayerId,
        selectedPawn.pawnNo,
      );

      actions.push({
        type: "pawn",
        data: moveResult.pawnMove,
      });

      if (moveResult.pawnMove.matchCompleted) {
        break;
      }

      const nextBot = await getCurrentBotPlayer(validMatchId);

      if (!nextBot) {
        break;
      }
    }

    return {
      skipped: false,

      actions,

      matchState: await buildMatchState(validMatchId),
    };
  } finally {
    runningBotMatches.delete(validMatchId);
  }
}

/* ==========================================
   Render Restart Recovery
========================================== */

async function getRecoverablePlayingMatches() {
  const [rows] = await pool.query(
    `
      SELECT
        id,
        match_code,
        player_mode,
        current_players,
        match_status,
        entry_collected,
        settlement_completed,
        started_at,
        updated_at
      FROM ludo_matches
      WHERE match_status = 'playing'
        AND entry_collected = 1
        AND settlement_completed = 0
      ORDER BY id ASC
    `,
  );

  return rows.map((match) => ({
    matchId: Number(match.id),
    matchCode: match.match_code || null,
    playerMode: Number(match.player_mode),
    currentPlayers: Number(match.current_players || 0),
    status: String(match.match_status),
    startedAt: match.started_at || null,
    updatedAt: match.updated_at || null,
  }));
}

/* ==========================================
   Service Exports
========================================== */

module.exports = {
  getAvailableRooms,
  joinMatchmaking,
  finalizeMatchmaking,

  getMatchState,
  getRecoverablePlayingMatches,

  rollDice,
  movePawn,

  runBotTurn,
  handleTurnTimeout,
  forfeitPlayer,

  /*
   * Socket layer প্রয়োজন হলে
   * internal Bot actor ব্যবহার করবে।
   */
  rollDiceForPlayer,
  movePawnForPlayer,

  MATCHMAKING_WAIT_SECONDS,
  TURN_DURATION_SECONDS,

  ALLOWED_ENTRY_AMOUNTS,
  ALLOWED_PLAYER_MODES,
};

/* END OF LUDO SERVICE */
