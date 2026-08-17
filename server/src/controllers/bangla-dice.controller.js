"use strict";

const {
  pool,
} = require("../config/database");

const {
  parsePositiveInteger,
  getPublicGameState,
  mapRoundRow,
} = require(
  "../services/bangla-dice.service",
);

const {
  placeBet,
  getUserRoundBets,
  getRoundBetTotals,
} = require(
  "../services/bangla-dice-wallet.service",
);

function sendSuccess(
  response,
  {
    statusCode = 200,
    message,
    data = null,
  },
) {
  return response
    .status(statusCode)
    .json({
      success: true,
      message,
      data,
    });
}

async function getGameState(
  request,
  response,
  next,
) {
  try {
    const state =
      await getPublicGameState();

    let userBetState = {
      bets: [],
      summary: {
        totalBets: 0,
        totalBetAmount: 0,
        symbolBetAmounts: {},
      },
    };

    let betTotals = {
      totalBets: 0,
      totalBetAmount: 0,
      symbols: [],
    };

    if (
      state.activeRound?.id
    ) {
      [
        userBetState,
        betTotals,
      ] = await Promise.all([
        getUserRoundBets(
          request.user.id,
          state.activeRound.id,
        ),

        getRoundBetTotals(
          state.activeRound.id,
        ),
      ]);
    }

    const [walletRows] =
      await pool.query(
        `
          SELECT wallet_balance

          FROM users

          WHERE id = ?

          LIMIT 1
        `,
        [request.user.id],
      );

    return sendSuccess(
      response,
      {
        message:
          "Bangla Dice state loaded.",

        data: {
          ...state,

          userBets:
            userBetState.bets,

          userBetSummary:
            userBetState.summary,

          betTotals,

          walletBalance:
            Number(
              walletRows[0]
                ?.wallet_balance ||
              0,
            ),
        },
      },
    );
  } catch (error) {
    return next(error);
  }
}

async function placeUserBet(
  request,
  response,
  next,
) {
  try {
    const result =
      await placeBet({
        userId:
          request.user.id,

        roundId:
          request.body
            ?.roundId,

        symbolId:
          request.body
            ?.symbolId,

        betAmount:
          request.body
            ?.betAmount,
      });

    return sendSuccess(
      response,
      {
        statusCode: 201,

        message:
          "Bangla Dice bet placed successfully.",

        data: result,
      },
    );
  } catch (error) {
    return next(error);
  }
}

async function getMyRoundBets(
  request,
  response,
  next,
) {
  try {
    const roundId =
      parsePositiveInteger(
        request.params
          ?.roundId,
      );

    if (!roundId) {
      const error =
        new Error(
          "Valid Dice round ID is required.",
        );

      error.statusCode = 400;
      error.code =
        "INVALID_DICE_ROUND_ID";

      throw error;
    }

    const result =
      await getUserRoundBets(
        request.user.id,
        roundId,
      );

    return sendSuccess(
      response,
      {
        message:
          "Your Dice bets loaded.",

        data: result,
      },
    );
  } catch (error) {
    return next(error);
  }
}

async function getRecentResults(
  request,
  response,
  next,
) {
  try {
    const [rows] =
      await pool.query(
        `
          SELECT *

          FROM bangla_dice_rounds

          WHERE round_status =
            'completed'

          ORDER BY id DESC

          LIMIT 12
        `,
      );

    return sendSuccess(
      response,
      {
        message:
          "Recent Dice results loaded.",

        data: {
          results:
            rows.map(
              (row) =>
                mapRoundRow(
                  row,
                  {
                    revealResult:
                      true,
                  },
                ),
            ),
        },
      },
    );
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getGameState,
  placeUserBet,
  getMyRoundBets,
  getRecentResults,
};