"use strict";

const {
  pool,
} = require("../config/database");

const {
  ROUND_STATUS,
  assertCondition,
  parseMoney,
  parsePositiveInteger,
  createReferenceCode,
  getRoundById,
  mapRoundRow,
} = require(
  "./bangla-dice.service",
);

async function settleRound(
  roundId,
) {
  const validRoundId =
    parsePositiveInteger(
      roundId,
    );

  assertCondition(
    validRoundId,
    "Valid Dice round ID is required.",
    400,
    "INVALID_DICE_ROUND_ID",
  );

  const connection =
    await pool.getConnection();

  try {
    await connection.beginTransaction();

    const round =
      await getRoundById(
        validRoundId,
        connection,
        {
          lock: true,
        },
      );

    assertCondition(
      round,
      "Bangla Dice round was not found.",
      404,
      "DICE_ROUND_NOT_FOUND",
    );

    if (
      round.round_status ===
      ROUND_STATUS.COMPLETED
    ) {
      await connection.commit();

      return {
        alreadySettled: true,

        round:
          mapRoundRow(
            round,
            {
              revealResult: true,
            },
          ),
      };
    }

    assertCondition(
      [
        ROUND_STATUS.ROLLING,
        ROUND_STATUS.SETTLING,
      ].includes(
        round.round_status,
      ),
      "Bangla Dice round is not ready for settlement.",
      409,
      "DICE_ROUND_NOT_READY",
    );

    assertCondition(
      round.winning_symbol_code,
      "Dice winning image is missing.",
      500,
      "DICE_WINNER_MISSING",
    );

    await connection.query(
      `
        UPDATE bangla_dice_rounds

        SET
          round_status =
            'settling'

        WHERE id = ?
          AND round_status IN (
            'rolling',
            'settling'
          )
      `,
      [validRoundId],
    );

    const [betRows] =
      await connection.query(
        `
          SELECT *

          FROM bangla_dice_bets

          WHERE round_id = ?
            AND bet_status =
              'accepted'

          ORDER BY id ASC

          FOR UPDATE
        `,
        [validRoundId],
      );

    let winningBets = 0;
    let losingBets = 0;

    let totalGrossPayout = 0;
    let totalServiceCharge = 0;
    let totalNetPayout = 0;

    for (
      const bet of betRows
    ) {
      const isWinner =
        String(
          bet
            .selected_symbol_code,
        ) ===
        String(
          round
            .winning_symbol_code,
        );

      if (!isWinner) {
        const [lostResult] =
          await connection.query(
            `
              UPDATE bangla_dice_bets

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
            [bet.id],
          );

        if (
          lostResult.affectedRows ===
          1
        ) {
          losingBets += 1;
        }

        continue;
      }

      const userId =
        Number(
          bet.user_id,
        );

      const grossPayout =
        parseMoney(
          bet
            .potential_gross_payout,
        );

      const serviceCharge =
        parseMoney(
          bet
            .potential_service_charge,
        );

      const netPayout =
        parseMoney(
          bet
            .potential_net_payout,
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
          [userId],
        );

      const user =
        userRows[0] || null;

      assertCondition(
        user,
        "Dice winner wallet user was not found.",
        500,
        "DICE_WINNER_USER_NOT_FOUND",
      );

      const balanceBefore =
        parseMoney(
          user.wallet_balance,
        );

      const balanceAfterGross =
        parseMoney(
          balanceBefore +
          grossPayout,
        );

      const balanceAfterSettlement =
        parseMoney(
          balanceBefore +
          netPayout,
        );

      const payoutTransactionId =
        createReferenceCode(
          "BD_WIN",
        );

      const chargeTransactionId =
        serviceCharge > 0
          ? createReferenceCode(
              "BD_FEE",
            )
          : null;

      const [creditResult] =
        await connection.query(
          `
            UPDATE users

            SET
              wallet_balance =
                wallet_balance + ?

            WHERE id = ?
          `,
          [
            netPayout,
            userId,
          ],
        );

      assertCondition(
        creditResult.affectedRows ===
          1,
        "Dice winner payout failed.",
        500,
        "DICE_WINNER_CREDIT_FAILED",
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
            'bangla_dice_bet',
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
          `Bangla Dice ${round.winning_symbol_name} gross win for round ${round.round_code}`,
        ],
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
              'bangla_dice_bet',
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
            `Bangla Dice service charge for round ${round.round_code}`,
          ],
        );
      }

      const [wonResult] =
        await connection.query(
          `
            UPDATE bangla_dice_bets

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
            chargeTransactionId,
            bet.id,
          ],
        );

      if (
        wonResult.affectedRows ===
        1
      ) {
        winningBets += 1;

        totalGrossPayout =
          parseMoney(
            totalGrossPayout +
            grossPayout,
          );

        totalServiceCharge =
          parseMoney(
            totalServiceCharge +
            serviceCharge,
          );

        totalNetPayout =
          parseMoney(
            totalNetPayout +
            netPayout,
          );
      }
    }

    await connection.query(
      `
        UPDATE bangla_dice_rounds

        SET
          round_status =
            'completed',

          total_gross_payout = ?,
          total_service_charge = ?,
          total_net_payout = ?,

          completed_at =
            CURRENT_TIMESTAMP(3)

        WHERE id = ?
          AND round_status =
            'settling'
      `,
      [
        totalGrossPayout,
        totalServiceCharge,
        totalNetPayout,
        validRoundId,
      ],
    );

    const completedRound =
      await getRoundById(
        validRoundId,
        connection,
      );

    await connection.commit();

    return {
      alreadySettled: false,

      round:
        mapRoundRow(
          completedRound,
          {
            revealResult: true,
          },
        ),

      settlement: {
        totalBets:
          betRows.length,

        winningBets,
        losingBets,

        totalGrossPayout,
        totalServiceCharge,
        totalNetPayout,
      },
    };
  } catch (error) {
    await connection.rollback();

    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  settleRound,
};