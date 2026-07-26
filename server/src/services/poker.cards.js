"use strict";

const crypto =
  require("crypto");

const SUITS =
  Object.freeze([
    "S",
    "H",
    "D",
    "C",
  ]);

const RANKS =
  Object.freeze([
    "A",
    "K",
    "Q",
    "J",
    "10",
    "9",
    "8",
    "7",
    "6",
    "5",
    "4",
    "3",
    "2",
  ]);

function createDeck() {
  const deck = [];

  for (
    const suit of SUITS
  ) {
    for (
      const rank of RANKS
    ) {
      deck.push(
        `${suit}${rank}`,
      );
    }
  }

  return deck;
}

function shuffleDeck(deck) {
  const shuffled =
    [...deck];

  for (
    let index =
      shuffled.length - 1;
    index > 0;
    index -= 1
  ) {
    const randomIndex =
      crypto.randomInt(
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

function createShuffledDeck() {
  return shuffleDeck(
    createDeck(),
  );
}

function dealHoleCards(
  deck,
  playerIds,
) {
  if (
    !Array.isArray(deck) ||
    !Array.isArray(playerIds) ||
    playerIds.length < 2
  ) {
    throw new Error(
      "Unable to deal Poker cards.",
    );
  }

  const cardsByPlayer =
    new Map();

  playerIds.forEach(
    (playerId) => {
      cardsByPlayer.set(
        Number(playerId),
        [],
      );
    },
  );

  /*
   * Real Poker-এর মতো দুই round-এ
   * প্রত্যেক player-কে একটি করে card।
   */
  for (
    let round = 0;
    round < 2;
    round += 1
  ) {
    for (
      const playerId of
      playerIds
    ) {
      const card =
        deck.shift();

      if (!card) {
        throw new Error(
          "Poker deck is incomplete.",
        );
      }

      cardsByPlayer
        .get(
          Number(playerId),
        )
        .push(card);
    }
  }

  return cardsByPlayer;
}

function dealCommunityStreet(
  deck,
  existingCommunityCards,
  street,
) {
  if (!Array.isArray(deck)) {
    throw new Error(
      "Invalid Poker deck.",
    );
  }

  const communityCards =
    Array.isArray(existingCommunityCards)
      ? [...existingCommunityCards]
      : [];

  const expectedCards = {
    flop: 0,
    turn: 3,
    river: 4,
  };

  const cardsToDeal = {
    flop: 3,
    turn: 1,
    river: 1,
  };

  if (
    !Object.prototype.hasOwnProperty.call(
      cardsToDeal,
      street,
    )
  ) {
    throw new Error(
      "Invalid Poker betting street.",
    );
  }

  if (
    communityCards.length !==
    expectedCards[street]
  ) {
    throw new Error(
      `Invalid community-card count before ${street}.`,
    );
  }

  /*
   * Hole cards deck.shift() দিয়ে deal হয়েছে।
   * তাই community cards-ও একই দিক থেকে নেওয়া হবে।
   */

  const burnedCard = deck.shift();

  if (!burnedCard) {
    throw new Error(
      "Poker deck has no burn card.",
    );
  }

  const dealtCards = [];

  for (
    let index = 0;
    index < cardsToDeal[street];
    index += 1
  ) {
    const card = deck.shift();

    if (!card) {
      throw new Error(
        "Poker deck is incomplete.",
      );
    }

    dealtCards.push(card);
    communityCards.push(card);
  }

  return {
    deck,
    burnedCard,
    dealtCards,
    communityCards,
  };
}

module.exports = {
  SUITS,
  RANKS,

  createDeck,
  shuffleDeck,
  createShuffledDeck,
  dealHoleCards,
  dealCommunityStreet,
};