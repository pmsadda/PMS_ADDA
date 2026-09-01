"use strict";

const {
  pool
} = require(
  "../config/database"
);


/* =========================================================
   ERROR
========================================================= */

function createAdminKaitError(
  message,
  statusCode = 400,
  code = "ADMIN_KAIT_ERROR"
) {
  const error =
    new Error(message);

  error.statusCode =
    statusCode;

  error.code =
    code;

  return error;
}


/* =========================================================
   HELPERS
========================================================= */

function parseMoney(value) {
  const number =
    Number(value);

  return Number.isFinite(
    number
  )
    ? Number(
        number.toFixed(2)
      )
    : 0;
}


function parseBoolean(value) {
  if (
    value === true ||
    value === 1 ||
    value === "1" ||
    String(value)
      .toLowerCase() ===
      "true"
  ) {
    return true;
  }

  if (
    value === false ||
    value === 0 ||
    value === "0" ||
    String(value)
      .toLowerCase() ===
      "false"
  ) {
    return false;
  }

  return null;
}


/* =========================================================
   SETTINGS MAP
========================================================= */

function mapSettings(row) {
  if (!row) {
    throw createAdminKaitError(
      "Kait settings were not found.",
      500,
      "KAIT_SETTINGS_NOT_FOUND"
    );
  }

  return {
    gameEnabled:
      Boolean(
        Number(
          row.game_enabled
        )
      ),

    minimumBet:
      parseMoney(
        row.minimum_bet
      ),

    maximumBet:
      parseMoney(
        row.maximum_bet
      ),

    winningMultiplier:
      Number(
        row.winning_multiplier
      ),

    serviceChargePercent:
      Number(
        row.service_charge_percent
      ),

    bettingDurationSeconds:
      Number(
        row.betting_duration_seconds
      ),

    cardDealIntervalMs:
      Number(
        row.card_deal_interval_ms
      ),

    resultDisplaySeconds:
      Number(
        row.result_display_seconds
      ),

    nextRoundDelaySeconds:
      Number(
        row.next_round_delay_seconds
      ),

    updatedAt:
      row.updated_at ||
      null
  };
}


/* =========================================================
   ROUND MAP
========================================================= */

function mapRound(row) {
  if (!row) {
    return null;
  }

  return {
    id:
      Number(row.id),

    roundCode:
      row.round_code,

    roundStatus:
      row.round_status,

    totalPlayers:
      Number(
        row.total_players ||
        0
      ),

    totalBets:
      Number(
        row.total_bets ||
        0
      ),

    totalBetAmount:
      parseMoney(
        row.total_bet_amount
      ),

    totalGrossPayout:
      parseMoney(
        row.total_gross_payout
      ),

    totalServiceCharge:
      parseMoney(
        row.total_service_charge
      ),

    totalNetPayout:
      parseMoney(
        row.total_net_payout
      ),

    lastDealtPosition:
      Number(
        row.last_dealt_position ||
        0
      ),

    bettingStartedAt:
      row.betting_started_at,

    bettingEndsAt:
      row.betting_ends_at,

    settledAt:
      row.settled_at,

    createdAt:
      row.created_at
  };
}


/* =========================================================
   ADMIN DASHBOARD
========================================================= */

async function getAdminDashboard() {
  const [
    settingsResult,
    activeRoundResult,
    summaryResult,
    recentRoundsResult
  ] =
    await Promise.all([

      pool.query(
        `
          SELECT *

          FROM kait_settings

          WHERE id = 1

          LIMIT 1
        `
      ),

      pool.query(
        `
          SELECT *

          FROM kait_rounds

          WHERE round_status IN (
            'betting',
            'dealing',
            'settling',
            'refunding'
          )

          ORDER BY id DESC

          LIMIT 1
        `
      ),

      pool.query(
        `
          SELECT
            COUNT(*) AS total_rounds,

            COALESCE(
              SUM(
                CASE
                  WHEN round_status =
                    'completed'
                  THEN 1
                  ELSE 0
                END
              ),
              0
            ) AS completed_rounds,

            COALESCE(
              SUM(total_bet_amount),
              0
            ) AS total_bet_amount,

            COALESCE(
              SUM(total_gross_payout),
              0
            ) AS total_gross_payout,

            COALESCE(
              SUM(total_service_charge),
              0
            ) AS total_service_charge,

            COALESCE(
              SUM(total_net_payout),
              0
            ) AS total_net_payout

          FROM kait_rounds
        `
      ),

      pool.query(
        `
          SELECT *

          FROM kait_rounds

          ORDER BY id DESC

          LIMIT 10
        `
      )

    ]);


  const summary =
    summaryResult[0][0] ||
    {};


  return {
    settings:
      mapSettings(
        settingsResult[0][0]
      ),

    currentRound:
      mapRound(
        activeRoundResult[0][0]
      ),

    summary: {
      totalRounds:
        Number(
          summary.total_rounds ||
          0
        ),

      completedRounds:
        Number(
          summary.completed_rounds ||
          0
        ),

      totalBetAmount:
        parseMoney(
          summary.total_bet_amount
        ),

      totalGrossPayout:
        parseMoney(
          summary.total_gross_payout
        ),

      totalServiceCharge:
        parseMoney(
          summary.total_service_charge
        ),

      totalNetPayout:
        parseMoney(
          summary.total_net_payout
        )
    },

    recentRounds:
      recentRoundsResult[0]
        .map(
          mapRound
        )
  };
}


/* =========================================================
   UPDATE SETTINGS
========================================================= */

async function updateSettings(
  payload
) {
  const gameEnabled =
    parseBoolean(
      payload?.gameEnabled
    );

  const minimumBet =
    parseMoney(
      payload?.minimumBet
    );

  const maximumBet =
    parseMoney(
      payload?.maximumBet
    );

  const winningMultiplier =
    Number(
      payload?.winningMultiplier
    );

  const serviceChargePercent =
    Number(
      payload
        ?.serviceChargePercent
    );

  const bettingDurationSeconds =
    Number(
      payload
        ?.bettingDurationSeconds
    );

  const cardDealIntervalMs =
    Number(
      payload
        ?.cardDealIntervalMs
    );

  const resultDisplaySeconds =
    Number(
      payload
        ?.resultDisplaySeconds
    );

  const nextRoundDelaySeconds =
    Number(
      payload
        ?.nextRoundDelaySeconds
    );


  /* ========================
     VALIDATION
  ======================== */

  if (
    gameEnabled === null
  ) {
    throw createAdminKaitError(
      "Game status is invalid.",
      400,
      "KAIT_GAME_STATUS_INVALID"
    );
  }


  if (
    minimumBet <= 0
  ) {
    throw createAdminKaitError(
      "Minimum bet must be greater than 0.",
      400,
      "KAIT_MINIMUM_BET_INVALID"
    );
  }


  if (
    maximumBet <
    minimumBet
  ) {
    throw createAdminKaitError(
      "Maximum bet must be greater than or equal to minimum bet.",
      400,
      "KAIT_MAXIMUM_BET_INVALID"
    );
  }


  if (
    !Number.isFinite(
      winningMultiplier
    ) ||
    winningMultiplier < 1 ||
    winningMultiplier > 100
  ) {
    throw createAdminKaitError(
      "Winning multiplier must be between 1 and 100.",
      400,
      "KAIT_MULTIPLIER_INVALID"
    );
  }


  if (
    !Number.isFinite(
      serviceChargePercent
    ) ||
    serviceChargePercent < 0 ||
    serviceChargePercent > 100
  ) {
    throw createAdminKaitError(
      "Service charge must be between 0 and 100 percent.",
      400,
      "KAIT_SERVICE_CHARGE_INVALID"
    );
  }


  if (
    !Number.isInteger(
      bettingDurationSeconds
    ) ||
    bettingDurationSeconds < 5 ||
    bettingDurationSeconds > 300
  ) {
    throw createAdminKaitError(
      "Betting time must be between 5 and 300 seconds.",
      400,
      "KAIT_BETTING_TIME_INVALID"
    );
  }


  if (
    !Number.isInteger(
      cardDealIntervalMs
    ) ||
    cardDealIntervalMs < 200 ||
    cardDealIntervalMs > 5000
  ) {
    throw createAdminKaitError(
      "Card deal speed must be between 200 and 5000 ms.",
      400,
      "KAIT_CARD_SPEED_INVALID"
    );
  }


  if (
    !Number.isInteger(
      resultDisplaySeconds
    ) ||
    resultDisplaySeconds < 1 ||
    resultDisplaySeconds > 60
  ) {
    throw createAdminKaitError(
      "Result display time must be between 1 and 60 seconds.",
      400,
      "KAIT_RESULT_TIME_INVALID"
    );
  }


  if (
    !Number.isInteger(
      nextRoundDelaySeconds
    ) ||
    nextRoundDelaySeconds < 1 ||
    nextRoundDelaySeconds > 60
  ) {
    throw createAdminKaitError(
      "Next round delay must be between 1 and 60 seconds.",
      400,
      "KAIT_NEXT_ROUND_DELAY_INVALID"
    );
  }


  const connection =
    await pool
      .getConnection();


  try {
    await connection
      .beginTransaction();


    const [currentRows] =
      await connection.query(
        `
          SELECT *

          FROM kait_settings

          WHERE id = 1

          LIMIT 1

          FOR UPDATE
        `
      );


    if (
      !currentRows[0]
    ) {
      throw createAdminKaitError(
        "Kait settings were not found.",
        500,
        "KAIT_SETTINGS_NOT_FOUND"
      );
    }


    await connection.query(
      `
        UPDATE kait_settings

        SET
          game_enabled = ?,

          minimum_bet = ?,

          maximum_bet = ?,

          winning_multiplier = ?,

          service_charge_percent = ?,

          betting_duration_seconds = ?,

          card_deal_interval_ms = ?,

          result_display_seconds = ?,

          next_round_delay_seconds = ?

        WHERE id = 1
      `,
      [
        gameEnabled
          ? 1
          : 0,

        minimumBet,

        maximumBet,

        winningMultiplier,

        serviceChargePercent,

        bettingDurationSeconds,

        cardDealIntervalMs,

        resultDisplaySeconds,

        nextRoundDelaySeconds
      ]
    );


    const [updatedRows] =
      await connection.query(
        `
          SELECT *

          FROM kait_settings

          WHERE id = 1

          LIMIT 1
        `
      );


    await connection.commit();


    return mapSettings(
      updatedRows[0]
    );

  } catch (error) {
    await connection.rollback();

    throw error;

  } finally {
    connection.release();
  }
}


/* =========================================================
   EXPORT
========================================================= */

module.exports = {
  getAdminDashboard,
  updateSettings
};