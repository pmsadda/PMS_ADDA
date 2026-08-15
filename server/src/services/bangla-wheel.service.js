"use strict";

const crypto =
  require("crypto");

const {
  pool,
} = require("../config/database");

/* =========================================================
   CONSTANTS
========================================================= */

const ROUND_STATUS =
  Object.freeze({
    BETTING: "betting",

    BETTING_CLOSED:
      "betting_closed",

    SPINNING: "spinning",

    SETTLING: "settling",

    COMPLETED: "completed",

    CANCELLED: "cancelled",

    REFUNDED: "refunded",
  });

const ACTIVE_ROUND_STATUSES = [
  ROUND_STATUS.BETTING,
  ROUND_STATUS.BETTING_CLOSED,
  ROUND_STATUS.SPINNING,
  ROUND_STATUS.SETTLING
];

/* =========================================================
   ERROR HELPERS
========================================================= */

function createGameError(
  message,
  statusCode = 500,
  code = "BANGLA_WHEEL_ERROR"
) {
  const error =
    new Error(message);

  error.statusCode =
    statusCode;

  error.code =
    code;

  return error;
}

function assertCondition(
  condition,
  message,
  statusCode = 400,
  code =
    "INVALID_BANGLA_WHEEL_REQUEST"
) {
  if (!condition) {
    throw createGameError(
      message,
      statusCode,
      code
    );
  }
}

/* =========================================================
   VALUE HELPERS
========================================================= */

function parseMoney(value) {
  const amount =
    Number(value);

  if (
    !Number.isFinite(amount)
  ) {
    return 0;
  }

  return Number(
    amount.toFixed(2)
  );
}

function parsePositiveInteger(
  value
) {
  const parsed =
    Number(value);

  if (
    !Number.isInteger(parsed) ||
    parsed < 1
  ) {
    return null;
  }

  return parsed;
}

function createReferenceCode(
  prefix
) {
  const timestamp =
    Date.now();

  const randomPart =
    crypto
      .randomBytes(6)
      .toString("hex")
      .toUpperCase();

  return (
    `${prefix}_` +
    `${timestamp}_` +
    `${randomPart}`
  );
}

/* =========================================================
   ROW MAPPERS
========================================================= */

function mapSettingsRow(row) {
  if (!row) {
    return null;
  }

  return {
    gameEnabled:
      Number(
        row.game_enabled
      ) === 1,

    minimumBet:
      parseMoney(
        row.minimum_bet
      ),

    maximumBet:
      parseMoney(
        row.maximum_bet
      ),

    bettingDurationSeconds:
      Number(
        row
          .betting_duration_seconds
      ),

    spinDurationSeconds:
      Number(
        row
          .spin_duration_seconds
      ),

    resultDisplaySeconds:
      Number(
        row
          .result_display_seconds
      ),

    nextRoundDelaySeconds:
      Number(
        row
          .next_round_delay_seconds
      ),

    serviceChargePercent:
      parseMoney(
        row
          .service_charge_percent
      ),

    maxRoundLiability:
      parseMoney(
        row
          .max_round_liability
      ),

    updatedAt:
      row.updated_at ||
      null
  };
}

function mapAnimalRow(row) {
  if (!row) {
    return null;
  }

  return {
    id:
      Number(row.id),

    animalCode:
      row.animal_code,

    animalName:
      row.animal_name,

    multiplier:
      parseMoney(
        row.multiplier
      ),

      isBettable:
  Number(
    row.is_bettable
  ) === 1,

    segmentIndex:
      Number(
        row.segment_index
      ),

    imagePath:
      row.image_path ||
      null,

    animalStatus:
      row.animal_status
  };
}

function mapRoundRow(
  row,
  options = {}
) {
  if (!row) {
    return null;
  }

  const resultVisible =
    options.revealResult ===
      true ||
    [
      ROUND_STATUS.COMPLETED,
      ROUND_STATUS.CANCELLED,
      ROUND_STATUS.REFUNDED
    ].includes(
      row.round_status
    );

  return {
    id:
      Number(row.id),

    roundCode:
      row.round_code,

    roundStatus:
      row.round_status,

    winningAnimalId:
      resultVisible &&
      row.winning_animal_id
        ? Number(
            row
              .winning_animal_id
          )
        : null,

    winningAnimalCode:
      resultVisible
        ? row
            .winning_animal_code ||
          null
        : null,

    winningSegmentIndex:
      resultVisible &&
      row
        .winning_segment_index !==
        null
        ? Number(
            row
              .winning_segment_index
          )
        : null,

    winningMultiplier:
      resultVisible &&
      row.winning_multiplier !==
        null
        ? parseMoney(
            row
              .winning_multiplier
          )
        : null,

    totalBetAmount:
      parseMoney(
        row.total_bet_amount
      ),

    totalPotentialLiability:
      parseMoney(
        row
          .total_potential_liability
      ),

    totalGrossPayout:
      parseMoney(
        row
          .total_gross_payout
      ),

    totalServiceCharge:
      parseMoney(
        row
          .total_service_charge
      ),

    totalNetPayout:
      parseMoney(
        row
          .total_net_payout
      ),

    totalPlayers:
      Number(
        row.total_players ||
        0
      ),

    serverSeedHash:
      row.server_seed_hash ||
      null,

    serverSeed:
      resultVisible
        ? row.server_seed ||
          null
        : null,

    roundNonce:
      resultVisible
        ? row.round_nonce ||
          null
        : null,

    randomResultIndex:
      resultVisible &&
      row.random_result_index !==
        null
        ? Number(
            row
              .random_result_index
          )
        : null,

    bettingStartedAt:
      row
        .betting_started_at ||
      null,

    bettingClosesAt:
      row.betting_closes_at ||
      null,

    spinningStartedAt:
      row
        .spinning_started_at ||
      null,

    spinningEndsAt:
      row.spinning_ends_at ||
      null,

    completedAt:
      row.completed_at ||
      null,

    cancellationReason:
      row
        .cancellation_reason ||
      null,

    createdAt:
      row.created_at ||
      null,

    updatedAt:
      row.updated_at ||
      null
  };
}

/* =========================================================
   SETTINGS
========================================================= */

async function getGameSettings(
  connection = pool,
  options = {}
) {
  const lockSuffix =
    options.lock === true
      ? "FOR UPDATE"
      : "";

  const [rows] =
    await connection.query(
      `
        SELECT
          *

        FROM bangla_wheel_settings

        WHERE id = 1

        LIMIT 1

        ${lockSuffix}
      `
    );

  const settings =
    mapSettingsRow(
      rows[0] ||
      null
    );

  assertCondition(
    settings,
    "Bangla Wheel settings were not found.",
    500,
    "GAME_SETTINGS_NOT_FOUND"
  );

  return settings;
}

/* =========================================================
   ANIMALS
========================================================= */

async function getActiveAnimals(
  connection = pool,
  options = {}
) {
  const lockSuffix =
    options.lock === true
      ? "FOR UPDATE"
      : "";

  const [rows] =
    await connection.query(
      `
        SELECT
          *

        FROM bangla_wheel_animals

        WHERE animal_status =
          'active'

        ORDER BY
          segment_index ASC

        ${lockSuffix}
      `
    );

  const animals =
    rows.map(
      mapAnimalRow
    );

  assertCondition(
    animals.length === 13,
"Bangla Wheel requires exactly 13 active animals.",
    500,
    "INVALID_ACTIVE_ANIMAL_COUNT"
  );

  const segmentIndexes =
    animals.map(
      (animal) =>
        animal.segmentIndex
    );

  const uniqueIndexes =
    new Set(
      segmentIndexes
    );

  assertCondition(
    uniqueIndexes.size === 13,
    "Bangla Wheel segment indexes must be unique.",
    500,
    "DUPLICATE_SEGMENT_INDEX"
  );

  return animals;
}

async function getAnimalById(
  animalId,
  connection = pool,
  options = {}
) {
  const validAnimalId =
    parsePositiveInteger(
      animalId
    );

  assertCondition(
    validAnimalId,
    "Valid animal ID is required.",
    400,
    "INVALID_ANIMAL_ID"
  );

  const lockSuffix =
    options.lock === true
      ? "FOR UPDATE"
      : "";

  const [rows] =
    await connection.query(
      `
        SELECT
          *

        FROM bangla_wheel_animals

        WHERE id = ?

        LIMIT 1

        ${lockSuffix}
      `,
      [validAnimalId]
    );

  return mapAnimalRow(
    rows[0] ||
    null
  );
}

/* =========================================================
   FAIR RANDOM RESULT
========================================================= */

function createDeterministicNumber(
  serverSeed,
  roundNonce,
  counter
) {
  const hash =
    crypto
      .createHmac(
        "sha256",
        serverSeed
      )
      .update(
        `${roundNonce}:${counter}`
      )
      .digest();

  return hash.readUInt32BE(0);
}

/*
 * Rejection sampling ব্যবহারের ফলে modulo bias থাকবে না।
 * ১০টি animal-এর প্রত্যেকটির chance সমান হবে।
 */
function createFairRandomIndex(
  serverSeed,
  roundNonce,
  totalSegments
) {
  assertCondition(
    Number.isInteger(
      totalSegments
    ) &&
      totalSegments > 1,
    "Valid wheel segment count is required.",
    500,
    "INVALID_SEGMENT_COUNT"
  );

  const maximumUint32 =
    0x100000000;

  const acceptedLimit =
    Math.floor(
      maximumUint32 /
        totalSegments
    ) *
    totalSegments;

  for (
    let counter = 0;
    counter < 1000;
    counter += 1
  ) {
    const randomNumber =
      createDeterministicNumber(
        serverSeed,
        roundNonce,
        counter
      );

    if (
      randomNumber <
      acceptedLimit
    ) {
      return (
        randomNumber %
        totalSegments
      );
    }
  }

  throw createGameError(
    "Fair Bangla Wheel result could not be generated.",
    500,
    "FAIR_RESULT_FAILED"
  );
}

function prepareWheelResult(
  animals,
  serverSeed,
  roundNonce
) {
  assertCondition(
    Array.isArray(animals) &&
      animals.length === 13,
"Exactly 13 animals are required.",
    500,
    "INVALID_ANIMAL_LIST"
  );

  const randomIndex =
    createFairRandomIndex(
      serverSeed,
      roundNonce,
      animals.length
    );

  const winningAnimal =
    animals[randomIndex];

  assertCondition(
    winningAnimal,
    "Winning animal could not be selected.",
    500,
    "WINNING_ANIMAL_MISSING"
  );

  return {
    randomIndex,
    winningAnimal
  };
}

/* =========================================================
   ROUND QUERIES
========================================================= */

async function getRoundById(
  roundId,
  connection = pool,
  options = {}
) {
  const validRoundId =
    parsePositiveInteger(
      roundId
    );

  assertCondition(
    validRoundId,
    "Valid Bangla Wheel round ID is required.",
    400,
    "INVALID_ROUND_ID"
  );

  const lockSuffix =
    options.lock === true
      ? "FOR UPDATE"
      : "";

  const [rows] =
    await connection.query(
      `
        SELECT
          *

        FROM bangla_wheel_rounds

        WHERE id = ?

        LIMIT 1

        ${lockSuffix}
      `,
      [validRoundId]
    );

  return rows[0] ||
    null;
}

async function getActiveRound(
  connection = pool,
  options = {}
) {
  const lockSuffix =
    options.lock === true
      ? "FOR UPDATE"
      : "";

  const [rows] =
    await connection.query(
      `
        SELECT
          *

        FROM bangla_wheel_rounds

        WHERE round_status IN (
          'betting',
          'betting_closed',
          'spinning',
          'settling'
        )

        ORDER BY id DESC

        LIMIT 1

        ${lockSuffix}
      `
    );

  return mapRoundRow(
    rows[0] ||
    null,
    {
      revealResult:
        options.revealResult ===
        true
    }
  );
}

/* =========================================================
   CREATE ROUND
========================================================= */

async function createRound() {
  const connection =
    await pool.getConnection();

  try {
    await connection
      .beginTransaction();

    const settings =
      await getGameSettings(
        connection,
        {
          lock: true
        }
      );

    assertCondition(
      settings.gameEnabled,
      "Bangla Wheel is currently disabled.",
      403,
      "GAME_DISABLED"
    );

    await getActiveAnimals(
      connection,
      {
        lock: true
      }
    );

    const activeRound =
      await getActiveRound(
        connection,
        {
          lock: true
        }
      );

    if (activeRound) {
      await connection.commit();

      return {
        created: false,
        round: activeRound,
        settings
      };
    }

    const roundCode =
      createReferenceCode(
        "BWR"
      );

    const serverSeed =
      crypto
        .randomBytes(32)
        .toString("hex");

    const serverSeedHash =
      crypto
        .createHash(
          "sha256"
        )
        .update(serverSeed)
        .digest("hex");

    const roundNonce =
      createReferenceCode(
        "BW_NONCE"
      );

    const bettingDuration =
      Math.max(
        10,
        Number(
          settings
            .bettingDurationSeconds
        ) || 15
      );

    const [insertResult] =
      await connection.query(
        `
          INSERT INTO bangla_wheel_rounds (
            round_code,
            round_status,
            server_seed_hash,
            server_seed,
            round_nonce,
            betting_started_at,
            betting_closes_at
          )
          VALUES (
            ?,
            'betting',
            ?,
            ?,
            ?,
            CURRENT_TIMESTAMP(3),
            DATE_ADD(
              CURRENT_TIMESTAMP(3),
              INTERVAL ? SECOND
            )
          )
        `,
        [
          roundCode,
          serverSeedHash,
          serverSeed,
          roundNonce,
          bettingDuration
        ]
      );

    const createdRound =
      await getRoundById(
        insertResult.insertId,
        connection,
        {
          lock: true
        }
      );

    await connection.commit();

    return {
      created: true,

      round:
        mapRoundRow(
          createdRound
        ),

      settings
    };
  } catch (error) {
    await connection.rollback();

    throw error;
  } finally {
    connection.release();
  }
}

/* =========================================================
   PUBLIC STATE
========================================================= */

async function getPublicGameState() {
  const [
    settings,
    animals,
    activeRound
  ] = await Promise.all([
    getGameSettings(),
    getActiveAnimals(),
    getActiveRound()
  ]);

  return {
    settings,
    animals,
    activeRound,

    serverTime:
      new Date()
        .toISOString()
  };
}

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  ROUND_STATUS,
  ACTIVE_ROUND_STATUSES,

  createGameError,
  assertCondition,
  parseMoney,
  parsePositiveInteger,
  createReferenceCode,

  mapSettingsRow,
  mapAnimalRow,
  mapRoundRow,

  getGameSettings,
  getActiveAnimals,
  getAnimalById,

  createDeterministicNumber,
  createFairRandomIndex,
  prepareWheelResult,

  getRoundById,
  getActiveRound,
  createRound,
  getPublicGameState
};