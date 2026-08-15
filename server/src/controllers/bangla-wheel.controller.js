"use strict";

const {
  pool,
} = require("../config/database");

const {
  parsePositiveInteger,
  getPublicGameState
} = require(
  "../services/bangla-wheel.service"
);

const {
  placeBet,
  getUserRoundBet,
  getRoundBetTotals
} = require(
  "../services/bangla-wheel-wallet.service"
);

const {
  getRoundResult
} = require(
  "../services/bangla-wheel-settlement.service"
);

/* =========================================================
   SUCCESS RESPONSE
========================================================= */

function sendSuccess(
  response,
  {
    statusCode = 200,
    message,
    data = null
  }
) {
  return response
    .status(statusCode)
    .json({
      success: true,
      message,
      data
    });
}

/* =========================================================
   GET GAME STATE
========================================================= */

async function getGameState(
  request,
  response,
  next
) {
  try {
    const gameState =
      await getPublicGameState();

    let userBet = null;

    let betTotals = {
      animals: []
    };

    if (
      gameState
        .activeRound?.id
    ) {
      [
        userBet,
        betTotals
      ] = await Promise.all([
        getUserRoundBet(
          request.user.id,
          gameState
            .activeRound.id
        ),

        getRoundBetTotals(
          gameState
            .activeRound.id
        )
      ]);
    }

    return sendSuccess(
      response,
      {
        message:
          "Bangla Wheel state loaded successfully.",

        data: {
          ...gameState,
          userBet,
          betTotals
        }
      }
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
  next
) {
  try {
    const result =
      await placeBet({
        userId:
          request.user.id,

        roundId:
          request.body
            ?.roundId,

        animalId:
          request.body
            ?.animalId,

        betAmount:
          request.body
            ?.betAmount
      });

    return sendSuccess(
      response,
      {
        statusCode: 201,

        message:
          "Bangla Wheel bet placed successfully.",

        data: result
      }
    );
  } catch (error) {
    return next(error);
  }
}

/* =========================================================
   GET MY BET
========================================================= */

async function getMyRoundBet(
  request,
  response,
  next
) {
  try {
    const roundId =
      parsePositiveInteger(
        request.params
          ?.roundId
      );

    if (!roundId) {
      const error =
        new Error(
          "Valid Bangla Wheel round ID is required."
        );

      error.statusCode = 400;

      error.code =
        "INVALID_ROUND_ID";

      throw error;
    }

    const bet =
      await getUserRoundBet(
        request.user.id,
        roundId
      );

    return sendSuccess(
      response,
      {
        message:
          "Bangla Wheel user bet loaded successfully.",

        data: {
          bet
        }
      }
    );
  } catch (error) {
    return next(error);
  }
}

/* =========================================================
   GET ROUND RESULT
========================================================= */

async function getCompletedResult(
  request,
  response,
  next
) {
  try {
    const roundId =
      parsePositiveInteger(
        request.params
          ?.roundId
      );

    if (!roundId) {
      const error =
        new Error(
          "Valid Bangla Wheel round ID is required."
        );

      error.statusCode = 400;

      error.code =
        "INVALID_ROUND_ID";

      throw error;
    }

    const result =
      await getRoundResult(
        roundId
      );

    const availableStatuses = [
      "spinning",
      "settling",
      "completed",
      "cancelled",
      "refunded"
    ];

    if (
      !availableStatuses.includes(
        result.round
          .roundStatus
      )
    ) {
      const error =
        new Error(
          "Bangla Wheel result is not available yet."
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
          "Bangla Wheel result loaded successfully.",

        data: result
      }
    );
  } catch (error) {
    return next(error);
  }
}

/* =========================================================
   RECENT RESULTS
========================================================= */

async function getRecentResults(
  request,
  response,
  next
) {
  try {
    const [rows] =
      await pool.query(
        `
          SELECT
            id,
            round_code,
            round_status,
            winning_animal_code,
            winning_segment_index,
            winning_multiplier,
            total_bet_amount,
            total_gross_payout,
            total_service_charge,
            total_net_payout,
            total_players,
            completed_at

          FROM bangla_wheel_rounds

          WHERE round_status =
            'completed'

          ORDER BY id DESC

          LIMIT 20
        `
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

          winningAnimalCode:
            round
              .winning_animal_code,

          winningSegmentIndex:
            Number(
              round
                .winning_segment_index
            ),

          winningMultiplier:
            Number(
              round
                .winning_multiplier ||
              0
            ),

          isNilResult:
            Number(
              round
                .winning_multiplier ||
              0
            ) <= 0,

          totalBetAmount:
            Number(
              round
                .total_bet_amount ||
              0
            ),

          totalGrossPayout:
            Number(
              round
                .total_gross_payout ||
              0
            ),

          totalServiceCharge:
            Number(
              round
                .total_service_charge ||
              0
            ),

          totalNetPayout:
            Number(
              round
                .total_net_payout ||
              0
            ),

          totalPlayers:
            Number(
              round.total_players ||
              0
            ),

          completedAt:
            round.completed_at
        })
      );

    return sendSuccess(
      response,
      {
        message:
          "Recent Bangla Wheel results loaded successfully.",

        data: {
          results
        }
      }
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
  placeUserBet,
  getMyRoundBet,
  getCompletedResult,
  getRecentResults
};