"use strict";

const {
  pool,
} = require("../config/database");

const {
  assertCondition,
  parseMoney,
  parsePositiveInteger,
  getGameSettings,
} = require(
  "./andar-bahar.service",
);

/* =========================================================
   VALUE HELPERS
========================================================= */

function parseBoolean(value) {
  if (
    value === true ||
    value === 1 ||
    value === "1" ||
    value === "true"
  ) {
    return true;
  }

  if (
    value === false ||
    value === 0 ||
    value === "0" ||
    value === "false"
  ) {
    return false;
  }

  return null;
}

function parsePageValue(
  value,
  fallback,
) {
  const parsed =
    Number.parseInt(
      value,
      10,
    );

  if (
    !Number.isInteger(parsed) ||
    parsed < 1
  ) {
    return fallback;
  }

  return parsed;
}

/* =========================================================
   ADMIN DASHBOARD
========================================================= */

async function getAdminDashboard() {
  const [
    settings,
    summaryResult,
    recentRoundResult,
  ] = await Promise.all([
    getGameSettings(),

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
            SUM(
              CASE
                WHEN round_status =
                  'refunded'
                THEN 1
                ELSE 0
              END
            ),
            0
          ) AS refunded_rounds,

          COALESCE(
            SUM(total_bet_amount),
            0
          ) AS total_bet_amount,

          COALESCE(
            SUM(
              total_service_charge
            ),
            0
          ) AS total_service_charge,

          COALESCE(
            SUM(total_net_payout),
            0
          ) AS total_net_payout

        FROM andar_bahar_rounds
      `,
    ),

    pool.query(
      `
        SELECT
          id,
          round_code,
          round_status,
          winning_side,
          total_bet_amount,
          total_service_charge,
          created_at,
          completed_at

        FROM andar_bahar_rounds

        ORDER BY id DESC

        LIMIT 1
      `,
    ),
  ]);

  const summary =
    summaryResult[0][0] || {};

  const recentRound =
    recentRoundResult[0][0] ||
    null;

  return {
    settings,

    summary: {
      totalRounds:
        Number(
          summary.total_rounds ||
          0,
        ),

      completedRounds:
        Number(
          summary.completed_rounds ||
          0,
        ),

      refundedRounds:
        Number(
          summary.refunded_rounds ||
          0,
        ),

      totalBetAmount:
        parseMoney(
          summary.total_bet_amount,
        ),

      totalServiceCharge:
        parseMoney(
          summary
            .total_service_charge,
        ),

      totalNetPayout:
        parseMoney(
          summary.total_net_payout,
        ),
    },

    recentRound:
      recentRound
        ? {
            id:
              Number(
                recentRound.id,
              ),

            roundCode:
              recentRound
                .round_code,

            roundStatus:
              recentRound
                .round_status,

            winningSide:
              recentRound
                .winning_side ||
              null,

            totalBetAmount:
              parseMoney(
                recentRound
                  .total_bet_amount,
              ),

            totalServiceCharge:
              parseMoney(
                recentRound
                  .total_service_charge,
              ),

            createdAt:
              recentRound
                .created_at,

            completedAt:
              recentRound
                .completed_at,
          }
        : null,
  };
}

/* =========================================================
   UPDATE SETTINGS
========================================================= */

async function updateGameSettings(
  adminId,
  payload = {},
  metadata = {},
) {
  const validAdminId =
    parsePositiveInteger(
      adminId,
    );

  assertCondition(
    validAdminId,
    "Valid admin ID is required.",
    401,
    "INVALID_ADMIN_ID",
  );

  const gameEnabled =
    parseBoolean(
      payload.gameEnabled,
    );

  const minimumBet =
    parseMoney(
      payload.minimumBet,
    );

  const maximumBet =
    parseMoney(
      payload.maximumBet,
    );

  const bettingDurationSeconds =
    Number.parseInt(
      payload
        .bettingDurationSeconds,
      10,
    );

  const resultDisplaySeconds =
    Number.parseInt(
      payload
        .resultDisplaySeconds,
      10,
    );

  const nextRoundDelaySeconds =
    Number.parseInt(
      payload
        .nextRoundDelaySeconds,
      10,
    );

  const serviceChargePercent =
    parseMoney(
      payload
        .serviceChargePercent,
    );

  assertCondition(
    gameEnabled !== null,
    "Game enabled value is required.",
    400,
    "INVALID_GAME_ENABLED",
  );

  assertCondition(
    minimumBet >= 5,
    "Minimum bet cannot be less than ৳5.",
    400,
    "INVALID_MINIMUM_BET",
  );

  assertCondition(
    maximumBet >=
      minimumBet,
    "Maximum bet must be greater than or equal to minimum bet.",
    400,
    "INVALID_MAXIMUM_BET",
  );

  assertCondition(
    maximumBet <= 100000,
    "Maximum bet cannot exceed ৳100000.",
    400,
    "MAXIMUM_BET_TOO_HIGH",
  );

  assertCondition(
    Number.isInteger(
      bettingDurationSeconds,
    ) &&
      bettingDurationSeconds >= 10 &&
      bettingDurationSeconds <= 120,
    "Betting duration must be between 10 and 120 seconds.",
    400,
    "INVALID_BETTING_DURATION",
  );

  assertCondition(
    Number.isInteger(
      resultDisplaySeconds,
    ) &&
      resultDisplaySeconds >= 3 &&
      resultDisplaySeconds <= 60,
    "Result display duration must be between 3 and 60 seconds.",
    400,
    "INVALID_RESULT_DURATION",
  );

  assertCondition(
    Number.isInteger(
      nextRoundDelaySeconds,
    ) &&
      nextRoundDelaySeconds >= 1 &&
      nextRoundDelaySeconds <= 60,
    "Next round delay must be between 1 and 60 seconds.",
    400,
    "INVALID_NEXT_ROUND_DELAY",
  );

  assertCondition(
    serviceChargePercent >= 0 &&
      serviceChargePercent <= 20,
    "Service charge must be between 0% and 20%.",
    400,
    "INVALID_SERVICE_CHARGE",
  );

  const connection =
    await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [oldRows] =
      await connection.query(
        `
          SELECT
            *

          FROM andar_bahar_settings

          WHERE id = 1

          LIMIT 1

          FOR UPDATE
        `,
      );

    const oldSettings =
      oldRows[0] || null;

    assertCondition(
      oldSettings,
      "Andar Bahar settings were not found.",
      500,
      "SETTINGS_NOT_FOUND",
    );

    await connection.query(
      `
        UPDATE andar_bahar_settings

        SET
          game_enabled = ?,
          minimum_bet = ?,
          maximum_bet = ?,
          betting_duration_seconds = ?,
          result_display_seconds = ?,
          next_round_delay_seconds = ?,
          service_charge_percent = ?,
          updated_by = ?

        WHERE id = 1
      `,
      [
        gameEnabled ? 1 : 0,
        minimumBet,
        maximumBet,
        bettingDurationSeconds,
        resultDisplaySeconds,
        nextRoundDelaySeconds,
        serviceChargePercent,
        validAdminId,
      ],
    );

    const [newRows] =
      await connection.query(
        `
          SELECT
            *

          FROM andar_bahar_settings

          WHERE id = 1

          LIMIT 1
        `,
      );

    const newSettings =
      newRows[0];

    await connection.query(
      `
        INSERT INTO andar_bahar_admin_logs (
          admin_id,
          action_type,
          old_values,
          new_values,
          ip_address,
          user_agent
        )
        VALUES (
          ?,
          'update_settings',
          ?,
          ?,
          ?,
          ?
        )
      `,
      [
        validAdminId,

        JSON.stringify({
          gameEnabled:
            Number(
              oldSettings
                .game_enabled,
            ) === 1,

          minimumBet:
            parseMoney(
              oldSettings
                .minimum_bet,
            ),

          maximumBet:
            parseMoney(
              oldSettings
                .maximum_bet,
            ),

          bettingDurationSeconds:
            Number(
              oldSettings
                .betting_duration_seconds,
            ),

          resultDisplaySeconds:
            Number(
              oldSettings
                .result_display_seconds,
            ),

          nextRoundDelaySeconds:
            Number(
              oldSettings
                .next_round_delay_seconds,
            ),

          serviceChargePercent:
            parseMoney(
              oldSettings
                .service_charge_percent,
            ),
        }),

        JSON.stringify({
          gameEnabled:
            Number(
              newSettings
                .game_enabled,
            ) === 1,

          minimumBet:
            parseMoney(
              newSettings
                .minimum_bet,
            ),

          maximumBet:
            parseMoney(
              newSettings
                .maximum_bet,
            ),

          bettingDurationSeconds:
            Number(
              newSettings
                .betting_duration_seconds,
            ),

          resultDisplaySeconds:
            Number(
              newSettings
                .result_display_seconds,
            ),

          nextRoundDelaySeconds:
            Number(
              newSettings
                .next_round_delay_seconds,
            ),

          serviceChargePercent:
            parseMoney(
              newSettings
                .service_charge_percent,
            ),
        }),

        String(
          metadata.ipAddress ||
          "",
        ).slice(0, 64) ||
          null,

        String(
          metadata.userAgent ||
          "",
        ).slice(0, 500) ||
          null,
      ],
    );

    await connection.commit();

    return getGameSettings();
  } catch (error) {
    await connection.rollback();

    throw error;
  } finally {
    connection.release();
  }
}

/* =========================================================
   ROUND HISTORY
========================================================= */

async function getAdminRounds(
  query = {},
) {
  const page =
    parsePageValue(
      query.page,
      1,
    );

  const limit =
    Math.min(
      100,
      parsePageValue(
        query.limit,
        20,
      ),
    );

  const offset =
    (page - 1) * limit;

  const status =
    String(
      query.status || "",
    )
      .trim()
      .toLowerCase();

  const allowedStatuses = [
    "betting",
    "betting_closed",
    "dealing",
    "settling",
    "completed",
    "cancelled",
    "refunded",
  ];

  const whereParts = [];
  const parameters = [];

  if (
    allowedStatuses.includes(
      status,
    )
  ) {
    whereParts.push(
      "round_status = ?",
    );

    parameters.push(status);
  }

  const whereClause =
    whereParts.length
      ? `WHERE ${whereParts.join(
          " AND ",
        )}`
      : "";

  const [rows] =
    await pool.query(
      `
        SELECT
          id,
          round_code,
          round_status,
          joker_card,
          winning_side,
          matching_card,
          matching_card_position,
          total_andar_bet,
          total_bahar_bet,
          total_bet_amount,
          total_gross_payout,
          total_service_charge,
          total_net_payout,
          cancellation_reason,
          created_at,
          completed_at

        FROM andar_bahar_rounds

        ${whereClause}

        ORDER BY id DESC

        LIMIT ?
        OFFSET ?
      `,
      [
        ...parameters,
        limit,
        offset,
      ],
    );

  const [countRows] =
    await pool.query(
      `
        SELECT
          COUNT(*) AS total

        FROM andar_bahar_rounds

        ${whereClause}
      `,
      parameters,
    );

  return {
    rounds:
      rows.map(
        (round) => ({
          id:
            Number(round.id),

          roundCode:
            round.round_code,

          roundStatus:
            round.round_status,

          jokerCard:
            round.joker_card ||
            null,

          winningSide:
            round.winning_side ||
            null,

          matchingCard:
            round.matching_card ||
            null,

          matchingCardPosition:
            Number(
              round
                .matching_card_position ||
              0,
            ),

          totalAndarBet:
            parseMoney(
              round
                .total_andar_bet,
            ),

          totalBaharBet:
            parseMoney(
              round
                .total_bahar_bet,
            ),

          totalBetAmount:
            parseMoney(
              round
                .total_bet_amount,
            ),

          totalGrossPayout:
            parseMoney(
              round
                .total_gross_payout,
            ),

          totalServiceCharge:
            parseMoney(
              round
                .total_service_charge,
            ),

          totalNetPayout:
            parseMoney(
              round
                .total_net_payout,
            ),

          cancellationReason:
            round
              .cancellation_reason ||
            null,

          createdAt:
            round.created_at,

          completedAt:
            round.completed_at,
        }),
      ),

    pagination: {
      page,
      limit,

      total:
        Number(
          countRows[0]
            ?.total ||
          0,
        ),
    },
  };
}

/* =========================================================
   ROUND BET HISTORY
========================================================= */

async function getAdminRoundBets(
  roundId,
) {
  const validRoundId =
    parsePositiveInteger(
      roundId,
    );

  assertCondition(
    validRoundId,
    "Valid Andar Bahar round ID is required.",
    400,
    "INVALID_ROUND_ID",
  );

  const [rows] =
    await pool.query(
      `
        SELECT
          ab.id,
          ab.bet_code,
          ab.round_id,
          ab.user_id,
          ab.selected_side,
          ab.bet_amount,
          ab.bet_status,
          ab.gross_payout,
          ab.service_charge,
          ab.net_payout,
          ab.placed_at,
          ab.settled_at,

          u.uid,
          u.full_name,
          u.username,
          u.phone

        FROM andar_bahar_bets ab

        INNER JOIN users u
          ON u.id = ab.user_id

        WHERE ab.round_id = ?

        ORDER BY ab.id DESC
      `,
      [validRoundId],
    );

  return {
    bets:
      rows.map(
        (bet) => ({
          id:
            Number(bet.id),

          betCode:
            bet.bet_code,

          roundId:
            Number(
              bet.round_id,
            ),

          userId:
            Number(
              bet.user_id,
            ),

          user: {
            uid:
              bet.uid || null,

            fullName:
              bet.full_name ||
              null,

            username:
              bet.username ||
              null,

            phone:
              bet.phone || null,
          },

          selectedSide:
            bet.selected_side,

          betAmount:
            parseMoney(
              bet.bet_amount,
            ),

          betStatus:
            bet.bet_status,

          grossPayout:
            parseMoney(
              bet.gross_payout,
            ),

          serviceCharge:
            parseMoney(
              bet.service_charge,
            ),

          netPayout:
            parseMoney(
              bet.net_payout,
            ),

          placedAt:
            bet.placed_at,

          settledAt:
            bet.settled_at,
        }),
      ),
  };
}

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  getAdminDashboard,
  updateGameSettings,
  getAdminRounds,
  getAdminRoundBets,
};