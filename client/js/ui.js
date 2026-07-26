"use strict";

/*====================================================

    PMS ADDA

    UI ENGINE

    Version : 1.0

====================================================*/

class UIEngine {
  constructor() {
    this.humanPlayerSeat = 1;

    this.statusClasses = [
      "status-blind",
      "status-seen",
      "status-packed",
      "status-winner",
    ];

    this.actionButtons = {
      pack: null,
      seen: null,
      bet: null,
      show: null,
    };

    this.initialized = false;
  }

  /*====================================================

        INITIALIZE UI ENGINE

    ====================================================*/

  initialize() {
    this.cacheElements();

    if (typeof GAME !== "undefined" && Array.isArray(GAME.players)) {
      const localPlayer = GAME.players.find(
        (player) => player.isLocalPlayer === true,
      );

      if (localPlayer) {
        this.humanPlayerId = localPlayer.id;
      }
    }

    this.bindPackButton();

    this.updateAll();

    this.initialized = true;

    console.log("UI Engine Initialized. Human Player ID:", this.humanPlayerId);
  }

  /*====================================================

        CACHE ACTION BUTTONS

    ====================================================*/

  cacheElements() {
    this.actionButtons.pack = document.querySelector(".pack-button");

    this.actionButtons.seen = document.querySelector(".seen-button");

    this.actionButtons.bet = document.querySelector(".blind-button");

    this.actionButtons.show = document.querySelector(".show-button");
  }

  /*====================================================

        SAFE QUERY SELECTOR

    ====================================================*/

  findElement(selectors) {
    if (!Array.isArray(selectors)) {
      selectors = [selectors];
    }

    for (const selector of selectors) {
      const element = document.querySelector(selector);

      if (element) {
        return element;
      }
    }

    return null;
  }

  /*====================================================

        GET PLAYER

    ====================================================*/

  getPlayer(playerId) {
    if (typeof GAME === "undefined" || !Array.isArray(GAME.players)) {
      return null;
    }

    const targetId = Number(playerId);

    return (
      GAME.players.find((player) => {
        return Number(player.id) === targetId;
      }) || null
    );
  }

  getPlayerUISlot(playerId) {
    if (typeof GAME === "undefined" || !Array.isArray(GAME.players)) {
      return null;
    }

    const player = this.getPlayer(playerId);

    if (!player) {
      return null;
    }

    /*
     * Local player সবসময় নিচের
     * currentPlayer position-এ থাকবে।
     */
    if (player.isLocalPlayer === true) {
      return "current";
    }

    const localPlayer = GAME.players.find(
      (item) => item.isLocalPlayer === true,
    );

    if (!localPlayer) {
      console.warn("Local player পাওয়া যায়নি।");

      return null;
    }

    const totalSeats = 5;

    const localSeat = Number(localPlayer.seatNo);

    const playerSeat = Number(player.seatNo);

    if (
      !Number.isInteger(localSeat) ||
      !Number.isInteger(playerSeat) ||
      localSeat < 1 ||
      localSeat > totalSeats ||
      playerSeat < 1 ||
      playerSeat > totalSeats
    ) {
      console.warn("Invalid seat number:", {
        playerId: player.id,
        playerSeat,
        localSeat,
      });

      return null;
    }

    /*
     * Local seat থেকে clockwise দূরত্ব।
     *
     * Difference 1 = player1
     * Difference 2 = player2
     * Difference 3 = player3
     * Difference 4 = player4
     */
    const relativeSeat = (playerSeat - localSeat + totalSeats) % totalSeats;

    if (relativeSeat < 1 || relativeSeat > 4) {
      return null;
    }

    return relativeSeat;
  }

  /*====================================================

        GET PLAYER ROOT ELEMENT

    ====================================================*/
  getPlayerElement(playerId) {
    const uiSlot = this.getPlayerUISlot(playerId);

    if (uiSlot === "current") {
      return this.findElement([
        "#currentPlayer",
        ".current-player",
        ".current-player-container",
      ]);
    }

    if (!uiSlot) {
      return null;
    }

    return this.findElement([
      `#player${uiSlot}`,
      `.player${uiSlot}`,
      `.player-${uiSlot}`,
    ]);
  }

  /*====================================================

        GET PLAYER STATUS ELEMENT

    ====================================================*/

  getPlayerStatusElement(playerId) {
    const uiSlot = this.getPlayerUISlot(playerId);

    if (uiSlot === "current") {
      return this.findElement([
        "#currentPlayerStatus",
        ".current-player-status",
      ]);
    }

    if (!uiSlot) {
      return null;
    }

    return this.findElement([
      `#player${uiSlot}Status`,
      `.player${uiSlot}-status`,
    ]);
  }

  /*====================================================

        GET PLAYER BALANCE ELEMENT

    ====================================================*/
  getPlayerBalanceElement(playerId) {
    const uiSlot = this.getPlayerUISlot(playerId);

    if (uiSlot === "current") {
      return this.findElement([
        "#currentPlayerBalance",
        ".current-player-balance",
      ]);
    }

    if (!uiSlot) {
      return null;
    }

    return this.findElement([
      `#player${uiSlot}Balance`,
      `.player${uiSlot}-balance`,
    ]);
  }

  /*====================================================

        GET PLAYER NAME ELEMENT

    ====================================================*/

  getPlayerNameElement(playerId) {
    const uiSlot = this.getPlayerUISlot(playerId);

    if (uiSlot === "current") {
      return this.findElement(["#currentPlayerName", ".current-player-name"]);
    }

    if (!uiSlot) {
      return null;
    }

    return this.findElement([`#player${uiSlot}Name`, `.player${uiSlot}-name`]);
  }

  /*====================================================

        GET PLAYER TIMER ELEMENT

    ====================================================*/

  getPlayerTimerElement(playerId) {
    const uiSlot = this.getPlayerUISlot(playerId);

    if (uiSlot === "current") {
      return this.findElement(["#currentPlayerTimer", ".current-player-timer"]);
    }

    if (!uiSlot) {
      return null;
    }

    return this.findElement([
      `#player${uiSlot}Timer`,
      `.player${uiSlot}-timer`,
    ]);
  }

  /*====================================================

        NORMALIZE PLAYER STATUS

    ====================================================*/

  getPlayerStatus(player) {
    if (!player) {
      return "BLIND";
    }

    if (player.isWinner) {
      return "WINNER";
    }

    if (player.packed || player.isActive === false) {
      return "PACKED";
    }

    if (player.seen) {
      return "SEEN";
    }

    return player.status || "BLIND";
  }

  /*====================================================

        UPDATE PLAYER STATUS

    ====================================================*/

  updatePlayerStatus(playerId) {
    const player = this.getPlayer(playerId);

    if (!player) {
      return false;
    }

    const status = this.getPlayerStatus(player).toUpperCase();

    player.status = status;

    const statusElement = this.getPlayerStatusElement(playerId);

    if (!statusElement) {
      return false;
    }

    statusElement.textContent = status;

    statusElement.classList.remove(...this.statusClasses);

    statusElement.classList.add(`status-${status.toLowerCase()}`);

    return true;
  }

  updateAllPlayers() {
  console.log(
    "updateAllPlayers() called",
  );

  if (
    typeof GAME === "undefined" ||
    !Array.isArray(GAME.players)
  ) {
    return false;
  }

  /*
   * প্রথমে সব UI seat লুকানো হবে।
   */
  const allSeatElements = [
    document.querySelector(
      "#player1",
    ),
    document.querySelector(
      "#player2",
    ),
    document.querySelector(
      "#player3",
    ),
    document.querySelector(
      "#player4",
    ),
    document.querySelector(
      "#currentPlayer",
    ),
  ];

  allSeatElements.forEach(
    (element) => {
      if (!element) {
        return;
      }

      element.style.display = "none";

      element.removeAttribute(
        "data-player-id",
      );

      element.removeAttribute(
        "data-server-seat",
      );
    },
  );

  /*
   * Server player-দের সঠিক UI
   * position-এ দেখানো হবে।
   */
  GAME.players.forEach((player) => {
    const uiSlot =
      this.getPlayerUISlot(
        player.id,
      );

    const playerElement =
      this.getPlayerElement(
        player.id,
      );

    if (
      !uiSlot ||
      !playerElement
    ) {
      console.warn(
        "Player UI slot পাওয়া যায়নি:",
        {
          id: player.id,
          name: player.name,
          seatNo: player.seatNo,
        },
      );

      return;
    }

    playerElement.style.display = "";

    playerElement.dataset.playerId =
      String(player.id);

    playerElement.dataset.serverSeat =
      String(player.seatNo);

    this.updatePlayerName(
      player.id,
    );

    this.updatePlayerBalance(
      player.id,
    );

    this.updatePlayerStatus(
      player.id,
    );

    console.log(
      `${player.name}: Server seat ${player.seatNo} → UI ${uiSlot}`,
    );
  });

  return true;
}

  /*====================================================

        UPDATE ALL PLAYER STATUSES

    ====================================================*/

  updateAllPlayerStatuses() {
    if (typeof GAME === "undefined" || !Array.isArray(GAME.players)) {
      return;
    }

    GAME.players.forEach((player) => {
      this.updatePlayerStatus(player.id);
    });
  }

  /*====================================================

        UPDATE PLAYER NAME

    ====================================================*/

  updatePlayerName(playerId) {
    const player = this.getPlayer(playerId);

    if (!player) {
      return false;
    }

    const nameElement = this.getPlayerNameElement(playerId);

    if (!nameElement) {
      return false;
    }

    nameElement.textContent = player.name;

    return true;
  }

  /*====================================================

        FORMAT MONEY

    ====================================================*/

  formatMoney(amount) {
    const value = Number(amount) || 0;

    return value.toLocaleString("en-US");
  }

  /*====================================================

        UPDATE PLAYER BALANCE

    ====================================================*/

  updatePlayerBalance(playerId) {
    const player = this.getPlayer(playerId);

    if (!player) {
      return false;
    }

    const balanceElement = this.getPlayerBalanceElement(playerId);

    if (!balanceElement) {
      return false;
    }

    balanceElement.textContent = this.formatMoney(player.balance);

    return true;
  }

  /*====================================================

        UPDATE ALL PLAYERS

    ====================================================*/

  /*====================================================

        UPDATE POT

    ====================================================*/

  updatePot(amount = null) {
    const potElement = this.findElement([
      "#potAmount",
      ".pot-amount",
      "#totalPot",
      "[data-game-pot]",
    ]);

    if (!potElement) {
      return false;
    }

    let potValue = amount;

    if (potValue === null && typeof GAME !== "undefined") {
      potValue = GAME.pot;
    }

    potElement.textContent = this.formatMoney(potValue);

    return true;
  }

  /*====================================================

        UPDATE CURRENT BET

    ====================================================*/

  updateCurrentBet(amount = null) {
    const betElement = this.findElement([
      "#currentBet",
      ".current-bet",
      "#betAmount",
      "[data-current-bet]",
    ]);

    if (!betElement) {
      return false;
    }

    let betValue = amount;

    if (betValue === null && typeof GAME !== "undefined") {
      betValue = GAME.currentBet;
    }

    betElement.textContent = this.formatMoney(betValue);

    return true;
  }

  /*====================================================

        CLEAR ACTIVE PLAYER EFFECT

    ====================================================*/

  clearActivePlayer() {
    if (typeof GAME === "undefined" || !Array.isArray(GAME.players)) {
      return;
    }

    GAME.players.forEach((player) => {
      const element = this.getPlayerElement(player.id);

      if (!element) {
        return;
      }

      element.classList.remove("active-player", "player-turn");
    });
  }

  /*====================================================

        SET ACTIVE PLAYER

    ====================================================*/

  setActivePlayer(playerId) {
    this.clearActivePlayer();

    const playerElement = this.getPlayerElement(playerId);

    if (!playerElement) {
      return false;
    }

    playerElement.classList.add("active-player", "player-turn");

    return true;
  }

  /*====================================================

        UPDATE PLAYER TIMER

    ====================================================*/

  updatePlayerTimer(playerId, seconds) {
    const timerElement = this.getPlayerTimerElement(playerId);

    if (!timerElement) {
      return false;
    }

    const safeSeconds = Math.max(0, Number(seconds) || 0);

    timerElement.textContent = safeSeconds;

    timerElement.classList.toggle("timer-warning", safeSeconds <= 5);

    return true;
  }

  /*====================================================

        RESET ALL TIMERS

    ====================================================*/

  resetAllTimers() {
    if (typeof GAME === "undefined" || !Array.isArray(GAME.players)) {
      return;
    }

    GAME.players.forEach((player) => {
      const timerElement = this.getPlayerTimerElement(player.id);

      if (!timerElement) {
        return;
      }

      timerElement.textContent = "";

      timerElement.classList.remove("timer-warning");
    });
  }

  /*====================================================

        SET HUMAN BET BUTTON MODE

    ====================================================*/

  setBetButtonMode(mode) {
    const betButton =
      this.actionButtons.bet || document.querySelector(".blind-button");

    if (!betButton) {
      return false;
    }

    const normalizedMode = String(mode).toLowerCase();

    betButton.classList.remove("blind-mode", "chaal-mode");

    if (normalizedMode === "chaal") {
      betButton.textContent = "Chaal";

      betButton.dataset.betMode = "chaal";

      betButton.classList.add("chaal-mode");
    } else {
      betButton.textContent = "Blind";

      betButton.dataset.betMode = "blind";

      betButton.classList.add("blind-mode");
    }

    return true;
  }

  /*====================================================

        UPDATE HUMAN BUTTONS

    ====================================================*/

  updateActionButtons() {
    const player = GAME.players.find((item) => item.isLocalPlayer === true);

    if (player) {
      this.humanPlayerId = player.id;
    }

    if (!player) {
      return;
    }

    const isPacked = player.packed || player.isActive === false;

    const roundRunning =
      typeof GAME !== "undefined" ? GAME.roundRunning !== false : true;

    const disableActions = isPacked || !roundRunning;

    if (this.actionButtons.pack) {
      this.actionButtons.pack.disabled = disableActions;
    }

    if (this.actionButtons.seen) {
      this.actionButtons.seen.disabled = disableActions || player.seen;

      this.actionButtons.seen.textContent = player.seen ? "Seen" : "Seen";
    }

    if (this.actionButtons.bet) {
      this.actionButtons.bet.disabled = disableActions;
    }

    if (this.actionButtons.show) {
      this.actionButtons.show.disabled = disableActions;
    }

    this.setBetButtonMode(player.seen ? "chaal" : "blind");
  }

  /*====================================================

        MARK PLAYER PACKED

    ====================================================*/

  markPlayerPacked(playerId) {
    const playerElement = this.getPlayerElement(playerId);

    if (playerElement) {
      playerElement.classList.add("player-packed");

      playerElement.classList.remove("active-player", "player-turn");
    }

    this.updatePlayerStatus(playerId);

    if (playerId === this.humanPlayerId) {
      this.updateActionButtons();
    }
  }

  /*====================================================

        CLEAR PLAYER PACKED EFFECTS

    ====================================================*/

  clearPackedEffects() {
    if (typeof GAME === "undefined" || !Array.isArray(GAME.players)) {
      return;
    }

    GAME.players.forEach((player) => {
      const playerElement = this.getPlayerElement(player.id);

      if (!playerElement) {
        return;
      }

      playerElement.classList.remove("player-packed");
    });
  }

  /*====================================================

        SHOW WINNER

    ====================================================*/

  showWinner(playerId, winAmount = 0) {
    const player = this.getPlayer(playerId);

    if (!player) {
      return false;
    }

    player.isWinner = true;
    player.status = "WINNER";

    this.updatePlayerStatus(playerId);

    const playerElement = this.getPlayerElement(playerId);

    if (playerElement) {
      playerElement.classList.add("winner-player");
    }

    const winnerBanner = this.findElement([
      "#winnerBanner",
      ".winner-banner",
      "[data-winner-banner]",
    ]);

    if (winnerBanner) {
      winnerBanner.textContent = `${player.name} wins ${this.formatMoney(winAmount)}`;

      winnerBanner.classList.add("show");

      winnerBanner.hidden = false;
    }

    this.showToast(
      `${player.name} won ${this.formatMoney(winAmount)}`,
      "success",
    );

    return true;
  }

  /*====================================================

        HIDE WINNER

    ====================================================*/

  hideWinner() {
    const winnerBanner = this.findElement([
      "#winnerBanner",
      ".winner-banner",
      "[data-winner-banner]",
    ]);

    if (winnerBanner) {
      winnerBanner.classList.remove("show");

      winnerBanner.hidden = true;
    }

    document.querySelectorAll(".winner-player").forEach((element) => {
      element.classList.remove("winner-player");
    });

    if (typeof GAME !== "undefined" && Array.isArray(GAME.players)) {
      GAME.players.forEach((player) => {
        player.isWinner = false;
      });
    }
  }

  /*====================================================

        SHOW TOAST

    ====================================================*/

  showToast(message, type = "info") {
    let toast = document.querySelector("#gameToast");

    if (!toast) {
      toast = document.createElement("div");

      toast.id = "gameToast";

      toast.className = "game-toast";

      document.body.appendChild(toast);
    }

    toast.textContent = message;

    toast.classList.remove(
      "toast-success",
      "toast-error",
      "toast-warning",
      "toast-info",
      "show",
    );

    toast.classList.add(`toast-${type}`);

    requestAnimationFrame(() => {
      toast.classList.add("show");
    });

    clearTimeout(this.toastTimer);

    this.toastTimer = setTimeout(() => {
      toast.classList.remove("show");
    }, 2500);
  }

  /*====================================================

        ENABLE ACTION BUTTONS

    ====================================================*/

  enableActionButtons() {
    Object.values(this.actionButtons).forEach((button) => {
      if (button) {
        button.disabled = false;
      }
    });

    this.updateActionButtons();
  }

  /*====================================================

        DISABLE ACTION BUTTONS

    ====================================================*/

  disableActionButtons() {
    Object.values(this.actionButtons).forEach((button) => {
      if (button) {
        button.disabled = true;
      }
    });
  }

  /*====================================================

    PACK BUTTON EVENT

    Action handling is controlled by main.js.
    UIEngine will only update the interface.

====================================================*/

  bindPackButton() {
    return true;
  }

  /*====================================================

        RESET ROUND UI

    ====================================================*/

  resetRoundUI() {
    this.hideWinner();

    this.clearActivePlayer();

    this.clearPackedEffects();

    this.resetAllTimers();

    this.cacheElements();

    this.updateAllPlayers();

    this.updatePot();

    this.updateCurrentBet();

    this.updateActionButtons();
  }

  /*====================================================

        UPDATE COMPLETE UI

    ====================================================*/

  updateAll() {
    this.cacheElements();

    this.updateAllPlayers();

    this.updatePot();

    this.updateCurrentBet();

    this.updateActionButtons();
  }
}

/*====================================================

    GLOBAL UI OBJECT

====================================================*/

const UI = new UIEngine();
