"use strict";

/* ==========================================
   TPL22 Texas Hold'em Evaluator
========================================== */

const CATEGORY_NAMES =
  Object.freeze({
    8: "Straight Flush",
    7: "Four of a Kind",
    6: "Full House",
    5: "Flush",
    4: "Straight",
    3: "Three of a Kind",
    2: "Two Pair",
    1: "One Pair",
    0: "High Card",
  });

const RANK_VALUES =
  Object.freeze({
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

function parseCard(
  cardCode,
) {
  const code =
    String(cardCode || "")
      .trim()
      .toUpperCase();

  const suit =
    code.slice(0, 1);

  const rankCode =
    code.slice(1);

  const rank =
    RANK_VALUES[rankCode];

  if (
    !["S", "H", "D", "C"]
      .includes(suit) ||
    !rank
  ) {
    throw new Error(
      `Invalid Poker card: ${cardCode}`,
    );
  }

  return {
    code,
    suit,
    rank,
  };
}

function createCombinations(
  cards,
  choose,
) {
  const combinations = [];

  function collect(
    startIndex,
    selected,
  ) {
    if (
      selected.length === choose
    ) {
      combinations.push([
        ...selected,
      ]);

      return;
    }

    const cardsNeeded =
      choose -
      selected.length;

    for (
      let index = startIndex;
      index <=
        cards.length -
          cardsNeeded;
      index += 1
    ) {
      selected.push(
        cards[index],
      );

      collect(
        index + 1,
        selected,
      );

      selected.pop();
    }
  }

  collect(0, []);

  return combinations;
}

function getStraightHigh(
  ranks,
) {
  const uniqueRanks =
    [...new Set(ranks)]
      .sort(
        (first, second) =>
          second - first,
      );

  /*
   * Ace-low straight:
   * A, 2, 3, 4, 5
   */
  if (
    uniqueRanks.includes(14)
  ) {
    uniqueRanks.push(1);
  }

  let consecutive = 1;

  for (
    let index = 1;
    index <
      uniqueRanks.length;
    index += 1
  ) {
    if (
      uniqueRanks[index - 1] -
        1 ===
      uniqueRanks[index]
    ) {
      consecutive += 1;

      if (consecutive >= 5) {
        return uniqueRanks[
          index - 4
        ];
      }
    } else {
      consecutive = 1;
    }
  }

  return null;
}

function encodeRank(
  category,
  rankingValues,
) {
  const padded = [
    ...rankingValues,
  ];

  while (
    padded.length < 5
  ) {
    padded.push(0);
  }

  let score =
    Number(category);

  for (
    const value of
      padded.slice(0, 5)
  ) {
    score =
      score * 15 +
      Number(value);
  }

  return score;
}

function evaluateFiveCards(
  cardCodes,
) {
  if (
    !Array.isArray(cardCodes) ||
    cardCodes.length !== 5
  ) {
    throw new Error(
      "Exactly five Poker cards are required.",
    );
  }

  const cards =
    cardCodes.map(
      parseCard,
    );

  const ranks =
    cards
      .map(
        (card) =>
          card.rank,
      )
      .sort(
        (first, second) =>
          second - first,
      );

  const isFlush =
    cards.every(
      (card) =>
        card.suit ===
        cards[0].suit,
    );

  const straightHigh =
    getStraightHigh(
      ranks,
    );

  const countMap =
    new Map();

  ranks.forEach(
    (rank) => {
      countMap.set(
        rank,
        (
          countMap.get(rank) ||
          0
        ) + 1,
      );
    },
  );

  const groups =
    [...countMap.entries()]
      .map(
        ([rank, count]) => ({
          rank:
            Number(rank),

          count:
            Number(count),
        }),
      )
      .sort(
        (first, second) =>
          (
            second.count -
            first.count
          ) ||
          (
            second.rank -
            first.rank
          ),
      );

  let category;
  let rankingValues;

  if (
    isFlush &&
    straightHigh
  ) {
    category = 8;
    rankingValues = [
      straightHigh,
    ];
  } else if (
    groups[0]?.count === 4
  ) {
    category = 7;

    rankingValues = [
      groups[0].rank,

      groups.find(
        (group) =>
          group.count === 1,
      ).rank,
    ];
  } else if (
    groups[0]?.count === 3 &&
    groups[1]?.count === 2
  ) {
    category = 6;

    rankingValues = [
      groups[0].rank,
      groups[1].rank,
    ];
  } else if (isFlush) {
    category = 5;
    rankingValues = ranks;
  } else if (straightHigh) {
    category = 4;

    rankingValues = [
      straightHigh,
    ];
  } else if (
    groups[0]?.count === 3
  ) {
    category = 3;

    rankingValues = [
      groups[0].rank,

      ...groups
        .filter(
          (group) =>
            group.count === 1,
        )
        .map(
          (group) =>
            group.rank,
        )
        .sort(
          (first, second) =>
            second - first,
        ),
    ];
  } else {
    const pairs =
      groups
        .filter(
          (group) =>
            group.count === 2,
        )
        .sort(
          (first, second) =>
            second.rank -
            first.rank,
        );

    if (pairs.length >= 2) {
      const kicker =
        groups
          .filter(
            (group) =>
              group.count === 1,
          )
          .map(
            (group) =>
              group.rank,
          )
          .sort(
            (first, second) =>
              second - first,
          )[0];

      category = 2;

      rankingValues = [
        pairs[0].rank,
        pairs[1].rank,
        kicker,
      ];
    } else if (
      pairs.length === 1
    ) {
      category = 1;

      rankingValues = [
        pairs[0].rank,

        ...groups
          .filter(
            (group) =>
              group.count === 1,
          )
          .map(
            (group) =>
              group.rank,
          )
          .sort(
            (first, second) =>
              second - first,
          ),
      ];
    } else {
      category = 0;
      rankingValues = ranks;
    }
  }

  return {
    category,

    name:
      CATEGORY_NAMES[
        category
      ],

    score:
      encodeRank(
        category,
        rankingValues,
      ),

    rankingValues,

    cards:
      cards.map(
        (card) =>
          card.code,
      ),
  };
}

function evaluateHoldemHand(
  holeCards,
  communityCards,
) {
  if (
    !Array.isArray(holeCards) ||
    holeCards.length !== 2
  ) {
    throw new Error(
      "A Poker player must have two hole cards.",
    );
  }

  if (
    !Array.isArray(
      communityCards,
    ) ||
    communityCards.length !== 5
  ) {
    throw new Error(
      "Showdown requires five community cards.",
    );
  }

  const allCards = [
    ...holeCards,
    ...communityCards,
  ];

  const combinations =
    createCombinations(
      allCards,
      5,
    );

  let bestResult = null;

  for (
    const combination of
      combinations
  ) {
    const result =
      evaluateFiveCards(
        combination,
      );

    if (
      !bestResult ||
      result.score >
        bestResult.score
    ) {
      bestResult =
        result;
    }
  }

  return {
    ...bestResult,

    holeCards: [
      ...holeCards,
    ],

    communityCards: [
      ...communityCards,
    ],
  };
}

function compareEvaluations(
  first,
  second,
) {
  return (
    Number(first.score) -
    Number(second.score)
  );
}

module.exports = {
  CATEGORY_NAMES,
  RANK_VALUES,

  parseCard,
  evaluateFiveCards,
  evaluateHoldemHand,
  compareEvaluations,
};