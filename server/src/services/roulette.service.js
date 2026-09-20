"use strict";

const crypto = require("crypto");
const { pool } = require("../config/database");

const RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18,
  19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

function rouletteError(message, statusCode = 400, code = "ROULETTE_ERROR") {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function centsFromBet(value) {
  const amount = Number(value);
  const cents = Math.round(amount * 100);

  if (
    !Number.isFinite(amount) ||
    !Number.isSafeInteger(cents) ||
    Math.abs(amount * 100 - cents) > 0.000001 ||
    cents < 1000 ||
    cents > 1000000
  ) {
    throw rouletteError("Bet must be between ৳10.00 and ৳10,000.00.");
  }

  return cents;
}

function money(cents) {
  return (cents / 100).toFixed(2);
}

function makeId(prefix) {
  return `${prefix}-${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

function validateRequestId(value) {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f-]{27,28}$/i.test(value)
  ) {
    throw rouletteError("Valid requestId is required.");
  }

  return value;
}

function validateSelection(type, selectedNumber) {
  if (!["red", "black", "even", "odd", "number"].includes(type)) {
    throw rouletteError("Choose a valid Roulette selection.");
  }

  if (type !== "number") {
    return null;
  }

  const number = Number(selectedNumber);

  if (
    selectedNumber === "" ||
    selectedNumber === null ||
    selectedNumber === undefined ||
    !Number.isInteger(number) ||
    number < 0 ||
    number > 36
  ) {
    throw rouletteError("Select a whole number from 0 to 36.");
  }

  return number;
}

function spinColor(number) {
  if (number === 0) return "green";
  return RED_NUMBERS.has(number) ? "red" : "black";
}

function isWinningBet(type, selectedNumber, number, color) {
  if (type === "number") return selectedNumber === number;
  if (type === "red" || type === "black") return type === color;

  if (number === 0) return false;

  return type === "even"
    ? number % 2 === 0
    : number % 2 === 1;
}

function publicSpin(row) {
  return {
    id: Number(row.id),
    spinCode: row.spin_code,
    betAmount: Number(row.bet_amount),
    selectionType: row.selection_type,
    selectedNumber:
      row.selected_number === null
        ? null
        : Number(row.selected_number),
    resultNumber: Number(row.result_number),
    resultColor: row.result_color,
    payoutAmount: Number(row.payout_amount),
    resultStatus: row.result_status,
    balanceBefore: Number(row.balance_before),
    balanceAfter: Number(row.balance_after),
    createdAt: row.created_at,
  };
}

async function saveWalletEntry(
  connection,
  {
    userId,
    spinId,
    direction,
    amountCents,
    beforeCents,
    afterCents,
  },
) {
  const debit = direction === "debit";

  await connection.execute(
    `INSERT INTO wallet_transactions (
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
      description
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, 'completed',
      'roulette_spin', ?, ?
    )`,
    [
      makeId(debit ? "RLB" : "RLW"),
      userId,
      debit ? "game_buy_in" : "game_cash_out",
      direction,
      money(amountCents),
      money(beforeCents),
      money(afterCents),
      String(spinId),
      debit ? "Roulette bet" : "Roulette payout",
    ],
  );
}

async function spinRoulette({
  userId,
  betAmount,
  selectionType,
  selectedNumber,
  requestId,
}) {
  const id = Number(userId);
  const betCents = centsFromBet(betAmount);
  const request = validateRequestId(requestId);
  const type = String(selectionType || "").toLowerCase();
  const numberChoice = validateSelection(type, selectedNumber);

  if (type === "number" && betCents * 36 > 10000000) {
    throw rouletteError(
      "Number bet would exceed the ৳100,000 maximum payout."
    );
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [users] = await connection.execute(
      `SELECT id, wallet_balance, account_status
       FROM users
       WHERE id = ?
       LIMIT 1
       FOR UPDATE`,
      [id],
    );

    const user = users[0];

    if (!user) {
      throw rouletteError("User not found.", 404);
    }

    if (String(user.account_status).toLowerCase() !== "active") {
      throw rouletteError("Account is not active.", 403);
    }

    const [previous] = await connection.execute(
      `SELECT *
       FROM roulette_spins
       WHERE user_id = ? AND request_id = ?
       LIMIT 1`,
      [id, request],
    );

    if (previous[0]) {
      await connection.commit();

      return {
        walletBalance: Number(user.wallet_balance),
        spin: publicSpin(previous[0]),
      };
    }

    const balanceBeforeCents = Math.round(
      Number(user.wallet_balance) * 100
    );

    if (balanceBeforeCents < betCents) {
      throw rouletteError(
        "Insufficient wallet balance.",
        409,
        "ROULETTE_INSUFFICIENT_BALANCE"
      );
    }

    const resultNumber = crypto.randomInt(37);
    const resultColor = spinColor(resultNumber);

    const won = isWinningBet(
      type,
      numberChoice,
      resultNumber,
      resultColor
    );

    const payoutCents = won
      ? betCents * (type === "number" ? 36 : 2)
      : 0;

    const balanceAfterBet = balanceBeforeCents - betCents;
    const balanceAfterPayout = balanceAfterBet + payoutCents;

    const [created] = await connection.execute(
      `INSERT INTO roulette_spins (
        spin_code,
        request_id,
        user_id,
        bet_amount,
        selection_type,
        selected_number,
        result_number,
        result_color,
        payout_amount,
        result_status,
        balance_before,
        balance_after
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        makeId("RLS"),
        request,
        id,
        money(betCents),
        type,
        numberChoice,
        resultNumber,
        resultColor,
        money(payoutCents),
        won ? "won" : "lost",
        money(balanceBeforeCents),
        money(balanceAfterPayout),
      ],
    );

    const spinId = Number(created.insertId);

    await connection.execute(
      "UPDATE users SET wallet_balance = ? WHERE id = ?",
      [money(balanceAfterPayout), id],
    );

    await saveWalletEntry(connection, {
      userId: id,
      spinId,
      direction: "debit",
      amountCents: betCents,
      beforeCents: balanceBeforeCents,
      afterCents: balanceAfterBet,
    });

    if (payoutCents > 0) {
      await saveWalletEntry(connection, {
        userId: id,
        spinId,
        direction: "credit",
        amountCents: payoutCents,
        beforeCents: balanceAfterBet,
        afterCents: balanceAfterPayout,
      });
    }

    const [rows] = await connection.execute(
      "SELECT * FROM roulette_spins WHERE id = ? LIMIT 1",
      [spinId],
    );

    await connection.commit();

    return {
      walletBalance: Number(money(balanceAfterPayout)),
      spin: publicSpin(rows[0]),
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function getRouletteState({ userId }) {
  const id = Number(userId);

  const [users] = await pool.execute(
    "SELECT wallet_balance FROM users WHERE id = ? LIMIT 1",
    [id],
  );

  if (!users[0]) {
    throw rouletteError("User not found.", 404);
  }

  const [spins] = await pool.execute(
    `SELECT *
     FROM roulette_spins
     WHERE user_id = ?
     ORDER BY id DESC
     LIMIT 10`,
    [id],
  );

  return {
    walletBalance: Number(users[0].wallet_balance),
    recentSpins: spins.map(publicSpin),
  };
}

module.exports = {
  spinRoulette,
  getRouletteState,
};