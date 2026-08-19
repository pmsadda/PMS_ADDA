"use strict";

const {
  pool,
} = require("../config/database");

const {
  ROUND_STATUS,
  RESULT_MODE,
  assertCondition,
  parseMoney,
  parsePositiveInteger,
  parseJsonValue,
  createReferenceCode,
  mapRoundRow,
  getGameSettings,
  getActiveAnimals,
  createProbabilitySnapshot,
  prepareWheelResult
} = require(
  "./bangla-wheel.service"
);

/* =========================================================
   GET ROUND RESULT
========================================================= */

async function getRoundResult(
  roundId,
  connection = pool
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
    await connection.query(
      `
        SELECT
          *

        FROM bangla_wheel_rounds

        WHERE id = ?

        LIMIT 1
      `,
      [validRoundId]
    );

  const round =
    rows[0] ||
    null;

  assertCondition(
    round,
    "Bangla Wheel round was not found.",
    404,
    "ROUND_NOT_FOUND"
  );

  return {
    round:
      mapRoundRow(
        round,
        {
          revealResult:
            [
              ROUND_STATUS.SPINNING,
              ROUND_STATUS.SETTLING,
              ROUND_STATUS.COMPLETED
            ].includes(
              round.round_status
            )
        }
      ),

    fairness: {
      serverSeedHash:
        round.server_seed_hash,

      serverSeed:
        round.round_status ===
          ROUND_STATUS.COMPLETED
          ? round.server_seed
          : null,

      roundNonce:
        round.round_status ===
          ROUND_STATUS.COMPLETED
          ? round.round_nonce
          : null,

      randomResultIndex:
        round.round_status ===
          ROUND_STATUS.COMPLETED
          ? Number(
              round
                .random_result_index
            )
          : null
    }
  };
}

/* =========================================================
   START 20-SECOND SPIN
========================================================= */

async function startSpin(
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

    if (
      [
        ROUND_STATUS.SPINNING,
        ROUND_STATUS.SETTLING,
        ROUND_STATUS.COMPLETED
      ].includes(
        round.round_status
      )
    ) {
      await connection.commit();

      return getRoundResult(
        validRoundId
      );
    }

    assertCondition(
      [
        ROUND_STATUS.BETTING,
        ROUND_STATUS.BETTING_CLOSED
      ].includes(
        round.round_status
      ),
      "This round cannot start spinning.",
      409,
      "ROUND_NOT_SPINNABLE"
    );

    const [timeRows] =
      await connection.query(
        `
          SELECT
            CASE
              WHEN CURRENT_TIMESTAMP(3) >= ?
              THEN 1
              ELSE 0
            END AS betting_ended
        `,
        [
          round
            .betting_closes_at
        ]
      );

    assertCondition(
      Number(
        timeRows[0]
          ?.betting_ended
      ) === 1,
      "Betting time has not ended yet.",
      409,
      "BETTING_STILL_OPEN"
    );

    assertCondition(
      round.server_seed,
      "Round server seed is missing.",
      500,
      "SERVER_SEED_MISSING"
    );

    assertCondition(
      round.round_nonce,
      "Round nonce is missing.",
      500,
      "ROUND_NONCE_MISSING"
    );

       let lockedSnapshot =
      parseJsonValue(
        round.probability_snapshot,
        []
      );

    let lockedResultMode =
      Object.values(
        RESULT_MODE
      ).includes(
        round.result_mode_snapshot
      )
        ? round.result_mode_snapshot
        : settings.resultMode;

    let lockedOddsVersion =
      Number(
        round.odds_version_snapshot ||
        settings.oddsVersion ||
        1
      );

    /*
     * পুরোনো active round deploy-এর আগে তৈরি হয়ে থাকলে
     * safe recovery snapshot তৈরি হবে।
     */
    if (
      !Array.isArray(
        lockedSnapshot
      ) ||
      lockedSnapshot.length !== 12
    ) {
      const currentAnimals =
        await getActiveAnimals(
          connection,
          {
            lock: true
          }
        );

      const recoveryProbability =
        createProbabilitySnapshot(
          currentAnimals,
          lockedResultMode
        );

      lockedSnapshot =
        recoveryProbability
          .probabilitySnapshot;

      lockedResultMode =
        recoveryProbability
          .resultMode;
    }

    const lockedAnimals =
      lockedSnapshot.map(
        (animal) => ({
          id:
            Number(
              animal.animalId
            ),

          animalCode:
            animal.animalCode,

          animalName:
            animal.animalName,

          segmentIndex:
            Number(
              animal.segmentIndex
            ),

          multiplier:
            parseMoney(
              animal.multiplier
            ),

          isBettable:
            animal.isBettable ===
            true,

          winningWeight:
            Number(
              animal.winningWeight
            )
        })
      );

    const wheelResult =
      prepareWheelResult(
        lockedAnimals,
        round.server_seed,
        round.round_nonce,
        lockedResultMode
      );

    const winningAnimal =
      wheelResult
        .winningAnimal;

    const spinDurationSeconds =
      Math.max(
        5,
        Number(
          settings
            .spinDurationSeconds
        ) || 20
      );

        await connection.query(
      `
        UPDATE bangla_wheel_rounds

        SET
          round_status =
            'spinning',

          winning_animal_id = ?,
          winning_animal_code = ?,
          winning_segment_index = ?,
          winning_multiplier = ?,
          random_result_index = ?,
          winning_ticket = ?,
          total_winning_weight = ?,
          result_mode_snapshot = ?,

          odds_version_snapshot =
            COALESCE(
              odds_version_snapshot,
              ?
            ),

          probability_snapshot = ?,

          probability_locked_at =
            COALESCE(
              probability_locked_at,
              CURRENT_TIMESTAMP(3)
            ),

          spinning_started_at =
            CURRENT_TIMESTAMP(3),

          spinning_ends_at =
            DATE_ADD(
              CURRENT_TIMESTAMP(3),
              INTERVAL ? SECOND
            )

        WHERE id = ?
      `,
      [
        winningAnimal.id,
        winningAnimal.animalCode,
        winningAnimal.segmentIndex,
        winningAnimal.multiplier,
        wheelResult.randomIndex,
        wheelResult.winningTicket,
        wheelResult.totalWinningWeight,
        wheelResult.resultMode,
        lockedOddsVersion,
        JSON.stringify(
          wheelResult
            .probabilitySnapshot
        ),
        spinDurationSeconds,
        validRoundId
      ]
    );

    const [updatedRows] =
      await connection.query(
        `
          SELECT
            *

          FROM bangla_wheel_rounds

          WHERE id = ?

          LIMIT 1
        `,
        [validRoundId]
      );

    await connection.commit();

    return {
      round:
        mapRoundRow(
          updatedRows[0],
          {
            revealResult: true
          }
        ),

      winningAnimal,

      spinDurationSeconds,

           fairness: {
        resultMode:
          wheelResult.resultMode,

        oddsVersion:
          lockedOddsVersion,

        totalWinningWeight:
          wheelResult.totalWinningWeight,

        probabilitySnapshot:
          wheelResult.probabilitySnapshot,

        serverSeedHash:
          round.server_seed_hash,

        /*
         * Completed হওয়ার আগে secret seed/ticket
         * প্রকাশ করা হবে না।
         */
        serverSeed: null,
        roundNonce: null,
        randomResultIndex: null,
        winningTicket: null
      }
    };
  } catch (error) {
    await connection.rollback();

    throw error;
  } finally {
    connection.release();
  }
}

/* =========================================================
   SETTLE ROUND AFTER SPIN
========================================================= */

async function settleRound(
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

  const connection =
    await pool.getConnection();

  try {
    await connection
      .beginTransaction();

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

    if (
      round.round_status ===
        ROUND_STATUS.COMPLETED
    ) {
      await connection.commit();

      return getRoundResult(
        validRoundId
      );
    }

    assertCondition(
      [
        ROUND_STATUS.SPINNING,
        ROUND_STATUS.SETTLING
      ].includes(
        round.round_status
      ),
      "Bangla Wheel round is not ready for settlement.",
      409,
      "ROUND_NOT_SETTLEABLE"
    );

    const [timeRows] =
      await connection.query(
        `
          SELECT
            CASE
              WHEN CURRENT_TIMESTAMP(3) >= ?
              THEN 1
              ELSE 0
            END AS spin_ended
        `,
        [
          round
            .spinning_ends_at
        ]
      );

    assertCondition(
      Number(
        timeRows[0]
          ?.spin_ended
      ) === 1,
      "Wheel is still spinning.",
      409,
      "WHEEL_STILL_SPINNING"
    );

    assertCondition(
      round
        .winning_animal_code,
      "Winning animal is missing.",
      500,
      "WINNING_ANIMAL_MISSING"
    );

    await connection.query(
      `
        UPDATE bangla_wheel_rounds

        SET
          round_status =
            'settling'

        WHERE id = ?
      `,
      [validRoundId]
    );

    const [betRows] =
      await connection.query(
        `
          SELECT
            *

          FROM bangla_wheel_bets

          WHERE round_id = ?
            AND bet_status =
              'accepted'

          ORDER BY id ASC

          FOR UPDATE
        `,
        [validRoundId]
      );

    let totalGrossPayout = 0;
    let totalServiceCharge = 0;
    let totalNetPayout = 0;

    for (
      const bet of betRows
    ) {
      const isWinner =
        bet
          .selected_animal_code ===
        round
          .winning_animal_code;

      if (!isWinner) {
        await connection.query(
          `
            UPDATE bangla_wheel_bets

            SET
              bet_status = 'lost',
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
          [bet.id]
        );

        continue;
      }

      const userId =
        Number(
          bet.user_id
        );

      const grossPayout =
        parseMoney(
          bet
            .potential_gross_payout
        );

      const serviceCharge =
        parseMoney(
          bet
            .potential_service_charge
        );

      const netPayout =
        parseMoney(
          bet
            .potential_net_payout
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
          [userId]
        );

      const user =
        userRows[0] ||
        null;

      assertCondition(
        user,
        "Winner wallet user was not found.",
        500,
        "WINNER_USER_NOT_FOUND"
      );

      assertCondition(
        String(
          user.account_status ||
            ""
        ).toLowerCase() ===
          "active",
        "Winner account is not active.",
        409,
        "WINNER_ACCOUNT_INACTIVE"
      );

      const balanceBefore =
        parseMoney(
          user.wallet_balance
        );

      const balanceAfterGross =
        parseMoney(
          balanceBefore +
            grossPayout
        );

      const balanceAfterSettlement =
        parseMoney(
          balanceBefore +
            netPayout
        );

      const payoutTransactionId =
        createReferenceCode(
          "BW_WIN"
        );

      const chargeTransactionId =
        createReferenceCode(
          "BW_FEE"
        );

      /*
       * Actual wallet-এ net payout একবারে credit হবে।
       * Ledger-এ gross win এবং service charge আলাদা থাকবে।
       */
      const [creditResult] =
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
            netPayout,
            userId
          ]
        );

      assertCondition(
        creditResult.affectedRows ===
          1,
        "Winner payout credit failed.",
        500,
        "WINNER_CREDIT_FAILED"
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
            'bangla_wheel_bet',
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
          `Bangla Wheel ${round.winning_animal_code} gross win for round ${round.round_code}`
        ]
      );

      if (
        serviceCharge > 0
      ) {
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
              'bangla_wheel_bet',
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
            `Bangla Wheel gross payout service charge for round ${round.round_code}`
          ]
        );
      }

      await connection.query(
        `
          UPDATE bangla_wheel_bets

          SET
            bet_status = 'won',
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
          grossPayout,
          serviceCharge,
          netPayout,
          balanceAfterSettlement,
          payoutTransactionId,
          serviceCharge > 0
            ? chargeTransactionId
            : null,
          bet.id
        ]
      );

      totalGrossPayout =
        parseMoney(
          totalGrossPayout +
            grossPayout
        );

      totalServiceCharge =
        parseMoney(
          totalServiceCharge +
            serviceCharge
        );

      totalNetPayout =
        parseMoney(
          totalNetPayout +
            netPayout
        );
    }

    await connection.query(
      `
        UPDATE bangla_wheel_rounds

        SET
          round_status =
            'completed',

          total_gross_payout = ?,
          total_service_charge = ?,
          total_net_payout = ?,

          completed_at =
            CURRENT_TIMESTAMP(3)

        WHERE id = ?
      `,
      [
        totalGrossPayout,
        totalServiceCharge,
        totalNetPayout,
        validRoundId
      ]
    );

    await connection.commit();

    return getRoundResult(
      validRoundId
    );
  } catch (error) {
    await connection.rollback();

    throw error;
  } finally {
    connection.release();
  }
}

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  getRoundResult,
  startSpin,
  settleRound
};