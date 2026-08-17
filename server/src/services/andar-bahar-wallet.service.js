"use strict";

const {
  pool,
} = require("../config/database");

const {
  BET_SIDE,
  assertCondition,
  parseMoney,
  parsePositiveInteger,
  normalizeBetSide,
  createReferenceCode,
  getGameSettings,
} = require(
  "./andar-bahar.service",
);

/* =========================================================
   BET ROW MAPPER
========================================================= */

function mapBetRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),

    betCode:
      row.bet_code,

    roundId:
      Number(row.round_id),

    userId:
      Number(row.user_id),

    selectedSide:
      row.selected_side,

    betAmount:
      parseMoney(row.bet_amount),

    betStatus:
      row.bet_status,

    balanceBefore:
      parseMoney(
        row.balance_before,
      ),

    balanceAfterBet:
      parseMoney(
        row.balance_after_bet,
      ),

    grossPayout:
      parseMoney(
        row.gross_payout,
      ),

    serviceCharge:
      parseMoney(
        row.service_charge,
      ),

    netPayout:
      parseMoney(
        row.net_payout,
      ),

    balanceAfterSettlement:
      row.balance_after_settlement ===
      null
        ? null
        : parseMoney(
            row.balance_after_settlement,
          ),

    placedAt:
      row.placed_at || null,

    settledAt:
      row.settled_at || null,

    refundedAt:
      row.refunded_at || null,
  };
}

/* =========================================================
   GET USER BET
========================================================= */

async function getUserRoundBet(
  userId,
  roundId,
  connection = pool,
  options = {},
) {
  const validUserId =
    parsePositiveInteger(userId);

  const validRoundId =
    parsePositiveInteger(roundId);

  assertCondition(
    validUserId,
    "Valid authenticated user ID is required.",
    401,
    "INVALID_AUTHENTICATED_USER",
  );

  assertCondition(
    validRoundId,
    "Valid Andar Bahar round ID is required.",
    400,
    "INVALID_ROUND_ID",
  );

  const lockSuffix =
    options.lock === true
      ? "FOR UPDATE"
      : "";

  const [rows] =
    await connection.query(
      `
        SELECT
          *

        FROM andar_bahar_bets

        WHERE user_id = ?
          AND round_id = ?

        LIMIT 1

        ${lockSuffix}
      `,
      [
        validUserId,
        validRoundId,
      ],
    );

  return mapBetRow(
    rows[0] || null,
  );
}

/* =========================================================
   GET USER ROUND BETS
========================================================= */

async function getUserRoundBets(
  userId,
  roundId,
  connection = pool,
) {
  const validUserId =
    parsePositiveInteger(userId);

  const validRoundId =
    parsePositiveInteger(roundId);

  assertCondition(
    validUserId,
    "Valid authenticated user ID is required.",
    401,
    "INVALID_AUTHENTICATED_USER",
  );

  assertCondition(
    validRoundId,
    "Valid Andar Bahar round ID is required.",
    400,
    "INVALID_ROUND_ID",
  );

  const [rows] =
    await connection.query(
      `
        SELECT
          *

        FROM andar_bahar_bets

        WHERE user_id = ?
          AND round_id = ?

        ORDER BY id ASC
      `,
      [
        validUserId,
        validRoundId,
      ],
    );

  const bets =
    rows.map((row) =>
      mapBetRow(row),
    );

  const summary =
    bets.reduce(
      (result, bet) => {
        const amount =
          parseMoney(
            bet.betAmount,
          );

        result.totalBetAmount =
          parseMoney(
            result.totalBetAmount +
              amount,
          );

        if (
          bet.selectedSide ===
          "andar"
        ) {
          result.andarBetAmount =
            parseMoney(
              result.andarBetAmount +
                amount,
            );
        }

        if (
          bet.selectedSide ===
          "bahar"
        ) {
          result.baharBetAmount =
            parseMoney(
              result.baharBetAmount +
                amount,
            );
        }

        return result;
      },
      {
        totalBets: bets.length,
        totalBetAmount: 0,
        andarBetAmount: 0,
        baharBetAmount: 0,
      },
    );

  return {
    bets,
    summary,
  };
}

/* =========================================================
   PLACE BET
========================================================= */

async function placeBet({
  userId,
  roundId,
  selectedSide,
  betAmount,
}) {
  const validUserId =
    parsePositiveInteger(userId);

  const validRoundId =
    parsePositiveInteger(roundId);

  const validSide =
    normalizeBetSide(
      selectedSide,
    );

  const validBetAmount =
    parseMoney(betAmount);

  assertCondition(
    validUserId,
    "Valid authenticated user ID is required.",
    401,
    "INVALID_AUTHENTICATED_USER",
  );

  assertCondition(
    validRoundId,
    "Valid Andar Bahar round ID is required.",
    400,
    "INVALID_ROUND_ID",
  );

  assertCondition(
    validSide,
    "Bet side must be Andar or Bahar.",
    400,
    "INVALID_BET_SIDE",
  );

  assertCondition(
    validBetAmount > 0,
    "Bet amount must be greater than zero.",
    400,
    "INVALID_BET_AMOUNT",
  );

  const connection =
    await pool.getConnection();

  try {
    await connection.beginTransaction();

    const settings =
      await getGameSettings(
        connection,
        {
          lock: true,
        },
      );

    assertCondition(
      settings.gameEnabled,
      "Andar Bahar is currently disabled.",
      403,
      "GAME_DISABLED",
    );

    assertCondition(
      validBetAmount >=
        settings.minimumBet,
      `Minimum bet is ৳${settings.minimumBet}.`,
      400,
      "BET_BELOW_MINIMUM",
    );

    assertCondition(
      validBetAmount <=
        settings.maximumBet,
      `Maximum bet is ৳${settings.maximumBet}.`,
      400,
      "BET_ABOVE_MAXIMUM",
    );

    /*
     * Round lock করার পাশাপাশি TiDB server time দিয়েই
     * betting countdown যাচাই হবে।
     */
    const [roundRows] =
      await connection.query(
        `
          SELECT
            id,
            round_code,
            round_status,
            betting_closes_at

          FROM andar_bahar_rounds

          WHERE id = ?

          LIMIT 1

          FOR UPDATE
        `,
        [validRoundId],
      );

    const round =
      roundRows[0] || null;

    assertCondition(
      round,
      "Andar Bahar round was not found.",
      404,
      "ROUND_NOT_FOUND",
    );

    assertCondition(
      round.round_status ===
        "betting",
      "Betting is closed for this round.",
      409,
      "BETTING_CLOSED",
    );

    const [timeRows] =
      await connection.query(
        `
          SELECT
            CASE
              WHEN CURRENT_TIMESTAMP(3) <
                ?
              THEN 1
              ELSE 0
            END AS betting_open
        `,
        [
          round.betting_closes_at,
        ],
      );

    assertCondition(
      Number(
        timeRows[0]
          ?.betting_open,
      ) === 1,
      "Betting time has ended.",
      409,
      "BETTING_TIME_ENDED",
    );

        /*
     * Round row ইতিমধ্যে FOR UPDATE lock করা।
     * তাই একই user-এর concurrent bet request combined
     * maximum limit bypass করতে পারবে না।
     */
    const [userRoundTotalRows] =
      await connection.query(
        `
          SELECT
            COALESCE(
              SUM(bet_amount),
              0
            ) AS total_bet_amount

          FROM andar_bahar_bets

          WHERE round_id = ?
            AND user_id = ?
            AND bet_status =
              'accepted'
        `,
        [
          validRoundId,
          validUserId,
        ],
      );

    const currentRoundBetTotal =
      parseMoney(
        userRoundTotalRows[0]
          ?.total_bet_amount ||
        0,
      );

    const combinedRoundBetTotal =
      parseMoney(
        currentRoundBetTotal +
          validBetAmount,
      );

    assertCondition(
      combinedRoundBetTotal <=
        settings.maximumBet,
      `Your total bets in this round cannot exceed ৳${settings.maximumBet}.`,
      409,
      "ROUND_BET_LIMIT_EXCEEDED",
    );

    /*
     * Wallet row lock করার ফলে একই user-এর একাধিক
     * request একসঙ্গে balance খরচ করতে পারবে না।
     */
    const [userRows] =
      await connection.query(
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

    const user =
      userRows[0] || null;

    assertCondition(
      user,
      "Wallet user was not found.",
      404,
      "WALLET_USER_NOT_FOUND",
    );

    assertCondition(
      String(
        user.account_status ||
          "",
      ).toLowerCase() ===
        "active",
      "User account is not active.",
      403,
      "ACCOUNT_INACTIVE",
    );

    const balanceBefore =
      parseMoney(
        user.wallet_balance,
      );

    assertCondition(
      balanceBefore >=
        validBetAmount,
      "Insufficient wallet balance.",
      409,
      "INSUFFICIENT_BALANCE",
    );

    const balanceAfterBet =
      parseMoney(
        balanceBefore -
          validBetAmount,
      );

    const betCode =
      createReferenceCode(
        "AB_BET",
      );

    const transactionId =
      createReferenceCode(
        "AB_DEBIT",
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
            AND account_status =
              'active'
            AND wallet_balance >= ?
        `,
        [
          validBetAmount,
          validBetAmount,
          validUserId,
          validBetAmount,
        ],
      );

    assertCondition(
      walletResult.affectedRows ===
        1,
      "Andar Bahar bet debit failed.",
      409,
      "BET_DEBIT_FAILED",
    );

    const [betResult] =
      await connection.query(
        `
          INSERT INTO andar_bahar_bets (
            bet_code,
            round_id,
            user_id,
            selected_side,
            bet_amount,
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
          validSide,
          validBetAmount,
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
          'andar_bahar_bet',
          ?,
          ?
        )
      `,
      [
        transactionId,
        validUserId,
        validBetAmount,
        balanceBefore,
        balanceAfterBet,
        betCode,
        `Andar Bahar ${validSide} bet for round ${round.round_code}`,
      ],
    );

    const totalColumn =
      validSide ===
      BET_SIDE.ANDAR
        ? "total_andar_bet"
        : "total_bahar_bet";

    /*
     * Column name user input থেকে নেওয়া হয়নি।
     * এটি উপরের trusted constant থেকে নির্ধারিত।
     */
    await connection.query(
      `
        UPDATE andar_bahar_rounds

        SET
          ${totalColumn} =
            ${totalColumn} + ?,

          total_bet_amount =
            total_bet_amount + ?

        WHERE id = ?
      `,
      [
        validBetAmount,
        validBetAmount,
        validRoundId,
      ],
    );

    const [createdBetRows] =
      await connection.query(
        `
          SELECT
            *

          FROM andar_bahar_bets

          WHERE id = ?

          LIMIT 1
        `,
        [betResult.insertId],
      );

    await connection.commit();

    return {
      bet:
        mapBetRow(
          createdBetRows[0],
        ),

           wallet: {
        balanceBefore,
        balanceAfter:
          balanceAfterBet,
      },

      roundBetSummary: {
        previousTotal:
          currentRoundBetTotal,

        newTotal:
          combinedRoundBetTotal,

        maximumTotal:
          settings.maximumBet,

        remainingLimit:
          parseMoney(
            settings.maximumBet -
            combinedRoundBetTotal,
          ),
      },
    };
  } catch (error) {
    await connection.rollback();

    throw error;
  } finally {
    connection.release();
  }
}

/* =========================================================
   GET BET TOTALS
========================================================= */

async function getRoundBetTotals(
  roundId,
) {
  const validRoundId =
    parsePositiveInteger(roundId);

  assertCondition(
    validRoundId,
    "Valid Andar Bahar round ID is required.",
    400,
    "INVALID_ROUND_ID",
  );

  const [rows] =
    await pool.query(
      `
        SELECT
          COUNT(*) AS total_bets,

          COALESCE(
            SUM(
              CASE
                WHEN selected_side =
                  'andar'
                THEN 1
                ELSE 0
              END
            ),
            0
          ) AS andar_players,

          COALESCE(
            SUM(
              CASE
                WHEN selected_side =
                  'bahar'
                THEN 1
                ELSE 0
              END
            ),
            0
          ) AS bahar_players,

          COALESCE(
            SUM(
              CASE
                WHEN selected_side =
                  'andar'
                THEN bet_amount
                ELSE 0
              END
            ),
            0
          ) AS total_andar_bet,

          COALESCE(
            SUM(
              CASE
                WHEN selected_side =
                  'bahar'
                THEN bet_amount
                ELSE 0
              END
            ),
            0
          ) AS total_bahar_bet

        FROM andar_bahar_bets

        WHERE round_id = ?
          AND bet_status IN (
            'accepted',
            'won',
            'lost'
          )
      `,
      [validRoundId],
    );

  const totals =
    rows[0] || {};

  return {
    totalBets:
      Number(
        totals.total_bets || 0,
      ),

    andarPlayers:
      Number(
        totals.andar_players || 0,
      ),

    baharPlayers:
      Number(
        totals.bahar_players || 0,
      ),

    totalAndarBet:
      parseMoney(
        totals.total_andar_bet,
      ),

    totalBaharBet:
      parseMoney(
        totals.total_bahar_bet,
      ),
  };
}

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  mapBetRow,
  getUserRoundBet,
  getUserRoundBets,
  placeBet,
  getRoundBetTotals,
};