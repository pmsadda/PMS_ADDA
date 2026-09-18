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

  const RESULT_MODE =
  Object.freeze({
    FAIR_EQUAL:
      "fair_equal",

    ADMIN_CONFIGURED_ODDS:
      "admin_configured_odds"
  });

  const VOLATILITY_PROFILE =
  Object.freeze({
    LOW: "low",
    MEDIUM: "medium",
    HIGH: "high",
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

function parseJsonValue(
  value,
  fallback = null
) {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  if (
    typeof value === "object"
  ) {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
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

        resultMode:
  Object.values(
    RESULT_MODE
  ).includes(
    row.result_mode
  )
    ? row.result_mode
    : RESULT_MODE.FAIR_EQUAL,

volatilityProfile:
  Object.values(
    VOLATILITY_PROFILE
  ).includes(
    String(
      row.volatility_profile ||
      ""
    ).toLowerCase()
  )
    ? String(
        row.volatility_profile
      ).toLowerCase()
    : VOLATILITY_PROFILE.MEDIUM,

oddsVersion:
      Number(
        row.odds_version ||
        1
      ),

    oddsUpdatedAt:
      row.odds_updated_at ||
      null,

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

          winningWeight:
      Number(
        row.winning_weight ||
        0
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

      resultMode:
  row.result_mode_snapshot ||
  RESULT_MODE.FAIR_EQUAL,

volatilityProfile:
  Object.values(
    VOLATILITY_PROFILE
  ).includes(
    String(
      row.volatility_profile_snapshot ||
      ""
    ).toLowerCase()
  )
    ? String(
        row.volatility_profile_snapshot
      ).toLowerCase()
    : null,

oddsVersion:
      Number(
        row.odds_version_snapshot ||
        1
      ),

    probabilitySnapshot:
      parseJsonValue(
        row.probability_snapshot,
        []
      ),

    totalWinningWeight:
      Number(
        row.total_winning_weight ||
        0
      ),

    winningTicket:
      resultVisible &&
      row.winning_ticket !== null
        ? Number(
            row.winning_ticket
          )
        : null,

    probabilityLockedAt:
      row.probability_locked_at ||
      null,

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
  animals.length === 12,
  "Bangla Wheel requires exactly 12 active animals.",
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
  uniqueIndexes.size === 12,
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

function createProbabilitySnapshot(
  animals,
  resultMode =
    RESULT_MODE.FAIR_EQUAL
) {
  assertCondition(
    Array.isArray(animals) &&
      animals.length === 12,
    "Exactly 12 animals are required.",
    500,
    "INVALID_ANIMAL_LIST"
  );

  const normalizedMode =
    Object.values(
      RESULT_MODE
    ).includes(
      resultMode
    )
      ? resultMode
      : RESULT_MODE.FAIR_EQUAL;

  const probabilitySnapshot =
    animals.map((animal) => {
      const winningWeight =
        normalizedMode ===
        RESULT_MODE.FAIR_EQUAL
          ? 1
          : Number(
              animal.winningWeight ||
              0
            );

      assertCondition(
        Number.isInteger(
          winningWeight
        ) &&
          winningWeight > 0,
        `Invalid winning weight for ${animal.animalCode}.`,
        500,
        "INVALID_ANIMAL_WEIGHT"
      );

      return {
        animalId:
          Number(animal.id),

        animalCode:
          animal.animalCode,

        animalName:
          animal.animalName,

        segmentIndex:
          Number(
            animal.segmentIndex
          ),

        multiplier:
          parseMoney(
            animal.multiplier
          ),

        isBettable:
          animal.isBettable ===
          true,

        winningWeight
      };
    });

  const totalWinningWeight =
    probabilitySnapshot.reduce(
      (total, animal) =>
        total +
        animal.winningWeight,
      0
    );

  if (
    normalizedMode ===
    RESULT_MODE.ADMIN_CONFIGURED_ODDS
  ) {
    assertCondition(
      totalWinningWeight ===
        1000,
      "Admin configured winning weights must total exactly 1000.",
      500,
      "INVALID_CONFIGURED_WEIGHT_TOTAL"
    );
  } else {
    assertCondition(
      totalWinningWeight ===
        12,
      "Fair equal mode requires 12 equal weights.",
      500,
      "INVALID_FAIR_WEIGHT_TOTAL"
    );
  }

  return {
    resultMode:
      normalizedMode,

    totalWinningWeight,

    probabilitySnapshot:
      probabilitySnapshot.map(
        (animal) => ({
          ...animal,

          winningChancePercent:
            Number(
              (
                animal.winningWeight *
                100 /
                totalWinningWeight
              ).toFixed(2)
            )
        })
      )
  };
}

function prepareWheelResult(
  animals,
  serverSeed,
  roundNonce,
  resultMode =
    RESULT_MODE.FAIR_EQUAL
) {
  assertCondition(
    Array.isArray(animals) &&
      animals.length === 12,
    "Exactly 12 animals are required.",
    500,
    "INVALID_ANIMAL_LIST"
  );

  const normalizedMode =
    Object.values(
      RESULT_MODE
    ).includes(
      resultMode
    )
      ? resultMode
      : RESULT_MODE.FAIR_EQUAL;

  const probabilitySnapshot =
    animals.map(
      (
        animal,
        arrayIndex
      ) => {
        const configuredWeight =
          Number(
            animal.winningWeight ||
            0
          );

        const effectiveWeight =
          normalizedMode ===
          RESULT_MODE.FAIR_EQUAL
            ? 1
            : configuredWeight;

        assertCondition(
          Number.isInteger(
            effectiveWeight
          ) &&
            effectiveWeight > 0,
          `Invalid winning weight for ${animal.animalCode}.`,
          500,
          "INVALID_ANIMAL_WEIGHT"
        );

        return {
          arrayIndex,

          animalId:
            Number(animal.id),

          animalCode:
            animal.animalCode,

          animalName:
            animal.animalName,

          segmentIndex:
            Number(
              animal.segmentIndex
            ),

          multiplier:
            parseMoney(
              animal.multiplier
            ),

          isBettable:
            animal.isBettable ===
            true,

          winningWeight:
            effectiveWeight
        };
      }
    );

  const totalWinningWeight =
    probabilitySnapshot.reduce(
      (
        total,
        item
      ) =>
        total +
        item.winningWeight,
      0
    );

  assertCondition(
    totalWinningWeight > 0,
    "Total winning weight must be greater than zero.",
    500,
    "INVALID_TOTAL_WINNING_WEIGHT"
  );

  if (
    normalizedMode ===
    RESULT_MODE.ADMIN_CONFIGURED_ODDS
  ) {
    assertCondition(
      totalWinningWeight ===
        1000,
      "Admin configured winning weights must total exactly 1000.",
      500,
      "INVALID_CONFIGURED_WEIGHT_TOTAL"
    );
  }

  /*
   * createFairRandomIndex rejection sampling ব্যবহার করে।
   * তাই total weight-এর মধ্যেও modulo bias থাকবে না।
   */
  const winningTicket =
    createFairRandomIndex(
      serverSeed,
      roundNonce,
      totalWinningWeight
    );

  let cumulativeWeight = 0;
  let selectedSnapshot = null;

  for (
    const item of
      probabilitySnapshot
  ) {
    cumulativeWeight +=
      item.winningWeight;

    if (
      winningTicket <
      cumulativeWeight
    ) {
      selectedSnapshot =
        item;

      break;
    }
  }

  assertCondition(
    selectedSnapshot,
    "Winning animal could not be selected.",
    500,
    "WINNING_ANIMAL_MISSING"
  );

  const winningAnimal =
    animals[
      selectedSnapshot.arrayIndex
    ];

  assertCondition(
    winningAnimal,
    "Winning animal record is missing.",
    500,
    "WINNING_ANIMAL_RECORD_MISSING"
  );

  const publicSnapshot =
    probabilitySnapshot.map(
      (item) => ({
        animalId:
          item.animalId,

        animalCode:
          item.animalCode,

        animalName:
          item.animalName,

        segmentIndex:
          item.segmentIndex,

        multiplier:
          item.multiplier,

        isBettable:
          item.isBettable,

        winningWeight:
          item.winningWeight,

        winningChancePercent:
          Number(
            (
              item.winningWeight *
              100 /
              totalWinningWeight
            ).toFixed(2)
          )
      })
    );

  return {
    randomIndex:
      selectedSnapshot.arrayIndex,

    winningTicket,

    totalWinningWeight,

    probabilitySnapshot:
      publicSnapshot,

    resultMode:
      normalizedMode,

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

async function applyPendingConfiguration(
  connection
) {
  const [rows] =
    await connection.query(
      `
        SELECT
          *

        FROM bangla_wheel_pending_configs

        WHERE config_status =
          'pending'

        ORDER BY id DESC

        LIMIT 1

        FOR UPDATE
      `
    );

  const pending =
    rows[0] ||
    null;

  if (!pending) {
    return null;
  }

  const settingsPayload =
    parseJsonValue(
      pending.settings_payload,
      {}
    );

  const animalsPayload =
    parseJsonValue(
      pending.animals_payload,
      []
    );

  assertCondition(
    Object.values(
      RESULT_MODE
    ).includes(
      settingsPayload.resultMode
    ),
    "Pending result mode is invalid.",
    500,
    "INVALID_PENDING_RESULT_MODE"
  );

  assertCondition(
  Object.values(
    VOLATILITY_PROFILE
  ).includes(
    settingsPayload
      .volatilityProfile
  ),
  "Pending volatility profile is invalid.",
  500,
  "INVALID_PENDING_VOLATILITY_PROFILE"
);

  assertCondition(
    Array.isArray(
      animalsPayload
    ) &&
      animalsPayload.length === 12,
    "Pending configuration requires exactly 12 animals.",
    500,
    "INVALID_PENDING_ANIMALS"
  );

  const totalWeight =
    animalsPayload.reduce(
      (
        total,
        animal
      ) =>
        total +
        Number(
          animal.winningWeight ||
          0
        ),
      0
    );

  if (
    settingsPayload.resultMode ===
    RESULT_MODE.ADMIN_CONFIGURED_ODDS
  ) {
    assertCondition(
      totalWeight === 1000,
      "Pending configured weights must total exactly 1000.",
      500,
      "INVALID_PENDING_WEIGHT_TOTAL"
    );
  }

  await connection.query(
    `
      UPDATE bangla_wheel_pending_configs

      SET config_status =
        'applying'

      WHERE id = ?
        AND config_status =
          'pending'
    `,
    [
      pending.id
    ]
  );

  await connection.query(
    `
      UPDATE bangla_wheel_settings

      SET
        game_enabled = ?,
        minimum_bet = ?,
        maximum_bet = ?,
        betting_duration_seconds = ?,
        spin_duration_seconds = ?,
        result_display_seconds = ?,
        next_round_delay_seconds = ?,
        service_charge_percent = ?,
        max_round_liability = ?,
        result_mode = ?,
        volatility_profile = ?,
        odds_version = ?,
        odds_updated_at =
          CURRENT_TIMESTAMP(3),
        updated_by = ?

      WHERE id = 1
    `,
    [
      settingsPayload.gameEnabled
        ? 1
        : 0,

      parseMoney(
        settingsPayload.minimumBet
      ),

      parseMoney(
        settingsPayload.maximumBet
      ),

      Number(
        settingsPayload
          .bettingDurationSeconds
      ),

      Number(
        settingsPayload
          .spinDurationSeconds
      ),

      Number(
        settingsPayload
          .resultDisplaySeconds
      ),

      Number(
        settingsPayload
          .nextRoundDelaySeconds
      ),

      parseMoney(
        settingsPayload
          .serviceChargePercent
      ),

      parseMoney(
        settingsPayload
          .maxRoundLiability
      ),

      settingsPayload.resultMode,

settingsPayload.volatilityProfile,

Number(
  pending.config_version
),

      pending.created_by ||
      null
    ]
  );

  for (
    const animal of
      animalsPayload
  ) {
    const animalId =
      parsePositiveInteger(
        animal.id
      );

    const multiplier =
      parseMoney(
        animal.multiplier
      );

    const winningWeight =
      Number(
        animal.winningWeight
      );

    assertCondition(
      animalId,
      "Pending animal ID is invalid.",
      500,
      "INVALID_PENDING_ANIMAL_ID"
    );

    assertCondition(
      Number.isInteger(
        winningWeight
      ) &&
        winningWeight > 0,
      "Pending animal weight is invalid.",
      500,
      "INVALID_PENDING_ANIMAL_WEIGHT"
    );

    const [updateResult] =
      await connection.query(
        `
          UPDATE bangla_wheel_animals

          SET
            multiplier = ?,
            winning_weight = ?,
            is_bettable = ?

          WHERE id = ?
            AND animal_status =
              'active'
        `,
        [
          multiplier,
          winningWeight,
          animal.isBettable
            ? 1
            : 0,
          animalId
        ]
      );

    assertCondition(
      Number(
        updateResult.affectedRows
      ) === 1,
      `Pending animal ${animalId} could not be updated.`,
      500,
      "PENDING_ANIMAL_UPDATE_FAILED"
    );
  }

  return {
    id:
      Number(pending.id),

    configVersion:
      Number(
        pending.config_version
      )
  };
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

       const activeRound =
      await getActiveRound(
        connection,
        {
          lock: true
        }
      );

    if (activeRound) {
      const currentSettings =
        await getGameSettings(
          connection,
          {
            lock: true
          }
        );

      await connection.commit();

      return {
        created: false,
        round: activeRound,
        settings:
          currentSettings
      };
    }

    /*
     * Active round না থাকলেই pending config apply হবে।
     */
    const appliedPendingConfig =
      await applyPendingConfiguration(
        connection
      );

    const settings =
      await getGameSettings(
        connection,
        {
          lock: true
        }
      );

       if (!settings.gameEnabled) {
      if (
        appliedPendingConfig
      ) {
        await connection.query(
          `
            UPDATE bangla_wheel_pending_configs

            SET
              config_status =
                'applied',

              applied_round_id = NULL,

              applied_at =
                CURRENT_TIMESTAMP(3)

            WHERE id = ?
              AND config_status =
                'applying'
          `,
          [
            appliedPendingConfig.id
          ]
        );
      }

      await connection.commit();

      return {
        created: false,
        round: null,
        settings
      };
    }

    const animals =
      await getActiveAnimals(
        connection,
        {
          lock: true
        }
      );

    const lockedProbability =
      createProbabilitySnapshot(
        animals,
        settings.resultMode
      );
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
        result_mode_snapshot,
        volatility_profile_snapshot,
        odds_version_snapshot,
        probability_snapshot,
        total_winning_weight,
        probability_locked_at,
        betting_started_at,
        betting_closes_at
      )
      VALUES (
        ?,
        'betting',
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        CURRENT_TIMESTAMP(3),
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
      lockedProbability.resultMode,
      settings.volatilityProfile,
      Number(
        settings.oddsVersion ||
        1
      ),
      JSON.stringify(
        lockedProbability
          .probabilitySnapshot
      ),
      lockedProbability
        .totalWinningWeight,
      bettingDuration,
    ]
  );

          if (
      appliedPendingConfig
    ) {
      await connection.query(
        `
          UPDATE bangla_wheel_pending_configs

          SET
            config_status =
              'applied',

            applied_round_id = ?,

            applied_at =
              CURRENT_TIMESTAMP(3)

          WHERE id = ?
            AND config_status =
              'applying'
        `,
        [
          insertResult.insertId,
          appliedPendingConfig.id
        ]
      );
    }

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
  RESULT_MODE,
  VOLATILITY_PROFILE,
  ACTIVE_ROUND_STATUSES,

  createGameError,
  assertCondition,
    parseMoney,
  parsePositiveInteger,
  parseJsonValue,
  createReferenceCode,

  mapSettingsRow,
  mapAnimalRow,
  mapRoundRow,

  getGameSettings,
  getActiveAnimals,
  getAnimalById,

    createDeterministicNumber,
  createFairRandomIndex,
  createProbabilitySnapshot,
  prepareWheelResult,

    getRoundById,
  getActiveRound,
  applyPendingConfiguration,
  createRound,
  getPublicGameState
};