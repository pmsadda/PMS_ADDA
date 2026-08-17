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

async function refundRound(
  roundId,
  reason =
    "Bangla Dice round was interrupted.",
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

  const refundReason =
    String(
      reason ||
      "Bangla Dice round was interrupted.",
    )
      .trim()
      .slice(0, 255);

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

    assertCondition(
      round.round_status !==
        ROUND_STATUS.COMPLETED,
      "A completed Dice round cannot be refunded.",
      409,
      "DICE_ROUND_ALREADY_COMPLETED",
    );

    if (
      round.round_status ===
      ROUND_STATUS.REFUNDED
    ) {
      await connection.commit();

      return {
        alreadyRefunded: true,
        refundedBets: 0,
        refundedPlayers: 0,
        refundedAmount: 0,

        round:
          mapRoundRow(
            round,
            {
              revealResult: true,
            },
          ),
      };
    }

    await connection.query(
      `
        UPDATE bangla_dice_rounds

        SET
          round_status =
            'refunding',

          refund_reason = ?

        WHERE id = ?
          AND round_status NOT IN (
            'completed',
            'refunded'
          )
      `,
      [
        refundReason,
        validRoundId,
      ],
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

    let refundedBets = 0;
    let refundedAmount = 0;

    const refundedUserIds =
      new Set();

    for (
      const bet of betRows
    ) {
      const userId =
        Number(
          bet.user_id,
        );

      const betAmount =
        parseMoney(
          bet.bet_amount,
        );

      const [userRows] =
        await connection.query(
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

      const user =
        userRows[0] || null;

      assertCondition(
        user,
        "Dice refund user was not found.",
        500,
        "DICE_REFUND_USER_NOT_FOUND",
      );

      const balanceBefore =
        parseMoney(
          user.wallet_balance,
        );

      const balanceAfter =
        parseMoney(
          balanceBefore +
          betAmount,
        );

      const refundTransactionId =
        createReferenceCode(
          "BD_REFUND",
        );

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
            betAmount,
            userId,
          ],
        );

      assertCondition(
        creditResult.affectedRows ===
          1,
        "Dice refund wallet credit failed.",
        500,
        "DICE_REFUND_CREDIT_FAILED",
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
            'refund',
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
          refundTransactionId,
          userId,
          betAmount,
          balanceBefore,
          balanceAfter,
          bet.bet_code,
          `Bangla Dice round ${round.round_code} refund: ${refundReason}`,
        ],
      );

      const [betUpdate] =
        await connection.query(
          `
            UPDATE bangla_dice_bets

            SET
              bet_status =
                'refunded',

              gross_payout = 0,
              service_charge = 0,
              net_payout = 0,

              balance_after_settlement = ?,

              refund_transaction_id = ?,

              refunded_at =
                CURRENT_TIMESTAMP(3),

              settled_at =
                CURRENT_TIMESTAMP(3)

            WHERE id = ?
              AND bet_status =
                'accepted'
          `,
          [
            balanceAfter,
            refundTransactionId,
            bet.id,
          ],
        );

      if (
        betUpdate.affectedRows ===
        1
      ) {
        refundedBets += 1;

        refundedAmount =
          parseMoney(
            refundedAmount +
            betAmount,
          );

        refundedUserIds.add(
          userId,
        );
      }
    }

    await connection.query(
      `
        UPDATE bangla_dice_rounds

        SET
          round_status =
            'refunded',

          refund_reason = ?,

          total_gross_payout = 0,
          total_service_charge = 0,
          total_net_payout = 0,

          refunded_at =
            CURRENT_TIMESTAMP(3)

        WHERE id = ?
          AND round_status =
            'refunding'
      `,
      [
        refundReason,
        validRoundId,
      ],
    );

    const refundedRound =
      await getRoundById(
        validRoundId,
        connection,
      );

    await connection.commit();

    return {
      alreadyRefunded: false,

      refundedBets,

      refundedPlayers:
        refundedUserIds.size,

      refundedAmount,

      round:
        mapRoundRow(
          refundedRound,
          {
            revealResult: true,
          },
        ),
    };
  } catch (error) {
    await connection.rollback();

    throw error;
  } finally {
    connection.release();
  }
}

async function getIncompleteRounds() {
  const [rows] =
    await pool.query(
      `
        SELECT *

        FROM bangla_dice_rounds

        WHERE round_status IN (
          'betting',
          'rolling',
          'settling',
          'refunding'
        )

        ORDER BY id ASC
      `,
    );

  return rows;
}

module.exports = {
  refundRound,
  getIncompleteRounds,
};