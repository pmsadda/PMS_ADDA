"use strict";

const { pool } = require("../config/database");

const {
  RESULT_MODE,
  assertCondition,
  parseMoney,
  parsePositiveInteger,
  parseJsonValue,
  mapSettingsRow,
  mapAnimalRow,
  getActiveRound
} = require("./bangla-wheel.service");

/* =========================================================
   HELPERS
========================================================= */

function getBoolean(value, fallback = false) {
  if (value === true || value === 1 || value === "1") {
    return true;
  }

  if (value === false || value === 0 || value === "0") {
    return false;
  }

  return fallback;
}

function getInteger(
  value,
  minimum,
  maximum,
  fieldName
) {
  const parsed = Number(value);

  assertCondition(
    Number.isInteger(parsed) &&
      parsed >= minimum &&
      parsed <= maximum,
    `${fieldName} must be between ${minimum} and ${maximum}.`,
    400,
    "INVALID_ADMIN_SETTING"
  );

  return parsed;
}

function getDecimal(
  value,
  minimum,
  maximum,
  fieldName
) {
  const parsed = parseMoney(value);

  assertCondition(
    Number.isFinite(parsed) &&
      parsed >= minimum &&
      parsed <= maximum,
    `${fieldName} must be between ${minimum} and ${maximum}.`,
    400,
    "INVALID_ADMIN_SETTING"
  );

  return parsed;
}

function mapPendingConfig(row) {
  if (!row) return null;

  return {
    id: Number(row.id),
    configVersion: Number(row.config_version),
    settings: parseJsonValue(
      row.settings_payload,
      {}
    ),
    animals: parseJsonValue(
      row.animals_payload,
      []
    ),
    status: row.config_status,
    createdBy: row.created_by
      ? Number(row.created_by)
      : null,
    appliedRoundId: row.applied_round_id
      ? Number(row.applied_round_id)
      : null,
    failureReason: row.failure_reason || null,
    createdAt: row.created_at,
    appliedAt: row.applied_at,
    cancelledAt: row.cancelled_at
  };
}

function addAnimalChances(
  animals,
  resultMode
) {
  const equalMode =
    resultMode === RESULT_MODE.FAIR_EQUAL;

  const totalWeight = equalMode
    ? animals.length
    : animals.reduce(
        (total, animal) =>
          total +
          Number(animal.winningWeight || 0),
        0
      );

  return animals.map((animal) => {
    const effectiveWeight = equalMode
      ? 1
      : Number(animal.winningWeight || 0);

    return {
      ...animal,
      effectiveWinningWeight: effectiveWeight,
      winningChancePercent:
        totalWeight > 0
          ? Number(
              (
                effectiveWeight *
                100 /
                totalWeight
              ).toFixed(2)
            )
          : 0
    };
  });
}

/* =========================================================
   ADMIN DASHBOARD
========================================================= */

async function getAdminDashboard() {
  const [
    settingsRows,
    animalRows,
    activeRound,
    pendingRows,
    summaryRows
  ] = await Promise.all([
    pool.query(
      `
        SELECT *
        FROM bangla_wheel_settings
        WHERE id = 1
        LIMIT 1
      `
    ),

    pool.query(
      `
        SELECT *
        FROM bangla_wheel_animals
        ORDER BY segment_index ASC
      `
    ),

    getActiveRound(),

    pool.query(
      `
        SELECT *
        FROM bangla_wheel_pending_configs
        WHERE config_status IN (
          'pending',
          'applying'
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
          ) AS total_net_payout,

          COALESCE(
            SUM(total_players),
            0
          ) AS total_players,

          SUM(
            CASE
              WHEN round_status = 'completed'
              THEN 1
              ELSE 0
            END
          ) AS completed_rounds,

          SUM(
            CASE
              WHEN round_status IN (
                'cancelled',
                'refunded'
              )
              THEN 1
              ELSE 0
            END
          ) AS cancelled_rounds

        FROM bangla_wheel_rounds
      `
    )
  ]);

  const settings =
    mapSettingsRow(
      settingsRows[0][0] || null
    );

  assertCondition(
    settings,
    "Bangla Wheel settings were not found.",
    500,
    "BANGLA_WHEEL_SETTINGS_NOT_FOUND"
  );

  const animals =
    animalRows[0].map(mapAnimalRow);

  const summary =
    summaryRows[0][0] || {};

  return {
    settings,

    animals: addAnimalChances(
      animals,
      settings.resultMode
    ),

    activeRound,

    pendingConfig:
      mapPendingConfig(
        pendingRows[0][0] || null
      ),

    summary: {
      totalRounds:
        Number(summary.total_rounds || 0),

      completedRounds:
        Number(summary.completed_rounds || 0),

      cancelledRounds:
        Number(summary.cancelled_rounds || 0),

      totalPlayers:
        Number(summary.total_players || 0),

      totalBetAmount:
        parseMoney(summary.total_bet_amount),

      totalGrossPayout:
        parseMoney(summary.total_gross_payout),

      totalServiceCharge:
        parseMoney(
          summary.total_service_charge
        ),

      totalNetPayout:
        parseMoney(summary.total_net_payout)
    }
  };
}

/* =========================================================
   VALIDATE AND SCHEDULE CONFIGURATION
========================================================= */

async function scheduleConfiguration(
  adminId,
  payload = {},
  metadata = {}
) {
  const validAdminId =
    parsePositiveInteger(adminId);

  assertCondition(
    validAdminId,
    "Valid admin ID is required.",
    401,
    "INVALID_ADMIN_ID"
  );

  const connection =
    await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [settingsRows] =
      await connection.query(
        `
          SELECT *
          FROM bangla_wheel_settings
          WHERE id = 1
          LIMIT 1
          FOR UPDATE
        `
      );

    const currentSettings =
      mapSettingsRow(
        settingsRows[0] || null
      );

    assertCondition(
      currentSettings,
      "Bangla Wheel settings were not found.",
      500,
      "BANGLA_WHEEL_SETTINGS_NOT_FOUND"
    );

    const [animalRows] =
      await connection.query(
        `
          SELECT *
          FROM bangla_wheel_animals
          WHERE animal_status = 'active'
          ORDER BY segment_index ASC
          FOR UPDATE
        `
      );

    const currentAnimals =
      animalRows.map(mapAnimalRow);

    assertCondition(
      currentAnimals.length === 13,
      "Exactly 13 active animals are required.",
      500,
      "INVALID_ACTIVE_ANIMAL_COUNT"
    );

    const submittedSettings =
      payload.settings &&
      typeof payload.settings === "object"
        ? payload.settings
        : {};

    const resultMode =
      submittedSettings.resultMode ||
      currentSettings.resultMode;

    assertCondition(
      Object.values(RESULT_MODE)
        .includes(resultMode),
      "Invalid Bangla Wheel result mode.",
      400,
      "INVALID_RESULT_MODE"
    );

    const settingsPayload = {
      gameEnabled: getBoolean(
        submittedSettings.gameEnabled,
        currentSettings.gameEnabled
      ),

      minimumBet: getDecimal(
        submittedSettings.minimumBet ??
          currentSettings.minimumBet,
        5,
        100000,
        "Minimum bet"
      ),

      maximumBet: getDecimal(
        submittedSettings.maximumBet ??
          currentSettings.maximumBet,
        5,
        1000000,
        "Maximum bet"
      ),

      bettingDurationSeconds: getInteger(
        submittedSettings
          .bettingDurationSeconds ??
          currentSettings
            .bettingDurationSeconds,
        10,
        300,
        "Betting duration"
      ),

      spinDurationSeconds: getInteger(
        submittedSettings
          .spinDurationSeconds ??
          currentSettings
            .spinDurationSeconds,
        5,
        120,
        "Spin duration"
      ),

      resultDisplaySeconds: getInteger(
        submittedSettings
          .resultDisplaySeconds ??
          currentSettings
            .resultDisplaySeconds,
        2,
        60,
        "Result display duration"
      ),

      nextRoundDelaySeconds: getInteger(
        submittedSettings
          .nextRoundDelaySeconds ??
          currentSettings
            .nextRoundDelaySeconds,
        1,
        120,
        "Next round delay"
      ),

      serviceChargePercent: getDecimal(
        submittedSettings
          .serviceChargePercent ??
          currentSettings
            .serviceChargePercent,
        0,
        50,
        "Service charge"
      ),

      maxRoundLiability: getDecimal(
        submittedSettings
          .maxRoundLiability ??
          currentSettings
            .maxRoundLiability,
        100,
        100000000,
        "Maximum round liability"
      ),

      resultMode
    };

    assertCondition(
      settingsPayload.maximumBet >=
        settingsPayload.minimumBet,
      "Maximum bet cannot be lower than minimum bet.",
      400,
      "INVALID_BET_RANGE"
    );

    const submittedAnimals =
      Array.isArray(payload.animals)
        ? payload.animals
        : [];

    assertCondition(
      submittedAnimals.length === 13,
      "Exactly 13 animal settings are required.",
      400,
      "INVALID_ADMIN_ANIMAL_COUNT"
    );

    const currentById =
      new Map(
        currentAnimals.map(
          (animal) => [
            Number(animal.id),
            animal
          ]
        )
      );

    const usedIds = new Set();

    const animalsPayload =
      submittedAnimals.map(
        (submittedAnimal) => {
          const animalId =
            parsePositiveInteger(
              submittedAnimal.id
            );

          assertCondition(
            animalId &&
              currentById.has(animalId) &&
              !usedIds.has(animalId),
            "Invalid or duplicate animal ID.",
            400,
            "INVALID_ADMIN_ANIMAL_ID"
          );

          usedIds.add(animalId);

          const current =
            currentById.get(animalId);

          const isBettable =
            getBoolean(
              submittedAnimal.isBettable,
              current.isBettable
            );

          const multiplier =
            getDecimal(
              submittedAnimal.multiplier ??
                current.multiplier,
              0,
              100,
              `${current.animalName} multiplier`
            );

          const winningWeight =
            getInteger(
              submittedAnimal.winningWeight ??
                current.winningWeight,
              1,
              1000,
              `${current.animalName} weight`
            );

          if (isBettable) {
            assertCondition(
              multiplier > 0,
              `${current.animalName} requires a multiplier.`,
              400,
              "INVALID_BETTABLE_MULTIPLIER"
            );
          } else {
            assertCondition(
              multiplier === 0,
              `${current.animalName} is NIL and must use 0x.`,
              400,
              "INVALID_NIL_MULTIPLIER"
            );
          }

          return {
            id: animalId,
            animalCode: current.animalCode,
            animalName: current.animalName,
            segmentIndex: current.segmentIndex,
            multiplier,
            isBettable,
            winningWeight
          };
        }
      );

    const totalWeight =
      animalsPayload.reduce(
        (total, animal) =>
          total +
          animal.winningWeight,
        0
      );

    assertCondition(
      totalWeight === 1000,
      "Animal winning weights must total exactly 1000.",
      400,
      "INVALID_WEIGHT_TOTAL"
    );

    const [versionRows] =
      await connection.query(
        `
          SELECT
            GREATEST(
              COALESCE(
                (
                  SELECT odds_version
                  FROM bangla_wheel_settings
                  WHERE id = 1
                ),
                1
              ),

              COALESCE(
                (
                  SELECT MAX(config_version)
                  FROM bangla_wheel_pending_configs
                ),
                1
              )
            ) AS latest_version
        `
      );

    const configVersion =
      Number(
        versionRows[0]
          ?.latest_version ||
        1
      ) + 1;

    await connection.query(
      `
        UPDATE bangla_wheel_pending_configs

        SET
          config_status = 'cancelled',
          cancelled_at =
            CURRENT_TIMESTAMP(3)

        WHERE config_status = 'pending'
      `
    );

    const [insertResult] =
      await connection.query(
        `
          INSERT INTO bangla_wheel_pending_configs (
            config_version,
            settings_payload,
            animals_payload,
            config_status,
            created_by
          )
          VALUES (
            ?,
            ?,
            ?,
            'pending',
            ?
          )
        `,
        [
          configVersion,
          JSON.stringify(settingsPayload),
          JSON.stringify(animalsPayload),
          validAdminId
        ]
      );

    await connection.query(
      `
        INSERT INTO bangla_wheel_admin_logs (
          admin_id,
          action_type,
          old_values,
          new_values,
          ip_address,
          user_agent
        )
        VALUES (
          ?,
          'schedule_configuration',
          ?,
          ?,
          ?,
          ?
        )
      `,
      [
        validAdminId,

        JSON.stringify({
          settings: currentSettings,
          animals: currentAnimals
        }),

        JSON.stringify({
          pendingConfigId:
            Number(insertResult.insertId),
          configVersion,
          settings: settingsPayload,
          animals: animalsPayload,
          totalWeight
        }),

        metadata.ipAddress || null,
        metadata.userAgent || null
      ]
    );

    await connection.commit();

    return {
      id: Number(insertResult.insertId),
      configVersion,
      status: "pending",
      settings: settingsPayload,
      animals: addAnimalChances(
        animalsPayload,
        resultMode
      ),
      totalWeight,
      message:
        "Configuration will apply automatically before the next round."
    };
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
  query = {}
) {
  const page =
    Math.max(
      1,
      Number(query.page) || 1
    );

  const limit =
    Math.min(
      100,
      Math.max(
        10,
        Number(query.limit) || 20
      )
    );

  const offset =
    (page - 1) * limit;

  const allowedStatuses =
    new Set([
      "betting",
      "betting_closed",
      "spinning",
      "settling",
      "completed",
      "cancelled",
      "refunded"
    ]);

  const conditions = [];
  const parameters = [];

  if (
    query.status &&
    allowedStatuses.has(
      String(query.status)
    )
  ) {
    conditions.push(
      "round_status = ?"
    );

    parameters.push(
      String(query.status)
    );
  }

  if (
    query.mode &&
    Object.values(
      RESULT_MODE
    ).includes(
      String(query.mode)
    )
  ) {
    conditions.push(
      "result_mode_snapshot = ?"
    );

    parameters.push(
      String(query.mode)
    );
  }

  if (query.search) {
    conditions.push(
      "round_code LIKE ?"
    );

    parameters.push(
      `%${String(query.search).trim()}%`
    );
  }

  const whereSql =
    conditions.length > 0
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

  const [countRows] =
    await pool.query(
      `
        SELECT
          COUNT(*) AS total

        FROM bangla_wheel_rounds

        ${whereSql}
      `,
      parameters
    );

  const [rows] =
    await pool.query(
      `
        SELECT
          id,
          round_code,
          round_status,
          result_mode_snapshot,
          odds_version_snapshot,
          winning_animal_id,
          winning_animal_code,
          winning_segment_index,
          winning_multiplier,
          total_bet_amount,
          total_potential_liability,
          total_gross_payout,
          total_service_charge,
          total_net_payout,
          total_players,
          total_winning_weight,
          winning_ticket,
          server_seed_hash,
          server_seed,
          round_nonce,
          random_result_index,
          betting_started_at,
          betting_closes_at,
          spinning_started_at,
          spinning_ends_at,
          completed_at,
          cancelled_at,
          cancellation_reason,
          created_at

        FROM bangla_wheel_rounds

        ${whereSql}

        ORDER BY id DESC

        LIMIT ?
        OFFSET ?
      `,
      [
        ...parameters,
        limit,
        offset
      ]
    );

  const total =
    Number(
      countRows[0]?.total || 0
    );

  return {
    rounds:
      rows.map((round) => ({
        id:
          Number(round.id),

        roundCode:
          round.round_code,

        status:
          round.round_status,

        resultMode:
          round.result_mode_snapshot ||
          RESULT_MODE.FAIR_EQUAL,

        oddsVersion:
          Number(
            round.odds_version_snapshot ||
            1
          ),

        winningAnimalId:
          round.winning_animal_id
            ? Number(
                round.winning_animal_id
              )
            : null,

        winningAnimalCode:
          round.winning_animal_code ||
          null,

        winningSegmentIndex:
          round.winning_segment_index !==
          null
            ? Number(
                round.winning_segment_index
              )
            : null,

        winningMultiplier:
          round.winning_multiplier !==
          null
            ? parseMoney(
                round.winning_multiplier
              )
            : null,

        totalBetAmount:
          parseMoney(
            round.total_bet_amount
          ),

        totalPotentialLiability:
          parseMoney(
            round.total_potential_liability
          ),

        totalGrossPayout:
          parseMoney(
            round.total_gross_payout
          ),

        totalServiceCharge:
          parseMoney(
            round.total_service_charge
          ),

        totalNetPayout:
          parseMoney(
            round.total_net_payout
          ),

        totalPlayers:
          Number(
            round.total_players || 0
          ),

        totalWinningWeight:
          Number(
            round.total_winning_weight ||
            0
          ),

        winningTicket:
          round.winning_ticket !== null
            ? Number(
                round.winning_ticket
              )
            : null,

        fairness: {
          serverSeedHash:
            round.server_seed_hash ||
            null,

          serverSeed:
            round.server_seed ||
            null,

          roundNonce:
            round.round_nonce ||
            null,

          randomResultIndex:
            round.random_result_index !==
            null
              ? Number(
                  round.random_result_index
                )
              : null
        },

        bettingStartedAt:
          round.betting_started_at,

        bettingClosesAt:
          round.betting_closes_at,

        spinningStartedAt:
          round.spinning_started_at,

        spinningEndsAt:
          round.spinning_ends_at,

        completedAt:
          round.completed_at,

        cancelledAt:
          round.cancelled_at,

        cancellationReason:
          round.cancellation_reason ||
          null,

        createdAt:
          round.created_at
      })),

    pagination: {
      page,
      limit,
      total,
      totalPages:
        Math.max(
          1,
          Math.ceil(total / limit)
        )
    }
  };
}

/* =========================================================
   ROUND BET DETAILS
========================================================= */

async function getAdminRoundBets(
  roundId
) {
  const validRoundId =
    parsePositiveInteger(roundId);

  assertCondition(
    validRoundId,
    "Valid round ID is required.",
    400,
    "INVALID_ROUND_ID"
  );

  const [roundRows] =
    await pool.query(
      `
        SELECT
          id,
          round_code,
          round_status,
          result_mode_snapshot,
          winning_animal_code,
          winning_multiplier,
          total_bet_amount,
          total_gross_payout,
          total_service_charge,
          total_net_payout,
          total_players,
          created_at,
          completed_at

        FROM bangla_wheel_rounds

        WHERE id = ?

        LIMIT 1
      `,
      [validRoundId]
    );

  const round =
    roundRows[0] ||
    null;

  assertCondition(
    round,
    "Bangla Wheel round was not found.",
    404,
    "ROUND_NOT_FOUND"
  );

  const [rows] =
    await pool.query(
      `
        SELECT
          bwb.*,
          u.uid,
          u.full_name,
          u.username,
          u.phone

        FROM bangla_wheel_bets bwb

        INNER JOIN users u
          ON u.id = bwb.user_id

        WHERE bwb.round_id = ?

        ORDER BY bwb.id DESC
      `,
      [validRoundId]
    );

  return {
    round: {
      id:
        Number(round.id),

      roundCode:
        round.round_code,

      status:
        round.round_status,

      resultMode:
        round.result_mode_snapshot ||
        RESULT_MODE.FAIR_EQUAL,

      winningAnimalCode:
        round.winning_animal_code ||
        null,

      winningMultiplier:
        round.winning_multiplier !==
        null
          ? parseMoney(
              round.winning_multiplier
            )
          : null,

      totalBetAmount:
        parseMoney(
          round.total_bet_amount
        ),

      totalGrossPayout:
        parseMoney(
          round.total_gross_payout
        ),

      totalServiceCharge:
        parseMoney(
          round.total_service_charge
        ),

      totalNetPayout:
        parseMoney(
          round.total_net_payout
        ),

      totalPlayers:
        Number(
          round.total_players || 0
        ),

      createdAt:
        round.created_at,

      completedAt:
        round.completed_at
    },

    bets:
      rows.map((bet) => ({
        id:
          Number(bet.id),

        betCode:
          bet.bet_code,

        userId:
          Number(bet.user_id),

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
            bet.phone || null
        },

        selectedAnimalId:
          Number(
            bet.selected_animal_id
          ),

        selectedAnimalCode:
          bet.selected_animal_code,

        selectedAnimalName:
          bet.selected_animal_name,

        lockedMultiplier:
          parseMoney(
            bet.locked_multiplier
          ),

        betAmount:
          parseMoney(
            bet.bet_amount
          ),

        potentialGrossPayout:
          parseMoney(
            bet.potential_gross_payout
          ),

        potentialServiceCharge:
          parseMoney(
            bet.potential_service_charge
          ),

        potentialNetPayout:
          parseMoney(
            bet.potential_net_payout
          ),

        status:
          bet.bet_status,

        grossPayout:
          parseMoney(
            bet.gross_payout
          ),

        serviceCharge:
          parseMoney(
            bet.service_charge
          ),

        netPayout:
          parseMoney(
            bet.net_payout
          ),

        balanceBefore:
          parseMoney(
            bet.balance_before
          ),

        balanceAfterBet:
          parseMoney(
            bet.balance_after_bet
          ),

        balanceAfterSettlement:
          bet.balance_after_settlement !==
          null
            ? parseMoney(
                bet.balance_after_settlement
              )
            : null,

        placedAt:
          bet.placed_at,

        settledAt:
          bet.settled_at,

        refundedAt:
          bet.refunded_at
      }))
  };
}

/* =========================================================
   ADMIN AUDIT LOGS
========================================================= */

async function getAdminAuditLogs(
  query = {}
) {
  const limit =
    Math.min(
      100,
      Math.max(
        10,
        Number(query.limit) || 30
      )
    );

  const [rows] =
    await pool.query(
      `
        SELECT
          bwal.id,
          bwal.admin_id,
          bwal.action_type,
          bwal.old_values,
          bwal.new_values,
          bwal.ip_address,
          bwal.user_agent,
          bwal.created_at,
          u.uid,
          u.full_name,
          u.username

        FROM bangla_wheel_admin_logs bwal

        LEFT JOIN users u
          ON u.id = bwal.admin_id

        ORDER BY bwal.id DESC

        LIMIT ?
      `,
      [limit]
    );

  return {
    logs:
      rows.map((log) => ({
        id:
          Number(log.id),

        adminId:
          log.admin_id
            ? Number(log.admin_id)
            : null,

        admin: {
          uid:
            log.uid || null,

          fullName:
            log.full_name ||
            null,

          username:
            log.username ||
            null
        },

        actionType:
          log.action_type,

        oldValues:
          parseJsonValue(
            log.old_values,
            null
          ),

        newValues:
          parseJsonValue(
            log.new_values,
            null
          ),

        ipAddress:
          log.ip_address ||
          null,

        userAgent:
          log.user_agent ||
          null,

        createdAt:
          log.created_at
      }))
  };
}

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  getAdminDashboard,
  scheduleConfiguration,
  getAdminRounds,
  getAdminRoundBets,
  getAdminAuditLogs
};