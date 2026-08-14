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
  prepareRoundCards,
  getGameSettings,
  mapRoundRow,
} = require(
  "./andar-bahar.service",
);

/* =========================================================
   RESULT QUERIES
========================================================= */

async function getRoundResult(
  roundId,
  connection = pool,
) {
  const validRoundId =
    parsePositiveInteger(roundId);

  assertCondition(
    validRoundId,
    "Valid Andar Bahar round ID is required.",
    400,
    "INVALID_ROUND_ID",
  );

  const [roundRows] =
    await connection.query(
      `
        SELECT
          *

        FROM andar_bahar_rounds

        WHERE id = ?

        LIMIT 1
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

  const resultVisible = [
    ROUND_STATUS.COMPLETED,
    ROUND_STATUS.CANCELLED,
    ROUND_STATUS.REFUNDED,
  ].includes(
    round.round_status,
  );

  let cards = [];

  if (resultVisible) {
    const [cardRows] =
      await connection.query(
        `
          SELECT
            card_sequence,
            card_code,
            card_rank,
            card_suit,
            dealt_side,
            is_matching_card,
            dealt_at

          FROM andar_bahar_cards

          WHERE round_id = ?

          ORDER BY
            card_sequence ASC
        `,
        [validRoundId],
      );

    cards = cardRows.map(
      (card) => ({
        sequence:
          Number(
            card.card_sequence,
          ),

        code:
          card.card_code,

        rank:
          card.card_rank,

        suit:
          card.card_suit,

        side:
          card.dealt_side,

        isMatchingCard:
          Number(
            card.is_matching_card,
          ) === 1,

        dealtAt:
          card.dealt_at || null,
      }),
    );
  }

  return {
    round:
      mapRoundRow(round),

    cards,

    fairness: resultVisible
      ? {
          serverSeedHash:
            round.server_seed_hash,

          serverSeed:
            round.server_seed,

          roundNonce:
            round.round_nonce,
        }
      : {
          serverSeedHash:
            round.server_seed_hash,

          serverSeed: null,
          roundNonce: null,
        },
  };
}

/* =========================================================
   SETTLE ROUND
========================================================= */

async function settleRound(
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

    const [roundRows] =
      await connection.query(
        `
          SELECT
            *

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

    if (
      round.round_status ===
      ROUND_STATUS.COMPLETED
    ) {
      await connection.commit();

      return getRoundResult(
        validRoundId,
      );
    }

    assertCondition(
      [
        ROUND_STATUS.BETTING,
        ROUND_STATUS.BETTING_CLOSED,
        ROUND_STATUS.DEALING,
        ROUND_STATUS.SETTLING,
      ].includes(
        round.round_status,
      ),
      "This Andar Bahar round cannot be settled.",
      409,
      "ROUND_NOT_SETTLEABLE",
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
          round.betting_closes_at,
        ],
      );

    assertCondition(
      Number(
        timeRows[0]
          ?.betting_ended,
      ) === 1,
      "Betting time has not ended yet.",
      409,
      "BETTING_STILL_OPEN",
    );

    assertCondition(
      round.server_seed,
      "Round server seed is missing.",
      500,
      "SERVER_SEED_MISSING",
    );

    assertCondition(
      round.round_nonce,
      "Round nonce is missing.",
      500,
      "ROUND_NONCE_MISSING",
    );

    await connection.query(
      `
        UPDATE andar_bahar_rounds

        SET
          round_status =
            'dealing',

          dealing_started_at =
            COALESCE(
              dealing_started_at,
              CURRENT_TIMESTAMP(3)
            )

        WHERE id = ?
      `,
      [validRoundId],
    );

    const cardResult =
      prepareRoundCards(
        round.server_seed,
        round.round_nonce,
      );

    /*
     * Transaction retry হলেও duplicate card তৈরি হবে না।
     */
    await connection.query(
      `
        DELETE FROM andar_bahar_cards

        WHERE round_id = ?
      `,
      [validRoundId],
    );

    await connection.query(
      `
        INSERT INTO andar_bahar_cards (
          round_id,
          card_sequence,
          card_code,
          card_rank,
          card_suit,
          dealt_side,
          is_matching_card,
          dealt_at
        )
        VALUES (
          ?,
          0,
          ?,
          ?,
          ?,
          'joker',
          0,
          CURRENT_TIMESTAMP(3)
        )
      `,
      [
        validRoundId,
        cardResult.jokerCard.code,
        cardResult.jokerCard.rank,
        cardResult.jokerCard.suit,
      ],
    );

    for (
      const card of
      cardResult.dealtCards
    ) {
      await connection.query(
        `
          INSERT INTO andar_bahar_cards (
            round_id,
            card_sequence,
            card_code,
            card_rank,
            card_suit,
            dealt_side,
            is_matching_card,
            dealt_at
          )
          VALUES (
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            CURRENT_TIMESTAMP(3)
          )
        `,
        [
          validRoundId,
          card.sequence,
          card.code,
          card.rank,
          card.suit,
          card.side,
          card.isMatchingCard
            ? 1
            : 0,
        ],
      );
    }

    await connection.query(
      `
        UPDATE andar_bahar_rounds

        SET
          round_status =
            'settling',

          joker_card = ?,
          joker_rank = ?,
          winning_side = ?,
          matching_card = ?,
          matching_card_position = ?

        WHERE id = ?
      `,
      [
        cardResult.jokerCard.code,
        cardResult.jokerCard.rank,
        cardResult.winningSide,
        cardResult.matchingCard.code,
        cardResult.dealtCards.length,
        validRoundId,
      ],
    );

    const [betRows] =
      await connection.query(
        `
          SELECT
            *

          FROM andar_bahar_bets

          WHERE round_id = ?
            AND bet_status =
              'accepted'

          ORDER BY id ASC

          FOR UPDATE
        `,
        [validRoundId],
      );

    let totalGrossPayout = 0;
    let totalServiceCharge = 0;
    let totalNetPayout = 0;

    for (
      const bet of betRows
    ) {
      const betAmount =
        parseMoney(
          bet.bet_amount,
        );

      const isWinner =
        bet.selected_side ===
        cardResult.winningSide;

      if (!isWinner) {
        await connection.query(
          `
            UPDATE andar_bahar_bets

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

        continue;
      }

      const userId =
        Number(bet.user_id);

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
        "Winner wallet user was not found.",
        500,
        "WINNER_USER_NOT_FOUND",
      );

      const balanceBefore =
        parseMoney(
          user.wallet_balance,
        );

      /*
       * Winner প্রথমে নিজের bet ফেরতসহ 2x gross payout পাবে।
       * Service charge শুধু winning profit-এর সমান bet amount
       * থেকে কাটা হবে।
       *
       * ৳100 bet, 5% charge:
       * Gross payout = ৳200
       * Service charge = ৳5
       * Net payout = ৳195
       */
      const grossPayout =
        parseMoney(
          betAmount * 2,
        );

      const serviceCharge =
        parseMoney(
          betAmount *
            (
              settings
                .serviceChargePercent /
              100
            ),
        );

      const netPayout =
        parseMoney(
          grossPayout -
            serviceCharge,
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
          "AB_WIN",
        );

      const chargeTransactionId =
        createReferenceCode(
          "AB_FEE",
        );

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
            userId,
          ],
        );

      assertCondition(
        creditResult.affectedRows ===
          1,
        "Winner payout credit failed.",
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
            'andar_bahar_bet',
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
          `Andar Bahar round ${round.round_code} gross win`,
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
              'andar_bahar_bet',
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
            `Andar Bahar round ${round.round_code} service charge`,
          ],
        );
      }

      await connection.query(
        `
          UPDATE andar_bahar_bets

          SET
            bet_status = 'won',
            gross_payout = ?,
            service_charge = ?,
            net_payout = ?,
            balance_after_settlement = ?,
            payout_transaction_id = ?,
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
          bet.id,
        ],
      );

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

    await connection.query(
      `
        UPDATE andar_bahar_rounds

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
        validRoundId,
      ],
    );

    await connection.commit();

    return getRoundResult(
      validRoundId,
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
  settleRound,
};