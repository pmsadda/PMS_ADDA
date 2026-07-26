"use strict";

/*====================================================

    PMS ADDA
    WINNER ENGINE
    Version 1.0

====================================================*/

class WinnerEngine {
  constructor() {
    /*
            Teen Patti hand ranking:

            6 = Trail
            5 = Pure Sequence
            4 = Sequence
            3 = Color
            2 = Pair
            1 = High Card
        */

    this.HAND_RANK = {
      HIGH_CARD: 1,
      PAIR: 2,
      COLOR: 3,
      SEQUENCE: 4,
      PURE_SEQUENCE: 5,
      TRAIL: 6,
    };

    this.serviceChargePercent = 5;

    this.isProcessing = false;

    this.pendingSideShow = null;
    this.sideShowTimer = null;

    console.log("Winner Engine Initialized");
  }

  /*================================================

        ACTIVE PLAYERS

    =================================================*/

  getActivePlayers() {
    return GAME.players.filter((player) => {
      return player.isActive === true && player.packed === false;
    });
  }

  getPreviousActivePlayer(playerId) {
    const activePlayers = this.getActivePlayers();

    const index = activePlayers.findIndex((player) => player.id === playerId);

    if (index === -1) {
      return null;
    }

    const previousIndex =
      (index - 1 + activePlayers.length) % activePlayers.length;

    return activePlayers[previousIndex];
  }

  canShow() {
    if (!GAME.roundRunning) {
      return false;
    }

    if (!TURN.isRunning) {
      return false;
    }

    return this.getActivePlayers().length === 2;
  }

  /*================================================

        PLAYER CARD HELPERS

    =================================================*/

  getCardRank(card) {
    if (!card) {
      return 0;
    }

    /*
        String card examples:

        S3
        DA
        H10
        CK
        DQ
        SJ
    */

    if (typeof card === "string") {
      const normalizedCard = card.trim().toUpperCase();

      if (normalizedCard.length < 2) {
        return 0;
      }

      const rawRank = normalizedCard.slice(1);

      const rankMap = {
        A: 14,
        K: 13,
        Q: 12,
        J: 11,
        T: 10,
      };

      if (rankMap[rawRank]) {
        return rankMap[rawRank];
      }

      const parsedRank = Number(rawRank);

      if (Number.isFinite(parsedRank) && parsedRank >= 2 && parsedRank <= 10) {
        return parsedRank;
      }

      return 0;
    }

    /*
        Object card support
    */

    const rawRank = card.rank ?? card.value ?? card.number ?? card.cardValue;

    if (typeof rawRank === "number") {
      if (rawRank === 1) {
        return 14;
      }

      return rawRank;
    }

    const normalizedRank = String(rawRank || "")
      .trim()
      .toUpperCase();

    const rankMap = {
      A: 14,
      ACE: 14,
      K: 13,
      KING: 13,
      Q: 12,
      QUEEN: 12,
      J: 11,
      JACK: 11,
      T: 10,
    };

    if (rankMap[normalizedRank]) {
      return rankMap[normalizedRank];
    }

    const parsedRank = Number(normalizedRank);

    if (Number.isFinite(parsedRank)) {
      if (parsedRank === 1) {
        return 14;
      }

      return parsedRank;
    }

    return 0;
  }

  getCardSuit(card) {
    if (!card) {
      return "";
    }

    /*
        String card examples:

        S3
        DA
        H10
        CK
    */

    if (typeof card === "string") {
      const normalizedCard = card.trim().toUpperCase();

      if (normalizedCard.length < 2) {
        return "";
      }

      const suitCode = normalizedCard.charAt(0);

      const validSuits = ["S", "D", "C", "H"];

      if (!validSuits.includes(suitCode)) {
        return "";
      }

      return suitCode;
    }

    /*
        Object card support
    */

    return String(card.suit ?? card.symbol ?? card.type ?? card.cardSuit ?? "")
      .trim()
      .toUpperCase();
  }

  getPlayerCards(player) {
    if (!player || !Array.isArray(player.cards)) {
      return [];
    }

    return player.cards;
  }

  /*================================================

        CARD VALIDATION

    =================================================*/

  validateCards(cards) {
    if (!Array.isArray(cards)) {
      return false;
    }

    if (cards.length !== 3) {
      return false;
    }

    return cards.every((card) => {
      const rank = this.getCardRank(card);
      const suit = this.getCardSuit(card);

      return rank >= 2 && rank <= 14 && suit !== "";
    });
  }

  /*================================================

        SORT RANKS

    =================================================*/

  getSortedRanks(cards) {
    return cards.map((card) => this.getCardRank(card)).sort((a, b) => b - a);
  }

  getRankFrequency(ranks) {
    const frequency = {};

    ranks.forEach((rank) => {
      frequency[rank] = (frequency[rank] || 0) + 1;
    });

    return frequency;
  }

  /*================================================

        SEQUENCE CHECK

    =================================================*/

  getSequenceHighCard(ranks) {
    const uniqueRanks = [...new Set(ranks)].sort((a, b) => a - b);

    if (uniqueRanks.length !== 3) {
      return null;
    }

    /*
            A-2-3 special sequence.

            Teen Patti-তে সাধারণত:
            A-K-Q সর্বোচ্চ,
            A-2-3 পরের শক্তিশালী sequence।

            Comparison value 14 রাখা হচ্ছে।
        */

    if (uniqueRanks[0] === 2 && uniqueRanks[1] === 3 && uniqueRanks[2] === 14) {
      return 14;
    }

    if (
      uniqueRanks[1] === uniqueRanks[0] + 1 &&
      uniqueRanks[2] === uniqueRanks[1] + 1
    ) {
      return uniqueRanks[2];
    }

    return null;
  }

  /*================================================

        EVALUATE HAND

    =================================================*/

  evaluateHand(cards) {
    if (!this.validateCards(cards)) {
      console.error("Invalid cards supplied:", cards);

      return null;
    }

    const ranks = this.getSortedRanks(cards);

    const suits = cards.map((card) => this.getCardSuit(card));

    const frequency = this.getRankFrequency(ranks);

    const frequencyEntries = Object.entries(frequency)
      .map(([rank, count]) => ({
        rank: Number(rank),
        count,
      }))
      .sort((a, b) => {
        if (b.count !== a.count) {
          return b.count - a.count;
        }

        return b.rank - a.rank;
      });

    const isSameSuit = suits.every((suit) => suit === suits[0]);

    const sequenceHigh = this.getSequenceHighCard(ranks);

    const isSequence = sequenceHigh !== null;

    /*--------------------------------------------

            TRAIL

        ---------------------------------------------*/

    if (frequencyEntries[0].count === 3) {
      return {
        category: "TRAIL",
        name: "Trail",
        rank: this.HAND_RANK.TRAIL,
        values: [frequencyEntries[0].rank],
      };
    }

    /*--------------------------------------------

            PURE SEQUENCE

        ---------------------------------------------*/

    if (isSameSuit && isSequence) {
      return {
        category: "PURE_SEQUENCE",
        name: "Pure Sequence",
        rank: this.HAND_RANK.PURE_SEQUENCE,
        values: [sequenceHigh],
      };
    }

    /*--------------------------------------------

            SEQUENCE

        ---------------------------------------------*/

    if (isSequence) {
      return {
        category: "SEQUENCE",
        name: "Sequence",
        rank: this.HAND_RANK.SEQUENCE,
        values: [sequenceHigh],
      };
    }

    /*--------------------------------------------

            COLOR

        ---------------------------------------------*/

    if (isSameSuit) {
      return {
        category: "COLOR",
        name: "Color",
        rank: this.HAND_RANK.COLOR,
        values: ranks,
      };
    }

    /*--------------------------------------------

            PAIR

        ---------------------------------------------*/

    if (frequencyEntries[0].count === 2) {
      const pairRank = frequencyEntries[0].rank;

      const kickerRank =
        frequencyEntries.find((entry) => entry.count === 1)?.rank || 0;

      return {
        category: "PAIR",
        name: "Pair",
        rank: this.HAND_RANK.PAIR,
        values: [pairRank, kickerRank],
      };
    }

    /*--------------------------------------------

            HIGH CARD

        ---------------------------------------------*/

    return {
      category: "HIGH_CARD",
      name: "High Card",
      rank: this.HAND_RANK.HIGH_CARD,
      values: ranks,
    };
  }

  /*================================================

        COMPARE VALUE ARRAYS

    =================================================*/

  compareValues(valuesA, valuesB) {
    const maxLength = Math.max(valuesA.length, valuesB.length);

    for (let index = 0; index < maxLength; index++) {
      const valueA = valuesA[index] || 0;

      const valueB = valuesB[index] || 0;

      if (valueA > valueB) {
        return 1;
      }

      if (valueA < valueB) {
        return -1;
      }
    }

    return 0;
  }

  /*================================================

        COMPARE TWO HANDS

    =================================================*/

  compareHands(cardsA, cardsB) {
    const handA = this.evaluateHand(cardsA);

    const handB = this.evaluateHand(cardsB);

    if (!handA || !handB) {
      return {
        result: 0,
        handA,
        handB,
      };
    }

    if (handA.rank > handB.rank) {
      return {
        result: 1,
        handA,
        handB,
      };
    }

    if (handA.rank < handB.rank) {
      return {
        result: -1,
        handA,
        handB,
      };
    }

    return {
      result: this.compareValues(handA.values, handB.values),
      handA,
      handB,
    };
  }

  /*================================================

        SHOWDOWN

    =================================================*/

  show(requestingPlayerId) {
    if (this.isProcessing) {
      console.warn("Winner processing already running.");

      return false;
    }

    if (!this.canShow()) {
      console.warn("Show requires exactly two active players.");

      return false;
    }

    if (TURN.currentPlayerId !== requestingPlayerId) {
      console.warn("Show can only be requested during your turn.");

      return false;
    }

    const requestingPlayer = GAME.players.find(
      (player) => player.id === requestingPlayerId,
    );

    if (
      !requestingPlayer ||
      requestingPlayer.packed ||
      requestingPlayer.isActive === false
    ) {
      return false;
    }

    const activePlayers = this.getActivePlayers();

    if (activePlayers.length !== 2) {
      return false;
    }

    const playerA = activePlayers[0];

    const playerB = activePlayers[1];

    this.isProcessing = true;

    TURN.stopTimer();

    if (
      typeof BOT !== "undefined" &&
      typeof BOT.cancelPendingAction === "function"
    ) {
      BOT.cancelPendingAction();
    }

    const comparison = this.compareHands(playerA.cards, playerB.cards);

    if (!comparison.handA || !comparison.handB) {
      console.error("Show failed because cards are invalid.");

      this.isProcessing = false;

      return false;
    }

    let winner = null;
    let loser = null;

    if (comparison.result > 0) {
      winner = playerA;
      loser = playerB;
    } else if (comparison.result < 0) {
      winner = playerB;
      loser = playerA;
    } else {
      /*
                সম্পূর্ণ tie হলে dealer-এর পরের position
                অথবা requesting player winner করার পরিবর্তে
                আপাতত pot দুইজনের মধ্যে ভাগ হবে।
            */

      this.handleTie(playerA, playerB, comparison);

      return true;
    }

    this.completeShow(winner, loser, comparison);

    return true;
  }

  /*================================================

    SERVICE CHARGE CALCULATION

=================================================*/

  calculateWinnerPayout(amount) {
    const grossAmount = Math.max(0, Number(amount) || 0);

    const serviceCharge = Math.floor(
      (grossAmount * this.serviceChargePercent) / 100,
    );

    const netAmount = grossAmount - serviceCharge;

    return {
      grossAmount,
      serviceCharge,
      netAmount,
    };
  }

  /*================================================

        COMPLETE SHOW

    =================================================*/

  async completeShow(winner, loser, comparison) {
    if (!winner || !loser) {
      this.isProcessing = false;

      return false;
    }

    const winnerHand =
      winner.id === this.getActivePlayers()[0]?.id
        ? comparison.handA
        : comparison.handB;

    const loserHand =
      loser.id === this.getActivePlayers()[0]?.id
        ? comparison.handA
        : comparison.handB;

    const settlementRound = Number(GAME.round);

    const payout = GAME.giveWinnerPrize(winner);

    winner.isWinner = true;

    loser.isWinner = false;

    GAME.winner = winner;

    try {
      if (
        typeof MULTIPLAYER !== "undefined" &&
        typeof MULTIPLAYER.settleRound === "function"
      ) {
        const settlement = await MULTIPLAYER.settleRound(
          winner,
          payout,
          settlementRound,
        );

        /*
         * Server response এলে winner-এর
         * final database balance apply।
         */
        if (
          settlement?.winner &&
          Number.isFinite(Number(settlement.winner.walletBalance))
        ) {
          winner.balance = Number(settlement.winner.walletBalance);
        }
      }
    } catch (error) {
      console.error("Winner balance save failed:", error);

      this.showMessage("Winner balance server-এ save হয়নি।");

      this.isProcessing = false;

      return false;
    }

    console.log(`${winner.name} won pot ৳${payout.grossAmount}`);

    console.log(
      `Service charge ৳${payout.serviceCharge}, received ৳${payout.netAmount}`,
    );

    console.log(`${winner.name}: ${winnerHand.name}`);

    console.log(`${loser.name}: ${loserHand.name}`);

    this.revealShowCards(winner.id, loser.id);

    this.updateWinnerUI(winner, winnerHand, payout);

    GAME.pot = 0;

    this.updateFinancialUI(winner.id);

    TURN.isRunning = false;
    TURN.currentPlayerId = null;

    GAME.endRound(winner);

    if (typeof window.updateHumanActionButtons === "function") {
      window.updateHumanActionButtons();
    }

    if (typeof window.scheduleNextRound === "function") {
      window.scheduleNextRound(4000);
    }

    this.isProcessing = false;

    return true;
  }

  /*================================================

        SIDE SHOW

================================================*/

  /*================================================

        SIDE SHOW

================================================*/

  sideShow(requestPlayerId) {
    console.log("SideShow Debug", {
      requestPlayerId,
      currentTurn: TURN.currentPlayerId,
      roundRunning: GAME.roundRunning,
      turnRunning: TURN.isRunning,
    });
    if (this.pendingSideShow) {
      console.log("FAIL 1 : pendingSideShow");
      return false;
    }

    if (this.isProcessing) {
      console.log("FAIL 2 : isProcessing");
      return false;
    }

    if (!GAME.roundRunning || !TURN.isRunning) {
      console.log("FAIL 3 : round or turn stopped");
      return false;
    }

    if (TURN.currentPlayerId !== requestPlayerId) {
      console.log("FAIL 4 : not current player");
      return false;
    }

    const requester = GAME.players.find((p) => p.id === requestPlayerId);

    if (!requester || !requester.seen) {
      console.log("FAIL 5 : requester not seen");
      return false;
    }

    const opponent = this.getPreviousActivePlayer(requestPlayerId);

    if (!opponent) {
      console.log("FAIL 6 : opponent not found");
      return false;
    }

    if (!opponent.seen) {
      console.log("FAIL 7 : opponent not seen");
      return false;
    }

    this.pendingSideShow = {
      requesterId: requester.id,
      opponentId: opponent.id,
    };

    TURN.stopTimer();

    if (
      typeof BOT !== "undefined" &&
      typeof BOT.cancelPendingAction === "function"
    ) {
      BOT.cancelPendingAction();
    }

    if (typeof window.updateHumanActionButtons === "function") {
      window.updateHumanActionButtons();
    }

    console.log(`${requester.name} requested Side Show to ${opponent.name}`);

    // Human player
    if (opponent.id === 4) {
      if (typeof window.showSideShowPopup === "function") {
        window.showSideShowPopup(requester.id, opponent.id);
      }
    }

    // Bot player
    else {
      this.sideShowTimer = setTimeout(() => {
        if (Math.random() < 0.8) {
          WINNER.acceptSideShow();
        } else {
          WINNER.rejectSideShow();
        }
      }, 1500);
    }

    return true;
  }

  acceptSideShow() {
    if (!this.pendingSideShow) {
      return false;
    }

    const requester = GAME.players.find(
      (p) => p.id === this.pendingSideShow.requesterId,
    );

    const opponent = GAME.players.find(
      (p) => p.id === this.pendingSideShow.opponentId,
    );

    if (!requester || !opponent) {
      this.pendingSideShow = null;
      return false;
    }

    const comparison = this.compareHands(requester.cards, opponent.cards);

    let loser;

    if (comparison.result > 0) {
      loser = opponent;
    } else {
      // Tie হলে requester হারবে
      loser = requester;
    }

    TURN.packPlayer(loser.id, "side_show");

    console.log(`${loser.name} lost Side Show`);

    this.pendingSideShow = null;

    if (GAME.roundRunning && TURN.isRunning) {
      TURN.nextTurn();
    }

    return true;
  }

  rejectSideShow() {
    if (!this.pendingSideShow) {
      return false;
    }

    console.log("Side Show Rejected");

    this.pendingSideShow = null;

    if (GAME.roundRunning && TURN.isRunning) {
      TURN.startTurnTimer();
    }

    return true;
  }

  /*================================================

        TIE HANDLING

    =================================================*/

  handleTie(playerA, playerB, comparison) {
    const totalPot = Number(GAME.pot) || 0;

    const firstShare = Math.floor(totalPot / 2);

    const secondShare = totalPot - firstShare;

    playerA.balance += firstShare;
    playerB.balance += secondShare;

    this.revealShowCards(playerA.id, playerB.id);

    console.log(`Round tied: ${comparison.handA.name}`);

    this.showMessage(`Tie: ${comparison.handA.name}`);

    GAME.pot = 0;

    this.updateFinancialUI(playerA.id);
    this.updateFinancialUI(playerB.id);

    TURN.isRunning = false;
    TURN.currentPlayerId = null;

    GAME.endRound(null);

    if (typeof window.updateHumanActionButtons === "function") {
      window.updateHumanActionButtons();
    }

    if (typeof window.scheduleNextRound === "function") {
      window.scheduleNextRound(4000);
    }

    this.isProcessing = false;
  }

  /*================================================

        REVEAL CARDS DURING SHOW

    =================================================*/

  revealShowCards(...playerIds) {
    playerIds.forEach((playerId) => {
      if (
        typeof DECK !== "undefined" &&
        typeof DECK.revealPlayerCardsForShow === "function"
      ) {
        DECK.revealPlayerCardsForShow(playerId);
      }
    });
  }

  /*================================================

        UI UPDATE

    =================================================*/

  updateFinancialUI(playerId) {
    if (typeof UI === "undefined") {
      return;
    }

    if (typeof UI.updatePlayerBalance === "function") {
      UI.updatePlayerBalance(playerId);
    }

    if (typeof UI.updateBalance === "function") {
      UI.updateBalance(playerId);
    }

    if (typeof UI.updatePot === "function") {
      UI.updatePot();
    }
  }

  updateWinnerUI(winner, hand, payout) {
    console.log("Winner:", winner);
    console.log("Hand:", hand);
    console.log("Payout:", payout);

    if (!winner || !hand || !payout) return;

    if (typeof window.showWinnerOverlay === "function") {
      window.showWinnerOverlay(
        winner,
        hand.name,
        payout.grossAmount,
        payout.serviceCharge,
        payout.netAmount,
      );
    }

    if (typeof UI !== "undefined" && typeof UI.showWinner === "function") {
      UI.showWinner(winner.id, payout.netAmount, hand.name);
    }

    if (
      typeof TURN !== "undefined" &&
      typeof TURN.highlightWinner === "function"
    ) {
      TURN.highlightWinner(winner.id);
    }
  }

  showMessage(message) {
    console.log(message);

    const winnerBanner = document.querySelector("#winnerBanner");

    if (winnerBanner) {
      winnerBanner.textContent = message;

      winnerBanner.classList.add("show");

      return;
    }

    alert(message);
  }
}

/*====================================================

    GLOBAL WINNER OBJECT

====================================================*/

const WINNER = new WinnerEngine();

window.WINNER = WINNER;
