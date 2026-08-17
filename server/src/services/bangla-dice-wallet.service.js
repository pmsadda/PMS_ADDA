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
  getSymbolById,
} = require(
  "./bangla-dice.service",
);

function mapBetRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),

    betCode:
      String(row.bet_code),

    roundId:
      Number(row.round_id),

    userId:
      Number(row.user_id),

    selectedSymbolId:
      Number(
        row.selected_symbol_id,
      ),

    selectedSymbolCode:
      String(
        row.selected_symbol_code,
      ),

    selectedSymbolName:
      String(
        row.selected_symbol_name,
      ),

    selectedFaceNumber:
      Number(
        row.selected_face_number,
      ),

    multiplier:
      Number(
        row.locked_multiplier,
      ),

    betAmount:
      parseMoney(
        row.bet_amount,
      ),

    potentialGrossPayout:
      parseMoney(
        row
          .potential_gross_payout,
      ),

    potentialServiceCharge:
      parseMoney(
        row
          .potential_service_charge,
      ),

    potentialNetPayout:
      parseMoney(
        row
          .potential_net_payout,
      ),

    betStatus:
      String(
        row.bet_status,
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

    balanceBefore:
      parseMoney(
        row.balance_before,
      ),

    balanceAfterBet:
      parseMoney(
        row.balance_after_bet,
      ),

    balanceAfterSettlement:
      row
        .balance_after_settlement ===
      null
        ? null
        : parseMoney(
            row
              .balance_after_settlement,
          ),

    placedAt:
      row.placed_at,

    settledAt:
      row.settled_at,

    refundedAt:
      row.refunded_at,
  };
}

async function getUserRoundBets(
  userId,
  roundId,
  connection = pool,
) {
  const validUserId =
    parsePositiveInteger(
      userId,
    );

  const validRoundId =
    parsePositiveInteger(
      roundId,
    );

  assertCondition(
    validUserId,
    "Valid authenticated user ID is required.",
    401,
    "INVALID_AUTHENTICATED_USER",
  );

  assertCondition(
    validRoundId,
    "Valid Dice round ID is required.",
    400,
    "INVALID_DICE_ROUND_ID",
  );

  const [rows] =
    await connection.query(
      `
        SELECT *

        FROM bangla_dice_bets

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
    rows.map(mapBetRow);

  const summary =
    bets.reduce(
      (
        result,
        bet,
      ) => {
        result.totalBetAmount =
          parseMoney(
            result.totalBetAmount +
            bet.betAmount,
          );

        result.symbolBetAmounts[
          bet.selectedSymbolCode
        ] =
          parseMoney(
            (
              result
                .symbolBetAmounts[
                bet
                  .selectedSymbolCode
              ] ||
              0
            ) +
            bet.betAmount,
          );

        return result;
      },
      {
        totalBets:
          bets.length,

        totalBetAmount:
          0,

        symbolBetAmounts:
          {},
      },
    );

  return {
    bets,
    summary,
  };
}

async function getRoundBetTotals(
  roundId,
  connection = pool,
) {
  const validRoundId =
    parsePositiveInteger(
      roundId,
    );

  if (!validRoundId) {
    return {
      totalBetAmount: 0,
      totalBets: 0,
      symbols: [],
    };
  }

  const [rows] =
    await connection.query(
      `
        SELECT
          selected_symbol_id,
          selected_symbol_code,
          selected_symbol_name,
          selected_face_number,

          COUNT(*) AS total_bets,

          COALESCE(
            SUM(bet_amount),
            0
          ) AS total_bet_amount

        FROM bangla_dice_bets

        WHERE round_id = ?
          AND bet_status IN (
            'accepted',
            'won',
            'lost'
          )

        GROUP BY
          selected_symbol_id,
          selected_symbol_code,
          selected_symbol_name,
          selected_face_number

        ORDER BY
          selected_face_number ASC
      `,
      [validRoundId],
    );

  const symbols =
    rows.map(
      (row) => ({
        symbolId:
          Number(
            row
              .selected_symbol_id,
          ),

        symbolCode:
          String(
            row
              .selected_symbol_code,
          ),

        symbolName:
          String(
            row
              .selected_symbol_name,
          ),

        faceNumber:
          Number(
            row
              .selected_face_number,
          ),

        totalBets:
          Number(
            row.total_bets ||
            0,
          ),

        totalBetAmount:
          parseMoney(
            row.total_bet_amount,
          ),
      }),
    );

  return {
    totalBets:
      symbols.reduce(
        (
          total,
          symbol,
        ) =>
          total +
          symbol.totalBets,
        0,
      ),

    totalBetAmount:
      parseMoney(
        symbols.reduce(
          (
            total,
            symbol,
          ) =>
            total +
            symbol
              .totalBetAmount,
          0,
        ),
      ),

    symbols,
  };
}

async function placeBet({
  userId,
  roundId,
  symbolId,
  betAmount,
}) {
  const validUserId =
    parsePositiveInteger(
      userId,
    );

  const validRoundId =
    parsePositiveInteger(
      roundId,
    );

  const validSymbolId =
    parsePositiveInteger(
      symbolId,
    );

  const validBetAmount =
    parseMoney(
      betAmount,
    );

  assertCondition(
    validUserId,
    "Authentication is required.",
    401,
    "INVALID_AUTHENTICATED_USER",
  );

  assertCondition(
    validRoundId,
    "Valid Dice round is required.",
    400,
    "INVALID_DICE_ROUND_ID",
  );

  assertCondition(
    validSymbolId,
    "Select a valid Dice image.",
    400,
    "INVALID_DICE_SYMBOL",
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
      );

    assertCondition(
      settings.gameEnabled,
      "Bangla Dice is currently disabled.",
      403,
      "BANGLA_DICE_DISABLED",
    );

    const [roundRows] =
      await connection.query(
        `
          SELECT *

          FROM bangla_dice_rounds

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
      "Bangla Dice round was not found.",
      404,
      "DICE_ROUND_NOT_FOUND",
    );

    assertCondition(
      round.round_status ===
        "betting",
      "Betting is closed for this Dice round.",
      409,
      "DICE_BETTING_CLOSED",
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
            .betting_ends_at,
        ],
      );

    assertCondition(
      Number(
        timeRows[0]
          ?.betting_open,
      ) === 1,
      "Dice betting time has ended.",
      409,
      "DICE_BETTING_TIME_ENDED",
    );

    const minimumBet =
      parseMoney(
        round.minimum_bet,
      );

    const maximumBet =
      parseMoney(
        round.maximum_bet,
      );

    assertCondition(
      validBetAmount >=
        minimumBet,
      `Minimum bet is ৳${minimumBet}.`,
      400,
      "DICE_BET_BELOW_MINIMUM",
    );

    assertCondition(
      validBetAmount <=
        maximumBet,
      `Maximum round bet is ৳${maximumBet}.`,
      400,
      "DICE_BET_ABOVE_MAXIMUM",
    );

    const symbol =
      await getSymbolById(
        validSymbolId,
        connection,
      );

    assertCondition(
      symbol,
      "Selected Dice image is unavailable.",
      404,
      "DICE_SYMBOL_UNAVAILABLE",
    );

    assertCondition(
      symbol.isBettable &&
      symbol.multiplier > 0,
      "Selected Dice image cannot receive bets.",
      409,
      "DICE_SYMBOL_NOT_BETTABLE",
    );

    const [summaryRows] =
      await connection.query(
        `
          SELECT
            COUNT(*) AS bet_count,

            COALESCE(
              SUM(bet_amount),
              0
            ) AS total_bet_amount

          FROM bangla_dice_bets

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

    const previousBetCount =
      Number(
        summaryRows[0]
          ?.bet_count ||
        0,
      );

    const previousTotal =
      parseMoney(
        summaryRows[0]
          ?.total_bet_amount,
      );

    const newTotal =
      parseMoney(
        previousTotal +
        validBetAmount,
      );

    assertCondition(
      newTotal <=
        maximumBet,
      `Your total bets in this round cannot exceed ৳${maximumBet}.`,
      409,
      "DICE_ROUND_BET_LIMIT_EXCEEDED",
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
        [validUserId],
      );

    const user =
      userRows[0] || null;

    assertCondition(
      user,
      "Wallet user was not found.",
      404,
      "DICE_WALLET_USER_NOT_FOUND",
    );

    assertCondition(
      String(
        user.account_status ||
        "",
      ).toLowerCase() ===
        "active",
      "User account is not active.",
      403,
      "DICE_ACCOUNT_INACTIVE",
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
      "DICE_INSUFFICIENT_BALANCE",
    );

    const lockedMultiplier =
      Number(
        symbol.multiplier,
      );

    const grossPayout =
      parseMoney(
        validBetAmount *
        lockedMultiplier,
      );

    const chargePercent =
      parseMoney(
        round
          .service_charge_percent,
      );

    const serviceCharge =
      parseMoney(
        grossPayout *
        (
          chargePercent /
          100
        ),
      );

    const netPayout =
      parseMoney(
        grossPayout -
        serviceCharge,
      );

    const balanceAfterBet =
      parseMoney(
        balanceBefore -
        validBetAmount,
      );

    const betCode =
      createReferenceCode(
        "BD_BET",
      );

    const transactionId =
      createReferenceCode(
        "BD_DEBIT",
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
      "Dice bet wallet debit failed.",
      409,
      "DICE_BET_DEBIT_FAILED",
    );

    const [betResult] =
      await connection.query(
        `
          INSERT INTO bangla_dice_bets (
            bet_code,
            round_id,
            user_id,
            selected_symbol_id,
            selected_symbol_code,
            selected_symbol_name,
            selected_face_number,
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
          symbol.id,
          symbol.symbolCode,
          symbol.symbolNameBn,
          symbol.faceNumber,
          lockedMultiplier,
          validBetAmount,
          grossPayout,
          serviceCharge,
          netPayout,
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
          'bangla_dice_bet',
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
        `Bangla Dice ${symbol.symbolNameBn} bet for round ${round.round_code}`,
      ],
    );

    await connection.query(
      `
        UPDATE bangla_dice_rounds

        SET
          total_bet_amount =
            total_bet_amount + ?,

          total_potential_liability =
            total_potential_liability + ?,

          total_players =
            total_players + ?,

          total_bets =
            total_bets + 1

        WHERE id = ?
      `,
      [
        validBetAmount,
        netPayout,
        previousBetCount === 0
          ? 1
          : 0,
        validRoundId,
      ],
    );

    const [createdRows] =
      await connection.query(
        `
          SELECT *

          FROM bangla_dice_bets

          WHERE id = ?

          LIMIT 1
        `,
        [betResult.insertId],
      );

    await connection.commit();

    return {
      bet:
        mapBetRow(
          createdRows[0],
        ),

      symbol,

      roundBetSummary: {
        totalBets:
          previousBetCount + 1,

        totalBetAmount:
          newTotal,

        maximumBet,

        remainingLimit:
          parseMoney(
            maximumBet -
            newTotal,
          ),
      },

      wallet: {
        balanceBefore,
        balanceAfter:
          balanceAfterBet,
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
  mapBetRow,
  getUserRoundBets,
  getRoundBetTotals,
  placeBet,
};