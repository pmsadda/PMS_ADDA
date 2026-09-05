"use strict";

const crypto = require("crypto");

const { pool } = require("../config/database");

const {
  ROUND_STATUS,
  createGameError,
  calculateAviatorMultiplier,
} = require("./aviator.service");

/* ==========================
   Helpers
========================== */

function parsePositiveInteger(value) {
  const number = Number(value);

  if (!Number.isInteger(number) || number <= 0) {
    return null;
  }

  return number;
}

function parseMoney(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return 0;
  }

  return Number(number.toFixed(2));
}

function createTransactionId() {
  const time = Date.now().toString(36).toUpperCase();

  const random = crypto.randomBytes(6).toString("hex").toUpperCase();

  return `AVB${time}${random}`;
}

function mapBetRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),

    roundId: Number(row.round_id),

    userId: Number(row.user_id),

    betSlot: Number(row.bet_slot),

    betAmount: Number(row.bet_amount),

    autoCashoutMultiplier:
      row.auto_cashout_multiplier !== null
        ? Number(row.auto_cashout_multiplier)
        : null,

    cashoutMultiplier:
      row.cashout_multiplier !== null ? Number(row.cashout_multiplier) : null,

    payoutAmount: Number(row.payout_amount || 0),

    status: String(row.status),

    placedAt: row.placed_at,

    cashedOutAt: row.cashed_out_at,
  };
}

/* ==========================
   Place Bet
========================== */

async function placeBet({
  userId,
  roundId,
  betSlot = 1,
  betAmount,
  autoCashoutMultiplier = null,
}) {
  const validUserId = parsePositiveInteger(userId);

  const validRoundId = parsePositiveInteger(roundId);

  const validBetSlot = Number(betSlot);

  const validBetAmount = parseMoney(betAmount);

  if (!validUserId) {
    throw createGameError(
      "Valid authenticated user is required.",
      401,
      "AVIATOR_INVALID_USER",
    );
  }

  if (!validRoundId) {
    throw createGameError(
      "Valid Aviator round is required.",
      400,
      "AVIATOR_INVALID_ROUND",
    );
  }

  if (validBetSlot !== 1 && validBetSlot !== 2) {
    throw createGameError(
      "Bet slot must be 1 or 2.",
      400,
      "AVIATOR_INVALID_BET_SLOT",
    );
  }

  if (validBetAmount <= 0) {
    throw createGameError(
      "Bet amount must be greater than zero.",
      400,
      "AVIATOR_INVALID_BET_AMOUNT",
    );
  }

  let validAutoCashout = null;

  if (
    autoCashoutMultiplier !== null &&
    autoCashoutMultiplier !== undefined &&
    String(autoCashoutMultiplier).trim() !== ""
  ) {
    validAutoCashout = Number(Number(autoCashoutMultiplier).toFixed(2));

    if (!Number.isFinite(validAutoCashout) || validAutoCashout < 1.01) {
      throw createGameError(
        "Auto cash out must be at least 1.01x.",
        400,
        "AVIATOR_INVALID_AUTO_CASHOUT",
      );
    }
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    /* ==========================
       Lock Round
    ========================== */

    const [roundRows] = await connection.execute(
      `
          SELECT
            id,
            round_code,
            status,

            min_bet,
            max_bet,
            max_payout,
            max_multiplier,

            betting_ends_at,

           ROUND(
  UNIX_TIMESTAMP(
    betting_ends_at
  ) * 1000
) AS betting_ends_at_ms,

ROUND(
  UNIX_TIMESTAMP(
    CURRENT_TIMESTAMP(3)
  ) * 1000
) AS db_now_ms

          FROM aviator_rounds

          WHERE id = ?

          LIMIT 1

          FOR UPDATE
        `,
      [validRoundId],
    );

    const round = roundRows[0] || null;

    if (!round) {
      throw createGameError(
        "Aviator round not found.",
        404,
        "AVIATOR_ROUND_NOT_FOUND",
      );
    }

    if (round.status !== ROUND_STATUS.BETTING) {
      throw createGameError(
        "Betting is closed for this round.",
        409,
        "AVIATOR_BETTING_CLOSED",
      );
    }

    const bettingEndsAtMs =
  Number(
    round.betting_ends_at_ms || 0,
  );

const dbNowMs =
  Number(
    round.db_now_ms || 0,
  );

if (
  bettingEndsAtMs > 0 &&
  dbNowMs >= bettingEndsAtMs
) {
      throw createGameError(
        "Betting time has ended.",
        409,
        "AVIATOR_BETTING_TIME_ENDED",
      );
    }

    const minimumBet = parseMoney(round.min_bet);

    const maximumBet = parseMoney(round.max_bet);

    const maxMultiplier = Number(round.max_multiplier || 1000);

    if (validBetAmount < minimumBet) {
      throw createGameError(
        `Minimum bet is ৳${minimumBet.toFixed(2)}.`,
        400,
        "AVIATOR_BET_BELOW_MINIMUM",
      );
    }

    if (validBetAmount > maximumBet) {
      throw createGameError(
        `Maximum bet is ৳${maximumBet.toFixed(2)}.`,
        400,
        "AVIATOR_BET_ABOVE_MAXIMUM",
      );
    }

    if (validAutoCashout !== null && validAutoCashout > maxMultiplier) {
      throw createGameError(
        `Auto cash out cannot exceed ${maxMultiplier.toFixed(2)}x.`,
        400,
        "AVIATOR_AUTO_CASHOUT_TOO_HIGH",
      );
    }

    /* ==========================
       Duplicate Slot Check
    ========================== */

    const [existingRows] = await connection.execute(
      `
          SELECT
            id
          FROM aviator_bets
          WHERE round_id = ?
            AND user_id = ?
            AND bet_slot = ?
          LIMIT 1
          FOR UPDATE
        `,
      [validRoundId, validUserId, validBetSlot],
    );

    if (existingRows.length > 0) {
      throw createGameError(
        `Bet slot ${validBetSlot} is already used for this round.`,
        409,
        "AVIATOR_BET_SLOT_ALREADY_USED",
      );
    }

    /* ==========================
       Lock User Wallet
    ========================== */

    const [userRows] = await connection.execute(
      `
          SELECT
            id,
            wallet_balance,
            account_status
          FROM users
          WHERE id = ?
          LIMIT 1
          FOR UPDATE
        `,
      [validUserId],
    );

    const user = userRows[0] || null;

    if (!user) {
      throw createGameError("User not found.", 404, "AVIATOR_USER_NOT_FOUND");
    }

    if (String(user.account_status).toLowerCase() !== "active") {
      throw createGameError(
        "Your account is not active.",
        403,
        "AVIATOR_ACCOUNT_INACTIVE",
      );
    }

    const balanceBefore = parseMoney(user.wallet_balance);

    if (balanceBefore < validBetAmount) {
      throw createGameError(
        "Insufficient wallet balance.",
        409,
        "AVIATOR_INSUFFICIENT_BALANCE",
      );
    }

    const balanceAfter = parseMoney(balanceBefore - validBetAmount);

    /* ==========================
       Debit Wallet
    ========================== */

    const [walletResult] = await connection.execute(
      `
          UPDATE users

          SET wallet_balance =
            ROUND(
              wallet_balance - ?,
              2
            )

          WHERE id = ?
            AND account_status = 'active'
            AND wallet_balance >= ?
        `,
      [validBetAmount, validUserId, validBetAmount],
    );

    if (walletResult.affectedRows !== 1) {
      throw createGameError(
        "Aviator bet wallet debit failed.",
        409,
        "AVIATOR_WALLET_DEBIT_FAILED",
      );
    }

    /* ==========================
       Insert Bet
    ========================== */

    const [betResult] = await connection.execute(
      `
          INSERT INTO aviator_bets (
            round_id,
            user_id,
            bet_slot,
            bet_amount,
            auto_cashout_multiplier,
            payout_amount,
            status,
            placed_at
          )
          VALUES (
            ?,
            ?,
            ?,
            ?,
            ?,
            0.00,
            'placed',
            CURRENT_TIMESTAMP(3)
          )
        `,
      [
        validRoundId,
        validUserId,
        validBetSlot,
        validBetAmount,
        validAutoCashout,
      ],
    );

    const betId = Number(betResult.insertId);

    /* ==========================
       Wallet Transaction
    ========================== */

    const transactionId = createTransactionId();

    await connection.execute(
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
          'aviator_bet',
          ?,
          ?,
          NULL
        )
      `,
      [
        transactionId,
        validUserId,
        validBetAmount,
        balanceBefore,
        balanceAfter,
        String(betId),
        `Aviator bet slot ${validBetSlot} for round ${round.round_code}`,
      ],
    );

    /* ==========================
       Round Total Bet
    ========================== */

    await connection.execute(
      `
        UPDATE aviator_rounds
        SET
          total_bet_amount =
            ROUND(
              total_bet_amount + ?,
              2
            )
        WHERE id = ?
      `,
      [validBetAmount, validRoundId],
    );

    const [savedRows] = await connection.execute(
      `
          SELECT
            id,
            round_id,
            user_id,
            bet_slot,
            bet_amount,
            auto_cashout_multiplier,
            cashout_multiplier,
            payout_amount,
            status,
            placed_at,
            cashed_out_at
          FROM aviator_bets
          WHERE id = ?
          LIMIT 1
        `,
      [betId],
    );

    await connection.commit();

    return {
      bet: mapBetRow(savedRows[0]),

      wallet: {
        balanceBefore,
        balanceAfter,
      },

      transactionId,
    };
  } catch (error) {
    await connection.rollback();

    if (error.code === "ER_DUP_ENTRY") {
      throw createGameError(
        "This Aviator bet slot is already used.",
        409,
        "AVIATOR_BET_ALREADY_EXISTS",
      );
    }

    throw error;
  } finally {
    connection.release();
  }
}

/* ==========================
   Cash Out Bet
========================== */

async function cashOutBet({ userId, roundId, betSlot = 1 }) {
  const validUserId = parsePositiveInteger(userId);

  const validRoundId = parsePositiveInteger(roundId);

  const validBetSlot = Number(betSlot);

  if (!validUserId) {
    throw createGameError(
      "Valid authenticated user is required.",
      401,
      "AVIATOR_INVALID_USER",
    );
  }

  if (!validRoundId) {
    throw createGameError(
      "Valid Aviator round is required.",
      400,
      "AVIATOR_INVALID_ROUND",
    );
  }

  if (validBetSlot !== 1 && validBetSlot !== 2) {
    throw createGameError(
      "Bet slot must be 1 or 2.",
      400,
      "AVIATOR_INVALID_BET_SLOT",
    );
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    /* ==========================
       Lock Round
    ========================== */

    const [roundRows] = await connection.execute(
      `
          SELECT
            id,
            round_code,
            status,
            crash_multiplier,
            max_payout,

            ROUND(
  UNIX_TIMESTAMP(
    flight_started_at
  ) * 1000
) AS flight_started_at_ms,

ROUND(
  UNIX_TIMESTAMP(
    CURRENT_TIMESTAMP(3)
  ) * 1000
) AS db_now_ms

          FROM aviator_rounds

          WHERE id = ?

          LIMIT 1

          FOR UPDATE
        `,
      [validRoundId],
    );

    const round = roundRows[0] || null;

    if (!round) {
      throw createGameError(
        "Aviator round not found.",
        404,
        "AVIATOR_ROUND_NOT_FOUND",
      );
    }

    if (round.status !== ROUND_STATUS.FLYING) {
      throw createGameError(
        "Aviator is not flying.",
        409,
        "AVIATOR_NOT_FLYING",
      );
    }

    const crashMultiplier = Number(round.crash_multiplier);

    const currentMultiplier =
  calculateAviatorMultiplier(
    Number(
      round.flight_started_at_ms,
    ),
    Number(
      round.db_now_ms,
    ),
  );

    /*
     * DB status এখনো flying হলেও
     * crash point পৌঁছে গেলে
     * cash out দেওয়া হবে না।
     */
    if (currentMultiplier >= crashMultiplier) {
      throw createGameError(
        "Too late. The plane has crashed.",
        409,
        "AVIATOR_ALREADY_CRASHED",
      );
    }

    /* ==========================
       Lock Bet
    ========================== */

    const [betRows] = await connection.execute(
      `
          SELECT
            id,
            round_id,
            user_id,
            bet_slot,
            bet_amount,
            auto_cashout_multiplier,
            cashout_multiplier,
            payout_amount,
            status,
            placed_at,
            cashed_out_at

          FROM aviator_bets

          WHERE round_id = ?
            AND user_id = ?
            AND bet_slot = ?

          LIMIT 1

          FOR UPDATE
        `,
      [validRoundId, validUserId, validBetSlot],
    );

    const bet = betRows[0] || null;

    if (!bet) {
      throw createGameError(
        "Aviator bet not found.",
        404,
        "AVIATOR_BET_NOT_FOUND",
      );
    }

    /*
     * Duplicate cash out request হলে
     * দ্বিতীয়বার টাকা credit হবে না।
     */
    if (bet.status === "cashed_out") {
      const [walletRows] = await connection.execute(
        `
            SELECT wallet_balance
            FROM users
            WHERE id = ?
            LIMIT 1
          `,
        [validUserId],
      );

      await connection.commit();

      return {
        bet: mapBetRow(bet),

        wallet: {
          balanceAfter: parseMoney(walletRows[0]?.wallet_balance),
        },

        alreadyCashedOut: true,
      };
    }

    if (bet.status !== "placed") {
      throw createGameError(
        "This bet cannot be cashed out.",
        409,
        "AVIATOR_BET_NOT_ACTIVE",
      );
    }

    /* ==========================
       Calculate Payout
    ========================== */

    const betAmount = parseMoney(bet.bet_amount);

    const maximumPayout = parseMoney(round.max_payout);

    const calculatedPayout = parseMoney(betAmount * currentMultiplier);

    const payoutAmount = Math.min(calculatedPayout, maximumPayout);

    /* ==========================
       Lock Wallet
    ========================== */

    const [userRows] = await connection.execute(
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
      throw createGameError(
        "User wallet not found.",
        404,
        "AVIATOR_USER_NOT_FOUND",
      );
    }

    const balanceBefore = parseMoney(user.wallet_balance);

    const balanceAfter = parseMoney(balanceBefore + payoutAmount);

    /* ==========================
       Credit Wallet
    ========================== */

    const [walletResult] = await connection.execute(
      `
          UPDATE users

          SET wallet_balance =
            ROUND(
              wallet_balance + ?,
              2
            )

          WHERE id = ?
        `,
      [payoutAmount, validUserId],
    );

    if (walletResult.affectedRows !== 1) {
      throw createGameError(
        "Aviator cash out credit failed.",
        409,
        "AVIATOR_CASHOUT_CREDIT_FAILED",
      );
    }

    /* ==========================
       Mark Bet Cashed Out
    ========================== */

    const [betUpdateResult] = await connection.execute(
      `
          UPDATE aviator_bets

          SET
            cashout_multiplier = ?,
            payout_amount = ?,
            status = 'cashed_out',
           cashed_out_at =
  CURRENT_TIMESTAMP(3)

          WHERE id = ?
            AND status = 'placed'
        `,
      [currentMultiplier, payoutAmount, Number(bet.id)],
    );

    if (betUpdateResult.affectedRows !== 1) {
      throw createGameError(
        "Aviator bet cash out failed.",
        409,
        "AVIATOR_CASHOUT_ALREADY_PROCESSED",
      );
    }

    /* ==========================
       Wallet Transaction
    ========================== */

    const transactionId = createTransactionId();

    await connection.execute(
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
          'aviator_bet',
          ?,
          ?,
          NULL
        )
      `,
      [
        transactionId,
        validUserId,
        payoutAmount,
        balanceBefore,
        balanceAfter,
        String(bet.id),
        `Aviator cash out ${currentMultiplier.toFixed(
          2,
        )}x for round ${round.round_code}`,
      ],
    );

    /* ==========================
       Round Total Payout
    ========================== */

    await connection.execute(
      `
        UPDATE aviator_rounds

        SET total_payout_amount =
          ROUND(
            total_payout_amount + ?,
            2
          )

        WHERE id = ?
      `,
      [payoutAmount, validRoundId],
    );

    /* ==========================
       Read Updated Bet
    ========================== */

    const [savedRows] = await connection.execute(
      `
          SELECT
            id,
            round_id,
            user_id,
            bet_slot,
            bet_amount,
            auto_cashout_multiplier,
            cashout_multiplier,
            payout_amount,
            status,
            placed_at,
            cashed_out_at

          FROM aviator_bets

          WHERE id = ?

          LIMIT 1
        `,
      [Number(bet.id)],
    );

    await connection.commit();

    return {
      bet: mapBetRow(savedRows[0]),

      multiplier: currentMultiplier,

      payoutAmount,

      wallet: {
        balanceBefore,
        balanceAfter,
      },

      transactionId,

      alreadyCashedOut: false,
    };
  } catch (error) {
    await connection.rollback();

    throw error;
  } finally {
    connection.release();
  }
}

/* ==========================
   Mark Crashed Bets Lost
========================== */

/* ==========================
   Process Auto Cash Outs
========================== */

async function processAutoCashouts(roundId) {
  const validRoundId = parsePositiveInteger(roundId);

  if (!validRoundId) {
    throw createGameError(
      "Valid Aviator round is required.",
      400,
      "AVIATOR_INVALID_ROUND",
    );
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    /* ==========================
       Lock Round
    ========================== */

    const [roundRows] = await connection.execute(
      `
          SELECT
            id,
            round_code,
            status,
            crash_multiplier,
            max_payout,

           ROUND(
  UNIX_TIMESTAMP(
    flight_started_at
  ) * 1000
) AS flight_started_at_ms,

ROUND(
  UNIX_TIMESTAMP(
    CURRENT_TIMESTAMP(3)
  ) * 1000
) AS db_now_ms

          FROM aviator_rounds

          WHERE id = ?

          LIMIT 1

          FOR UPDATE
        `,
      [validRoundId],
    );

    const round = roundRows[0] || null;

    if (!round) {
      throw createGameError(
        "Aviator round not found.",
        404,
        "AVIATOR_ROUND_NOT_FOUND",
      );
    }

    /*
     * Round already finished হলে
     * retry-safe ভাবে কিছু করব না।
     */
    if (round.status !== ROUND_STATUS.FLYING) {
      await connection.commit();

      return {
        roundId: validRoundId,

        processed: 0,

        totalPayout: 0,
      };
    }

    const crashMultiplier = Number(round.crash_multiplier);

    const currentMultiplier =
  calculateAviatorMultiplier(
    Number(
      round.flight_started_at_ms,
    ),
    Number(
      round.db_now_ms,
    ),
  );

    /*
     * IMPORTANT:
     *
     * Auto cashout threshold অবশ্যই
     * crash point-এর নিচে হতে হবে।
     *
     * currentMultiplier crash point
     * পার হয়ে গেলেও threshold যদি
     * crash-এর আগে থাকে, সেটি valid।
     */
    const [betRows] = await connection.execute(
      `
          SELECT
            id,
            user_id,
            bet_amount,
            auto_cashout_multiplier

          FROM aviator_bets

          WHERE round_id = ?
            AND status = 'placed'

            AND
              auto_cashout_multiplier
              IS NOT NULL

            AND
              auto_cashout_multiplier
              <= ?

            AND
              auto_cashout_multiplier
              < ?

          ORDER BY id ASC

          FOR UPDATE
        `,
      [validRoundId, currentMultiplier, crashMultiplier],
    );

    if (betRows.length === 0) {
      await connection.commit();

      return {
        roundId: validRoundId,

        processed: 0,

        totalPayout: 0,

        currentMultiplier,
      };
    }

    const maximumPayout = parseMoney(round.max_payout);

    let processed = 0;
    let totalPayout = 0;

    for (const bet of betRows) {
      const betId = Number(bet.id);

      const userId = Number(bet.user_id);

      const betAmount = parseMoney(bet.bet_amount);

      const autoMultiplier = Number(bet.auto_cashout_multiplier);

      /*
       * Auto cashout payout সবসময়
       * requested auto multiplier-এ।
       *
       * Tick-এর current multiplier-এ নয়।
       */
      const calculatedPayout = parseMoney(betAmount * autoMultiplier);

      const payoutAmount = Math.min(calculatedPayout, maximumPayout);

      /* ==========================
         Lock User Wallet
      ========================== */

      const [userRows] = await connection.execute(
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
        throw createGameError(
          "Auto cash out user not found.",
          404,
          "AVIATOR_USER_NOT_FOUND",
        );
      }

      const balanceBefore = parseMoney(user.wallet_balance);

      const balanceAfter = parseMoney(balanceBefore + payoutAmount);

      /* ==========================
         Credit Wallet
      ========================== */

      const [walletResult] = await connection.execute(
        `
            UPDATE users

            SET wallet_balance =
              ROUND(
                wallet_balance + ?,
                2
              )

            WHERE id = ?
          `,
        [payoutAmount, userId],
      );

      if (walletResult.affectedRows !== 1) {
        throw createGameError(
          "Auto cash out wallet credit failed.",
          409,
          "AVIATOR_AUTO_CASHOUT_CREDIT_FAILED",
        );
      }

      /* ==========================
         Mark Bet Cashed Out
      ========================== */

      const [betResult] = await connection.execute(
        `
            UPDATE aviator_bets

            SET
              cashout_multiplier = ?,
              payout_amount = ?,
              status = 'cashed_out',

              cashed_out_at =
  CURRENT_TIMESTAMP(3)

            WHERE id = ?
              AND status = 'placed'
          `,
        [autoMultiplier, payoutAmount, betId],
      );

      if (betResult.affectedRows !== 1) {
        throw createGameError(
          "Auto cash out bet update failed.",
          409,
          "AVIATOR_AUTO_CASHOUT_ALREADY_PROCESSED",
        );
      }

      /* ==========================
         Wallet Ledger
      ========================== */

      const transactionId = createTransactionId();

      await connection.execute(
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
            'aviator_bet',
            ?,
            ?,
            NULL
          )
        `,
        [
          transactionId,
          userId,
          payoutAmount,
          balanceBefore,
          balanceAfter,
          String(betId),
          `Aviator auto cash out ${autoMultiplier.toFixed(
            2,
          )}x for round ${round.round_code}`,
        ],
      );

      processed += 1;

      totalPayout = parseMoney(totalPayout + payoutAmount);
    }

    /* ==========================
       Round Total Payout
    ========================== */

    if (totalPayout > 0) {
      await connection.execute(
        `
          UPDATE aviator_rounds

          SET total_payout_amount =
            ROUND(
              total_payout_amount + ?,
              2
            )

          WHERE id = ?
        `,
        [totalPayout, validRoundId],
      );
    }

    await connection.commit();

    return {
      roundId: validRoundId,

      processed,

      totalPayout,

      currentMultiplier,
    };
  } catch (error) {
    await connection.rollback();

    throw error;
  } finally {
    connection.release();
  }
}

/* ==========================
   Cancel Round + Refund
========================== */

async function cancelRoundAndRefund({ roundId, adminId = null }) {
  const validRoundId = parsePositiveInteger(roundId);

  const validAdminId = adminId !== null ? parsePositiveInteger(adminId) : null;

  if (!validRoundId) {
    throw createGameError(
      "Valid Aviator round is required.",
      400,
      "AVIATOR_INVALID_ROUND",
    );
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    /* ==========================
       Lock Round
    ========================== */

    const [roundRows] = await connection.execute(
      `
          SELECT
            id,
            round_code,
            status
          FROM aviator_rounds
          WHERE id = ?
          LIMIT 1
          FOR UPDATE
        `,
      [validRoundId],
    );

    const round = roundRows[0] || null;

    if (!round) {
      throw createGameError(
        "Aviator round not found.",
        404,
        "AVIATOR_ROUND_NOT_FOUND",
      );
    }

    /*
     * Crashed round refund করা যাবে না।
     * Betting / Flying / already Cancelled
     * round repair-safe ভাবে process করা যাবে।
     */
    if (round.status === ROUND_STATUS.CRASHED) {
      throw createGameError(
        "Crashed Aviator round cannot be cancelled.",
        409,
        "AVIATOR_ROUND_ALREADY_CRASHED",
      );
    }

    /* ==========================
       Lock Active Bets
    ========================== */

    const [betRows] = await connection.execute(
      `
          SELECT
            id,
            user_id,
            bet_slot,
            bet_amount,
            status
          FROM aviator_bets
          WHERE round_id = ?
            AND status = 'placed'
          ORDER BY id ASC
          FOR UPDATE
        `,
      [validRoundId],
    );

    let refundedBets = 0;
    let totalRefund = 0;

    for (const bet of betRows) {
      const betId = Number(bet.id);

      const userId = Number(bet.user_id);

      const refundAmount = parseMoney(bet.bet_amount);

      /* ==========================
         Lock User Wallet
      ========================== */

      const [userRows] = await connection.execute(
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
        throw createGameError(
          "Refund user not found.",
          404,
          "AVIATOR_REFUND_USER_NOT_FOUND",
        );
      }

      const balanceBefore = parseMoney(user.wallet_balance);

      const balanceAfter = parseMoney(balanceBefore + refundAmount);

      /* ==========================
         Credit Refund
      ========================== */

      const [walletResult] = await connection.execute(
        `
            UPDATE users
            SET wallet_balance =
              ROUND(
                wallet_balance + ?,
                2
              )
            WHERE id = ?
          `,
        [refundAmount, userId],
      );

      if (walletResult.affectedRows !== 1) {
        throw createGameError(
          "Aviator refund credit failed.",
          409,
          "AVIATOR_REFUND_CREDIT_FAILED",
        );
      }

      /* ==========================
         Mark Bet Cancelled
      ========================== */

      const [betResult] = await connection.execute(
        `
            UPDATE aviator_bets
            SET
              status = 'cancelled',
              payout_amount = 0.00
            WHERE id = ?
              AND status = 'placed'
          `,
        [betId],
      );

      if (betResult.affectedRows !== 1) {
        throw createGameError(
          "Aviator refund bet update failed.",
          409,
          "AVIATOR_REFUND_BET_FAILED",
        );
      }

      /* ==========================
         Wallet Ledger
      ========================== */

      const transactionId = createTransactionId();

      await connection.execute(
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
            'game_refund',
            'credit',
            ?,
            ?,
            ?,
            'completed',
           'aviator_bet',
?,
?,
?
          )
        `,
       [
  transactionId,
  userId,
  refundAmount,
  balanceBefore,
  balanceAfter,
  String(betId),
  `Aviator cancelled round refund ${round.round_code}`,
  validAdminId,
],
      );

      refundedBets += 1;

      totalRefund = parseMoney(totalRefund + refundAmount);
    }

    /* ==========================
       Cancel Round
    ========================== */

    await connection.execute(
      `
        UPDATE aviator_rounds
        SET status = 'cancelled'
        WHERE id = ?
          AND status IN (
            'betting',
            'flying'
          )
      `,
      [validRoundId],
    );

    await connection.commit();

    return {
      roundId: validRoundId,

      roundCode: round.round_code,

      refundedBets,

      totalRefund,

      status: "cancelled",
    };
  } catch (error) {
    await connection.rollback();

    throw error;
  } finally {
    connection.release();
  }
}

/* ==========================
   Get Player Aviator State
========================== */

async function getPlayerAviatorState({ userId }) {
  const validUserId = parsePositiveInteger(userId);

  if (!validUserId) {
    throw createGameError(
      "Valid authenticated user is required.",
      401,
      "AVIATOR_INVALID_USER",
    );
  }

  const [userRows] = await pool.query(
  `
  SELECT
    id,
    wallet_balance,
    account_status
  FROM users
  WHERE id = ?
  LIMIT 1
  `,
  [validUserId],
);

  const user = userRows[0];

  if (!user) {
    throw createGameError(
      "User was not found.",
      404,
      "AVIATOR_USER_NOT_FOUND",
    );
  }

  if (
  String(
    user.account_status || "",
  ).toLowerCase() !== "active"
) {
    throw createGameError(
      "User account is not active.",
      403,
      "AVIATOR_USER_INACTIVE",
    );
  }

  const [roundRows] = await pool.query(
    `
      SELECT
        id,
        round_code,
        status
      FROM aviator_rounds
      WHERE status IN (
        'betting',
        'flying'
      )
      ORDER BY id DESC
      LIMIT 1
    `,
  );

  const activeRound = roundRows[0] || null;

  let bets = [];

  if (activeRound) {
    const [betRows] = await pool.query(
      `
        SELECT *
        FROM aviator_bets
        WHERE round_id = ?
          AND user_id = ?
        ORDER BY bet_slot ASC
      `,
      [
        Number(activeRound.id),
        validUserId,
      ],
    );

    bets = betRows.map(mapBetRow);
  }

  return {
    walletBalance: parseMoney(user.wallet_balance),

    round: activeRound
      ? {
          id: Number(activeRound.id),
          roundCode: String(activeRound.round_code),
          status: String(activeRound.status),
        }
      : null,

    bets,
  };
}

/* ==========================
   Exports
========================== */

module.exports = {
  placeBet,
  cashOutBet,
  processAutoCashouts,
  cancelRoundAndRefund,
  getPlayerAviatorState,
  mapBetRow,
};