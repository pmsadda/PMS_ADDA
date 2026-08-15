"use strict";

const {
  pool,
} = require("../config/database");

const {
  assertCondition,
  parseMoney,
  parsePositiveInteger,
  createReferenceCode,
  getGameSettings,
  getAnimalById
} = require(
  "./bangla-wheel.service"
);

/* =========================================================
   BET MAPPER
========================================================= */

function mapBetRow(row) {
  if (!row) {
    return null;
  }

  return {
    id:
      Number(row.id),

    betCode:
      row.bet_code,

    roundId:
      Number(
        row.round_id
      ),

    userId:
      Number(
        row.user_id
      ),

    selectedAnimalId:
      Number(
        row
          .selected_animal_id
      ),

    selectedAnimalCode:
      row
        .selected_animal_code,

    selectedAnimalName:
      row
        .selected_animal_name,

    lockedMultiplier:
      parseMoney(
        row
          .locked_multiplier
      ),

    betAmount:
      parseMoney(
        row.bet_amount
      ),

    potentialGrossPayout:
      parseMoney(
        row
          .potential_gross_payout
      ),

    potentialServiceCharge:
      parseMoney(
        row
          .potential_service_charge
      ),

    potentialNetPayout:
      parseMoney(
        row
          .potential_net_payout
      ),

    betStatus:
      row.bet_status,

    balanceBefore:
      parseMoney(
        row.balance_before
      ),

    balanceAfterBet:
      parseMoney(
        row.balance_after_bet
      ),

    grossPayout:
      parseMoney(
        row.gross_payout
      ),

    serviceCharge:
      parseMoney(
        row.service_charge
      ),

    netPayout:
      parseMoney(
        row.net_payout
      ),

    balanceAfterSettlement:
      row
        .balance_after_settlement ===
      null
        ? null
        : parseMoney(
            row
              .balance_after_settlement
          ),

    placedAt:
      row.placed_at ||
      null,

    settledAt:
      row.settled_at ||
      null,

    refundedAt:
      row.refunded_at ||
      null
  };
}

/* =========================================================
   GET USER BET
========================================================= */

async function getUserRoundBet(
  userId,
  roundId,
  connection = pool,
  options = {}
) {
  const validUserId =
    parsePositiveInteger(
      userId
    );

  const validRoundId =
    parsePositiveInteger(
      roundId
    );

  assertCondition(
    validUserId,
    "Valid authenticated user ID is required.",
    401,
    "INVALID_AUTHENTICATED_USER"
  );

  assertCondition(
    validRoundId,
    "Valid Bangla Wheel round ID is required.",
    400,
    "INVALID_ROUND_ID"
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

        FROM bangla_wheel_bets

        WHERE user_id = ?
          AND round_id = ?

        LIMIT 1

        ${lockSuffix}
      `,
      [
        validUserId,
        validRoundId
      ]
    );

  return mapBetRow(
    rows[0] ||
    null
  );
}

/* =========================================================
   PLACE BET
========================================================= */

async function placeBet({
  userId,
  roundId,
  animalId,
  betAmount
}) {
  const validUserId =
    parsePositiveInteger(
      userId
    );

  const validRoundId =
    parsePositiveInteger(
      roundId
    );

  const validAnimalId =
    parsePositiveInteger(
      animalId
    );

  const validBetAmount =
    parseMoney(
      betAmount
    );

  assertCondition(
    validUserId,
    "Valid authenticated user ID is required.",
    401,
    "INVALID_AUTHENTICATED_USER"
  );

  assertCondition(
    validRoundId,
    "Valid Bangla Wheel round ID is required.",
    400,
    "INVALID_ROUND_ID"
  );

  assertCondition(
    validAnimalId,
    "Valid animal selection is required.",
    400,
    "INVALID_ANIMAL_ID"
  );

  assertCondition(
    validBetAmount > 0,
    "Bet amount must be greater than zero.",
    400,
    "INVALID_BET_AMOUNT"
  );

  const connection =
    await pool.getConnection();

  try {
    await connection
      .beginTransaction();

    const settings =
      await getGameSettings(
        connection,
        {
          lock: true
        }
      );

    assertCondition(
      settings.gameEnabled,
      "Bangla Wheel is currently disabled.",
      403,
      "GAME_DISABLED"
    );

    assertCondition(
      validBetAmount >=
        settings.minimumBet,
      `Minimum bet is ৳${settings.minimumBet}.`,
      400,
      "BET_BELOW_MINIMUM"
    );

    assertCondition(
      validBetAmount <=
        settings.maximumBet,
      `Maximum bet is ৳${settings.maximumBet}.`,
      400,
      "BET_ABOVE_MAXIMUM"
    );

    const animal =
      await getAnimalById(
        validAnimalId,
        connection,
        {
          lock: true
        }
      );

    assertCondition(
      animal,
      "Selected animal was not found.",
      404,
      "ANIMAL_NOT_FOUND"
    );

    assertCondition(
      animal.animalStatus ===
        "active",
      "Selected animal is currently unavailable.",
      409,
      "ANIMAL_DISABLED"
    );

    assertCondition(
  animal.isBettable &&
    animal.multiplier > 0,
  "This is a NIL animal and cannot receive bets.",
  409,
  "NIL_ANIMAL_NOT_BETTABLE"
);

    const [roundRows] =
      await connection.query(
        `
          SELECT
            *

          FROM bangla_wheel_rounds

          WHERE id = ?

          LIMIT 1

          FOR UPDATE
        `,
        [validRoundId]
      );

    const round =
      roundRows[0] ||
      null;

    assertCondition(
      round,
      "Bangla Wheel round was not found.",
      404,
      "ROUND_NOT_FOUND"
    );

    assertCondition(
      round.round_status ===
        "betting",
      "Betting is closed for this round.",
      409,
      "BETTING_CLOSED"
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
          round
            .betting_closes_at
        ]
      );

    assertCondition(
      Number(
        timeRows[0]
          ?.betting_open
      ) === 1,
      "Betting time has ended.",
      409,
      "BETTING_TIME_ENDED"
    );

    const existingBet =
      await getUserRoundBet(
        validUserId,
        validRoundId,
        connection,
        {
          lock: true
        }
      );

    assertCondition(
      !existingBet,
      "You have already placed a bet in this round.",
      409,
      "BET_ALREADY_PLACED"
    );

    const grossPayout =
      parseMoney(
        validBetAmount *
          animal.multiplier
      );

    /*
     * User-এর নিয়ম অনুযায়ী service charge
     * সম্পূর্ণ gross payout থেকে কাটা হবে।
     */
    const serviceCharge =
      parseMoney(
        grossPayout *
          (
            settings
              .serviceChargePercent /
            100
          )
      );

    const netPayout =
      parseMoney(
        grossPayout -
          serviceCharge
      );

    const currentLiability =
      parseMoney(
        round
          .total_potential_liability
      );

    const newLiability =
      parseMoney(
        currentLiability +
          netPayout
      );

    assertCondition(
      newLiability <=
        settings
          .maxRoundLiability,
      "This round has reached its maximum payout limit.",
      409,
      "ROUND_LIABILITY_LIMIT"
    );

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
        [validUserId]
      );

    const user =
      userRows[0] ||
      null;

    assertCondition(
      user,
      "Wallet user was not found.",
      404,
      "WALLET_USER_NOT_FOUND"
    );

    assertCondition(
      String(
        user.account_status ||
          ""
      ).toLowerCase() ===
        "active",
      "User account is not active.",
      403,
      "ACCOUNT_INACTIVE"
    );

    const balanceBefore =
      parseMoney(
        user.wallet_balance
      );

    assertCondition(
      balanceBefore >=
        validBetAmount,
      "Insufficient wallet balance.",
      409,
      "INSUFFICIENT_BALANCE"
    );

    const balanceAfterBet =
      parseMoney(
        balanceBefore -
          validBetAmount
      );

    const betCode =
      createReferenceCode(
        "BW_BET"
      );

    const transactionId =
      createReferenceCode(
        "BW_DEBIT"
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
          validBetAmount
        ]
      );

    assertCondition(
      walletResult.affectedRows ===
        1,
      "Bangla Wheel bet debit failed.",
      409,
      "BET_DEBIT_FAILED"
    );

    const [betResult] =
      await connection.query(
        `
          INSERT INTO bangla_wheel_bets (
            bet_code,
            round_id,
            user_id,
            selected_animal_id,
            selected_animal_code,
            selected_animal_name,
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
          animal.id,
          animal.animalCode,
          animal.animalName,
          animal.multiplier,
          validBetAmount,
          grossPayout,
          serviceCharge,
          netPayout,
          balanceBefore,
          balanceAfterBet,
          transactionId
        ]
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
          'bangla_wheel_bet',
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
        `Bangla Wheel ${animal.animalName} bet for round ${round.round_code}`
      ]
    );

    await connection.query(
      `
        UPDATE bangla_wheel_rounds

        SET
          total_bet_amount =
            total_bet_amount + ?,

          total_potential_liability =
            total_potential_liability + ?,

          total_players =
            total_players + 1

        WHERE id = ?
      `,
      [
        validBetAmount,
        netPayout,
        validRoundId
      ]
    );

    const [createdRows] =
      await connection.query(
        `
          SELECT
            *

          FROM bangla_wheel_bets

          WHERE id = ?

          LIMIT 1
        `,
        [
          betResult.insertId
        ]
      );

    await connection.commit();

    return {
      bet:
        mapBetRow(
          createdRows[0]
        ),

      animal,

      wallet: {
        balanceBefore,

        balanceAfter:
          balanceAfterBet
      }
    };
  } catch (error) {
    await connection.rollback();

    if (
      error.code ===
      "ER_DUP_ENTRY"
    ) {
      assertCondition(
        false,
        "You have already placed a bet in this round.",
        409,
        "BET_ALREADY_PLACED"
      );
    }

    throw error;
  } finally {
    connection.release();
  }
}

/* =========================================================
   ROUND BET TOTALS
========================================================= */

async function getRoundBetTotals(
  roundId
) {
  const validRoundId =
    parsePositiveInteger(
      roundId
    );

  assertCondition(
    validRoundId,
    "Valid Bangla Wheel round ID is required.",
    400,
    "INVALID_ROUND_ID"
  );

  const [rows] =
    await pool.query(
      `
        SELECT
          selected_animal_id,
          selected_animal_code,
          selected_animal_name,
          locked_multiplier,

          COUNT(*) AS player_count,

          COALESCE(
            SUM(bet_amount),
            0
          ) AS total_bet_amount

        FROM bangla_wheel_bets

        WHERE round_id = ?
          AND bet_status IN (
            'accepted',
            'won',
            'lost'
          )

        GROUP BY
          selected_animal_id,
          selected_animal_code,
          selected_animal_name,
          locked_multiplier

        ORDER BY
          selected_animal_id ASC
      `,
      [validRoundId]
    );

  return {
    animals:
      rows.map(
        (row) => ({
          animalId:
            Number(
              row
                .selected_animal_id
            ),

          animalCode:
            row
              .selected_animal_code,

          animalName:
            row
              .selected_animal_name,

          multiplier:
            parseMoney(
              row
                .locked_multiplier
            ),

          playerCount:
            Number(
              row.player_count ||
              0
            ),

          totalBetAmount:
            parseMoney(
              row
                .total_bet_amount
            )
        })
      )
  };
}

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  mapBetRow,
  getUserRoundBet,
  placeBet,
  getRoundBetTotals
};