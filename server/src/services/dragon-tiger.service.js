"use strict";

const crypto = require("node:crypto");
const { pool } = require("../config/database");

function fail(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
}

function cents(value) {
  const text = String(value ?? "").trim();

  if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(text)) {
    fail("Invalid money amount.");
  }

  const [whole, fraction = ""] = text.split(".");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));

  if (!Number.isSafeInteger(amount)) fail("Invalid money amount.");

  return amount;
}

const decimal = (amount) => (amount / 100).toFixed(2);

function card(index) {
  const value = index % 13 + 1;

  return {
    value,
    rank: ["A","2","3","4","5","6","7","8","9","10","J","Q","K"][value - 1],
    suit: ["spades","hearts","clubs","diamonds"][Math.floor((index % 52) / 13)]
  };
}

function deal() {
  const first = crypto.randomInt(416);
  let second = crypto.randomInt(415);

  if (second >= first) second++;

  return {
    dragon: card(first),
    tiger: card(second)
  };
}

function settle(bet, side, dragon, tiger) {
  const outcome = dragon.value === tiger.value
    ? "tie"
    : dragon.value > tiger.value ? "dragon" : "tiger";

  const payout = outcome === side
    ? bet * (side === "tie" ? 12 : 2)
    : outcome === "tie" && side !== "tie" ? bet / 2 : 0;

  return { outcome, payout };
}

function formatSettings(row) {
  return {
    isEnabled: Boolean(Number(row.is_enabled)),
    maintenanceMode: Boolean(Number(row.maintenance_mode)),
    minBet: Number(row.min_bet),
    maxBet: Number(row.max_bet),
    maxPayoutPerRound: Number(row.max_payout_per_round)
  };
}

async function settings(database = pool, lock = false) {
  const [rows] = await database.execute(
    "SELECT * FROM dragon_tiger_settings WHERE id = 1" +
    (lock ? " FOR UPDATE" : "")
  );

  if (!rows.length) fail("Dragon Tiger settings missing.", 503);

  return formatSettings(rows[0]);
}

async function getState(userId) {
  const [rows] = await pool.execute(
    "SELECT id, wallet_balance FROM users WHERE id = ?",
    [userId]
  );

  if (!rows.length) fail("User not found.", 404);

  return {
    userId: String(rows[0].id),
    walletBalance: Number(rows[0].wallet_balance),
    settings: await settings()
  };
}

async function getHistory(userId) {
  const [rows] = await pool.execute(
    "SELECT result_json FROM dragon_tiger_rounds " +
    "WHERE user_id = ? ORDER BY id DESC LIMIT 20",
    [userId]
  );

  return rows.map(row => JSON.parse(row.result_json));
}

async function ledger(
  connection, userId, code, type, direction, amount, before, after
) {
  await connection.execute(
    "INSERT INTO wallet_transactions " +
    "(transaction_id,user_id,transaction_type,direction,amount,balance_before," +
    "balance_after,status,reference_type,reference_id,description) " +
    "VALUES (?,?,?,?,?,?,?,'completed','dragon_tiger_round',?,?)",
    [
      crypto.randomUUID(), userId, type, direction,
      decimal(amount), decimal(before), decimal(after),
      code,
      direction === "debit" ? "Dragon Tiger stake" : "Dragon Tiger return"
    ]
  );
}

async function play(userId, body = {}) {
  const requestId = String(body.requestId || "");
  const side = String(body.side || "").toLowerCase();
  const bet = cents(body.betAmount);

  if (!/^[a-f0-9-]{36}$/i.test(requestId)) fail("Invalid request ID.");

  if (!["dragon", "tiger", "tie"].includes(side)) {
    fail("Select Dragon, Tiger or Tie.");
  }

  if (bet <= 0 || bet % 2 !== 0) {
    fail("Bet must use 0.02 taka steps.");
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [users] = await connection.execute(
      "SELECT id,wallet_balance,account_status FROM users " +
      "WHERE id = ? FOR UPDATE",
      [userId]
    );

    if (!users.length || users[0].account_status !== "active") {
      fail("Account unavailable.", 403);
    }

    const [existing] = await connection.execute(
      "SELECT bet_side,bet_amount,result_json FROM dragon_tiger_rounds " +
      "WHERE user_id = ? AND request_id = ?",
      [userId, requestId]
    );

    if (existing.length) {
      if (
        existing[0].bet_side !== side ||
        cents(existing[0].bet_amount) !== bet
      ) {
        fail("Request ID already used for another bet.", 409);
      }

      const previous = JSON.parse(existing[0].result_json);

      await connection.commit();

      return { ...previous, replayed: true };
    }

    const config = await settings(connection);

    if (!config.isEnabled || config.maintenanceMode) {
      fail("Game unavailable.", 409);
    }

    if (bet < cents(config.minBet) || bet > cents(config.maxBet)) {
      fail("Bet outside allowed limits.");
    }

    const maximumReturn = bet * (side === "tie" ? 12 : 2);

    if (maximumReturn > cents(config.maxPayoutPerRound)) {
      fail("Reduce bet to fit the maximum return limit.");
    }

    const before = cents(users[0].wallet_balance);

    if (before < bet) fail("Insufficient wallet balance.", 409);

    if (before - bet + maximumReturn > 99999999999999) {
      fail("Wallet balance limit reached.", 409);
    }

    const { dragon, tiger } = deal();
    const result = settle(bet, side, dragon, tiger);
    const afterDebit = before - bet;
    const after = afterDebit + result.payout;
    const roundCode = crypto.randomUUID();

    const round = {
      roundCode,
      requestId,
      side,
      dragon,
      tiger,
      outcome: result.outcome,
      betAmount: Number(decimal(bet)),
      payoutAmount: Number(decimal(result.payout)),
      netResult: Number(decimal(result.payout)) - Number(decimal(bet)),
      walletBalance: Number(decimal(after)),
      createdAt: new Date().toISOString()
    };

    await connection.execute(
      "INSERT INTO dragon_tiger_rounds " +
      "(round_code,request_id,user_id,bet_side,bet_amount,payout_amount,outcome,result_json) " +
      "VALUES (?,?,?,?,?,?,?,?)",
      [
        roundCode, requestId, userId, side, decimal(bet),
        decimal(result.payout), result.outcome, JSON.stringify(round)
      ]
    );

    const [updated] = await connection.execute(
      "UPDATE users SET wallet_balance = ?, " +
      "turnover_amount = turnover_amount + ? WHERE id = ?",
      [decimal(after), decimal(bet), userId]
    );

    if (updated.affectedRows !== 1) fail("Wallet update failed.", 500);

    await ledger(
      connection, userId, roundCode,
      "game_buy_in", "debit", bet, before, afterDebit
    );

    if (result.payout > 0) {
      await ledger(
        connection, userId, roundCode,
        "game_cash_out", "credit", result.payout, afterDebit, after
      );
    }

    await connection.commit();

    return round;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateSettings(body = {}) {
  if (
    typeof body.isEnabled !== "boolean" ||
    typeof body.maintenanceMode !== "boolean"
  ) {
    fail("Invalid enabled or maintenance value.");
  }

  const min = cents(body.minBet);
  const max = cents(body.maxBet);
  const payout = cents(body.maxPayoutPerRound);

  if (
    min < 2 || min % 2 || max % 2 || max < min ||
    max > 100000000 || payout < min * 12 || payout > 2000000000
  ) {
    fail("Invalid game limits.");
  }

  await pool.execute(
    "UPDATE dragon_tiger_settings SET is_enabled=?,maintenance_mode=?," +
    "min_bet=?,max_bet=?,max_payout_per_round=? WHERE id=1",
    [
      Number(body.isEnabled),
      Number(body.maintenanceMode),
      decimal(min),
      decimal(max),
      decimal(payout)
    ]
  );

  return settings();
}

async function getReport() {
  const [rows] = await pool.execute(
    "SELECT COUNT(*) AS rounds,COALESCE(SUM(bet_amount),0) AS totalBet," +
    "COALESCE(SUM(payout_amount),0) AS totalPayout," +
    "COALESCE(SUM(bet_amount-payout_amount),0) AS adminResult " +
    "FROM dragon_tiger_rounds"
  );

  return rows[0];
}

module.exports = {
  getState,
  getHistory,
  play,
  settings,
  updateSettings,
  getReport,
  deal,
  settle
};