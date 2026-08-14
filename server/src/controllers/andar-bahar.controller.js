"use strict";

const {
  pool,
} = require("../config/database");

const {
  parsePositiveInteger,
  createRound,
  getPublicGameState,
} = require(
  "../services/andar-bahar.service",
);

const {
  placeBet,
  getUserRoundBet,
  getRoundBetTotals,
} = require(
  "../services/andar-bahar-wallet.service",
);

const {
  getRoundResult,
} = require(
  "../services/andar-bahar-settlement.service",
);

/* =========================================================
   RESPONSE HELPERS
========================================================= */

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

/* =========================================================
   GET GAME STATE
========================================================= */

async function getGameState(
  request,
  response,
  next,
) {
  try {
    const gameState =
      await getPublicGameState();

    let userBet = null;
    let betTotals = null;

    if (
      gameState.activeRound
        ?.id
    ) {
      [
        userBet,
        betTotals,
      ] = await Promise.all([
        getUserRoundBet(
          request.user.id,
          gameState.activeRound.id,
        ),

        getRoundBetTotals(
          gameState.activeRound.id,
        ),
      ]);
    }

    return sendSuccess(
      response,
      {
        message:
          "Andar Bahar game state loaded successfully.",

        data: {
          ...gameState,
          userBet,
          betTotals,
        },
      },
    );
  } catch (error) {
    return next(error);
  }
}

/* =========================================================
   CREATE OR GET ROUND
========================================================= */

async function createOrGetRound(
  request,
  response,
  next,
) {
  try {
    const result =
      await createRound();

    return sendSuccess(
      response,
      {
        statusCode:
          result.created
            ? 201
            : 200,

        message:
          result.created
            ? "Andar Bahar round created successfully."
            : "Active Andar Bahar round loaded successfully.",

        data: result,
      },
    );
  } catch (error) {
    return next(error);
  }
}

/* =========================================================
   PLACE USER BET
========================================================= */

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

        selectedSide:
          request.body
            ?.selectedSide,

        betAmount:
          request.body
            ?.betAmount,
      });

    return sendSuccess(
      response,
      {
        statusCode: 201,

        message:
          "Andar Bahar bet placed successfully.",

        data: result,
      },
    );
  } catch (error) {
    return next(error);
  }
}

/* =========================================================
   GET MY ROUND BET
========================================================= */

async function getMyRoundBet(
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
          "Valid Andar Bahar round ID is required.",
        );

      error.statusCode = 400;
      error.code =
        "INVALID_ROUND_ID";

      throw error;
    }

    const bet =
      await getUserRoundBet(
        request.user.id,
        roundId,
      );

    return sendSuccess(
      response,
      {
        message:
          "Andar Bahar user bet loaded successfully.",

        data: {
          bet,
        },
      },
    );
  } catch (error) {
    return next(error);
  }
}

/* =========================================================
   GET COMPLETED ROUND RESULT
========================================================= */

async function getCompletedResult(
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
          "Valid Andar Bahar round ID is required.",
        );

      error.statusCode = 400;
      error.code =
        "INVALID_ROUND_ID";

      throw error;
    }

    const result =
      await getRoundResult(
        roundId,
      );

    const resultAvailable =
      [
        "completed",
        "cancelled",
        "refunded",
      ].includes(
        result.round
          .roundStatus,
      );

    if (!resultAvailable) {
      const error =
        new Error(
          "Round result is not available yet.",
        );

      error.statusCode = 409;
      error.code =
        "RESULT_NOT_AVAILABLE";

      throw error;
    }

    return sendSuccess(
      response,
      {
        message:
          "Andar Bahar result loaded successfully.",

        data: result,
      },
    );
  } catch (error) {
    return next(error);
  }
}

/* =========================================================
   GET RECENT RESULTS
========================================================= */

async function getRecentResults(
  request,
  response,
  next,
) {
  try {
    const [rows] =
      await pool.query(
        `
          SELECT
            id,
            round_code,
            round_status,
            joker_card,
            joker_rank,
            winning_side,
            matching_card,
            matching_card_position,
            total_andar_bet,
            total_bahar_bet,
            total_bet_amount,
            completed_at

          FROM andar_bahar_rounds

          WHERE round_status =
            'completed'

          ORDER BY id DESC

          LIMIT 20
        `,
      );

    const results =
      rows.map(
        (round) => ({
          id:
            Number(round.id),

          roundCode:
            round.round_code,

          roundStatus:
            round.round_status,

          jokerCard:
            round.joker_card,

          jokerRank:
            round.joker_rank,

          winningSide:
            round.winning_side,

          matchingCard:
            round.matching_card,

          matchingCardPosition:
            Number(
              round
                .matching_card_position ||
              0,
            ),

          totalAndarBet:
            Number(
              round
                .total_andar_bet ||
              0,
            ),

          totalBaharBet:
            Number(
              round
                .total_bahar_bet ||
              0,
            ),

          totalBetAmount:
            Number(
              round
                .total_bet_amount ||
              0,
            ),

          completedAt:
            round.completed_at,
        }),
      );

    return sendSuccess(
      response,
      {
        message:
          "Recent Andar Bahar results loaded successfully.",

        data: {
          results,
        },
      },
    );
  } catch (error) {
    return next(error);
  }
}

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  getGameState,
  createOrGetRound,
  placeUserBet,
  getMyRoundBet,
  getCompletedResult,
  getRecentResults,
};