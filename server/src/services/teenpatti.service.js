"use strict";

const crypto = require("crypto");

const { pool } = require("../config/database");

const {
  dealCards,
  evaluateHand,
  compareHands,
  findWinningHands,
  serializeCards,
  deserializeCards,
} = require("./teenpatti.engine");

/* =========================================================
   GAME CONSTANTS
========================================================= */

const MAX_PLAYERS = 5;
const MIN_PLAYERS = 2;

const TURN_SECONDS = 15;
const SIDE_SHOW_SECONDS = 10;
const RECONNECT_GRACE_SECONDS = 20;
const NEXT_HAND_DELAY_MS = 4000;

const MATCHMAKING_SECONDS = 20;
const MAX_BLIND_TURNS = 3;

const DEFAULT_SERVICE_CHARGE_PERCENT = 5;

const ALLOWED_BOOT_AMOUNTS = Object.freeze([
  5, 10, 20, 30, 50, 100, 200, 500, 1000,
]);

const TABLE_STATUS = Object.freeze({
  WAITING: "waiting",
  PLAYING: "playing",
  FINISHED: "finished",
});

const HAND_STATUS = Object.freeze({
  STARTING: "starting",
  PLAYING: "playing",
  SHOWDOWN: "showdown",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
});

const PLAYER_STATUS = Object.freeze({
  ACTIVE: "active",
  PACKED: "packed",
  TIMEOUT: "timeout",
  LEFT: "left",
  WINNER: "winner",
});

const PLAYER_TYPE = Object.freeze({
  REAL: "real",
  BOT: "bot",
});

const ACTION_TYPE = Object.freeze({
  BOOT: "boot",
  BLIND: "blind",
  CHAAL: "chaal",
  RAISE: "raise",
  PACK: "pack",
  SHOW: "show",
  SIDE_SHOW: "side_show",
  TIMEOUT: "timeout",
});

/* =========================================================
   ERROR HELPERS
========================================================= */

function createServiceError(
  message,
  statusCode = 500,
  code = "TEEN_PATTI_ERROR",
) {
  const error = new Error(message);

  error.status = statusCode;
  error.statusCode = statusCode;
  error.code = code;

  return error;
}

function assertCondition(
  condition,
  message,
  statusCode = 400,
  code = "INVALID_REQUEST",
) {
  if (!condition) {
    throw createServiceError(message, statusCode, code);
  }
}

/* =========================================================
   VALUE HELPERS
========================================================= */

function parsePositiveInteger(value) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function parseMoney(value, fallback = 0) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return Number(fallback);
  }

  return Number(parsed.toFixed(2));
}

function calculatePercentage(amount, percentage) {
  const validAmount = parseMoney(amount);
  const validPercentage = parseMoney(percentage);

  return Number(((validAmount * validPercentage) / 100).toFixed(2));
}

function createDateAfterSeconds(seconds) {
  const validSeconds = Math.max(1, Number(seconds) || 1);

  return new Date(Date.now() + validSeconds * 1000);
}

function createTransactionId(prefix = "TP") {
  const randomPart = crypto.randomBytes(5).toString("hex").toUpperCase();

  return `${prefix}_${Date.now()}_${randomPart}`.slice(0, 40);
}

function createTableCode() {
  const randomPart = crypto.randomBytes(4).toString("hex").toUpperCase();

  return `TP_${Date.now()}_${randomPart}`.slice(0, 30);
}

function normalizeBoolean(value) {
  return value === true || Number(value) === 1;
}

/* =========================================================
   TRANSACTION WRAPPER
========================================================= */

async function withTransaction(work) {
  const connection = await pool.getConnection();

  let transactionStarted = false;

  try {
    await connection.beginTransaction();

    transactionStarted = true;

    const result = await work(connection);

    await connection.commit();

    return result;
  } catch (error) {
    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("TEEN PATTI ROLLBACK ERROR:", rollbackError);
      }
    }

    throw error;
  } finally {
    connection.release();
  }
}

/* =========================================================
   TABLE QUERIES
========================================================= */

async function getLockedTable(connection, tableId) {
  const [rows] = await connection.query(
    `
    SELECT
      gt.id,
      gt.room_id,
      gt.table_code,
      gt.game_status,
      gt.current_round,

      gt.matchmaking_started_at,
      gt.matchmaking_expires_at,
      gt.matchmaking_completed,

      gt.pot_amount,

      gr.room_code,
      gr.room_name,
      gr.game_type,
      gr.max_players,
      gr.boot_amount,
      gr.service_charge,
      gr.status AS room_status

    FROM game_tables gt

    INNER JOIN game_rooms gr
      ON gr.id = gt.room_id

    WHERE gt.id = ?
      AND gr.game_type = 'teen_patti'

    LIMIT 1
    FOR UPDATE
    `,
    [tableId],
  );

  return rows[0] || null;
}

async function getTable(connection, tableId) {
  const [rows] = await connection.query(
    `
    SELECT
      gt.id,
      gt.room_id,
      gt.table_code,
      gt.game_status,
      gt.current_round,

      gt.matchmaking_started_at,
      gt.matchmaking_expires_at,
      gt.matchmaking_completed,

      gt.pot_amount,

      gr.room_code,
      gr.room_name,
      gr.game_type,
      gr.max_players,
      gr.boot_amount,
      gr.service_charge,
      gr.status AS room_status

    FROM game_tables gt

    INNER JOIN game_rooms gr
      ON gr.id = gt.room_id

    WHERE gt.id = ?
      AND gr.game_type = 'teen_patti'

    LIMIT 1
    `,
    [tableId],
  );

  return rows[0] || null;
}

async function getLockedUser(connection, userId) {
  const [rows] = await connection.query(
    `
    SELECT
      id,
      uid,
      full_name,
      username,
      role,
      account_status,
      wallet_balance

    FROM users

    WHERE id = ?

    LIMIT 1
    FOR UPDATE
    `,
    [userId],
  );

  return rows[0] || null;
}

/* =========================================================
   TABLE MEMBERS
========================================================= */

async function getTableMembers(connection, tableId, options = {}) {
  const lockSuffix = options.lock === true ? "FOR UPDATE" : "";

  const [realRows] = await connection.query(
    `
      SELECT
        tp.id AS membership_id,
        'real' AS player_type,

        tp.id AS table_player_id,
        NULL AS table_bot_id,

        tp.user_id,
        NULL AS bot_id,

        tp.seat_no,
        tp.is_dealer,
        tp.is_active,
        tp.is_seen,
        tp.is_packed,
        tp.current_bet,
        tp.total_win,

        u.uid,
        u.full_name,
        u.username,
        NULL AS bot_code,
        NULL AS bot_name,
        NULL AS avatar_url,

        u.wallet_balance

      FROM table_players tp

      INNER JOIN users u
        ON u.id = tp.user_id

      WHERE tp.table_id = ?

      ORDER BY tp.seat_no ASC

      ${lockSuffix}
      `,
    [tableId],
  );

  const [botRows] = await connection.query(
    `
      SELECT
        tb.id AS membership_id,
        'bot' AS player_type,

        NULL AS table_player_id,
        tb.id AS table_bot_id,

        NULL AS user_id,
        tb.bot_id,

        tb.seat_no,
        tb.is_dealer,
        tb.is_active,
        tb.is_seen,
        tb.is_packed,
        tb.current_bet,
        tb.total_win,

        NULL AS uid,
        NULL AS full_name,
        NULL AS username,
        b.bot_code,
        b.bot_name,
        b.avatar_url,

        b.wallet_balance

      FROM table_bots tb

      INNER JOIN teen_patti_bots b
        ON b.id = tb.bot_id

      WHERE tb.table_id = ?

      ORDER BY tb.seat_no ASC

      ${lockSuffix}
      `,
    [tableId],
  );

  return [...realRows, ...botRows]
    .map((row) => ({
      membershipId: Number(row.membership_id),

      playerType: row.player_type,

      tablePlayerId:
        row.table_player_id === null ? null : Number(row.table_player_id),

      tableBotId: row.table_bot_id === null ? null : Number(row.table_bot_id),

      userId: row.user_id === null ? null : Number(row.user_id),

      botId: row.bot_id === null ? null : Number(row.bot_id),

      seatNo: Number(row.seat_no),

      isDealer: normalizeBoolean(row.is_dealer),

      isActive: normalizeBoolean(row.is_active),

      isSeen: normalizeBoolean(row.is_seen),

      isPacked: normalizeBoolean(row.is_packed),

      currentBet: parseMoney(row.current_bet),

      totalWin: parseMoney(row.total_win),

      uid: row.uid || null,

      name:
        row.player_type === PLAYER_TYPE.BOT
          ? row.bot_name || row.bot_code || "Bot"
          : row.full_name || row.username || row.uid || "Player",

      avatarUrl: row.avatar_url || null,

      walletBalance: parseMoney(row.wallet_balance),
    }))
    .sort(
      (firstPlayer, secondPlayer) => firstPlayer.seatNo - secondPlayer.seatNo,
    );
}

async function getActiveTableMembers(connection, tableId, options = {}) {
  const members = await getTableMembers(connection, tableId, options);

  return members.filter((member) => member.isActive === true);
}

async function getTablePlayerByUser(connection, tableId, userId, options = {}) {
  const members = await getTableMembers(connection, tableId, options);

  return (
    members.find(
      (member) =>
        member.playerType === PLAYER_TYPE.REAL &&
        Number(member.userId) === Number(userId),
    ) || null
  );
}

function countMemberTypes(members) {
  const realPlayers = members.filter(
    (member) => member.playerType === PLAYER_TYPE.REAL,
  );

  const bots = members.filter(
    (member) => member.playerType === PLAYER_TYPE.BOT,
  );

  return {
    real: realPlayers.length,
    bots: bots.length,
    total: members.length,
    empty: Math.max(0, MAX_PLAYERS - members.length),
  };
}

function findAvailableSeat(members) {
  const usedSeats = new Set(members.map((member) => Number(member.seatNo)));

  for (let seatNo = 1; seatNo <= MAX_PLAYERS; seatNo += 1) {
    if (!usedSeats.has(seatNo)) {
      return seatNo;
    }
  }

  return null;
}

function findNextActiveMember(members, currentSeatNo) {
  const activeMembers = members
    .filter((member) => member.playerStatus === PLAYER_STATUS.ACTIVE)
    .sort(
      (firstMember, secondMember) => firstMember.seatNo - secondMember.seatNo,
    );

  if (activeMembers.length === 0) {
    return null;
  }

  const currentSeat = Number(currentSeatNo);

  for (let offset = 1; offset <= MAX_PLAYERS; offset += 1) {
    const expectedSeat = ((currentSeat - 1 + offset) % MAX_PLAYERS) + 1;

    const member = activeMembers.find((item) => item.seatNo === expectedSeat);

    if (member) {
      return member;
    }
  }

  return activeMembers[0];
}

/* =========================================================
   ROOM AND TABLE STATE HELPERS
========================================================= */

async function getTeenPattiRoom(connection, roomId, options = {}) {
  const lockSuffix = options.lock === true ? "FOR UPDATE" : "";

  const [rows] = await connection.query(
    `
    SELECT
      id,
      room_code,
      room_name,
      game_type,
      max_players,
      current_players,
      boot_amount,
      service_charge,
      status

    FROM game_rooms

    WHERE id = ?
      AND game_type = 'teen_patti'

    LIMIT 1

    ${lockSuffix}
    `,
    [roomId],
  );

  return rows[0] || null;
}

async function getOrCreateTeenPattiRoom(bootAmount) {
  const validBootAmount = parsePositiveInteger(bootAmount);

  assertCondition(
    validBootAmount !== null && ALLOWED_BOOT_AMOUNTS.includes(validBootAmount),
    "Invalid Teen Patti boot amount.",
    400,
    "INVALID_BOOT_AMOUNT",
  );

  const [existingRows] = await pool.query(
    `
    SELECT
      id
    FROM game_rooms
    WHERE game_type = 'teen_patti'
      AND boot_amount = ?
      AND status <> 'disabled'
    ORDER BY id ASC
    LIMIT 1
    `,
    [validBootAmount],
  );

  if (existingRows.length > 0) {
    return Number(existingRows[0].id);
  }

  const roomCode = `TP_${validBootAmount}_${crypto
    .randomBytes(3)
    .toString("hex")
    .toUpperCase()}`;

  const roomName = `Teen Patti ৳${validBootAmount} Room`;

  const [insertResult] = await pool.query(
    `
    INSERT INTO game_rooms (
      room_code,
      game_type,
      room_name,
      max_players,
      current_players,
      boot_amount,
      service_charge,
      status
    )
    VALUES (
      ?,
      'teen_patti',
      ?,
      ?,
      0,
      ?,
      ?,
      'waiting'
    )
    `,
    [
      roomCode,
      roomName,
      MAX_PLAYERS,
      validBootAmount,
      DEFAULT_SERVICE_CHARGE_PERCENT,
    ],
  );

  return Number(insertResult.insertId);
}

async function createTable(roomId) {
  const validRoomId = parsePositiveInteger(roomId);

  assertCondition(
    validRoomId !== null,
    "Valid Teen Patti room ID is required.",
    400,
    "INVALID_ROOM_ID",
  );

  return withTransaction(async (connection) => {
    const room = await getTeenPattiRoom(connection, validRoomId, {
      lock: true,
    });

    assertCondition(room, "Teen Patti room not found.", 404, "ROOM_NOT_FOUND");

    assertCondition(
      room.status !== "disabled",
      "Teen Patti room is disabled.",
      403,
      "ROOM_DISABLED",
    );

    const tableCode = createTableCode();

    const [insertResult] = await connection.query(
      `
          INSERT INTO game_tables (
            room_id,
            table_code,
            game_status,
            current_round,
            pot_amount
          )
          VALUES (
            ?,
            ?,
            'waiting',
            1,
            0.00
          )
          `,
      [validRoomId, tableCode],
    );

    return {
      tableId: Number(insertResult.insertId),

      roomId: validRoomId,
      tableCode,
      status: TABLE_STATUS.WAITING,
    };
  });
}

/* =========================================================
   BOT MANAGEMENT
========================================================= */

async function selectAvailableBot(connection, tableId, minimumBalance) {
  const [rows] = await connection.query(
    `
    SELECT
      b.id,
      b.bot_code,
      b.bot_name,
      b.avatar_url,
      b.wallet_balance,
      b.difficulty,
      b.playing_style

    FROM teen_patti_bots b

    WHERE b.status = 'active'
      AND b.wallet_balance >= ?

      AND NOT EXISTS (
        SELECT 1
        FROM table_bots current_table_bot
        WHERE current_table_bot.table_id = ?
          AND current_table_bot.bot_id = b.id
          AND current_table_bot.is_active = 1
      )

      AND NOT EXISTS (
        SELECT 1
        FROM table_bots active_table_bot

        INNER JOIN game_tables active_table
          ON active_table.id =
             active_table_bot.table_id

        WHERE active_table_bot.bot_id = b.id
          AND active_table_bot.is_active = 1
          AND active_table.game_status = 'playing'
      )

    ORDER BY RAND()

    LIMIT 1

    FOR UPDATE
    `,
    [parseMoney(minimumBalance), tableId],
  );

  return rows[0] || null;
}

async function addSingleBotToTable(connection, table, members) {
  const counts = countMemberTypes(members);

  /*
   * Final matchmaking rule:
   *
   * 1–4 real → exactly 1 bot
   * 5 real   → 0 bot
   */
  if (counts.real < 1 || counts.real >= MAX_PLAYERS || counts.bots >= 1) {
    return null;
  }

  assertCondition(
    counts.total < MAX_PLAYERS,
    "Teen Patti table is full.",
    409,
    "TABLE_FULL",
  );

  const availableSeat = findAvailableSeat(members);

  assertCondition(
    availableSeat !== null,
    "No Teen Patti seat is available.",
    409,
    "NO_AVAILABLE_SEAT",
  );

  const bot = await selectAvailableBot(
    connection,
    Number(table.id),
    Number(table.boot_amount),
  );

  assertCondition(
    bot,
    "No funded Teen Patti bot is available.",
    503,
    "BOT_NOT_AVAILABLE",
  );

  const [insertResult] = await connection.query(
    `
      INSERT INTO table_bots (
        table_id,
        bot_id,
        seat_no,
        is_dealer,
        is_active,
        is_seen,
        is_packed,
        cards,
        current_bet,
        total_win
      )
      VALUES (
        ?,
        ?,
        ?,
        0,
        1,
        0,
        0,
        NULL,
        0.00,
        0.00
      )
      `,
    [Number(table.id), Number(bot.id), availableSeat],
  );

  return {
    membershipId: Number(insertResult.insertId),

    playerType: PLAYER_TYPE.BOT,
    tablePlayerId: null,
    tableBotId: Number(insertResult.insertId),
    userId: null,
    botId: Number(bot.id),
    seatNo: availableSeat,
    name: bot.bot_name || bot.bot_code || "Bot",
    avatarUrl: bot.avatar_url || null,
    walletBalance: parseMoney(bot.wallet_balance),
  };
}

/* =========================================================
   COMPLETE 20-SECOND MATCHMAKING
========================================================= */

async function completeTeenPattiMatchmaking(tableId) {
  const validTableId = parsePositiveInteger(tableId);

  assertCondition(
    validTableId !== null,
    "Valid Teen Patti table ID is required.",
    400,
    "INVALID_TABLE_ID",
  );

  return withTransaction(async (connection) => {
    const table = await getLockedTable(connection, validTableId);

    assertCondition(
      table,
      "Teen Patti table not found.",
      404,
      "TABLE_NOT_FOUND",
    );

    assertCondition(
      table.room_status !== "disabled",
      "Teen Patti room is disabled.",
      403,
      "ROOM_DISABLED",
    );

    /*
     * Matchmaking আগে complete হয়ে থাকলে
     * duplicate bot বা duplicate completion হবে না।
     */
    if (Number(table.matchmaking_completed) === 1) {
      const tableState = await buildTableState(connection, validTableId);

      return {
        success: true,
        tableId: validTableId,

        alreadyCompleted: true,
        completed: true,
        botJoined: false,
        joinedBot: null,

        tableState,
      };
    }

    assertCondition(
      table.game_status === TABLE_STATUS.WAITING,
      "Teen Patti table is not waiting for matchmaking.",
      409,
      "TABLE_NOT_WAITING",
    );

    /*
     * Database time ব্যবহার করা হচ্ছে।
     * Browser/Node clock আলাদা হলেও deadline ঠিক থাকবে।
     */
    const [deadlineRows] = await connection.query(
      `
          SELECT
            matchmaking_started_at,
            matchmaking_expires_at,

            CASE
              WHEN matchmaking_expires_at
                     IS NOT NULL
               AND matchmaking_expires_at
                     <= NOW()
              THEN 1
              ELSE 0
            END AS deadline_expired,

            GREATEST(
              0,
              TIMESTAMPDIFF(
                SECOND,
                NOW(),
                matchmaking_expires_at
              )
            ) AS remaining_seconds

          FROM game_tables

          WHERE id = ?

          LIMIT 1
          `,
      [validTableId],
    );

    const deadline = deadlineRows[0] || null;

    assertCondition(
      deadline && deadline.matchmaking_expires_at,
      "Teen Patti matchmaking deadline was not initialized.",
      409,
      "MATCHMAKING_NOT_STARTED",
    );

    /*
     * ২০ সেকেন্ড এখনো শেষ না হলে
     * bot যোগ করবে না।
     */
    if (Number(deadline.deadline_expired) !== 1) {
      const tableState = await buildTableState(connection, validTableId);

      return {
        success: true,
        tableId: validTableId,

        alreadyCompleted: false,
        completed: false,

        remainingSeconds: Math.max(0, Number(deadline.remaining_seconds) || 0),

        botJoined: false,
        joinedBot: null,

        tableState,
      };
    }

    let members = await getActiveTableMembers(connection, validTableId, {
      lock: true,
    });

    let counts = countMemberTypes(members);

    assertCondition(
      counts.real >= 1,
      "No real player is waiting at this Teen Patti table.",
      409,
      "NO_REAL_PLAYER",
    );

    assertCondition(
      counts.real <= MAX_PLAYERS,
      "Teen Patti table has too many real players.",
      409,
      "TOO_MANY_REAL_PLAYERS",
    );

    /*
     * Final confirmed rule:
     *
     * 1–4 real → exactly 1 bot
     * 5 real   → 0 bot
     */
    let joinedBot = null;

    if (counts.real < MAX_PLAYERS && counts.bots === 0) {
      joinedBot = await addSingleBotToTable(connection, table, members);

      members = await getActiveTableMembers(connection, validTableId, {
        lock: true,
      });

      counts = countMemberTypes(members);
    }

    assertCondition(
      counts.total >= MIN_PLAYERS,
      "Teen Patti table does not have enough players.",
      409,
      "NOT_ENOUGH_PLAYERS",
    );

    assertCondition(
      counts.total <= MAX_PLAYERS,
      "Teen Patti table exceeds the five-player limit.",
      409,
      "TABLE_PLAYER_LIMIT_EXCEEDED",
    );

    assertCondition(
      counts.real === MAX_PLAYERS ? counts.bots === 0 : counts.bots === 1,
      "Teen Patti bot count is invalid.",
      409,
      "INVALID_FINAL_BOT_COUNT",
    );

    const [updateResult] = await connection.query(
      `
          UPDATE game_tables

          SET
            matchmaking_completed = 1,
            updated_at = CURRENT_TIMESTAMP

          WHERE id = ?
            AND game_status = 'waiting'
            AND matchmaking_completed = 0
          `,
      [validTableId],
    );

    assertCondition(
      Number(updateResult.affectedRows) === 1,
      "Teen Patti matchmaking was already completed.",
      409,
      "MATCHMAKING_ALREADY_COMPLETED",
    );

    await updateRoomPlayerCount(connection, Number(table.room_id));

    const tableState = await buildTableState(connection, validTableId);

    return {
      success: true,
      tableId: validTableId,

      alreadyCompleted: false,
      completed: true,

      realPlayers: counts.real,
      botPlayers: counts.bots,
      totalPlayers: counts.total,

      botJoined: joinedBot !== null,

      joinedBot,

      tableState,
    };
  });
}

async function removeWaitingBotForFifthRealPlayer(
  connection,
  tableId,
  members,
) {
  const counts = countMemberTypes(members);

  if (counts.real !== 4 || counts.bots !== 1) {
    return false;
  }

  const botMember = members.find(
    (member) => member.playerType === PLAYER_TYPE.BOT,
  );

  if (!botMember) {
    return false;
  }

  await connection.query(
    `
    DELETE FROM table_bots
    WHERE id = ?
      AND table_id = ?
    `,
    [botMember.tableBotId, tableId],
  );

  return true;
}

/* =========================================================
   ROOM PLAYER COUNT
========================================================= */

async function updateRoomPlayerCount(connection, roomId) {
  const [rows] = await connection.query(
    `
    SELECT
      (
        SELECT COUNT(*)
        FROM table_players tp

        INNER JOIN game_tables gt_real
          ON gt_real.id = tp.table_id

        WHERE gt_real.room_id = ?
          AND tp.is_active = 1
      )
      +
      (
        SELECT COUNT(*)
        FROM table_bots tb

        INNER JOIN game_tables gt_bot
          ON gt_bot.id = tb.table_id

        WHERE gt_bot.room_id = ?
          AND tb.is_active = 1
      ) AS total_players
    `,
    [roomId, roomId],
  );

  const totalPlayers = Number(rows[0]?.total_players || 0);

  await connection.query(
    `
    UPDATE game_rooms
    SET current_players = ?
    WHERE id = ?
    `,
    [totalPlayers, roomId],
  );

  return totalPlayers;
}

/* =========================================================
   PUBLIC TABLE STATE
========================================================= */

function buildPublicPlayerState(member) {
  return {
    id: Number(member.membershipId),

    playerType: member.playerType,

    isBot: member.playerType === PLAYER_TYPE.BOT,

    tablePlayerId: member.tablePlayerId,

    tableBotId: member.tableBotId,

    userId: member.userId,
    botId: member.botId,

    seatNo: Number(member.seatNo),

    name: member.name,
    uid: member.uid || null,
    avatarUrl: member.avatarUrl || null,

    isDealer: member.isDealer === true,

    isActive: member.isActive === true,

    isSeen: member.isSeen === true,

    isPacked: member.isPacked === true,

    currentBet: parseMoney(member.currentBet),

    totalWin: parseMoney(member.totalWin),

    walletBalance: parseMoney(member.walletBalance),
  };
}

async function buildTableState(connection, tableId) {
  const table = await getTable(connection, tableId);

  assertCondition(table, "Teen Patti table not found.", 404, "TABLE_NOT_FOUND");

  const members = await getActiveTableMembers(connection, tableId);

  const counts = countMemberTypes(members);

  const matchmakingCompleted = Number(table.matchmaking_completed) === 1;

  const isWaiting =
    table.game_status === TABLE_STATUS.WAITING && !matchmakingCompleted;

  const matchmakingStartedAt = table.matchmaking_started_at || null;

  const matchmakingExpiresAt = table.matchmaking_expires_at || null;

  const remainingMilliseconds =
    isWaiting && matchmakingExpiresAt
      ? Math.max(0, new Date(matchmakingExpiresAt).getTime() - Date.now())
      : 0;

  const remainingSeconds = Math.max(0, Math.ceil(remainingMilliseconds / 1000));

  return {
    table: {
      id: Number(table.id),
      tableId: Number(table.id),

      roomId: Number(table.room_id),

      roomCode: table.room_code,

      roomName: table.room_name,

      tableCode: table.table_code,

      status: table.game_status,

      currentRound: Number(table.current_round),

      potAmount: parseMoney(table.pot_amount),

      bootAmount: parseMoney(table.boot_amount),

      serviceChargePercent: parseMoney(
        table.service_charge,
        DEFAULT_SERVICE_CHARGE_PERCENT,
      ),

      maxPlayers: Number(table.max_players || MAX_PLAYERS),

      matchmakingStartedAt,
      matchmakingExpiresAt,
      matchmakingCompleted,
    },

    players: members.map(buildPublicPlayerState),

    counts,

    matchmaking: {
      isWaiting,

      completed: matchmakingCompleted,

      waitSeconds: MATCHMAKING_SECONDS,

      startedAt: matchmakingStartedAt,

      expiresAt: matchmakingExpiresAt,

      remainingSeconds,

      minimumPlayers: MIN_PLAYERS,

      maximumPlayers: MAX_PLAYERS,

      realPlayers: counts.real,

      botPlayers: counts.bots,

      currentPlayers: counts.total,

      canStart: matchmakingCompleted && counts.total >= MIN_PLAYERS,

      waitingForPlayers: isWaiting ? Math.max(0, MAX_PLAYERS - counts.real) : 0,

      botRequired:
        matchmakingCompleted && counts.real >= 1 && counts.real < MAX_PLAYERS,

      expectedBotCount:
        matchmakingCompleted && counts.real >= 1 && counts.real < MAX_PLAYERS
          ? 1
          : 0,
    },
  };
}

async function getTableState(tableId) {
  const validTableId = parsePositiveInteger(tableId);

  assertCondition(
    validTableId !== null,
    "Valid Teen Patti table ID is required.",
    400,
    "INVALID_TABLE_ID",
  );

  const connection = await pool.getConnection();

  try {
    return await buildTableState(connection, validTableId);
  } finally {
    connection.release();
  }
}

/* =========================================================
   JOIN SPECIFIC TABLE
========================================================= */

async function joinTable(tableId, userId) {
  const validTableId = parsePositiveInteger(tableId);

  const validUserId = parsePositiveInteger(userId);

  assertCondition(
    validTableId !== null,
    "Valid Teen Patti table ID is required.",
    400,
    "INVALID_TABLE_ID",
  );

  assertCondition(
    validUserId !== null,
    "Valid user ID is required.",
    400,
    "INVALID_USER_ID",
  );

  return withTransaction(async (connection) => {
    /*
     * সব join transaction একই table row
     * lock করবে। ফলে একই seat দুইজন
     * নিতে পারবে না।
     */
    const table = await getLockedTable(connection, validTableId);

    assertCondition(
      table,
      "Teen Patti table not found.",
      404,
      "TABLE_NOT_FOUND",
    );

    assertCondition(
      table.room_status !== "disabled",
      "Teen Patti room is disabled.",
      403,
      "ROOM_DISABLED",
    );

    assertCondition(
      table.game_status === TABLE_STATUS.WAITING,
      "This Teen Patti table has already started.",
      409,
      "TABLE_ALREADY_STARTED",
    );

    const user = await getLockedUser(connection, validUserId);

    assertCondition(user, "User not found.", 404, "USER_NOT_FOUND");

    assertCondition(
      String(user.role).toLowerCase() === "user",
      "Only users can join Teen Patti.",
      403,
      "USER_ROLE_NOT_ALLOWED",
    );

    assertCondition(
      user.account_status === "active",
      "User account is not active.",
      403,
      "USER_NOT_ACTIVE",
    );

    assertCondition(
      parseMoney(user.wallet_balance) >= parseMoney(table.boot_amount),
      "Insufficient wallet balance.",
      400,
      "INSUFFICIENT_BALANCE",
    );

    let members = await getActiveTableMembers(connection, validTableId, {
      lock: true,
    });

    /*
     * প্রথম real player join-এর সময়
     * ২০ সেকেন্ড matchmaking deadline শুরু হবে।
     *
     * পরবর্তী player join বা refresh করলে
     * deadline reset হবে না।
     */
    const matchmakingStartedAt = new Date();

    const matchmakingExpiresAt = createDateAfterSeconds(MATCHMAKING_SECONDS);

    await connection.query(
      `
        UPDATE game_tables

        SET
          matchmaking_started_at =
            COALESCE(
              matchmaking_started_at,
              ?
            ),

          matchmaking_expires_at =
            COALESCE(
              matchmaking_expires_at,
              ?
            )

        WHERE id = ?
          AND game_status = 'waiting'
          AND matchmaking_completed = 0
        `,
      [matchmakingStartedAt, matchmakingExpiresAt, validTableId],
    );

    const existingPlayer = await getTablePlayerByUser(
      connection,
      validTableId,
      validUserId,
      {
        lock: true,
      },
    );

    /*
     * Player আগে থেকেই active হলে
     * duplicate insert হবে না।
     */
    if (existingPlayer && existingPlayer.isActive === true) {
      await updateRoomPlayerCount(connection, Number(table.room_id));

      const tableState = await buildTableState(connection, validTableId);

      return {
        tableId: validTableId,
        alreadyJoined: true,
        botJoined: false,
        tableState,
      };
    }

    let counts = countMemberTypes(members);

    /*
     * 4 real + 1 bot table-এ
     * পঞ্চম real join করলে bot সরবে।
     *
     * এটি শুধু waiting table-এ হচ্ছে;
     * active hand-এর মাঝখানে নয়।
     */
    if (counts.real === 4 && counts.bots === 1) {
      await removeWaitingBotForFifthRealPlayer(
        connection,
        validTableId,
        members,
      );

      members = await getActiveTableMembers(connection, validTableId, {
        lock: true,
      });

      counts = countMemberTypes(members);
    }

    assertCondition(
      counts.total < MAX_PLAYERS,
      "Teen Patti table is full.",
      409,
      "TABLE_FULL",
    );

    const seatNo = findAvailableSeat(members);

    assertCondition(
      seatNo !== null,
      "No Teen Patti seat is available.",
      409,
      "NO_AVAILABLE_SEAT",
    );

    let tablePlayerId;

    /*
     * আগে inactive membership থাকলে
     * unique constraint রক্ষা করে
     * একই row reactivate করা হবে।
     */
    if (existingPlayer) {
      await connection.query(
        `
          UPDATE table_players
          SET
            seat_no = ?,
            is_dealer = 0,
            is_active = 1,
            is_seen = 0,
            is_packed = 0,
            cards = NULL,
            current_bet = 0.00
          WHERE id = ?
            AND table_id = ?
            AND user_id = ?
          `,
        [seatNo, existingPlayer.tablePlayerId, validTableId, validUserId],
      );

      tablePlayerId = Number(existingPlayer.tablePlayerId);
    } else {
      const [insertResult] = await connection.query(
        `
            INSERT INTO table_players (
              table_id,
              user_id,
              seat_no,
              is_dealer,
              is_active,
              is_seen,
              is_packed,
              cards,
              current_bet,
              total_win
            )
            VALUES (
              ?,
              ?,
              ?,
              0,
              1,
              0,
              0,
              NULL,
              0.00,
              0.00
            )
            `,
        [validTableId, validUserId, seatNo],
      );

      tablePlayerId = Number(insertResult.insertId);
    }

    members = await getActiveTableMembers(connection, validTableId, {
      lock: true,
    });

    counts = countMemberTypes(members);

    const joinedBot = null;

    await updateRoomPlayerCount(connection, Number(table.room_id));

    const tableState = await buildTableState(connection, validTableId);

    return {
      tableId: validTableId,
      tablePlayerId,

      alreadyJoined: false,

      botJoined: joinedBot !== null,

      joinedBot,

      tableState,
    };
  });
}

/* =========================================================
   FIND WAITING TABLE
========================================================= */

async function findExistingUserTable(roomId, userId) {
  const [rows] = await pool.query(
    `
    SELECT
      gt.id

    FROM game_tables gt

    INNER JOIN table_players tp
      ON tp.table_id = gt.id

    WHERE gt.room_id = ?
      AND gt.game_status = 'waiting'
      AND tp.user_id = ?
      AND tp.is_active = 1

    ORDER BY gt.id ASC

    LIMIT 1
    `,
    [roomId, userId],
  );

  return rows.length > 0 ? Number(rows[0].id) : null;
}

async function findWaitingTableCandidates(roomId) {
  const [rows] = await pool.query(
    `
    SELECT
      gt.id,

      (
        SELECT COUNT(*)
        FROM table_players tp
        WHERE tp.table_id = gt.id
          AND tp.is_active = 1
      ) AS real_count,

      (
        SELECT COUNT(*)
        FROM table_bots tb
        WHERE tb.table_id = gt.id
          AND tb.is_active = 1
      ) AS bot_count

    FROM game_tables gt

    WHERE gt.room_id = ?
      AND gt.game_status = 'waiting'

    ORDER BY
      real_count DESC,
      gt.id ASC
    `,
    [roomId],
  );

  return rows
    .map((row) => ({
      tableId: Number(row.id),
      realCount: Number(row.real_count),
      botCount: Number(row.bot_count),
    }))
    .filter((candidate) => {
      const total = candidate.realCount + candidate.botCount;

      return (
        total < MAX_PLAYERS ||
        (candidate.realCount === 4 && candidate.botCount === 1)
      );
    });
}

/* =========================================================
   MATCHMAKING
========================================================= */

async function joinMatchmaking(userId, bootAmount) {
  const validUserId = parsePositiveInteger(userId);

  const validBootAmount = parsePositiveInteger(bootAmount);

  assertCondition(
    validUserId !== null,
    "Valid user ID is required.",
    400,
    "INVALID_USER_ID",
  );

  assertCondition(
    validBootAmount !== null && ALLOWED_BOOT_AMOUNTS.includes(validBootAmount),
    "Please select a valid Teen Patti room.",
    400,
    "INVALID_BOOT_AMOUNT",
  );

  /*
   * Room না থাকলে একই boot amount-এর
   * room তৈরি হবে।
   */
  const roomId = await getOrCreateTeenPattiRoom(validBootAmount);

  /*
   * User refresh করলে নতুন table নয়;
   * আগের waiting table ফেরত পাবে।
   */
  const existingUserTableId = await findExistingUserTable(roomId, validUserId);

  if (existingUserTableId) {
    const joinResult = await joinTable(existingUserTableId, validUserId);

    return {
      ...joinResult,

      selectedRoom: {
        roomId,
        bootAmount: validBootAmount,
        blindAmount: validBootAmount,
        chaalAmount: validBootAmount * 2,
      },
    };
  }

  const candidates = await findWaitingTableCandidates(roomId);

  /*
   * Concurrent join-এর কারণে প্রথম
   * candidate full হয়ে গেলে পরেরটি try হবে।
   */
  for (const candidate of candidates) {
    try {
      const joinResult = await joinTable(candidate.tableId, validUserId);

      return {
        ...joinResult,

        selectedRoom: {
          roomId,
          bootAmount: validBootAmount,

          blindAmount: validBootAmount,

          chaalAmount: validBootAmount * 2,
        },
      };
    } catch (error) {
      const retryableCodes = [
        "TABLE_FULL",
        "NO_AVAILABLE_SEAT",
        "TABLE_ALREADY_STARTED",
      ];

      if (!retryableCodes.includes(error.code)) {
        throw error;
      }
    }
  }

  /*
   * Suitable waiting table না থাকলে
   * নতুন table তৈরি হবে।
   */
  const createdTable = await createTable(roomId);

  const joinResult = await joinTable(createdTable.tableId, validUserId);

  return {
    ...joinResult,

    selectedRoom: {
      roomId,
      bootAmount: validBootAmount,
      blindAmount: validBootAmount,
      chaalAmount: validBootAmount * 2,
    },
  };
}

/* =========================================================
   SERVER-AUTHORITATIVE HAND START
========================================================= */

async function getActiveHand(connection, tableId, options = {}) {
  const lockSuffix = options.lock === true ? "FOR UPDATE" : "";

  const [rows] = await connection.query(
    `
    SELECT
      id,
      table_id,
      round_number,
      hand_status,
      dealer_seat_no,
      current_turn_hand_player_id,
      boot_amount,
      current_bet,
      pot_amount,
      service_charge_percent,
      service_charge_amount,
      distributable_amount,
      action_started_at,
      action_expires_at,
      settlement_completed,
      winner_hand_player_id,
      state_version,
      started_at,
      completed_at

    FROM teen_patti_hands

    WHERE table_id = ?
      AND hand_status IN (
        'starting',
        'playing',
        'showdown'
      )

    ORDER BY id DESC

    LIMIT 1

    ${lockSuffix}
    `,
    [tableId],
  );

  return rows[0] || null;
}

async function getNextRoundNumber(connection, tableId) {
  const [rows] = await connection.query(
    `
    SELECT
      COALESCE(
        MAX(round_number),
        0
      ) + 1 AS next_round_number

    FROM teen_patti_hands

    WHERE table_id = ?
    `,
    [tableId],
  );

  return Math.max(1, Number(rows[0]?.next_round_number || 1));
}

async function getPreviousDealerSeat(connection, tableId) {
  const [rows] = await connection.query(
    `
    SELECT
      dealer_seat_no

    FROM teen_patti_hands

    WHERE table_id = ?
      AND dealer_seat_no IS NOT NULL

    ORDER BY
      round_number DESC,
      id DESC

    LIMIT 1
    `,
    [tableId],
  );

  if (rows.length === 0) {
    return null;
  }

  return Number(rows[0].dealer_seat_no);
}

function resolveDealerMember(members, previousDealerSeat) {
  const availableMembers = members
    .filter((member) => member.isActive === true)
    .sort(
      (firstMember, secondMember) => firstMember.seatNo - secondMember.seatNo,
    );

  assertCondition(
    availableMembers.length >= MIN_PLAYERS,
    "At least two active players are required.",
    409,
    "NOT_ENOUGH_PLAYERS",
  );

  if (previousDealerSeat === null) {
    return availableMembers[0];
  }

  for (let offset = 1; offset <= MAX_PLAYERS; offset += 1) {
    const expectedSeat =
      ((Number(previousDealerSeat) - 1 + offset) % MAX_PLAYERS) + 1;

    const dealer = availableMembers.find(
      (member) => Number(member.seatNo) === expectedSeat,
    );

    if (dealer) {
      return dealer;
    }
  }

  return availableMembers[0];
}

function resolveFirstTurnMember(members, dealerSeatNo) {
  const playableMembers = members.map((member) => ({
    ...member,

    playerStatus: PLAYER_STATUS.ACTIVE,
  }));

  return findNextActiveMember(playableMembers, dealerSeatNo);
}

async function debitRealPlayerBoot(
  connection,
  { userId, handId, roundNumber, bootAmount, balanceBefore },
) {
  const balanceAfter = parseMoney(balanceBefore - bootAmount);

  const [debitResult] = await connection.query(
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
    [bootAmount, bootAmount, userId, bootAmount],
  );

  assertCondition(
    debitResult.affectedRows === 1,
    "Real player boot debit failed.",
    409,
    "BOOT_DEBIT_FAILED",
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
      description
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
      'teen_patti_hand',
      ?,
      ?
    )
    `,
    [
      createTransactionId("TP_BOOT"),

      userId,

      bootAmount,
      balanceBefore,
      balanceAfter,

      String(handId),

      `Teen Patti round ${roundNumber} boot`,
    ],
  );

  return balanceAfter;
}

async function debitBotBoot(connection, { botId, bootAmount, balanceBefore }) {
  const balanceAfter = parseMoney(balanceBefore - bootAmount);

  const [debitResult] = await connection.query(
    `
      UPDATE teen_patti_bots

      SET
        wallet_balance =
          wallet_balance - ?

      WHERE id = ?
        AND status = 'active'
        AND wallet_balance >= ?
      `,
    [bootAmount, botId, bootAmount],
  );

  assertCondition(
    debitResult.affectedRows === 1,
    "Teen Patti bot boot debit failed.",
    409,
    "BOT_BOOT_DEBIT_FAILED",
  );

  return balanceAfter;
}

async function resetTableMemberForHand(
  connection,
  tableId,
  member,
  dealerSeatNo,
  bootAmount,
) {
  const isDealer = Number(member.seatNo) === Number(dealerSeatNo) ? 1 : 0;

  if (member.playerType === PLAYER_TYPE.REAL) {
    await connection.query(
      `
      UPDATE table_players

      SET
        is_dealer = ?,
        is_seen = 0,
        is_packed = 0,
        cards = NULL,
        current_bet = ?

      WHERE id = ?
        AND table_id = ?
        AND is_active = 1
      `,
      [isDealer, bootAmount, member.tablePlayerId, tableId],
    );

    return;
  }

  await connection.query(
    `
    UPDATE table_bots

    SET
      is_dealer = ?,
      is_seen = 0,
      is_packed = 0,
      cards = NULL,
      current_bet = ?

    WHERE id = ?
      AND table_id = ?
      AND is_active = 1
    `,
    [isDealer, bootAmount, member.tableBotId, tableId],
  );
}

async function startTeenPattiHand(tableId, requestingUserId) {
  const validTableId = parsePositiveInteger(tableId);

  const validUserId = parsePositiveInteger(requestingUserId);

  assertCondition(
    validTableId !== null,
    "Valid Teen Patti table ID is required.",
    400,
    "INVALID_TABLE_ID",
  );

  assertCondition(
    validUserId !== null,
    "Valid requesting user ID is required.",
    400,
    "INVALID_USER_ID",
  );

  return withTransaction(async (connection) => {
    const table = await getLockedTable(connection, validTableId);

    assertCondition(
      table,
      "Teen Patti table not found.",
      404,
      "TABLE_NOT_FOUND",
    );

    /*
     * প্রথম hand শুধু ২০ সেকেন্ডের
     * matchmaking complete হওয়ার পরে শুরু হবে।
     *
     * পরের auto-round-এ matchmaking_completed
     * আগেই 1 থাকবে।
     */
    assertCondition(
      Number(table.matchmaking_completed) === 1,
      "Teen Patti matchmaking is still in progress.",
      409,
      "MATCHMAKING_IN_PROGRESS",
    );

    assertCondition(
      table.room_status !== "disabled",
      "Teen Patti room is disabled.",
      403,
      "ROOM_DISABLED",
    );

    const requester = await getTablePlayerByUser(
      connection,
      validTableId,
      validUserId,
      {
        lock: true,
      },
    );

    assertCondition(
      requester && requester.isActive === true,
      "You are not an active player of this table.",
      403,
      "NOT_TABLE_PLAYER",
    );

    const runningHand = await getActiveHand(connection, validTableId, {
      lock: true,
    });

    assertCondition(
      !runningHand,
      "A Teen Patti hand is already running.",
      409,
      "HAND_ALREADY_RUNNING",
    );

    const members = await getActiveTableMembers(connection, validTableId, {
      lock: true,
    });

    const counts = countMemberTypes(members);

    assertCondition(
      counts.total >= MIN_PLAYERS,
      "At least two players are required.",
      409,
      "NOT_ENOUGH_PLAYERS",
    );

    assertCondition(
      counts.total <= MAX_PLAYERS,
      "Teen Patti table has too many players.",
      409,
      "TOO_MANY_PLAYERS",
    );

    assertCondition(
      counts.real >= 1,
      "At least one real player is required.",
      409,
      "REAL_PLAYER_REQUIRED",
    );

    const expectedBotCount = counts.real < MAX_PLAYERS ? 1 : 0;

    assertCondition(
      counts.bots === expectedBotCount,
      counts.real < MAX_PLAYERS
        ? "Exactly one bot is required before starting."
        : "A five-player real table cannot contain a bot.",
      409,
      "INVALID_BOT_COUNT",
    );

    const bootAmount = parseMoney(table.boot_amount);

    assertCondition(
      bootAmount > 0,
      "Invalid Teen Patti boot amount.",
      400,
      "INVALID_BOOT_AMOUNT",
    );

    for (const member of members) {
      assertCondition(
        parseMoney(member.walletBalance) >= bootAmount,
        `${member.name} has insufficient balance for the boot.`,
        409,
        "PLAYER_BALANCE_TOO_LOW",
      );
    }

    const roundNumber = await getNextRoundNumber(connection, validTableId);

    const previousDealerSeat = await getPreviousDealerSeat(
      connection,
      validTableId,
    );

    const dealerMember = resolveDealerMember(members, previousDealerSeat);

    const firstTurnMember = resolveFirstTurnMember(
      members,
      dealerMember.seatNo,
    );

    assertCondition(
      firstTurnMember,
      "First turn player could not be resolved.",
      500,
      "FIRST_TURN_NOT_FOUND",
    );

    const dealResult = dealCards(members.length);

    assertCondition(
      Array.isArray(dealResult.hands) &&
        dealResult.hands.length === members.length,
      "Teen Patti card distribution failed.",
      500,
      "CARD_DISTRIBUTION_FAILED",
    );

    const serviceChargePercent = parseMoney(
      table.service_charge,
      DEFAULT_SERVICE_CHARGE_PERCENT,
    );

    const actionStartedAt = new Date();

    const actionExpiresAt = createDateAfterSeconds(TURN_SECONDS);

    const [handInsertResult] = await connection.query(
      `
          INSERT INTO teen_patti_hands (
            table_id,
            round_number,
            hand_status,
            dealer_seat_no,
            current_turn_hand_player_id,
            boot_amount,
            current_bet,
            pot_amount,
            service_charge_percent,
            service_charge_amount,
            distributable_amount,
            action_started_at,
            action_expires_at,
            settlement_completed,
            winner_hand_player_id,
            state_version,
            started_at
          )
          VALUES (
            ?,
            ?,
            'starting',
            ?,
            NULL,
            ?,
            ?,
            0.00,
            ?,
            0.00,
            0.00,
            ?,
            ?,
            0,
            NULL,
            1,
            NOW()
          )
          `,
      [
        validTableId,
        roundNumber,
        dealerMember.seatNo,
        bootAmount,
        bootAmount,
        serviceChargePercent,
        actionStartedAt,
        actionExpiresAt,
      ],
    );

    const handId = Number(handInsertResult.insertId);

    let runningPot = 0;
    let actionSequence = 0;

    const createdHandPlayers = [];

    for (let index = 0; index < members.length; index += 1) {
      const member = members[index];

      const cards = dealResult.hands[index];

      const serializedCards = serializeCards(cards);

      const balanceBefore = parseMoney(member.walletBalance);

      let balanceAfter;

      if (member.playerType === PLAYER_TYPE.REAL) {
        balanceAfter = await debitRealPlayerBoot(connection, {
          userId: member.userId,

          handId,
          roundNumber,
          bootAmount,
          balanceBefore,
        });
      } else {
        balanceAfter = await debitBotBoot(connection, {
          botId: member.botId,

          bootAmount,
          balanceBefore,
        });
      }

      await resetTableMemberForHand(
        connection,
        validTableId,
        member,
        dealerMember.seatNo,
        bootAmount,
      );

      const isDealer =
        Number(member.seatNo) === Number(dealerMember.seatNo) ? 1 : 0;

      const [playerInsertResult] = await connection.query(
        `
            INSERT INTO teen_patti_hand_players (
              hand_id,
              table_player_id,
              table_bot_id,
              player_type,
              seat_no,
              player_status,
              cards,
              is_seen,
              is_dealer,
              starting_balance,
              ending_balance,
              current_bet,
              total_contribution,
              last_action,
              hand_rank_value,
              hand_rank_name,
              prize_amount
            )
            VALUES (
              ?,
              ?,
              ?,
              ?,
              ?,
              'active',
              ?,
              0,
              ?,
              ?,
              ?,
              ?,
              ?,
              'boot',
              NULL,
              NULL,
              0.00
            )
            `,
        [
          handId,

          member.tablePlayerId,
          member.tableBotId,

          member.playerType,
          member.seatNo,

          serializedCards,
          isDealer,

          balanceBefore,
          balanceAfter,

          bootAmount,
          bootAmount,
        ],
      );

      const handPlayerId = Number(playerInsertResult.insertId);

      runningPot = parseMoney(runningPot + bootAmount);

      actionSequence += 1;

      await connection.query(
        `
          INSERT INTO teen_patti_hand_actions (
            hand_id,
            hand_player_id,
            action_sequence,
            action_type,
            requested_amount,
            contribution_amount,
            balance_before,
            balance_after,
            current_bet_after,
            pot_after,
            is_automatic
          )
          VALUES (
            ?,
            ?,
            ?,
            'boot',
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            1
          )
          `,
        [
          handId,
          handPlayerId,
          actionSequence,

          bootAmount,
          bootAmount,

          balanceBefore,
          balanceAfter,

          bootAmount,
          runningPot,
        ],
      );

      createdHandPlayers.push({
        handPlayerId,

        tablePlayerId: member.tablePlayerId,

        tableBotId: member.tableBotId,

        userId: member.userId,
        botId: member.botId,

        playerType: member.playerType,

        seatNo: Number(member.seatNo),

        name: member.name,

        isDealer: isDealer === 1,

        balance: balanceAfter,
      });
    }

    const firstTurnHandPlayer = createdHandPlayers.find(
      (player) => Number(player.seatNo) === Number(firstTurnMember.seatNo),
    );

    assertCondition(
      firstTurnHandPlayer,
      "First turn hand player could not be resolved.",
      500,
      "FIRST_TURN_HAND_PLAYER_NOT_FOUND",
    );

    await connection.query(
      `
        UPDATE teen_patti_hands

        SET
          hand_status = 'playing',

          current_turn_hand_player_id = ?,

          pot_amount = ?,
          current_bet = ?,

          action_started_at = ?,
          action_expires_at = ?,

          state_version =
            state_version + 1

        WHERE id = ?
          AND hand_status = 'starting'
        `,
      [
        firstTurnHandPlayer.handPlayerId,

        runningPot,
        bootAmount,

        actionStartedAt,
        actionExpiresAt,

        handId,
      ],
    );

    await connection.query(
      `
        UPDATE game_tables

        SET
          game_status = 'playing',
          current_round = ?,
          pot_amount = ?

        WHERE id = ?
        `,
      [roundNumber, runningPot, validTableId],
    );

    return {
      tableId: validTableId,
      handId,
      roundNumber,

      status: HAND_STATUS.PLAYING,

      bootAmount,
      currentBet: bootAmount,
      potAmount: runningPot,

      dealerSeatNo: Number(dealerMember.seatNo),

      currentTurnHandPlayerId: firstTurnHandPlayer.handPlayerId,

      currentTurnSeatNo: Number(firstTurnHandPlayer.seatNo),

      actionStartedAt,
      actionExpiresAt,

      actionSeconds: TURN_SECONDS,

      players: createdHandPlayers,
    };
  });
}

/* =========================================================
   PRIVATE HAND STATE
========================================================= */

async function getLatestHand(connection, tableId) {
  const [rows] = await connection.query(
    `
    SELECT
      id,
      table_id,
      round_number,
      hand_status,
      dealer_seat_no,
      current_turn_hand_player_id,
      boot_amount,
      current_bet,
      pot_amount,
      service_charge_percent,
      service_charge_amount,
      distributable_amount,
      action_started_at,
      action_expires_at,
      settlement_completed,
      winner_hand_player_id,
      state_version,
      started_at,
      completed_at,
      cancelled_at

    FROM teen_patti_hands

    WHERE table_id = ?

    ORDER BY
      round_number DESC,
      id DESC

    LIMIT 1
    `,
    [tableId],
  );

  return rows[0] || null;
}

async function getHandPlayers(connection, handId) {
  const [rows] = await connection.query(
    `
    SELECT
      thp.id AS hand_player_id,
      thp.hand_id,

      thp.table_player_id,
      thp.table_bot_id,

      thp.player_type,
      thp.seat_no,
      thp.player_status,

      thp.cards,

      CASE
        WHEN thp.cards IS NULL
          THEN 0
        ELSE JSON_LENGTH(thp.cards)
      END AS card_count,

      thp.is_seen,
      thp.is_dealer,

      thp.starting_balance,
      thp.ending_balance,

      thp.current_bet,
      thp.total_contribution,

      thp.last_action,

      thp.hand_rank_value,
      thp.hand_rank_name,

      thp.prize_amount,

      tp.user_id,
      tb.bot_id,

      u.uid,
      u.full_name,
      u.username,

      b.bot_code,
      b.bot_name,
      b.avatar_url

    FROM teen_patti_hand_players thp

    LEFT JOIN table_players tp
      ON tp.id =
         thp.table_player_id

    LEFT JOIN users u
      ON u.id = tp.user_id

    LEFT JOIN table_bots tb
      ON tb.id =
         thp.table_bot_id

    LEFT JOIN teen_patti_bots b
      ON b.id = tb.bot_id

    WHERE thp.hand_id = ?

    ORDER BY
      thp.seat_no ASC,
      thp.id ASC
    `,
    [handId],
  );

  return rows;
}

function buildPrivateHandPlayerState(
  player,
  requestingUserId,
  currentTurnHandPlayerId,
  handStatus,
) {
  const isRealPlayer = player.player_type === PLAYER_TYPE.REAL;

  const isLocalPlayer =
    isRealPlayer && Number(player.user_id) === Number(requestingUserId);

  let privateCards = [];

  const isRevealablePlayer = [
    PLAYER_STATUS.ACTIVE,
    PLAYER_STATUS.WINNER,
  ].includes(player.player_status);

  const shouldRevealAtResult =
    [HAND_STATUS.SHOWDOWN, HAND_STATUS.COMPLETED].includes(handStatus) &&
    isRevealablePlayer;

  /*
   * Hand চলার সময় শুধু local player
   * নিজের card পাবে।
   *
   * Showdown/completed হলে active এবং
   * winner player-দের card সবাই দেখবে।
   *
   * Packed, timeout এবং left player-এর
   * card গোপন থাকবে।
   */
  if (player.cards !== null && (isLocalPlayer || shouldRevealAtResult)) {
    privateCards = deserializeCards(player.cards);
  }

  return {
    handPlayerId: Number(player.hand_player_id),

    tablePlayerId:
      player.table_player_id === null ? null : Number(player.table_player_id),

    tableBotId:
      player.table_bot_id === null ? null : Number(player.table_bot_id),

    userId: player.user_id === null ? null : Number(player.user_id),

    botId: player.bot_id === null ? null : Number(player.bot_id),

    playerType: player.player_type,

    isBot: player.player_type === PLAYER_TYPE.BOT,

    isLocalPlayer,

    seatNo: Number(player.seat_no),

    name:
      player.player_type === PLAYER_TYPE.BOT
        ? player.bot_name || player.bot_code || "Bot"
        : player.full_name || player.username || player.uid || "Player",

    avatarUrl: player.avatar_url || null,

    status: player.player_status,

    cards: privateCards,

    /*
     * অন্য player-এর card গোপন থাকবে,
     * কিন্তু card count 3 দেখানো যাবে।
     */
    cardCount: Number(player.card_count || 0),

    isSeen: normalizeBoolean(player.is_seen),

    isDealer: normalizeBoolean(player.is_dealer),

    isCurrentTurn:
      Number(player.hand_player_id) === Number(currentTurnHandPlayerId),

    startingBalance: parseMoney(player.starting_balance),

    balance: parseMoney(player.ending_balance),

    currentBet: parseMoney(player.current_bet),

    totalContribution: parseMoney(player.total_contribution),

    lastAction: player.last_action || null,

    handRankValue:
      player.hand_rank_value === null ? null : Number(player.hand_rank_value),

    handRankName: player.hand_rank_name || null,

    prizeAmount: parseMoney(player.prize_amount),
  };
}

async function getTeenPattiHandState(tableId, requestingUserId) {
  const validTableId = parsePositiveInteger(tableId);

  const validUserId = parsePositiveInteger(requestingUserId);

  assertCondition(
    validTableId !== null,
    "Valid Teen Patti table ID is required.",
    400,
    "INVALID_TABLE_ID",
  );

  assertCondition(
    validUserId !== null,
    "Valid requesting user ID is required.",
    400,
    "INVALID_USER_ID",
  );

  const connection = await pool.getConnection();

  try {
    const table = await getTable(connection, validTableId);

    assertCondition(
      table,
      "Teen Patti table not found.",
      404,
      "TABLE_NOT_FOUND",
    );

    const requester = await getTablePlayerByUser(
      connection,
      validTableId,
      validUserId,
    );

    assertCondition(
      requester,
      "You are not a player of this table.",
      403,
      "NOT_TABLE_PLAYER",
    );

    const hand = await getLatestHand(connection, validTableId);

    if (!hand) {
      const tableState = await buildTableState(connection, validTableId);

      return {
        tableId: validTableId,

        hand: null,
        players: [],

        myHandPlayerId: null,
        myCards: [],

        sideShow: null,

        tableState,
      };
    }

    const handPlayerRows = await getHandPlayers(connection, Number(hand.id));

    const players = handPlayerRows.map((player) =>
      buildPrivateHandPlayerState(
        player,
        validUserId,
        hand.current_turn_hand_player_id,
        hand.hand_status,
      ),
    );

    const pendingSideShow = await getPendingSideShow(
      connection,
      Number(hand.id),
    );

    const localPlayer =
      players.find((player) => player.isLocalPlayer === true) || null;

    /*
     * এই security check ছাড়া অন্য user
     * table ID দিয়ে private state চাইতে পারত।
     */
    assertCondition(
      localPlayer,
      "You are not a participant of this Teen Patti hand.",
      403,
      "NOT_HAND_PLAYER",
    );

    return {
      tableId: validTableId,

      hand: {
        id: Number(hand.id),
        handId: Number(hand.id),

        roundNumber: Number(hand.round_number),

        status: hand.hand_status,

        dealerSeatNo:
          hand.dealer_seat_no === null ? null : Number(hand.dealer_seat_no),

        currentTurnHandPlayerId:
          hand.current_turn_hand_player_id === null
            ? null
            : Number(hand.current_turn_hand_player_id),

        bootAmount: parseMoney(hand.boot_amount),

        currentBet: parseMoney(hand.current_bet),

        potAmount: parseMoney(hand.pot_amount),

        serviceChargePercent: parseMoney(hand.service_charge_percent),

        serviceChargeAmount: parseMoney(hand.service_charge_amount),

        distributableAmount: parseMoney(hand.distributable_amount),

        actionStartedAt: hand.action_started_at,

        actionExpiresAt: hand.action_expires_at,

        settlementCompleted: normalizeBoolean(hand.settlement_completed),

        winnerHandPlayerId:
          hand.winner_hand_player_id === null
            ? null
            : Number(hand.winner_hand_player_id),

        stateVersion: Number(hand.state_version),

        startedAt: hand.started_at,

        completedAt: hand.completed_at,

        cancelledAt: hand.cancelled_at,
      },

      players,

      myHandPlayerId: localPlayer.handPlayerId,

      myCards: localPlayer.cards,

      sideShow: pendingSideShow
        ? {
            requestId: Number(pendingSideShow.id),

            handId: Number(pendingSideShow.hand_id),

            requesterHandPlayerId: Number(
              pendingSideShow.requester_hand_player_id,
            ),

            targetHandPlayerId: Number(pendingSideShow.target_hand_player_id),

            requestStatus: pendingSideShow.request_status,

            requestedAt: pendingSideShow.requested_at,

            expiresAt: pendingSideShow.expires_at,

            isRequester:
              Number(localPlayer.handPlayerId) ===
              Number(pendingSideShow.requester_hand_player_id),

            isTarget:
              Number(localPlayer.handPlayerId) ===
              Number(pendingSideShow.target_hand_player_id),

            canRespond:
              Number(localPlayer.handPlayerId) ===
                Number(pendingSideShow.target_hand_player_id) &&
              localPlayer.playerType === PLAYER_TYPE.REAL,
          }
        : null,
    };
  } finally {
    connection.release();
  }
}

/* =========================================================
   SEE CARDS ACTION
========================================================= */

async function getLockedHandPlayerByUser(connection, handId, tableId, userId) {
  const [rows] = await connection.query(
    `
    SELECT
      thp.id AS hand_player_id,
      thp.hand_id,
      thp.table_player_id,
      thp.table_bot_id,
      thp.player_type,
      thp.seat_no,
      thp.player_status,
      thp.cards,
      thp.is_seen,
      thp.is_dealer,
      thp.ending_balance,
      thp.current_bet,
      thp.total_contribution,
      thp.last_action,
      tp.user_id

    FROM teen_patti_hand_players thp

    INNER JOIN table_players tp
      ON tp.id =
         thp.table_player_id

    WHERE thp.hand_id = ?
      AND tp.table_id = ?
      AND tp.user_id = ?
      AND thp.player_type = 'real'

    LIMIT 1

    FOR UPDATE
    `,
    [handId, tableId, userId],
  );

  return rows[0] || null;
}

async function seeTeenPattiCards(tableId, requestingUserId) {
  const validTableId = parsePositiveInteger(tableId);

  const validUserId = parsePositiveInteger(requestingUserId);

  assertCondition(
    validTableId !== null,
    "Valid Teen Patti table ID is required.",
    400,
    "INVALID_TABLE_ID",
  );

  assertCondition(
    validUserId !== null,
    "Valid requesting user ID is required.",
    400,
    "INVALID_USER_ID",
  );

  const actionResult = await withTransaction(async (connection) => {
    const table = await getLockedTable(connection, validTableId);

    assertCondition(
      table,
      "Teen Patti table not found.",
      404,
      "TABLE_NOT_FOUND",
    );

    const hand = await getActiveHand(connection, validTableId, {
      lock: true,
    });

    assertCondition(
      hand,
      "No active Teen Patti hand was found.",
      409,
      "NO_ACTIVE_HAND",
    );

    assertCondition(
      hand.hand_status === HAND_STATUS.PLAYING,
      "Cards cannot be seen after the hand has ended.",
      409,
      "HAND_NOT_PLAYING",
    );

    const handPlayer = await getLockedHandPlayerByUser(
      connection,
      Number(hand.id),
      validTableId,
      validUserId,
    );

    assertCondition(
      handPlayer,
      "You are not a player of this hand.",
      403,
      "NOT_HAND_PLAYER",
    );

    assertCondition(
      handPlayer.player_status === PLAYER_STATUS.ACTIVE,
      "Only an active player can see cards.",
      409,
      "PLAYER_NOT_ACTIVE",
    );

    assertCondition(
      handPlayer.cards !== null,
      "Your Teen Patti cards were not found.",
      500,
      "PLAYER_CARDS_NOT_FOUND",
    );

    /*
     * Card data valid আছে কি না server
     * এখনই পরীক্ষা করবে।
     */
    const cards = deserializeCards(handPlayer.cards);

    /*
     * আগে Seen করা থাকলে আবার wallet,
     * pot বা turn পরিবর্তন হবে না।
     */
    if (normalizeBoolean(handPlayer.is_seen)) {
      return {
        alreadySeen: true,
        handId: Number(hand.id),

        handPlayerId: Number(handPlayer.hand_player_id),

        cards,
      };
    }

    await connection.query(
      `
          UPDATE teen_patti_hand_players

          SET
            is_seen = 1

          WHERE id = ?
            AND hand_id = ?
            AND player_status = 'active'
          `,
      [handPlayer.hand_player_id, hand.id],
    );

    await connection.query(
      `
          UPDATE table_players

          SET
            is_seen = 1

          WHERE id = ?
            AND table_id = ?
            AND user_id = ?
            AND is_active = 1
          `,
      [handPlayer.table_player_id, validTableId, validUserId],
    );

    await connection.query(
      `
          UPDATE teen_patti_hands

          SET
            state_version =
              state_version + 1

          WHERE id = ?
            AND hand_status = 'playing'
          `,
      [hand.id],
    );

    return {
      alreadySeen: false,

      handId: Number(hand.id),

      handPlayerId: Number(handPlayer.hand_player_id),

      cards,
    };
  });

  /*
   * Transaction commit হওয়ার পরে fresh
   * private state নেওয়া হচ্ছে।
   */
  const handState = await getTeenPattiHandState(validTableId, validUserId);

  return {
    success: true,

    message: actionResult.alreadySeen
      ? "Cards were already seen."
      : "Cards seen successfully.",

    alreadySeen: actionResult.alreadySeen,

    handId: actionResult.handId,

    handPlayerId: actionResult.handPlayerId,

    cards: actionResult.cards,

    handState,
  };
}

/* =========================================================
   BETTING ACTION HELPERS
========================================================= */

async function getLockedActiveHandPlayers(connection, handId) {
  const [rows] = await connection.query(
    `
    SELECT
      thp.id AS hand_player_id,
      thp.hand_id,
      thp.table_player_id,
      thp.table_bot_id,
      thp.player_type,
      thp.seat_no,
      thp.player_status,
      thp.is_seen,
      thp.ending_balance,
      thp.current_bet,
      thp.total_contribution,

      tp.user_id,
      tb.bot_id

    FROM teen_patti_hand_players thp

    LEFT JOIN table_players tp
      ON tp.id =
         thp.table_player_id

    LEFT JOIN table_bots tb
      ON tb.id =
         thp.table_bot_id

    WHERE thp.hand_id = ?
      AND thp.player_status = 'active'

    ORDER BY
      thp.seat_no ASC,
      thp.id ASC

    FOR UPDATE
    `,
    [handId],
  );

  return rows.map((row) => ({
    handPlayerId: Number(row.hand_player_id),

    tablePlayerId:
      row.table_player_id === null ? null : Number(row.table_player_id),

    tableBotId: row.table_bot_id === null ? null : Number(row.table_bot_id),

    userId: row.user_id === null ? null : Number(row.user_id),

    botId: row.bot_id === null ? null : Number(row.bot_id),

    playerType: row.player_type,

    seatNo: Number(row.seat_no),

    playerStatus: row.player_status,

    isSeen: normalizeBoolean(row.is_seen),

    endingBalance: parseMoney(row.ending_balance),

    currentBet: parseMoney(row.current_bet),

    totalContribution: parseMoney(row.total_contribution),
  }));
}

async function getNextActionSequence(connection, handId) {
  const [rows] = await connection.query(
    `
    SELECT
      COALESCE(
        MAX(action_sequence),
        0
      ) + 1 AS next_sequence

    FROM teen_patti_hand_actions

    WHERE hand_id = ?
    `,
    [handId],
  );

  return Math.max(1, Number(rows[0]?.next_sequence || 1));
}

async function getBlindTurnCount(connection, handId, handPlayerId) {
  const [rows] = await connection.query(
    `
    SELECT COUNT(*) AS blind_turn_count
    FROM teen_patti_hand_actions
    WHERE hand_id = ?
      AND hand_player_id = ?
      AND action_type IN ('blind', 'raise')
    `,
    [handId, handPlayerId],
  );

  return Math.max(0, Number(rows[0]?.blind_turn_count || 0));
}

function calculateTeenPattiBetAction(hand, handPlayer, requestedAction) {
  const action = String(requestedAction || "")
    .trim()
    .toLowerCase();

  const currentTableBet = parseMoney(hand.current_bet);

  assertCondition(
    currentTableBet > 0,
    "Current Teen Patti bet is invalid.",
    409,
    "INVALID_CURRENT_BET",
  );

  const isSeen = handPlayer.isSeen === true;

  if (action === ACTION_TYPE.BLIND) {
    assertCondition(
      !isSeen,
      "A seen player cannot play Blind.",
      409,
      "SEEN_PLAYER_CANNOT_BLIND",
    );

    return {
      actionType: ACTION_TYPE.BLIND,

      requestedAmount: currentTableBet,

      contributionAmount: currentTableBet,

      currentBetAfter: currentTableBet,
    };
  }

  if (action === ACTION_TYPE.CHAAL) {
    assertCondition(
      isSeen,
      "See your cards before playing Chaal.",
      409,
      "CHAAL_REQUIRES_SEEN",
    );

    return {
      actionType: ACTION_TYPE.CHAAL,

      requestedAmount: parseMoney(currentTableBet * 2),

      contributionAmount: parseMoney(currentTableBet * 2),

      currentBetAfter: currentTableBet,
    };
  }

  if (action === ACTION_TYPE.RAISE) {
    const raisedTableBet = parseMoney(currentTableBet * 2);

    const contributionAmount = isSeen
      ? parseMoney(raisedTableBet * 2)
      : raisedTableBet;

    return {
      actionType: ACTION_TYPE.RAISE,

      requestedAmount: contributionAmount,

      contributionAmount,

      currentBetAfter: raisedTableBet,
    };
  }

  throw createServiceError(
    "Invalid Teen Patti betting action.",
    400,
    "INVALID_BET_ACTION",
  );
}

async function debitTeenPattiActionAmount(
  connection,
  {
    playerType,
    userId,
    botId,
    amount,
    balanceBefore,
    tableId,
    handId,
    roundNumber,
    actionType,
  },
) {
  const validAmount = parseMoney(amount);

  const validBalanceBefore = parseMoney(balanceBefore);

  assertCondition(
    validAmount > 0,
    "Teen Patti action amount must be greater than zero.",
    400,
    "INVALID_ACTION_AMOUNT",
  );

  assertCondition(
    validBalanceBefore >= validAmount,
    "Insufficient balance for this action.",
    409,
    "INSUFFICIENT_ACTION_BALANCE",
  );

  const balanceAfter = parseMoney(validBalanceBefore - validAmount);

  if (playerType === PLAYER_TYPE.REAL) {
    const [debitResult] = await connection.query(
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
      [validAmount, validAmount, userId, validAmount],
    );

    assertCondition(
      debitResult.affectedRows === 1,
      "Player wallet debit failed.",
      409,
      "ACTION_DEBIT_FAILED",
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
        description
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
        'teen_patti_hand',
        ?,
        ?
      )
      `,
      [
        createTransactionId("TP_BET"),

        userId,

        validAmount,
        validBalanceBefore,
        balanceAfter,

        String(handId),

        `Teen Patti round ${roundNumber} ${actionType} at table ${tableId}`,
      ],
    );
  } else {
    const [debitResult] = await connection.query(
      `
        UPDATE teen_patti_bots

        SET
          wallet_balance =
            wallet_balance - ?

        WHERE id = ?
          AND status = 'active'
          AND wallet_balance >= ?
        `,
      [validAmount, botId, validAmount],
    );

    assertCondition(
      debitResult.affectedRows === 1,
      "Bot wallet debit failed.",
      409,
      "BOT_ACTION_DEBIT_FAILED",
    );
  }

  return balanceAfter;
}

async function performTeenPattiBetAction(
  tableId,
  requestingUserId,
  requestedAction,
) {
  const validTableId = parsePositiveInteger(tableId);

  const validUserId = parsePositiveInteger(requestingUserId);

  assertCondition(
    validTableId !== null,
    "Valid Teen Patti table ID is required.",
    400,
    "INVALID_TABLE_ID",
  );

  assertCondition(
    validUserId !== null,
    "Valid requesting user ID is required.",
    400,
    "INVALID_USER_ID",
  );

  const normalizedAction = String(requestedAction || "")
    .trim()
    .toLowerCase();

  assertCondition(
    [ACTION_TYPE.BLIND, ACTION_TYPE.CHAAL, ACTION_TYPE.RAISE].includes(
      normalizedAction,
    ),
    "Only Blind, Chaal or Raise is allowed.",
    400,
    "INVALID_BET_ACTION",
  );

  const actionResult = await withTransaction(async (connection) => {
    const table = await getLockedTable(connection, validTableId);

    assertCondition(
      table,
      "Teen Patti table not found.",
      404,
      "TABLE_NOT_FOUND",
    );

    const hand = await getActiveHand(connection, validTableId, {
      lock: true,
    });

    assertCondition(
      hand,
      "No active Teen Patti hand was found.",
      409,
      "NO_ACTIVE_HAND",
    );

    assertCondition(
      hand.hand_status === HAND_STATUS.PLAYING,
      "Teen Patti hand is not accepting actions.",
      409,
      "HAND_NOT_PLAYING",
    );

    /*
     * Pending Side Show-এর response না আসা
     * পর্যন্ত অন্য betting action বন্ধ থাকবে।
     */
    const pendingSideShow = await getPendingSideShow(
      connection,
      Number(hand.id),
      {
        lock: true,
      },
    );

    assertCondition(
      !pendingSideShow,
      "Please wait for the Side Show response.",
      409,
      "SIDE_SHOW_RESPONSE_PENDING",
    );

    const activePlayers = await getLockedActiveHandPlayers(
      connection,
      Number(hand.id),
    );

    assertCondition(
      activePlayers.length >= 2,
      "The hand does not have enough active players.",
      409,
      "NOT_ENOUGH_ACTIVE_PLAYERS",
    );

    const actingPlayer = activePlayers.find(
      (player) =>
        player.playerType === PLAYER_TYPE.REAL &&
        Number(player.userId) === validUserId,
    );

    assertCondition(
      actingPlayer,
      "You are not an active player of this hand.",
      403,
      "NOT_ACTIVE_HAND_PLAYER",
    );

    assertCondition(
      Number(hand.current_turn_hand_player_id) ===
        Number(actingPlayer.handPlayerId),
      "It is not your turn.",
      409,
      "NOT_YOUR_TURN",
    );

    const blindTurnsBefore =
      actingPlayer.isSeen === true
        ? 0
        : await getBlindTurnCount(
            connection,
            Number(hand.id),
            actingPlayer.handPlayerId,
          );

    assertCondition(
      actingPlayer.isSeen === true || blindTurnsBefore < MAX_BLIND_TURNS,
      "Maximum 3 Blind turns completed. Cards are now Seen.",
      409,
      "MAX_BLIND_TURNS_COMPLETED",
    );

    const betAction = calculateTeenPattiBetAction(
      hand,
      actingPlayer,
      normalizedAction,
    );

    const balanceBefore = parseMoney(actingPlayer.endingBalance);

    const balanceAfter = await debitTeenPattiActionAmount(connection, {
      playerType: actingPlayer.playerType,

      userId: actingPlayer.userId,

      botId: actingPlayer.botId,

      amount: betAction.contributionAmount,

      balanceBefore,

      tableId: validTableId,

      handId: Number(hand.id),

      roundNumber: Number(hand.round_number),

      actionType: betAction.actionType,
    });

    const potAfter = parseMoney(
      parseMoney(hand.pot_amount) + betAction.contributionAmount,
    );

    const totalContributionAfter = parseMoney(
      parseMoney(actingPlayer.totalContribution) + betAction.contributionAmount,
    );

    const isBlindTurn =
      actingPlayer.isSeen !== true &&
      [ACTION_TYPE.BLIND, ACTION_TYPE.RAISE].includes(betAction.actionType);

    const blindTurnsAfter = isBlindTurn
      ? blindTurnsBefore + 1
      : blindTurnsBefore;

    const autoSeenAfterAction =
      isBlindTurn && blindTurnsAfter >= MAX_BLIND_TURNS;

    const playerSeenAfterAction =
      actingPlayer.isSeen === true || autoSeenAfterAction;

    await connection.query(
      `
          UPDATE teen_patti_hand_players

          SET
          is_seen = ?,
            ending_balance = ?,
            current_bet = ?,
            total_contribution = ?,
            last_action = ?

          WHERE id = ?
            AND hand_id = ?
            AND player_status = 'active'
          `,
      [
        balanceAfter,

        betAction.contributionAmount,

        totalContributionAfter,

        betAction.actionType,

        actingPlayer.handPlayerId,
        hand.id,
      ],
    );

    await connection.query(
      `
          UPDATE table_players

          SET
            current_bet = ?

          WHERE id = ?
            AND table_id = ?
            AND user_id = ?
            AND is_active = 1
          `,
      [
        betAction.contributionAmount,

        actingPlayer.tablePlayerId,

        validTableId,
        validUserId,
      ],
    );

    const nextPlayer = findNextActiveMember(activePlayers, actingPlayer.seatNo);

    assertCondition(
      nextPlayer,
      "Next active Teen Patti player was not found.",
      500,
      "NEXT_PLAYER_NOT_FOUND",
    );

    const nextSequence = await getNextActionSequence(
      connection,
      Number(hand.id),
    );

    await connection.query(
      `
          INSERT INTO teen_patti_hand_actions (
            hand_id,
            hand_player_id,
            action_sequence,
            action_type,
            requested_amount,
            contribution_amount,
            balance_before,
            balance_after,
            current_bet_after,
            pot_after,
            is_automatic
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
            0
          )
          `,
      [
        hand.id,

        actingPlayer.handPlayerId,

        nextSequence,

        betAction.actionType,

        betAction.requestedAmount,

        betAction.contributionAmount,

        balanceBefore,
        balanceAfter,

        betAction.currentBetAfter,

        potAfter,
      ],
    );

    const actionStartedAt = new Date();

    const actionExpiresAt = createDateAfterSeconds(TURN_SECONDS);

    await connection.query(
      `
          UPDATE teen_patti_hands

          SET
            current_turn_hand_player_id = ?,
            current_bet = ?,
            pot_amount = ?,
            action_started_at = ?,
            action_expires_at = ?,
            state_version =
              state_version + 1

          WHERE id = ?
            AND hand_status = 'playing'
          `,
      [
        nextPlayer.handPlayerId,

        betAction.currentBetAfter,

        potAfter,

        actionStartedAt,
        actionExpiresAt,

        hand.id,
      ],
    );

    await connection.query(
      `
          UPDATE game_tables

          SET
            pot_amount = ?

          WHERE id = ?
            AND game_status = 'playing'
          `,
      [potAfter, validTableId],
    );

    return {
      handId: Number(hand.id),

      handPlayerId: actingPlayer.handPlayerId,

      actionType: betAction.actionType,

      contributionAmount: betAction.contributionAmount,

      balanceBefore,
      balanceAfter,

      currentBetAfter: betAction.currentBetAfter,

      potAfter,

      nextTurnHandPlayerId: nextPlayer.handPlayerId,

      nextTurnSeatNo: nextPlayer.seatNo,

      actionStartedAt,
      actionExpiresAt,
    };
  });

  const handState = await getTeenPattiHandState(validTableId, validUserId);

  return {
    success: true,

    message: `Teen Patti ${actionResult.actionType} successful.`,

    action: actionResult,

    handState,
  };
}

/* =========================================================
   WINNER AND SETTLEMENT ENGINE
========================================================= */

async function getLockedSettlementPlayers(connection, handId) {
  const [rows] = await connection.query(
    `
    SELECT
      thp.id AS hand_player_id,
      thp.hand_id,

      thp.table_player_id,
      thp.table_bot_id,

      thp.player_type,
      thp.seat_no,
      thp.player_status,

      thp.cards,
      thp.is_seen,
      thp.is_dealer,

      thp.starting_balance,
      thp.ending_balance,

      thp.current_bet,
      thp.total_contribution,

      thp.last_action,
      thp.hand_rank_value,
      thp.hand_rank_name,
      thp.prize_amount,

      tp.user_id,
      tb.bot_id,

      u.full_name,
      u.username,
      u.uid,

      b.bot_name,
      b.bot_code

    FROM teen_patti_hand_players thp

    LEFT JOIN table_players tp
      ON tp.id =
         thp.table_player_id

    LEFT JOIN users u
      ON u.id = tp.user_id

    LEFT JOIN table_bots tb
      ON tb.id =
         thp.table_bot_id

    LEFT JOIN teen_patti_bots b
      ON b.id = tb.bot_id

    WHERE thp.hand_id = ?

    ORDER BY
      thp.seat_no ASC,
      thp.id ASC

    FOR UPDATE
    `,
    [handId],
  );

  return rows.map((row) => ({
    handPlayerId: Number(row.hand_player_id),

    tablePlayerId:
      row.table_player_id === null ? null : Number(row.table_player_id),

    tableBotId: row.table_bot_id === null ? null : Number(row.table_bot_id),

    userId: row.user_id === null ? null : Number(row.user_id),

    botId: row.bot_id === null ? null : Number(row.bot_id),

    playerType: row.player_type,

    seatNo: Number(row.seat_no),

    playerStatus: row.player_status,

    cards: row.cards === null ? [] : deserializeCards(row.cards),

    isSeen: normalizeBoolean(row.is_seen),

    isDealer: normalizeBoolean(row.is_dealer),

    startingBalance: parseMoney(row.starting_balance),

    endingBalance: parseMoney(row.ending_balance),

    currentBet: parseMoney(row.current_bet),

    totalContribution: parseMoney(row.total_contribution),

    lastAction: row.last_action || null,

    handRankValue:
      row.hand_rank_value === null ? null : Number(row.hand_rank_value),

    handRankName: row.hand_rank_name || null,

    prizeAmount: parseMoney(row.prize_amount),

    name:
      row.player_type === PLAYER_TYPE.BOT
        ? row.bot_name || row.bot_code || "Bot"
        : row.full_name || row.username || row.uid || "Player",
  }));
}

function distributePrizeMoney(totalAmount, winnerCount) {
  const validAmount = parseMoney(totalAmount);

  const validWinnerCount = Number(winnerCount);

  assertCondition(
    Number.isInteger(validWinnerCount) && validWinnerCount > 0,
    "At least one winner is required.",
    500,
    "WINNER_REQUIRED",
  );

  /*
   * Float rounding এড়াতে পুরো হিসাব
   * paisa/cents-এ করা হচ্ছে।
   */
  const totalPaisa = Math.round(validAmount * 100);

  const baseShare = Math.floor(totalPaisa / validWinnerCount);

  let remainingPaisa = totalPaisa - baseShare * validWinnerCount;

  return Array.from(
    {
      length: validWinnerCount,
    },
    () => {
      let playerPaisa = baseShare;

      if (remainingPaisa > 0) {
        playerPaisa += 1;
        remainingPaisa -= 1;
      }

      return Number((playerPaisa / 100).toFixed(2));
    },
  );
}

async function creditTeenPattiWinner(
  connection,
  { winner, prizeAmount, tableId, handId, roundNumber },
) {
  const validPrizeAmount = parseMoney(prizeAmount);

  assertCondition(
    validPrizeAmount >= 0,
    "Winner prize amount is invalid.",
    500,
    "INVALID_PRIZE_AMOUNT",
  );

  const balanceBefore = parseMoney(winner.endingBalance);

  const balanceAfter = parseMoney(balanceBefore + validPrizeAmount);

  if (winner.playerType === PLAYER_TYPE.REAL) {
    const [creditResult] = await connection.query(
      `
        UPDATE users

        SET
          wallet_balance =
            wallet_balance + ?

        WHERE id = ?
          AND account_status = 'active'
        `,
      [validPrizeAmount, winner.userId],
    );

    assertCondition(
      creditResult.affectedRows === 1,
      "Winner wallet credit failed.",
      500,
      "WINNER_CREDIT_FAILED",
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
        description
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
        'teen_patti_hand',
        ?,
        ?
      )
      `,
      [
        createTransactionId("TP_WIN"),

        winner.userId,

        validPrizeAmount,
        balanceBefore,
        balanceAfter,

        String(handId),

        `Teen Patti round ${roundNumber} winner prize at table ${tableId}`,
      ],
    );

    await connection.query(
      `
      UPDATE table_players

      SET
        total_win =
          total_win + ?,
        current_bet = 0.00

      WHERE id = ?
        AND table_id = ?
      `,
      [validPrizeAmount, winner.tablePlayerId, tableId],
    );
  } else {
    const [creditResult] = await connection.query(
      `
        UPDATE teen_patti_bots

        SET
          wallet_balance =
            wallet_balance + ?

        WHERE id = ?
          AND status = 'active'
        `,
      [validPrizeAmount, winner.botId],
    );

    assertCondition(
      creditResult.affectedRows === 1,
      "Bot winner wallet credit failed.",
      500,
      "BOT_WINNER_CREDIT_FAILED",
    );

    await connection.query(
      `
      UPDATE table_bots

      SET
        total_win =
          total_win + ?,
        current_bet = 0.00

      WHERE id = ?
        AND table_id = ?
      `,
      [validPrizeAmount, winner.tableBotId, tableId],
    );
  }

  return {
    balanceBefore,
    balanceAfter,
  };
}

async function settleTeenPattiHandWithinTransaction(
  connection,
  tableId,
  options = {},
) {
  const validTableId = parsePositiveInteger(tableId);

  assertCondition(
    validTableId !== null,
    "Valid Teen Patti table ID is required.",
    400,
    "INVALID_TABLE_ID",
  );

  const table = await getLockedTable(connection, validTableId);

  assertCondition(table, "Teen Patti table not found.", 404, "TABLE_NOT_FOUND");

  const hand = await getActiveHand(connection, validTableId, {
    lock: true,
  });

  assertCondition(
    hand,
    "No active Teen Patti hand was found.",
    409,
    "NO_ACTIVE_HAND",
  );

  /*
   * Idempotency:
   * settlement_completed হয়ে গেলে
   * দ্বিতীয়বার prize দেওয়া যাবে না।
   */
  assertCondition(
    !normalizeBoolean(hand.settlement_completed),
    "Teen Patti hand is already settled.",
    409,
    "HAND_ALREADY_SETTLED",
  );

  const players = await getLockedSettlementPlayers(connection, Number(hand.id));

  const activePlayers = players.filter(
    (player) => player.playerStatus === PLAYER_STATUS.ACTIVE,
  );

  assertCondition(
    activePlayers.length >= 1,
    "No active Teen Patti player remains.",
    409,
    "NO_ACTIVE_PLAYER",
  );

  const settlementReason = String(
    options.reason || (activePlayers.length === 1 ? "last_player" : "showdown"),
  )
    .trim()
    .toLowerCase();

  let winningEntries;

  /*
   * একজন active থাকলে card compare ছাড়াই
   * সেই player winner হবে।
   */
  if (activePlayers.length === 1) {
    const winner = activePlayers[0];

    const evaluation = evaluateHand(winner.cards);

    winningEntries = [
      {
        handPlayerId: winner.handPlayerId,

        evaluation,
      },
    ];
  } else {
    assertCondition(
      settlementReason === "showdown",
      "Multiple active players require a showdown.",
      409,
      "SHOWDOWN_REQUIRED",
    );

    winningEntries = findWinningHands(
      activePlayers.map((player) => ({
        handPlayerId: player.handPlayerId,

        cards: player.cards,
      })),
    );
  }

  /*
   * Showdown-এর active player-দের rank
   * database-এ সংরক্ষণ করা হচ্ছে।
   */
  for (const player of activePlayers) {
    const evaluation = evaluateHand(player.cards);

    await connection.query(
      `
      UPDATE teen_patti_hand_players

      SET
        hand_rank_value = ?,
        hand_rank_name = ?

      WHERE id = ?
        AND hand_id = ?
      `,
      [evaluation.rankValue, evaluation.rankName, player.handPlayerId, hand.id],
    );

    player.evaluation = evaluation;
  }

  const winnerIds = new Set(
    winningEntries.map((entry) => Number(entry.handPlayerId)),
  );

  const winners = activePlayers.filter((player) =>
    winnerIds.has(Number(player.handPlayerId)),
  );

  assertCondition(
    winners.length >= 1,
    "Teen Patti winner could not be resolved.",
    500,
    "WINNER_NOT_FOUND",
  );

  const grossPot = parseMoney(hand.pot_amount);

  const serviceChargePercent = parseMoney(
    hand.service_charge_percent,
    DEFAULT_SERVICE_CHARGE_PERCENT,
  );

  const serviceChargeAmount = calculatePercentage(
    grossPot,
    serviceChargePercent,
  );

  const distributableAmount = parseMoney(grossPot - serviceChargeAmount);

  const prizeShares = distributePrizeMoney(distributableAmount, winners.length);

  const winnerResults = [];

  for (let index = 0; index < winners.length; index += 1) {
    const winner = winners[index];

    const prizeAmount = prizeShares[index];

    const creditResult = await creditTeenPattiWinner(connection, {
      winner,
      prizeAmount,

      tableId: validTableId,

      handId: Number(hand.id),

      roundNumber: Number(hand.round_number),
    });

    const evaluation = winner.evaluation || evaluateHand(winner.cards);

    await connection.query(
      `
      UPDATE teen_patti_hand_players

      SET
        player_status = 'winner',

        ending_balance = ?,

        hand_rank_value = ?,
        hand_rank_name = ?,

        prize_amount = ?

      WHERE id = ?
        AND hand_id = ?
      `,
      [
        creditResult.balanceAfter,

        evaluation.rankValue,
        evaluation.rankName,

        prizeAmount,

        winner.handPlayerId,
        hand.id,
      ],
    );

    winnerResults.push({
      handPlayerId: winner.handPlayerId,

      tablePlayerId: winner.tablePlayerId,

      tableBotId: winner.tableBotId,

      userId: winner.userId,

      botId: winner.botId,

      playerType: winner.playerType,

      seatNo: winner.seatNo,

      name: winner.name,

      handRankValue: evaluation.rankValue,

      handRankName: evaluation.rankName,

      grossShare: prizeAmount,

      prizeAmount,

      balanceBefore: creditResult.balanceBefore,

      balanceAfter: creditResult.balanceAfter,
    });
  }

  /*
   * Single winner হলে FK column-এ winner ID।
   * Tie হলে winner_hand_player_id NULL;
   * winner list prize_amount দিয়ে পাওয়া যাবে।
   */
  const singleWinnerId =
    winnerResults.length === 1 ? winnerResults[0].handPlayerId : null;

  await connection.query(
    `
    UPDATE teen_patti_hands

    SET
      hand_status = 'completed',

      current_turn_hand_player_id =
        NULL,

      service_charge_amount = ?,
      distributable_amount = ?,

      settlement_completed = 1,

      winner_hand_player_id = ?,

      action_started_at = NULL,
      action_expires_at = NULL,

      state_version =
        state_version + 1,

      completed_at = NOW()

    WHERE id = ?
      AND settlement_completed = 0
      AND hand_status IN (
        'starting',
        'playing',
        'showdown'
      )
    `,
    [serviceChargeAmount, distributableAmount, singleWinnerId, hand.id],
  );

  await connection.query(
    `
    UPDATE game_tables

    SET
      game_status = 'waiting',
      pot_amount = 0.00

    WHERE id = ?
    `,
    [validTableId],
  );

  await connection.query(
    `
    UPDATE table_players

    SET
      current_bet = 0.00,
      cards = NULL

    WHERE table_id = ?
    `,
    [validTableId],
  );

  await connection.query(
    `
    UPDATE table_bots

    SET
      current_bet = 0.00,
      cards = NULL

    WHERE table_id = ?
    `,
    [validTableId],
  );

  return {
    tableId: validTableId,

    handId: Number(hand.id),

    roundNumber: Number(hand.round_number),

    reason: settlementReason,

    grossPot,

    serviceChargePercent,
    serviceChargeAmount,

    distributableAmount,

    isSplitPot: winnerResults.length > 1,

    winners: winnerResults,

    settlementCompleted: true,
  };
}

/* =========================================================
   PACK ACTION
========================================================= */

async function packTeenPattiHand(tableId, requestingUserId, options = {}) {
  const validTableId = parsePositiveInteger(tableId);

  const validUserId = parsePositiveInteger(requestingUserId);

  assertCondition(
    validTableId !== null,
    "Valid Teen Patti table ID is required.",
    400,
    "INVALID_TABLE_ID",
  );

  assertCondition(
    validUserId !== null,
    "Valid requesting user ID is required.",
    400,
    "INVALID_USER_ID",
  );

  const isAutomatic = options.isAutomatic === true;

  const actionResult = await withTransaction(async (connection) => {
    const table = await getLockedTable(connection, validTableId);

    assertCondition(
      table,
      "Teen Patti table not found.",
      404,
      "TABLE_NOT_FOUND",
    );

    const hand = await getActiveHand(connection, validTableId, {
      lock: true,
    });

    assertCondition(
      hand,
      "No active Teen Patti hand was found.",
      409,
      "NO_ACTIVE_HAND",
    );

    assertCondition(
      hand.hand_status === HAND_STATUS.PLAYING,
      "Teen Patti hand is not accepting Pack.",
      409,
      "HAND_NOT_PLAYING",
    );

    /*
     * connection এবং active hand পাওয়ার পরে
     * pending Side Show check হবে।
     */
    const pendingSideShow = await getPendingSideShow(
      connection,
      Number(hand.id),
      {
        lock: true,
      },
    );

    assertCondition(
      !pendingSideShow,
      "Please wait for the Side Show response.",
      409,
      "SIDE_SHOW_RESPONSE_PENDING",
    );

    const activePlayers = await getLockedActiveHandPlayers(
      connection,
      Number(hand.id),
    );

    assertCondition(
      activePlayers.length >= 2,
      "The hand does not have enough active players.",
      409,
      "NOT_ENOUGH_ACTIVE_PLAYERS",
    );

    const actingPlayer = activePlayers.find(
      (player) =>
        player.playerType === PLAYER_TYPE.REAL &&
        Number(player.userId) === validUserId,
    );

    assertCondition(
      actingPlayer,
      "You are not an active player of this hand.",
      403,
      "NOT_ACTIVE_HAND_PLAYER",
    );

    assertCondition(
      Number(hand.current_turn_hand_player_id) ===
        Number(actingPlayer.handPlayerId),
      "It is not your turn.",
      409,
      "NOT_YOUR_TURN",
    );

    const actionType = isAutomatic ? ACTION_TYPE.TIMEOUT : ACTION_TYPE.PACK;

    const packedStatus = isAutomatic
      ? PLAYER_STATUS.TIMEOUT
      : PLAYER_STATUS.PACKED;

    await connection.query(
      `
          UPDATE teen_patti_hand_players

          SET
            player_status = ?,
            last_action = ?

          WHERE id = ?
            AND hand_id = ?
            AND player_status = 'active'
          `,
      [packedStatus, actionType, actingPlayer.handPlayerId, hand.id],
    );

    await connection.query(
      `
          UPDATE table_players

          SET
            is_packed = 1,
            current_bet = 0.00

          WHERE id = ?
            AND table_id = ?
            AND user_id = ?
          `,
      [actingPlayer.tablePlayerId, validTableId, validUserId],
    );

    const nextSequence = await getNextActionSequence(
      connection,
      Number(hand.id),
    );

    await connection.query(
      `
          INSERT INTO teen_patti_hand_actions (
            hand_id,
            hand_player_id,
            action_sequence,
            action_type,
            requested_amount,
            contribution_amount,
            balance_before,
            balance_after,
            current_bet_after,
            pot_after,
            is_automatic
          )
          VALUES (
            ?,
            ?,
            ?,
            ?,
            0.00,
            0.00,
            ?,
            ?,
            ?,
            ?,
            ?
          )
          `,
      [
        hand.id,
        actingPlayer.handPlayerId,
        nextSequence,
        actionType,

        actingPlayer.endingBalance,
        actingPlayer.endingBalance,

        parseMoney(hand.current_bet),

        parseMoney(hand.pot_amount),

        isAutomatic ? 1 : 0,
      ],
    );

    const remainingPlayers = activePlayers.filter(
      (player) =>
        Number(player.handPlayerId) !== Number(actingPlayer.handPlayerId),
    );

    /*
     * একজন active player বাকি থাকলে
     * একই transaction-এ settlement হবে।
     */
    if (remainingPlayers.length === 1) {
      const settlement = await settleTeenPattiHandWithinTransaction(
        connection,
        validTableId,
        {
          reason: "last_player",
        },
      );

      return {
        handId: Number(hand.id),

        handPlayerId: actingPlayer.handPlayerId,

        actionType,
        packedStatus,
        isAutomatic,

        handCompleted: true,

        nextTurnHandPlayerId: null,
        nextTurnSeatNo: null,

        settlement,
      };
    }

    const nextPlayer = findNextActiveMember(
      remainingPlayers,
      actingPlayer.seatNo,
    );

    assertCondition(
      nextPlayer,
      "Next active Teen Patti player was not found.",
      500,
      "NEXT_PLAYER_NOT_FOUND",
    );

    const actionStartedAt = new Date();

    const actionExpiresAt = createDateAfterSeconds(TURN_SECONDS);

    await connection.query(
      `
          UPDATE teen_patti_hands

          SET
            current_turn_hand_player_id = ?,
            action_started_at = ?,
            action_expires_at = ?,
            state_version =
              state_version + 1

          WHERE id = ?
            AND hand_status = 'playing'
          `,
      [nextPlayer.handPlayerId, actionStartedAt, actionExpiresAt, hand.id],
    );

    return {
      handId: Number(hand.id),

      handPlayerId: actingPlayer.handPlayerId,

      actionType,
      packedStatus,
      isAutomatic,

      handCompleted: false,

      nextTurnHandPlayerId: nextPlayer.handPlayerId,

      nextTurnSeatNo: nextPlayer.seatNo,

      actionStartedAt,
      actionExpiresAt,

      settlement: null,
    };
  });

  const handState = await getTeenPattiHandState(validTableId, validUserId);

  return {
    success: true,

    message: actionResult.handCompleted
      ? "Player packed and the hand was completed."
      : isAutomatic
        ? "Turn timed out and the player was packed."
        : "Teen Patti Pack successful.",

    action: actionResult,

    handState,
  };
}

/* =========================================================
   SHOW ACTION
========================================================= */

async function showTeenPattiHand(tableId, requestingUserId) {
  const validTableId = parsePositiveInteger(tableId);

  const validUserId = parsePositiveInteger(requestingUserId);

  assertCondition(
    validTableId !== null,
    "Valid Teen Patti table ID is required.",
    400,
    "INVALID_TABLE_ID",
  );

  assertCondition(
    validUserId !== null,
    "Valid requesting user ID is required.",
    400,
    "INVALID_USER_ID",
  );

  const actionResult = await withTransaction(async (connection) => {
    const table = await getLockedTable(connection, validTableId);

    assertCondition(
      table,
      "Teen Patti table not found.",
      404,
      "TABLE_NOT_FOUND",
    );

    const hand = await getActiveHand(connection, validTableId, {
      lock: true,
    });

    assertCondition(
      hand,
      "No active Teen Patti hand was found.",
      409,
      "NO_ACTIVE_HAND",
    );

    assertCondition(
      hand.hand_status === HAND_STATUS.PLAYING,
      "Teen Patti hand is not accepting Show.",
      409,
      "HAND_NOT_PLAYING",
    );

    /*
     * Pending Side Show-এর response না আসা
     * পর্যন্ত Show বন্ধ থাকবে।
     */
    const pendingSideShow = await getPendingSideShow(
      connection,
      Number(hand.id),
      {
        lock: true,
      },
    );

    assertCondition(
      !pendingSideShow,
      "Please wait for the Side Show response.",
      409,
      "SIDE_SHOW_RESPONSE_PENDING",
    );

    const activePlayers = await getLockedActiveHandPlayers(
      connection,
      Number(hand.id),
    );

    assertCondition(
      activePlayers.length === 2,
      "Show is available only when two active players remain.",
      409,
      "SHOW_REQUIRES_TWO_PLAYERS",
    );

    const actingPlayer = activePlayers.find(
      (player) =>
        player.playerType === PLAYER_TYPE.REAL &&
        Number(player.userId) === validUserId,
    );

    assertCondition(
      actingPlayer,
      "You are not an active player of this hand.",
      403,
      "NOT_ACTIVE_HAND_PLAYER",
    );

    assertCondition(
      Number(hand.current_turn_hand_player_id) ===
        Number(actingPlayer.handPlayerId),
      "It is not your turn.",
      409,
      "NOT_YOUR_TURN",
    );

    assertCondition(
      actingPlayer.isSeen === true,
      "See your cards before requesting Show.",
      409,
      "SHOW_REQUIRES_SEEN",
    );

    const currentTableBet = parseMoney(hand.current_bet);

    const showAmount = parseMoney(currentTableBet * 2);

    assertCondition(
      showAmount > 0,
      "Valid Show amount could not be calculated.",
      409,
      "INVALID_SHOW_AMOUNT",
    );

    const balanceBefore = parseMoney(actingPlayer.endingBalance);

    const balanceAfter = await debitTeenPattiActionAmount(connection, {
      playerType: actingPlayer.playerType,

      userId: actingPlayer.userId,

      botId: actingPlayer.botId,

      amount: showAmount,

      balanceBefore,

      tableId: validTableId,

      handId: Number(hand.id),

      roundNumber: Number(hand.round_number),

      actionType: ACTION_TYPE.SHOW,
    });

    const potAfter = parseMoney(parseMoney(hand.pot_amount) + showAmount);

    const totalContributionAfter = parseMoney(
      parseMoney(actingPlayer.totalContribution) + showAmount,
    );

    await connection.query(
      `
          UPDATE teen_patti_hand_players

          SET
            ending_balance = ?,
            current_bet = ?,
            total_contribution = ?,
            last_action = 'show'

          WHERE id = ?
            AND hand_id = ?
            AND player_status = 'active'
          `,
      [
        balanceAfter,
        showAmount,
        totalContributionAfter,

        actingPlayer.handPlayerId,
        hand.id,
      ],
    );

    await connection.query(
      `
          UPDATE table_players

          SET
            current_bet = ?

          WHERE id = ?
            AND table_id = ?
            AND user_id = ?
            AND is_active = 1
          `,
      [showAmount, actingPlayer.tablePlayerId, validTableId, validUserId],
    );

    const nextSequence = await getNextActionSequence(
      connection,
      Number(hand.id),
    );

    await connection.query(
      `
          INSERT INTO teen_patti_hand_actions (
            hand_id,
            hand_player_id,
            action_sequence,
            action_type,
            requested_amount,
            contribution_amount,
            balance_before,
            balance_after,
            current_bet_after,
            pot_after,
            is_automatic
          )
          VALUES (
            ?,
            ?,
            ?,
            'show',
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            0
          )
          `,
      [
        hand.id,
        actingPlayer.handPlayerId,
        nextSequence,

        showAmount,
        showAmount,

        balanceBefore,
        balanceAfter,

        currentTableBet,
        potAfter,
      ],
    );

    /*
     * Settlement-এর আগে Showdown state হবে।
     * ফলে completed state-এ active player-দের
     * cards frontend-এ reveal করা যাবে।
     */
    await connection.query(
      `
          UPDATE teen_patti_hands

          SET
            hand_status = 'showdown',
            current_turn_hand_player_id =
              NULL,
            pot_amount = ?,
            action_started_at = NULL,
            action_expires_at = NULL,
            state_version =
              state_version + 1

          WHERE id = ?
            AND hand_status = 'playing'
          `,
      [potAfter, hand.id],
    );

    await connection.query(
      `
          UPDATE game_tables

          SET
            pot_amount = ?

          WHERE id = ?
            AND game_status = 'playing'
          `,
      [potAfter, validTableId],
    );

    const settlement = await settleTeenPattiHandWithinTransaction(
      connection,
      validTableId,
      {
        reason: "showdown",
      },
    );

    return {
      handId: Number(hand.id),

      handPlayerId: actingPlayer.handPlayerId,

      actionType: ACTION_TYPE.SHOW,

      contributionAmount: showAmount,

      balanceBefore,
      balanceAfter,

      potAfter,

      handCompleted: true,

      settlement,
    };
  });

  const handState = await getTeenPattiHandState(validTableId, validUserId);

  return {
    success: true,

    message: "Teen Patti Show completed successfully.",

    action: actionResult,

    settlement: actionResult.settlement,

    handState,
  };
}
/* =========================================================
   SERVER TURN TIMEOUT
========================================================= */

async function timeoutTeenPattiTurn(tableId, expectedHandId) {
  const validTableId = parsePositiveInteger(tableId);

  const validHandId = parsePositiveInteger(expectedHandId);

  assertCondition(
    validTableId !== null,
    "Valid Teen Patti table ID is required.",
    400,
    "INVALID_TABLE_ID",
  );

  assertCondition(
    validHandId !== null,
    "Valid Teen Patti hand ID is required.",
    400,
    "INVALID_HAND_ID",
  );

  return withTransaction(async (connection) => {
    const table = await getLockedTable(connection, validTableId);

    if (!table) {
      return {
        ignored: true,
        reason: "table_not_found",
      };
    }

    const hand = await getActiveHand(connection, validTableId, {
      lock: true,
    });

    /*
     * Timer চলার মধ্যে hand শেষ হয়ে গেলে
     * পুরোনো timer কিছু পরিবর্তন করবে না।
     */
    if (!hand) {
      return {
        ignored: true,
        reason: "no_active_hand",
      };
    }

    if (Number(hand.id) !== validHandId) {
      return {
        ignored: true,
        reason: "stale_hand_timer",
      };
    }

    if (hand.hand_status !== HAND_STATUS.PLAYING) {
      return {
        ignored: true,
        reason: "hand_not_playing",
      };
    }

    if (hand.current_turn_hand_player_id === null) {
      return {
        ignored: true,
        reason: "no_current_turn",
      };
    }

    const expiresAt = hand.action_expires_at
      ? new Date(hand.action_expires_at).getTime()
      : null;

    /*
     * Timer একটু আগে fire করলে action
     * automatic pack হবে না।
     */
    if (
      expiresAt === null ||
      !Number.isFinite(expiresAt) ||
      Date.now() < expiresAt
    ) {
      return {
        ignored: true,
        reason: "turn_not_expired",

        expiresAt: hand.action_expires_at,
      };
    }

    const activePlayers = await getLockedActiveHandPlayers(
      connection,
      Number(hand.id),
    );

    const timedOutPlayer = activePlayers.find(
      (player) =>
        Number(player.handPlayerId) ===
        Number(hand.current_turn_hand_player_id),
    );

    if (!timedOutPlayer) {
      return {
        ignored: true,
        reason: "current_player_not_active",
      };
    }

    await connection.query(
      `
        UPDATE teen_patti_hand_players

        SET
          player_status = 'timeout',
          last_action = 'timeout'

        WHERE id = ?
          AND hand_id = ?
          AND player_status = 'active'
        `,
      [timedOutPlayer.handPlayerId, hand.id],
    );

    if (timedOutPlayer.playerType === PLAYER_TYPE.REAL) {
      await connection.query(
        `
          UPDATE table_players

          SET
            is_packed = 1,
            current_bet = 0.00

          WHERE id = ?
            AND table_id = ?
          `,
        [timedOutPlayer.tablePlayerId, validTableId],
      );
    } else {
      await connection.query(
        `
          UPDATE table_bots

          SET
            is_packed = 1,
            current_bet = 0.00

          WHERE id = ?
            AND table_id = ?
          `,
        [timedOutPlayer.tableBotId, validTableId],
      );
    }

    const nextSequence = await getNextActionSequence(
      connection,
      Number(hand.id),
    );

    await connection.query(
      `
        INSERT INTO teen_patti_hand_actions (
          hand_id,
          hand_player_id,
          action_sequence,
          action_type,
          requested_amount,
          contribution_amount,
          balance_before,
          balance_after,
          current_bet_after,
          pot_after,
          is_automatic
        )
        VALUES (
          ?,
          ?,
          ?,
          'timeout',
          0.00,
          0.00,
          ?,
          ?,
          ?,
          ?,
          1
        )
        `,
      [
        hand.id,
        timedOutPlayer.handPlayerId,
        nextSequence,

        timedOutPlayer.endingBalance,
        timedOutPlayer.endingBalance,

        parseMoney(hand.current_bet),

        parseMoney(hand.pot_amount),
      ],
    );

    const remainingPlayers = activePlayers.filter(
      (player) =>
        Number(player.handPlayerId) !== Number(timedOutPlayer.handPlayerId),
    );

    /*
     * Timeout-এর পরে একজন থাকলে
     * automatic winner settlement।
     */
    if (remainingPlayers.length === 1) {
      const settlement = await settleTeenPattiHandWithinTransaction(
        connection,
        validTableId,
        {
          reason: "last_player",
        },
      );

      return {
        ignored: false,

        tableId: validTableId,

        handId: Number(hand.id),

        actionType: ACTION_TYPE.TIMEOUT,

        timedOutHandPlayerId: timedOutPlayer.handPlayerId,

        timedOutSeatNo: timedOutPlayer.seatNo,

        timedOutPlayerType: timedOutPlayer.playerType,

        handCompleted: true,

        nextTurnHandPlayerId: null,

        settlement,
      };
    }

    const nextPlayer = findNextActiveMember(
      remainingPlayers,
      timedOutPlayer.seatNo,
    );

    assertCondition(
      nextPlayer,
      "Next active Teen Patti player was not found.",
      500,
      "NEXT_PLAYER_NOT_FOUND",
    );

    const actionStartedAt = new Date();

    const actionExpiresAt = createDateAfterSeconds(TURN_SECONDS);

    await connection.query(
      `
        UPDATE teen_patti_hands

        SET
          current_turn_hand_player_id = ?,

          action_started_at = ?,
          action_expires_at = ?,

          state_version =
            state_version + 1

        WHERE id = ?
          AND hand_status = 'playing'
        `,
      [nextPlayer.handPlayerId, actionStartedAt, actionExpiresAt, hand.id],
    );

    return {
      ignored: false,

      tableId: validTableId,

      handId: Number(hand.id),

      actionType: ACTION_TYPE.TIMEOUT,

      timedOutHandPlayerId: timedOutPlayer.handPlayerId,

      timedOutSeatNo: timedOutPlayer.seatNo,

      timedOutPlayerType: timedOutPlayer.playerType,

      handCompleted: false,

      nextTurnHandPlayerId: nextPlayer.handPlayerId,

      nextTurnSeatNo: nextPlayer.seatNo,

      actionStartedAt,
      actionExpiresAt,

      settlement: null,
    };
  });
}

/* =========================================================
   FAIR BOT DECISION ENGINE
========================================================= */

function createSecurePercentage() {
  return crypto.randomInt(0, 100);
}

async function getLockedCurrentBotPlayer(connection, handId, handPlayerId) {
  const [rows] = await connection.query(
    `
    SELECT
      thp.id AS hand_player_id,
      thp.hand_id,
      thp.table_bot_id,
      thp.player_type,
      thp.seat_no,
      thp.player_status,
      thp.cards,
      thp.is_seen,
      thp.ending_balance,
      thp.current_bet,
      thp.total_contribution,

      tb.bot_id,

      b.bot_name,
      b.bot_code,
      b.wallet_balance,
      b.difficulty,
      b.playing_style

    FROM teen_patti_hand_players thp

    INNER JOIN table_bots tb
      ON tb.id =
         thp.table_bot_id

    INNER JOIN teen_patti_bots b
      ON b.id = tb.bot_id

    WHERE thp.id = ?
      AND thp.hand_id = ?
      AND thp.player_type = 'bot'

    LIMIT 1

    FOR UPDATE
    `,
    [handPlayerId, handId],
  );

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];

  return {
    handPlayerId: Number(row.hand_player_id),

    handId: Number(row.hand_id),

    tableBotId: Number(row.table_bot_id),

    botId: Number(row.bot_id),

    playerType: PLAYER_TYPE.BOT,

    seatNo: Number(row.seat_no),

    playerStatus: row.player_status,

    cards: row.cards === null ? [] : deserializeCards(row.cards),

    isSeen: normalizeBoolean(row.is_seen),

    endingBalance: parseMoney(row.ending_balance),

    currentBet: parseMoney(row.current_bet),

    totalContribution: parseMoney(row.total_contribution),

    name: row.bot_name || row.bot_code || "Bot",

    difficulty: String(row.difficulty || "normal").toLowerCase(),

    playingStyle: String(row.playing_style || "balanced").toLowerCase(),
  };
}

function shouldBotSeeCards(bot) {
  if (bot.isSeen === true) {
    return true;
  }

  const percentage = createSecurePercentage();

  const seeChanceByDifficulty = {
    easy: 30,
    normal: 45,
    hard: 60,
  };

  const baseChance = seeChanceByDifficulty[bot.difficulty] || 45;

  return percentage < baseChance;
}

function getBotPackChance(bot, handEvaluation) {
  /*
   * category:
   * 1 High Card
   * 2 Pair
   * 3 Color
   * 4 Sequence
   * 5 Pure Sequence
   * 6 Trail
   */
  const category = Number(handEvaluation?.category || 1);

  let packChance;

  if (category >= 5) {
    packChance = 2;
  } else if (category === 4) {
    packChance = 5;
  } else if (category === 3) {
    packChance = 10;
  } else if (category === 2) {
    packChance = 15;
  } else {
    packChance = 38;
  }

  if (bot.playingStyle === "aggressive") {
    packChance -= 8;
  }

  if (bot.playingStyle === "defensive") {
    packChance += 10;
  }

  return Math.min(75, Math.max(1, packChance));
}

function getBotRaiseChance(bot, handEvaluation) {
  const category = Number(handEvaluation?.category || 1);

  let raiseChance;

  if (category >= 5) {
    raiseChance = 70;
  } else if (category === 4) {
    raiseChance = 50;
  } else if (category === 3) {
    raiseChance = 35;
  } else if (category === 2) {
    raiseChance = 28;
  } else {
    raiseChance = 8;
  }

  if (bot.playingStyle === "aggressive") {
    raiseChance += 15;
  }

  if (bot.playingStyle === "defensive") {
    raiseChance -= 12;
  }

  return Math.min(85, Math.max(1, raiseChance));
}

function decideTeenPattiBotAction(bot, hand, activePlayerCount) {
  const currentTableBet = parseMoney(hand.current_bet);

  assertCondition(
    currentTableBet > 0,
    "Current Teen Patti bet is invalid.",
    409,
    "INVALID_CURRENT_BET",
  );

  assertCondition(
    Array.isArray(bot.cards) && bot.cards.length === 3,
    "Bot cards are invalid.",
    500,
    "INVALID_BOT_CARDS",
  );

  const willSeeCards = shouldBotSeeCards(bot);

  let evaluation = null;

  /*
   * Bot See করলে শুধু নিজের cards evaluate
   * হবে। অন্য player cards এখানে নেই।
   */
  if (willSeeCards) {
    evaluation = evaluateHand(bot.cards);
  }

  const normalAmount = willSeeCards
    ? parseMoney(currentTableBet * 2)
    : currentTableBet;

  const raisedTableBet = parseMoney(currentTableBet * 2);

  const raiseAmount = willSeeCards
    ? parseMoney(raisedTableBet * 2)
    : raisedTableBet;

  /*
   * Minimum action amount-ও balance-এ না
   * থাকলে bot Pack করবে।
   */
  if (bot.endingBalance < normalAmount) {
    return {
      actionType: ACTION_TYPE.PACK,

      shouldSeeCards: willSeeCards,

      evaluation,

      requestedAmount: 0,
      contributionAmount: 0,

      currentBetAfter: currentTableBet,

      reason: "insufficient_balance",
    };
  }

  const packChance = willSeeCards ? getBotPackChance(bot, evaluation) : 8;

  if (createSecurePercentage() < packChance) {
    return {
      actionType: ACTION_TYPE.PACK,

      shouldSeeCards: willSeeCards,

      evaluation,

      requestedAmount: 0,
      contributionAmount: 0,

      currentBetAfter: currentTableBet,

      reason: "fair_random_pack",
    };
  }

  const raiseChance = willSeeCards
    ? getBotRaiseChance(bot, evaluation)
    : bot.playingStyle === "aggressive"
      ? 22
      : 10;

  if (
    bot.endingBalance >= raiseAmount &&
    createSecurePercentage() < raiseChance
  ) {
    return {
      actionType: ACTION_TYPE.RAISE,

      shouldSeeCards: willSeeCards,

      evaluation,

      requestedAmount: raiseAmount,

      contributionAmount: raiseAmount,

      currentBetAfter: raisedTableBet,

      reason: "fair_raise",
    };
  }

  /*
   * দুই player থাকলেও bot এখন Chaal/Blind
   * খেলবে। Show decision আলাদা server
   * action হিসেবে পরে যুক্ত হবে।
   */
  return {
    actionType: willSeeCards ? ACTION_TYPE.CHAAL : ACTION_TYPE.BLIND,

    shouldSeeCards: willSeeCards,

    evaluation,

    requestedAmount: normalAmount,

    contributionAmount: normalAmount,

    currentBetAfter: currentTableBet,

    activePlayerCount: Number(activePlayerCount),

    reason: willSeeCards ? "fair_chaal" : "fair_blind",
  };
}

/* =========================================================
   SERVER BOT ACTION EXECUTION
========================================================= */

async function performTeenPattiBotAction(
  tableId,
  expectedHandId,
  expectedHandPlayerId,
) {
  const validTableId = parsePositiveInteger(tableId);

  const validHandId = parsePositiveInteger(expectedHandId);

  const validHandPlayerId = parsePositiveInteger(expectedHandPlayerId);

  assertCondition(
    validTableId !== null,
    "Valid Teen Patti table ID is required.",
    400,
    "INVALID_TABLE_ID",
  );

  assertCondition(
    validHandId !== null,
    "Valid Teen Patti hand ID is required.",
    400,
    "INVALID_HAND_ID",
  );

  assertCondition(
    validHandPlayerId !== null,
    "Valid Teen Patti hand player ID is required.",
    400,
    "INVALID_HAND_PLAYER_ID",
  );

  return withTransaction(async (connection) => {
    const table = await getLockedTable(connection, validTableId);

    if (!table) {
      return {
        ignored: true,
        reason: "table_not_found",
      };
    }

    const hand = await getActiveHand(connection, validTableId, {
      lock: true,
    });

    if (!hand) {
      return {
        ignored: true,
        reason: "no_active_hand",
      };
    }

    /*
     * পুরোনো hand বা পুরোনো turn-এর
     * scheduled bot action ignore হবে।
     */
    if (Number(hand.id) !== validHandId) {
      return {
        ignored: true,
        reason: "stale_hand_action",
      };
    }

    if (hand.hand_status !== HAND_STATUS.PLAYING) {
      return {
        ignored: true,
        reason: "hand_not_playing",
      };
    }

    if (Number(hand.current_turn_hand_player_id) !== validHandPlayerId) {
      return {
        ignored: true,
        reason: "stale_turn_action",
      };
    }

    const activePlayers = await getLockedActiveHandPlayers(
      connection,
      Number(hand.id),
    );

    if (activePlayers.length < 2) {
      return {
        ignored: true,
        reason: "not_enough_active_players",
      };
    }

    const activeBot = activePlayers.find(
      (player) =>
        Number(player.handPlayerId) === validHandPlayerId &&
        player.playerType === PLAYER_TYPE.BOT,
    );

    if (!activeBot) {
      return {
        ignored: true,
        reason: "current_turn_is_not_bot",
      };
    }

    const bot = await getLockedCurrentBotPlayer(
      connection,
      Number(hand.id),
      validHandPlayerId,
    );

    if (!bot || bot.playerStatus !== PLAYER_STATUS.ACTIVE) {
      return {
        ignored: true,
        reason: "bot_not_active",
      };
    }

    const decision = decideTeenPattiBotAction(bot, hand, activePlayers.length);

    /*
     * Bot Seen করার সিদ্ধান্ত নিলে
     * hand এবং table membership দুটোতেই
     * is_seen update হবে।
     */
    if (decision.shouldSeeCards === true && bot.isSeen !== true) {
      await connection.query(
        `
          UPDATE teen_patti_hand_players

          SET
            is_seen = 1

          WHERE id = ?
            AND hand_id = ?
            AND player_status = 'active'
          `,
        [bot.handPlayerId, hand.id],
      );

      await connection.query(
        `
          UPDATE table_bots

          SET
            is_seen = 1

          WHERE id = ?
            AND table_id = ?
            AND is_active = 1
          `,
        [bot.tableBotId, validTableId],
      );

      bot.isSeen = true;
    }

    /*
     * =====================================
     * BOT PACK
     * =====================================
     */
    if (decision.actionType === ACTION_TYPE.PACK) {
      await connection.query(
        `
          UPDATE teen_patti_hand_players

          SET
            player_status = 'packed',
            last_action = 'pack'

          WHERE id = ?
            AND hand_id = ?
            AND player_status = 'active'
          `,
        [bot.handPlayerId, hand.id],
      );

      await connection.query(
        `
          UPDATE table_bots

          SET
            is_packed = 1,
            current_bet = 0.00

          WHERE id = ?
            AND table_id = ?
          `,
        [bot.tableBotId, validTableId],
      );

      const nextSequence = await getNextActionSequence(
        connection,
        Number(hand.id),
      );

      await connection.query(
        `
          INSERT INTO teen_patti_hand_actions (
            hand_id,
            hand_player_id,
            action_sequence,
            action_type,
            requested_amount,
            contribution_amount,
            balance_before,
            balance_after,
            current_bet_after,
            pot_after,
            is_automatic
          )
          VALUES (
            ?,
            ?,
            ?,
            'pack',
            0.00,
            0.00,
            ?,
            ?,
            ?,
            ?,
            1
          )
          `,
        [
          hand.id,
          bot.handPlayerId,
          nextSequence,

          bot.endingBalance,
          bot.endingBalance,

          parseMoney(hand.current_bet),

          parseMoney(hand.pot_amount),
        ],
      );

      const remainingPlayers = activePlayers.filter(
        (player) => Number(player.handPlayerId) !== Number(bot.handPlayerId),
      );

      if (remainingPlayers.length === 1) {
        const settlement = await settleTeenPattiHandWithinTransaction(
          connection,
          validTableId,
          {
            reason: "last_player",
          },
        );

        return {
          ignored: false,

          tableId: validTableId,

          handId: Number(hand.id),

          handPlayerId: bot.handPlayerId,

          playerType: PLAYER_TYPE.BOT,

          actionType: ACTION_TYPE.PACK,

          decisionReason: decision.reason,

          handCompleted: true,

          nextTurnHandPlayerId: null,

          settlement,
        };
      }

      const nextPlayer = findNextActiveMember(remainingPlayers, bot.seatNo);

      assertCondition(
        nextPlayer,
        "Next active Teen Patti player was not found.",
        500,
        "NEXT_PLAYER_NOT_FOUND",
      );

      const actionStartedAt = new Date();

      const actionExpiresAt = createDateAfterSeconds(TURN_SECONDS);

      await connection.query(
        `
          UPDATE teen_patti_hands

          SET
            current_turn_hand_player_id = ?,

            action_started_at = ?,
            action_expires_at = ?,

            state_version =
              state_version + 1

          WHERE id = ?
            AND hand_status = 'playing'
          `,
        [nextPlayer.handPlayerId, actionStartedAt, actionExpiresAt, hand.id],
      );

      return {
        ignored: false,

        tableId: validTableId,

        handId: Number(hand.id),

        handPlayerId: bot.handPlayerId,

        playerType: PLAYER_TYPE.BOT,

        actionType: ACTION_TYPE.PACK,

        decisionReason: decision.reason,

        handCompleted: false,

        nextTurnHandPlayerId: nextPlayer.handPlayerId,

        nextTurnSeatNo: nextPlayer.seatNo,

        actionStartedAt,
        actionExpiresAt,

        settlement: null,
      };
    }

    /*
     * =====================================
     * BOT BLIND / CHAAL / RAISE
     * =====================================
     */

    assertCondition(
      [ACTION_TYPE.BLIND, ACTION_TYPE.CHAAL, ACTION_TYPE.RAISE].includes(
        decision.actionType,
      ),
      "Bot selected an invalid action.",
      500,
      "INVALID_BOT_ACTION",
    );

    const balanceBefore = parseMoney(bot.endingBalance);

    const balanceAfter = await debitTeenPattiActionAmount(connection, {
      playerType: PLAYER_TYPE.BOT,

      userId: null,

      botId: bot.botId,

      amount: decision.contributionAmount,

      balanceBefore,

      tableId: validTableId,

      handId: Number(hand.id),

      roundNumber: Number(hand.round_number),

      actionType: decision.actionType,
    });

    const potAfter = parseMoney(
      parseMoney(hand.pot_amount) + decision.contributionAmount,
    );

    const totalContributionAfter = parseMoney(
      bot.totalContribution + decision.contributionAmount,
    );

    await connection.query(
      `
        UPDATE teen_patti_hand_players

        SET
          is_seen = ?,

          ending_balance = ?,
          current_bet = ?,
          total_contribution = ?,

          last_action = ?

        WHERE id = ?
          AND hand_id = ?
          AND player_status = 'active'
        `,
      [
        bot.isSeen ? 1 : 0,

        balanceAfter,

        decision.contributionAmount,

        totalContributionAfter,

        decision.actionType,

        bot.handPlayerId,
        hand.id,
      ],
    );

    await connection.query(
      `
        UPDATE table_bots

        SET
          is_seen = ?,
          current_bet = ?

        WHERE id = ?
          AND table_id = ?
          AND is_active = 1
        `,
      [
        bot.isSeen ? 1 : 0,

        decision.contributionAmount,

        bot.tableBotId,
        validTableId,
      ],
    );

    const nextSequence = await getNextActionSequence(
      connection,
      Number(hand.id),
    );

    await connection.query(
      `
        INSERT INTO teen_patti_hand_actions (
          hand_id,
          hand_player_id,
          action_sequence,
          action_type,
          requested_amount,
          contribution_amount,
          balance_before,
          balance_after,
          current_bet_after,
          pot_after,
          is_automatic
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
          1
        )
        `,
      [
        hand.id,
        bot.handPlayerId,
        nextSequence,

        decision.actionType,

        decision.requestedAmount,
        decision.contributionAmount,

        balanceBefore,
        balanceAfter,

        decision.currentBetAfter,

        potAfter,
      ],
    );

    const nextPlayer = findNextActiveMember(activePlayers, bot.seatNo);

    assertCondition(
      nextPlayer,
      "Next active Teen Patti player was not found.",
      500,
      "NEXT_PLAYER_NOT_FOUND",
    );

    const actionStartedAt = new Date();

    const actionExpiresAt = createDateAfterSeconds(TURN_SECONDS);

    await connection.query(
      `
        UPDATE teen_patti_hands

        SET
          current_turn_hand_player_id = ?,

          current_bet = ?,
          pot_amount = ?,

          action_started_at = ?,
          action_expires_at = ?,

          state_version =
            state_version + 1

        WHERE id = ?
          AND hand_status = 'playing'
        `,
      [
        nextPlayer.handPlayerId,

        decision.currentBetAfter,

        potAfter,

        actionStartedAt,
        actionExpiresAt,

        hand.id,
      ],
    );

    await connection.query(
      `
        UPDATE game_tables

        SET
          pot_amount = ?

        WHERE id = ?
          AND game_status = 'playing'
        `,
      [potAfter, validTableId],
    );

    return {
      ignored: false,

      tableId: validTableId,

      handId: Number(hand.id),

      handPlayerId: bot.handPlayerId,

      playerType: PLAYER_TYPE.BOT,

      actionType: decision.actionType,

      contributionAmount: decision.contributionAmount,

      balanceBefore,
      balanceAfter,

      currentBetAfter: decision.currentBetAfter,

      potAfter,

      botSawCards: bot.isSeen,

      handRankName: decision.evaluation?.rankName || null,

      decisionReason: decision.reason,

      handCompleted: false,

      nextTurnHandPlayerId: nextPlayer.handPlayerId,

      nextTurnSeatNo: nextPlayer.seatNo,

      actionStartedAt,
      actionExpiresAt,

      settlement: null,
    };
  });
}

/* =========================================================
   SIDE SHOW REQUEST
========================================================= */

async function getPendingSideShow(connection, handId, options = {}) {
  const lockSuffix = options.lock === true ? "FOR UPDATE" : "";

  const [rows] = await connection.query(
    `
    SELECT
      id,
      hand_id,
      requester_hand_player_id,
      target_hand_player_id,
      request_status,
      requested_at,
      expires_at,
      responded_at

    FROM teen_patti_side_show_requests

    WHERE hand_id = ?
      AND request_status = 'pending'

    ORDER BY id DESC

    LIMIT 1

    ${lockSuffix}
    `,
    [handId],
  );

  return rows[0] || null;
}

function findPreviousSeenPlayer(activePlayers, requesterSeatNo) {
  for (let offset = 1; offset <= MAX_PLAYERS; offset += 1) {
    const expectedSeat =
      ((Number(requesterSeatNo) - 1 - offset + MAX_PLAYERS * 2) % MAX_PLAYERS) +
      1;

    const target = activePlayers.find(
      (player) =>
        Number(player.seatNo) === expectedSeat && player.isSeen === true,
    );

    if (target) {
      return target;
    }
  }

  return null;
}

async function requestTeenPattiSideShow(tableId, requestingUserId) {
  const validTableId = parsePositiveInteger(tableId);

  const validUserId = parsePositiveInteger(requestingUserId);

  assertCondition(
    validTableId !== null,
    "Valid Teen Patti table ID is required.",
    400,
    "INVALID_TABLE_ID",
  );

  assertCondition(
    validUserId !== null,
    "Valid requesting user ID is required.",
    400,
    "INVALID_USER_ID",
  );

  const requestResult = await withTransaction(async (connection) => {
    const table = await getLockedTable(connection, validTableId);

    assertCondition(
      table,
      "Teen Patti table not found.",
      404,
      "TABLE_NOT_FOUND",
    );

    const hand = await getActiveHand(connection, validTableId, {
      lock: true,
    });

    assertCondition(
      hand && hand.hand_status === HAND_STATUS.PLAYING,
      "No playable Teen Patti hand was found.",
      409,
      "HAND_NOT_PLAYING",
    );

    const existingRequest = await getPendingSideShow(
      connection,
      Number(hand.id),
      {
        lock: true,
      },
    );

    assertCondition(
      !existingRequest,
      "A Side Show request is already pending.",
      409,
      "SIDE_SHOW_ALREADY_PENDING",
    );

    const activePlayers = await getLockedActiveHandPlayers(
      connection,
      Number(hand.id),
    );

    assertCondition(
      activePlayers.length >= 3,
      "Side Show requires at least three active players.",
      409,
      "SIDE_SHOW_REQUIRES_THREE_PLAYERS",
    );

    const requester = activePlayers.find(
      (player) =>
        player.playerType === PLAYER_TYPE.REAL &&
        Number(player.userId) === validUserId,
    );

    assertCondition(
      requester,
      "You are not an active player of this hand.",
      403,
      "NOT_ACTIVE_HAND_PLAYER",
    );

    assertCondition(
      Number(hand.current_turn_hand_player_id) ===
        Number(requester.handPlayerId),
      "It is not your turn.",
      409,
      "NOT_YOUR_TURN",
    );

    assertCondition(
      requester.isSeen === true,
      "See your cards before requesting Side Show.",
      409,
      "SIDE_SHOW_REQUIRES_SEEN",
    );

    const target = findPreviousSeenPlayer(activePlayers, requester.seatNo);

    assertCondition(
      target,
      "No previous active Seen player is available.",
      409,
      "SIDE_SHOW_TARGET_NOT_FOUND",
    );

    assertCondition(
      Number(target.handPlayerId) !== Number(requester.handPlayerId),
      "Invalid Side Show target.",
      409,
      "INVALID_SIDE_SHOW_TARGET",
    );

    const currentTableBet = parseMoney(hand.current_bet);

    const sideShowAmount = parseMoney(currentTableBet * 2);

    const balanceBefore = parseMoney(requester.endingBalance);

    const balanceAfter = await debitTeenPattiActionAmount(connection, {
      playerType: requester.playerType,

      userId: requester.userId,

      botId: requester.botId,

      amount: sideShowAmount,

      balanceBefore,

      tableId: validTableId,

      handId: Number(hand.id),

      roundNumber: Number(hand.round_number),

      actionType: ACTION_TYPE.SIDE_SHOW,
    });

    const potAfter = parseMoney(parseMoney(hand.pot_amount) + sideShowAmount);

    const totalContributionAfter = parseMoney(
      requester.totalContribution + sideShowAmount,
    );

    await connection.query(
      `
          UPDATE teen_patti_hand_players

          SET
            ending_balance = ?,
            current_bet = ?,
            total_contribution = ?,
            last_action = 'side_show'

          WHERE id = ?
            AND hand_id = ?
            AND player_status = 'active'
          `,
      [
        balanceAfter,
        sideShowAmount,
        totalContributionAfter,

        requester.handPlayerId,
        hand.id,
      ],
    );

    await connection.query(
      `
          UPDATE table_players

          SET
            current_bet = ?

          WHERE id = ?
            AND table_id = ?
            AND user_id = ?
            AND is_active = 1
          `,
      [sideShowAmount, requester.tablePlayerId, validTableId, validUserId],
    );

    const nextSequence = await getNextActionSequence(
      connection,
      Number(hand.id),
    );

    await connection.query(
      `
          INSERT INTO teen_patti_hand_actions (
            hand_id,
            hand_player_id,
            action_sequence,
            action_type,
            requested_amount,
            contribution_amount,
            balance_before,
            balance_after,
            current_bet_after,
            pot_after,
            is_automatic
          )
          VALUES (
            ?,
            ?,
            ?,
            'side_show',
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            0
          )
          `,
      [
        hand.id,
        requester.handPlayerId,
        nextSequence,

        sideShowAmount,
        sideShowAmount,

        balanceBefore,
        balanceAfter,

        currentTableBet,
        potAfter,
      ],
    );

    const expiresAt = createDateAfterSeconds(SIDE_SHOW_SECONDS);

    const [insertResult] = await connection.query(
      `
            INSERT INTO teen_patti_side_show_requests (
              hand_id,
              requester_hand_player_id,
              target_hand_player_id,
              request_status,
              requested_at,
              expires_at,
              responded_at
            )
            VALUES (
              ?,
              ?,
              ?,
              'pending',
              NOW(),
              ?,
              NULL
            )
            `,
      [hand.id, requester.handPlayerId, target.handPlayerId, expiresAt],
    );

    await connection.query(
      `
          UPDATE teen_patti_hands

          SET
            pot_amount = ?,
            action_expires_at = ?,

            state_version =
              state_version + 1

          WHERE id = ?
            AND hand_status = 'playing'
          `,
      [potAfter, expiresAt, hand.id],
    );

    await connection.query(
      `
          UPDATE game_tables

          SET
            pot_amount = ?

          WHERE id = ?
            AND game_status = 'playing'
          `,
      [potAfter, validTableId],
    );

    return {
      sideShowRequestId: Number(insertResult.insertId),

      tableId: validTableId,

      handId: Number(hand.id),

      requesterHandPlayerId: requester.handPlayerId,

      requesterSeatNo: requester.seatNo,

      targetHandPlayerId: target.handPlayerId,

      targetSeatNo: target.seatNo,

      targetPlayerType: target.playerType,

      contributionAmount: sideShowAmount,

      balanceBefore,
      balanceAfter,

      potAfter,
      expiresAt,

      responseSeconds: SIDE_SHOW_SECONDS,

      requestStatus: "pending",
    };
  });

  const handState = await getTeenPattiHandState(validTableId, validUserId);

  return {
    success: true,

    message: "Side Show request sent successfully.",

    sideShow: requestResult,

    handState,
  };
}

/* =========================================================
   SIDE SHOW RESPONSE
========================================================= */

async function getLockedSideShowRequest(connection, tableId, requestId) {
  const [rows] = await connection.query(
    `
    SELECT
      ssr.id,
      ssr.hand_id,
      ssr.requester_hand_player_id,
      ssr.target_hand_player_id,
      ssr.request_status,
      ssr.requested_at,
      ssr.expires_at,
      ssr.responded_at

    FROM teen_patti_side_show_requests ssr

    INNER JOIN teen_patti_hands tph
      ON tph.id = ssr.hand_id

    WHERE ssr.id = ?
      AND tph.table_id = ?

    LIMIT 1

    FOR UPDATE
    `,
    [requestId, tableId],
  );

  return rows[0] || null;
}

async function markSideShowLoserPacked(connection, tableId, handId, loser) {
  await connection.query(
    `
    UPDATE teen_patti_hand_players

    SET
      player_status = 'packed',
      last_action = 'side_show'

    WHERE id = ?
      AND hand_id = ?
      AND player_status = 'active'
    `,
    [loser.handPlayerId, handId],
  );

  if (loser.playerType === PLAYER_TYPE.REAL) {
    await connection.query(
      `
      UPDATE table_players

      SET
        is_packed = 1,
        current_bet = 0.00

      WHERE id = ?
        AND table_id = ?
      `,
      [loser.tablePlayerId, tableId],
    );
  } else {
    await connection.query(
      `
      UPDATE table_bots

      SET
        is_packed = 1,
        current_bet = 0.00

      WHERE id = ?
        AND table_id = ?
      `,
      [loser.tableBotId, tableId],
    );
  }
}

async function respondTeenPattiSideShow(
  tableId,
  requestId,
  respondingUserId,
  response,
) {
  const validTableId = parsePositiveInteger(tableId);

  const validRequestId = parsePositiveInteger(requestId);

  const validUserId = parsePositiveInteger(respondingUserId);

  const normalizedResponse = String(response || "")
    .trim()
    .toLowerCase();

  assertCondition(
    validTableId !== null,
    "Valid Teen Patti table ID is required.",
    400,
    "INVALID_TABLE_ID",
  );

  assertCondition(
    validRequestId !== null,
    "Valid Side Show request ID is required.",
    400,
    "INVALID_SIDE_SHOW_REQUEST_ID",
  );

  assertCondition(
    validUserId !== null,
    "Valid responding user ID is required.",
    400,
    "INVALID_USER_ID",
  );

  assertCondition(
    ["accepted", "rejected"].includes(normalizedResponse),
    "Side Show response must be accepted or rejected.",
    400,
    "INVALID_SIDE_SHOW_RESPONSE",
  );

  const responseResult = await withTransaction(async (connection) => {
    const table = await getLockedTable(connection, validTableId);

    assertCondition(
      table,
      "Teen Patti table not found.",
      404,
      "TABLE_NOT_FOUND",
    );

    const sideShowRequest = await getLockedSideShowRequest(
      connection,
      validTableId,
      validRequestId,
    );

    assertCondition(
      sideShowRequest,
      "Side Show request was not found.",
      404,
      "SIDE_SHOW_REQUEST_NOT_FOUND",
    );

    assertCondition(
      sideShowRequest.request_status === "pending",
      "Side Show request has already been resolved.",
      409,
      "SIDE_SHOW_ALREADY_RESOLVED",
    );

    const hand = await getActiveHand(connection, validTableId, {
      lock: true,
    });

    assertCondition(
      hand && Number(hand.id) === Number(sideShowRequest.hand_id),
      "Side Show hand is no longer active.",
      409,
      "SIDE_SHOW_HAND_NOT_ACTIVE",
    );

    assertCondition(
      hand.hand_status === HAND_STATUS.PLAYING,
      "Teen Patti hand is not accepting a Side Show response.",
      409,
      "HAND_NOT_PLAYING",
    );

    const expiresAt = new Date(sideShowRequest.expires_at).getTime();

    assertCondition(
      Number.isFinite(expiresAt) && Date.now() <= expiresAt,
      "Side Show request has expired.",
      409,
      "SIDE_SHOW_REQUEST_EXPIRED",
    );

    const activePlayers = await getLockedActiveHandPlayers(
      connection,
      Number(hand.id),
    );

    const requester = activePlayers.find(
      (player) =>
        Number(player.handPlayerId) ===
        Number(sideShowRequest.requester_hand_player_id),
    );

    const target = activePlayers.find(
      (player) =>
        Number(player.handPlayerId) ===
        Number(sideShowRequest.target_hand_player_id),
    );

    assertCondition(
      requester,
      "Side Show requester is no longer active.",
      409,
      "SIDE_SHOW_REQUESTER_NOT_ACTIVE",
    );

    assertCondition(
      target,
      "Side Show target is no longer active.",
      409,
      "SIDE_SHOW_TARGET_NOT_ACTIVE",
    );

    assertCondition(
      target.playerType === PLAYER_TYPE.REAL &&
        Number(target.userId) === validUserId,
      "Only the target player can respond to this Side Show.",
      403,
      "NOT_SIDE_SHOW_TARGET",
    );

    assertCondition(
      requester.isSeen === true && target.isSeen === true,
      "Both Side Show players must be Seen.",
      409,
      "SIDE_SHOW_PLAYERS_NOT_SEEN",
    );

    let winner = null;
    let loser = null;
    let comparisonResult = null;

    if (normalizedResponse === "accepted") {
      const requesterRows = await getHandPlayers(connection, Number(hand.id));

      const requesterCardsRow = requesterRows.find(
        (player) =>
          Number(player.hand_player_id) === Number(requester.handPlayerId),
      );

      const targetCardsRow = requesterRows.find(
        (player) =>
          Number(player.hand_player_id) === Number(target.handPlayerId),
      );

      assertCondition(
        requesterCardsRow?.cards && targetCardsRow?.cards,
        "Side Show cards could not be loaded.",
        500,
        "SIDE_SHOW_CARDS_NOT_FOUND",
      );

      const requesterCards = deserializeCards(requesterCardsRow.cards);

      const targetCards = deserializeCards(targetCardsRow.cards);

      comparisonResult = compareHands(requesterCards, targetCards);

      /*
       * comparison > 0 → requester wins
       * comparison < 0 → target wins
       * comparison = 0 → requester loses
       */
      if (comparisonResult > 0) {
        winner = requester;
        loser = target;
      } else {
        winner = target;
        loser = requester;
      }

      await markSideShowLoserPacked(
        connection,
        validTableId,
        Number(hand.id),
        loser,
      );
    }

    await connection.query(
      `
          UPDATE teen_patti_side_show_requests

          SET
            request_status = ?,
            responded_at = NOW()

          WHERE id = ?
            AND request_status = 'pending'
          `,
      [normalizedResponse, validRequestId],
    );

    const remainingPlayers =
      normalizedResponse === "accepted"
        ? activePlayers.filter(
            (player) =>
              Number(player.handPlayerId) !== Number(loser.handPlayerId),
          )
        : activePlayers;

    /*
     * সাধারণত Side Show শুরু হতে
     * কমপক্ষে ৩ জন লাগে, তাই comparison
     * শেষে অন্তত ২ জন থাকবে।
     *
     * তবুও concurrency safety রাখা হয়েছে।
     */
    if (remainingPlayers.length === 1) {
      const settlement = await settleTeenPattiHandWithinTransaction(
        connection,
        validTableId,
        {
          reason: "last_player",
        },
      );

      return {
        requestId: validRequestId,

        handId: Number(hand.id),

        response: normalizedResponse,

        comparisonResult,

        winnerHandPlayerId:
          winner?.handPlayerId || remainingPlayers[0].handPlayerId,

        loserHandPlayerId: loser?.handPlayerId || null,

        handCompleted: true,

        nextTurnHandPlayerId: null,

        settlement,
      };
    }

    const nextPlayer = findNextActiveMember(remainingPlayers, requester.seatNo);

    assertCondition(
      nextPlayer,
      "Next active Teen Patti player was not found.",
      500,
      "NEXT_PLAYER_NOT_FOUND",
    );

    const actionStartedAt = new Date();

    const actionExpiresAt = createDateAfterSeconds(TURN_SECONDS);

    await connection.query(
      `
          UPDATE teen_patti_hands

          SET
            current_turn_hand_player_id = ?,

            action_started_at = ?,
            action_expires_at = ?,

            state_version =
              state_version + 1

          WHERE id = ?
            AND hand_status = 'playing'
          `,
      [nextPlayer.handPlayerId, actionStartedAt, actionExpiresAt, hand.id],
    );

    return {
      requestId: validRequestId,

      handId: Number(hand.id),

      response: normalizedResponse,

      comparisonResult,

      winnerHandPlayerId: winner?.handPlayerId || null,

      loserHandPlayerId: loser?.handPlayerId || null,

      handCompleted: false,

      nextTurnHandPlayerId: nextPlayer.handPlayerId,

      nextTurnSeatNo: nextPlayer.seatNo,

      actionStartedAt,
      actionExpiresAt,

      settlement: null,
    };
  });

  const handState = await getTeenPattiHandState(validTableId, validUserId);

  return {
    success: true,

    message:
      normalizedResponse === "accepted"
        ? "Side Show accepted and cards compared."
        : "Side Show rejected.",

    sideShow: responseResult,

    handState,
  };
}

/* =========================================================
   SIDE SHOW EXPIRY
========================================================= */

async function expireTeenPattiSideShow(tableId, expectedRequestId) {
  const validTableId = parsePositiveInteger(tableId);

  const validRequestId = parsePositiveInteger(expectedRequestId);

  assertCondition(
    validTableId !== null,
    "Valid Teen Patti table ID is required.",
    400,
    "INVALID_TABLE_ID",
  );

  assertCondition(
    validRequestId !== null,
    "Valid Side Show request ID is required.",
    400,
    "INVALID_SIDE_SHOW_REQUEST_ID",
  );

  return withTransaction(async (connection) => {
    const table = await getLockedTable(connection, validTableId);

    if (!table) {
      return {
        ignored: true,
        reason: "table_not_found",
      };
    }

    const sideShowRequest = await getLockedSideShowRequest(
      connection,
      validTableId,
      validRequestId,
    );

    if (!sideShowRequest) {
      return {
        ignored: true,
        reason: "side_show_request_not_found",
      };
    }

    if (sideShowRequest.request_status !== "pending") {
      return {
        ignored: true,
        reason: "side_show_already_resolved",

        requestStatus: sideShowRequest.request_status,
      };
    }

    const expiresAt = new Date(sideShowRequest.expires_at).getTime();

    if (!Number.isFinite(expiresAt) || Date.now() < expiresAt) {
      return {
        ignored: true,
        reason: "side_show_not_expired",

        expiresAt: sideShowRequest.expires_at,
      };
    }

    const hand = await getActiveHand(connection, validTableId, {
      lock: true,
    });

    if (
      !hand ||
      Number(hand.id) !== Number(sideShowRequest.hand_id) ||
      hand.hand_status !== HAND_STATUS.PLAYING
    ) {
      await connection.query(
        `
          UPDATE teen_patti_side_show_requests

          SET
            request_status = 'cancelled',
            responded_at = NOW()

          WHERE id = ?
            AND request_status = 'pending'
          `,
        [validRequestId],
      );

      return {
        ignored: false,

        requestId: validRequestId,

        requestStatus: "cancelled",

        reason: "hand_no_longer_playing",
      };
    }

    const allPlayers = await getLockedSettlementPlayers(
      connection,
      Number(hand.id),
    );

    const activePlayers = allPlayers
      .filter((player) => player.playerStatus === PLAYER_STATUS.ACTIVE)
      .map((player) => ({
        ...player,

        playerStatus: PLAYER_STATUS.ACTIVE,
      }));

    const requester = allPlayers.find(
      (player) =>
        Number(player.handPlayerId) ===
        Number(sideShowRequest.requester_hand_player_id),
    );

    await connection.query(
      `
        UPDATE teen_patti_side_show_requests

        SET
          request_status = 'expired',
          responded_at = NOW()

        WHERE id = ?
          AND request_status = 'pending'
        `,
      [validRequestId],
    );

    if (activePlayers.length <= 1) {
      const settlement =
        activePlayers.length === 1
          ? await settleTeenPattiHandWithinTransaction(
              connection,
              validTableId,
              {
                reason: "last_player",
              },
            )
          : null;

      return {
        ignored: false,

        requestId: validRequestId,

        handId: Number(hand.id),

        requestStatus: "expired",

        handCompleted: settlement !== null,

        nextTurnHandPlayerId: null,

        settlement,
      };
    }

    const requesterSeatNo = requester
      ? requester.seatNo
      : activePlayers[0].seatNo;

    const nextPlayer = findNextActiveMember(activePlayers, requesterSeatNo);

    assertCondition(
      nextPlayer,
      "Next active Teen Patti player was not found.",
      500,
      "NEXT_PLAYER_NOT_FOUND",
    );

    const actionStartedAt = new Date();

    const actionExpiresAt = createDateAfterSeconds(TURN_SECONDS);

    await connection.query(
      `
        UPDATE teen_patti_hands

        SET
          current_turn_hand_player_id = ?,

          action_started_at = ?,
          action_expires_at = ?,

          state_version =
            state_version + 1

        WHERE id = ?
          AND hand_status = 'playing'
        `,
      [nextPlayer.handPlayerId, actionStartedAt, actionExpiresAt, hand.id],
    );

    return {
      ignored: false,

      requestId: validRequestId,

      handId: Number(hand.id),

      requestStatus: "expired",

      handCompleted: false,

      nextTurnHandPlayerId: nextPlayer.handPlayerId,

      nextTurnSeatNo: nextPlayer.seatNo,

      actionStartedAt,
      actionExpiresAt,

      settlement: null,
    };
  });
}

/* =========================================================
   BOT SIDE SHOW RESPONSE
========================================================= */

function decideBotSideShowResponse(botPlayer) {
  const evaluation = evaluateHand(botPlayer.cards);

  const acceptChanceByCategory = {
    1: 30,
    2: 48,
    3: 62,
    4: 78,
    5: 90,
    6: 96,
  };

  let acceptChance = acceptChanceByCategory[evaluation.category] || 30;

  if (botPlayer.playingStyle === "aggressive") {
    acceptChance += 8;
  }

  if (botPlayer.playingStyle === "defensive") {
    acceptChance -= 8;
  }

  acceptChance = Math.min(98, Math.max(10, acceptChance));

  const accepted = createSecurePercentage() < acceptChance;

  return {
    response: accepted ? "accepted" : "rejected",

    acceptChance,

    handRankName: evaluation.rankName,

    handRankValue: evaluation.rankValue,
  };
}

async function respondTeenPattiBotSideShow(tableId, expectedRequestId) {
  const validTableId = parsePositiveInteger(tableId);

  const validRequestId = parsePositiveInteger(expectedRequestId);

  assertCondition(
    validTableId !== null,
    "Valid Teen Patti table ID is required.",
    400,
    "INVALID_TABLE_ID",
  );

  assertCondition(
    validRequestId !== null,
    "Valid Side Show request ID is required.",
    400,
    "INVALID_SIDE_SHOW_REQUEST_ID",
  );

  return withTransaction(async (connection) => {
    const table = await getLockedTable(connection, validTableId);

    if (!table) {
      return {
        ignored: true,
        reason: "table_not_found",
      };
    }

    const sideShowRequest = await getLockedSideShowRequest(
      connection,
      validTableId,
      validRequestId,
    );

    if (!sideShowRequest || sideShowRequest.request_status !== "pending") {
      return {
        ignored: true,
        reason: "side_show_not_pending",
      };
    }

    const hand = await getActiveHand(connection, validTableId, {
      lock: true,
    });

    if (
      !hand ||
      Number(hand.id) !== Number(sideShowRequest.hand_id) ||
      hand.hand_status !== HAND_STATUS.PLAYING
    ) {
      return {
        ignored: true,
        reason: "hand_not_playing",
      };
    }

    const expiresAt = new Date(sideShowRequest.expires_at).getTime();

    if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
      return {
        ignored: true,
        reason: "side_show_expired",
      };
    }

    const activePlayers = await getLockedActiveHandPlayers(
      connection,
      Number(hand.id),
    );

    const requester = activePlayers.find(
      (player) =>
        Number(player.handPlayerId) ===
        Number(sideShowRequest.requester_hand_player_id),
    );

    const target = activePlayers.find(
      (player) =>
        Number(player.handPlayerId) ===
        Number(sideShowRequest.target_hand_player_id),
    );

    assertCondition(
      requester,
      "Side Show requester is no longer active.",
      409,
      "SIDE_SHOW_REQUESTER_NOT_ACTIVE",
    );

    assertCondition(
      target && target.playerType === PLAYER_TYPE.BOT,
      "Side Show target is not an active bot.",
      409,
      "SIDE_SHOW_TARGET_NOT_BOT",
    );

    const bot = await getLockedCurrentBotPlayer(
      connection,
      Number(hand.id),
      target.handPlayerId,
    );

    assertCondition(
      bot && bot.playerStatus === PLAYER_STATUS.ACTIVE,
      "Side Show bot is not active.",
      409,
      "SIDE_SHOW_BOT_NOT_ACTIVE",
    );

    /*
     * Side Show target অবশ্যই Seen।
     */
    assertCondition(
      bot.isSeen === true,
      "Side Show bot cards are not Seen.",
      409,
      "SIDE_SHOW_BOT_NOT_SEEN",
    );

    const decision = decideBotSideShowResponse(bot);

    let winner = null;
    let loser = null;
    let comparisonResult = null;

    if (decision.response === "accepted") {
      const handPlayerRows = await getHandPlayers(connection, Number(hand.id));

      const requesterRow = handPlayerRows.find(
        (player) =>
          Number(player.hand_player_id) === Number(requester.handPlayerId),
      );

      const targetRow = handPlayerRows.find(
        (player) =>
          Number(player.hand_player_id) === Number(target.handPlayerId),
      );

      assertCondition(
        requesterRow?.cards && targetRow?.cards,
        "Side Show cards could not be loaded.",
        500,
        "SIDE_SHOW_CARDS_NOT_FOUND",
      );

      const requesterCards = deserializeCards(requesterRow.cards);

      const targetCards = deserializeCards(targetRow.cards);

      comparisonResult = compareHands(requesterCards, targetCards);

      /*
       * Tie হলে requester হারবে।
       */
      if (comparisonResult > 0) {
        winner = requester;
        loser = target;
      } else {
        winner = target;
        loser = requester;
      }

      await markSideShowLoserPacked(
        connection,
        validTableId,
        Number(hand.id),
        loser,
      );
    }

    await connection.query(
      `
        UPDATE teen_patti_side_show_requests

        SET
          request_status = ?,
          responded_at = NOW()

        WHERE id = ?
          AND request_status = 'pending'
        `,
      [decision.response, validRequestId],
    );

    const remainingPlayers =
      decision.response === "accepted"
        ? activePlayers.filter(
            (player) =>
              Number(player.handPlayerId) !== Number(loser.handPlayerId),
          )
        : activePlayers;

    if (remainingPlayers.length === 1) {
      const settlement = await settleTeenPattiHandWithinTransaction(
        connection,
        validTableId,
        {
          reason: "last_player",
        },
      );

      return {
        ignored: false,

        requestId: validRequestId,

        handId: Number(hand.id),

        response: decision.response,

        acceptChance: decision.acceptChance,

        comparisonResult,

        winnerHandPlayerId:
          winner?.handPlayerId || remainingPlayers[0].handPlayerId,

        loserHandPlayerId: loser?.handPlayerId || null,

        handCompleted: true,

        nextTurnHandPlayerId: null,

        settlement,
      };
    }

    const nextPlayer = findNextActiveMember(remainingPlayers, requester.seatNo);

    assertCondition(
      nextPlayer,
      "Next active Teen Patti player was not found.",
      500,
      "NEXT_PLAYER_NOT_FOUND",
    );

    const actionStartedAt = new Date();

    const actionExpiresAt = createDateAfterSeconds(TURN_SECONDS);

    await connection.query(
      `
        UPDATE teen_patti_hands

        SET
          current_turn_hand_player_id = ?,

          action_started_at = ?,
          action_expires_at = ?,

          state_version =
            state_version + 1

        WHERE id = ?
          AND hand_status = 'playing'
        `,
      [nextPlayer.handPlayerId, actionStartedAt, actionExpiresAt, hand.id],
    );

    return {
      ignored: false,

      requestId: validRequestId,

      handId: Number(hand.id),

      response: decision.response,

      acceptChance: decision.acceptChance,

      /*
       * Bot rank server log-এর জন্য।
       * অন্য player-এর card এখানে নেই।
       */
      botHandRankName: decision.handRankName,

      comparisonResult,

      winnerHandPlayerId: winner?.handPlayerId || null,

      loserHandPlayerId: loser?.handPlayerId || null,

      handCompleted: false,

      nextTurnHandPlayerId: nextPlayer.handPlayerId,

      nextTurnSeatNo: nextPlayer.seatNo,

      actionStartedAt,
      actionExpiresAt,

      settlement: null,
    };
  });
}

/* =========================================================
   AUTOMATIC NEXT ROUND
========================================================= */

async function getLockedLatestHand(connection, tableId) {
  const [rows] = await connection.query(
    `
    SELECT
      id,
      table_id,
      round_number,
      hand_status,
      settlement_completed,
      winner_hand_player_id,
      completed_at

    FROM teen_patti_hands

    WHERE table_id = ?

    ORDER BY
      round_number DESC,
      id DESC

    LIMIT 1

    FOR UPDATE
    `,
    [tableId],
  );

  return rows[0] || null;
}

async function prepareNextTeenPattiHand(tableId, expectedCompletedHandId) {
  const validTableId = parsePositiveInteger(tableId);

  const validCompletedHandId = parsePositiveInteger(expectedCompletedHandId);

  assertCondition(
    validTableId !== null,
    "Valid Teen Patti table ID is required.",
    400,
    "INVALID_TABLE_ID",
  );

  assertCondition(
    validCompletedHandId !== null,
    "Valid completed hand ID is required.",
    400,
    "INVALID_HAND_ID",
  );

  const preparation = await withTransaction(async (connection) => {
    const table = await getLockedTable(connection, validTableId);

    if (!table) {
      return {
        ready: false,
        ignored: true,
        reason: "table_not_found",
      };
    }

    if (table.room_status === "disabled") {
      return {
        ready: false,
        ignored: true,
        reason: "room_disabled",
      };
    }

    const activeHand = await getActiveHand(connection, validTableId, {
      lock: true,
    });

    /*
     * অন্য timer ইতোমধ্যে নতুন hand
     * শুরু করলে এই timer ignore হবে।
     */
    if (activeHand) {
      return {
        ready: false,
        ignored: true,
        reason: "next_hand_already_started",

        activeHandId: Number(activeHand.id),
      };
    }

    const latestHand = await getLockedLatestHand(connection, validTableId);

    if (!latestHand) {
      return {
        ready: false,
        ignored: true,
        reason: "completed_hand_not_found",
      };
    }

    if (Number(latestHand.id) !== validCompletedHandId) {
      return {
        ready: false,
        ignored: true,
        reason: "stale_next_round_timer",

        latestHandId: Number(latestHand.id),
      };
    }

    if (
      latestHand.hand_status !== HAND_STATUS.COMPLETED ||
      !normalizeBoolean(latestHand.settlement_completed)
    ) {
      return {
        ready: false,
        ignored: true,
        reason: "previous_hand_not_settled",
      };
    }

    /*
     * Completed hand-এর কোনো pending
     * Side Show থাকলে cancel হবে।
     */
    await connection.query(
      `
          UPDATE teen_patti_side_show_requests

          SET
            request_status = 'cancelled',
            responded_at = COALESCE(
              responded_at,
              NOW()
            )

          WHERE hand_id = ?
            AND request_status = 'pending'
          `,
      [latestHand.id],
    );

    const members = await getActiveTableMembers(connection, validTableId, {
      lock: true,
    });

    const counts = countMemberTypes(members);

    if (counts.total < MIN_PLAYERS) {
      return {
        ready: false,
        ignored: false,

        reason: "not_enough_players",

        counts,
      };
    }

    if (counts.total > MAX_PLAYERS) {
      return {
        ready: false,
        ignored: false,

        reason: "too_many_players",

        counts,
      };
    }

    if (counts.real < 1) {
      return {
        ready: false,
        ignored: false,

        reason: "real_player_required",

        counts,
      };
    }

    const expectedBotCount = counts.real < MAX_PLAYERS ? 1 : 0;

    if (counts.bots !== expectedBotCount) {
      return {
        ready: false,
        ignored: false,

        reason: "invalid_bot_count",

        counts,
        expectedBotCount,
      };
    }

    const bootAmount = parseMoney(table.boot_amount);

    const insufficientPlayers = members
      .filter((member) => parseMoney(member.walletBalance) < bootAmount)
      .map((member) => ({
        playerType: member.playerType,

        userId: member.userId,

        botId: member.botId,

        seatNo: member.seatNo,

        name: member.name,

        walletBalance: parseMoney(member.walletBalance),

        requiredBalance: bootAmount,
      }));

    /*
     * Balance কম player-এর membership
     * delete/deactivate করা হচ্ছে না।
     * এতে পুরোনো hand history এবং seat
     * identity নিরাপদ থাকবে।
     */
    if (insufficientPlayers.length > 0) {
      await connection.query(
        `
            UPDATE game_tables

            SET
              game_status = 'waiting',
              pot_amount = 0.00

            WHERE id = ?
            `,
        [validTableId],
      );

      return {
        ready: false,
        ignored: false,

        reason: "insufficient_player_balance",

        bootAmount,

        insufficientPlayers,
      };
    }

    const requestingPlayer = members.find(
      (member) => member.playerType === PLAYER_TYPE.REAL,
    );

    assertCondition(
      requestingPlayer,
      "No real player is available to start the next hand.",
      409,
      "REAL_PLAYER_REQUIRED",
    );

    await connection.query(
      `
          UPDATE table_players

          SET
            is_dealer = 0,
            is_seen = 0,
            is_packed = 0,
            cards = NULL,
            current_bet = 0.00

          WHERE table_id = ?
            AND is_active = 1
          `,
      [validTableId],
    );

    await connection.query(
      `
          UPDATE table_bots

          SET
            is_dealer = 0,
            is_seen = 0,
            is_packed = 0,
            cards = NULL,
            current_bet = 0.00

          WHERE table_id = ?
            AND is_active = 1
          `,
      [validTableId],
    );

    await connection.query(
      `
          UPDATE game_tables

          SET
            game_status = 'waiting',
            pot_amount = 0.00

          WHERE id = ?
          `,
      [validTableId],
    );

    return {
      ready: true,
      ignored: false,

      tableId: validTableId,

      previousHandId: Number(latestHand.id),

      previousRoundNumber: Number(latestHand.round_number),

      requestingUserId: Number(requestingPlayer.userId),

      bootAmount,

      counts,
    };
  });

  if (preparation.ready !== true) {
    return {
      ...preparation,

      handStarted: false,
    };
  }

  try {
    const startedHand = await startTeenPattiHand(
      validTableId,
      preparation.requestingUserId,
    );

    return {
      ...preparation,

      handStarted: true,

      startedHand,
    };
  } catch (error) {
    /*
     * Concurrent timer আগে hand শুরু করলে
     * এটি expected এবং নিরাপদ।
     */
    if (error.code === "HAND_ALREADY_RUNNING") {
      return {
        ...preparation,

        ready: false,
        ignored: true,

        reason: "next_hand_already_started",

        handStarted: false,
      };
    }

    throw error;
  }
}

/* =========================================================
   EXPLICIT TABLE EXIT
========================================================= */

async function leaveTeenPattiTable(tableId, requestingUserId, options = {}) {
  const validTableId = parsePositiveInteger(tableId);

  const validUserId = parsePositiveInteger(requestingUserId);

  assertCondition(
    validTableId !== null,
    "Valid Teen Patti table ID is required.",
    400,
    "INVALID_TABLE_ID",
  );

  assertCondition(
    validUserId !== null,
    "Valid requesting user ID is required.",
    400,
    "INVALID_USER_ID",
  );

  return withTransaction(async (connection) => {
    const table = await getLockedTable(connection, validTableId);

    assertCondition(
      table,
      "Teen Patti table not found.",
      404,
      "TABLE_NOT_FOUND",
    );

    const tablePlayer = await getTablePlayerByUser(
      connection,
      validTableId,
      validUserId,
      {
        lock: true,
      },
    );

    assertCondition(
      tablePlayer,
      "You are not a player of this table.",
      404,
      "TABLE_PLAYER_NOT_FOUND",
    );

    if (tablePlayer.isActive !== true) {
      return {
        success: true,
        alreadyLeft: true,

        tableId: validTableId,

        userId: validUserId,

        handCompleted: false,
        settlement: null,
      };
    }

    /*
     * Disconnect-forfeit হলে একই transaction
     * lock-এর মধ্যে timestamp এবং grace
     * পরীক্ষা হবে।
     */
    if (options.requireExpiredDisconnect === true) {
      const [disconnectRows] = await connection.query(
        `
            SELECT
              disconnected_at

            FROM table_players

            WHERE id = ?
              AND table_id = ?
              AND user_id = ?
              AND is_active = 1

            LIMIT 1

            FOR UPDATE
            `,
        [tablePlayer.tablePlayerId, validTableId, validUserId],
      );

      const disconnectedAt = disconnectRows[0]?.disconnected_at || null;

      if (!disconnectedAt) {
        return {
          success: true,
          ignored: true,

          reason: "player_reconnected",

          tableId: validTableId,

          userId: validUserId,

          handCompleted: false,
          settlement: null,
        };
      }

      const actualDisconnectTime = new Date(disconnectedAt).getTime();

      const expectedDisconnectTime = options.expectedDisconnectedAt
        ? new Date(options.expectedDisconnectedAt).getTime()
        : null;

      /*
       * MariaDB DATETIME millisecond না রাখলে
       * comparison seconds অনুযায়ী হবে।
       */
      if (
        Number.isFinite(expectedDisconnectTime) &&
        Math.floor(actualDisconnectTime / 1000) !==
          Math.floor(expectedDisconnectTime / 1000)
      ) {
        return {
          success: true,
          ignored: true,

          reason: "stale_disconnect_timer",

          tableId: validTableId,

          userId: validUserId,

          handCompleted: false,
          settlement: null,
        };
      }

      const graceExpiresAt =
        actualDisconnectTime + RECONNECT_GRACE_SECONDS * 1000;

      if (Date.now() < graceExpiresAt) {
        return {
          success: true,
          ignored: true,

          reason: "reconnect_grace_not_expired",

          tableId: validTableId,

          userId: validUserId,

          graceExpiresAt: new Date(graceExpiresAt),

          handCompleted: false,
          settlement: null,
        };
      }
    }

    const hand = await getActiveHand(connection, validTableId, {
      lock: true,
    });

    let handPlayerId = null;
    let wasCurrentTurn = false;
    let nextTurnHandPlayerId = null;
    let nextTurnSeatNo = null;
    let settlement = null;

    if (hand && hand.hand_status === HAND_STATUS.PLAYING) {
      const activePlayers = await getLockedActiveHandPlayers(
        connection,
        Number(hand.id),
      );

      const leavingPlayer = activePlayers.find(
        (player) =>
          player.playerType === PLAYER_TYPE.REAL &&
          Number(player.userId) === validUserId,
      );

      if (leavingPlayer) {
        handPlayerId = leavingPlayer.handPlayerId;

        wasCurrentTurn =
          Number(hand.current_turn_hand_player_id) ===
          Number(leavingPlayer.handPlayerId);

        await connection.query(
          `
            UPDATE teen_patti_hand_players

            SET
              player_status = 'left',
              last_action = 'pack'

            WHERE id = ?
              AND hand_id = ?
              AND player_status = 'active'
            `,
          [leavingPlayer.handPlayerId, hand.id],
        );

        const nextSequence = await getNextActionSequence(
          connection,
          Number(hand.id),
        );

        await connection.query(
          `
            INSERT INTO teen_patti_hand_actions (
              hand_id,
              hand_player_id,
              action_sequence,
              action_type,
              requested_amount,
              contribution_amount,
              balance_before,
              balance_after,
              current_bet_after,
              pot_after,
              is_automatic
            )
            VALUES (
              ?,
              ?,
              ?,
              'pack',
              0.00,
              0.00,
              ?,
              ?,
              ?,
              ?,
              1
            )
            `,
          [
            hand.id,
            leavingPlayer.handPlayerId,
            nextSequence,

            leavingPlayer.endingBalance,
            leavingPlayer.endingBalance,

            parseMoney(hand.current_bet),

            parseMoney(hand.pot_amount),
          ],
        );

        /*
         * Player exit করলে তার target/requester
         * pending Side Show cancel হবে।
         */
        await connection.query(
          `
            UPDATE teen_patti_side_show_requests

            SET
              request_status = 'cancelled',
              responded_at = NOW()

            WHERE hand_id = ?
              AND request_status = 'pending'
              AND (
                requester_hand_player_id = ?
                OR
                target_hand_player_id = ?
              )
            `,
          [hand.id, leavingPlayer.handPlayerId, leavingPlayer.handPlayerId],
        );

        const remainingPlayers = activePlayers.filter(
          (player) =>
            Number(player.handPlayerId) !== Number(leavingPlayer.handPlayerId),
        );

        if (remainingPlayers.length === 1) {
          settlement = await settleTeenPattiHandWithinTransaction(
            connection,
            validTableId,
            {
              reason: "last_player",
            },
          );
        } else if (remainingPlayers.length > 1) {
          if (wasCurrentTurn) {
            const nextPlayer = findNextActiveMember(
              remainingPlayers,
              leavingPlayer.seatNo,
            );

            assertCondition(
              nextPlayer,
              "Next active Teen Patti player was not found.",
              500,
              "NEXT_PLAYER_NOT_FOUND",
            );

            nextTurnHandPlayerId = nextPlayer.handPlayerId;

            nextTurnSeatNo = nextPlayer.seatNo;

            const actionStartedAt = new Date();

            const actionExpiresAt = createDateAfterSeconds(TURN_SECONDS);

            await connection.query(
              `
                UPDATE teen_patti_hands

                SET
                  current_turn_hand_player_id = ?,

                  action_started_at = ?,
                  action_expires_at = ?,

                  state_version =
                    state_version + 1

                WHERE id = ?
                  AND hand_status = 'playing'
                `,
              [nextTurnHandPlayerId, actionStartedAt, actionExpiresAt, hand.id],
            );
          } else {
            await connection.query(
              `
                UPDATE teen_patti_hands

                SET
                  state_version =
                    state_version + 1

                WHERE id = ?
                  AND hand_status = 'playing'
                `,
              [hand.id],
            );
          }
        }
      }
    }

    /*
     * seat_no NULL করলে unique seat আবার
     * নতুন player ব্যবহার করতে পারবে।
     */
    await connection.query(
      `
        UPDATE table_players

        SET
          seat_no = NULL,

          is_dealer = 0,
          is_active = 0,
          is_seen = 0,
          is_packed = 1,

          cards = NULL,
          current_bet = 0.00,

          disconnected_at = NULL,
          left_at = NOW()

        WHERE id = ?
          AND table_id = ?
          AND user_id = ?
        `,
      [tablePlayer.tablePlayerId, validTableId, validUserId],
    );

    const remainingMembers = await getActiveTableMembers(
      connection,
      validTableId,
      {
        lock: true,
      },
    );

    const remainingCounts = countMemberTypes(remainingMembers);

    /*
     * কোনো real player না থাকলে bot-only
     * table চলবে না।
     */
    if (remainingCounts.real === 0) {
      await connection.query(
        `
          UPDATE table_bots

          SET
            seat_no = NULL,

            is_dealer = 0,
            is_active = 0,
            is_seen = 0,
            is_packed = 1,

            cards = NULL,
            current_bet = 0.00

          WHERE table_id = ?
            AND is_active = 1
          `,
        [validTableId],
      );

      await connection.query(
        `
          UPDATE game_tables

          SET
            game_status = 'finished',
            pot_amount = 0.00

          WHERE id = ?
          `,
        [validTableId],
      );
    } else if (!settlement) {
      await connection.query(
        `
          UPDATE game_tables

          SET
            game_status =
              CASE
                WHEN game_status = 'finished'
                  THEN 'waiting'
                ELSE game_status
              END

          WHERE id = ?
          `,
        [validTableId],
      );
    }

    await updateRoomPlayerCount(connection, Number(table.room_id));

    return {
      success: true,
      alreadyLeft: false,

      tableId: validTableId,

      userId: validUserId,

      tablePlayerId: tablePlayer.tablePlayerId,

      handId: hand ? Number(hand.id) : null,

      handPlayerId,

      wasCurrentTurn,

      handCompleted: settlement !== null,

      nextTurnHandPlayerId,
      nextTurnSeatNo,

      remainingCounts,

      settlement,
    };
  });
}

/* =========================================================
   DISCONNECT AND RECONNECT
========================================================= */

async function markTeenPattiDisconnected(tableId, userId) {
  const validTableId = parsePositiveInteger(tableId);

  const validUserId = parsePositiveInteger(userId);

  assertCondition(
    validTableId !== null,
    "Valid Teen Patti table ID is required.",
    400,
    "INVALID_TABLE_ID",
  );

  assertCondition(
    validUserId !== null,
    "Valid user ID is required.",
    400,
    "INVALID_USER_ID",
  );

  return withTransaction(async (connection) => {
    const table = await getLockedTable(connection, validTableId);

    if (!table) {
      return {
        ignored: true,
        reason: "table_not_found",
      };
    }

    const [playerRows] = await connection.query(
      `
          SELECT
            id,
            table_id,
            user_id,
            seat_no,
            is_active,
            disconnected_at,
            left_at

          FROM table_players

          WHERE table_id = ?
            AND user_id = ?

          LIMIT 1

          FOR UPDATE
          `,
      [validTableId, validUserId],
    );

    const player = playerRows[0] || null;

    if (!player || !normalizeBoolean(player.is_active)) {
      return {
        ignored: true,
        reason: "player_not_active",
      };
    }

    const disconnectedAt = new Date();

    const graceExpiresAt = new Date(
      disconnectedAt.getTime() + RECONNECT_GRACE_SECONDS * 1000,
    );

    await connection.query(
      `
        UPDATE table_players

        SET
          disconnected_at = ?,
          left_at = NULL

        WHERE id = ?
          AND table_id = ?
          AND user_id = ?
          AND is_active = 1
        `,
      [disconnectedAt, player.id, validTableId, validUserId],
    );

    const hand = await getActiveHand(connection, validTableId, {
      lock: true,
    });

    let handPlayerId = null;
    let isCurrentTurn = false;

    if (hand) {
      const activePlayers = await getLockedActiveHandPlayers(
        connection,
        Number(hand.id),
      );

      const handPlayer = activePlayers.find(
        (item) =>
          item.playerType === PLAYER_TYPE.REAL &&
          Number(item.userId) === validUserId,
      );

      if (handPlayer) {
        handPlayerId = handPlayer.handPlayerId;

        isCurrentTurn =
          Number(hand.current_turn_hand_player_id) ===
          Number(handPlayer.handPlayerId);
      }
    }

    return {
      ignored: false,

      tableId: validTableId,

      userId: validUserId,

      tablePlayerId: Number(player.id),

      seatNo: player.seat_no === null ? null : Number(player.seat_no),

      handId: hand ? Number(hand.id) : null,

      handPlayerId,

      isCurrentTurn,

      disconnectedAt,
      graceExpiresAt,

      graceSeconds: RECONNECT_GRACE_SECONDS,
    };
  });
}

async function reconnectTeenPattiPlayer(tableId, userId) {
  const validTableId = parsePositiveInteger(tableId);

  const validUserId = parsePositiveInteger(userId);

  assertCondition(
    validTableId !== null,
    "Valid Teen Patti table ID is required.",
    400,
    "INVALID_TABLE_ID",
  );

  assertCondition(
    validUserId !== null,
    "Valid user ID is required.",
    400,
    "INVALID_USER_ID",
  );

  const reconnectResult = await withTransaction(async (connection) => {
    const table = await getLockedTable(connection, validTableId);

    assertCondition(
      table,
      "Teen Patti table not found.",
      404,
      "TABLE_NOT_FOUND",
    );

    const [playerRows] = await connection.query(
      `
            SELECT
              id,
              table_id,
              user_id,
              seat_no,
              is_active,
              disconnected_at,
              left_at

            FROM table_players

            WHERE table_id = ?
              AND user_id = ?

            LIMIT 1

            FOR UPDATE
            `,
      [validTableId, validUserId],
    );

    const player = playerRows[0] || null;

    assertCondition(
      player && normalizeBoolean(player.is_active),
      "Your active Teen Patti seat was not found.",
      404,
      "ACTIVE_SEAT_NOT_FOUND",
    );

    const wasDisconnected = player.disconnected_at !== null;

    await connection.query(
      `
          UPDATE table_players

          SET
            disconnected_at = NULL,
            left_at = NULL

          WHERE id = ?
            AND table_id = ?
            AND user_id = ?
            AND is_active = 1
          `,
      [player.id, validTableId, validUserId],
    );

    return {
      tableId: validTableId,

      userId: validUserId,

      tablePlayerId: Number(player.id),

      seatNo: player.seat_no === null ? null : Number(player.seat_no),

      wasDisconnected,

      reconnectedAt: new Date(),
    };
  });

  const tableState = await getTableState(validTableId);

  let handState = null;

  try {
    handState = await getTeenPattiHandState(validTableId, validUserId);
  } catch (error) {
    if (!["NOT_HAND_PLAYER", "NO_ACTIVE_HAND"].includes(error.code)) {
      throw error;
    }
  }

  return {
    success: true,

    message: reconnectResult.wasDisconnected
      ? "Teen Patti player reconnected successfully."
      : "Teen Patti player connection is active.",

    reconnect: reconnectResult,

    tableState,
    handState,
  };
}

/* =========================================================
   DISCONNECT FORFEIT
========================================================= */

async function forfeitDisconnectedTeenPattiPlayer(
  tableId,
  userId,
  expectedDisconnectedAt,
) {
  const validTableId = parsePositiveInteger(tableId);

  const validUserId = parsePositiveInteger(userId);

  assertCondition(
    validTableId !== null,
    "Valid Teen Patti table ID is required.",
    400,
    "INVALID_TABLE_ID",
  );

  assertCondition(
    validUserId !== null,
    "Valid user ID is required.",
    400,
    "INVALID_USER_ID",
  );

  const result = await leaveTeenPattiTable(validTableId, validUserId, {
    requireExpiredDisconnect: true,

    expectedDisconnectedAt: expectedDisconnectedAt || null,
  });

  if (result.ignored === true) {
    return {
      ...result,

      disconnectForfeited: false,
    };
  }

  return {
    ...result,

    disconnectForfeited: true,

    message: result.handCompleted
      ? "Disconnected player forfeited and the hand was completed."
      : "Disconnected player forfeited the Teen Patti table.",
  };
}

/* =========================================================
   TEMPORARY SECTION-1 EXPORTS
========================================================= */

module.exports = {
  getTableState,
  getTeenPattiHandState,
  joinMatchmaking,
  completeTeenPattiMatchmaking,
  joinTable,
  createTable,
  startTeenPattiHand,
  seeTeenPattiCards,
  performTeenPattiBetAction,
  packTeenPattiHand,
  showTeenPattiHand,
  timeoutTeenPattiTurn,
  performTeenPattiBotAction,
  requestTeenPattiSideShow,
  respondTeenPattiSideShow,
  expireTeenPattiSideShow,
  respondTeenPattiBotSideShow,
  prepareNextTeenPattiHand,
  leaveTeenPattiTable,
  markTeenPattiDisconnected,
  reconnectTeenPattiPlayer,
  forfeitDisconnectedTeenPattiPlayer,

  _internal: {
    MAX_PLAYERS,
    MIN_PLAYERS,
    TURN_SECONDS,
    SIDE_SHOW_SECONDS,
    RECONNECT_GRACE_SECONDS,
    NEXT_HAND_DELAY_MS,
    MATCHMAKING_SECONDS,

    ALLOWED_BOOT_AMOUNTS,
    TABLE_STATUS,
    HAND_STATUS,
    PLAYER_STATUS,
    PLAYER_TYPE,
    ACTION_TYPE,

    createServiceError,
    assertCondition,

    parsePositiveInteger,
    parseMoney,
    calculatePercentage,
    createDateAfterSeconds,
    createTransactionId,
    createTableCode,

    withTransaction,

    getLockedTable,
    getTable,
    getLockedUser,
    getTableMembers,
    getActiveTableMembers,
    getTablePlayerByUser,

    countMemberTypes,
    findAvailableSeat,
    findNextActiveMember,

    dealCards,
    evaluateHand,
    compareHands,
    findWinningHands,
    serializeCards,
    deserializeCards,
    settleTeenPattiHandWithinTransaction,
    distributePrizeMoney,
    decideTeenPattiBotAction,
    shouldBotSeeCards,
    getBotPackChance,
    getBotRaiseChance,
    decideBotSideShowResponse,
    getLockedLatestHand,
  },
};
