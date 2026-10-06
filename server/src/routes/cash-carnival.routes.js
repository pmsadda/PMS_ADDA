"use strict";

const express = require("express");
const crypto = require("crypto");

const { pool } = require("../config/database");
const { requireAuth } = require("../middleware/auth.middleware");

const router = express.Router();

router.use(requireAuth);

const MIN = 10;
const MAX = 1000;

const NAMES = [
  "RUBY",
  "EMERALD",
  "SAPPHIRE",
  "BELL",
  "CASH",
  "CHEST",
  "COIN",
  "CROWN",
  "WHEEL",
];

const WEIGHTS = [18, 17, 16, 13, 12, 9, 8, 5, 2];

// প্রতিটি symbol-এর 3, 4 এবং 5 match-এর line multiplier।
const PAY = [
  [20, 65, 200],
  [23, 72, 230],
  [26, 80, 260],
  [32, 100, 320],
  [38, 123, 376],
  [46, 145, 460],
  [58, 188, 578],
  [87, 260, 867],
];

const BONUSES = [2, 3, 5, 8, 10, 15, 20, 30];

const rules = () => ({
  minBet: MIN,
  maxBet: MAX,
  names: NAMES,
  weights: WEIGHTS,
  paytable: PAY,
  bonusMultipliers: BONUSES,
  paylines: 5,
});

function fail(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

function cents(value) {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    throw fail("Invalid amount.");
  }

  const v = Math.round(n * 100);

  if (
    !Number.isSafeInteger(v) ||
    Math.abs(n * 100 - v) > 0.00001
  ) {
    throw fail("Amount must have at most two decimal places.");
  }

  return v;
}

function amount(c) {
  return (c / 100).toFixed(2);
}

function symbol() {
  let n = crypto.randomInt(100);

  for (let i = 0; i < WEIGHTS.length; i++) {
    n -= WEIGHTS[i];

    if (n < 0) {
      return i;
    }
  }

  throw new Error("Invalid symbol weights");
}

function evaluate(grid, betCents) {
  let payoutCents = 0;
  const lines = [];

  for (let row = 0; row < 5; row++) {
    const id = grid[row * 5];

    // Wheel শুধু bonus symbol।
    if (id === 8) continue;

    let count = 1;

    while (
      count < 5 &&
      grid[row * 5 + count] === id
    ) {
      count++;
    }

    if (count < 3) continue;

    const multiplier = PAY[id][count - 3];

    // Total bet পাঁচটি horizontal line-এ ভাগ হয়।
    const winCents = Math.floor(
      (betCents * multiplier) / 5
    );

    payoutCents += winCents;

    lines.push({
      row,
      count,
      symbol: id,
      multiplier,
      win: amount(winCents),
    });
  }

  const wheels = grid.filter((id) => id === 8).length;

  const bonusMultiplier =
    wheels >= 3
      ? BONUSES[crypto.randomInt(BONUSES.length)]
      : 0;

  const bonusCents = betCents * bonusMultiplier;

  return {
    lines,
    wheels,
    bonusMultiplier,
    bonusWin: amount(bonusCents),
    payoutCents: payoutCents + bonusCents,
  };
}

function enabled() {
  if (process.env.CASH_CARNIVAL_ENABLED === "false") {
    throw fail("Cash Carnival is currently closed.", 503);
  }
}

router.get("/state", async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      "SELECT wallet_balance FROM users WHERE id=?",
      [req.user.id]
    );

    if (!rows[0]) {
      throw fail("User not found.", 404);
    }

    res.json({
      success: true,
      data: {
        userId: req.user.id,
        walletBalance: rows[0].wallet_balance,
        enabled:
          process.env.CASH_CARNIVAL_ENABLED !== "false",
        rules: rules(),
      },
    });
  } catch (e) {
    next(e);
  }
});

router.get("/history", async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `
        SELECT result_json, created_at
        FROM cash_carnival_spins
        WHERE user_id=?
        ORDER BY id DESC
        LIMIT 20
      `,
      [req.user.id]
    );

    const history = rows.map((row) => ({
      ...(typeof row.result_json === "string"
        ? JSON.parse(row.result_json)
        : row.result_json),
      createdAt: row.created_at,
    }));

    res.json({
      success: true,
      data: { history },
    });
  } catch (e) {
    next(e);
  }
});

router.post("/spin", async (req, res, next) => {
  let db;

  try {
    const requestId = req.body?.requestId;

    if (
      typeof requestId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        requestId
      )
    ) {
      throw fail("Valid requestId is required.");
    }

    if (typeof req.body?.betAmount !== "number") {
      throw fail("Invalid bet.");
    }

    const betCents = cents(req.body.betAmount);

    if (
      betCents < MIN * 100 ||
      betCents > MAX * 100
    ) {
      throw fail("Bet must be between 10 and 1000.");
    }

    db = await pool.getConnection();

    await db.beginTransaction();

    // একই user-এর concurrent wallet update serialize করে।
    const [users] = await db.execute(
      `
        SELECT wallet_balance, account_status
        FROM users
        WHERE id=?
        FOR UPDATE
      `,
      [req.user.id]
    );

    const user = users[0];

    if (!user || user.account_status !== "active") {
      throw fail("Account is inactive.", 403);
    }

    const [existing] = await db.execute(
      `
        SELECT result_json
        FROM cash_carnival_spins
        WHERE user_id=? AND request_id=?
      `,
      [req.user.id, requestId.toLowerCase()]
    );

    // একই request আবার এলে saved result ফেরত দেয়।
    if (existing[0]) {
      const saved =
        typeof existing[0].result_json === "string"
          ? JSON.parse(existing[0].result_json)
          : existing[0].result_json;

      if (cents(saved.betAmount) !== betCents) {
        throw fail(
          "Request ID belongs to another bet.",
          409
        );
      }

      await db.commit();

      return res.json({
        success: true,
        data: saved,
      });
    }

    enabled();

    const before = cents(user.wallet_balance);

    if (before < betCents) {
      throw fail("Insufficient wallet balance.", 409);
    }

    const grid = Array.from(
      { length: 25 },
      symbol
    );

    const outcome = evaluate(grid, betCents);

    const afterDebit = before - betCents;
    const after = afterDebit + outcome.payoutCents;

    if (!Number.isSafeInteger(after)) {
      throw fail("Balance limit exceeded.", 409);
    }

    const spinCode =
      "CC-" +
      crypto.randomBytes(10).toString("hex").toUpperCase();

    const result = {
      requestId: requestId.toLowerCase(),
      spinCode,
      grid,
      betAmount: amount(betCents),
      payoutAmount: amount(outcome.payoutCents),
      walletBalance: amount(after),
      lines: outcome.lines,
      bonusMultiplier: outcome.bonusMultiplier,
      bonusWin: outcome.bonusWin,
    };

    const [inserted] = await db.execute(
      `
        INSERT INTO cash_carnival_spins (
          user_id,
          request_id,
          spin_code,
          bet_amount,
          payout_amount,
          result_json
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        req.user.id,
        requestId.toLowerCase(),
        spinCode,
        amount(betCents),
        result.payoutAmount,
        JSON.stringify(result),
      ]
    );

    await db.execute(
      "UPDATE users SET wallet_balance=? WHERE id=?",
      [amount(after), req.user.id]
    );

    async function ledger(
      type,
      direction,
      total,
      start,
      end,
      suffix
    ) {
      await db.execute(
        `
          INSERT INTO wallet_transactions (
            transaction_id,
            user_id,
            transaction_type,
            direction,
            amount,
            balance_before,
            balance_after,
            status,
            reference_type,
            reference_id,
            description,
            created_by
          )
          VALUES (
            ?, ?, ?, ?, ?, ?, ?,
            'completed',
            'cash_carnival_spin',
            ?, ?,
            NULL
          )
        `,
        [
          "CC" +
            suffix +
            crypto.randomBytes(10).toString("hex"),
          req.user.id,
          type,
          direction,
          amount(total),
          amount(start),
          amount(end),
          String(inserted.insertId),
          "Cash Carnival " + spinCode + " " + direction,
        ]
      );
    }

    await ledger(
      "game_buy_in",
      "debit",
      betCents,
      before,
      afterDebit,
      "B"
    );

    if (outcome.payoutCents > 0) {
      await ledger(
        "game_cash_out",
        "credit",
        outcome.payoutCents,
        afterDebit,
        after,
        "W"
      );
    }

    await db.commit();

    res.json({
      success: true,
      data: result,
    });
  } catch (e) {
    if (db) {
      await db.rollback().catch(() => {});
    }

    next(e);
  } finally {
    if (db) {
      db.release();
    }
  }
});

module.exports = router;