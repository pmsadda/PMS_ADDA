"use strict";

const crypto = require("crypto");

const {
  pool,
} = require("../config/database");

/* =========================================================
   CONSTANTS
========================================================= */

const ROUND_STATUS = Object.freeze({
  BETTING: "betting",
  BETTING_CLOSED: "betting_closed",
  DEALING: "dealing",
  SETTLING: "settling",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  REFUNDED: "refunded",
});

const BET_SIDE = Object.freeze({
  ANDAR: "andar",
  BAHAR: "bahar",
});

const ACTIVE_ROUND_STATUSES = [
  ROUND_STATUS.BETTING,
  ROUND_STATUS.BETTING_CLOSED,
  ROUND_STATUS.DEALING,
  ROUND_STATUS.SETTLING,
];

/* =========================================================
   ERROR HELPERS
========================================================= */

function createGameError(
  message,
  statusCode = 500,
  code = "ANDAR_BAHAR_ERROR",
) {
  const error = new Error(message);

  error.statusCode = statusCode;
  error.code = code;

  return error;
}

function assertCondition(
  condition,
  message,
  statusCode = 400,
  code = "INVALID_ANDAR_BAHAR_REQUEST",
) {
  if (!condition) {
    throw createGameError(
      message,
      statusCode,
      code,
    );
  }
}

/* =========================================================
   VALUE HELPERS
========================================================= */

function parseMoney(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return 0;
  }

  return Number(amount.toFixed(2));
}

function parsePositiveInteger(value) {
  const parsedValue = Number(value);

  if (
    !Number.isInteger(parsedValue) ||
    parsedValue < 1
  ) {
    return null;
  }

  return parsedValue;
}

function normalizeBetSide(value) {
  const side = String(
    value || "",
  )
    .trim()
    .toLowerCase();

  if (
    side !== BET_SIDE.ANDAR &&
    side !== BET_SIDE.BAHAR
  ) {
    return null;
  }

  return side;
}

function createReferenceCode(prefix) {
  const timestamp = Date.now();

  const randomPart = crypto
    .randomBytes(6)
    .toString("hex")
    .toUpperCase();

  return `${prefix}_${timestamp}_${randomPart}`;
}

/* =========================================================
   CARD HELPERS
========================================================= */

function createCardDeck() {
  const suits = [
    "C",
    "D",
    "H",
    "S",
  ];

  const ranks = [
    "A",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "J",
    "Q",
    "K",
  ];

  const deck = [];

  suits.forEach((suit) => {
    ranks.forEach((rank) => {
      deck.push({
        code: `${suit}${rank}`,
        rank,
        suit,
      });
    });
  });

  return deck;
}

function createDeterministicNumber(
  serverSeed,
  roundNonce,
  counter,
) {
  const hash = crypto
    .createHmac(
      "sha256",
      serverSeed,
    )
    .update(
      `${roundNonce}:${counter}`,
    )
    .digest();

  return hash.readUInt32BE(0);
}

function shuffleDeck(
  deck,
  serverSeed,
  roundNonce,
) {
  const shuffledDeck = [
    ...deck,
  ];

  let counter = 0;

  for (
    let index = shuffledDeck.length - 1;
    index > 0;
    index -= 1
  ) {
    const randomNumber =
      createDeterministicNumber(
        serverSeed,
        roundNonce,
        counter,
      );

    counter += 1;

    const targetIndex =
      randomNumber % (index + 1);

    [
      shuffledDeck[index],
      shuffledDeck[targetIndex],
    ] = [
      shuffledDeck[targetIndex],
      shuffledDeck[index],
    ];
  }

  return shuffledDeck;
}

function prepareRoundCards(
  serverSeed,
  roundNonce,
) {
  const deck = shuffleDeck(
    createCardDeck(),
    serverSeed,
    roundNonce,
  );

  const jokerCard = deck[0];

  const dealtCards = [];

  let winningSide = null;
  let matchingCard = null;

  /*
   * Joker card-এর পর প্রথম card Andar-এ যাবে।
   * এরপর Andar এবং Bahar-এ পর্যায়ক্রমে card যাবে।
   */
  for (
    let index = 1;
    index < deck.length;
    index += 1
  ) {
    const card = deck[index];

    const side =
      index % 2 === 1
        ? BET_SIDE.ANDAR
        : BET_SIDE.BAHAR;

    const isMatchingCard =
      card.rank === jokerCard.rank;

    dealtCards.push({
      sequence: index,
      code: card.code,
      rank: card.rank,
      suit: card.suit,
      side,
      isMatchingCard,
    });

    if (isMatchingCard) {
      winningSide = side;
      matchingCard = card;

      break;
    }
  }

  assertCondition(
    jokerCard &&
      matchingCard &&
      winningSide,
    "Andar Bahar card result could not be prepared.",
    500,
    "CARD_RESULT_FAILED",
  );

  return {
    jokerCard,
    dealtCards,
    winningSide,
    matchingCard,
  };
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
      Number(row.game_enabled) === 1,

    minimumBet:
      parseMoney(row.minimum_bet),

    maximumBet:
      parseMoney(row.maximum_bet),

    bettingDurationSeconds:
      Number(
        row.betting_duration_seconds,
      ),

    resultDisplaySeconds:
      Number(
        row.result_display_seconds,
      ),

    nextRoundDelaySeconds:
      Number(
        row.next_round_delay_seconds,
      ),

    serviceChargePercent:
      parseMoney(
        row.service_charge_percent,
      ),

    updatedAt:
      row.updated_at || null,
  };
}

function mapRoundRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),

    roundCode:
      row.round_code,

    roundStatus:
      row.round_status,

    jokerCard:
      row.joker_card || null,

    jokerRank:
      row.joker_rank || null,

    winningSide:
      row.winning_side || null,

    matchingCard:
      row.matching_card || null,

    matchingCardPosition:
      row.matching_card_position
        ? Number(
            row.matching_card_position,
          )
        : null,

    totalAndarBet:
      parseMoney(
        row.total_andar_bet,
      ),

    totalBaharBet:
      parseMoney(
        row.total_bahar_bet,
      ),

    totalBetAmount:
      parseMoney(
        row.total_bet_amount,
      ),

    totalGrossPayout:
      parseMoney(
        row.total_gross_payout,
      ),

    totalServiceCharge:
      parseMoney(
        row.total_service_charge,
      ),

    totalNetPayout:
      parseMoney(
        row.total_net_payout,
      ),

    bettingStartedAt:
      row.betting_started_at ||
      null,

    bettingClosesAt:
      row.betting_closes_at ||
      null,

    dealingStartedAt:
      row.dealing_started_at ||
      null,

    completedAt:
      row.completed_at ||
      null,

    createdAt:
      row.created_at || null,

    updatedAt:
      row.updated_at || null,
  };
}

/* =========================================================
   SETTINGS
========================================================= */

async function getGameSettings(
  connection = pool,
  options = {},
) {
  const lockSuffix =
    options.lock === true
      ? "FOR UPDATE"
      : "";

  const [rows] =
    await connection.query(
      `
        SELECT
          id,
          game_enabled,
          minimum_bet,
          maximum_bet,
          betting_duration_seconds,
          result_display_seconds,
          next_round_delay_seconds,
          service_charge_percent,
          updated_at

        FROM andar_bahar_settings

        WHERE id = 1

        LIMIT 1

        ${lockSuffix}
      `,
    );

  const settings =
    mapSettingsRow(
      rows[0] || null,
    );

  assertCondition(
    settings,
    "Andar Bahar settings were not found.",
    500,
    "GAME_SETTINGS_NOT_FOUND",
  );

  return settings;
}

/* =========================================================
   ROUND QUERIES
========================================================= */

async function getRoundById(
  roundId,
  connection = pool,
  options = {},
) {
  const validRoundId =
    parsePositiveInteger(roundId);

  assertCondition(
    validRoundId,
    "Valid Andar Bahar round ID is required.",
    400,
    "INVALID_ROUND_ID",
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

        FROM andar_bahar_rounds

        WHERE id = ?

        LIMIT 1

        ${lockSuffix}
      `,
      [validRoundId],
    );

  return rows[0] || null;
}

async function getActiveRound(
  connection = pool,
  options = {},
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

        FROM andar_bahar_rounds

        WHERE round_status IN (
          'betting',
          'betting_closed',
          'dealing',
          'settling'
        )

        ORDER BY id DESC

        LIMIT 1

        ${lockSuffix}
      `,
    );

  return mapRoundRow(
    rows[0] || null,
  );
}

/* =========================================================
   CREATE ROUND
========================================================= */

async function createRound() {
  const connection =
    await pool.getConnection();

  try {
    await connection.beginTransaction();

    const settings =
      await getGameSettings(
        connection,
        {
          lock: true,
        },
      );

    assertCondition(
      settings.gameEnabled,
      "Andar Bahar is currently disabled.",
      403,
      "GAME_DISABLED",
    );

    const currentRound =
      await getActiveRound(
        connection,
        {
          lock: true,
        },
      );

    if (currentRound) {
      await connection.commit();

      return {
        created: false,
        round: currentRound,
        settings,
      };
    }

    const roundCode =
      createReferenceCode("ABR");

    const serverSeed = crypto
      .randomBytes(32)
      .toString("hex");

    const serverSeedHash = crypto
      .createHash("sha256")
      .update(serverSeed)
      .digest("hex");

    const roundNonce =
      createReferenceCode("NONCE");

    const bettingDurationSeconds =
      Math.max(
        5,
        Number(
          settings
            .bettingDurationSeconds,
        ) || 15,
      );

    const [insertResult] =
      await connection.query(
        `
          INSERT INTO andar_bahar_rounds (
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
          bettingDurationSeconds,
        ],
      );

    const roundRow =
      await getRoundById(
        insertResult.insertId,
        connection,
        {
          lock: true,
        },
      );

    await connection.commit();

    return {
      created: true,

      round:
        mapRoundRow(roundRow),

      settings,
    };
  } catch (error) {
    await connection.rollback();

    /*
     * একই সময়ে একাধিক server process round বানাতে চাইলে
     * প্রথম সফল round-টিই ব্যবহার করা হবে।
     */
    if (
      error.code ===
      "ER_DUP_ENTRY"
    ) {
      const activeRound =
        await getActiveRound();

      if (activeRound) {
        return {
          created: false,
          round: activeRound,
          settings:
            await getGameSettings(),
        };
      }
    }

    throw error;
  } finally {
    connection.release();
  }
}

/* =========================================================
   PUBLIC GAME STATE
========================================================= */

async function getPublicGameState() {
  const [
    settings,
    activeRound,
  ] = await Promise.all([
    getGameSettings(),
    getActiveRound(),
  ]);

  return {
    settings,
    activeRound,
    serverTime:
      new Date().toISOString(),
  };
}

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  ROUND_STATUS,
  BET_SIDE,
  ACTIVE_ROUND_STATUSES,

  createGameError,
  assertCondition,
  parseMoney,
  parsePositiveInteger,
  normalizeBetSide,
  createReferenceCode,

  createCardDeck,
  shuffleDeck,
  prepareRoundCards,

  mapSettingsRow,
  mapRoundRow,

  getGameSettings,
  getRoundById,
  getActiveRound,
  createRound,
  getPublicGameState,
};