"use strict";

const crypto = require("crypto");

/* =========================================================
   CONSTANTS
========================================================= */

const SUITS = Object.freeze([
  "S",
  "H",
  "D",
  "C",
]);

const RANKS = Object.freeze([
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
  "A",
]);

const RANK_VALUES = Object.freeze({
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  "10": 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
});

const HAND_CATEGORY = Object.freeze({
  HIGH_CARD: 1,
  PAIR: 2,
  COLOR: 3,
  SEQUENCE: 4,
  PURE_SEQUENCE: 5,
  TRAIL: 6,
});

const HAND_NAMES = Object.freeze({
  [HAND_CATEGORY.HIGH_CARD]: "High Card",
  [HAND_CATEGORY.PAIR]: "Pair",
  [HAND_CATEGORY.COLOR]: "Color",
  [HAND_CATEGORY.SEQUENCE]: "Sequence",
  [HAND_CATEGORY.PURE_SEQUENCE]:
    "Pure Sequence",
  [HAND_CATEGORY.TRAIL]: "Trail",
});

/* =========================================================
   CARD HELPERS
========================================================= */

function createCard(suit, rank) {
  const normalizedSuit = String(suit)
    .trim()
    .toUpperCase();

  const normalizedRank = String(rank)
    .trim()
    .toUpperCase();

  if (!SUITS.includes(normalizedSuit)) {
    throw new Error(
      `Invalid Teen Patti suit: ${suit}`,
    );
  }

  if (!RANKS.includes(normalizedRank)) {
    throw new Error(
      `Invalid Teen Patti rank: ${rank}`,
    );
  }

  return Object.freeze({
    suit: normalizedSuit,
    rank: normalizedRank,
    value: RANK_VALUES[normalizedRank],

    /*
     * Server card code:
     * JS, 10H, AC
     */
    code: `${normalizedRank}${normalizedSuit}`,
  });
}

function createDeck() {
  const deck = [];

  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push(createCard(suit, rank));
    }
  }

  return deck;
}

/* =========================================================
   SECURE SHUFFLE
========================================================= */

function secureShuffle(cards) {
  if (!Array.isArray(cards)) {
    throw new TypeError(
      "Cards must be an array.",
    );
  }

  const shuffled = cards.map((card) => ({
    ...card,
  }));

  /*
   * Fisher–Yates with crypto.randomInt.
   * Math.random ব্যবহার করা হচ্ছে না।
   */
  for (
    let index = shuffled.length - 1;
    index > 0;
    index -= 1
  ) {
    const randomIndex = crypto.randomInt(
      0,
      index + 1,
    );

    [
      shuffled[index],
      shuffled[randomIndex],
    ] = [
      shuffled[randomIndex],
      shuffled[index],
    ];
  }

  return shuffled;
}

/* =========================================================
   DEAL CARDS
========================================================= */

function dealCards(playerCount) {
  const totalPlayers = Number(playerCount);

  if (
    !Number.isInteger(totalPlayers) ||
    totalPlayers < 2 ||
    totalPlayers > 5
  ) {
    throw new Error(
      "Teen Patti requires 2 to 5 players.",
    );
  }

  const deck = secureShuffle(createDeck());

  const hands = Array.from(
    {
      length: totalPlayers,
    },
    () => [],
  );

  /*
   * Round-robin distribution:
   * প্রত্যেক player একবারে একটি card পাবে।
   */
  for (
    let cardRound = 0;
    cardRound < 3;
    cardRound += 1
  ) {
    for (
      let playerIndex = 0;
      playerIndex < totalPlayers;
      playerIndex += 1
    ) {
      const card = deck.pop();

      if (!card) {
        throw new Error(
          "Teen Patti deck unexpectedly ended.",
        );
      }

      hands[playerIndex].push(card);
    }
  }

  return {
    hands,
    remainingDeck: deck,
  };
}

/* =========================================================
   CARD VALIDATION
========================================================= */

function normalizeCards(cards) {
  if (
    !Array.isArray(cards) ||
    cards.length !== 3
  ) {
    throw new Error(
      "A Teen Patti hand must contain 3 cards.",
    );
  }

  const normalizedCards = cards.map((card) =>
    createCard(card?.suit, card?.rank),
  );

  const uniqueCodes = new Set(
    normalizedCards.map((card) => card.code),
  );

  if (uniqueCodes.size !== 3) {
    throw new Error(
      "Duplicate cards detected in hand.",
    );
  }

  return normalizedCards;
}

/* =========================================================
   SEQUENCE RANK
========================================================= */

function getSequenceScore(values) {
  const ascending = [...values].sort(
    (first, second) => first - second,
  );

  const key = ascending.join(",");

  /*
   * Standard Teen Patti sequence order:
   *
   * A-K-Q highest
   * A-2-3 second highest
   * K-Q-J next
   */
  if (key === "12,13,14") {
    return 14;
  }

  if (key === "2,3,14") {
    return 13;
  }

  const isNormalSequence =
    ascending[1] === ascending[0] + 1 &&
    ascending[2] === ascending[1] + 1;

  if (!isNormalSequence) {
    return null;
  }

  /*
   * K-Q-J → 12
   * Q-J-10 → 11
   * 4-3-2 → 3
   */
  return ascending[2] - 1;
}

/* =========================================================
   RANK VALUE ENCODING
========================================================= */

function encodeRankValue(category, tieBreakers) {
  const normalizedTieBreakers = [
    ...tieBreakers,
  ].slice(0, 3);

  while (normalizedTieBreakers.length < 3) {
    normalizedTieBreakers.push(0);
  }

  let encoded = Number(category);

  for (const value of normalizedTieBreakers) {
    encoded =
      encoded * 15 +
      Number(value || 0);
  }

  return encoded;
}

/* =========================================================
   HAND EVALUATION
========================================================= */

function evaluateHand(cards) {
  const normalizedCards =
    normalizeCards(cards);

  const values = normalizedCards
    .map((card) => card.value)
    .sort((first, second) => second - first);

  const suits = normalizedCards.map(
    (card) => card.suit,
  );

  const uniqueValues = new Set(values);

  const isTrail = uniqueValues.size === 1;

  const isColor =
    new Set(suits).size === 1;

  const sequenceScore =
    getSequenceScore(values);

  const isSequence =
    sequenceScore !== null;

  let category;
  let tieBreakers;

  if (isTrail) {
    category = HAND_CATEGORY.TRAIL;
    tieBreakers = [values[0]];
  } else if (isColor && isSequence) {
    category =
      HAND_CATEGORY.PURE_SEQUENCE;

    tieBreakers = [sequenceScore];
  } else if (isSequence) {
    category = HAND_CATEGORY.SEQUENCE;
    tieBreakers = [sequenceScore];
  } else {
    const frequency = new Map();

    for (const value of values) {
      frequency.set(
        value,
        (frequency.get(value) || 0) + 1,
      );
    }

    const pairEntry = [
      ...frequency.entries(),
    ].find(([, count]) => count === 2);

    if (isColor) {
      category = HAND_CATEGORY.COLOR;
      tieBreakers = values;
    } else if (pairEntry) {
      const pairValue = pairEntry[0];

      const kicker = values.find(
        (value) => value !== pairValue,
      );

      category = HAND_CATEGORY.PAIR;
      tieBreakers = [
        pairValue,
        kicker || 0,
      ];
    } else {
      category =
        HAND_CATEGORY.HIGH_CARD;

      tieBreakers = values;
    }
  }

  return Object.freeze({
    category,
    rankName: HAND_NAMES[category],
    tieBreakers: Object.freeze(
      [...tieBreakers],
    ),
    rankValue: encodeRankValue(
      category,
      tieBreakers,
    ),
    cards: Object.freeze(
      normalizedCards.map((card) =>
        Object.freeze({
          ...card,
        }),
      ),
    ),
  });
}

/* =========================================================
   HAND COMPARISON
========================================================= */

function compareHands(firstCards, secondCards) {
  const first = evaluateHand(firstCards);
  const second = evaluateHand(secondCards);

  if (first.category !== second.category) {
    return first.category > second.category
      ? 1
      : -1;
  }

  const maxLength = Math.max(
    first.tieBreakers.length,
    second.tieBreakers.length,
  );

  for (
    let index = 0;
    index < maxLength;
    index += 1
  ) {
    const firstValue =
      first.tieBreakers[index] || 0;

    const secondValue =
      second.tieBreakers[index] || 0;

    if (firstValue > secondValue) {
      return 1;
    }

    if (firstValue < secondValue) {
      return -1;
    }
  }

  /*
   * Teen Patti-তে suit দিয়ে tie break হবে না।
   */
  return 0;
}

/* =========================================================
   MULTIPLE PLAYER WINNERS
========================================================= */

function findWinningHands(playerHands) {
  if (
    !Array.isArray(playerHands) ||
    playerHands.length === 0
  ) {
    throw new Error(
      "Player hands are required.",
    );
  }

  const evaluated = playerHands.map(
    (entry) => {
      if (
        !entry ||
        !Number.isInteger(
          Number(entry.handPlayerId),
        )
      ) {
        throw new Error(
          "Valid hand player ID is required.",
        );
      }

      return {
        handPlayerId: Number(
          entry.handPlayerId,
        ),

        evaluation: evaluateHand(
          entry.cards,
        ),
      };
    },
  );

  let winners = [evaluated[0]];

  for (
    let index = 1;
    index < evaluated.length;
    index += 1
  ) {
    const candidate = evaluated[index];

    const comparison = compareHands(
      candidate.evaluation.cards,
      winners[0].evaluation.cards,
    );

    if (comparison > 0) {
      winners = [candidate];
    } else if (comparison === 0) {
      winners.push(candidate);
    }
  }

  return winners;
}

/* =========================================================
   DATABASE SERIALIZATION
========================================================= */

function serializeCards(cards) {
  const normalizedCards =
    normalizeCards(cards);

  return JSON.stringify(normalizedCards);
}

function deserializeCards(value) {
  if (value === null || value === undefined) {
    return [];
  }

  if (Array.isArray(value)) {
    return normalizeCards(value);
  }

  if (typeof value !== "string") {
    throw new Error(
      "Invalid serialized cards.",
    );
  }

  const parsed = JSON.parse(value);

  return normalizeCards(parsed);
}

/* =========================================================
   EXPORTS
========================================================= */

module.exports = Object.freeze({
  SUITS,
  RANKS,
  RANK_VALUES,
  HAND_CATEGORY,
  HAND_NAMES,

  createCard,
  createDeck,
  secureShuffle,
  dealCards,

  normalizeCards,
  evaluateHand,
  compareHands,
  findWinningHands,

  serializeCards,
  deserializeCards,
});