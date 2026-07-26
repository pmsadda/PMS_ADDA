"use strict";

/*====================================================

    PMS ADDA
    TURN ENGINE
    Part 1

====================================================*/

class TurnEngine {
  constructor() {
    // বর্তমানে কার turn
    this.currentPlayerId = null;

    // প্রথমে কোন player থেকে turn শুরু হবে
    this.startingPlayerId = 0;

    // এক turn-এর সময়
    this.turnDuration = 15;

    // বাকি সময়
    this.timeLeft = this.turnDuration;

    // Timer interval
    this.timerInterval = null;

    // Turn engine চলছে কি না
    this.isRunning = false;

    // Prevent multiple turn changes
    this.isChangingTurn = false;
  }

  /*============================================

        INITIALIZE TURN ENGINE

    ============================================*/

  initialize() {
    this.stopTimer();

    this.currentPlayerId = null;

    this.timeLeft = this.turnDuration;

    this.isRunning = false;

    this.isChangingTurn = false;

    console.log("Turn Engine Initialized");
  }

  /*============================================

        START TURN SYSTEM

    ============================================*/

  start(startingPlayerId = 0) {
    if (!GAME.players || GAME.players.length === 0) {
      console.warn("Players Not Found");

      return;
    }

    this.stopTimer();

    this.isRunning = true;

    this.startingPlayerId = startingPlayerId;

    const firstPlayerId = this.findNextActivePlayer(null);

    if (firstPlayerId === null) {
      console.warn("No Active Player Found");

      this.isRunning = false;

      return;
    }

    this.setTurn(firstPlayerId);

    console.log("Turn System Started:", firstPlayerId);
  }

  /*============================================

        SET PLAYER TURN

    ============================================*/

  setTurn(playerId) {
    if (!this.isRunning) return;

    const player = GAME.players.find((p) => p.id === playerId);

    if (!this.isPlayerActive(player)) {
      this.nextTurn();

      return;
    }

    this.currentPlayerId = playerId;

    this.timeLeft = this.turnDuration;

    console.log(`Player ${playerId} Turn Started`);

    this.updateTurnUI();

    this.startTimer();

    if (typeof window.updateHumanActionButtons === "function") {
      window.updateHumanActionButtons();
    }

    if (player.isBot && typeof BOT !== "undefined") {
      BOT.play(playerId);
    }
  }

  /*============================================

        START TIMER

    ============================================*/

  startTimer() {
    this.stopTimer();

    this.updateTimerUI();

    this.timerInterval = setInterval(() => {
      this.timeLeft--;

      this.updateTimerUI();

      if (this.timeLeft <= 0) {
        this.stopTimer();

        this.handleTimeout();
      }
    }, 1000);
  }

  /*============================================

        STOP TIMER

    ============================================*/

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);

      this.timerInterval = null;
    }
  }

  /*============================================

        TIMEOUT AUTO PACK

    ============================================*/
  handleTimeout() {
    if (!this.isRunning) {
      return;
    }

    const playerId = this.currentPlayerId;

    const player = GAME.players.find((item) => item.id === playerId);

    if (!player || player.packed) {
      return;
    }

    console.log(`Player ${playerId} Timeout`);

    this.packPlayer(playerId, "timeout");
  }

  /*============================================

        PACK PLAYER

    ============================================*/

  packPlayer(playerId, reason = "manual") {
    const player = GAME.players.find(
      (item) => Number(item.id) === Number(playerId),
    );

    if (!player) {
      console.warn("Pack failed. Player not found:", playerId);

      return false;
    }

    if (player.packed) {
      return false;
    }

    const wasCurrentPlayer = Number(playerId) === Number(this.currentPlayerId);

    const success = GAME.packPlayer(playerId, reason);

    if (!success) {
      return false;
    }

    console.log(`Player ${playerId} packed. Reason: ${reason}`);

    this.updatePackedPlayerUI(playerId);

    if (typeof UI !== "undefined") {
      if (typeof UI.updatePlayerStatus === "function") {
        UI.updatePlayerStatus(playerId);
      }

      if (typeof UI.markPlayerPacked === "function") {
        UI.markPlayerPacked(playerId);
      }
    }

    /*
     * GAME.packPlayer() শেষ active player পেলে
     * settlement, winner overlay এবং next round
     * নিজেই শুরু করে।
     *
     * তাই এখানে দ্বিতীয়বার nextTurn বা winner
     * process করা যাবে না।
     */
    if (!GAME.roundRunning || GAME.getActivePlayers().length <= 1) {
      this.stop();

      return true;
    }

    if (wasCurrentPlayer) {
      this.nextTurn();
    }

    return true;
  }

  /*============================================

        NEXT TURN

    ============================================*/

  nextTurn() {
    if (!this.isRunning) return;

    if (this.isChangingTurn) return;

    if (typeof BOT !== "undefined") {
      BOT.cancelPendingAction();
    }

    this.isChangingTurn = true;

    this.stopTimer();

    if (this.checkRoundEnd()) {
      this.isChangingTurn = false;

      return;
    }

    const nextPlayerId = this.findNextActivePlayer(this.currentPlayerId);

    if (nextPlayerId === null) {
      console.warn("Next Active Player Not Found");

      this.stop();

      this.isChangingTurn = false;

      return;
    }

    this.setTurn(nextPlayerId);

    this.isChangingTurn = false;
  }

  /*============================================

        FIND NEXT ACTIVE PLAYER

    ============================================*/

  findNextActivePlayer(fromPlayerId) {
    const players = GAME.players;

    if (!players || players.length === 0) {
      return null;
    }

    let startIndex = players.findIndex((player) => player.id === fromPlayerId);

    if (startIndex === -1) {
      startIndex = -1;
    }

    for (let step = 1; step <= players.length; step++) {
      const index = (startIndex + step) % players.length;
      const player = players[index];

      if (this.isPlayerActive(player)) {
        return player.id;
      }
    }

    return null;
  }

  /*============================================

        CHECK PLAYER ACTIVE

    ============================================*/

  isPlayerActive(player) {
    if (!player) {
      return false;
    }

    return player.isActive === true && player.packed === false;
  }

  /*============================================

        ACTIVE PLAYERS

    ============================================*/

  getActivePlayers() {
    return GAME.players.filter((player) => this.isPlayerActive(player));
  }

  getActivePlayerIds() {
    const activePlayerIds = [];

    GAME.players.forEach((player, playerId) => {
      if (this.isPlayerActive(player)) {
        activePlayerIds.push(playerId);
      }
    });

    return activePlayerIds;
  }

  /*============================================

        CHECK ROUND END

    ============================================*/

  checkRoundEnd() {
    const activePlayers = GAME.getActivePlayers();

    if (activePlayers.length > 1) {
      return false;
    }

    /*
     * Winner settlement GAME.packPlayer()
     * অথবা WINNER.completeShow() করবে।
     *
     * TURN কেবল timer এবং turn বন্ধ করবে।
     */
    this.stopTimer();

    this.isRunning = false;
    this.currentPlayerId = null;
    this.isChangingTurn = false;

    this.clearTurnUI();

    if (typeof window.updateHumanActionButtons === "function") {
      window.updateHumanActionButtons();
    }

    return true;
  }
  /*============================================

        ROUND WINNER TEMPORARY HOOK

    ============================================*/

  handleRoundWinner(winnerId) {
    const winner = GAME.players.find((player) => player.id === winnerId);

    if (!winner) return;

    winner.isWinner = true;
    winner.status = "WINNER";

    this.highlightWinner(winnerId);

    console.log(`${winner.name} confirmed as winner.`);
  }

  /*============================================

        STOP TURN ENGINE

    ============================================*/

  stop() {
    this.stopTimer();

    this.currentPlayerId = null;

    this.isRunning = false;

    this.isChangingTurn = false;

    this.clearTurnUI();

    console.log("Turn Engine Stopped");

    if (typeof window.updateHumanActionButtons === "function") {
      window.updateHumanActionButtons();
    }
  }

  /*============================================

        TURN UI

    ============================================*/

  updateTurnUI() {
    document.querySelectorAll(".player").forEach((playerElement) => {
      playerElement.classList.remove("active-turn");
    });

    const playerElement = this.getPlayerElement(this.currentPlayerId);

    if (playerElement) {
      playerElement.classList.add("active-turn");
    }
  }

  updateTimerUI() {
    const timerElement = document.querySelector("#turnTimer");

    if (timerElement) {
      timerElement.textContent = this.timeLeft;
    }

    const progressElement = document.querySelector("#turnTimerProgress");

    if (progressElement) {
      const percentage = (this.timeLeft / this.turnDuration) * 100;

      progressElement.style.width = `${percentage}%`;
    }
  }

  updatePackedPlayerUI(playerId) {
    const playerElement = this.getPlayerElement(playerId);

    if (!playerElement) return;

    playerElement.classList.add("player-packed");

    playerElement.classList.remove("active-turn");
  }

  highlightWinner(playerId) {
    const playerElement = this.getPlayerElement(playerId);

    if (!playerElement) return;

    playerElement.classList.add("round-winner");
  }

  clearTurnUI() {
    document.querySelectorAll(".player").forEach((playerElement) => {
      playerElement.classList.remove("active-turn");
    });
  }

  /*============================================

        PLAYER ELEMENT HELPER

    ============================================*/

  getPlayerElement(playerId) {
    if (typeof UI === "undefined") {
      return null;
    }

    return UI.getPlayerElement(playerId);
  }
}

/*====================================================

    GLOBAL TURN OBJECT

====================================================*/

const TURN = new TurnEngine();
