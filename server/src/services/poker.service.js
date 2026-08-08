"use strict";

const crypto = require("crypto");

const { pool } = require("../config/database");

const {
  createDeck,
  shuffleDeck,
  createShuffledDeck,
  dealHoleCards,
  dealCommunityStreet,
} = require("./poker.cards");

const { evaluateHoldemHand } = require("./poker.evaluator");

const {
  MATCHMAKING_WAIT_SECONDS,
  MAX_PLAYERS,
  ALLOWED_BIG_BLINDS,
  TABLE_STATUS,
  PLAYER_STATUS,
  getSmallBlind,
  getMinimumBuyIn,
  getMaximumBuyIn,
} = require("../constants/poker.constants");

/* ==========================================
   Basic Helpers
========================================== */

function createServiceError(message, statusCode = 500) {
  const error = new Error(message);

  error.statusCode = statusCode;

  error.status = statusCode;

  return error;
}

function parsePositiveInteger(value) {
  const number = Number(value);

  if (!Number.isInteger(number) || number <= 0) {
    return null;
  }

  return number;
}

function parsePositiveMoney(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  return Number(amount.toFixed(2));
}

function createTableCode() {
  return `PK_TABLE_${Date.now()}_` + crypto.randomInt(100000, 1000000);
}

function createTransactionId() {
  return `PKTX${Date.now()}` + crypto.randomInt(100000, 1000000);
}

function validateBigBlind(value) {
  const bigBlind = parsePositiveMoney(value);

  if (!bigBlind || !ALLOWED_BIG_BLINDS.includes(bigBlind)) {
    throw createServiceError("Please select a valid Poker room.", 400);
  }

  return bigBlind;
}

function validateBuyIn(value, bigBlind) {
  const buyInAmount = parsePositiveMoney(value);

  const minimumBuyIn = getMinimumBuyIn(bigBlind);

  const maximumBuyIn = getMaximumBuyIn(bigBlind);

  if (
    !buyInAmount ||
    buyInAmount < minimumBuyIn ||
    buyInAmount > maximumBuyIn
  ) {
    throw createServiceError(
      `Poker buy-in must be between ৳${minimumBuyIn} and ৳${maximumBuyIn}.`,
      400,
    );
  }

  return buyInAmount;
}

/* ==========================================
   Locked User
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
          account_status,
          wallet_balance,
          turnover_amount
        FROM users
        WHERE id = ?
        LIMIT 1
        FOR UPDATE
      `,
    [userId],
  );

  return rows[0] || null;
}

function validatePokerUser(user, buyInAmount) {
  if (!user) {
    throw createServiceError("User account was not found.", 404);
  }

  if (user.account_status !== "active" || String(user.role) !== "user") {
    throw createServiceError("This account cannot join Poker.", 403);
  }

  if (Number(user.wallet_balance) < buyInAmount) {
    throw createServiceError(
      "Insufficient wallet balance for this Poker buy-in.",
      400,
    );
  }
}

/* ==========================================
   Existing Active Seat
========================================== */

async function findExistingSeat(userId, connection) {
  const [rows] = await connection.query(
    `
        SELECT
          ptp.id AS table_player_id,
          ptp.table_id,
          ptp.player_status,

          pt.table_code,
          pt.table_status

        FROM poker_table_players ptp

        INNER JOIN poker_tables pt
          ON pt.id = ptp.table_id

        WHERE ptp.user_id = ?
          AND ptp.is_bot = 0
          AND ptp.player_status !=
              'left'
          AND pt.table_status IN (
              'waiting',
              'starting',
              'playing',
              'paused'
          )

        ORDER BY ptp.id DESC
        LIMIT 1
        FOR UPDATE
      `,
    [userId],
  );

  return rows[0] || null;
}

/* ==========================================
   Poker Room
========================================== */

async function getLockedRoom(bigBlind, connection) {
  const [rows] = await connection.query(
    `
        SELECT
          id,
          room_code,
          room_name,
          max_players,
          boot_amount,
          service_charge,
          status
        FROM game_rooms
        WHERE game_type = 'poker'
          AND boot_amount = ?
          AND status != 'disabled'
        ORDER BY id ASC
        LIMIT 1
        FOR UPDATE
      `,
    [bigBlind],
  );

  const room = rows[0] || null;

  if (!room) {
    throw createServiceError("Poker room was not found.", 404);
  }

  return room;
}

/* ==========================================
   Waiting Table
========================================== */

async function findWaitingTable(roomId, connection) {
  const [rows] = await connection.query(
    `
        SELECT
          id,
          room_id,
          table_code,
          table_status,
          max_players,
          current_players,
          small_blind,
          big_blind,
          minimum_buy_in,
          maximum_buy_in,
          matchmaking_expires_at
        FROM poker_tables
        WHERE room_id = ?
          AND table_status =
              'waiting'
          AND current_players <
              max_players
        ORDER BY id ASC
        LIMIT 1
        FOR UPDATE
      `,
    [roomId],
  );

  return rows[0] || null;
}

async function createWaitingTable(room, bigBlind, connection) {
  const smallBlind = getSmallBlind(bigBlind);

  const minimumBuyIn = getMinimumBuyIn(bigBlind);

  const maximumBuyIn = getMaximumBuyIn(bigBlind);

  const [result] = await connection.query(
    `
        INSERT INTO poker_tables (
          room_id,
          table_code,
          table_status,
          max_players,
          current_players,
          small_blind,
          big_blind,
          minimum_buy_in,
          maximum_buy_in,
          service_charge_percent,
          current_hand_number,
          matchmaking_started_at,
          matchmaking_expires_at
        )
        VALUES (
          ?,
          ?,
          'waiting',
          ?,
          0,
          ?,
          ?,
          ?,
          ?,
          ?,
          0,
          NOW(),
          DATE_ADD(
            NOW(),
            INTERVAL ? SECOND
          )
        )
      `,
    [
      Number(room.id),
      createTableCode(),
      MAX_PLAYERS,
      smallBlind,
      bigBlind,
      minimumBuyIn,
      maximumBuyIn,
      Number(room.service_charge || 5),
      MATCHMAKING_WAIT_SECONDS,
    ],
  );

  return Number(result.insertId);
}

/* ==========================================
   Seat Helpers
========================================== */

async function getAvailableSeat(tableId, connection) {
  const [rows] = await connection.query(
    `
        SELECT seat_no
        FROM poker_table_players
        WHERE table_id = ?
          AND player_status !=
              'left'
        ORDER BY seat_no ASC
        FOR UPDATE
      `,
    [tableId],
  );

  const usedSeats = new Set(rows.map((row) => Number(row.seat_no)));

  for (let seatNo = 1; seatNo <= MAX_PLAYERS; seatNo += 1) {
    if (!usedSeats.has(seatNo)) {
      return seatNo;
    }
  }

  return null;
}

/* ==========================================
   Wallet Buy-in Debit
========================================== */

async function debitPokerBuyIn(user, tableId, buyInAmount, connection) {
  const balanceBefore = Number(user.wallet_balance);

  const balanceAfter = Number((balanceBefore - buyInAmount).toFixed(2));

  if (balanceAfter < 0) {
    throw createServiceError("Insufficient wallet balance.", 400);
  }

  const [walletResult] = await connection.query(
    `
      UPDATE users
      SET
        wallet_balance = ?
      WHERE id = ?
        AND account_status = 'active'
        AND wallet_balance >= ?
    `,
    [balanceAfter, Number(user.id), buyInAmount],
  );

  if (Number(walletResult.affectedRows) !== 1) {
    throw createServiceError("Unable to debit Poker buy-in.", 409);
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
        'poker_table',
        ?,
        ?,
        NULL
      )
    `,
    [
      createTransactionId(),
      Number(user.id),
      buyInAmount,
      balanceBefore,
      balanceAfter,
      String(tableId),
      `Poker table ${tableId} buy-in`,
    ],
  );

  return {
    balanceBefore,
    balanceAfter,
  };
}

async function addPokerTurnover(userId, contributionAmount, connection) {
  const validUserId = parsePositiveInteger(userId);

  const validContribution = Number(Number(contributionAmount || 0).toFixed(2));

  if (
    !validUserId ||
    !Number.isFinite(validContribution) ||
    validContribution <= 0
  ) {
    return;
  }

  const [result] = await connection.query(
    `
        UPDATE users
        SET
          turnover_amount =
            turnover_amount + ?
        WHERE id = ?
          AND account_status =
              'active'
      `,
    [validContribution, validUserId],
  );

  if (Number(result.affectedRows) !== 1) {
    throw createServiceError("Unable to update Poker turnover.", 409);
  }
}

/* ==========================================
   Public Table State
========================================== */

async function buildTableState(tableId, connection = pool) {
  const [tableRows] = await connection.query(
    `
        SELECT
          pt.id,
          pt.room_id,
          pt.table_code,
          pt.table_status,
          pt.max_players,
          pt.current_players,
          pt.small_blind,
          pt.big_blind,
          pt.minimum_buy_in,
          pt.maximum_buy_in,
          pt.service_charge_percent,
          pt.current_hand_number,
          pt.dealer_seat_no,
          pt.matchmaking_started_at,
          pt.matchmaking_expires_at,
          pt.state_version,
          pt.created_at,
          pt.updated_at,

          gr.room_name

        FROM poker_tables pt

        INNER JOIN game_rooms gr
          ON gr.id = pt.room_id

        WHERE pt.id = ?
        LIMIT 1
      `,
    [tableId],
  );

  const table = tableRows[0] || null;

  if (!table) {
    throw createServiceError("Poker table was not found.", 404);
  }

  const [playerRows] = await connection.query(
    `
        SELECT
          ptp.id,
          ptp.user_id,
          ptp.bot_id,
          ptp.is_bot,
          ptp.seat_no,
          ptp.player_status,
          ptp.stack_amount,
          ptp.initial_buy_in,
          ptp.total_buy_in,
          ptp.hands_played,
          ptp.hands_won,
          ptp.joined_at,

          u.uid,
          u.full_name,
          u.username,
          u.wallet_balance,

          pb.bot_code,
          pb.bot_name,
          pb.avatar_url,
          pb.difficulty,
          pb.playing_style

        FROM poker_table_players ptp

        LEFT JOIN users u
          ON u.id = ptp.user_id
          AND ptp.is_bot = 0

        LEFT JOIN poker_bots pb
          ON pb.id = ptp.bot_id
          AND ptp.is_bot = 1

        WHERE ptp.table_id = ?
          AND ptp.player_status !=
              'left'

        ORDER BY ptp.seat_no ASC
      `,
    [tableId],
  );

  const players = playerRows.map((player) => {
    const isBot = Boolean(player.is_bot);

    return {
      id: Number(player.id),

      tablePlayerId: Number(player.id),

      userId: player.user_id ? Number(player.user_id) : null,

      botId: player.bot_id ? Number(player.bot_id) : null,

      isBot,

      uid: isBot ? player.bot_code : player.uid,

      name: isBot
        ? player.bot_name
        : player.full_name || player.username || `Player ${player.seat_no}`,

      username: isBot ? null : player.username,

      avatarUrl: isBot ? player.avatar_url : null,

      difficulty: isBot ? player.difficulty : null,

      playingStyle: isBot ? player.playing_style : null,

      seatNo: Number(player.seat_no),

      status: player.player_status,

      stackAmount: Number(player.stack_amount || 0),

      initialBuyIn: Number(player.initial_buy_in || 0),

      totalBuyIn: Number(player.total_buy_in || 0),

      walletBalance: isBot ? null : Number(player.wallet_balance || 0),

      handsPlayed: Number(player.hands_played || 0),

      handsWon: Number(player.hands_won || 0),

      joinedAt: player.joined_at,
    };
  });

  return {
    table: {
      id: Number(table.id),

      tableId: Number(table.id),

      roomId: Number(table.room_id),

      roomName: table.room_name,

      tableCode: table.table_code,

      status: table.table_status,

      maxPlayers: Number(table.max_players),

      currentPlayers: Number(table.current_players),

      smallBlind: Number(table.small_blind),

      bigBlind: Number(table.big_blind),

      minimumBuyIn: Number(table.minimum_buy_in),

      maximumBuyIn: Number(table.maximum_buy_in),

      serviceChargePercent: Number(table.service_charge_percent),

      currentHandNumber: Number(table.current_hand_number || 0),

      dealerSeatNo: table.dealer_seat_no ? Number(table.dealer_seat_no) : null,

      matchmakingStartedAt: table.matchmaking_started_at,

      matchmakingExpiresAt: table.matchmaking_expires_at,

      stateVersion: Number(table.state_version || 1),

      createdAt: table.created_at,

      updatedAt: table.updated_at,
    },

    players,

    matchmaking: {
      isWaiting: table.table_status === TABLE_STATUS.WAITING,

      waitSeconds: MATCHMAKING_WAIT_SECONDS,

      currentPlayers: players.length,

      waitingForPlayers: Math.max(2 - players.length, 0),

      expiresAt: table.matchmaking_expires_at,
    },
  };
}

/* ==========================================
   Join Poker Matchmaking
========================================== */

async function joinMatchmaking(userId, bigBlindValue, buyInValue) {
  const validUserId = parsePositiveInteger(userId);

  if (!validUserId) {
    throw createServiceError("Invalid user ID.", 400);
  }

  const bigBlind = validateBigBlind(bigBlindValue);

  const buyInAmount = validateBuyIn(buyInValue, bigBlind);

  const connection = await pool.getConnection();

  let tableId = null;
  let alreadyJoined = false;

  try {
    await connection.beginTransaction();

    const user = await getLockedUser(validUserId, connection);

    const existingSeat = await findExistingSeat(validUserId, connection);

    if (existingSeat) {
      tableId = Number(existingSeat.table_id);

      alreadyJoined = true;

      await connection.commit();
    } else {
      validatePokerUser(user, buyInAmount);

      const room = await getLockedRoom(bigBlind, connection);

      const waitingTable = await findWaitingTable(Number(room.id), connection);

      tableId = waitingTable
        ? Number(waitingTable.id)
        : await createWaitingTable(room, bigBlind, connection);

      const seatNo = await getAvailableSeat(tableId, connection);

      if (!seatNo) {
        throw createServiceError("Poker table is full.", 409);
      }

      await debitPokerBuyIn(user, tableId, buyInAmount, connection);

      await connection.query(
        `
          INSERT INTO poker_table_players (
            table_id,
            user_id,
            bot_id,
            is_bot,
            seat_no,
            player_status,
            stack_amount,
            initial_buy_in,
            total_buy_in,
            wallet_debited
          )
          VALUES (
            ?,
            ?,
            NULL,
            0,
            ?,
            'waiting',
            ?,
            ?,
            ?,
            1
          )
        `,
        [tableId, validUserId, seatNo, buyInAmount, buyInAmount, buyInAmount],
      );

      await connection.query(
        `
          UPDATE poker_tables
          SET
            current_players = (
              SELECT COUNT(*)
              FROM poker_table_players
              WHERE table_id = ?
                AND player_status !=
                    'left'
            ),

            state_version =
              state_version + 1

          WHERE id = ?
        `,
        [tableId, tableId],
      );

      await connection.query(
        `
          UPDATE game_rooms
          SET current_players = (
            SELECT COALESCE(
              SUM(current_players),
              0
            )
            FROM poker_tables
            WHERE room_id = ?
              AND table_status IN (
                'waiting',
                'starting',
                'playing'
              )
          )
          WHERE id = ?
        `,
        [Number(room.id), Number(room.id)],
      );

      await connection.commit();
    }
  } catch (error) {
    await connection.rollback();

    throw error;
  } finally {
    connection.release();
  }

  const state = await buildTableState(tableId);

  return {
    tableId,
    alreadyJoined,
    ...state,
  };
}

/* ==========================================
   Get Poker Table
========================================== */

async function getTableState(tableId) {
  const validTableId = parsePositiveInteger(tableId);

  if (!validTableId) {
    throw createServiceError("Invalid Poker table ID.", 400);
  }

  return buildTableState(validTableId);
}

async function getTableGameState(tableId, userId, connection = pool) {
  const validTableId = parsePositiveInteger(tableId);

  const validUserId = parsePositiveInteger(userId);

  if (!validTableId || !validUserId) {
    throw createServiceError("Invalid Poker game-state request.", 400);
  }

  const state = await buildTableState(validTableId, connection);

  const [handRows] = await connection.query(
    `
        SELECT
          id,
          table_id,
          hand_number,
          hand_status,
          dealer_player_id,
          small_blind_player_id,
          big_blind_player_id,
          current_turn_player_id,
          community_cards,
          pot_amount,
          current_bet,
          minimum_raise,
          action_started_at,
          action_expires_at,
          state_version
        FROM poker_hands
        WHERE table_id = ?
        ORDER BY id DESC
        LIMIT 1
      `,
    [validTableId],
  );

  const hand = handRows[0] || null;

  if (!hand) {
    return {
      ...state,
      hand: null,
      handPlayers: [],
      myAction: null,
    };
  }

  const [handPlayerRows] = await connection.query(
    `
        SELECT
          php.id,
          php.table_player_id,
          php.seat_no,
          php.player_status,
          php.is_dealer,
          php.is_small_blind,
          php.is_big_blind,
          php.hole_cards,
          php.starting_stack,
          php.ending_stack,
          php.round_bet,
          php.total_contribution,
          php.has_acted,
          php.last_action,
          php.hand_rank_name,
          php.prize_amount,
          ptp.user_id,
          ptp.bot_id,
          ptp.is_bot
        FROM poker_hand_players php
        INNER JOIN poker_table_players ptp
          ON ptp.id =
             php.table_player_id
        WHERE php.hand_id = ?
        ORDER BY php.seat_no
      `,
    [Number(hand.id)],
  );

  const handPlayers = handPlayerRows.map((player) => {
    const ownsCards =
      !Boolean(player.is_bot) && Number(player.user_id) === validUserId;

    return {
      id: Number(player.id),

      tablePlayerId: Number(player.table_player_id),

      seatNo: Number(player.seat_no),

      status: player.player_status,

      isBot: Boolean(player.is_bot),

      isDealer: Boolean(player.is_dealer),

      isSmallBlind: Boolean(player.is_small_blind),

      isBigBlind: Boolean(player.is_big_blind),

      /*
       * শুধু authenticated player
       * নিজের cards পাবে।
       */
      holeCards: ownsCards ? parseJsonArray(player.hole_cards) : [],

      hasCards: true,

      startingStack: Number(player.starting_stack),

      endingStack: Number(player.ending_stack),

      roundBet: Number(player.round_bet),

      totalContribution: Number(player.total_contribution),

      hasActed: Boolean(player.has_acted),

      lastAction: player.last_action,

      handRankName: player.hand_rank_name,

      prizeAmount: Number(player.prize_amount || 0),
    };
  });

  const myHandPlayer =
    handPlayerRows.find(
      (player) =>
        !Boolean(player.is_bot) && Number(player.user_id) === validUserId,
    ) || null;

  const isMyTurn =
    myHandPlayer &&
    Number(hand.current_turn_player_id) ===
      Number(myHandPlayer.table_player_id) &&
    myHandPlayer.player_status === "active";

  const callAmount = myHandPlayer
    ? Number(
        Math.max(
          Number(hand.current_bet) - Number(myHandPlayer.round_bet),
          0,
        ).toFixed(2),
      )
    : 0;

  const stackAmount = myHandPlayer ? Number(myHandPlayer.ending_stack) : 0;

  const maximumRaiseTo = myHandPlayer
    ? Number((Number(myHandPlayer.round_bet) + stackAmount).toFixed(2))
    : 0;

  const minimumRaiseTo = Number(
    (Number(hand.current_bet) + Number(hand.minimum_raise)).toFixed(2),
  );

  const raiseReopened = myHandPlayer
    ? await isPokerRaiseReopened(
        {
          handId: Number(hand.id),

          handStatus: hand.hand_status,

          handPlayerId: Number(myHandPlayer.id),

          currentBet: Number(hand.current_bet),

          minimumRaise: Number(hand.minimum_raise),
        },
        connection,
      )
    : false;

  const allowedActions = [];

  if (isMyTurn) {
    allowedActions.push("fold");

    if (callAmount === 0) {
      allowedActions.push("check");
    } else {
      allowedActions.push("call");
    }

    if (raiseReopened && maximumRaiseTo > Number(hand.current_bet)) {
      allowedActions.push("raise");
    }

    /*
     * All-in দিয়ে শুধু call করা হলে
     * Raise reopen হওয়ার প্রয়োজন নেই।
     *
     * Current bet-এর ওপরে গেলে সেটি Raise,
     * তখন betting reopen থাকতে হবে।
     */
    if (
      stackAmount > 0 &&
      (maximumRaiseTo <= Number(hand.current_bet) || raiseReopened)
    ) {
      allowedActions.push("all_in");
    }
  }

  return {
    ...state,

    hand: {
      id: Number(hand.id),

      handNumber: Number(hand.hand_number),

      status: hand.hand_status,

      dealerPlayerId: hand.dealer_player_id
        ? Number(hand.dealer_player_id)
        : null,

      smallBlindPlayerId: hand.small_blind_player_id
        ? Number(hand.small_blind_player_id)
        : null,

      bigBlindPlayerId: hand.big_blind_player_id
        ? Number(hand.big_blind_player_id)
        : null,

      currentTurnPlayerId: hand.current_turn_player_id
        ? Number(hand.current_turn_player_id)
        : null,

      communityCards: parseJsonArray(hand.community_cards),

      potAmount: Number(hand.pot_amount),

      currentBet: Number(hand.current_bet),

      minimumRaise: Number(hand.minimum_raise),

      actionStartedAt: hand.action_started_at,

      actionExpiresAt: hand.action_expires_at,

      stateVersion: Number(hand.state_version || 1),
    },

    handPlayers,

    myAction: {
      isMyTurn: Boolean(isMyTurn),

      callAmount,

      stackAmount,

      minimumRaiseTo,

      maximumRaiseTo,
      raiseReopened: Boolean(raiseReopened),

      allowedActions,
    },
  };
}

/* ==========================================
   Poker Hand Position Helpers
========================================== */

function getNextSeatPlayer(players, currentSeatNo, predicate = () => true) {
  const sortedPlayers = [...players].sort(
    (first, second) => Number(first.seat_no) - Number(second.seat_no),
  );

  const candidates = sortedPlayers.filter(predicate);

  if (candidates.length === 0) {
    return null;
  }

  return (
    candidates.find(
      (player) => Number(player.seat_no) > Number(currentSeatNo || 0),
    ) || candidates[0]
  );
}

async function postBlind(
  {
    handId,
    handPlayerId,
    tablePlayer,
    actionSequence,
    actionType,
    blindAmount,
    potBefore = 0,
  },
  connection,
) {
  const stackBefore = Number(tablePlayer.stack_amount);

  const contribution = Number(
    Math.min(stackBefore, Number(blindAmount)).toFixed(2),
  );

  const stackAfter = Number((stackBefore - contribution).toFixed(2));

  const potAfter = Number((Number(potBefore) + contribution).toFixed(2));

  const playerStatus = stackAfter === 0 ? "all_in" : "active";

  const [stackResult] = await connection.query(
    `
        UPDATE poker_table_players
        SET stack_amount = ?
        WHERE id = ?
          AND stack_amount = ?
      `,
    [stackAfter, Number(tablePlayer.id), stackBefore],
  );

  if (Number(stackResult.affectedRows) !== 1) {
    throw createServiceError("Unable to debit Poker blind.", 409);
  }

  if (contribution > 0 && Number(tablePlayer.is_bot) === 0) {
    await addPokerTurnover(tablePlayer.user_id, contribution, connection);
  }

  const [handPlayerResult] = await connection.query(
    `
        UPDATE poker_hand_players
        SET
          player_status = ?,
          ending_stack = ?,
          round_bet = ?,
          total_contribution = ?,
          has_acted = 0,
          last_action = ?
        WHERE id = ?
      `,
    [
      playerStatus,
      stackAfter,
      contribution,
      contribution,
      actionType,
      handPlayerId,
    ],
  );

  if (Number(handPlayerResult.affectedRows) !== 1) {
    throw createServiceError("Unable to update Poker blind.", 409);
  }

  await connection.query(
    `
      INSERT INTO poker_hand_actions (
        hand_id,
        hand_player_id,
        action_sequence,
        betting_round,
        action_type,
        action_amount,
        contribution_amount,
        stack_before,
        stack_after,
        current_bet_after,
        pot_after,
        is_automatic
      )
      VALUES (
        ?,
        ?,
        ?,
        'preflop',
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
      handId,
      handPlayerId,
      actionSequence,
      actionType,
      contribution,
      contribution,
      stackBefore,
      stackAfter,
      contribution,
      potAfter,
    ],
  );

  return {
    contribution,
    stackBefore,
    stackAfter,
    potAfter,
    playerStatus,
  };
}

/* ==========================================
   Start First/Next Poker Hand
========================================== */

async function startPokerHandInTransaction(tableId, connection) {
  const [tableRows] = await connection.query(
    `
        SELECT
          id,
          table_status,
          current_hand_number,
          dealer_seat_no,
          small_blind,
          big_blind,
          service_charge_percent
        FROM poker_tables
        WHERE id = ?
        LIMIT 1
        FOR UPDATE
      `,
    [tableId],
  );

  const table = tableRows[0] || null;

  if (!table) {
    throw createServiceError(
      "Poker table was not found while starting the hand.",
      404,
    );
  }

  const [players] = await connection.query(
    `
        SELECT
          id,
          user_id,
          bot_id,
          is_bot,
          seat_no,
          player_status,
          stack_amount
        FROM poker_table_players
        WHERE table_id = ?
          AND player_status =
              'active'
          AND stack_amount > 0
        ORDER BY seat_no ASC
        FOR UPDATE
      `,
    [tableId],
  );

  if (players.length < 2) {
    throw createServiceError("At least two funded players are required.", 409);
  }

  const previousDealerSeat = Number(table.dealer_seat_no || 0);

  const dealer = getNextSeatPlayer(players, previousDealerSeat);

  const smallBlindPlayer =
    players.length === 2 ? dealer : getNextSeatPlayer(players, dealer.seat_no);

  const bigBlindPlayer = getNextSeatPlayer(players, smallBlindPlayer.seat_no);

  const firstTurnPlayer =
    players.length === 2
      ? dealer
      : getNextSeatPlayer(players, bigBlindPlayer.seat_no);

  if (!dealer || !smallBlindPlayer || !bigBlindPlayer || !firstTurnPlayer) {
    throw createServiceError("Unable to assign Poker positions.", 409);
  }

  const handNumber = Number(table.current_hand_number || 0) + 1;

  const deck = createShuffledDeck();

  const cardsByPlayer = dealHoleCards(
    deck,
    players.map((player) => Number(player.id)),
  );

  const [handResult] = await connection.query(
    `
        INSERT INTO poker_hands (
          table_id,
          hand_number,
          hand_status,
          dealer_player_id,
          small_blind_player_id,
          big_blind_player_id,
          current_turn_player_id,
          deck,
          community_cards,
          pot_amount,
          current_bet,
          minimum_raise,
          service_charge_percent,
          action_started_at,
          action_expires_at,
          settlement_completed,
          state_version,
          started_at
        )
        VALUES (
          ?,
          ?,
          'starting',
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          0.00,
          0.00,
          ?,
          ?,
          NOW(),
          DATE_ADD(
            NOW(),
            INTERVAL 15 SECOND
          ),
          0,
          1,
          NOW()
        )
      `,
    [
      tableId,
      handNumber,
      Number(dealer.id),
      Number(smallBlindPlayer.id),
      Number(bigBlindPlayer.id),
      Number(firstTurnPlayer.id),
      JSON.stringify(deck),
      JSON.stringify([]),
      Number(table.big_blind),
      Number(table.service_charge_percent || 5),
    ],
  );

  const handId = Number(handResult.insertId);

  const handPlayerIds = new Map();

  for (const player of players) {
    const isDealer = Number(player.id) === Number(dealer.id);

    const isSmallBlind = Number(player.id) === Number(smallBlindPlayer.id);

    const isBigBlind = Number(player.id) === Number(bigBlindPlayer.id);

    const [result] = await connection.query(
      `
          INSERT INTO poker_hand_players (
            hand_id,
            table_player_id,
            seat_no,
            player_status,
            is_dealer,
            is_small_blind,
            is_big_blind,
            hole_cards,
            starting_stack,
            ending_stack,
            round_bet,
            total_contribution,
            has_acted
          )
          VALUES (
            ?,
            ?,
            ?,
            'active',
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            0.00,
            0.00,
            0
          )
        `,
      [
        handId,
        Number(player.id),
        Number(player.seat_no),
        isDealer ? 1 : 0,
        isSmallBlind ? 1 : 0,
        isBigBlind ? 1 : 0,
        JSON.stringify(cardsByPlayer.get(Number(player.id))),
        Number(player.stack_amount),
        Number(player.stack_amount),
      ],
    );

    handPlayerIds.set(Number(player.id), Number(result.insertId));
  }

  const smallBlindResult = await postBlind(
    {
      handId,

      handPlayerId: handPlayerIds.get(Number(smallBlindPlayer.id)),

      tablePlayer: smallBlindPlayer,

      actionSequence: 1,

      actionType: "small_blind",

      blindAmount: Number(table.small_blind),

      potBefore: 0,
    },
    connection,
  );

  const bigBlindResult = await postBlind(
    {
      handId,

      handPlayerId: handPlayerIds.get(Number(bigBlindPlayer.id)),

      tablePlayer: bigBlindPlayer,

      actionSequence: 2,

      actionType: "big_blind",

      blindAmount: Number(table.big_blind),

      potBefore: smallBlindResult.contribution,
    },
    connection,
  );

  const potAmount = Number(
    (smallBlindResult.contribution + bigBlindResult.contribution).toFixed(2),
  );

  const currentBet = Math.max(
    smallBlindResult.contribution,
    bigBlindResult.contribution,
  );

  await connection.query(
    `
      UPDATE poker_hands
      SET
        hand_status = 'preflop',
        pot_amount = ?,
        current_bet = ?,
        minimum_raise = ?,
        current_turn_player_id = ?,
        action_started_at = NOW(),
        action_expires_at =
          DATE_ADD(
            NOW(),
            INTERVAL 15 SECOND
          ),
        state_version =
          state_version + 1
      WHERE id = ?
  AND hand_status IN (
      'starting',
      'playing'
  )
    `,
    [
      potAmount,
      currentBet,
      Number(table.big_blind),
      Number(firstTurnPlayer.id),
      handId,
    ],
  );

  const [tableUpdateResult] = await connection.query(
    `
      UPDATE poker_tables
      SET
        table_status =
          'playing',

        current_hand_number = ?,

        dealer_seat_no = ?,

        state_version =
          state_version + 1

      WHERE id = ?
        AND table_status IN (
          'starting',
          'playing'
        )
    `,
    [handNumber, Number(dealer.seat_no), tableId],
  );

  if (Number(tableUpdateResult.affectedRows) !== 1) {
    throw createServiceError(
      "Unable to update the Poker table for the new hand.",
      409,
    );
  }

  await connection.query(
    `
      UPDATE poker_table_players
      SET hands_played =
            hands_played + 1
      WHERE table_id = ?
        AND player_status =
            'active'
    `,
    [tableId],
  );

  /*
   * এই hand-এ অংশ নেওয়া bot-এর
   * lifetime hand count update।
   */
  await connection.query(
    `
    UPDATE poker_bots pb

    INNER JOIN poker_table_players ptp
      ON ptp.bot_id = pb.id
      AND ptp.is_bot = 1

    INNER JOIN poker_hand_players php
      ON php.table_player_id = ptp.id
      AND php.hand_id = ?

    SET
      pb.total_hands =
        pb.total_hands + 1
  `,
    [handId],
  );

  return {
    handId,
    handNumber,

    dealerPlayerId: Number(dealer.id),

    smallBlindPlayerId: Number(smallBlindPlayer.id),

    bigBlindPlayerId: Number(bigBlindPlayer.id),

    currentTurnPlayerId: Number(firstTurnPlayer.id),

    potAmount,
    currentBet,
  };
}

async function preparePokerPlayersForNextHand(table, connection) {
  const tableId = Number(table.id);

  const minimumBuyIn = Number(table.minimum_buy_in);

  /* ========================================
     REAL PLAYER AUTO REBUY
  ======================================== */

  const [bustedRealRows] = await connection.query(
    `
        SELECT
          ptp.id,
          ptp.user_id,
          ptp.stack_amount,
          u.wallet_balance

        FROM poker_table_players ptp

        INNER JOIN users u
          ON u.id =
             ptp.user_id

        WHERE ptp.table_id = ?
          AND ptp.is_bot = 0
          AND ptp.player_status IN (
            'active',
            'sitting_out'
          )
          AND ptp.stack_amount <= 0
          AND ptp.cash_out_credited = 0

        ORDER BY ptp.id
        FOR UPDATE
      `,
    [tableId],
  );

  const autoRebuyUserIds = [];

  for (const bustedPlayer of bustedRealRows) {
    const walletBalance = Number(bustedPlayer.wallet_balance || 0);

    if (walletBalance >= minimumBuyIn) {
      const lockedUser = await getLockedUser(
        Number(bustedPlayer.user_id),
        connection,
      );

      await debitPokerBuyIn(lockedUser, tableId, minimumBuyIn, connection);

      const [rebuyResult] = await connection.query(
        `
            UPDATE poker_table_players
            SET
              player_status =
                'active',

              stack_amount = ?,

              total_buy_in =
                total_buy_in + ?,

              wallet_debited = 1

            WHERE id = ?
              AND stack_amount <= 0
              AND cash_out_credited = 0
          `,
        [minimumBuyIn, minimumBuyIn, Number(bustedPlayer.id)],
      );

      if (Number(rebuyResult.affectedRows) !== 1) {
        throw createServiceError(
          "Poker real-player auto rebuy state changed.",
          409,
        );
      }

      autoRebuyUserIds.push(Number(bustedPlayer.user_id));
    } else {
      await connection.query(
        `
          UPDATE poker_table_players
          SET
            player_status =
              'sitting_out'
          WHERE id = ?
            AND stack_amount <= 0
            AND cash_out_credited = 0
        `,
        [Number(bustedPlayer.id)],
      );
    }
  }

  /* ========================================
     FUNDED REAL PLAYER COUNT
  ======================================== */

  const [fundedRealRows] = await connection.query(
    `
        SELECT COUNT(*) AS total
        FROM poker_table_players
        WHERE table_id = ?
          AND is_bot = 0
          AND player_status =
              'active'
          AND stack_amount > 0
        FOR UPDATE
      `,
    [tableId],
  );

  const fundedRealPlayers = Number(fundedRealRows[0]?.total || 0);

  /* ========================================
     SAME BOT AUTO REBUY
  ======================================== */

  const [bustedBotRows] = await connection.query(
    `
        SELECT
          ptp.id,
          ptp.bot_id,
          ptp.stack_amount,

          pb.wallet_balance,
          pb.status

        FROM poker_table_players ptp

        INNER JOIN poker_bots pb
          ON pb.id =
             ptp.bot_id

        WHERE ptp.table_id = ?
          AND ptp.is_bot = 1
          AND ptp.player_status IN (
            'active',
            'sitting_out'
          )
          AND ptp.stack_amount <= 0
          AND ptp.cash_out_credited = 0

        ORDER BY ptp.id
        FOR UPDATE
      `,
    [tableId],
  );

  const autoRebuyBotIds = [];

  for (const bustedBot of bustedBotRows) {
    const botWalletBalance = Number(bustedBot.wallet_balance || 0);

    const botCanRebuy =
      fundedRealPlayers > 0 &&
      bustedBot.status === "active" &&
      botWalletBalance >= minimumBuyIn;

    if (!botCanRebuy) {
      await connection.query(
        `
          UPDATE poker_table_players
          SET
            player_status =
              'sitting_out'
          WHERE id = ?
            AND stack_amount <= 0
            AND cash_out_credited = 0
        `,
        [Number(bustedBot.id)],
      );

      continue;
    }

    const [botWalletResult] = await connection.query(
      `
          UPDATE poker_bots
          SET
            wallet_balance =
              wallet_balance - ?,

            total_wagered =
              total_wagered + ?

          WHERE id = ?
            AND status =
                'active'
            AND wallet_balance >= ?
        `,
      [minimumBuyIn, minimumBuyIn, Number(bustedBot.bot_id), minimumBuyIn],
    );

    if (Number(botWalletResult.affectedRows) !== 1) {
      throw createServiceError("Unable to debit Poker bot auto rebuy.", 409);
    }

    /*
     * নতুন bot row INSERT নয়।
     * একই bot একই table-player row এবং
     * একই seat-এ rebuy করবে।
     */
    const [botRebuyResult] = await connection.query(
      `
          UPDATE poker_table_players
          SET
            player_status =
              'active',

            stack_amount = ?,

            total_buy_in =
              total_buy_in + ?,

            wallet_debited = 1

          WHERE id = ?
            AND is_bot = 1
            AND stack_amount <= 0
            AND cash_out_credited = 0
        `,
      [minimumBuyIn, minimumBuyIn, Number(bustedBot.id)],
    );

    if (Number(botRebuyResult.affectedRows) !== 1) {
      throw createServiceError("Poker bot auto rebuy state changed.", 409);
    }

    autoRebuyBotIds.push(Number(bustedBot.bot_id));
  }

  /* ========================================
     TABLE PLAYER COUNT
  ======================================== */

  const [countRows] = await connection.query(
    `
        SELECT COUNT(*) AS total
        FROM poker_table_players
        WHERE table_id = ?
          AND player_status !=
              'left'
      `,
    [tableId],
  );

  const totalPlayers = Number(countRows[0]?.total || 0);

  await connection.query(
    `
      UPDATE poker_tables
      SET
        current_players = ?,

        state_version =
          state_version + 1

      WHERE id = ?
    `,
    [totalPlayers, tableId],
  );

  return {
    botJoined: false,
    joinedBotId: null,

    totalPlayers,

    autoRebuyUserIds,
    autoRebuyBotIds,
  };
}

async function startNextPokerHand(tableId) {
  const validTableId = parsePositiveInteger(tableId);

  if (!validTableId) {
    throw createServiceError("Invalid Poker table ID.", 400);
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [tableRows] = await connection.query(
      `
         SELECT
          id,
          room_id,
          table_status,
          current_hand_number,
          max_players,
          minimum_buy_in
          FROM poker_tables
          WHERE id = ?
          LIMIT 1
          FOR UPDATE
        `,
      [validTableId],
    );

    const table = tableRows[0] || null;

    if (!table) {
      throw createServiceError("Poker table was not found.", 404);
    }

    if (table.table_status !== "playing") {
      await connection.commit();

      return {
        skipped: true,
        reason: "table_not_playing",
      };
    }

    const [latestHandRows] = await connection.query(
      `
          SELECT
            id,
            hand_number,
            hand_status,
            settlement_completed
          FROM poker_hands
          WHERE table_id = ?
          ORDER BY id DESC
          LIMIT 1
          FOR UPDATE
        `,
      [validTableId],
    );

    const latestHand = latestHandRows[0] || null;

    if (
      latestHand &&
      (latestHand.hand_status !== "completed" ||
        !Boolean(latestHand.settlement_completed))
    ) {
      await connection.commit();

      return {
        skipped: true,
        reason: "previous_hand_not_completed",
      };
    }

    const preparation = await preparePokerPlayersForNextHand(table, connection);

    const [fundedRows] = await connection.query(
      `
          SELECT COUNT(*) AS total
          FROM poker_table_players
          WHERE table_id = ?
            AND player_status =
                'active'
            AND stack_amount > 0
        `,
      [validTableId],
    );

    const fundedPlayers = Number(fundedRows[0]?.total || 0);

    if (fundedPlayers < 2) {
      await connection.query(
        `
          UPDATE poker_tables
          SET
            table_status =
              'paused',

            state_version =
              state_version + 1

          WHERE id = ?
        `,
        [validTableId],
      );

      await connection.commit();

      return {
        skipped: true,
        reason: "not_enough_funded_players",
        preparation,
      };
    }

    const handResult = await startPokerHandInTransaction(
      validTableId,
      connection,
    );

    await connection.commit();

    return {
      success: true,
      skipped: false,
      preparation,
      ...handResult,
    };
  } catch (error) {
    await connection.rollback();

    throw error;
  } finally {
    connection.release();
  }
}

/* ==========================================
   Poker Player Action Engine
========================================== */

const ACTIVE_HAND_STATUSES = ["preflop", "flop", "turn", "river"];

const ALLOWED_POKER_ACTIONS = ["fold", "check", "call", "raise", "all_in"];

function parseJsonArray(value) {
  if (Array.isArray(value)) {
    return [...value];
  }

  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);

    return Array.isArray(parsed) ? parsed : [];
  } catch {
    throw createServiceError("Poker card state is invalid.", 500);
  }
}

function normalizePokerAction(value) {
  const action = String(value || "")
    .trim()
    .toLowerCase();

  if (!ALLOWED_POKER_ACTIONS.includes(action)) {
    throw createServiceError("Invalid Poker action.", 400);
  }

  return action;
}

function findNextActiveHandPlayer(players, currentSeatNo) {
  const activePlayers = players
    .filter(
      (player) =>
        player.player_status === "active" && Number(player.ending_stack) > 0,
    )
    .sort((first, second) => Number(first.seat_no) - Number(second.seat_no));

  if (activePlayers.length === 0) {
    return null;
  }

  return (
    activePlayers.find(
      (player) => Number(player.seat_no) > Number(currentSeatNo),
    ) || activePlayers[0]
  );
}

async function isPokerRaiseReopened(
  { handId, handStatus, handPlayerId, currentBet, minimumRaise },
  connection,
) {
  const [rows] = await connection.query(
    `
        SELECT
          current_bet_after
        FROM poker_hand_actions
        WHERE hand_id = ?
          AND hand_player_id = ?
          AND betting_round = ?
          AND action_type IN (
            'fold',
            'check',
            'call',
            'raise',
            'all_in'
          )
        ORDER BY action_sequence DESC
        LIMIT 1
      `,
    [Number(handId), Number(handPlayerId), handStatus],
  );

  const previousAction = rows[0] || null;

  /*
   * এই street-এ এখনো voluntary action
   * না করলে Raise সবসময় available।
   */
  if (!previousAction) {
    return true;
  }

  const betIncreaseSinceAction = Number(
    (
      Number(currentBet) - Number(previousAction.current_bet_after || 0)
    ).toFixed(2),
  );

  /*
   * এক বা একাধিক short all-in-এর
   * cumulative increase যদি full minimum
   * raise-এর সমান হয়, betting reopen হবে।
   */
  return betIncreaseSinceAction >= Number(minimumRaise);
}

async function getNextActionSequence(handId, connection) {
  const [rows] = await connection.query(
    `
      SELECT action_sequence
      FROM poker_hand_actions
      WHERE hand_id = ?
      ORDER BY action_sequence DESC
      LIMIT 1
      FOR UPDATE
    `,
    [handId],
  );

  return Number(rows[0]?.action_sequence || 0) + 1;
}

async function performPlayerAction({
  tableId,
  userId = null,
  actorTablePlayerId = null,
  actionType,
  amount = null,
  isAutomatic = false,
  isSystemAction = false,
}) {
  const validTableId = parsePositiveInteger(tableId);

  const validUserId = parsePositiveInteger(userId);

  const validActorTablePlayerId = parsePositiveInteger(actorTablePlayerId);

  const action = normalizePokerAction(actionType);

  if (!validTableId) {
    throw createServiceError("Invalid Poker table ID.", 400);
  }

  if (isSystemAction && !validActorTablePlayerId) {
    throw createServiceError(
      "System Poker action requires a valid table player.",
      400,
    );
  }

  if (!isSystemAction && !validUserId) {
    throw createServiceError("Poker user authentication is required.", 401);
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [handRows] = await connection.query(
      `
          SELECT
            ph.id,
            ph.table_id,
            ph.hand_number,
            ph.hand_status,
            ph.dealer_player_id,
            ph.current_turn_player_id,
            ph.pot_amount,
            ph.current_bet,
            ph.minimum_raise,
            ph.deck,
            ph.community_cards,
            pt.big_blind
          FROM poker_hands ph
          INNER JOIN poker_tables pt
            ON pt.id = ph.table_id
          WHERE ph.table_id = ?
            AND ph.hand_status IN (
              'preflop',
              'flop',
              'turn',
              'river'
            )
          ORDER BY ph.id DESC
          LIMIT 1
          FOR UPDATE
        `,
      [validTableId],
    );

    const hand = handRows[0] || null;

    if (!hand) {
      throw createServiceError("No active Poker hand was found.", 409);
    }

    const [actorRows] = await connection.query(
      `
      SELECT
        php.id AS hand_player_id,
        php.table_player_id,
        php.seat_no,
        php.player_status,
        php.ending_stack,
        php.round_bet,
        php.total_contribution,
        php.has_acted,
        ptp.user_id,
        ptp.bot_id,
        ptp.is_bot,
        ptp.stack_amount
      FROM poker_hand_players php
      INNER JOIN poker_table_players ptp
        ON ptp.id =
           php.table_player_id
      WHERE php.hand_id = ?
        AND (
          (
            ? = 1
            AND ptp.id = ?
          )
          OR
          (
            ? = 0
            AND ptp.user_id = ?
            AND ptp.is_bot = 0
          )
        )
      LIMIT 1
      FOR UPDATE
    `,
      [
        Number(hand.id),

        isSystemAction ? 1 : 0,

        validActorTablePlayerId || 0,

        isSystemAction ? 1 : 0,

        validUserId || 0,
      ],
    );

    const actor = actorRows[0] || null;

    if (!actor) {
      throw createServiceError(
        isSystemAction
          ? "Automatic Poker actor was not found."
          : "You are not a player in this Poker hand.",
        isSystemAction ? 409 : 403,
      );
    }

    if (Number(hand.current_turn_player_id) !== Number(actor.table_player_id)) {
      throw createServiceError("It is not your Poker turn.", 409);
    }

    if (actor.player_status !== "active") {
      throw createServiceError("This player cannot take another action.", 409);
    }

    const stackBefore = Number(actor.stack_amount);

    const roundBetBefore = Number(actor.round_bet);

    const currentBetBefore = Number(hand.current_bet);

    const potBefore = Number(hand.pot_amount);

    const callAmount = Number(
      Math.max(currentBetBefore - roundBetBefore, 0).toFixed(2),
    );

    const raiseReopened = await isPokerRaiseReopened(
      {
        handId: Number(hand.id),

        handStatus: hand.hand_status,

        handPlayerId: Number(actor.hand_player_id),

        currentBet: currentBetBefore,

        minimumRaise: Number(hand.minimum_raise),
      },
      connection,
    );

    let contribution = 0;
    let newCurrentBet = currentBetBefore;
    let newMinimumRaise = Number(hand.minimum_raise);
    let playerStatus = "active";
    let recordedAction = action;
    let raisedBet = false;

    if (action === "fold") {
      playerStatus = "folded";
    }

    if (action === "check") {
      if (callAmount > 0) {
        throw createServiceError(
          `You must call ৳${callAmount.toFixed(2)} or fold.`,
          409,
        );
      }
    }

    if (action === "call") {
      if (callAmount <= 0) {
        throw createServiceError("Nothing to call. Use check.", 409);
      }

      contribution = Number(Math.min(callAmount, stackBefore).toFixed(2));

      if (contribution === stackBefore) {
        playerStatus = "all_in";
        recordedAction = "all_in";
      }
    }

    if (action === "raise") {
      if (!raiseReopened) {
        throw createServiceError("A short all-in did not reopen raising.", 409);
      }
      const raiseTo = parsePositiveMoney(amount);

      const maximumRaiseTo = Number((roundBetBefore + stackBefore).toFixed(2));

      const minimumRaiseTo = Number(
        (currentBetBefore + Number(hand.minimum_raise)).toFixed(2),
      );

      if (!raiseTo) {
        throw createServiceError("A valid raise amount is required.", 400);
      }

      if (raiseTo <= currentBetBefore) {
        throw createServiceError(
          "Raise must be higher than the current bet.",
          409,
        );
      }

      if (raiseTo > maximumRaiseTo) {
        throw createServiceError("Raise exceeds the available stack.", 409);
      }

      const isFullStack = raiseTo === maximumRaiseTo;

      if (raiseTo < minimumRaiseTo && !isFullStack) {
        throw createServiceError(
          `Minimum raise-to amount is ৳${minimumRaiseTo.toFixed(2)}.`,
          409,
        );
      }

      contribution = Number((raiseTo - roundBetBefore).toFixed(2));

      const raiseSize = Number((raiseTo - currentBetBefore).toFixed(2));

      if (raiseSize >= Number(hand.minimum_raise)) {
        newMinimumRaise = raiseSize;
      }

      newCurrentBet = raiseTo;
      raisedBet = true;

      if (contribution === stackBefore) {
        playerStatus = "all_in";
        recordedAction = "all_in";
      }
    }

    if (action === "all_in") {
      if (stackBefore <= 0) {
        throw createServiceError("No stack is available for all-in.", 409);
      }

      contribution = stackBefore;
      playerStatus = "all_in";

      const allInBet = Number((roundBetBefore + contribution).toFixed(2));

      if (allInBet > currentBetBefore && !raiseReopened) {
        throw createServiceError("A short all-in did not reopen raising.", 409);
      }

      if (allInBet > currentBetBefore) {
        const raiseSize = Number((allInBet - currentBetBefore).toFixed(2));

        if (raiseSize >= Number(hand.minimum_raise)) {
          newMinimumRaise = raiseSize;
        }

        newCurrentBet = allInBet;
        raisedBet = true;
      }
    }

    const stackAfter = Number((stackBefore - contribution).toFixed(2));

    const roundBetAfter = Number((roundBetBefore + contribution).toFixed(2));

    const totalContributionAfter = Number(
      (Number(actor.total_contribution) + contribution).toFixed(2),
    );

    const potAfter = Number((potBefore + contribution).toFixed(2));

    const [stackUpdateResult] = await connection.query(
      `
          UPDATE poker_table_players
          SET stack_amount = ?
          WHERE id = ?
            AND stack_amount = ?
        `,
      [stackAfter, Number(actor.table_player_id), stackBefore],
    );

    if (Number(stackUpdateResult.affectedRows) !== 1) {
      throw createServiceError(
        "Poker stack changed before the action completed.",
        409,
      );
    }

    if (
  contribution > 0 &&
  Number(actor.is_bot) === 0
) {
  await addPokerTurnover(
    actor.user_id,
    contribution,
    connection,
  );
}

    if (raisedBet) {
      await connection.query(
        `
          UPDATE poker_hand_players
          SET has_acted = 0
          WHERE hand_id = ?
            AND id != ?
            AND player_status = 'active'
        `,
        [Number(hand.id), Number(actor.hand_player_id)],
      );
    }

    await connection.query(
      `
        UPDATE poker_hand_players
        SET
          player_status = ?,
          ending_stack = ?,
          round_bet = ?,
          total_contribution = ?,
          has_acted = 1,
          last_action = ?
        WHERE id = ?
      `,
      [
        playerStatus,
        stackAfter,
        roundBetAfter,
        totalContributionAfter,
        recordedAction,
        Number(actor.hand_player_id),
      ],
    );

    const actionSequence = await getNextActionSequence(
      Number(hand.id),
      connection,
    );

    await connection.query(
      `
        INSERT INTO poker_hand_actions (
          hand_id,
          hand_player_id,
          action_sequence,
          betting_round,
          action_type,
          action_amount,
          contribution_amount,
          stack_before,
          stack_after,
          current_bet_after,
          pot_after,
          is_automatic
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        Number(hand.id),
        Number(actor.hand_player_id),
        actionSequence,
        hand.hand_status,
        recordedAction,
        contribution,
        contribution,
        stackBefore,
        stackAfter,
        newCurrentBet,
        potAfter,
        isAutomatic ? 1 : 0,
      ],
    );

    const [playerRows] = await connection.query(
      `
          SELECT
            id,
            table_player_id,
            seat_no,
            player_status,
            ending_stack,
            round_bet,
            has_acted
          FROM poker_hand_players
          WHERE hand_id = ?
          ORDER BY seat_no
          FOR UPDATE
        `,
      [Number(hand.id)],
    );

    const contenders = playerRows.filter(
      (player) =>
        player.player_status === "active" || player.player_status === "all_in",
    );

    const activePlayers = playerRows.filter(
      (player) =>
        player.player_status === "active" && Number(player.ending_stack) > 0,
    );

    const bettingRoundComplete =
      contenders.length > 1 &&
      activePlayers.every(
        (player) =>
          Boolean(player.has_acted) &&
          Number(player.round_bet) >= newCurrentBet,
      );

    let finalHandStatus = hand.hand_status;

    let finalCurrentBet = newCurrentBet;

    let finalMinimumRaise = newMinimumRaise;

    let nextPlayer = null;
    let handNeedsShowdown = false;

    let deck = parseJsonArray(hand.deck);

    let communityCards = parseJsonArray(hand.community_cards);

    const dealtStreets = [];

    if (contenders.length <= 1) {
      /*
       * সবাই fold করেছে।
       * অবশিষ্ট player winner হবে।
       */
      finalHandStatus = "showdown";

      handNeedsShowdown = true;
    } else if (bettingRoundComplete) {
      /*
       * নতুন street শুরু হওয়ার আগে
       * round-specific bet reset।
       */
      await connection.query(
        `
          UPDATE poker_hand_players
          SET
            round_bet = 0.00,
            has_acted = 0
          WHERE hand_id = ?
            AND player_status = 'active'
        `,
        [Number(hand.id)],
      );

      finalCurrentBet = 0;
      finalMinimumRaise = Number(hand.big_blind);

      const streetOrder = ["preflop", "flop", "turn", "river"];

      let streetIndex = streetOrder.indexOf(hand.hand_status);

      if (streetIndex === -1) {
        throw createServiceError("Invalid Poker betting round.", 500);
      }

      /*
       * যদি দুই বা তার বেশি player action নিতে পারে,
       * শুধু পরের একটি street deal হবে।
       *
       * যদি বাকিরা all-in হয়, অবশিষ্ট পুরো board
       * server একসঙ্গে run-out করবে।
       */
      const runOutBoard = activePlayers.length <= 1;

      do {
        if (streetOrder[streetIndex] === "river") {
          finalHandStatus = "showdown";

          handNeedsShowdown = true;

          break;
        }

        streetIndex += 1;

        const nextStreet = streetOrder[streetIndex];

        const dealResult = dealCommunityStreet(
          deck,
          communityCards,
          nextStreet,
        );

        deck = dealResult.deck;

        communityCards = dealResult.communityCards;

        dealtStreets.push({
          street: nextStreet,
          burnedCard: dealResult.burnedCard,
          cards: dealResult.dealtCards,
        });

        finalHandStatus = nextStreet;

        if (!runOutBoard) {
          break;
        }
      } while (finalHandStatus !== "river");

      if (runOutBoard && communityCards.length === 5) {
        finalHandStatus = "showdown";

        handNeedsShowdown = true;
      }

      if (!handNeedsShowdown) {
        const dealerPlayer = playerRows.find(
          (player) =>
            Number(player.table_player_id) === Number(hand.dealer_player_id),
        );

        if (!dealerPlayer) {
          throw createServiceError("Poker dealer was not found.", 500);
        }

        /*
         * Flop/Turn/River-এ dealer-এর
         * বাঁ পাশের active player প্রথম।
         */
        nextPlayer = findNextActiveHandPlayer(
          playerRows,
          Number(dealerPlayer.seat_no),
        );

        if (!nextPlayer) {
          finalHandStatus = "showdown";

          handNeedsShowdown = true;
        }
      }
    } else {
      nextPlayer = findNextActiveHandPlayer(playerRows, Number(actor.seat_no));

      if (!nextPlayer) {
        finalHandStatus = "showdown";

        handNeedsShowdown = true;
      }
    }

    const nextTurnPlayerId = nextPlayer
      ? Number(nextPlayer.table_player_id)
      : null;

    await connection.query(
      `
        UPDATE poker_hands
        SET
          hand_status = ?,
          current_turn_player_id = ?,
          deck = ?,
          community_cards = ?,
          pot_amount = ?,
          current_bet = ?,
          minimum_raise = ?,
          action_started_at =
            CASE
              WHEN ? IS NULL
              THEN NULL
              ELSE NOW()
            END,
          action_expires_at =
            CASE
              WHEN ? IS NULL
              THEN NULL
              ELSE DATE_ADD(
                NOW(),
                INTERVAL 15 SECOND
              )
            END,
          state_version =
            state_version + 1
        WHERE id = ?
      `,
      [
        finalHandStatus,
        nextTurnPlayerId,
        JSON.stringify(deck),
        JSON.stringify(communityCards),
        potAfter,
        finalCurrentBet,
        finalMinimumRaise,
        nextTurnPlayerId,
        nextTurnPlayerId,
        Number(hand.id),
      ],
    );

    await connection.commit();

    return {
      success: true,

      tableId: validTableId,

      handId: Number(hand.id),

      handNumber: Number(hand.hand_number),

      bettingRound: finalHandStatus,

      action: recordedAction,

      actionSequence,

      actorTablePlayerId: Number(actor.table_player_id),

      contribution,

      stackBefore,

      stackAfter,

      roundBetAfter,

      potAmount: potAfter,

      currentBet: finalCurrentBet,

      minimumRaise: finalMinimumRaise,

      nextTurnPlayerId,

      bettingRoundComplete,

      communityCards,

      dealtStreets,

      handNeedsShowdown,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/* ==========================================
   Poker Bot + Timeout Action
========================================== */

async function getCurrentPokerTurn(tableId) {
  const validTableId = parsePositiveInteger(tableId);

  if (!validTableId) {
    throw createServiceError("Invalid Poker table ID.", 400);
  }

  const [rows] = await pool.query(
    `
        SELECT
          ph.id AS hand_id,
          ph.hand_status,
          ph.current_turn_player_id,
          ph.current_bet,
          ph.minimum_raise,
          ph.action_expires_at,

          ph.community_cards,
          ph.pot_amount,

          php.hole_cards,

          pb.difficulty,
          pb.playing_style,

         (
  SELECT COUNT(*)
  FROM poker_hand_players contender
  WHERE contender.hand_id =
      ph.id
    AND contender.player_status IN (
      'active',
      'all_in'
    )
) AS contender_count,

          php.id AS hand_player_id,
          php.table_player_id,
          php.player_status,
          php.ending_stack,
          php.round_bet,

          ptp.user_id,
          ptp.bot_id,
          ptp.is_bot,
          ptp.stack_amount

        FROM poker_hands ph

        INNER JOIN poker_hand_players php
          ON php.hand_id =
             ph.id
          AND php.table_player_id =
              ph.current_turn_player_id

        INNER JOIN poker_table_players ptp
          ON ptp.id =
             php.table_player_id

             LEFT JOIN poker_bots pb
              ON pb.id = ptp.bot_id
              AND ptp.is_bot = 1

        WHERE ph.table_id = ?
          AND ph.hand_status IN (
            'preflop',
            'flop',
            'turn',
            'river'
          )

        ORDER BY ph.id DESC
        LIMIT 1
      `,
    [validTableId],
  );

  const turn = rows[0] || null;

  if (!turn) {
    return null;
  }

  const stackAmount = Number(turn.stack_amount);

  const roundBet = Number(turn.round_bet);

  const currentBet = Number(turn.current_bet);

  const callAmount = Number(Math.max(currentBet - roundBet, 0).toFixed(2));

  const maximumRaiseTo = Number((roundBet + stackAmount).toFixed(2));

  const minimumRaiseTo = Number(
    (currentBet + Number(turn.minimum_raise)).toFixed(2),
  );

  const raiseReopened = await isPokerRaiseReopened(
    {
      handId: Number(turn.hand_id),

      handStatus: turn.hand_status,

      handPlayerId: Number(turn.hand_player_id),

      currentBet,

      minimumRaise: Number(turn.minimum_raise),
    },
    pool,
  );

  return {
    tableId: validTableId,

    handId: Number(turn.hand_id),

    handStatus: turn.hand_status,

    tablePlayerId: Number(turn.table_player_id),

    isBot: Boolean(turn.is_bot),

    userId: turn.user_id ? Number(turn.user_id) : null,

    botId: turn.bot_id ? Number(turn.bot_id) : null,

    stackAmount,

    roundBet,

    currentBet,

    callAmount,

    minimumRaise: Number(turn.minimum_raise),

    minimumRaiseTo,

    maximumRaiseTo,

    actionExpiresAt: turn.action_expires_at,

    potAmount: Number(turn.pot_amount || 0),

    holeCards: parseJsonArray(turn.hole_cards),

    communityCards: parseJsonArray(turn.community_cards),

    contenderCount: Math.max(Number(turn.contender_count || 2), 2),

    difficulty: String(turn.difficulty || "normal"),

    playingStyle: String(turn.playing_style || "balanced"),

    raiseReopened: Boolean(raiseReopened),
  };
}

/* ==========================================
   Poker Settlement Helpers
========================================== */

function roundPokerMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function splitPokerMoney(amount, winnerIds) {
  const validWinnerIds = [...new Set(winnerIds.map(Number))].sort(
    (first, second) => first - second,
  );

  if (validWinnerIds.length === 0) {
    throw createServiceError("Poker prize has no winner.", 500);
  }

  const totalCents = Math.round(Number(amount) * 100);

  const baseCents = Math.floor(totalCents / validWinnerIds.length);

  let remainingCents = totalCents - baseCents * validWinnerIds.length;

  return validWinnerIds.map((handPlayerId) => {
    const extraCent = remainingCents > 0 ? 1 : 0;

    if (remainingCents > 0) {
      remainingCents -= 1;
    }

    return {
      handPlayerId,

      amount: (baseCents + extraCent) / 100,
    };
  });
}

function buildPokerPotLayers(players) {
  const contributors = players.filter(
    (player) => Number(player.total_contribution) > 0,
  );

  const contributionLevels = [
    ...new Set(
      contributors.map((player) => roundPokerMoney(player.total_contribution)),
    ),
  ]
    .filter((amount) => amount > 0)
    .sort((first, second) => first - second);

  const pots = [];

  let previousLevel = 0;

  for (const level of contributionLevels) {
    const layerContributors = contributors.filter(
      (player) => Number(player.total_contribution) >= level,
    );

    const layerAmount = roundPokerMoney(
      (level - previousLevel) * layerContributors.length,
    );

    if (layerAmount <= 0) {
      previousLevel = level;

      continue;
    }

    const eligiblePlayers = layerContributors.filter(
      (player) =>
        player.player_status !== "folded" && player.player_status !== "left",
    );

    pots.push({
      potNumber: pots.length + 1,

      potType: pots.length === 0 ? "main" : "side",

      contributionCap: level,

      grossAmount: layerAmount,

      contributors: layerContributors,

      eligiblePlayers,

      /*
       * একটি player একাই অতিরিক্ত bet করলে
       * সেটি uncalled bet—refund হবে।
       */
      isRefund: layerContributors.length === 1,
    });

    previousLevel = level;
  }

  return pots;
}

function getPokerPotWinners(pot, evaluations) {
  if (pot.isRefund) {
    return [pot.contributors[0]];
  }

  if (pot.eligiblePlayers.length === 0) {
    throw createServiceError("Poker side pot has no eligible player.", 500);
  }

  if (pot.eligiblePlayers.length === 1) {
    return [pot.eligiblePlayers[0]];
  }

  let highestScore = -1;

  const winners = [];

  for (const player of pot.eligiblePlayers) {
    const evaluation = evaluations.get(Number(player.id));

    if (!evaluation) {
      throw createServiceError("Poker hand evaluation is missing.", 500);
    }

    if (evaluation.score > highestScore) {
      highestScore = evaluation.score;

      winners.length = 0;

      winners.push(player);
    } else if (evaluation.score === highestScore) {
      winners.push(player);
    }
  }

  return winners;
}

async function settlePokerHand(tableId) {
  const validTableId = parsePositiveInteger(tableId);

  if (!validTableId) {
    throw createServiceError("Invalid Poker table ID.", 400);
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [handRows] = await connection.query(
      `
          SELECT
            id,
            table_id,
            hand_number,
            hand_status,
            community_cards,
            pot_amount,
            service_charge_percent,
            settlement_completed
          FROM poker_hands
          WHERE table_id = ?
          ORDER BY id DESC
          LIMIT 1
          FOR UPDATE
        `,
      [validTableId],
    );

    const hand = handRows[0] || null;

    if (!hand) {
      throw createServiceError("Poker hand was not found.", 404);
    }

    if (Boolean(hand.settlement_completed)) {
      await connection.commit();

      return {
        success: true,
        alreadySettled: true,
        tableId: validTableId,
        handId: Number(hand.id),
      };
    }

    if (hand.hand_status !== "showdown") {
      throw createServiceError("Poker hand is not ready for settlement.", 409);
    }

    const [players] = await connection.query(
      `
          SELECT
            php.id,
            php.hand_id,
            php.table_player_id,
            php.seat_no,
            php.player_status,
            php.hole_cards,
            php.ending_stack,
            php.total_contribution,
            php.prize_amount,

            ptp.user_id,
            ptp.bot_id,
            ptp.is_bot,
            ptp.stack_amount

          FROM poker_hand_players php

          INNER JOIN poker_table_players ptp
            ON ptp.id =
               php.table_player_id

          WHERE php.hand_id = ?

          ORDER BY php.seat_no
          FOR UPDATE
        `,
      [Number(hand.id)],
    );

    const contenders = players.filter(
      (player) =>
        player.player_status !== "folded" && player.player_status !== "left",
    );

    if (contenders.length === 0) {
      throw createServiceError("Poker hand has no remaining player.", 500);
    }

    const communityCards = parseJsonArray(hand.community_cards);

    const evaluations = new Map();

    if (contenders.length === 1) {
      /*
       * সবাই fold করলে board complete
       * হওয়ার প্রয়োজন নেই।
       */
      evaluations.set(Number(contenders[0].id), {
        score: 0,
        name: "Won by Fold",
        cards: [],
      });
    } else {
      if (communityCards.length !== 5) {
        throw createServiceError(
          "Showdown requires five community cards.",
          500,
        );
      }

      for (const player of contenders) {
        const holeCards = parseJsonArray(player.hole_cards);

        const evaluation = evaluateHoldemHand(holeCards, communityCards);

        evaluations.set(Number(player.id), evaluation);

        await connection.query(
          `
            UPDATE poker_hand_players
            SET
              hand_rank_value = ?,
              hand_rank_name = ?
            WHERE id = ?
          `,
          [Number(evaluation.score), evaluation.name, Number(player.id)],
        );
      }
    }

    const pots = buildPokerPotLayers(players);

    if (pots.length === 0) {
      throw createServiceError("Poker pot is empty.", 500);
    }

    const servicePercent = Number(hand.service_charge_percent || 5);

    let totalGross = 0;
    let totalServiceCharge = 0;
    let totalDistributable = 0;

    const stackBalances = new Map(
      players.map((player) => [Number(player.id), Number(player.stack_amount)]),
    );

    const winnerSummary = new Map();

    for (const pot of pots) {
      const grossAmount = roundPokerMoney(pot.grossAmount);

      const serviceCharge = pot.isRefund
        ? 0
        : roundPokerMoney(grossAmount * (servicePercent / 100));

      const distributableAmount = roundPokerMoney(grossAmount - serviceCharge);

      totalGross = roundPokerMoney(totalGross + grossAmount);

      totalServiceCharge = roundPokerMoney(totalServiceCharge + serviceCharge);

      totalDistributable = roundPokerMoney(
        totalDistributable + distributableAmount,
      );

      const [potResult] = await connection.query(
        `
            INSERT INTO poker_side_pots (
              hand_id,
              pot_number,
              pot_type,
              gross_amount,
              service_charge_amount,
              distributable_amount,
              pot_status
            )
            VALUES (
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              'pending'
            )
          `,
        [
          Number(hand.id),
          Number(pot.potNumber),
          pot.potType,
          grossAmount,
          serviceCharge,
          distributableAmount,
        ],
      );

      const sidePotId = Number(potResult.insertId);

      for (const contributor of pot.contributors) {
        const isEligible = pot.eligiblePlayers.some(
          (player) => Number(player.id) === Number(contributor.id),
        );

        await connection.query(
          `
            INSERT INTO poker_side_pot_players (
              side_pot_id,
              hand_player_id,
              is_eligible,
              contribution_cap
            )
            VALUES (?, ?, ?, ?)
          `,
          [
            sidePotId,
            Number(contributor.id),
            isEligible ? 1 : 0,
            Number(pot.contributionCap),
          ],
        );
      }

      const potWinners = getPokerPotWinners(pot, evaluations);

      const prizeShares = splitPokerMoney(
        distributableAmount,
        potWinners.map((winner) => Number(winner.id)),
      );

      const grossShares = splitPokerMoney(
        grossAmount,
        potWinners.map((winner) => Number(winner.id)),
      );

      for (const prizeShare of prizeShares) {
        const winner = potWinners.find(
          (player) => Number(player.id) === Number(prizeShare.handPlayerId),
        );

        const grossShare = grossShares.find(
          (share) =>
            Number(share.handPlayerId) === Number(prizeShare.handPlayerId),
        );

        const evaluation = evaluations.get(Number(winner.id)) || null;

        const stackBeforePrize = Number(
          stackBalances.get(Number(winner.id)) || 0,
        );

        const stackAfterPrize = roundPokerMoney(
          stackBeforePrize + prizeShare.amount,
        );

        stackBalances.set(Number(winner.id), stackAfterPrize);

        await connection.query(
          `
            UPDATE poker_table_players
            SET
              stack_amount =
                stack_amount + ?
            WHERE id = ?
          `,
          [prizeShare.amount, Number(winner.table_player_id)],
        );

        await connection.query(
          `
            UPDATE poker_hand_players
            SET
              ending_stack =
                ending_stack + ?,
              prize_amount =
                prize_amount + ?
            WHERE id = ?
          `,
          [prizeShare.amount, prizeShare.amount, Number(winner.id)],
        );

        const resultType = pot.isRefund
          ? "refund"
          : potWinners.length > 1
            ? "split_winner"
            : "winner";

        await connection.query(
          `
            INSERT INTO poker_hand_results (
              hand_id,
              side_pot_id,
              hand_player_id,
              result_type,
              hand_rank_value,
              hand_rank_name,
              gross_share,
              prize_amount,
              stack_before_prize,
              stack_after_prize
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
            Number(hand.id),
            sidePotId,
            Number(winner.id),
            resultType,

            evaluation ? Number(evaluation.score) : null,

            evaluation ? evaluation.name : null,

            Number(grossShare?.amount || 0),

            prizeShare.amount,

            stackBeforePrize,

            stackAfterPrize,
          ],
        );

        if (!pot.isRefund) {
          const summary = winnerSummary.get(Number(winner.id)) || {
            handPlayerId: Number(winner.id),

            tablePlayerId: Number(winner.table_player_id),

            seatNo: Number(winner.seat_no),

            isBot: Boolean(winner.is_bot),

            botId: winner.bot_id ? Number(winner.bot_id) : null,

            handRankName: evaluation?.name || "Won by Fold",

            holeCards: parseJsonArray(winner.hole_cards),

            prizeAmount: 0,
          };

          summary.prizeAmount = roundPokerMoney(
            summary.prizeAmount + prizeShare.amount,
          );

          winnerSummary.set(Number(winner.id), summary);
        }
      }

      await connection.query(
        `
          UPDATE poker_side_pots
          SET pot_status = ?
          WHERE id = ?
        `,
        [pot.isRefund ? "refunded" : "awarded", sidePotId],
      );
    }

    const winnerTablePlayerIds = [
      ...new Set(
        [...winnerSummary.values()].map((winner) =>
          Number(winner.tablePlayerId),
        ),
      ),
    ];

    /*
     * Refund bot win হিসেবে গণনা হবে না।
     * একই hand-এ একাধিক pot জিতলেও
     * total_wins শুধু একবার বাড়বে।
     */
    const winnerBotIds = [
      ...new Set(
        [...winnerSummary.values()]
          .filter((winner) => winner.isBot && winner.botId)
          .map((winner) => Number(winner.botId)),
      ),
    ];

    if (winnerBotIds.length > 0) {
      const placeholders = winnerBotIds.map(() => "?").join(",");

      await connection.query(
        `
      UPDATE poker_bots
      SET
        total_wins =
          total_wins + 1
      WHERE id IN (
        ${placeholders}
      )
    `,
        winnerBotIds,
      );
    }

    if (winnerTablePlayerIds.length > 0) {
      const placeholders = winnerTablePlayerIds.map(() => "?").join(",");

      await connection.query(
        `
          UPDATE poker_table_players
          SET hands_won =
                hands_won + 1
          WHERE id IN (
            ${placeholders}
          )
        `,
        winnerTablePlayerIds,
      );
    }

    await connection.query(
      `
        UPDATE poker_hands
        SET
          hand_status =
            'completed',

          current_turn_player_id =
            NULL,

          service_charge_amount = ?,

          distributable_amount = ?,

          settlement_completed = 1,

          action_started_at =
            NULL,

          action_expires_at =
            NULL,

          completed_at =
            NOW(),

          state_version =
            state_version + 1

        WHERE id = ?
          AND settlement_completed = 0
      `,
      [totalServiceCharge, totalDistributable, Number(hand.id)],
    );

   await connection.commit();

/*
 * প্রকৃত showdown হলে সব remaining
 * contender-এর cards client-এ পাঠানো হবে।
 *
 * Fold করা player-এর private cards
 * কখনো প্রকাশ করা হবে না।
 */
const showdownPlayers =
  contenders.length > 1
    ? contenders.map((player) => {
        const evaluation =
          evaluations.get(
            Number(player.id),
          ) || null;

        return {
          handPlayerId:
            Number(player.id),

          tablePlayerId:
            Number(
              player.table_player_id,
            ),

          seatNo:
            Number(player.seat_no),

          isBot:
            Boolean(player.is_bot),

          holeCards:
            parseJsonArray(
              player.hole_cards,
            ),

          handRankName:
            evaluation?.name || null,
        };
      })
    : [];

return {
  success: true,

      alreadySettled: false,

      tableId: validTableId,

      handId: Number(hand.id),

      handNumber: Number(hand.hand_number),

      communityCards,

      grossAmount: totalGross,

      serviceChargeAmount: totalServiceCharge,

      distributableAmount: totalDistributable,

      winners: [...winnerSummary.values()],
      showdownPlayers,

      pots: pots.map((pot) => ({
        potNumber: pot.potNumber,

        potType: pot.potType,

        grossAmount: pot.grossAmount,

        isRefund: pot.isRefund,
      })),
    };
  } catch (error) {
    await connection.rollback();

    throw error;
  } finally {
    connection.release();
  }
}

/* ==========================================
   Poker Exit + Cash-out
========================================== */

async function exitPokerTable(tableId, userId) {
  const validTableId = parsePositiveInteger(tableId);

  const validUserId = parsePositiveInteger(userId);

  if (!validTableId || !validUserId) {
    throw createServiceError("Invalid Poker exit request.", 400);
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [playerRows] = await connection.query(
      `
          SELECT
            id,
            table_id,
            user_id,
            seat_no,
            player_status,
            stack_amount,
            total_cash_out,
            cash_out_credited
          FROM poker_table_players
          WHERE table_id = ?
            AND user_id = ?
            AND is_bot = 0
          LIMIT 1
          FOR UPDATE
        `,
      [validTableId, validUserId],
    );

    const tablePlayer = playerRows[0] || null;

    if (!tablePlayer) {
      throw createServiceError("Poker table player was not found.", 404);
    }

    if (Boolean(tablePlayer.cash_out_credited)) {
      await connection.commit();

      return {
        success: true,
        alreadyExited: true,
        tableId: validTableId,
        tablePlayerId: Number(tablePlayer.id),
        cashOutAmount: Number(tablePlayer.total_cash_out),
        handNeedsShowdown: false,
      };
    }

    const [handRows] = await connection.query(
      `
          SELECT
            id,
            hand_number,
            hand_status,
            current_turn_player_id,
            pot_amount,
            current_bet,
            minimum_raise
          FROM poker_hands
          WHERE table_id = ?
            AND hand_status IN (
              'preflop',
              'flop',
              'turn',
              'river'
            )
          ORDER BY id DESC
          LIMIT 1
          FOR UPDATE
        `,
      [validTableId],
    );

    const hand = handRows[0] || null;

    let handNeedsShowdown = false;
    let nextTurnPlayerId = null;
    let exitAction = null;

    if (hand) {
      const [handPlayerRows] = await connection.query(
        `
            SELECT
              id,
              table_player_id,
              seat_no,
              player_status,
              ending_stack,
              round_bet,
              total_contribution
            FROM poker_hand_players
            WHERE hand_id = ?
              AND table_player_id = ?
            LIMIT 1
            FOR UPDATE
          `,
        [Number(hand.id), Number(tablePlayer.id)],
      );

      const handPlayer = handPlayerRows[0] || null;

      if (handPlayer && handPlayer.player_status === "active") {
        await connection.query(
          `
            UPDATE poker_hand_players
            SET
              player_status =
                'folded',
              has_acted = 1,
              last_action =
                'fold'
            WHERE id = ?
              AND player_status =
                  'active'
          `,
          [Number(handPlayer.id)],
        );

        const actionSequence = await getNextActionSequence(
          Number(hand.id),
          connection,
        );

        const currentStack = Number(tablePlayer.stack_amount);

        await connection.query(
          `
            INSERT INTO poker_hand_actions (
              hand_id,
              hand_player_id,
              action_sequence,
              betting_round,
              action_type,
              action_amount,
              contribution_amount,
              stack_before,
              stack_after,
              current_bet_after,
              pot_after,
              is_automatic
            )
            VALUES (
              ?,
              ?,
              ?,
              ?,
              'fold',
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
            Number(hand.id),
            Number(handPlayer.id),
            actionSequence,
            hand.hand_status,
            currentStack,
            currentStack,
            Number(hand.current_bet),
            Number(hand.pot_amount),
          ],
        );

        const [remainingRows] = await connection.query(
          `
              SELECT
                id,
                table_player_id,
                seat_no,
                player_status,
                ending_stack,
                round_bet,
                has_acted
              FROM poker_hand_players
              WHERE hand_id = ?
              ORDER BY seat_no
              FOR UPDATE
            `,
          [Number(hand.id)],
        );

        const contenders = remainingRows.filter(
          (player) =>
            player.player_status === "active" ||
            player.player_status === "all_in",
        );

        if (contenders.length <= 1) {
          handNeedsShowdown = true;

          await connection.query(
            `
              UPDATE poker_hands
              SET
                hand_status =
                  'showdown',
                current_turn_player_id =
                  NULL,
                action_started_at =
                  NULL,
                action_expires_at =
                  NULL,
                state_version =
                  state_version + 1
              WHERE id = ?
            `,
            [Number(hand.id)],
          );
        } else if (
          Number(hand.current_turn_player_id) === Number(tablePlayer.id)
        ) {
          const nextPlayer = findNextActiveHandPlayer(
            remainingRows,
            Number(handPlayer.seat_no),
          );

          nextTurnPlayerId = nextPlayer
            ? Number(nextPlayer.table_player_id)
            : null;

          await connection.query(
            `
              UPDATE poker_hands
              SET
                current_turn_player_id = ?,
                action_started_at =
                  NOW(),
                action_expires_at =
                  DATE_ADD(
                    NOW(),
                    INTERVAL 15 SECOND
                  ),
                state_version =
                  state_version + 1
              WHERE id = ?
            `,
            [nextTurnPlayerId, Number(hand.id)],
          );
        }

        exitAction = {
          tableId: validTableId,

          handId: Number(hand.id),

          handNumber: Number(hand.hand_number),

          action: "fold",

          actionSequence,

          actorTablePlayerId: Number(tablePlayer.id),

          contribution: 0,

          stackBefore: currentStack,

          stackAfter: currentStack,

          roundBetAfter: Number(handPlayer.round_bet),

          potAmount: Number(hand.pot_amount),

          currentBet: Number(hand.current_bet),

          minimumRaise: Number(hand.minimum_raise),

          nextTurnPlayerId,

          bettingRound: handNeedsShowdown ? "showdown" : hand.hand_status,

          bettingRoundComplete: false,

          communityCards: [],

          dealtStreets: [],

          handNeedsShowdown,

          automatic: true,

          automaticReason: "player_exit",

          actorIsBot: false,
        };
      }
    }

    const user = await getLockedUser(validUserId, connection);

    if (!user) {
      throw createServiceError("Poker user was not found.", 404);
    }

    const cashOutAmount = roundPokerMoney(tablePlayer.stack_amount);

    const balanceBefore = Number(user.wallet_balance);

    const balanceAfter = roundPokerMoney(balanceBefore + cashOutAmount);

    if (cashOutAmount > 0) {
      await connection.query(
        `
          UPDATE users
          SET wallet_balance = ?
          WHERE id = ?
        `,
        [balanceAfter, validUserId],
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
            'game_cash_out',
            'credit',
            ?,
            ?,
            ?,
            'completed',
            'poker_table',
            ?,
            ?
          )
        `,
        [
          createTransactionId(),
          validUserId,
          cashOutAmount,
          balanceBefore,
          balanceAfter,
          String(validTableId),
          `Poker table ${validTableId} cash-out`,
        ],
      );
    }

    const [exitResult] = await connection.query(
      `
          UPDATE poker_table_players
          SET
            player_status =
              'left',

            total_cash_out =
              total_cash_out + ?,

            stack_amount =
              0.00,

            cash_out_credited =
              1,

            left_at =
              NOW()

          WHERE id = ?
            AND cash_out_credited =
                0
        `,
      [cashOutAmount, Number(tablePlayer.id)],
    );

    if (Number(exitResult.affectedRows) !== 1) {
      throw createServiceError("Poker cash-out was already processed.", 409);
    }

    /*
     * Table-এ কোনো real player না থাকলে
     * bot-এর remaining stack bot wallet-এ ফেরত যাবে।
     */
    const [remainingRealRows] = await connection.query(
      `
      SELECT COUNT(*) AS total
      FROM poker_table_players
      WHERE table_id = ?
        AND is_bot = 0
        AND player_status !=
            'left'
    `,
      [validTableId],
    );

    const remainingRealPlayers = Number(remainingRealRows[0]?.total || 0);

    if (remainingRealPlayers === 0 && !handNeedsShowdown) {
      const [botRows] = await connection.query(
        `
        SELECT
          id,
          bot_id,
          stack_amount
        FROM poker_table_players
        WHERE table_id = ?
          AND is_bot = 1
          AND player_status !=
              'left'
        FOR UPDATE
      `,
        [validTableId],
      );

      for (const botPlayer of botRows) {
        const botCashOut = roundPokerMoney(botPlayer.stack_amount);

        if (botCashOut > 0) {
          await connection.query(
            `
          UPDATE poker_bots
          SET wallet_balance =
                wallet_balance + ?
          WHERE id = ?
        `,
            [botCashOut, Number(botPlayer.bot_id)],
          );
        }

        await connection.query(
          `
        UPDATE poker_table_players
        SET
          player_status =
            'left',
          total_cash_out =
            total_cash_out + ?,
          stack_amount =
            0.00,
          cash_out_credited =
            1,
          left_at =
            NOW()
        WHERE id = ?
      `,
          [botCashOut, Number(botPlayer.id)],
        );
      }
    }

    const [countRows] = await connection.query(
      `
          SELECT COUNT(*) AS total
          FROM poker_table_players
          WHERE table_id = ?
            AND player_status !=
                'left'
        `,
      [validTableId],
    );

    const remainingPlayers = Number(countRows[0]?.total || 0);

    await connection.query(
      `
        UPDATE poker_tables
        SET
          current_players = ?,

          table_status =
            CASE
              WHEN ? < 2
              THEN 'paused'
              ELSE table_status
            END,

          state_version =
            state_version + 1

        WHERE id = ?
      `,
      [remainingPlayers, remainingPlayers, validTableId],
    );

    await connection.commit();

    return {
      success: true,
      alreadyExited: false,

      tableId: validTableId,

      tablePlayerId: Number(tablePlayer.id),

      cashOutAmount,

      walletBalance: balanceAfter,

      remainingPlayers,

      handNeedsShowdown,

      exitAction,
    };
  } catch (error) {
    await connection.rollback();

    throw error;
  } finally {
    connection.release();
  }
}

function clampPokerNumber(value, minimum, maximum) {
  return Math.min(Math.max(Number(value), Number(minimum)), Number(maximum));
}

function getPokerBotSamples(difficulty) {
  switch (String(difficulty || "").toLowerCase()) {
    case "hard":
      return 80;

    case "easy":
      return 28;

    default:
      return 52;
  }
}

function getPokerBotStyleAdjustment(playingStyle) {
  switch (String(playingStyle || "").toLowerCase()) {
    case "aggressive":
      return 0.055;

    case "tight":
    case "defensive":
      return -0.045;

    default:
      return 0;
  }
}

function getSecureRandomFraction() {
  return crypto.randomInt(0, 1000000) / 1000000;
}

function estimatePokerBotEquity({
  holeCards,
  communityCards,
  contenderCount,
  difficulty,
}) {
  if (!Array.isArray(holeCards) || holeCards.length !== 2) {
    return 0.5;
  }

  const board = Array.isArray(communityCards) ? [...communityCards] : [];

  if (board.length > 5) {
    return 0.5;
  }

  const knownCards = new Set([...holeCards, ...board]);

  const availableCards = createDeck().filter((card) => !knownCards.has(card));

  const opponentCount = clampPokerNumber(Number(contenderCount || 2) - 1, 1, 4);

  const samples = getPokerBotSamples(difficulty);

  let equityTotal = 0;

  for (let sample = 0; sample < samples; sample += 1) {
    const simulatedDeck = shuffleDeck(availableCards);

    let cursor = 0;

    const simulatedBoard = [...board];

    while (simulatedBoard.length < 5) {
      simulatedBoard.push(simulatedDeck[cursor]);

      cursor += 1;
    }

    const botEvaluation = evaluateHoldemHand(holeCards, simulatedBoard);

    let strongerOpponent = false;

    let tiedOpponents = 0;

    for (
      let opponentIndex = 0;
      opponentIndex < opponentCount;
      opponentIndex += 1
    ) {
      const opponentCards = [simulatedDeck[cursor], simulatedDeck[cursor + 1]];

      cursor += 2;

      const opponentEvaluation = evaluateHoldemHand(
        opponentCards,
        simulatedBoard,
      );

      if (opponentEvaluation.score > botEvaluation.score) {
        strongerOpponent = true;

        break;
      }

      if (opponentEvaluation.score === botEvaluation.score) {
        tiedOpponents += 1;
      }
    }

    if (!strongerOpponent) {
      equityTotal += 1 / (tiedOpponents + 1);
    }
  }

  return clampPokerNumber(equityTotal / samples, 0, 1);
}

function decidePokerBotAction(turn) {
  const equity = estimatePokerBotEquity({
    holeCards: turn.holeCards,

    communityCards: turn.communityCards,

    contenderCount: turn.contenderCount,

    difficulty: turn.difficulty,
  });

  const difficulty = String(turn.difficulty || "normal").toLowerCase();

  const playingStyle = String(turn.playingStyle || "balanced").toLowerCase();

  const noiseRange =
    difficulty === "hard" ? 0.035 : difficulty === "easy" ? 0.16 : 0.085;

  const randomNoise = (getSecureRandomFraction() - 0.5) * noiseRange;

  const decisionStrength = clampPokerNumber(
    equity + getPokerBotStyleAdjustment(playingStyle) + randomNoise,
    0,
    1,
  );

  const potAmount = Math.max(Number(turn.potAmount || 0), 0);

  const callAmount = Math.max(Number(turn.callAmount || 0), 0);

  const stackAmount = Math.max(Number(turn.stackAmount || 0), 0);

  const potOdds =
    callAmount > 0
      ? callAmount / Math.max(potAmount + callAmount, callAmount)
      : 0;

  const canRaise =
    Boolean(turn.raiseReopened) &&
    Number(turn.maximumRaiseTo) >= Number(turn.minimumRaiseTo);

  const raiseThreshold =
    playingStyle === "aggressive"
      ? 0.54
      : playingStyle === "tight" || playingStyle === "defensive"
        ? 0.69
        : 0.61;

  /*
   * Check available:
   * কখনো invalid fold করবে না।
   */
  if (callAmount === 0) {
    if (
      canRaise &&
      decisionStrength >= raiseThreshold &&
      getSecureRandomFraction() < 0.58
    ) {
      return {
        actionType: "raise",

        amount: Number(turn.minimumRaiseTo),

        equity,
        potOdds,
      };
    }

    return {
      actionType: "check",

      amount: null,
      equity,
      potOdds,
    };
  }

  /*
   * Call করলে সম্পূর্ণ stack চলে যাবে।
   */
  if (callAmount >= stackAmount) {
    const requiredStrength = Math.max(
      potOdds - 0.035,
      playingStyle === "aggressive" ? 0.34 : 0.4,
    );

    return {
      actionType: decisionStrength >= requiredStrength ? "call" : "fold",

      amount: null,
      equity,
      potOdds,
    };
  }

  /*
   * Pot odds-এর তুলনায় hand দুর্বল।
   */
  const foldBuffer =
    difficulty === "hard" ? 0.015 : difficulty === "easy" ? 0.075 : 0.04;

  if (decisionStrength + foldBuffer < potOdds) {
    return {
      actionType: "fold",

      amount: null,
      equity,
      potOdds,
    };
  }

  /*
   * খুব শক্ত hand এবং stack ছোট হলে
   * সীমিত chance-এ all-in।
   */
  if (
    canRaise &&
    decisionStrength >= 0.88 &&
    stackAmount <= Math.max(potAmount * 1.25, callAmount * 3) &&
    getSecureRandomFraction() < 0.24
  ) {
    return {
      actionType: "all_in",

      amount: null,
      equity,
      potOdds,
    };
  }

  if (
    canRaise &&
    decisionStrength >= raiseThreshold &&
    getSecureRandomFraction() < (playingStyle === "aggressive" ? 0.55 : 0.34)
  ) {
    return {
      actionType: "raise",

      amount: Number(turn.minimumRaiseTo),

      equity,
      potOdds,
    };
  }

  return {
    actionType: "call",

    amount: null,
    equity,
    potOdds,
  };
}

async function cashOutOrphanedPokerBots(tableId) {
  const validTableId = parsePositiveInteger(tableId);

  if (!validTableId) {
    throw createServiceError("Invalid Poker table ID for bot cash-out.", 400);
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [realRows] = await connection.query(
      `
          SELECT COUNT(*) AS total
          FROM poker_table_players
          WHERE table_id = ?
            AND is_bot = 0
            AND player_status !=
                'left'
          FOR UPDATE
        `,
      [validTableId],
    );

    const remainingRealPlayers = Number(realRows[0]?.total || 0);

    /*
     * Real player থাকলে bot table-এই থাকবে।
     */
    if (remainingRealPlayers > 0) {
      await connection.commit();

      return {
        success: true,
        skipped: true,
        reason: "real_players_remain",
        remainingRealPlayers,
        botsCashedOut: 0,
      };
    }

    const [botRows] = await connection.query(
      `
          SELECT
            id,
            bot_id,
            stack_amount
          FROM poker_table_players
          WHERE table_id = ?
            AND is_bot = 1
            AND player_status !=
                'left'
            AND cash_out_credited = 0
          FOR UPDATE
        `,
      [validTableId],
    );

    let botsCashedOut = 0;

    for (const botPlayer of botRows) {
      const botCashOut = roundPokerMoney(botPlayer.stack_amount);

      if (botCashOut > 0) {
        const [walletResult] = await connection.query(
          `
              UPDATE poker_bots
              SET
                wallet_balance =
                  wallet_balance + ?
              WHERE id = ?
            `,
          [botCashOut, Number(botPlayer.bot_id)],
        );

        if (Number(walletResult.affectedRows) !== 1) {
          throw createServiceError("Unable to credit Poker bot cash-out.", 409);
        }
      }

      const [playerResult] = await connection.query(
        `
            UPDATE poker_table_players
            SET
              player_status =
                'left',

              total_cash_out =
                total_cash_out + ?,

              stack_amount =
                0.00,

              cash_out_credited =
                1,

              left_at =
                COALESCE(
                  left_at,
                  NOW()
                )

            WHERE id = ?
              AND player_status !=
                  'left'
              AND cash_out_credited =
                  0
          `,
        [botCashOut, Number(botPlayer.id)],
      );

      if (Number(playerResult.affectedRows) !== 1) {
        throw createServiceError("Poker bot cash-out state changed.", 409);
      }

      botsCashedOut += 1;
    }

    const [countRows] = await connection.query(
      `
          SELECT COUNT(*) AS total
          FROM poker_table_players
          WHERE table_id = ?
            AND player_status !=
                'left'
        `,
      [validTableId],
    );

    const remainingPlayers = Number(countRows[0]?.total || 0);

    await connection.query(
      `
        UPDATE poker_tables
        SET
          current_players = ?,

          table_status =
            CASE
              WHEN ? < 2
              THEN 'paused'
              ELSE table_status
            END,

          state_version =
            state_version + 1

        WHERE id = ?
      `,
      [remainingPlayers, remainingPlayers, validTableId],
    );

    await connection.commit();

    return {
      success: true,
      skipped: false,
      remainingRealPlayers: 0,
      remainingPlayers,
      botsCashedOut,
    };
  } catch (error) {
    await connection.rollback();

    throw error;
  } finally {
    connection.release();
  }
}

async function performAutomaticTurn(
  tableId,
  {
    requireExpired = false,
    expectedHandId = null,
    expectedTablePlayerId = null,
  } = {},
) {
  const turn = await getCurrentPokerTurn(tableId);

  if (!turn) {
    return {
      skipped: true,
      reason: "no_active_turn",
    };
  }

  if (expectedHandId && Number(turn.handId) !== Number(expectedHandId)) {
    return {
      skipped: true,
      reason: "hand_changed",
    };
  }

  if (
    expectedTablePlayerId &&
    Number(turn.tablePlayerId) !== Number(expectedTablePlayerId)
  ) {
    return {
      skipped: true,
      reason: "turn_changed",
    };
  }

  if (requireExpired) {
    const expiresAt = new Date(turn.actionExpiresAt).getTime();

    if (Number.isFinite(expiresAt) && expiresAt > Date.now()) {
      return {
        skipped: true,
        reason: "turn_not_expired",
      };
    }
  }

  let actionType;
  let amount = null;

  if (!turn.isBot) {
    /*
     * Human timeout:
     * Check সম্ভব হলে check,
     * অন্যথায় fold।
     */
    actionType = turn.callAmount === 0 ? "check" : "fold";
  } else {
    const decision = decidePokerBotAction(turn);

    actionType = decision.actionType;

    amount = decision.amount;

    console.log("POKER BOT DECISION:", {
      tableId: turn.tableId,

      handId: turn.handId,

      botId: turn.botId,

      street: turn.handStatus,

      action: actionType,

      equity: Number(decision.equity.toFixed(3)),

      potOdds: Number(decision.potOdds.toFixed(3)),
    });
  }

  const result = await performPlayerAction({
    tableId: turn.tableId,

    actorTablePlayerId: turn.tablePlayerId,

    actionType,

    amount,

    isAutomatic: true,

    isSystemAction: true,
  });

  return {
    ...result,

    automatic: true,

    automaticReason: turn.isBot ? "bot_turn" : "human_timeout",

    actorIsBot: turn.isBot,
  };
}

/* ==========================================
   Available Poker Bot
========================================== */

async function getAvailablePokerBot(minimumBalance, connection) {
  const [rows] = await connection.query(
    `
        SELECT
          pb.id,
          pb.bot_code,
          pb.bot_name,
          pb.wallet_balance,
          pb.difficulty,
          pb.playing_style

        FROM poker_bots pb

        WHERE pb.status = 'active'
          AND pb.wallet_balance >= ?

          AND NOT EXISTS (
            SELECT 1
            FROM poker_table_players ptp

            INNER JOIN poker_tables pt
              ON pt.id =
                 ptp.table_id

            WHERE ptp.bot_id = pb.id
              AND ptp.is_bot = 1
              AND ptp.player_status !=
                  'left'
              AND pt.table_status IN (
                  'waiting',
                  'starting',
                  'playing',
                  'paused'
              )
          )

      ORDER BY
  pb.total_hands ASC,
  RAND()

        LIMIT 1
        FOR UPDATE
      `,
    [minimumBalance],
  );

  return rows[0] || null;
}

/* ==========================================
   Finalize Poker Matchmaking
========================================== */

async function finalizeMatchmaking(tableId) {
  const validTableId = parsePositiveInteger(tableId);

  if (!validTableId) {
    throw createServiceError("Invalid Poker table ID.", 400);
  }

  const connection = await pool.getConnection();

  let botJoined = false;
  let joinedBotId = null;

  try {
    await connection.beginTransaction();

    const [tableRows] = await connection.query(
      `
          SELECT
            id,
            room_id,
            table_status,
            max_players,
            current_players,
            current_hand_number,
            minimum_buy_in,
            big_blind,
            matchmaking_expires_at
          FROM poker_tables
          WHERE id = ?
          LIMIT 1
          FOR UPDATE
        `,
      [validTableId],
    );

    const table = tableRows[0] || null;

    if (!table) {
      throw createServiceError("Poker table was not found.", 404);
    }

    /*
     * Recover a table where matchmaking already completed,
     * but the first hand was never created.
     *
     * This does not debit the real player or bot buy-in again.
     */
    if (
      table.table_status === "starting" &&
      Number(table.current_hand_number || 0) === 0
    ) {
      const [existingHandRows] = await connection.query(
        `
      SELECT id
      FROM poker_hands
      WHERE table_id = ?
      LIMIT 1
      FOR UPDATE
    `,
        [validTableId],
      );

      if (existingHandRows.length === 0) {
        await startPokerHandInTransaction(validTableId, connection);
      }

      await connection.commit();

      return {
        botJoined: false,
        joinedBotId: null,
        alreadyFinalized: true,
        recoveredFirstHand: existingHandRows.length === 0,
        ...(await buildTableState(validTableId)),
      };
    }

    if (table.table_status !== TABLE_STATUS.WAITING) {
      await connection.commit();

      return {
        botJoined: false,
        joinedBotId: null,
        alreadyFinalized: true,
        recoveredFirstHand: false,
        ...(await buildTableState(validTableId)),
      };
    }

    const [playerRows] = await connection.query(
      `
          SELECT
            id,
            user_id,
            bot_id,
            is_bot,
            seat_no,
            player_status
          FROM poker_table_players
          WHERE table_id = ?
            AND player_status !=
                'left'
          ORDER BY seat_no ASC
          FOR UPDATE
        `,
      [validTableId],
    );

    const realPlayers = playerRows.filter((player) => !Boolean(player.is_bot));

    if (realPlayers.length === 0) {
      await connection.query(
        `
          UPDATE poker_tables
          SET
            table_status = 'closed',
            closed_at = NOW(),
            current_players = 0,
            state_version =
              state_version + 1
          WHERE id = ?
        `,
        [validTableId],
      );

      await connection.commit();

      return {
        botJoined: false,

        alreadyFinalized: false,

        ...(await buildTableState(validTableId)),
      };
    }

    /*
     * Confirmed rule:
     *
     * 1–4 Real → 1 Bot
     * 5 Real   → 0 Bot
     */
    if (realPlayers.length < MAX_PLAYERS && playerRows.length < MAX_PLAYERS) {
      const botBuyIn = Number(table.minimum_buy_in);

      const bot = await getAvailablePokerBot(botBuyIn, connection);

      if (!bot) {
        throw createServiceError(
          "No funded Poker bot is currently available.",
          409,
        );
      }

      const seatNo = await getAvailableSeat(validTableId, connection);

      if (!seatNo) {
        throw createServiceError(
          "No Poker seat is available for the bot.",
          409,
        );
      }

      const [botWalletResult] = await connection.query(
        `
            UPDATE poker_bots
            SET
              wallet_balance =
                wallet_balance - ?,

              total_wagered =
                total_wagered + ?

            WHERE id = ?
              AND status =
                  'active'
              AND wallet_balance >= ?
          `,
        [botBuyIn, botBuyIn, Number(bot.id), botBuyIn],
      );

      if (Number(botWalletResult.affectedRows) !== 1) {
        throw createServiceError("Unable to debit Poker bot buy-in.", 409);
      }

      const [botInsertResult] = await connection.query(
        `
            INSERT INTO poker_table_players (
              table_id,
              user_id,
              bot_id,
              is_bot,
              seat_no,
              player_status,
              stack_amount,
              initial_buy_in,
              total_buy_in,
              wallet_debited
            )
            VALUES (
              ?,
              NULL,
              ?,
              1,
              ?,
              'waiting',
              ?,
              ?,
              ?,
              1
            )
          `,
        [validTableId, Number(bot.id), seatNo, botBuyIn, botBuyIn, botBuyIn],
      );

      botJoined = true;

      joinedBotId = Number(botInsertResult.insertId);
    }

    const [countRows] = await connection.query(
      `
          SELECT COUNT(*) AS total
          FROM poker_table_players
          WHERE table_id = ?
            AND player_status !=
                'left'
        `,
      [validTableId],
    );

    const totalPlayers = Number(countRows[0]?.total || 0);

    if (totalPlayers < 2) {
      throw createServiceError("Poker needs at least two players.", 409);
    }

    await connection.query(
      `
        UPDATE poker_table_players
        SET player_status =
              'active'
        WHERE table_id = ?
          AND player_status =
              'waiting'
      `,
      [validTableId],
    );

    const [tableResult] = await connection.query(
      `
          UPDATE poker_tables
          SET
            table_status =
              'starting',

            current_players = ?,

            started_at =
              COALESCE(
                started_at,
                NOW()
              ),

            state_version =
              state_version + 1

          WHERE id = ?
            AND table_status =
                'waiting'
        `,
      [totalPlayers, validTableId],
    );

    if (Number(tableResult.affectedRows) !== 1) {
      throw createServiceError(
        "Poker table changed before matchmaking completed.",
        409,
      );
    }

    await connection.query(
      `
        UPDATE game_rooms
        SET current_players = (
          SELECT COALESCE(
            SUM(current_players),
            0
          )
          FROM poker_tables
          WHERE room_id = ?
            AND table_status IN (
                'waiting',
                'starting',
                'playing'
            )
        )
        WHERE id = ?
      `,
      [Number(table.room_id), Number(table.room_id)],
    );

    await startPokerHandInTransaction(validTableId, connection);

    await connection.commit();
  } catch (error) {
    await connection.rollback();

    throw error;
  } finally {
    connection.release();
  }

  const state = await buildTableState(validTableId);

  return {
    botJoined,
    joinedBotId,
    alreadyFinalized: false,
    ...state,
  };
}

module.exports = {
  joinMatchmaking,
  finalizeMatchmaking,
  getTableState,
  getTableGameState,
  performPlayerAction,
  getCurrentPokerTurn,
  performAutomaticTurn,
  settlePokerHand,
  startNextPokerHand,
  exitPokerTable,
  cashOutOrphanedPokerBots,

  MATCHMAKING_WAIT_SECONDS,
};
