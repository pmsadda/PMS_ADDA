"use strict";

const crypto = require("crypto");
const { pool } = require("../config/database");

const MIN_BET_CENTS = 1000;
const MAX_BET_CENTS = 1000000;

function gameError(message, statusCode = 400, code = "BLACKJACK_ERROR") {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function parseBetCents(value) {
  const number = Number(value);
  const cents = Math.round(number * 100);

  if (
    !Number.isFinite(number) ||
    !Number.isSafeInteger(cents) ||
    Math.abs(number * 100 - cents) > 0.000001 ||
    cents < MIN_BET_CENTS ||
    cents > MAX_BET_CENTS
  ) {
    throw gameError("Bet must be between ৳10.00 and ৳10,000.00.");
  }

  return cents;
}

function toMoney(cents) {
  return (cents / 100).toFixed(2);
}

function moneyToCents(value) {
  return Math.round(Number(value) * 100);
}

function parseJson(value) {
  return typeof value === "string" ? JSON.parse(value) : value;
}

function validateRequestId(value) {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f-]{27,28}$/i.test(value)
  ) {
    throw gameError("Valid requestId is required.");
  }

  return value;
}

function createId(prefix) {
  return `${prefix}-${crypto.randomUUID()
    .replace(/-/g, "")
    .slice(0, 24)}`;
}

function createDeck() {
  const deck = [];

  for (const suit of ["♠", "♥", "♦", "♣"]) {
    for (const rank of [
      "A", "2", "3", "4", "5", "6", "7",
      "8", "9", "10", "J", "Q", "K",
    ]) {
      deck.push({ rank, suit });
    }
  }

  for (let index = deck.length - 1; index > 0; index--) {
    const randomIndex = crypto.randomInt(index + 1);

    [deck[index], deck[randomIndex]] = [
      deck[randomIndex],
      deck[index],
    ];
  }

  return deck;
}

function handScore(cards) {
  let points = 0;
  let aces = 0;

  for (const card of cards) {
    if (card.rank === "A") {
      points += 11;
      aces += 1;
    } else if (["J", "Q", "K"].includes(card.rank)) {
      points += 10;
    } else {
      points += Number(card.rank);
    }
  }

  while (points > 21 && aces > 0) {
    points -= 10;
    aces -= 1;
  }

  return points;
}

function publicHand(row) {
  const playerCards = parseJson(row.player_cards);
  const dealerCards = parseJson(row.dealer_cards);
  const playing = row.hand_status === "playing";

  return {
    id: Number(row.id),
    handCode: row.hand_code,
    status: row.hand_status,
    outcome: row.outcome,
    betAmount: Number(row.bet_amount),
    payoutAmount: Number(row.payout_amount),
    playerCards,
    playerScore: handScore(playerCards),
    dealerCards: playing
      ? [dealerCards[0], { rank: "?", suit: "" }]
      : dealerCards,
    dealerScore: playing ? null : handScore(dealerCards),
    createdAt: row.created_at,
  };
}

async function lockUser(connection, userId) {
  const [rows] = await connection.execute(
    `SELECT id, wallet_balance, account_status
     FROM users
     WHERE id = ?
     LIMIT 1
     FOR UPDATE`,
    [userId],
  );

  const user = rows[0];

  if (!user) {
    throw gameError("User not found.", 404);
  }

  if (String(user.account_status).toLowerCase() !== "active") {
    throw gameError("Account is not active.", 403);
  }

  return {
    id: Number(user.id),
    balanceCents: moneyToCents(user.wallet_balance),
  };
}

async function recordWalletTransaction(
  connection,
  {
    userId,
    handId,
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
      'blackjack_hand', ?, ?
    )`,
    [
      createId(debit ? "BJB" : "BJW"),
      userId,
      debit ? "game_buy_in" : "game_cash_out",
      direction,
      toMoney(amountCents),
      toMoney(beforeCents),
      toMoney(afterCents),
      String(handId),
      debit ? "Blackjack bet" : "Blackjack payout",
    ],
  );
}

async function getHandRow(connection, userId, handId) {
  const [rows] = await connection.execute(
    `SELECT *
     FROM blackjack_hands
     WHERE id = ? AND user_id = ?
     LIMIT 1
     FOR UPDATE`,
    [handId, userId],
  );

  if (!rows[0]) {
    throw gameError("Hand not found.", 404);
  }

  return rows[0];
}

async function settleHand(
  connection,
  hand,
  {
    playerCards,
    dealerCards,
    deck,
    outcome,
    payoutCents,
    currentBalanceCents,
    actionId = null,
  },
) {
  await connection.execute(
    `UPDATE blackjack_hands
     SET hand_status = 'completed',
         outcome = ?,
         payout_amount = ?,
         player_cards = ?,
         dealer_cards = ?,
         remaining_deck = ?,
         last_action_id = ?
     WHERE id = ? AND hand_status = 'playing'`,
    [
      outcome,
      toMoney(payoutCents),
      JSON.stringify(playerCards),
      JSON.stringify(dealerCards),
      JSON.stringify(deck),
      actionId,
      hand.id,
    ],
  );

  if (payoutCents > 0) {
    const nextBalance = currentBalanceCents + payoutCents;

    await connection.execute(
      "UPDATE users SET wallet_balance = ? WHERE id = ?",
      [toMoney(nextBalance), hand.user_id],
    );

    await recordWalletTransaction(connection, {
      userId: Number(hand.user_id),
      handId: Number(hand.id),
      direction: "credit",
      amountCents: payoutCents,
      beforeCents: currentBalanceCents,
      afterCents: nextBalance,
    });
  }
}

async function runTransaction(work) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const result = await work(connection);

    await connection.commit();

    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function getBlackjackState({ userId }) {
  const id = Number(userId);

  const [users] = await pool.execute(
    "SELECT wallet_balance FROM users WHERE id = ? LIMIT 1",
    [id],
  );

  if (!users[0]) {
    throw gameError("User not found.", 404);
  }

  const [hands] = await pool.execute(
    `SELECT *
     FROM blackjack_hands
     WHERE user_id = ?
     ORDER BY id DESC
     LIMIT 1`,
    [id],
  );

  return {
    walletBalance: Number(users[0].wallet_balance),
    hand: hands[0] ? publicHand(hands[0]) : null,
  };
}

async function startBlackjackHand({ userId, betAmount, requestId }) {
  const id = Number(userId);
  const validRequestId = validateRequestId(requestId);
  const betCents = parseBetCents(betAmount);

  return runTransaction(async (connection) => {
    const user = await lockUser(connection, id);

    const [previous] = await connection.execute(
      `SELECT *
       FROM blackjack_hands
       WHERE user_id = ? AND request_id = ?
       LIMIT 1`,
      [id, validRequestId],
    );

    if (previous[0]) {
      return {
        walletBalance: toMoney(user.balanceCents),
        hand: publicHand(previous[0]),
      };
    }

    const [active] = await connection.execute(
      `SELECT id
       FROM blackjack_hands
       WHERE user_id = ? AND hand_status = 'playing'
       LIMIT 1`,
      [id],
    );

    if (active[0]) {
      throw gameError(
        "Finish your current hand first.",
        409,
        "BLACKJACK_HAND_ACTIVE",
      );
    }

    if (user.balanceCents < betCents) {
      throw gameError(
        "Insufficient wallet balance.",
        409,
        "BLACKJACK_INSUFFICIENT_BALANCE",
      );
    }

    const deck = createDeck();

    const playerCards = [deck.pop(), deck.pop()];
    const dealerCards = [deck.pop(), deck.pop()];

    const [created] = await connection.execute(
      `INSERT INTO blackjack_hands (
        hand_code,
        request_id,
        user_id,
        bet_amount,
        player_cards,
        dealer_cards,
        remaining_deck
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        createId("BJH"),
        validRequestId,
        id,
        toMoney(betCents),
        JSON.stringify(playerCards),
        JSON.stringify(dealerCards),
        JSON.stringify(deck),
      ],
    );

    const handId = Number(created.insertId);
    const balanceAfterBet = user.balanceCents - betCents;

    await connection.execute(
      "UPDATE users SET wallet_balance = ? WHERE id = ?",
      [toMoney(balanceAfterBet), id],
    );

    await recordWalletTransaction(connection, {
      userId: id,
      handId,
      direction: "debit",
      amountCents: betCents,
      beforeCents: user.balanceCents,
      afterCents: balanceAfterBet,
    });

    const playerNatural = handScore(playerCards) === 21;
    const dealerNatural = handScore(dealerCards) === 21;

    let payoutCents = 0;

    if (playerNatural || dealerNatural) {
      let outcome;

      if (playerNatural && dealerNatural) {
        outcome = "push";
        payoutCents = betCents;
      } else if (playerNatural) {
        outcome = "blackjack";
        payoutCents = Math.round(betCents * 2.5);
      } else {
        outcome = "dealer_blackjack";
      }

      await settleHand(
        connection,
        { id: handId, user_id: id },
        {
          playerCards,
          dealerCards,
          deck,
          outcome,
          payoutCents,
          currentBalanceCents: balanceAfterBet,
        },
      );
    }

    const hand = await getHandRow(connection, id, handId);

    return {
      walletBalance: toMoney(balanceAfterBet + payoutCents),
      hand: publicHand(hand),
    };
  });
}

async function playBlackjackAction({
  userId,
  handId,
  action,
  actionId,
}) {
  const id = Number(userId);
  const requestedHandId = Number(handId);
  const validActionId = validateRequestId(actionId);

  if (!Number.isSafeInteger(requestedHandId) || requestedHandId < 1) {
    throw gameError("Valid handId is required.");
  }

  if (!["hit", "stand"].includes(action)) {
    throw gameError("Action must be hit or stand.");
  }

  return runTransaction(async (connection) => {
    const user = await lockUser(connection, id);

    const hand = await getHandRow(connection, id, requestedHandId);

    if (hand.last_action_id === validActionId) {
      return {
        walletBalance: toMoney(user.balanceCents),
        hand: publicHand(hand),
      };
    }

    if (hand.hand_status !== "playing") {
      throw gameError(
        "This hand is already completed.",
        409,
        "BLACKJACK_HAND_COMPLETED",
      );
    }

    const playerCards = parseJson(hand.player_cards);
    const dealerCards = parseJson(hand.dealer_cards);
    const deck = parseJson(hand.remaining_deck);
    const betCents = moneyToCents(hand.bet_amount);

    if (action === "hit") {
      playerCards.push(deck.pop());

      if (handScore(playerCards) > 21) {
        await settleHand(connection, hand, {
          playerCards,
          dealerCards,
          deck,
          outcome: "bust",
          payoutCents: 0,
          currentBalanceCents: user.balanceCents,
          actionId: validActionId,
        });
      } else if (handScore(playerCards) < 21) {
        await connection.execute(
          `UPDATE blackjack_hands
           SET player_cards = ?,
               remaining_deck = ?,
               last_action_id = ?
           WHERE id = ?`,
          [
            JSON.stringify(playerCards),
            JSON.stringify(deck),
            validActionId,
            requestedHandId,
          ],
        );
      }
    }

    const playerHas21 = handScore(playerCards) === 21;

    if (action === "stand" || (action === "hit" && playerHas21)) {
      while (handScore(dealerCards) < 17) {
        dealerCards.push(deck.pop());
      }

      const playerPoints = handScore(playerCards);
      const dealerPoints = handScore(dealerCards);

      let outcome;
      let payoutCents = 0;

      if (dealerPoints > 21 || playerPoints > dealerPoints) {
        outcome = "win";
        payoutCents = betCents * 2;
      } else if (playerPoints === dealerPoints) {
        outcome = "push";
        payoutCents = betCents;
      } else {
        outcome = "lose";
      }

      await settleHand(connection, hand, {
        playerCards,
        dealerCards,
        deck,
        outcome,
        payoutCents,
        currentBalanceCents: user.balanceCents,
        actionId: validActionId,
      });
    }

    const updated = await getHandRow(connection, id, requestedHandId);

    return {
      walletBalance: toMoney(
        user.balanceCents + moneyToCents(updated.payout_amount)
      ),
      hand: publicHand(updated),
    };
  });
}

module.exports = {
  getBlackjackState,
  startBlackjackHand,
  playBlackjackAction,
};