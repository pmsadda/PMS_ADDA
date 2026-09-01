"use strict";

const crypto = require("crypto");

const { pool } = require("../config/database");

const {
  RANKS,
  normalizeRank,
  createServerSeed,
  hashServerSeed,
  shuffleDeck,
  getPositionSide,
  resolveRankResults,
} = require("./kait-deck.service");

function createServiceError(
  message,
  statusCode = 400,
  code = "KAIT_SERVICE_ERROR",
) {
  const error = new Error(message);

  error.statusCode = statusCode;

  error.code = code;

  return error;
}

function createRoundCode() {
  const timestamp = Date.now().toString(36).toUpperCase();

  const randomPart = crypto.randomBytes(4).toString("hex").toUpperCase();

  return `KT-${timestamp}-${randomPart}`;
}

function createReferenceCode(prefix) {
  const timestamp = Date.now().toString(36).toUpperCase();

  const randomPart = crypto.randomBytes(6).toString("hex").toUpperCase();

  return `${prefix}-${timestamp}-${randomPart}`;
}

function validateBetAmount(value, minimumBet, maximumBet) {
  const amount = Number(value);

  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !Number.isInteger(amount * 100)
  ) {
    throw createServiceError(
      "সঠিক bet amount দিন।",
      400,
      "KAIT_BET_AMOUNT_INVALID",
    );
  }

  const normalized = normalizeMoney(amount);

  if (normalized < minimumBet) {
    throw createServiceError(
      `Minimum bet ${minimumBet}.`,
      400,
      "KAIT_BET_BELOW_MINIMUM",
    );
  }

  if (normalized > maximumBet) {
    throw createServiceError(
      `Maximum bet ${maximumBet}.`,
      400,
      "KAIT_BET_ABOVE_MAXIMUM",
    );
  }

  return normalized;
}

function normalizeMoney(value) {
  const amount = Number(value);

  return Number.isFinite(amount) ? Number(amount.toFixed(2)) : 0;
}

function normalizeSettings(row) {
  if (!row) {
    throw createServiceError(
      "Kait settings were not found.",
      500,
      "KAIT_SETTINGS_NOT_FOUND",
    );
  }

  return {
    id: Number(row.id),

    gameEnabled: Boolean(Number(row.game_enabled)),

    minimumBet: normalizeMoney(row.minimum_bet),

    maximumBet: normalizeMoney(row.maximum_bet),

    winningMultiplier: Number(row.winning_multiplier),

    serviceChargePercent: Number(row.service_charge_percent),

    bettingDurationSeconds: Number(row.betting_duration_seconds),

    cardDealIntervalMs: Number(row.card_deal_interval_ms),

    resultDisplaySeconds: Number(row.result_display_seconds),

    nextRoundDelaySeconds: Number(row.next_round_delay_seconds),
  };
}

function normalizeRound(row) {
  if (!row) {
    return null;
  }

  let resolvedRanks = [];

  try {
    resolvedRanks =
      typeof row.resolved_ranks_json === "string"
        ? JSON.parse(row.resolved_ranks_json)
        : row.resolved_ranks_json || [];
  } catch (_error) {
    resolvedRanks = [];
  }
  const lastDealtPosition = Number(row.last_dealt_position || 0);

  let dealtCards = [];

  if (lastDealtPosition > 0 && row.deck_order_json) {
    try {
      const deck = parseStoredDeck(row.deck_order_json);

      dealtCards = deck.slice(0, lastDealtPosition).map((card, index) => {
        const deckPosition = index + 1;

        return {
          ...card,

          deckPosition,

          resultSide: getPositionSide(deckPosition),
        };
      });
    } catch (_error) {
      dealtCards = [];
    }
  }
  return {
    id: Number(row.id),

    roundCode: row.round_code,

    roundStatus: row.round_status,

    minimumBet: normalizeMoney(row.minimum_bet_snapshot),

    maximumBet: normalizeMoney(row.maximum_bet_snapshot),

    winningMultiplier: Number(row.multiplier_snapshot),

    serviceChargePercent: Number(row.service_charge_percent_snapshot),

    bettingDurationSeconds: Number(row.betting_duration_seconds_snapshot),

    cardDealIntervalMs: Number(row.card_deal_interval_ms_snapshot),

    resultDisplaySeconds: Number(row.result_display_seconds_snapshot),

    nextRoundDelaySeconds: Number(row.next_round_delay_seconds_snapshot),

    lastDealtPosition,
    dealtCards,

    resolvedRanks,

    totalBetAmount: normalizeMoney(row.total_bet_amount),

    totalPlayers: Number(row.total_players || 0),

    totalBets: Number(row.total_bets || 0),

    bettingStartedAt: row.betting_started_at,

    bettingEndsAt: row.betting_ends_at,

    dealingStartedAt: row.dealing_started_at,

    dealingCompletedAt: row.dealing_completed_at,

    settledAt: row.settled_at,

    createdAt: row.created_at,

    updatedAt: row.updated_at,
  };
}

async function getSettings(connection = pool, { forUpdate = false } = {}) {
  const lockSql = forUpdate ? "FOR UPDATE" : "";

  const [rows] = await connection.query(
    `
        SELECT
          id,
          game_enabled,
          minimum_bet,
          maximum_bet,
          winning_multiplier,
          service_charge_percent,
          betting_duration_seconds,
          card_deal_interval_ms,
          result_display_seconds,
          next_round_delay_seconds

        FROM kait_settings

        WHERE id = 1

        LIMIT 1

        ${lockSql}
      `,
  );

  return normalizeSettings(rows[0]);
}

async function findActiveRound(connection = pool, { forUpdate = false } = {}) {
  const lockSql = forUpdate ? "FOR UPDATE" : "";

  const [rows] = await connection.query(
    `
        SELECT *

        FROM kait_rounds

        WHERE round_status IN (
          'betting',
          'dealing',
          'settling',
          'refunding'
        )

        ORDER BY id DESC

        LIMIT 1

        ${lockSql}
      `,
  );

  return rows[0] || null;
}

async function createBettingRound(connection, settings) {
  const serverSeed = createServerSeed();

  const serverSeedHash = hashServerSeed(serverSeed);

  const deck = shuffleDeck(serverSeed);

  /*
   * Round তৈরির সময় result internally
   * calculate হবে, কিন্তু user/API-তে
   * betting শেষ হওয়ার আগে প্রকাশ হবে না।
   */
  resolveRankResults(deck);

  const now = new Date();

  const bettingEndsAt = new Date(
    now.getTime() + settings.bettingDurationSeconds * 1000,
  );

  const roundCode = createRoundCode();

  const [result] = await connection.query(
    `
        INSERT INTO kait_rounds (
          round_code,
          round_status,

          minimum_bet_snapshot,
          maximum_bet_snapshot,
          multiplier_snapshot,
          service_charge_percent_snapshot,

          betting_duration_seconds_snapshot,
          card_deal_interval_ms_snapshot,
          result_display_seconds_snapshot,
          next_round_delay_seconds_snapshot,

          server_seed_hash,
server_seed_secret,
server_seed_reveal,
deck_order_json,

          selected_ranks_json,
          resolved_ranks_json,

          last_dealt_position,

          betting_started_at,
          betting_ends_at
        )

        VALUES (
          ?,
          'betting',

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
NULL,
?,

          ?,
          ?,

          0,

          ?,
          ?
        )
      `,
    [
      roundCode,

      settings.minimumBet,
      settings.maximumBet,
      settings.winningMultiplier,
      settings.serviceChargePercent,

      settings.bettingDurationSeconds,
      settings.cardDealIntervalMs,
      settings.resultDisplaySeconds,
      settings.nextRoundDelaySeconds,

      serverSeedHash,
      serverSeed,
      JSON.stringify(deck),

      JSON.stringify(RANKS),
      JSON.stringify([]),

      now,
      bettingEndsAt,
    ],
  );

  const [rows] = await connection.query(
    `
        SELECT *

        FROM kait_rounds

        WHERE id = ?

        LIMIT 1
      `,
    [result.insertId],
  );

  return rows[0];
}

async function ensureCurrentRound() {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const settings = await getSettings(connection, {
      forUpdate: true,
    });

    /*
     * আগে active round আছে কি না দেখব।
     *
     * Game OFF হলেও existing round
     * finish করার জন্য এটাকে return করব।
     */
    let round = await findActiveRound(connection, {
      forUpdate: true,
    });

    /*
     * Active round নেই এবং game ON
     * থাকলেই শুধু নতুন round তৈরি হবে।
     */
    if (!round && settings.gameEnabled) {
      round = await createBettingRound(connection, settings);
    }

    await connection.commit();

    return {
      settings,

      round: normalizeRound(round),
    };
  } catch (error) {
    await connection.rollback();

    throw error;
  } finally {
    connection.release();
  }
}

async function getPublicGameState() {
  const { settings, round } = await ensureCurrentRound();

  return {
    gameEnabled: settings.gameEnabled,

    ranks: [...RANKS],

    round,
  };
}

async function placeKaitBet({ userId, roundId, selectedRank, betAmount }) {
  const validUserId = Number(userId);

  const validRoundId = Number(roundId);

  if (!Number.isInteger(validUserId) || validUserId < 1) {
    throw createServiceError("Invalid user.", 401, "KAIT_USER_INVALID");
  }

  if (!Number.isInteger(validRoundId) || validRoundId < 1) {
    throw createServiceError("Invalid Kait round.", 400, "KAIT_ROUND_INVALID");
  }

  const validRank = normalizeRank(selectedRank);

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const settings = await getSettings(connection, {
      forUpdate: true,
    });

    if (!settings.gameEnabled) {
      throw createServiceError(
        "Kait is currently disabled.",
        409,
        "KAIT_DISABLED",
      );
    }

    const [roundRows] = await connection.query(
      `
          SELECT *

          FROM kait_rounds

          WHERE id = ?

          LIMIT 1

          FOR UPDATE
        `,
      [validRoundId],
    );

    const round = roundRows[0];

    if (!round) {
      throw createServiceError(
        "Kait round was not found.",
        404,
        "KAIT_ROUND_NOT_FOUND",
      );
    }

    if (round.round_status !== "betting") {
      throw createServiceError(
        "এই round-এ betting বন্ধ।",
        409,
        "KAIT_BETTING_CLOSED",
      );
    }

    if (new Date(round.betting_ends_at).getTime() <= Date.now()) {
      throw createServiceError(
        "Betting time শেষ হয়েছে।",
        409,
        "KAIT_BETTING_TIME_ENDED",
      );
    }

    const amount = validateBetAmount(
      betAmount,
      normalizeMoney(round.minimum_bet_snapshot),
      normalizeMoney(round.maximum_bet_snapshot),
    );

    const [existingRows] = await connection.query(
      `
          SELECT
            id,
            bet_code

          FROM kait_bets

          WHERE round_id = ?
            AND user_id = ?

          LIMIT 1

          FOR UPDATE
        `,
      [validRoundId, validUserId],
    );

    if (existingRows.length > 0) {
      throw createServiceError(
        "এক round-এ একটি rank-এ একবারই bet করা যাবে।",
        409,
        "KAIT_USER_ALREADY_BET",
      );
    }

    const [userRows] = await connection.query(
      `
          SELECT
            id,
            account_status,
            wallet_balance

          FROM users

          WHERE id = ?

          LIMIT 1

          FOR UPDATE
        `,
      [validUserId],
    );

    const user = userRows[0];

    if (!user) {
      throw createServiceError(
        "User account পাওয়া যায়নি।",
        404,
        "KAIT_USER_NOT_FOUND",
      );
    }

    if (user.account_status !== "active") {
      throw createServiceError(
        "User account active নয়।",
        403,
        "KAIT_USER_INACTIVE",
      );
    }

    const balanceBefore = normalizeMoney(user.wallet_balance);

    if (balanceBefore < amount) {
      throw createServiceError(
        "Wallet balance যথেষ্ট নয়।",
        409,
        "KAIT_BALANCE_INSUFFICIENT",
      );
    }

    const lockedMultiplier = Number(round.multiplier_snapshot);

    const chargePercent = Number(round.service_charge_percent_snapshot);

    const grossPayout = normalizeMoney(amount * lockedMultiplier);

    const potentialServiceCharge = normalizeMoney(
      grossPayout * (chargePercent / 100),
    );

    const potentialNetPayout = normalizeMoney(
      grossPayout - potentialServiceCharge,
    );

    const balanceAfterBet = normalizeMoney(balanceBefore - amount);

    const betCode = createReferenceCode("KT-BET");

    const transactionId = createReferenceCode("KT-DEBIT");

    const [walletResult] = await connection.query(
      `
          UPDATE users

          SET
            wallet_balance =
              wallet_balance - ?,

            turnover_amount =
              turnover_amount + ?

          WHERE id = ?
            AND account_status =
              'active'
            AND wallet_balance >= ?
        `,
      [amount, amount, validUserId, amount],
    );

    if (walletResult.affectedRows !== 1) {
      throw createServiceError(
        "Kait wallet debit failed.",
        409,
        "KAIT_WALLET_DEBIT_FAILED",
      );
    }

    const [betResult] = await connection.query(
      `
          INSERT INTO kait_bets (
            bet_code,
            round_id,
            user_id,
            selected_rank,

            locked_multiplier,
            bet_amount,

            potential_gross_payout,
            potential_service_charge,
            potential_net_payout,

            bet_status,

            balance_before,
            balance_after_bet,

            bet_transaction_id
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

            'accepted',

            ?,
            ?,

            ?
          )
        `,
      [
        betCode,
        validRoundId,
        validUserId,
        validRank,

        lockedMultiplier,
        amount,

        grossPayout,
        potentialServiceCharge,
        potentialNetPayout,

        balanceBefore,
        balanceAfterBet,

        transactionId,
      ],
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
          'kait_bet',
          ?,
          ?
        )
      `,
      [
        transactionId,
        validUserId,
        amount,
        balanceBefore,
        balanceAfterBet,
        betCode,
        `Kait ${validRank} bet for round ${round.round_code}`,
      ],
    );

    await connection.query(
      `
        UPDATE kait_rounds

        SET
          total_bet_amount =
            total_bet_amount + ?,

          total_players =
            total_players + 1,

          total_bets =
            total_bets + 1

        WHERE id = ?
      `,
      [amount, validRoundId],
    );

    await connection.commit();

    return {
      id: Number(betResult.insertId),

      betCode,

      roundId: validRoundId,

      selectedRank: validRank,

      lockedMultiplier,

      betAmount: amount,

      potentialGrossPayout: grossPayout,

      potentialServiceCharge,

      potentialNetPayout,

      balanceBefore,

      balanceAfterBet,
    };
  } catch (error) {
    await connection.rollback();

    if (error?.code === "ER_DUP_ENTRY" || Number(error?.errno) === 1062) {
      throw createServiceError(
        "এক round-এ একবারই bet করা যাবে।",
        409,
        "KAIT_USER_ALREADY_BET",
      );
    }

    throw error;
  } finally {
    connection.release();
  }
}

function parseStoredDeck(value) {
  let deck;

  try {
    deck = typeof value === "string" ? JSON.parse(value) : value;
  } catch (_error) {
    deck = null;
  }

  if (!Array.isArray(deck) || deck.length !== 52) {
    throw createServiceError(
      "Stored Kait deck is invalid.",
      500,
      "KAIT_STORED_DECK_INVALID",
    );
  }

  return deck;
}

async function beginKaitDealing(roundId) {
  const validRoundId = Number(roundId);

  if (!Number.isInteger(validRoundId) || validRoundId < 1) {
    throw createServiceError("Invalid Kait round.", 400, "KAIT_ROUND_INVALID");
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `
          SELECT *

          FROM kait_rounds

          WHERE id = ?

          LIMIT 1

          FOR UPDATE
        `,
      [validRoundId],
    );

    const round = rows[0];

    if (!round) {
      throw createServiceError(
        "Kait round was not found.",
        404,
        "KAIT_ROUND_NOT_FOUND",
      );
    }

    if (round.round_status === "betting") {
      if (new Date(round.betting_ends_at).getTime() > Date.now()) {
        throw createServiceError(
          "Kait betting is still open.",
          409,
          "KAIT_BETTING_STILL_OPEN",
        );
      }

      /* =====================================
         NO BET = NO CARD DISTRIBUTION
      ===================================== */

      if (Number(round.total_bets || 0) < 1) {
        await connection.query(
          `
            UPDATE kait_rounds

            SET
              round_status =
                'completed',

              server_seed_reveal =
                server_seed_secret,

              server_seed_secret =
                NULL,

              resolved_ranks_json =
                '[]',

              settled_at =
                CURRENT_TIMESTAMP(3)

            WHERE id = ?
              AND round_status =
                'betting'
          `,
          [validRoundId],
        );

        await connection.commit();

        return {
          roundId: validRoundId,

          roundCode: round.round_code,

          noBets: true,

          totalBets: 0,

          cardDealIntervalMs: Number(round.card_deal_interval_ms_snapshot),

          lastDealtPosition: 0,

          cards: [],
        };
      }

      /* =====================================
         BET আছে = DEAL START
      ===================================== */

      if (!round.server_seed_secret) {
        throw createServiceError(
          "Kait server seed is missing.",
          500,
          "KAIT_SERVER_SEED_MISSING",
        );
      }

      await connection.query(
        `
          UPDATE kait_rounds

          SET
            round_status =
              'dealing',

            server_seed_reveal =
              server_seed_secret,

            server_seed_secret =
              NULL,

            dealing_started_at =
              CURRENT_TIMESTAMP(3)

          WHERE id = ?
            AND round_status =
              'betting'
        `,
        [validRoundId],
      );

      round.round_status = "dealing";

      round.server_seed_reveal = round.server_seed_secret;

      round.server_seed_secret = null;
    }

    if (round.round_status !== "dealing") {
      throw createServiceError(
        "Kait round is not ready for dealing.",
        409,
        "KAIT_ROUND_NOT_DEALING",
      );
    }

    const deck = parseStoredDeck(round.deck_order_json);

    /*
     * Deck:
     *
     * 1 = FRONT
     * 2 = BACK
     * 3 = FRONT
     * 4 = BACK
     * ...
     */

    const cards = deck.map((card, index) => {
      const deckPosition = index + 1;

      return {
        ...card,

        deckPosition,

        resultSide: getPositionSide(deckPosition),
      };
    });

    await connection.commit();

    return {
      roundId: validRoundId,

      roundCode: round.round_code,

      noBets: false,

      totalBets: Number(round.total_bets || 0),

      serverSeedHash: round.server_seed_hash,

      serverSeedReveal: round.server_seed_reveal,

      cardDealIntervalMs: Number(round.card_deal_interval_ms_snapshot),

      lastDealtPosition: Number(round.last_dealt_position || 0),

      cards,
    };
  } catch (error) {
    await connection.rollback();

    throw error;
  } finally {
    connection.release();
  }
}

async function recordKaitDealCard({ roundId, card }) {
  const validRoundId = Number(roundId);

  if (!Number.isInteger(validRoundId) || validRoundId < 1) {
    throw createServiceError("Invalid Kait round.", 400, "KAIT_ROUND_INVALID");
  }

  const deckPosition = Number(card?.deckPosition);

  if (
    !card?.rank ||
    !card?.code ||
    !card?.suit ||
    !Number.isInteger(deckPosition) ||
    deckPosition < 1 ||
    deckPosition > 52
  ) {
    throw createServiceError("Invalid Kait card.", 400, "KAIT_CARD_INVALID");
  }

  const resultSide = getPositionSide(deckPosition);

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [roundRows] = await connection.query(
      `
          SELECT
            id,
            round_status,
            last_dealt_position

          FROM kait_rounds

          WHERE id = ?

          LIMIT 1

          FOR UPDATE
        `,
      [validRoundId],
    );

    const round = roundRows[0];

    if (!round) {
      throw createServiceError(
        "Kait round was not found.",
        404,
        "KAIT_ROUND_NOT_FOUND",
      );
    }

    if (round.round_status !== "dealing") {
      throw createServiceError(
        "Kait round is not dealing.",
        409,
        "KAIT_ROUND_NOT_DEALING",
      );
    }

    const previousPosition = Number(round.last_dealt_position || 0);

    /*
     * Card অবশ্যই একটার পর একটা।
     */

    if (deckPosition !== previousPosition + 1) {
      throw createServiceError(
        "Kait card sequence is invalid.",
        409,
        "KAIT_CARD_SEQUENCE_INVALID",
      );
    }

    /*
     * এই rank আগে বের না হলে
     * result তৈরি হবে।
     */

    const [insertResult] = await connection.query(
      `
          INSERT IGNORE INTO
            kait_round_rank_results (
              round_id,
              rank_code,
              first_card_code,
              first_card_suit,
              deck_position,
              result_side,
              resolved_at
            )

          VALUES (
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            CURRENT_TIMESTAMP(3)
          )
        `,
      [validRoundId, card.rank, card.code, card.suit, deckPosition, resultSide],
    );

    const newlyResolved =
      insertResult.affectedRows === 1
        ? [
            {
              rankCode: card.rank,

              firstCardCode: card.code,

              firstCardSuit: card.suit,

              deckPosition,

              resultSide,
            },
          ]
        : [];

    const [resultRows] = await connection.query(
      `
          SELECT
            rank_code,
            first_card_code,
            first_card_suit,
            deck_position,
            result_side

          FROM kait_round_rank_results

          WHERE round_id = ?

          ORDER BY
            deck_position ASC
        `,
      [validRoundId],
    );

    const resolvedRanks = resultRows.map((result) => ({
      rankCode: result.rank_code,

      firstCardCode: result.first_card_code,

      firstCardSuit: result.first_card_suit,

      deckPosition: Number(result.deck_position),

      resultSide: result.result_side,
    }));

    const allRanksResolved = resolvedRanks.length === RANKS.length;

    await connection.query(
      `
        UPDATE kait_rounds

        SET
          last_dealt_position = ?,

          resolved_ranks_json = ?,

          dealing_completed_at =
            CASE
              WHEN ? = 1
              THEN CURRENT_TIMESTAMP(3)
              ELSE dealing_completed_at
            END

        WHERE id = ?
      `,
      [
        deckPosition,

        JSON.stringify(resolvedRanks),

        allRanksResolved ? 1 : 0,

        validRoundId,
      ],
    );

    await connection.commit();

    return {
      roundId: validRoundId,

      card: {
        ...card,

        deckPosition,

        resultSide,
      },

      newlyResolved,

      resolvedRanks,

      allRanksResolved,

      lastDealtPosition: deckPosition,

      remainingCards: Math.max(0, 52 - deckPosition),
    };
  } catch (error) {
    await connection.rollback();

    throw error;
  } finally {
    connection.release();
  }
}

async function settleKaitRound(roundId) {
  const validRoundId = Number(roundId);

  if (!Number.isInteger(validRoundId) || validRoundId < 1) {
    throw createServiceError("Invalid Kait round.", 400, "KAIT_ROUND_INVALID");
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [roundRows] = await connection.query(
      `
          SELECT *

          FROM kait_rounds

          WHERE id = ?

          LIMIT 1

          FOR UPDATE
        `,
      [validRoundId],
    );

    const round = roundRows[0];

    if (!round) {
      throw createServiceError(
        "Kait round was not found.",
        404,
        "KAIT_ROUND_NOT_FOUND",
      );
    }

    /*
     * Retry অথবা server restart-এর পরে
     * completed round আবার settle হবে না।
     */
    if (round.round_status === "completed") {
      await connection.commit();

      return {
        roundId: validRoundId,

        roundCode: round.round_code,

        alreadySettled: true,

        totalGrossPayout: normalizeMoney(round.total_gross_payout),

        totalServiceCharge: normalizeMoney(round.total_service_charge),

        totalNetPayout: normalizeMoney(round.total_net_payout),
      };
    }

    if (!["dealing", "settling"].includes(round.round_status)) {
      throw createServiceError(
        "Kait round is not ready for settlement.",
        409,
        "KAIT_ROUND_NOT_SETTLEABLE",
      );
    }

    const [rankRows] = await connection.query(
      `
          SELECT
            rank_code,
            first_card_code,
            first_card_suit,
            deck_position,
            result_side

          FROM kait_round_rank_results

          WHERE round_id = ?

          ORDER BY deck_position ASC

          FOR UPDATE
        `,
      [validRoundId],
    );

    if (rankRows.length !== RANKS.length) {
      throw createServiceError(
        "All Kait ranks are not resolved yet.",
        409,
        "KAIT_RESULTS_INCOMPLETE",
      );
    }

    const resultMap = new Map(
      rankRows.map((result) => [result.rank_code, result]),
    );

    await connection.query(
      `
        UPDATE kait_rounds

        SET round_status =
          'settling'

        WHERE id = ?
          AND round_status =
            'dealing'
      `,
      [validRoundId],
    );

    const [bets] = await connection.query(
      `
          SELECT *

          FROM kait_bets

          WHERE round_id = ?
            AND bet_status =
              'accepted'

          ORDER BY
            user_id ASC,
            id ASC

          FOR UPDATE
        `,
      [validRoundId],
    );

    let winningBets = 0;
    let losingBets = 0;

    let totalGrossPayout = 0;
    let totalServiceCharge = 0;
    let totalNetPayout = 0;

    for (const bet of bets) {
      const result = resultMap.get(bet.selected_rank);

      if (!result) {
        throw createServiceError(
          `Result missing for rank ${bet.selected_rank}.`,
          500,
          "KAIT_BET_RESULT_MISSING",
        );
      }

      /*
       * Back result হলে bet lost।
       * User-এর wallet থেকে bet আগেই কাটা হয়েছে।
       */
      if (result.result_side === "back") {
        const [lostResult] = await connection.query(
          `
              UPDATE kait_bets

              SET
                bet_status =
                  'lost',

                result_side =
                  'back',

                matched_card_code = ?,
                matched_deck_position = ?,

                gross_payout = 0,
                service_charge = 0,
                net_payout = 0,

                balance_after_settlement =
                  balance_after_bet,

                settled_at =
                  CURRENT_TIMESTAMP(3)

              WHERE id = ?
                AND bet_status =
                  'accepted'
            `,
          [result.first_card_code, Number(result.deck_position), bet.id],
        );

        if (lostResult.affectedRows === 1) {
          losingBets += 1;
        }

        continue;
      }

      /*
       * Front result হলে winner।
       */
      const userId = Number(bet.user_id);

      const grossPayout = normalizeMoney(bet.potential_gross_payout);

      const serviceCharge = normalizeMoney(bet.potential_service_charge);

      const netPayout = normalizeMoney(bet.potential_net_payout);

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

      const user = userRows[0];

      if (!user) {
        throw createServiceError(
          "Kait winner user was not found.",
          500,
          "KAIT_WINNER_NOT_FOUND",
        );
      }

      const balanceBefore = normalizeMoney(user.wallet_balance);

      const balanceAfterGross = normalizeMoney(balanceBefore + grossPayout);

      const balanceAfterSettlement = normalizeMoney(balanceBefore + netPayout);

      const payoutTransactionId = createReferenceCode("KT-WIN");

      const chargeTransactionId =
        serviceCharge > 0 ? createReferenceCode("KT-FEE") : null;

      const [creditResult] = await connection.query(
        `
            UPDATE users

            SET wallet_balance =
              wallet_balance + ?

            WHERE id = ?
          `,
        [netPayout, userId],
      );

      if (creditResult.affectedRows !== 1) {
        throw createServiceError(
          "Kait winner payout failed.",
          500,
          "KAIT_WINNER_CREDIT_FAILED",
        );
      }

      /*
       * প্রথম ledger row-এ gross win।
       */
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
            'kait_bet',
            ?,
            ?
          )
        `,
        [
          payoutTransactionId,
          userId,
          grossPayout,
          balanceBefore,
          balanceAfterGross,
          bet.bet_code,
          `Kait ${bet.selected_rank} gross win for round ${round.round_code}`,
        ],
      );

      /*
       * দ্বিতীয় ledger row-এ dynamic
       * service charge।
       */
      if (serviceCharge > 0) {
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
              'service_charge',
              'debit',
              ?,
              ?,
              ?,
              'completed',
              'kait_bet',
              ?,
              ?
            )
          `,
          [
            chargeTransactionId,
            userId,
            serviceCharge,
            balanceAfterGross,
            balanceAfterSettlement,
            bet.bet_code,
            `Kait service charge for round ${round.round_code}`,
          ],
        );
      }

      const [wonResult] = await connection.query(
        `
            UPDATE kait_bets

            SET
              bet_status =
                'won',

              result_side =
                'front',

              matched_card_code = ?,
              matched_deck_position = ?,

              gross_payout = ?,
              service_charge = ?,
              net_payout = ?,

              balance_after_settlement = ?,

              payout_transaction_id = ?,

              service_charge_transaction_id = ?,

              settled_at =
                CURRENT_TIMESTAMP(3)

            WHERE id = ?
              AND bet_status =
                'accepted'
          `,
        [
          result.first_card_code,

          Number(result.deck_position),

          grossPayout,
          serviceCharge,
          netPayout,

          balanceAfterSettlement,

          payoutTransactionId,
          chargeTransactionId,

          bet.id,
        ],
      );

      if (wonResult.affectedRows === 1) {
        winningBets += 1;

        totalGrossPayout = normalizeMoney(totalGrossPayout + grossPayout);

        totalServiceCharge = normalizeMoney(totalServiceCharge + serviceCharge);

        totalNetPayout = normalizeMoney(totalNetPayout + netPayout);
      }
    }

    await connection.query(
      `
        UPDATE kait_rounds

        SET
          round_status =
            'completed',

          total_gross_payout = ?,
          total_service_charge = ?,
          total_net_payout = ?,

          dealing_completed_at =
            COALESCE(
              dealing_completed_at,
              CURRENT_TIMESTAMP(3)
            ),

          settled_at =
            CURRENT_TIMESTAMP(3)

        WHERE id = ?
      `,
      [totalGrossPayout, totalServiceCharge, totalNetPayout, validRoundId],
    );

    await connection.commit();

    return {
      roundId: validRoundId,

      roundCode: round.round_code,

      alreadySettled: false,

      totalBets: bets.length,

      winningBets,
      losingBets,

      totalGrossPayout,
      totalServiceCharge,
      totalNetPayout,
    };
  } catch (error) {
    await connection.rollback();

    throw error;
  } finally {
    connection.release();
  }
}

async function getMyKaitBet({ userId, roundId }) {
  const validUserId = Number(userId);

  const validRoundId = Number(roundId);

  if (!Number.isInteger(validUserId) || validUserId < 1) {
    throw createServiceError("Invalid user.", 401, "KAIT_USER_INVALID");
  }

  if (!Number.isInteger(validRoundId) || validRoundId < 1) {
    return null;
  }

  const [rows] = await pool.query(
    `
        SELECT
          id,
          bet_code,
          round_id,
          user_id,
          selected_rank,

          locked_multiplier,
          bet_amount,

          potential_gross_payout,
          potential_service_charge,
          potential_net_payout,

          bet_status,
          result_side,

          matched_card_code,
          matched_deck_position,

          gross_payout,
          service_charge,
          net_payout,

          balance_before,
          balance_after_bet,
          balance_after_settlement,

          settled_at,
          created_at

        FROM kait_bets

        WHERE round_id = ?
          AND user_id = ?

        LIMIT 1
      `,
    [validRoundId, validUserId],
  );

  const bet = rows[0];

  if (!bet) {
    return null;
  }

  return {
    id: Number(bet.id),

    betCode: bet.bet_code,

    roundId: Number(bet.round_id),

    selectedRank: bet.selected_rank,

    lockedMultiplier: Number(bet.locked_multiplier),

    betAmount: normalizeMoney(bet.bet_amount),

    potentialGrossPayout: normalizeMoney(bet.potential_gross_payout),

    potentialServiceCharge: normalizeMoney(bet.potential_service_charge),

    potentialNetPayout: normalizeMoney(bet.potential_net_payout),

    betStatus: bet.bet_status,

    resultSide: bet.result_side || null,

    matchedCardCode: bet.matched_card_code || null,

    matchedDeckPosition: bet.matched_deck_position
      ? Number(bet.matched_deck_position)
      : null,

    grossPayout: normalizeMoney(bet.gross_payout),

    serviceCharge: normalizeMoney(bet.service_charge),

    netPayout: normalizeMoney(bet.net_payout),

    balanceBefore: normalizeMoney(bet.balance_before),

    balanceAfterBet: normalizeMoney(bet.balance_after_bet),

    balanceAfterSettlement:
      bet.balance_after_settlement !== null
        ? normalizeMoney(bet.balance_after_settlement)
        : null,

    settledAt: bet.settled_at,

    createdAt: bet.created_at,
  };
}

module.exports = {
  createServiceError,
  getSettings,
  findActiveRound,
  ensureCurrentRound,
  getPublicGameState,
  placeKaitBet,
  getMyKaitBet,
  beginKaitDealing,
  recordKaitDealCard,
  settleKaitRound,
};
