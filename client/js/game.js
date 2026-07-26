"use strict";

/*=====================================================

PMS ADDA
GAME CORE
Version 1.1

======================================================*/

const CONFIG = {
  PLAYER_COUNT: 5,

  START_BALANCE: 0,

  BOT_START_BALANCE: 2000,

  CARD_PER_PLAYER: 3,

  TURN_TIME: 15,

  BOOT_AMOUNT: 0,
};

const BOT_NAMES = [
  "Rakib Ahmed",
  "Sohan Khan",
  "Tanvir Hasan",
  "Nayeem Islam",
  "Fahim Rahman",
  "Imran Hossain",
  "Sabbir Ahmed",
  "Riyad Hasan",
  "Arif Khan",
  "Mehedi Islam",
];

function getRandomBotName() {
  const randomIndex = Math.floor(Math.random() * BOT_NAMES.length);

  return BOT_NAMES[randomIndex];
}

function getRandomBotBalance() {
  const balances = [1500, 2000, 2500, 3000, 4000, 5000];

  const randomIndex = Math.floor(Math.random() * balances.length);

  return balances[randomIndex];
}

/*=====================================================
PLAYER CLASS
======================================================*/

class Player {
  constructor(id, name, isBot, isLocalPlayer = false, balance = null) {
    this.id = id;

    this.name =
      typeof name === "string" && name.trim()
        ? name.trim()
        : isBot
          ? getRandomBotName()
          : "Player";

    this.isBot = isBot;

    // Multiplayer flags
    this.isLocalPlayer = isLocalPlayer;
    this.isRemotePlayer = !isBot && !isLocalPlayer;

    /*
        Human balance server থেকে আসবে।
        Bot balance server না দিলে random থাকবে।
    */

    if (balance !== null) {
      this.balance = balance;
    } else {
      this.balance = isBot ? getRandomBotBalance() : CONFIG.START_BALANCE;
    }

    this.cards = [];

    this.seen = false;

    this.packed = false;

    this.status = "BLIND";

    this.isActive = true;

    this.currentBet = 0;

    this.totalBet = 0;

    this.blindCount = 0;

    this.isDealer = false;

    this.isWinner = false;
  }

  reset() {
    this.cards = [];

    this.seen = false;

    this.packed = false;

    this.status = "BLIND";

    this.isActive = true;

    this.currentBet = 0;

    this.totalBet = 0;

    this.blindCount = 0;

    this.isWinner = false;
  }
}

/*BOT PLAYER

const BOT_PROFILE_MANAGER = {

    names: [
        "Arif Hasan",
        "Rakib Ahmed",
        "Nayeem Islam",
        "Tanvir Hossain",
        "Sohan Khan",
        "Fahim Rahman",
        "Imran Ahmed",
        "Sabbir Hossain",
        "Mehedi Hasan",
        "Rasel Mia",
        "Shakib Khan",
        "Riyad Ahmed",
        "Mahin Chowdhury",
        "Siam Rahman",
        "Adnan Hossain",
        "Rafi Ahmed",
        "Joy Hasan",
        "Nahid Islam",
        "Shuvo Roy",
        "Robin Khan",
        "Akash Ahmed",
        "Sumon Mia",
        "Sajid Hasan",
        "Emon Hossain",
        "Abir Rahman",
        "Mamun Ahmed",
        "Ashik Hasan",
        "Jahid Islam",
        "Rifat Hossain",
        "Al Amin",
        "Sakib Ahmed",
        "Shawon Khan",
        "Masud Rana",
        "Parvez Hossain",
        "Habib Rahman",
        "Rimon Ahmed",
        "Tuhin Hasan",
        "Rony Islam",
        "Nabil Hossain",
        "Farhan Ahmed"
    ],

    usedNames: new Set(),

    getRandomName() {

        const availableNames = this.names.filter(
            name => !this.usedNames.has(name)
        );

        if (availableNames.length === 0) {
            this.usedNames.clear();
            return this.getRandomName();
        }

        const randomIndex = Math.floor(
            Math.random() * availableNames.length
        );

        const name = availableNames[randomIndex];

        this.usedNames.add(name);

        return name;
    },

    getRandomBalance() {

        const balances = [
            850,
            1200,
            1450,
            1800,
            2200,
            2750,
            3200,
            3800,
            4500,
            5200,
            6500,
            7800,
            9500
        ];

        const randomIndex = Math.floor(
            Math.random() * balances.length
        );

        return balances[randomIndex];
    },

    reset() {
        this.usedNames.clear();
    }
};
*/
/*=====================================================
GAME CLASS
======================================================*/

class Game {
  constructor() {
    this.round = 1;

    this.turn = 0;

    this.dealer = 0;

    this.currentBet = CONFIG.BOOT_AMOUNT;

    this.pot = 0;

    this.timer = CONFIG.TURN_TIME;

    this.timerInterval = null;

    this.deck = [];

    this.players = [];

    this.gameStarted = false;

    this.roundRunning = false;

    this.winner = null;

    this.serviceRevenue = 0;

    this.raiseCount = 0;

    this.maxRaisesPerRound = 4;
  }

  /*=================================================
    SYNC TABLE CONFIGURATION
  =================================================*/

  syncTableConfiguration() {
    const serverState = window.SERVER_TABLE_STATE;

    const serverBootAmount = Number(serverState?.table?.boot_amount);

    if (!Number.isFinite(serverBootAmount) || serverBootAmount <= 0) {
      console.error(
        "Invalid server boot amount:",
        serverState?.table?.boot_amount,
      );

      return false;
    }

    CONFIG.BOOT_AMOUNT = serverBootAmount;

    this.currentBet = serverBootAmount;

    console.log(`Teen Patti boot amount synced: ৳${serverBootAmount}`);

    return true;
  }

  initialize() {
    console.log("Initializing Game...");

    const configurationSynced = this.syncTableConfiguration();

    if (!configurationSynced) {
      console.error(
        "Game initialization stopped: room boot amount unavailable.",
      );

      return false;
    }

    this.createPlayers();

    if (this.players.length === 0) {
      console.error("Game initialization stopped: no players loaded.");

      return false;
    }

    this.selectDealer();

    console.table(this.players);

    UI.updateAllPlayers();

    return true;
  }

  /*=================================================
    CREATE PLAYERS
    =================================================*/
  createPlayers() {
    this.players = [];

    const tableState = window.SERVER_TABLE_STATE;

    if (!tableState || !Array.isArray(tableState.players)) {
      console.warn("SERVER_TABLE_STATE এখনও পাওয়া যায়নি.");

      return false;
    }

    const storedUserId = localStorage.getItem("user_id");

    const currentUser = JSON.parse(
      localStorage.getItem("current_user") || "null",
    );

    const myUserId = Number(
      storedUserId || currentUser?.id || currentUser?.user_id,
    );

    console.log("Current local user ID:", myUserId);

    tableState.players.forEach((item) => {
      const isBot = item.is_bot === true || item.player_type === "bot";

      const playerUserId = Number(item.user_id || 0);

      const isLocalPlayer = !isBot && playerUserId === myUserId;

      const playerName = isBot
        ? item.bot_name || item.bot_code || "Bot"
        : item.full_name || item.username || item.uid || "Player";

      const player = new Player(
        Number(item.id),
        playerName,
        isBot,
        isLocalPlayer,
        Number(item.wallet_balance || 0),
      );

      player.tablePlayerId = Number(item.id);

      player.userId = playerUserId;

      player.botId = Number(item.bot_id || 0);

      player.uid = item.uid || null;

      player.avatarUrl = item.avatar_url || null;

      player.playerType = item.player_type || (isBot ? "bot" : "real");

      player.seatNo = Number(item.seat_no);

      player.isDealer = Boolean(item.is_dealer);

      player.isActive = Boolean(item.is_active);

      player.seen = Boolean(item.is_seen);

      player.packed = Boolean(item.is_packed);

      player.currentBet = Number(item.current_bet || 0);

      player.totalWin = Number(item.total_win || 0);

      player.status = player.packed ? "PACKED" : player.seen ? "SEEN" : "BLIND";

      this.players.push(player);
    });

    /*
     * Server seat number অনুযায়ী
     * player list সাজানো হবে।
     */
    this.players.sort(
      (firstPlayer, secondPlayer) => firstPlayer.seatNo - secondPlayer.seatNo,
    );

    console.table(
      this.players.map((player) => ({
        id: player.id,
        name: player.name,
        seatNo: player.seatNo,
        isBot: player.isBot,
        isLocalPlayer: player.isLocalPlayer,
        balance: player.balance,
      })),
    );

    return true;
  }
  /*=================================================
  WINNER PAYOUT
=================================================*/

  giveWinnerPrize(winner) {
    if (!winner) {
      console.error("Winner payout calculation failed: winner missing.");

      return null;
    }

    const grossAmount = Math.max(0, Number(this.pot) || 0);

    const serviceChargePercent = 5;

    const serviceCharge = Math.floor(
      (grossAmount * serviceChargePercent) / 100,
    );

    const netAmount = Math.max(0, grossAmount - serviceCharge);

    /*
     * গুরুত্বপূর্ণ:
     * এখানে winner.balance পরিবর্তন হবে না।
     *
     * Final wallet balance কেবল server
     * settlement response থেকে আসবে।
     */
    winner.lastWin = netAmount;

    console.log(`${winner.name} payout calculated:`, {
      grossAmount,
      serviceChargePercent,
      serviceCharge,
      netAmount,
    });

    return {
      grossAmount,
      serviceChargePercent,
      serviceCharge,
      netAmount,
    };
  }

  /*=================================================
    HUMAN PLAYER
    =================================================*/

  getHumanPlayer() {
    return this.players.find((player) => player.isLocalPlayer) || null;
  }

  /*=================================================
    LOAD HUMAN BALANCE
    =================================================*/

  setHumanBalance(balance) {
    const player = this.getHumanPlayer();

    const parsedBalance = Number(balance);

    if (!player) {
      console.error("Human player not found.");

      return false;
    }

    if (!Number.isFinite(parsedBalance) || parsedBalance < 0) {
      console.error("Invalid player balance:", balance);

      return false;
    }

    player.balance = parsedBalance;

    console.log(`Human balance loaded: ৳${parsedBalance}`);

    return true;
  }

  /*=================================================
    CURRENT PLAYER
    =================================================*/

  getCurrentPlayer() {
    return this.players[this.turn] || null;
  }

  /*=================================================
    DEALER
    =================================================*/

  getDealer() {
    return this.players[this.dealer] || null;
  }

  selectDealer() {
    this.players.forEach((player) => {
      player.isDealer = false;
    });

    const dealerPlayer = this.getDealer();

    if (dealerPlayer) {
      dealerPlayer.isDealer = true;
    }
  }

  nextDealer() {
    if (this.players.length === 0) {
      return;
    }

    this.players[this.dealer].isDealer = false;

    this.dealer = (this.dealer + 1) % this.players.length;

    this.players[this.dealer].isDealer = true;

    console.log("New Dealer:", this.players[this.dealer].name);
  }

  /*=================================================
    ACTIVE PLAYERS
    =================================================*/

  getActivePlayers() {
    return this.players.filter((player) => {
      return player.isActive && !player.packed;
    });
  }

  getActivePlayerCount() {
    return this.getActivePlayers().length;
  }

  isRoundOver() {
    return this.getActivePlayerCount() <= 1;
  }

  /*=================================================
    FIRST TURN
    =================================================*/

  setFirstTurn() {
    if (this.players.length === 0) {
      this.turn = 0;

      return;
    }

    /*
        Dealer-এর পরের player প্রথম turn পাবে।
        */

    this.turn = (this.dealer + 1) % this.players.length;
  }

  /*=================================================
    RESET ROUND
    =================================================*/

  resetRound() {
    this.stopTimer();

    if (
      typeof CHIP_ANIMATION !== "undefined" &&
      typeof CHIP_ANIMATION.clearPotChips === "function"
    ) {
      CHIP_ANIMATION.clearPotChips();
    }

    this.pot = 0;

    this.currentBet = CONFIG.BOOT_AMOUNT;

    this.raiseCount = 0;

    this.timer = CONFIG.TURN_TIME;

    this.winner = null;

    this.deck = [];

    this.players.forEach((player) => {
      player.reset();

      if (
        typeof UI !== "undefined" &&
        typeof UI.updatePlayerStatus === "function"
      ) {
        UI.updatePlayerStatus(player.id);
      }
    });
  }

  /*
    Compatibility method.

    অন্য file-এ যদি GAME.resetPlayers()
    ব্যবহার করা হয়ে থাকে, তাহলে সেটি কাজ করবে।
    */

  resetPlayers() {
    this.players.forEach((player) => {
      player.reset();
    });

    console.log("Players Reset");
  }

  /*=================================================
    COLLECT BOOT
=================================================*/

  collectBoot() {
    this.pot = 0;
    this.currentBet = CONFIG.BOOT_AMOUNT;

    this.players.forEach((player) => {
      if (!player.isActive || player.packed) {
        return;
      }

      if (player.balance < CONFIG.BOOT_AMOUNT) {
        player.isActive = false;
        player.packed = true;
        player.status = "LOW BALANCE";
        return;
      }

      player.balance -= CONFIG.BOOT_AMOUNT;

      player.currentBet = CONFIG.BOOT_AMOUNT;

      player.totalBet = CONFIG.BOOT_AMOUNT;

      this.pot += CONFIG.BOOT_AMOUNT;

      if (typeof UI !== "undefined") {
        if (typeof UI.updatePlayerBalance === "function") {
          UI.updatePlayerBalance(player.id);
        }

        if (typeof UI.updatePlayerStatus === "function") {
          UI.updatePlayerStatus(player.id);
        }
      }
    });

    if (typeof UI !== "undefined" && typeof UI.updatePot === "function") {
      UI.updatePot();
    }

    if (
      typeof CHIP_ANIMATION !== "undefined" &&
      typeof CHIP_ANIMATION.collectBoot === "function"
    ) {
      CHIP_ANIMATION.collectBoot(this.players, CONFIG.BOOT_AMOUNT);
    }

    console.log("Boot Collected. Pot =", this.pot);
  }

  /*=================================================
    START ROUND
    =================================================*/

  startRound() {
    if (this.players.length === 0) {
      console.error("Cannot start round: no players found.");
      return false;
    }

    if (this.roundRunning) {
      console.warn("A round is already running.");
      return false;
    }

    /*
        প্রথম round-এর পরে প্রতিবার dealer
        এক ধাপ সামনে যাবে।
    */
    if (this.gameStarted === true) {
      this.nextDealer();
    }

    this.resetRound();

    /*
        নতুন dealer-এর পরের player
        প্রথম turn পাবে।
    */
    this.collectBoot();
    this.setFirstTurn();

    this.roundRunning = true;
    this.gameStarted = true;

    console.log(`Round ${this.round} started.`);
    console.log("Dealer:", this.dealer);
    console.log("First Turn:", this.turn);

    return true;
  }

  /*=================================================
    END ROUND
    =================================================*/

  endRound(winner = null) {
    if (!this.roundRunning) {
      console.warn("No active round to end.");

      return false;
    }

    this.stopTimer();

    this.roundRunning = false;

    this.winner = winner;

    if (winner) {
      winner.isWinner = true;
    }

    console.log(`Round ${this.round} ended.`);

    this.round++;

    this.nextDealer();

    return true;
  }

  /*=================================================
    TIMER CLEANUP
    =================================================*/

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);

      this.timerInterval = null;
    }

    this.timer = CONFIG.TURN_TIME;
  }

  setPlayerStatus(playerId, status) {
    const player = this.players.find((item) => item.id === playerId);
    status = typeof status === "string" ? status.trim().toUpperCase() : "";

    if (!player) {
      console.warn("Cannot update status. Player not found:", playerId);

      return false;
    }

    const allowedStatuses = [
      "BLIND",
      "SEEN",
      "PACKED",
      "THINKING",
      "THINKING...",
      "WINNER",
      "LOW BALANCE",
      "WAITING",
      "DISCONNECTED",
    ];

    if (!allowedStatuses.includes(status)) {
      console.warn("Invalid player status:", status);

      return false;
    }

    player.status = status;

    if (
      typeof UI !== "undefined" &&
      typeof UI.updatePlayerStatus === "function"
    ) {
      UI.updatePlayerStatus(playerId);
    }

    return true;
  }

  packPlayer(playerId, reason = "manual") {
    const player = this.players.find((item) => item.id === playerId);

    if (!player || player.packed) {
      return false;
    }

    player.packed = true;
    player.isActive = false;
    player.status = "PACKED";

    if (
      typeof UI !== "undefined" &&
      typeof UI.updatePlayerStatus === "function"
    ) {
      UI.updatePlayerStatus(playerId);
    }

    if (
      typeof UI !== "undefined" &&
      typeof UI.markPlayerPacked === "function"
    ) {
      UI.markPlayerPacked(playerId);
    }

    console.log(`${player.name} packed. Reason: ${reason}`);

    const activePlayers = this.getActivePlayers();

    if (activePlayers.length === 1 && this.roundRunning) {
      const winner = activePlayers[0];

      if (
        typeof CHIP_ANIMATION !== "undefined" &&
        typeof CHIP_ANIMATION.flyPotToWinner === "function"
      ) {
        CHIP_ANIMATION.flyPotToWinner(winner.id);
      }

      const settlementRound = Number(this.round);

      const payout = this.giveWinnerPrize(winner);

      this.winner = winner;
      winner.isWinner = true;

      if (
        typeof MULTIPLAYER !== "undefined" &&
        typeof MULTIPLAYER.settleRound === "function"
      ) {
        MULTIPLAYER.settleRound(winner, payout, settlementRound)
          .then((settlement) => {
            if (
              settlement?.winner &&
              Number.isFinite(Number(settlement.winner.walletBalance))
            ) {
              winner.balance = Number(settlement.winner.walletBalance);

              if (
                typeof UI !== "undefined" &&
                typeof UI.updatePlayerBalance === "function"
              ) {
                UI.updatePlayerBalance(winner.id);
              }
            }
          })
          .catch((error) => {
            console.error("Pack winner balance save failed:", error);
          });
      }

      console.log(`${winner.name} is the last active player.`);

      if (typeof window.showWinnerOverlay === "function") {
        window.showWinnerOverlay(
          winner,
          "Winner by Pack",
          payout.grossAmount,
          payout.serviceCharge,
          payout.netAmount,
        );
      }

      this.pot = 0;

      if (
        typeof UI !== "undefined" &&
        typeof UI.updatePlayerBalance === "function"
      ) {
        UI.updatePlayerBalance(winner.id);
      }

      if (typeof UI !== "undefined" && typeof UI.updatePot === "function") {
        UI.updatePot();
      }

      this.endRound(winner);

      if (typeof window.updateHumanActionButtons === "function") {
        window.updateHumanActionButtons();
      }

      if (typeof window.scheduleNextRound === "function") {
        window.scheduleNextRound(4000);
      }
    }

    return true;
  }
}

/*=====================================================
GLOBAL GAME INSTANCE
======================================================*/

const GAME = new Game();
