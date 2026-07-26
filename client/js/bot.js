/*==================================================
    PMS ADDA - INTELLIGENT TEEN PATTI BOT
    Version: 4.0

    Features:
    - Blind strategy
    - Seen strategy
    - Hand strength
    - Risk calculation
    - Bluff decision
    - Side Show decision
    - Show decision
    - Pending action cancellation
    - Duplicate action protection
==================================================*/

const BOT = {
  MIN_THINK_TIME: 1200,
  MAX_THINK_TIME: 2800,

  pendingTimer: null,
  pendingPlayerId: null,
  actionLocked: false,

  /*==============================================
      BOT PLAY
  ==============================================*/

  play(playerId) {
    const player = GAME.players.find(
      (item) => Number(item.id) === Number(playerId),
    );

    console.log("BOT PLAY CALLED:", playerId);

    if (!player) {
      console.warn("Bot player not found:", playerId);
      return false;
    }

    if (!player.isBot) {
      return false;
    }

    if (player.packed || player.isActive === false) {
      return false;
    }

    if (!GAME.roundRunning) {
      return false;
    }

    if (
      typeof TURN !== "undefined" &&
      Number(TURN.currentPlayerId) !== Number(player.id)
    ) {
      return false;
    }

    /*
     * আগের pending Bot action থাকলে বাতিল হবে।
     */
    this.cancelPendingAction();

    this.pendingPlayerId = Number(player.id);
    this.actionLocked = false;

    this.showThinking(player.id);

    const delay = this.randomNumber(
      this.MIN_THINK_TIME,
      this.MAX_THINK_TIME,
    );

    this.pendingTimer = window.setTimeout(() => {
      this.pendingTimer = null;

      if (!GAME.roundRunning) {
        this.resetActionState();
        return;
      }

      if (
        typeof TURN !== "undefined" &&
        Number(TURN.currentPlayerId) !== Number(player.id)
      ) {
        this.resetActionState();
        return;
      }

      const currentPlayer = GAME.players.find(
        (item) => Number(item.id) === Number(player.id),
      );

      if (
        !currentPlayer ||
        currentPlayer.packed ||
        currentPlayer.isActive === false
      ) {
        this.resetActionState();
        return;
      }

      console.log(
        "BOT THINK COMPLETE:",
        currentPlayer.id,
      );

      this.makeDecision(currentPlayer);
    }, delay);

    return true;
  },

  /*==============================================
      MAIN DECISION
  ==============================================*/

  makeDecision(player) {
    if (this.actionLocked) {
      return false;
    }

    this.actionLocked = true;

    const context =
      this.createDecisionContext(player);

    if (!context.valid) {
      this.resetActionState();
      return false;
    }

    console.log("BOT AI CONTEXT:", {
      bot: player.name,
      hand: context.hand.name,
      handPower: context.hand.power,
      handStrength: context.handStrength,
      risk: context.risk,
      pot: context.pot,
      balance: context.balance,
      callCost: context.callCost,
      activePlayers: context.activePlayerCount,
      seen: player.seen,
      blindCount: context.blindCount,
    });

    /*
     * প্রয়োজনীয় Bet দেওয়ার মতো balance না থাকলে Pack।
     */
    if (context.balance < context.callCost) {
      return this.doPack(player);
    }

    /*
     * দুইজন active player থাকলে Show বিবেচনা করবে।
     */
    if (
      context.activePlayerCount === 2 &&
      this.shouldShow(player, context)
    ) {
      return this.doShow(player);
    }

    /*
     * Bot প্রয়োজন অনুযায়ী card দেখবে।
     */
    if (
      !player.seen &&
      this.shouldSeeCards(player, context)
    ) {
      this.markPlayerSeen(player);

      /*
       * Seen হওয়ার পরে call cost বেড়ে যেতে পারে।
       */
      context.callCost =
        this.getCallCost(player);

      if (context.balance < context.callCost) {
        return this.doPack(player);
      }
    }

    /*
     * Side Show শুধু seen Bot request করতে পারবে।
     */
    if (
      player.seen &&
      this.shouldRequestSideShow(player, context)
    ) {
      const requested =
        this.doSideShow(player);

      if (requested) {
        return true;
      }
    }

    /*
     * Strong hand।
     */
    if (context.handStrength >= 0.78) {
      return this.playStrongHand(
        player,
        context,
      );
    }

    /*
     * Medium hand।
     */
    if (context.handStrength >= 0.48) {
      return this.playMediumHand(
        player,
        context,
      );
    }

    /*
     * Weak hand।
     */
    return this.playWeakHand(
      player,
      context,
    );
  },

  /*==============================================
      DECISION CONTEXT
  ==============================================*/

  createDecisionContext(player) {
    const hand =
      this.evaluateHand(player.cards);

    const activePlayers =
      GAME.players.filter((item) => {
        return (
          !item.packed &&
          item.isActive !== false
        );
      });

    const pot =
      Math.max(
        0,
        Number(GAME.pot) || 0,
      );

    const currentBet =
      Math.max(
        1,
        Number(GAME.currentBet) || 10,
      );

    const balance =
      Math.max(
        0,
        Number(player.balance) || 0,
      );

    const blindCount =
      Math.max(
        0,
        Number(player.blindCount) || 0,
      );

    const handStrength =
      this.calculateHandStrength(hand);

    const context = {
      valid:
        hand.power > 0 &&
        activePlayers.length >= 2,

      hand,
      handStrength,
      activePlayers,
      activePlayerCount:
        activePlayers.length,

      pot,
      currentBet,
      balance,
      blindCount,

      callCost:
        this.getCallCost(player),

      risk: 0,
      potPressure: 0,
      balancePressure: 0,
    };

    context.potPressure =
      balance > 0
        ? Math.min(
            1,
            pot / balance,
          )
        : 1;

    context.balancePressure =
      balance > 0
        ? Math.min(
            1,
            context.callCost /
              balance,
          )
        : 1;

    context.risk =
      this.calculateRisk(
        context,
      );

    return context;
  },

  /*==============================================
      STRONG HAND STRATEGY
  ==============================================*/

  playStrongHand(
    player,
    context,
  ) {
    const random =
      Math.random();

    /*
     * Trail / Pure Sequence প্রায় সবসময় খেলবে।
     */
    if (context.hand.power >= 6) {
      if (random < 0.97) {
        return this.doBet(player);
      }

      return this.doPack(player);
    }

    /*
     * Sequence / Color।
     */
    if (context.risk <= 0.8) {
      return this.doBet(player);
    }

    if (random < 0.82) {
      return this.doBet(player);
    }

    return this.doPack(player);
  },

  /*==============================================
      MEDIUM HAND STRATEGY
  ==============================================*/

  playMediumHand(
    player,
    context,
  ) {
    const random =
      Math.random();

    /*
     * Pair হলে তুলনামূলক বেশি খেলবে।
     */
    if (context.hand.power === 3) {
      if (
        context.risk <= 0.55 &&
        random < 0.84
      ) {
        return this.doBet(player);
      }

      if (
        context.activePlayerCount <= 3 &&
        random < 0.66
      ) {
        return this.doBet(player);
      }

      return this.doPack(player);
    }

    /*
     * ভালো High Card।
     */
    if (
      context.risk <= 0.35 &&
      random < 0.58
    ) {
      return this.doBet(player);
    }

    return this.doPack(player);
  },

  /*==============================================
      WEAK HAND + BLUFF STRATEGY
  ==============================================*/

  playWeakHand(
    player,
    context,
  ) {
    const random =
      Math.random();

    const highestCard =
      context.hand.highCards[0] || 0;

    const bluffChance =
      this.calculateBluffChance(
        player,
        context,
      );

    /*
     * Ace বা King high।
     */
    if (highestCard >= 13) {
      if (
        context.risk <= 0.4 &&
        random < 0.58
      ) {
        return this.doBet(player);
      }

      if (
        random < bluffChance
      ) {
        return this.doBet(player);
      }

      return this.doPack(player);
    }

    /*
     * Queen high।
     */
    if (highestCard === 12) {
      if (
        context.activePlayerCount <= 3 &&
        context.risk <= 0.28 &&
        random < 0.38
      ) {
        return this.doBet(player);
      }

      if (
        random <
        bluffChance * 0.7
      ) {
        return this.doBet(player);
      }

      return this.doPack(player);
    }

    /*
     * Blind অবস্থায় ছোট Pot হলে bluff করতে পারে।
     */
    if (
      !player.seen &&
      context.potPressure < 0.12 &&
      random < bluffChance
    ) {
      return this.doBet(player);
    }

    return this.doPack(player);
  },

  /*==============================================
      SHOULD SEE CARDS
  ==============================================*/

  shouldSeeCards(
    player,
    context,
  ) {
    if (player.seen) {
      return false;
    }

    /*
     * সর্বোচ্চ 3টি Blind action-এর পরে card দেখবে।
     */
    if (context.blindCount >= 3) {
      return true;
    }

    /*
     * Pot বড় হয়ে গেলে card দেখবে।
     */
    if (
      context.potPressure >= 0.18
    ) {
      return true;
    }

    /*
     * Active player কমে গেলে card দেখার সম্ভাবনা বাড়ে।
     */
    if (
      context.activePlayerCount <= 3 &&
      Math.random() < 0.38
    ) {
      return true;
    }

    /*
     * Strong hand হলেও সবসময় সঙ্গে সঙ্গে card দেখবে না।
     */
    if (
      context.handStrength >= 0.7 &&
      Math.random() < 0.35
    ) {
      return true;
    }

    return Math.random() < 0.2;
  },

  /*==============================================
      SHOULD SHOW
  ==============================================*/

  shouldShow(
    player,
    context,
  ) {
    if (
      context.activePlayerCount !== 2
    ) {
      return false;
    }

    const random =
      Math.random();

    /*
     * Strong hand হলে দ্রুত Show।
     */
    if (
      context.handStrength >= 0.82
    ) {
      return random < 0.88;
    }

    if (
      context.handStrength >= 0.62
    ) {
      return (
        context.potPressure >= 0.12 &&
        random < 0.68
      );
    }

    if (
      context.handStrength >= 0.45
    ) {
      return (
        context.potPressure >= 0.25 &&
        random < 0.4
      );
    }

    /*
     * দুর্বল hand নিয়ে বড় Pot হলে কম সম্ভাবনায় Show।
     */
    return (
      context.potPressure >= 0.42 &&
      random < 0.15
    );
  },

  /*==============================================
      SHOULD REQUEST SIDE SHOW
  ==============================================*/

  shouldRequestSideShow(
    player,
    context,
  ) {
    if (!player.seen) {
      return false;
    }

    if (
      context.activePlayerCount <= 2
    ) {
      return false;
    }

    if (
      typeof WINNER === "undefined" ||
      typeof WINNER.sideShow !==
        "function"
    ) {
      return false;
    }

    if (WINNER.pendingSideShow) {
      return false;
    }

    const previousPlayer =
      typeof WINNER.getPreviousActivePlayer ===
      "function"
        ? WINNER.getPreviousActivePlayer(
            player.id,
          )
        : null;

    if (
      !previousPlayer ||
      !previousPlayer.seen
    ) {
      return false;
    }

    const random =
      Math.random();

    /*
     * Pair বা তার বেশি hand হলে Side Show request বেশি করবে।
     */
    if (
      context.hand.power >= 3 &&
      context.risk <= 0.7
    ) {
      return random < 0.28;
    }

    /*
     * Medium hand এবং Pot বড় হলে।
     */
    if (
      context.handStrength >= 0.48 &&
      context.potPressure >= 0.2
    ) {
      return random < 0.18;
    }

    return false;
  },

  /*==============================================
      HAND STRENGTH
  ==============================================*/

  calculateHandStrength(hand) {
    if (!hand || hand.power <= 0) {
      return 0;
    }

    const powerStrength =
      Math.min(
        1,
        hand.power / 7,
      );

    const highestCard =
      hand.highCards?.[0] || 0;

    const cardStrength =
      Math.min(
        1,
        highestCard / 14,
      );

    let strength =
      powerStrength * 0.82 +
      cardStrength * 0.18;

    /*
     * Pair-এর rank অনুযায়ী strength adjust।
     */
    if (
      hand.power === 3 &&
      hand.tiebreak?.length
    ) {
      strength +=
        (hand.tiebreak[0] / 14) *
        0.08;
    }

    return Math.max(
      0,
      Math.min(1, strength),
    );
  },

  /*==============================================
      RISK CALCULATION
  ==============================================*/

  calculateRisk(context) {
    if (
      !context ||
      context.balance <= 0
    ) {
      return 1;
    }

    const playerPressure =
      Math.max(
        0,
        context.activePlayerCount - 2,
      ) * 0.07;

    const handProtection =
      context.handStrength * 0.48;

    const totalRisk =
      context.potPressure * 0.45 +
      context.balancePressure * 0.38 +
      playerPressure -
      handProtection;

    return Math.max(
      0,
      Math.min(1, totalRisk),
    );
  },

  /*==============================================
      BLUFF CHANCE
  ==============================================*/

  calculateBluffChance(
    player,
    context,
  ) {
    let chance = 0.08;

    /*
     * Blind Bot বেশি bluff করতে পারে।
     */
    if (!player.seen) {
      chance += 0.1;
    }

    /*
     * কম player থাকলে bluff chance বাড়বে।
     */
    if (
      context.activePlayerCount <= 3
    ) {
      chance += 0.08;
    }

    /*
     * Pot ছোট হলে bluff তুলনামূলক নিরাপদ।
     */
    if (
      context.potPressure <= 0.1
    ) {
      chance += 0.07;
    }

    /*
     * Risk বেশি হলে bluff কমবে।
     */
    chance -=
      context.risk * 0.18;

    return Math.max(
      0.03,
      Math.min(0.32, chance),
    );
  },

  /*==============================================
      CALL COST
  ==============================================*/

  getCallCost(player) {
    const currentBet =
      Math.max(
        1,
        Number(GAME.currentBet) || 10,
      );

    return player.seen
      ? currentBet * 2
      : currentBet;
  },

  /*==============================================
      MARK SEEN
  ==============================================*/

  markPlayerSeen(player) {
    player.seen = true;

    if (
      typeof GAME.setPlayerStatus ===
      "function"
    ) {
      GAME.setPlayerStatus(
        player.id,
        "SEEN",
      );
    } else {
      player.status = "SEEN";
    }

    if (
      typeof UI !== "undefined" &&
      typeof UI.updatePlayerStatus ===
        "function"
    ) {
      UI.updatePlayerStatus(
        player.id,
      );
    }

    console.log(
      `${player.name} saw cards.`,
    );
  },

  /*==============================================
      ACTIONS
  ==============================================*/

  doBet(player) {
    let success = false;

    if (player.seen) {
      if (
        typeof BETTING !== "undefined" &&
        typeof BETTING.chaal ===
          "function"
      ) {
        success =
          BETTING.chaal(player.id) !==
          false;
      }
    } else if (
      typeof BETTING !== "undefined" &&
      typeof BETTING.blind ===
        "function"
    ) {
      success =
        BETTING.blind(player.id) !==
        false;
    }

    if (!success) {
      console.warn(
        "Bot betting method failed:",
        player.id,
      );

      this.resetActionState();
      return false;
    }

    this.resetActionState();
    return true;
  },

  doPack(player) {
    let success = false;

    if (
      typeof BETTING !== "undefined" &&
      typeof BETTING.pack ===
        "function"
    ) {
      success =
        BETTING.pack(player.id) !==
        false;
    } else {
      player.packed = true;
      player.status = "PACK";
      success = true;
    }

    this.resetActionState();
    return success;
  },

  doShow(player) {
    if (
      typeof WINNER !== "undefined" &&
      typeof WINNER.show ===
        "function"
    ) {
      const success =
        WINNER.show(player.id);

      if (success !== false) {
        this.resetActionState();
        return true;
      }
    }

    /*
     * Show সম্ভব না হলে normal Bet।
     */
    this.actionLocked = false;
    return this.doBet(player);
  },

  doSideShow(player) {
    if (
      typeof WINNER === "undefined" ||
      typeof WINNER.sideShow !==
        "function"
    ) {
      return false;
    }

    const success =
      WINNER.sideShow(player.id);

    if (success !== false) {
      this.resetActionState();
      return true;
    }

    return false;
  },

  /*==============================================
      HAND EVALUATOR
  ==============================================*/

  evaluateHand(cards) {
    if (
      !Array.isArray(cards) ||
      cards.length !== 3
    ) {
      return {
        name: "Invalid Hand",
        power: 0,
        score: 0,
        highCards: [],
        tiebreak: [],
      };
    }

    const parsedCards =
      cards.map((card) => {
        return this.parseCard(card);
      });

    const hasInvalidCard =
      parsedCards.some(
        (card) =>
          !card.suit ||
          !card.rank,
      );

    if (hasInvalidCard) {
      return {
        name: "Invalid Hand",
        power: 0,
        score: 0,
        highCards: [],
        tiebreak: [],
      };
    }

    const ranks =
      parsedCards
        .map((card) => card.rank)
        .sort((a, b) => b - a);

    const suits =
      parsedCards.map(
        (card) => card.suit,
      );

    const isSameSuit =
      suits.every(
        (suit) =>
          suit === suits[0],
      );

    const counts = {};

    ranks.forEach((rank) => {
      counts[rank] =
        (counts[rank] || 0) + 1;
    });

    const rankGroups =
      Object.entries(counts)
        .map(([rank, count]) => ({
          rank: Number(rank),
          count,
        }))
        .sort((a, b) => {
          if (
            b.count !== a.count
          ) {
            return (
              b.count - a.count
            );
          }

          return b.rank - a.rank;
        });

    const isTrail =
      rankGroups.length === 1;

    const sequenceHigh =
      this.getSequenceHigh(ranks);

    const isSequence =
      sequenceHigh > 0;

    let power = 1;
    let name = "High Card";
    let tiebreak = [...ranks];

    if (isTrail) {
      power = 7;
      name = "Trail";
      tiebreak = [ranks[0]];
    } else if (
      isSequence &&
      isSameSuit
    ) {
      power = 6;
      name = "Pure Sequence";
      tiebreak = [sequenceHigh];
    } else if (isSequence) {
      power = 5;
      name = "Sequence";
      tiebreak = [sequenceHigh];
    } else if (isSameSuit) {
      power = 4;
      name = "Color";
      tiebreak = [...ranks];
    } else if (
      rankGroups[0]?.count === 2
    ) {
      power = 3;
      name = "Pair";

      const pairRank =
        rankGroups[0].rank;

      const kicker =
        rankGroups[1]?.rank || 0;

      tiebreak = [
        pairRank,
        kicker,
      ];
    }

    return {
      name,
      power,

      score:
        this.createHandScore(
          power,
          tiebreak,
        ),

      highCards: ranks,
      tiebreak,
    };
  },

  parseCard(card) {
    if (
      typeof card !== "string"
    ) {
      return {
        suit: "",
        rank: 0,
      };
    }

    const suit =
      card.charAt(0);

    const rankText =
      card
        .slice(1)
        .toUpperCase();

    const rankMap = {
      A: 14,
      K: 13,
      Q: 12,
      J: 11,
    };

    const rank =
      rankMap[rankText] ||
      Number(rankText) ||
      0;

    return {
      suit,
      rank,
    };
  },

  getSequenceHigh(ranks) {
    const uniqueRanks = [
      ...new Set(ranks),
    ].sort((a, b) => b - a);

    if (
      uniqueRanks.length !== 3
    ) {
      return 0;
    }

    /*
     * A-K-Q
     */
    if (
      uniqueRanks[0] === 14 &&
      uniqueRanks[1] === 13 &&
      uniqueRanks[2] === 12
    ) {
      return 14;
    }

    /*
     * A-2-3
     */
    if (
      uniqueRanks[0] === 14 &&
      uniqueRanks[1] === 3 &&
      uniqueRanks[2] === 2
    ) {
      return 3;
    }

    if (
      uniqueRanks[0] - 1 ===
        uniqueRanks[1] &&
      uniqueRanks[1] - 1 ===
        uniqueRanks[2]
    ) {
      return uniqueRanks[0];
    }

    return 0;
  },

  createHandScore(
    power,
    values,
  ) {
    let score =
      power * 1000000;

    values.forEach(
      (value, index) => {
        const position =
          values.length -
          index -
          1;

        score +=
          value *
          Math.pow(
            15,
            position,
          );
      },
    );

    return score;
  },

  /*==============================================
      UI HELPERS
  ==============================================*/

  showThinking(playerId) {
    if (
      typeof GAME.setPlayerStatus ===
      "function"
    ) {
      GAME.setPlayerStatus(
        playerId,
        "THINKING...",
      );

      return;
    }

    const player =
      GAME.players.find(
        (item) =>
          Number(item.id) ===
          Number(playerId),
      );

    if (player) {
      player.status =
        "THINKING...";
    }
  },

  randomNumber(min, max) {
    return Math.floor(
      Math.random() *
        (max - min + 1),
    ) + min;
  },

  /*==============================================
      CANCEL PENDING ACTION
  ==============================================*/

  cancelPendingAction() {
    if (
      this.pendingTimer !== null
    ) {
      window.clearTimeout(
        this.pendingTimer,
      );

      this.pendingTimer = null;
    }

    this.pendingPlayerId = null;
    this.actionLocked = false;

    return true;
  },

  resetActionState() {
    this.pendingTimer = null;
    this.pendingPlayerId = null;
    this.actionLocked = false;
  },
};

window.BOT = BOT;