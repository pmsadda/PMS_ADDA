"use strict";

/*====================================================

    PMS ADDA
    BETTING ENGINE
    Version 1.1

====================================================*/

class BettingEngine {
  constructor() {
    console.log("Betting Engine Initialized");
  }

  /*============================================

        FIND PLAYER

    ============================================*/

  getPlayer(playerId) {
    return (
      GAME.players.find(
        (player) =>
          Number(player.id) === Number(playerId),
      ) || null
    );
  }

  /*============================================

        BLIND BET

    ============================================*/

  blind(playerId) {
    const player = this.getPlayer(playerId);

    if (!player) {
      return false;
    }

    const amount = Number(GAME.currentBet);

    if (!Number.isFinite(amount) || amount <= 0) {
      console.error(
        "Invalid Blind amount:",
        GAME.currentBet,
      );

      return false;
    }

    return this.placeBet(
      player,
      amount,
      "BLIND",
    );
  }

  /*============================================

        CHAAL BET

    ============================================*/

  chaal(playerId) {
    const player = this.getPlayer(playerId);

    if (!player) {
      return false;
    }

    const currentBet =
      Number(GAME.currentBet);

    const amount = currentBet * 2;

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      console.error(
        "Invalid Chaal amount:",
        amount,
      );

      return false;
    }

    return this.placeBet(
      player,
      amount,
      "CHAAL",
    );
  }

  /*============================================

        RAISE BET

    ============================================*/

  raise(playerId) {
    const player = this.getPlayer(playerId);

    if (
      !player ||
      player.packed ||
      player.isActive === false ||
      !GAME.roundRunning
    ) {
      return false;
    }

    const currentBet =
      Number(GAME.currentBet);

    if (
      !Number.isFinite(currentBet) ||
      currentBet <= 0
    ) {
      console.error(
        "Invalid current bet for Raise:",
        GAME.currentBet,
      );

      return false;
    }

    const currentRaiseCount =
      Number(GAME.raiseCount) || 0;

    const maxRaises =
      Number(GAME.maxRaisesPerRound) || 4;

    if (currentRaiseCount >= maxRaises) {
      console.warn(
        `Maximum ${maxRaises} Raises reached.`,
      );

      return false;
    }

    const raisedBlindAmount =
      currentBet * 2;

    const payableAmount = player.seen
      ? raisedBlindAmount * 2
      : raisedBlindAmount;

    if (player.balance < payableAmount) {
      console.log(
        `${player.name} has insufficient balance for Raise ৳${payableAmount}`,
      );

      return false;
    }

    /*
     * Balance validate হওয়ার পরেই table stake
     * update করা হচ্ছে। এতে failed Raise হলে
     * current bet পরিবর্তন হবে না।
     */
    GAME.currentBet = raisedBlindAmount;

    GAME.raiseCount =
      currentRaiseCount + 1;

    const betType = player.seen
      ? "RAISE CHAAL"
      : "RAISE BLIND";

    const success = this.placeBet(
      player,
      payableAmount,
      betType,
    );

    if (!success) {
      /*
       * অপ্রত্যাশিত কারণে placeBet fail করলে
       * আগের stake ফিরিয়ে দেওয়া হবে।
       */
      GAME.currentBet = currentBet;

      GAME.raiseCount =
        currentRaiseCount;

      return false;
    }

    console.log(
      `${player.name} raised table Blind to ৳${raisedBlindAmount}`,
    );

    if (
      typeof window.updateHumanActionButtons ===
      "function"
    ) {
      window.updateHumanActionButtons();
    }

    return true;
  }

  /*============================================

        COMMON BET

    ============================================*/

  placeBet(player, amount, type) {
    const validAmount = Number(amount);

    if (
      !Number.isFinite(validAmount) ||
      validAmount <= 0
    ) {
      console.error(
        "Invalid betting amount:",
        amount,
      );

      return false;
    }

    if (
      !player ||
      player.packed ||
      player.isActive === false
    ) {
      return false;
    }

    if (player.balance < validAmount) {
      console.log(
        `${player.name} Insufficient Balance`,
      );

      TURN.packPlayer(
        player.id,
        "low_balance",
      );

      return false;
    }

    player.balance -= validAmount;

    player.currentBet = validAmount;

    player.totalBet += validAmount;

    GAME.pot += validAmount;

    if (
      typeof CHIP_ANIMATION !== "undefined" &&
      typeof CHIP_ANIMATION.flyToPot ===
        "function"
    ) {
      CHIP_ANIMATION.flyToPot(
        player.id,
        validAmount,
      );
    }

    if (type === "BLIND") {
      player.blindCount++;
    }

    console.log(
      `${player.name} ${type} Bet ৳${validAmount}`,
    );

    this.updateUI(player.id);

    TURN.nextTurn();

    return true;
  }

  /*============================================

        PACK

    ============================================*/

  pack(playerId) {
    return TURN.packPlayer(
      playerId,
      "manual",
    );
  }

  /*============================================

        UPDATE UI

    ============================================*/

  updateUI(playerId) {
    if (typeof UI === "undefined") {
      return;
    }

    if (
      typeof UI.updateBalance === "function"
    ) {
      UI.updateBalance(playerId);
    }

    if (
      typeof UI.updatePlayerBalance ===
      "function"
    ) {
      UI.updatePlayerBalance(playerId);
    }

    if (
      typeof UI.updatePot === "function"
    ) {
      UI.updatePot();
    }
  }
}

const BETTING = new BettingEngine();