"use strict";

const { pool } = require("../config/database");

const {
  ROUND_STATUS,
  assertCondition,
  parseMoney,
  parsePositiveInteger,
  createReferenceCode,
  mapRoundRow,
} = require("./bangla-wheel.service");

/* =========================================================
   REFUND ROUND
========================================================= */

async function refundRound(roundId, reason = "Bangla Wheel round cancelled") {
  const validRoundId = parsePositiveInteger(roundId);

  const refundReason =
    String(reason || "")
      .trim()
      .slice(0, 255) || "Bangla Wheel round cancelled";

  assertCondition(
    validRoundId,
    "Valid Bangla Wheel round ID is required.",
    400,
    "INVALID_ROUND_ID",
  );

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [roundRows] = await connection.query(
      `
          SELECT
            *

          FROM bangla_wheel_rounds

          WHERE id = ?

          LIMIT 1

          FOR UPDATE
        `,
      [validRoundId],
    );

    const round = roundRows[0] || null;

    assertCondition(
      round,
      "Bangla Wheel round was not found.",
      404,
      "ROUND_NOT_FOUND",
    );

    assertCondition(
      round.round_status !== ROUND_STATUS.COMPLETED,
      "A completed round cannot be refunded.",
      409,
      "COMPLETED_ROUND_NOT_REFUNDABLE",
    );

    if (round.round_status === ROUND_STATUS.REFUNDED) {
      await connection.commit();

      return {
        alreadyRefunded: true,
        refundedPlayers: 0,
        refundedAmount: 0,

        round: mapRoundRow(round),
      };
    }

    await connection.query(
      `
        UPDATE bangla_wheel_rounds

        SET
          round_status =
            'cancelled',

          cancelled_at =
            COALESCE(
              cancelled_at,
              CURRENT_TIMESTAMP(3)
            ),

          cancellation_reason = ?

        WHERE id = ?
      `,
      [refundReason, validRoundId],
    );

    const [betRows] = await connection.query(
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
      [validRoundId],
    );

    let refundedPlayers = 0;
    let refundedAmount = 0;

    for (const bet of betRows) {
      const userId = Number(bet.user_id);

      const betAmount = parseMoney(bet.bet_amount);

      const [userRows] = await connection.query(
        `
            SELECT
              id,
              wallet_balance,
              turnover_amount

            FROM users

            WHERE id = ?

            LIMIT 1

            FOR UPDATE
          `,
        [userId],
      );

      const user = userRows[0] || null;

      assertCondition(
        user,
        `Refund user ${userId} was not found.`,
        500,
        "REFUND_USER_NOT_FOUND",
      );

      const balanceBefore = parseMoney(user.wallet_balance);

      const balanceAfter = parseMoney(balanceBefore + betAmount);

      const refundTransactionId = createReferenceCode("BW_REFUND");

      const [walletResult] = await connection.query(
        `
            UPDATE users

            SET
              wallet_balance =
                wallet_balance + ?,

              turnover_amount =
                GREATEST(
                  0,
                  turnover_amount - ?
                )

            WHERE id = ?
          `,
        [betAmount, betAmount, userId],
      );

      assertCondition(
        walletResult.affectedRows === 1,
        "Bangla Wheel refund credit failed.",
        500,
        "REFUND_CREDIT_FAILED",
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
            'bangla_wheel_bet',
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
          `Bangla Wheel round ${round.round_code} refund: ${refundReason}`,
        ],
      );

      await connection.query(
        `
          UPDATE bangla_wheel_bets

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
        [balanceAfter, refundTransactionId, bet.id],
      );

      refundedPlayers += 1;

      refundedAmount = parseMoney(refundedAmount + betAmount);
    }

    await connection.query(
      `
        UPDATE bangla_wheel_rounds

        SET
          round_status =
            'refunded',

          cancellation_reason = ?,

          completed_at =
            COALESCE(
              completed_at,
              CURRENT_TIMESTAMP(3)
            )

        WHERE id = ?
      `,
      [refundReason, validRoundId],
    );

    const [updatedRows] = await connection.query(
      `
          SELECT
            *

          FROM bangla_wheel_rounds

          WHERE id = ?

          LIMIT 1
        `,
      [validRoundId],
    );

    await connection.commit();

    return {
      alreadyRefunded: false,
      refundedPlayers,
      refundedAmount,

      round: mapRoundRow(updatedRows[0]),
    };
  } catch (error) {
    await connection.rollback();

    throw error;
  } finally {
    connection.release();
  }
}

/* =========================================================
   GET INCOMPLETE ROUNDS
========================================================= */

async function getIncompleteRounds() {
  const [rows] = await pool.query(
    `
        SELECT
          *

        FROM bangla_wheel_rounds

        WHERE round_status IN (
          'betting',
          'betting_closed',
          'spinning',
          'settling',
          'cancelled'
        )

        ORDER BY id ASC
      `,
  );

  return rows.map((round) =>
    mapRoundRow(round, {
      revealResult: ["spinning", "settling"].includes(round.round_status),
    }),
  );
}

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  refundRound,
  getIncompleteRounds,
};
