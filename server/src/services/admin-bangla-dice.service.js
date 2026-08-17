"use strict";

const {
  pool,
} = require("../config/database");

const {
  assertCondition,
  parseMoney,
  parsePositiveInteger,
  mapSettingsRow,
  mapSymbolRow,
  mapRoundRow,
} = require(
  "./bangla-dice.service",
);

function parseBoolean(
  value,
  fallback = false,
) {
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

  return fallback;
}

function parsePageValue(
  value,
  fallback,
  maximum,
) {
  const number =
    Number(value);

  if (
    !Number.isInteger(number) ||
    number < 1
  ) {
    return fallback;
  }

  return Math.min(
    number,
    maximum,
  );
}

async function createAdminLog(
  connection,
  {
    adminUserId,
    actionType,
    description,
    previousData = null,
    newData = null,
    ipAddress = null,
  },
) {
  await connection.query(
    `
      INSERT INTO bangla_dice_admin_logs (
        admin_user_id,
        action_type,
        action_description,
        previous_data,
        new_data,
        ip_address
      )
      VALUES (
        ?,
        ?,
        ?,
        ?,
        ?,
        ?
      )
    `,
    [
      Number(adminUserId),
      String(actionType),
      String(description),
      previousData
        ? JSON.stringify(
            previousData,
          )
        : null,
      newData
        ? JSON.stringify(
            newData,
          )
        : null,
      ipAddress
        ? String(ipAddress)
            .slice(0, 64)
        : null,
    ],
  );
}

async function getAdminDashboard() {
  const [
    settingsRows,
    symbolRows,
    summaryRows,
    recentRoundRows,
  ] = await Promise.all([
    pool.query(
      `
        SELECT *

        FROM bangla_dice_settings

        WHERE id = 1

        LIMIT 1
      `,
    ),

    pool.query(
      `
        SELECT *

        FROM bangla_dice_symbols

        ORDER BY face_number ASC
      `,
    ),

    pool.query(
      `
        SELECT
          COUNT(*) AS total_rounds,

          SUM(
            CASE
              WHEN round_status =
                'completed'
              THEN 1
              ELSE 0
            END
          ) AS completed_rounds,

          SUM(
            CASE
              WHEN round_status =
                'refunded'
              THEN 1
              ELSE 0
            END
          ) AS refunded_rounds,

          COALESCE(
            SUM(total_bet_amount),
            0
          ) AS total_bet_amount,

          COALESCE(
            SUM(total_net_payout),
            0
          ) AS total_net_payout,

          COALESCE(
            SUM(total_service_charge),
            0
          ) AS total_service_charge,

          COALESCE(
            SUM(total_bet_amount) -
            SUM(total_net_payout),
            0
          ) AS gross_revenue

        FROM bangla_dice_rounds
      `,
    ),

    pool.query(
      `
        SELECT *

        FROM bangla_dice_rounds

        ORDER BY id DESC

        LIMIT 10
      `,
    ),
  ]);

  const summary =
    summaryRows[0][0] ||
    {};

  return {
    settings:
      mapSettingsRow(
        settingsRows[0][0],
      ),

    symbols:
      symbolRows[0].map(
        mapSymbolRow,
      ),

    summary: {
      totalRounds:
        Number(
          summary
            .total_rounds ||
          0,
        ),

      completedRounds:
        Number(
          summary
            .completed_rounds ||
          0,
        ),

      refundedRounds:
        Number(
          summary
            .refunded_rounds ||
          0,
        ),

      totalBetAmount:
        parseMoney(
          summary
            .total_bet_amount,
        ),

      totalNetPayout:
        parseMoney(
          summary
            .total_net_payout,
        ),

      totalServiceCharge:
        parseMoney(
          summary
            .total_service_charge,
        ),

      grossRevenue:
        parseMoney(
          summary
            .gross_revenue,
        ),
    },

    recentRounds:
      recentRoundRows[0].map(
        (row) =>
          mapRoundRow(
            row,
            {
              revealResult:
                true,
            },
          ),
      ),
  };
}

async function updateSettings({
  adminUserId,
  payload,
  ipAddress,
}) {
  const validAdminId =
    parsePositiveInteger(
      adminUserId,
    );

  assertCondition(
    validAdminId,
    "Valid admin user is required.",
    401,
    "INVALID_ADMIN_USER",
  );

  const resultMode =
    String(
      payload?.resultMode ||
      "",
    )
      .trim()
      .toLowerCase();

  assertCondition(
    [
      "equal",
      "weighted",
    ].includes(resultMode),
    "Result mode must be equal or weighted.",
    400,
    "INVALID_DICE_RESULT_MODE",
  );

  const minimumBet =
    parseMoney(
      payload?.minimumBet,
    );

  const maximumBet =
    parseMoney(
      payload?.maximumBet,
    );

  const serviceChargePercent =
    parseMoney(
      payload
        ?.serviceChargePercent,
    );

  const bettingDurationSeconds =
    Number(
      payload
        ?.bettingDurationSeconds,
    );

  const rollDurationSeconds =
    Number(
      payload
        ?.rollDurationSeconds,
    );

  const resultDisplaySeconds =
    Number(
      payload
        ?.resultDisplaySeconds,
    );

  const nextRoundDelaySeconds =
    Number(
      payload
        ?.nextRoundDelaySeconds,
    );

  assertCondition(
    minimumBet >= 1 &&
    minimumBet <= 100000,
    "Minimum bet must be between 1 and 100000.",
    400,
    "INVALID_DICE_MINIMUM_BET",
  );

  assertCondition(
    maximumBet >=
      minimumBet &&
    maximumBet <= 10000000,
    "Maximum bet must be greater than or equal to minimum bet.",
    400,
    "INVALID_DICE_MAXIMUM_BET",
  );

  assertCondition(
    serviceChargePercent >= 0 &&
    serviceChargePercent <= 100,
    "Service charge must be between 0 and 100 percent.",
    400,
    "INVALID_DICE_SERVICE_CHARGE",
  );

  assertCondition(
    Number.isInteger(
      bettingDurationSeconds,
    ) &&
    bettingDurationSeconds >= 5 &&
    bettingDurationSeconds <= 300,
    "Betting duration must be between 5 and 300 seconds.",
    400,
    "INVALID_DICE_BETTING_DURATION",
  );

  assertCondition(
    Number.isInteger(
      rollDurationSeconds,
    ) &&
    rollDurationSeconds >= 2 &&
    rollDurationSeconds <= 30,
    "Roll duration must be between 2 and 30 seconds.",
    400,
    "INVALID_DICE_ROLL_DURATION",
  );

  assertCondition(
    Number.isInteger(
      resultDisplaySeconds,
    ) &&
    resultDisplaySeconds >= 2 &&
    resultDisplaySeconds <= 60,
    "Result display must be between 2 and 60 seconds.",
    400,
    "INVALID_DICE_RESULT_DURATION",
  );

  assertCondition(
    Number.isInteger(
      nextRoundDelaySeconds,
    ) &&
    nextRoundDelaySeconds >= 1 &&
    nextRoundDelaySeconds <= 60,
    "Next round delay must be between 1 and 60 seconds.",
    400,
    "INVALID_DICE_NEXT_ROUND_DELAY",
  );

  const gameEnabled =
    parseBoolean(
      payload?.gameEnabled,
      true,
    );

  const connection =
    await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [previousRows] =
      await connection.query(
        `
          SELECT *

          FROM bangla_dice_settings

          WHERE id = 1

          LIMIT 1

          FOR UPDATE
        `,
      );

    const previousSettings =
      mapSettingsRow(
        previousRows[0],
      );

    assertCondition(
      previousSettings,
      "Bangla Dice settings were not found.",
      500,
      "DICE_SETTINGS_MISSING",
    );

    await connection.query(
      `
        UPDATE bangla_dice_settings

        SET
          game_enabled = ?,
          result_mode = ?,
          minimum_bet = ?,
          maximum_bet = ?,
          betting_duration_seconds = ?,
          roll_duration_seconds = ?,
          result_display_seconds = ?,
          next_round_delay_seconds = ?,
          service_charge_percent = ?

        WHERE id = 1
      `,
      [
        gameEnabled
          ? 1
          : 0,
        resultMode,
        minimumBet,
        maximumBet,
        bettingDurationSeconds,
        rollDurationSeconds,
        resultDisplaySeconds,
        nextRoundDelaySeconds,
        serviceChargePercent,
      ],
    );

    const [updatedRows] =
      await connection.query(
        `
          SELECT *

          FROM bangla_dice_settings

          WHERE id = 1

          LIMIT 1
        `,
      );

    const updatedSettings =
      mapSettingsRow(
        updatedRows[0],
      );

    await createAdminLog(
      connection,
      {
        adminUserId:
          validAdminId,

        actionType:
          "settings_updated",

        description:
          "Bangla Dice settings updated.",

        previousData:
          previousSettings,

        newData:
          updatedSettings,

        ipAddress,
      },
    );

    await connection.commit();

    return updatedSettings;
  } catch (error) {
    await connection.rollback();

    throw error;
  } finally {
    connection.release();
  }
}

async function updateSymbols({
  adminUserId,
  symbols,
  ipAddress,
}) {
  const validAdminId =
    parsePositiveInteger(
      adminUserId,
    );

  assertCondition(
    validAdminId,
    "Valid admin user is required.",
    401,
    "INVALID_ADMIN_USER",
  );

  assertCondition(
    Array.isArray(symbols) &&
    symbols.length === 6,
    "Exactly six Dice symbol settings are required.",
    400,
    "INVALID_DICE_SYMBOL_SETTINGS",
  );

  const normalizedSymbols =
    symbols.map(
      (symbol) => {
        const id =
          parsePositiveInteger(
            symbol?.id,
          );

        const multiplier =
          Number(
            symbol?.multiplier,
          );

        const probabilityWeight =
          Number(
            symbol
              ?.probabilityWeight,
          );

        assertCondition(
          id,
          "Each Dice symbol requires a valid ID.",
          400,
          "INVALID_DICE_SYMBOL_ID",
        );

        assertCondition(
          Number.isFinite(
            multiplier,
          ) &&
          multiplier >= 1 &&
          multiplier <= 100,
          "Each multiplier must be between 1 and 100.",
          400,
          "INVALID_DICE_MULTIPLIER",
        );

        assertCondition(
          Number.isFinite(
            probabilityWeight,
          ) &&
          probabilityWeight > 0 &&
          probabilityWeight <= 100000,
          "Each probability weight must be greater than zero.",
          400,
          "INVALID_DICE_WEIGHT",
        );

        return {
          id,
          multiplier:
            Number(
              multiplier.toFixed(2),
            ),

          probabilityWeight:
            Number(
              probabilityWeight
                .toFixed(4),
            ),
        };
      },
    );

  const uniqueIds =
    new Set(
      normalizedSymbols.map(
        (symbol) =>
          symbol.id,
      ),
    );

  assertCondition(
    uniqueIds.size === 6,
    "Dice symbol IDs must be unique.",
    400,
    "DUPLICATE_DICE_SYMBOL_ID",
  );

  const connection =
    await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [previousRows] =
      await connection.query(
        `
          SELECT *

          FROM bangla_dice_symbols

          ORDER BY face_number ASC

          FOR UPDATE
        `,
      );

    assertCondition(
      previousRows.length === 6,
      "Six Dice symbols were not found.",
      500,
      "DICE_SYMBOL_COUNT_INVALID",
    );

    for (
      const symbol of
      normalizedSymbols
    ) {
      const [updateResult] =
        await connection.query(
          `
            UPDATE bangla_dice_symbols

            SET
              multiplier = ?,
              probability_weight = ?

            WHERE id = ?
              AND is_active = 1
          `,
          [
            symbol.multiplier,
            symbol
              .probabilityWeight,
            symbol.id,
          ],
        );

      assertCondition(
        updateResult.affectedRows ===
          1,
        `Dice symbol ${symbol.id} could not be updated.`,
        404,
        "DICE_SYMBOL_UPDATE_FAILED",
      );
    }

    const [updatedRows] =
      await connection.query(
        `
          SELECT *

          FROM bangla_dice_symbols

          ORDER BY face_number ASC
        `,
      );

    const previousSymbols =
      previousRows.map(
        mapSymbolRow,
      );

    const updatedSymbols =
      updatedRows.map(
        mapSymbolRow,
      );

    await createAdminLog(
      connection,
      {
        adminUserId:
          validAdminId,

        actionType:
          "symbols_updated",

        description:
          "Bangla Dice multipliers and probability weights updated.",

        previousData:
          previousSymbols,

        newData:
          updatedSymbols,

        ipAddress,
      },
    );

    await connection.commit();

    return updatedSymbols;
  } catch (error) {
    await connection.rollback();

    throw error;
  } finally {
    connection.release();
  }
}

async function getAdminRounds(
  query = {},
) {
  const page =
    parsePageValue(
      query.page,
      1,
      100000,
    );

  const limit =
    parsePageValue(
      query.limit,
      20,
      100,
    );

  const offset =
    (page - 1) *
    limit;

  const status =
    String(
      query.status ||
      "",
    )
      .trim()
      .toLowerCase();

  const validStatuses = [
    "betting",
    "rolling",
    "settling",
    "completed",
    "refunding",
    "refunded",
    "cancelled",
  ];

  const conditions = [];
  const parameters = [];

  if (
    validStatuses.includes(
      status,
    )
  ) {
    conditions.push(
      "round_status = ?",
    );

    parameters.push(
      status,
    );
  }

  const whereSql =
    conditions.length > 0
      ? `WHERE ${conditions.join(
          " AND ",
        )}`
      : "";

  const [
    countRows,
    roundRows,
  ] = await Promise.all([
    pool.query(
      `
        SELECT
          COUNT(*) AS total

        FROM bangla_dice_rounds

        ${whereSql}
      `,
      parameters,
    ),

    pool.query(
      `
        SELECT *

        FROM bangla_dice_rounds

        ${whereSql}

        ORDER BY id DESC

        LIMIT ?
        OFFSET ?
      `,
      [
        ...parameters,
        limit,
        offset,
      ],
    ),
  ]);

  const total =
    Number(
      countRows[0][0]
        ?.total ||
      0,
    );

  return {
    page,
    limit,
    total,

    totalPages:
      Math.max(
        1,
        Math.ceil(
          total /
          limit,
        ),
      ),

    rounds:
      roundRows[0].map(
        (row) =>
          mapRoundRow(
            row,
            {
              revealResult:
                true,
            },
          ),
      ),
  };
}

async function getAdminRoundBets(
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

  const [
    roundRows,
    betRows,
  ] = await Promise.all([
    pool.query(
      `
        SELECT *

        FROM bangla_dice_rounds

        WHERE id = ?

        LIMIT 1
      `,
      [validRoundId],
    ),

    pool.query(
      `
        SELECT
          b.*,

          u.uid,
          u.full_name,
          u.username,
          u.phone

        FROM bangla_dice_bets AS b

        INNER JOIN users AS u
          ON u.id = b.user_id

        WHERE b.round_id = ?

        ORDER BY b.id ASC
      `,
      [validRoundId],
    ),
  ]);

  assertCondition(
    roundRows[0][0],
    "Bangla Dice round was not found.",
    404,
    "DICE_ROUND_NOT_FOUND",
  );

  return {
    round:
      mapRoundRow(
        roundRows[0][0],
        {
          revealResult:
            true,
        },
      ),

    bets:
      betRows[0].map(
        (bet) => ({
          id:
            Number(bet.id),

          betCode:
            bet.bet_code,

          userId:
            Number(
              bet.user_id,
            ),

          uid:
            bet.uid,

          fullName:
            bet.full_name,

          username:
            bet.username,

          phone:
            bet.phone,

          selectedSymbolCode:
            bet
              .selected_symbol_code,

          selectedSymbolName:
            bet
              .selected_symbol_name,

          multiplier:
            Number(
              bet
                .locked_multiplier,
            ),

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

module.exports = {
  getAdminDashboard,
  updateSettings,
  updateSymbols,
  getAdminRounds,
  getAdminRoundBets,
};