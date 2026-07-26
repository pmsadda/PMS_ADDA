"use strict";

/**
 * Teen Patti Card Engine
 *
 * Card format:
 * {
 *   suit: "S",
 *   rank: "A",
 *   value: 14,
 *   code: "AS"
 * }
 */

const SUITS = Object.freeze([
  "S", // Spades
  "H", // Hearts
  "D", // Diamonds
  "C", // Clubs
]);

const RANKS = Object.freeze([
  { rank: "2", value: 2 },
  { rank: "3", value: 3 },
  { rank: "4", value: 4 },
  { rank: "5", value: 5 },
  { rank: "6", value: 6 },
  { rank: "7", value: 7 },
  { rank: "8", value: 8 },
  { rank: "9", value: 9 },
  { rank: "10", value: 10 },
  { rank: "J", value: 11 },
  { rank: "Q", value: 12 },
  { rank: "K", value: 13 },
  { rank: "A", value: 14 },
]);

const HAND_TYPES = Object.freeze({
  HIGH_CARD: 1,
  PAIR: 2,
  COLOR: 3,
  SEQUENCE: 4,
  PURE_SEQUENCE: 5,
  TRAIL: 6,
});

const HAND_NAMES = Object.freeze({
  [HAND_TYPES.HIGH_CARD]: "High Card",
  [HAND_TYPES.PAIR]: "Pair",
  [HAND_TYPES.COLOR]: "Color",
  [HAND_TYPES.SEQUENCE]: "Sequence",
  [HAND_TYPES.PURE_SEQUENCE]: "Pure Sequence",
  [HAND_TYPES.TRAIL]: "Trail",
});

/**
 * নতুন ৫২টি card-এর deck তৈরি করে।
 */
function createDeck() {
  const deck = [];

  for (const suit of SUITS) {
    for (const rankInfo of RANKS) {
      deck.push({
        suit,
        rank: rankInfo.rank,
        value: rankInfo.value,
        code: `${rankInfo.rank}${suit}`,
      });
    }
  }

  return deck;
}

/**
 * Fisher-Yates algorithm দিয়ে deck shuffle করে।
 * মূল deck পরিবর্তন না করে নতুন array return করে।
 */
function shuffleDeck(deck) {
  if (!Array.isArray(deck)) {
    throw new TypeError("Deck must be an array.");
  }

  const shuffledDeck = deck.map((card) => ({
    ...card,
  }));

  for (
    let currentIndex = shuffledDeck.length - 1;
    currentIndex > 0;
    currentIndex -= 1
  ) {
    const randomIndex = Math.floor(Math.random() * (currentIndex + 1));

    [shuffledDeck[currentIndex], shuffledDeck[randomIndex]] = [
      shuffledDeck[randomIndex],
      shuffledDeck[currentIndex],
    ];
  }

  return shuffledDeck;
}

/**
 * Player list অনুযায়ী প্রত্যেককে ৩টি করে card দেয়।
 *
 * Player format:
 * {
 *   playerType: "real" | "bot",
 *   playerId: 1,
 *   seatNo: 1
 * }
 */
function dealCards(deck, players, cardsPerPlayer = 3) {
  if (!Array.isArray(deck)) {
    throw new TypeError("Deck must be an array.");
  }

  if (!Array.isArray(players)) {
    throw new TypeError("Players must be an array.");
  }

  if (!Number.isInteger(cardsPerPlayer) || cardsPerPlayer <= 0) {
    throw new TypeError("Cards per player must be a positive integer.");
  }

  const requiredCards = players.length * cardsPerPlayer;

  if (deck.length < requiredCards) {
    throw new Error("Not enough cards available in the deck.");
  }

  const dealtPlayers = players.map((player) => ({
    ...player,
    cards: [],
  }));

  let deckIndex = 0;

  /*
   * একবারে একজনকে তিনটি না দিয়ে round-wise card দেওয়া হচ্ছে।
   * এটি বাস্তব card dealing-এর মতো:
   * player 1 → player 2 → player 3 → আবার player 1...
   */
  for (let round = 0; round < cardsPerPlayer; round += 1) {
    for (const player of dealtPlayers) {
      player.cards.push({
        ...deck[deckIndex],
      });

      deckIndex += 1;
    }
  }

  return {
    players: dealtPlayers,
    remainingDeck: deck.slice(deckIndex),
  };
}

/**
 * Card array validate করে।
 */
function validateThreeCards(cards) {
  if (!Array.isArray(cards) || cards.length !== 3) {
    throw new Error("Exactly three cards are required.");
  }

  for (const card of cards) {
    if (
      !card ||
      typeof card !== "object" ||
      !SUITS.includes(card.suit) ||
      !Number.isInteger(Number(card.value))
    ) {
      throw new Error("Invalid card detected.");
    }
  }
}

/**
 * তিনটি card-এর value descending order-এ দেয়।
 */
function getSortedValues(cards) {
  return cards
    .map((card) => Number(card.value))
    .sort((first, second) => second - first);
}

/**
 * Sequence আছে কি না check করে।
 *
 * Supported:
 * A-K-Q
 * K-Q-J
 * ...
 * 4-3-2
 * A-2-3
 *
 * Teen Patti ranking-এ A-K-Q সর্বোচ্চ।
 * A-2-3 দ্বিতীয় সর্বোচ্চ sequence হিসেবে ধরা হয়েছে।
 */
function getSequenceScore(cards) {
  const uniqueValues = [
    ...new Set(cards.map((card) => Number(card.value))),
  ].sort((first, second) => second - first);

  if (uniqueValues.length !== 3) {
    return null;
  }

  const [highest, middle, lowest] = uniqueValues;

  // A-K-Q
  if (highest === 14 && middle === 13 && lowest === 12) {
    return [14, 13, 12];
  }

  // A-2-3
  if (highest === 14 && middle === 3 && lowest === 2) {
    return [13, 3, 2];
  }

  // Normal consecutive sequence
  if (highest - middle === 1 && middle - lowest === 1) {
    return [highest, middle, lowest];
  }

  return null;
}

/**
 * Teen Patti hand evaluate করে।
 *
 * Return:
 * {
 *   type: 6,
 *   name: "Trail",
 *   score: [14],
 *   cards: [...]
 * }
 */
function evaluateHand(cards) {
  validateThreeCards(cards);

  const normalizedCards = cards.map((card) => ({
    suit: card.suit,
    rank: card.rank,
    value: Number(card.value),
    code: card.code || `${card.rank}${card.suit}`,
  }));

  const sortedValues = getSortedValues(normalizedCards);

  const sameSuit = normalizedCards.every(
    (card) => card.suit === normalizedCards[0].suit,
  );

  const sequenceScore = getSequenceScore(normalizedCards);

  const valueCounts = new Map();

  for (const value of sortedValues) {
    valueCounts.set(value, (valueCounts.get(value) || 0) + 1);
  }

  const groupedValues = Array.from(valueCounts.entries()).sort(
    (first, second) => {
      const countDifference = second[1] - first[1];

      if (countDifference !== 0) {
        return countDifference;
      }

      return second[0] - first[0];
    },
  );

  // Trail / Three of a kind
  if (groupedValues.length === 1 && groupedValues[0][1] === 3) {
    return {
      type: HAND_TYPES.TRAIL,
      name: HAND_NAMES[HAND_TYPES.TRAIL],
      score: [groupedValues[0][0]],
      cards: normalizedCards,
    };
  }

  // Pure Sequence
  if (sameSuit && sequenceScore) {
    return {
      type: HAND_TYPES.PURE_SEQUENCE,
      name: HAND_NAMES[HAND_TYPES.PURE_SEQUENCE],
      score: sequenceScore,
      cards: normalizedCards,
    };
  }

  // Sequence
  if (sequenceScore) {
    return {
      type: HAND_TYPES.SEQUENCE,
      name: HAND_NAMES[HAND_TYPES.SEQUENCE],
      score: sequenceScore,
      cards: normalizedCards,
    };
  }

  // Color / Flush
  if (sameSuit) {
    return {
      type: HAND_TYPES.COLOR,
      name: HAND_NAMES[HAND_TYPES.COLOR],
      score: sortedValues,
      cards: normalizedCards,
    };
  }

  // Pair
  const pairEntry = groupedValues.find(([, count]) => count === 2);

  if (pairEntry) {
    const pairValue = pairEntry[0];

    const kickerValue = groupedValues.find(([, count]) => count === 1)?.[0];

    return {
      type: HAND_TYPES.PAIR,
      name: HAND_NAMES[HAND_TYPES.PAIR],
      score: [pairValue, Number(kickerValue || 0)],
      cards: normalizedCards,
    };
  }

  // High Card
  return {
    type: HAND_TYPES.HIGH_CARD,
    name: HAND_NAMES[HAND_TYPES.HIGH_CARD],
    score: sortedValues,
    cards: normalizedCards,
  };
}

/**
 * দুইটি score array compare করে।
 *
 * Return:
 *  1 = first hand winner
 * -1 = second hand winner
 *  0 = tie
 */
function compareScores(firstScore, secondScore) {
  const maxLength = Math.max(firstScore.length, secondScore.length);

  for (let index = 0; index < maxLength; index += 1) {
    const firstValue = Number(firstScore[index] || 0);

    const secondValue = Number(secondScore[index] || 0);

    if (firstValue > secondValue) {
      return 1;
    }

    if (firstValue < secondValue) {
      return -1;
    }
  }

  return 0;
}

/**
 * দুইটি Teen Patti hand compare করে।
 *
 * Return:
 * {
 *   result: 1 | -1 | 0,
 *   winner: "first" | "second" | "tie",
 *   firstHand: {...},
 *   secondHand: {...}
 * }
 */
function compareHands(firstCards, secondCards) {
  const firstHand = evaluateHand(firstCards);
  const secondHand = evaluateHand(secondCards);

  let result = 0;

  if (firstHand.type > secondHand.type) {
    result = 1;
  } else if (firstHand.type < secondHand.type) {
    result = -1;
  } else {
    result = compareScores(firstHand.score, secondHand.score);
  }

  return {
    result,
    winner: result === 1 ? "first" : result === -1 ? "second" : "tie",
    firstHand,
    secondHand,
  };
}

/**
 * একাধিক active player-এর মধ্যে winner বের করে।
 *
 * Player format:
 * {
 *   playerType: "real" | "bot",
 *   playerId: 1,
 *   seatNo: 1,
 *   cards: [...]
 * }
 */
function findWinner(players) {
  if (!Array.isArray(players) || players.length === 0) {
    throw new Error("At least one player is required.");
  }

  const evaluatedPlayers = players.map((player) => ({
    ...player,
    hand: evaluateHand(player.cards),
  }));

  let winners = [evaluatedPlayers[0]];

  for (let index = 1; index < evaluatedPlayers.length; index += 1) {
    const challenger = evaluatedPlayers[index];

    const currentWinner = winners[0];

    let comparison = 0;

    if (challenger.hand.type > currentWinner.hand.type) {
      comparison = 1;
    } else if (challenger.hand.type < currentWinner.hand.type) {
      comparison = -1;
    } else {
      comparison = compareScores(
        challenger.hand.score,
        currentWinner.hand.score,
      );
    }

    if (comparison === 1) {
      winners = [challenger];
    } else if (comparison === 0) {
      winners.push(challenger);
    }
  }

  return {
    winners,
    isTie: winners.length > 1,
    evaluatedPlayers,
  };
}

/**
 * Database-এ save করার জন্য card JSON string বানায়।
 */
function serializeCards(cards) {
  if (!Array.isArray(cards)) {
    throw new TypeError("Cards must be an array.");
  }

  return JSON.stringify(cards);
}

/**
 * Database থেকে পাওয়া cards parse করে।
 */
function deserializeCards(cardsValue) {
  if (!cardsValue) {
    return [];
  }

  if (Array.isArray(cardsValue)) {
    return cardsValue;
  }

  if (Buffer.isBuffer(cardsValue)) {
    cardsValue = cardsValue.toString("utf8");
  }

  if (typeof cardsValue !== "string") {
    throw new TypeError("Stored cards must be a JSON string.");
  }

  try {
    const parsedCards = JSON.parse(cardsValue);

    if (!Array.isArray(parsedCards)) {
      return [];
    }

    return parsedCards;
  } catch (error) {
    throw new Error("Failed to parse stored cards.");
  }
}

module.exports = {
  SUITS,
  RANKS,
  HAND_TYPES,
  HAND_NAMES,

  createDeck,
  shuffleDeck,
  dealCards,

  evaluateHand,
  compareHands,
  findWinner,

  serializeCards,
  deserializeCards,
};
