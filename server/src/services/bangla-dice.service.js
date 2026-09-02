"use strict";

const crypto = require("crypto");

const { pool } = require("../config/database");

const ROUND_STATUS = Object.freeze({
  BETTING: "betting",
  ROLLING: "rolling",
  SETTLING: "settling",
  COMPLETED: "completed",
  REFUNDING: "refunding",
  REFUNDED: "refunded",
  CANCELLED: "cancelled",
});

function createGameError(
  message,
  statusCode = 400,
  code = "BANGLA_DICE_ERROR",
) {
  const error = new Error(message);

  error.statusCode = statusCode;

  error.code = code;

  return error;
}

function assertCondition(condition, message, statusCode, code) {
  if (!condition) {
    throw createGameError(message, statusCode, code);
  }
}

function parseMoney(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return 0;
  }

  return Number(amount.toFixed(2));
}

function parsePositiveInteger(value) {
  const number = Number(value);

  return Number.isInteger(number) && number > 0 ? number : null;
}

function parseJson(value) {
  if (!value) {
    return null;
  }

  if (typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch (_error) {
    return null;
  }
}

function createReferenceCode(prefix) {
  return [
    prefix,
    Date.now(),
    crypto.randomBytes(6).toString("hex").toUpperCase(),
  ].join("_");
}

function mapSettingsRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),

    gameEnabled: Boolean(Number(row.game_enabled)),

    resultMode: String(row.result_mode || "equal"),

    minimumBet: parseMoney(row.minimum_bet),

    maximumBet: parseMoney(row.maximum_bet),

    bettingDurationSeconds: Number(row.betting_duration_seconds || 20),

    rollDurationSeconds: Number(row.roll_duration_seconds || 5),

    resultDisplaySeconds: Number(row.result_display_seconds || 5),

    nextRoundDelaySeconds: Number(row.next_round_delay_seconds || 3),

    serviceChargePercent: parseMoney(row.service_charge_percent),
  };
}

function mapSymbolRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),

    symbolCode: String(row.symbol_code),

    symbolNameBn: String(row.symbol_name_bn),

    symbolNameEn: String(row.symbol_name_en),

    faceNumber: Number(row.face_number),

    imagePath: row.image_path || null,

    multiplier: Number(row.multiplier),

    probabilityWeight: Number(row.probability_weight),

    isActive: Boolean(Number(row.is_active)),

    isBettable: Boolean(Number(row.is_bettable)),
  };
}

function canRevealRoundResult(status) {
  return [
    ROUND_STATUS.ROLLING,
    ROUND_STATUS.SETTLING,
    ROUND_STATUS.COMPLETED,
    ROUND_STATUS.REFUNDED,
  ].includes(String(status));
}

function mapRoundRow(row, { revealResult = false } = {}) {
  if (!row) {
    return null;
  }

  const status = String(row.round_status);

  const shouldReveal = revealResult || canRevealRoundResult(status);

  return {
    id: Number(row.id),

    roundCode: String(row.round_code),

    roundStatus: status,

    resultMode: String(row.result_mode),

    minimumBet: parseMoney(row.minimum_bet),

    maximumBet: parseMoney(row.maximum_bet),

    serviceChargePercent: parseMoney(row.service_charge_percent),

    probabilitySnapshot: parseJson(row.probability_snapshot),

    serverSeedHash: String(row.server_seed_hash),

    serverSeedReveal: shouldReveal ? row.server_seed_reveal : null,

    winningSymbolId:
      shouldReveal && row.winning_symbol_id
        ? Number(row.winning_symbol_id)
        : null,

    winningSymbolCode: shouldReveal ? row.winning_symbol_code : null,

    winningSymbolName: shouldReveal ? row.winning_symbol_name : null,

    winningFaceNumber:
      shouldReveal && row.winning_face_number
        ? Number(row.winning_face_number)
        : null,

    winningMultiplier:
      shouldReveal && row.winning_multiplier !== null
        ? Number(row.winning_multiplier)
        : null,

    totalBetAmount: parseMoney(row.total_bet_amount),

    totalPlayers: Number(row.total_players || 0),

    totalBets: Number(row.total_bets || 0),

    bettingStartedAt: row.betting_started_at,

    bettingEndsAt: row.betting_ends_at,

    rollingStartedAt: row.rolling_started_at,

    rollingEndsAt: row.rolling_ends_at,

    completedAt: row.completed_at,

    serverTime: new Date().toISOString(),
  };
}

async function getGameSettings(connection = pool) {
  const [rows] = await connection.query(
    `
        SELECT *

        FROM bangla_dice_settings

        WHERE id = 1

        LIMIT 1
      `,
  );

  assertCondition(
    rows[0],
    "Bangla Dice settings were not found.",
    500,
    "BANGLA_DICE_SETTINGS_MISSING",
  );

  return mapSettingsRow(rows[0]);
}

async function getActiveSymbols(connection = pool) {
  const [rows] = await connection.query(
    `
        SELECT *

        FROM bangla_dice_symbols

        WHERE is_active = 1

        ORDER BY face_number ASC
      `,
  );

  const symbols = rows.map(mapSymbolRow);

  assertCondition(
    symbols.length === 6,
    "Bangla Dice requires exactly six active symbols.",
    500,
    "BANGLA_DICE_SYMBOL_COUNT_INVALID",
  );

  return symbols;
}

async function getSymbolById(symbolId, connection = pool) {
  const validSymbolId = parsePositiveInteger(symbolId);

  assertCondition(
    validSymbolId,
    "Valid Dice symbol ID is required.",
    400,
    "INVALID_DICE_SYMBOL_ID",
  );

  const [rows] = await connection.query(
    `
        SELECT *

        FROM bangla_dice_symbols

        WHERE id = ?
          AND is_active = 1
          AND is_bettable = 1

        LIMIT 1
      `,
    [validSymbolId],
  );

  return rows[0] ? mapSymbolRow(rows[0]) : null;
}

async function getRoundById(roundId, connection = pool, options = {}) {
  const validRoundId = parsePositiveInteger(roundId);

  if (!validRoundId) {
    return null;
  }

  const lockSql = options.lock ? "FOR UPDATE" : "";

  const [rows] = await connection.query(
    `
        SELECT *

        FROM bangla_dice_rounds

        WHERE id = ?

        LIMIT 1

        ${lockSql}
      `,
    [validRoundId],
  );

  return rows[0] || null;
}

async function getActiveRound(connection = pool) {
  const [rows] = await connection.query(
    `
        SELECT *

        FROM bangla_dice_rounds

        WHERE round_status IN (
          'betting',
          'rolling',
          'settling'
        )

        ORDER BY id DESC

        LIMIT 1
      `,
  );

  return rows[0] || null;
}

function createProbabilitySnapshot(symbols, mode) {
  return symbols.map((symbol) => ({
    id: symbol.id,
    symbolCode: symbol.symbolCode,
    symbolNameBn: symbol.symbolNameBn,
    faceNumber: symbol.faceNumber,
    multiplier: Number(symbol.multiplier),
    weight:
      mode === "weighted" ? Math.max(0, Number(symbol.probabilityWeight)) : 1,
  }));
}

function createDeterministicNumber(seed, roundCode) {
  const hash = crypto
    .createHash("sha256")
    .update(`${seed}:${roundCode}`)
    .digest("hex");

  const firstBytes = hash.slice(0, 13);

  const integer = Number.parseInt(firstBytes, 16);

  return integer / 0x10000000000000;
}

function selectWinningSymbol(snapshot, randomNumber) {
  const totalWeight = snapshot.reduce(
    (total, symbol) => total + Math.max(0, Number(symbol.weight)),
    0,
  );

  assertCondition(
    totalWeight > 0,
    "Dice probability weight must be greater than zero.",
    500,
    "DICE_WEIGHT_INVALID",
  );

  const target = randomNumber * totalWeight;

  let runningWeight = 0;

  for (const symbol of snapshot) {
    runningWeight += Math.max(0, Number(symbol.weight));

    if (target < runningWeight) {
      return symbol;
    }
  }

  return snapshot[snapshot.length - 1];
}

async function createRound() {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [settingsRows] = await connection.query(
      `
          SELECT *

          FROM bangla_dice_settings

          WHERE id = 1

          LIMIT 1

          FOR UPDATE
        `,
    );

    const settings = mapSettingsRow(settingsRows[0]);

    assertCondition(
      settings,
      "Bangla Dice settings were not found.",
      500,
      "DICE_SETTINGS_MISSING",
    );

    assertCondition(
      settings.gameEnabled,
      "Bangla Dice is currently disabled.",
      409,
      "BANGLA_DICE_DISABLED",
    );

    const [activeRows] = await connection.query(
      `
          SELECT id

          FROM bangla_dice_rounds

          WHERE round_status IN (
            'betting',
            'rolling',
            'settling'
          )

          LIMIT 1

          FOR UPDATE
        `,
    );

    assertCondition(
      activeRows.length === 0,
      "An active Dice round already exists.",
      409,
      "DICE_ACTIVE_ROUND_EXISTS",
    );

    const symbols = await getActiveSymbols(connection);

    const roundCode = createReferenceCode("BD_ROUND");

    const serverSeed = crypto.randomBytes(32).toString("hex");

    const serverSeedHash = crypto
      .createHash("sha256")
      .update(serverSeed)
      .digest("hex");

    const snapshot = createProbabilitySnapshot(symbols, settings.resultMode);

    const randomNumber = createDeterministicNumber(serverSeed, roundCode);

    const winner = selectWinningSymbol(snapshot, randomNumber);

    const bettingStartedAt = new Date();

    const bettingEndsAt = new Date(
      bettingStartedAt.getTime() + settings.bettingDurationSeconds * 1000,
    );

    const [insertResult] = await connection.query(
      `
          INSERT INTO bangla_dice_rounds (
            round_code,
            round_status,
            result_mode,
            minimum_bet,
            maximum_bet,
            service_charge_percent,
            probability_snapshot,
            server_seed_hash,
            server_seed_reveal,
            winning_symbol_id,
            winning_symbol_code,
            winning_symbol_name,
            winning_face_number,
            winning_multiplier,
            betting_started_at,
            betting_ends_at
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
            ?,
            ?,
            ?,
            ?,
            ?,
            ?
          )
        `,
      [
        roundCode,
        settings.resultMode,
        settings.minimumBet,
        settings.maximumBet,
        settings.serviceChargePercent,
        JSON.stringify(snapshot),
        serverSeedHash,
        serverSeed,
        winner.id,
        winner.symbolCode,
        winner.symbolNameBn,
        winner.faceNumber,
        winner.multiplier,
        bettingStartedAt,
        bettingEndsAt,
      ],
    );

    const createdRow = await getRoundById(insertResult.insertId, connection);

    await connection.commit();

    return mapRoundRow(createdRow);
  } catch (error) {
    await connection.rollback();

    throw error;
  } finally {
    connection.release();
  }
}

async function startRoll(roundId) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const row = await getRoundById(roundId, connection, {
      lock: true,
    });

    assertCondition(
      row,
      "Dice round was not found.",
      404,
      "DICE_ROUND_NOT_FOUND",
    );

    if (row.round_status === ROUND_STATUS.ROLLING) {
      await connection.commit();

      return mapRoundRow(row, {
        revealResult: true,
      });
    }

    assertCondition(
      row.round_status === ROUND_STATUS.BETTING,
      "This Dice round cannot start rolling.",
      409,
      "DICE_ROUND_NOT_BETTING",
    );

    const settings = await getGameSettings(connection);

    const rollingStartedAt = new Date();

    const rollingEndsAt = new Date(
      rollingStartedAt.getTime() + settings.rollDurationSeconds * 1000,
    );

    await connection.query(
      `
        UPDATE bangla_dice_rounds

        SET
          round_status =
            'rolling',
          rolling_started_at = ?,
          rolling_ends_at = ?

        WHERE id = ?
          AND round_status =
            'betting'
      `,
      [rollingStartedAt, rollingEndsAt, Number(row.id)],
    );

    const updatedRow = await getRoundById(row.id, connection);

    await connection.commit();

    return mapRoundRow(updatedRow, {
      revealResult: true,
    });
  } catch (error) {
    await connection.rollback();

    throw error;
  } finally {
    connection.release();
  }
}

async function getPublicGameState() {
  const [settings, symbols, activeRow] = await Promise.all([
    getGameSettings(),
    getActiveSymbols(),
    getActiveRound(),
  ]);

  return {
    settings,
    symbols,
    activeRound: activeRow ? mapRoundRow(activeRow) : null,

    serverTime: new Date().toISOString(),
  };
}

module.exports = {
  ROUND_STATUS,
  createGameError,
  assertCondition,
  parseMoney,
  parsePositiveInteger,
  createReferenceCode,
  mapSettingsRow,
  mapSymbolRow,
  mapRoundRow,
  getGameSettings,
  getActiveSymbols,
  getSymbolById,
  getRoundById,
  getActiveRound,
  createProbabilitySnapshot,
  createDeterministicNumber,
  selectWinningSymbol,
  createRound,
  startRoll,
  getPublicGameState,
};
