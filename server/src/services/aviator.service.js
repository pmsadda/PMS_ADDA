"use strict";

const crypto = require("crypto");

const { pool } = require("../config/database");

/* ==========================
   Round Status
========================== */

const ROUND_STATUS = {
  BETTING: "betting",
  FLYING: "flying",
  CRASHED: "crashed",
  CANCELLED: "cancelled",
};

/* ==========================
   Game Error
========================== */

function createGameError(message, statusCode = 400, code = "AVIATOR_ERROR") {
  const error = new Error(message);

  error.statusCode = statusCode;

  error.code = code;

  return error;
}

/* ==========================
   Random Number From Hash
========================== */

function hashToRandom(hexPart) {
  return parseInt(hexPart, 16) / 0x10000000000000;
}

/* ==========================
   Crash Range
========================== */

function pickCrashRange(volatilityProfile, roll) {
  const profiles = {
    low: [
      {
        limit: 0.08,
        min: 1.01,
        max: 1.19,
      },
      {
        limit: 0.4,
        min: 1.2,
        max: 1.99,
      },
      {
        limit: 0.75,
        min: 2.0,
        max: 4.99,
      },
      {
        limit: 0.93,
        min: 5.0,
        max: 9.99,
      },
      {
        limit: 0.99,
        min: 10.0,
        max: 24.99,
      },
      {
        limit: 0.999,
        min: 25.0,
        max: 99.99,
      },
      {
        limit: 1.0,
        min: 100.0,
        max: 1000.0,
      },
    ],

    medium: [
      {
        limit: 0.18,
        min: 1.01,
        max: 1.19,
      },
      {
        limit: 0.52,
        min: 1.2,
        max: 1.99,
      },
      {
        limit: 0.78,
        min: 2.0,
        max: 4.99,
      },
      {
        limit: 0.91,
        min: 5.0,
        max: 9.99,
      },
      {
        limit: 0.975,
        min: 10.0,
        max: 24.99,
      },
      {
        limit: 0.997,
        min: 25.0,
        max: 99.99,
      },
      {
        limit: 1.0,
        min: 100.0,
        max: 1000.0,
      },
    ],

    high: [
      {
        limit: 0.3,
        min: 1.01,
        max: 1.19,
      },
      {
        limit: 0.65,
        min: 1.2,
        max: 1.99,
      },
      {
        limit: 0.83,
        min: 2.0,
        max: 4.99,
      },
      {
        limit: 0.92,
        min: 5.0,
        max: 9.99,
      },
      {
        limit: 0.975,
        min: 10.0,
        max: 24.99,
      },
      {
        limit: 0.995,
        min: 25.0,
        max: 99.99,
      },
      {
        limit: 1.0,
        min: 100.0,
        max: 1000.0,
      },
    ],
  };

  const profile = profiles[volatilityProfile] || profiles.medium;

  return (
    profile.find((range) => roll < range.limit) || profile[profile.length - 1]
  );
}

/* ==========================
   Generate Crash Multiplier
========================== */

function generateAviatorCrash({
  roundCode,
  volatilityProfile = "medium",
  maxMultiplier = 1000,
}) {
  const cleanRoundCode = String(roundCode || "").trim();

  if (!cleanRoundCode) {
    throw createGameError(
      "Aviator round code is required.",
      500,
      "AVIATOR_ROUND_CODE_REQUIRED",
    );
  }

  const validProfiles = ["low", "medium", "high"];

  const profile = validProfiles.includes(volatilityProfile)
    ? volatilityProfile
    : "medium";

  const maximum = Math.max(1.01, Number(maxMultiplier) || 1000);

  /*
   * Secret seed round
   * শুরুর আগেই generate হবে।
   */
  const serverSeed = crypto.randomBytes(32).toString("hex");

  /*
   * Player শুরুতে শুধু
   * hash দেখতে পাবে।
   */
  const serverSeedHash = crypto
    .createHash("sha256")
    .update(serverSeed)
    .digest("hex");

  /*
   * Seed + round code থেকে
   * deterministic result।
   */
  const resultHash = crypto
    .createHash("sha256")
    .update(`${serverSeed}:${cleanRoundCode}`)
    .digest("hex");

  const rangeRoll = hashToRandom(resultHash.slice(0, 13));

  const multiplierRoll = hashToRandom(resultHash.slice(13, 26));

  const range = pickCrashRange(profile, rangeRoll);

  const upperLimit = Math.min(Number(range.max), maximum);

  const lowerLimit = Math.min(Number(range.min), upperLimit);

  let crashMultiplier = lowerLimit + multiplierRoll * (upperLimit - lowerLimit);

  crashMultiplier = Math.max(1.01, crashMultiplier);

  crashMultiplier = Math.min(crashMultiplier, maximum);

  crashMultiplier = Number(crashMultiplier.toFixed(2));

  return {
    crashMultiplier,
    serverSeed,
    serverSeedHash,
    volatilityProfile: profile,
  };
}

/* ==========================
   Create Round Code
========================== */

function createRoundCode() {
  const timestamp = Date.now().toString(36).toUpperCase();

  const randomPart = crypto.randomBytes(5).toString("hex").toUpperCase();

  return `AVI${timestamp}${randomPart}`;
}

/* ==========================
   Get Settings
========================== */

async function getGameSettings(executor = pool) {
  const [rows] = await executor.execute(
    `
        SELECT
          id,
          is_enabled,
          maintenance_mode,
          min_bet,
          max_bet,
          max_payout,
          betting_seconds,
          round_gap_seconds,
          max_multiplier,
          house_edge_percent,
          volatility_profile
        FROM aviator_settings
        WHERE id = 1
        LIMIT 1
      `,
  );

  const row = rows[0] || null;

  if (!row) {
    throw createGameError(
      "Aviator settings not found.",
      500,
      "AVIATOR_SETTINGS_NOT_FOUND",
    );
  }

  return {
    id: Number(row.id),

    isEnabled: Boolean(row.is_enabled),

    maintenanceMode: Boolean(row.maintenance_mode),

    minBet: Number(row.min_bet),

    maxBet: Number(row.max_bet),

    maxPayout: Number(row.max_payout),

    bettingSeconds: Math.max(3, Number(row.betting_seconds) || 8),

    roundGapSeconds: Math.max(1, Number(row.round_gap_seconds) || 3),

    maxMultiplier: Math.max(1.01, Number(row.max_multiplier) || 1000),

    houseEdgePercent: Number(row.house_edge_percent) || 0,

    volatilityProfile: ["low", "medium", "high"].includes(
      String(row.volatility_profile),
    )
      ? String(row.volatility_profile)
      : "medium",
  };
}

/* ==========================
   Round Select SQL
========================== */

const ROUND_SELECT_SQL = `
  SELECT
    id,
    round_code,
    status,
    crash_multiplier,
    server_seed_hash,
    server_seed,

    betting_started_at,
    betting_ends_at,
    flight_started_at,
    crashed_at,

    ROUND(
      UNIX_TIMESTAMP(
        betting_started_at
      ) * 1000
    ) AS betting_started_at_ms,

    ROUND(
      UNIX_TIMESTAMP(
        betting_ends_at
      ) * 1000
    ) AS betting_ends_at_ms,

    ROUND(
      UNIX_TIMESTAMP(
        flight_started_at
      ) * 1000
    ) AS flight_started_at_ms,

    ROUND(
      UNIX_TIMESTAMP(
        crashed_at
      ) * 1000
    ) AS crashed_at_ms,

    total_bet_amount,
    total_payout_amount,
    created_at
  FROM aviator_rounds
`;

/* ==========================
   Map Round
========================== */

function mapRoundRow(row, { revealResult = false } = {}) {
  if (!row) {
    return null;
  }

  const status = String(row.status);

  const canReveal = revealResult || status === ROUND_STATUS.CRASHED;

  return {
    id: Number(row.id),

    roundCode: row.round_code,

    status,

    /*
     * betting/flying অবস্থায়
     * crash point hide থাকবে।
     */
    crashMultiplier: canReveal ? Number(row.crash_multiplier) : null,

    serverSeedHash: row.server_seed_hash,

    serverSeed: canReveal ? row.server_seed : null,

    bettingStartedAt: row.betting_started_at,

    bettingEndsAt: row.betting_ends_at,

    flightStartedAt: row.flight_started_at,

    crashedAt: row.crashed_at,

    bettingStartedAtMs: row.betting_started_at_ms
      ? Number(row.betting_started_at_ms)
      : null,

    bettingEndsAtMs: row.betting_ends_at_ms
      ? Number(row.betting_ends_at_ms)
      : null,

    flightStartedAtMs: row.flight_started_at_ms
      ? Number(row.flight_started_at_ms)
      : null,

    crashedAtMs: row.crashed_at_ms ? Number(row.crashed_at_ms) : null,

    totalBetAmount: Number(row.total_bet_amount || 0),

    totalPayoutAmount: Number(row.total_payout_amount || 0),
  };
}

/* ==========================
   Get Round By ID
========================== */

async function getRoundById(roundId, executor = pool) {
  const validRoundId = Number(roundId);

  if (!Number.isInteger(validRoundId) || validRoundId <= 0) {
    return null;
  }

  const [rows] = await executor.execute(
    `
        ${ROUND_SELECT_SQL}
        WHERE id = ?
        LIMIT 1
      `,
    [validRoundId],
  );

  return rows[0] || null;
}

/* ==========================
   Get Active Round
========================== */

async function getActiveRound(executor = pool) {
  const [rows] = await executor.execute(
    `
        ${ROUND_SELECT_SQL}
        WHERE status IN (
          'betting',
          'flying'
        )
        ORDER BY id DESC
        LIMIT 1
      `,
  );

  return rows[0] || null;
}

/* ==========================
   Create New Round
========================== */

async function createRound() {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const settings = await getGameSettings(connection);

    if (!settings.isEnabled) {
      throw createGameError("Aviator is disabled.", 409, "AVIATOR_DISABLED");
    }

    if (settings.maintenanceMode) {
      throw createGameError(
        "Aviator is under maintenance.",
        409,
        "AVIATOR_MAINTENANCE",
      );
    }

    /*
     * Existing active round থাকলে
     * নতুন round বানানো হবে না।
     */
    const [activeRows] = await connection.execute(
      `
            SELECT id
            FROM aviator_rounds
            WHERE status IN (
              'betting',
              'flying'
            )
            ORDER BY id DESC
            LIMIT 1
            FOR UPDATE
          `,
    );

    if (activeRows.length > 0) {
      await connection.commit();

      return await getRoundById(activeRows[0].id);
    }

    const roundCode = createRoundCode();

    /*
     * IMPORTANT:
     * Betting open হওয়ার আগেই
     * crash point generate + DB-তে
     * lock হয়ে যাচ্ছে।
     */
    const fairResult = generateAviatorCrash({
      roundCode,

      volatilityProfile: settings.volatilityProfile,

      maxMultiplier: settings.maxMultiplier,
    });

    const [result] = await connection.execute(
      `
            INSERT INTO aviator_rounds (
              round_code,
              status,
              crash_multiplier,
              server_seed_hash,
              server_seed,
              betting_started_at,
              betting_ends_at,
              total_bet_amount,
              total_payout_amount
            )
            VALUES (
              ?,
              'betting',
              ?,
              ?,
              ?,
              CURRENT_TIMESTAMP,
              DATE_ADD(
                CURRENT_TIMESTAMP,
                INTERVAL ? SECOND
              ),
              0.00,
              0.00
            )
          `,
      [
        roundCode,

        fairResult.crashMultiplier,

        fairResult.serverSeedHash,

        fairResult.serverSeed,

        settings.bettingSeconds,
      ],
    );

    await connection.commit();

    return await getRoundById(result.insertId);
  } catch (error) {
    await connection.rollback();

    throw error;
  } finally {
    connection.release();
  }
}

/* ==========================
   Start Flight
========================== */

async function startFlight(roundId) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute(
      `
            SELECT
              id,
              status
            FROM aviator_rounds
            WHERE id = ?
            LIMIT 1
            FOR UPDATE
          `,
      [Number(roundId)],
    );

    const round = rows[0] || null;

    if (!round) {
      throw createGameError(
        "Aviator round not found.",
        404,
        "AVIATOR_ROUND_NOT_FOUND",
      );
    }

    if (round.status === ROUND_STATUS.FLYING) {
      await connection.commit();

      return await getRoundById(round.id);
    }

    if (round.status !== ROUND_STATUS.BETTING) {
      throw createGameError(
        "Aviator round cannot start flying.",
        409,
        "AVIATOR_INVALID_ROUND_STATE",
      );
    }

    await connection.execute(
      `
        UPDATE aviator_rounds
        SET
          status = 'flying',
          flight_started_at =
            CURRENT_TIMESTAMP
        WHERE id = ?
          AND status = 'betting'
      `,
      [Number(roundId)],
    );

    await connection.commit();

    return await getRoundById(round.id);
  } catch (error) {
    await connection.rollback();

    throw error;
  } finally {
    connection.release();
  }
}

/* ==========================
   Crash Round
========================== */

async function crashRound(roundId) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute(
      `
            SELECT
              id,
              status
            FROM aviator_rounds
            WHERE id = ?
            LIMIT 1
            FOR UPDATE
          `,
      [Number(roundId)],
    );

    const round = rows[0] || null;

    if (!round) {
      throw createGameError(
        "Aviator round not found.",
        404,
        "AVIATOR_ROUND_NOT_FOUND",
      );
    }

    /*
     * Retry-safe / idempotent
     */
    if (round.status === ROUND_STATUS.CRASHED) {
      await connection.commit();

      return await getRoundById(round.id);
    }

    if (round.status !== ROUND_STATUS.FLYING) {
      throw createGameError(
        "Aviator round is not flying.",
        409,
        "AVIATOR_NOT_FLYING",
      );
    }

    await connection.execute(
      `
        UPDATE aviator_rounds
        SET
          status = 'crashed',
          crashed_at =
            CURRENT_TIMESTAMP
        WHERE id = ?
          AND status = 'flying'
      `,
      [Number(roundId)],
    );

    await connection.commit();

    return await getRoundById(round.id);
  } catch (error) {
    await connection.rollback();

    throw error;
  } finally {
    connection.release();
  }
}

/* ==========================
   Public Game State
========================== */

async function getPublicGameState() {
  const [settings, activeRound] = await Promise.all([
    getGameSettings(),
    getActiveRound(),
  ]);

  return {
    serverTime: new Date().toISOString(),

    settings: {
      isEnabled: settings.isEnabled,

      maintenanceMode: settings.maintenanceMode,

      minBet: settings.minBet,

      maxBet: settings.maxBet,

      maxPayout: settings.maxPayout,

      bettingSeconds: settings.bettingSeconds,

      roundGapSeconds: settings.roundGapSeconds,

      maxMultiplier: settings.maxMultiplier,

      volatilityProfile: settings.volatilityProfile,
    },

    round: activeRound
      ? mapRoundRow(activeRound, {
          revealResult: false,
        })
      : null,
  };
}

/* ==========================
   Exports
========================== */

module.exports = {
  ROUND_STATUS,

  createGameError,

  generateAviatorCrash,

  getGameSettings,

  mapRoundRow,

  getRoundById,

  getActiveRound,

  createRound,

  startFlight,

  crashRound,

  getPublicGameState,
};
