"use strict";

const crypto =
  require("crypto");

const RANKS =
  Object.freeze([
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
    "K"
  ]);

const SUITS =
  Object.freeze([
    {
      code: "S",
      name: "spades"
    },
    {
      code: "H",
      name: "hearts"
    },
    {
      code: "D",
      name: "diamonds"
    },
    {
      code: "C",
      name: "clubs"
    }
  ]);

const RANK_SET =
  new Set(RANKS);

const SUIT_MAP =
  new Map(
    SUITS.map(
      (suit) => [
        suit.code,
        suit.name
      ]
    )
  );

function createGameError(
  message,
  statusCode = 400,
  code = "KAIT_GAME_ERROR"
) {
  const error =
    new Error(message);

  error.statusCode =
    statusCode;

  error.code =
    code;

  return error;
}

function normalizeRank(value) {
  const rank =
    String(value || "")
      .trim()
      .toUpperCase();

  if (
    !RANK_SET.has(rank)
  ) {
    throw createGameError(
      "Invalid card rank.",
      400,
      "KAIT_RANK_INVALID"
    );
  }

  return rank;
}

function createOrderedDeck() {
  const deck = [];

  for (
    const suit of SUITS
  ) {
    for (
      const rank of RANKS
    ) {
      deck.push({
        code:
          `${rank}${suit.code}`,

        rank,

        suitCode:
          suit.code,

        suit:
          suit.name,

        color:
          [
            "H",
            "D"
          ].includes(
            suit.code
          )
            ? "red"
            : "black"
      });
    }
  }

  return deck;
}

function createServerSeed() {
  return crypto
    .randomBytes(32)
    .toString("hex");
}

function hashServerSeed(
  serverSeed
) {
  return crypto
    .createHash("sha256")
    .update(
      String(serverSeed)
    )
    .digest("hex");
}

function createRandomReader(
  serverSeed
) {
  let counter = 0;
  let buffer =
    Buffer.alloc(0);

  function refill() {
    const digest =
      crypto
        .createHmac(
          "sha256",
          String(serverSeed)
        )
        .update(
          `kait-shuffle:${counter}`
        )
        .digest();

    counter += 1;

    buffer =
      Buffer.concat([
        buffer,
        digest
      ]);
  }

  function readUInt32() {
    while (
      buffer.length < 4
    ) {
      refill();
    }

    const value =
      buffer.readUInt32BE(0);

    buffer =
      buffer.subarray(4);

    return value;
  }

  return {
    readUInt32
  };
}

function randomIndex(
  reader,
  maximumInclusive
) {
  if (
    !Number.isInteger(
      maximumInclusive
    ) ||
    maximumInclusive < 0
  ) {
    throw createGameError(
      "Invalid shuffle range.",
      500,
      "KAIT_SHUFFLE_RANGE_INVALID"
    );
  }

  if (
    maximumInclusive === 0
  ) {
    return 0;
  }

  const range =
    maximumInclusive + 1;

  const limit =
    Math.floor(
      0x100000000 /
      range
    ) * range;

  let value;

  do {
    value =
      reader.readUInt32();
  } while (
    value >= limit
  );

  return value % range;
}

function shuffleDeck(
  serverSeed
) {
  const safeSeed =
    String(serverSeed || "")
      .trim();

  if (!safeSeed) {
    throw createGameError(
      "Server seed is required.",
      500,
      "KAIT_SEED_REQUIRED"
    );
  }

  const deck =
    createOrderedDeck();

  const reader =
    createRandomReader(
      safeSeed
    );

  for (
    let index =
      deck.length - 1;
    index > 0;
    index -= 1
  ) {
    const swapIndex =
      randomIndex(
        reader,
        index
      );

    [
      deck[index],
      deck[swapIndex]
    ] = [
      deck[swapIndex],
      deck[index]
    ];
  }

  return deck;
}

function parseCardCode(
  cardCode
) {
  const value =
    String(cardCode || "")
      .trim()
      .toUpperCase();

  const match =
    value.match(
      /^(A|2|3|4|5|6|7|8|9|10|J|Q|K)(S|H|D|C)$/
    );

  if (!match) {
    throw createGameError(
      "Invalid card code.",
      400,
      "KAIT_CARD_CODE_INVALID"
    );
  }

  const rank =
    match[1];

  const suitCode =
    match[2];

  return {
    code: value,

    rank,

    suitCode,

    suit:
      SUIT_MAP.get(
        suitCode
      ),

    color:
      [
        "H",
        "D"
      ].includes(
        suitCode
      )
        ? "red"
        : "black"
  };
}

function getPositionSide(
  position
) {
  const safePosition =
    Number(position);

  if (
    !Number.isInteger(
      safePosition
    ) ||
    safePosition < 1 ||
    safePosition > 52
  ) {
    throw createGameError(
      "Card position must be between 1 and 52.",
      400,
      "KAIT_POSITION_INVALID"
    );
  }

  return (
    safePosition % 2 === 1
      ? "front"
      : "back"
  );
}

function verifyDeck(
  deck
) {
  if (
    !Array.isArray(deck) ||
    deck.length !== 52
  ) {
    return false;
  }

  const codes =
    deck.map(
      (card) =>
        String(
          card?.code || ""
        ).toUpperCase()
    );

  if (
    new Set(codes).size !==
    52
  ) {
    return false;
  }

  try {
    return codes.every(
      (code) =>
        Boolean(
          parseCardCode(code)
        )
    );
  } catch (_error) {
    return false;
  }
}

function createDealPairs(deck) {
  if (!verifyDeck(deck)) {
    throw createGameError(
      "Invalid Kait deck.",
      500,
      "KAIT_DECK_INVALID"
    );
  }

  const pairs = [];

  for (
    let index = 0;
    index < deck.length;
    index += 2
  ) {
    const frontCard = deck[index];

    const backCard =
      deck[index + 1];

    pairs.push({
      pairNumber:
        Math.floor(index / 2) + 1,

      front: {
        ...frontCard,

        deckPosition:
          index + 1,

        resultSide:
          "front"
      },

      back: {
        ...backCard,

        deckPosition:
          index + 2,

        resultSide:
          "back"
      }
    });
  }

  return pairs;
}

function resolveRankResults(deck) {
  const pairs =
    createDealPairs(deck);

  const resolvedRanks =
    new Map();

  for (const pair of pairs) {
    /*
     * সামনে card সবসময় আগে process হবে।
     *
     * একই pair-এ সামনে এবং পেছনে একই rank
     * থাকলে সামনে result জয়ী হবে।
     */
    const cardsInProcessOrder = [
      pair.front,
      pair.back
    ];

    for (
      const card of
      cardsInProcessOrder
    ) {
      if (
        resolvedRanks.has(
          card.rank
        )
      ) {
        continue;
      }

      resolvedRanks.set(
        card.rank,
        {
          rankCode:
            card.rank,

          firstCardCode:
            card.code,

          firstCardSuit:
            card.suit,

          deckPosition:
            card.deckPosition,

          resultSide:
            card.resultSide,

          pairNumber:
            pair.pairNumber
        }
      );
    }

    if (
      resolvedRanks.size ===
      RANKS.length
    ) {
      break;
    }
  }

  if (
    resolvedRanks.size !==
    RANKS.length
  ) {
    throw createGameError(
      "All Kait ranks could not be resolved.",
      500,
      "KAIT_RANK_RESOLUTION_FAILED"
    );
  }

  /*
   * Result সবসময় A, 2, 3 ... K
   * এই নির্দিষ্ট order-এ return হবে।
   */
  return RANKS.map(
    (rank) =>
      resolvedRanks.get(rank)
  );
}

module.exports = {
  RANKS,
  SUITS,
  createGameError,
  normalizeRank,
  createOrderedDeck,
  createServerSeed,
  hashServerSeed,
  shuffleDeck,
  parseCardCode,
  getPositionSide,
  verifyDeck,
  createDealPairs,
  resolveRankResults
};