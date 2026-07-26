"use strict";

/*====================================================

    PMS ADDA
    MAIN CONTROLLER
    Version 2.0

====================================================*/

window.addEventListener("load", async () => {
  /*
   * Multiplayer socket connection start।
   */
  if (typeof MULTIPLAYER !== "undefined") {
    MULTIPLAYER.initialize();
  } else {
    console.error("Multiplayer module পাওয়া যায়নি।");
  }

  const winnerSound = new Audio("../assets/sounds/winner.mp3");

  winnerSound.preload = "auto";
  winnerSound.volume = 0.8;
  console.log("PMS ADDA Loading...");

  const seenButton = document.querySelector("#seenButton");

  const betButton = document.querySelector("#betButton");

  const raiseButton = document.querySelector("#raiseButton");

  const packButton = document.querySelector("#packButton");

  const showButton = document.querySelector("#showButton");

  const sideShowButton = document.getElementById("sideShowButton");

  const winnerOverlay = document.querySelector("#winnerOverlay");

  const winnerPlayerName = document.querySelector("#winnerPlayerName");

  const winnerHandName = document.querySelector("#winnerHandName");

  const winnerAmount = document.querySelector("#winnerAmount");

  const nextRoundText = document.querySelector("#nextRoundText");

  let nextRoundTimer = null;
  let nextRoundCountdownTimer = null;

  /*================================================

        GET HUMAN PLAYER

    =================================================*/

  function getHumanPlayer() {
    return GAME.players.find((player) => player.isLocalPlayer === true) || null;
  }

  function isHumanTurn() {
    const humanPlayer = getHumanPlayer();

    if (!humanPlayer) {
      return false;
    }

    return (
      TURN.isRunning === true &&
      Number(TURN.currentPlayerId) === Number(humanPlayer.id) &&
      humanPlayer.isActive === true &&
      humanPlayer.packed === false
    );
  }

  /*================================================

        UPDATE HUMAN ACTION BUTTONS

    =================================================*/

  window.updateHumanActionButtons = function () {
    const humanPlayer = getHumanPlayer();

    if (!humanPlayer) {
      return;
    }

    const canPlay = isHumanTurn();

    const activePlayerCount = GAME.getActivePlayerCount();

    /*--------------------------------------------

            SEEN BUTTON

        ---------------------------------------------*/

    /*--------------------------------------------

        SEEN BUTTON

---------------------------------------------*/

    if (seenButton) {
      seenButton.disabled =
        !GAME.roundRunning ||
        humanPlayer.seen ||
        humanPlayer.packed ||
        !humanPlayer.isActive;
    }
    /*--------------------------------------------

            BLIND / CHAAL BUTTON

        ---------------------------------------------*/

    if (betButton) {
      betButton.disabled = !canPlay;

      betButton.textContent = humanPlayer.seen ? "Chaal" : "Blind";
    }

    /*--------------------------------------------

            RAISE BUTTON

    ---------------------------------------------*/

    if (raiseButton) {
      const currentBet = Number(GAME.currentBet) || 0;

      const nextBlindAmount = currentBet * 2;

      const raisePayableAmount = humanPlayer.seen
        ? nextBlindAmount * 2
        : nextBlindAmount;

      const raiseLimitReached =
        Number(GAME.raiseCount) >= Number(GAME.maxRaisesPerRound);

      const insufficientBalance =
        Number(humanPlayer.balance) < raisePayableAmount;

      raiseButton.disabled =
        !canPlay ||
        raiseLimitReached ||
        insufficientBalance ||
        nextBlindAmount <= 0;

      if (raiseLimitReached) {
        raiseButton.textContent = "Raise Limit";
      } else {
        raiseButton.textContent = `Raise ৳${raisePayableAmount}`;
      }
    }

    /*--------------------------------------------

            PACK BUTTON

        ---------------------------------------------*/

    if (packButton) {
      packButton.disabled = !canPlay;
    }

    /*--------------------------------------------

            SHOW BUTTON

        ---------------------------------------------*/

    if (showButton) {
      showButton.disabled = !canPlay || activePlayerCount !== 2;
    }

    if (sideShowButton) {
      let enable = false;

      if (
        GAME.roundRunning &&
        TURN.isRunning &&
        humanPlayer &&
        Number(TURN.currentPlayerId) === Number(humanPlayer.id)
      ) {
        const activePlayers = WINNER.getActivePlayers();

        if (humanPlayer.seen && activePlayers.length > 2) {
          const humanIndex = activePlayers.findIndex(
            (p) => Number(p.id) === Number(humanPlayer.id),
          );

          if (humanIndex !== -1) {
            const opponentIndex =
              (humanIndex - 1 + activePlayers.length) % activePlayers.length;

            const opponent = activePlayers[opponentIndex];

            if (opponent && opponent.seen) {
              enable = true;
            }
          }
        }
      }

      sideShowButton.disabled = !enable;
    }

        if (
      typeof window.updateHeaderWallet ===
      "function"
    ) {
      window.updateHeaderWallet();
    }
  };
  /*================================================

    REMOVE WINNER GLOW

=================================================*/

  function removeWinnerGlow() {
    document.querySelectorAll(".winner-glow").forEach((element) => {
      element.classList.remove("winner-glow");
    });
  }

  /*================================================

    FIND PLAYER ELEMENT

=================================================*/

  function getPlayerElement(playerId) {
    const selectors = [
      `[data-player-id="${playerId}"]`,

      `#player-${playerId}`,

      `#player${playerId}`,

      `.player-${playerId}`,

      `.player${playerId}`,
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);

      if (element) {
        return element;
      }
    }

    return null;
  }

  /*================================================

    SHOW WINNER OVERLAY

=================================================*/
 window.showWinnerOverlay = function (
  winner,
  handName,
  grossAmount,
  serviceCharge,
  netAmount,
) {
  if (!winnerOverlay || !winner) {
    return false;
  }

  const formatMoney = (amount) => {
    const value = Number(amount);

    return Number.isFinite(value)
      ? value.toFixed(2)
      : "0.00";
  };

  const winnerGrossAmount =
    document.getElementById("winnerGrossAmount");

  const winnerServiceCharge =
    document.getElementById("winnerServiceCharge");

  const winnerNetAmount =
    document.getElementById("winnerNetAmount");

  playWinnerSound();

  removeWinnerGlow();

  if (winnerPlayerName) {
    winnerPlayerName.textContent =
      winner.name || "Winner";
  }

  if (winnerHandName) {
    winnerHandName.textContent =
      handName || "Winning Hand";
  }

  if (winnerAmount) {
    winnerAmount.textContent =
      `+৳${formatMoney(netAmount)}`;
  }

  if (winnerGrossAmount) {
    winnerGrossAmount.textContent =
      `৳${formatMoney(grossAmount)}`;
  }

  if (winnerServiceCharge) {
    winnerServiceCharge.textContent =
      `-৳${formatMoney(serviceCharge)}`;
  }

  if (winnerNetAmount) {
    winnerNetAmount.textContent =
      `৳${formatMoney(netAmount)}`;
  }

  const winnerElement =
    getPlayerElement(winner.id);

  if (winnerElement) {
    winnerElement.classList.add("winner-glow");
  }

  winnerOverlay.classList.remove("show");

  void winnerOverlay.offsetWidth;

  winnerOverlay.classList.add("show");

  return true;
};

  /*================================================

    HIDE WINNER OVERLAY

=================================================*/

  window.hideWinnerOverlay = function () {
    if (winnerOverlay) {
      winnerOverlay.classList.remove("show");
    }

    removeWinnerGlow();
  };

  function playWinnerSound() {
    try {
      winnerSound.pause();
      winnerSound.currentTime = 0;

      const playPromise = winnerSound.play();

      if (playPromise !== undefined) {
        playPromise.catch((error) => {
          console.warn("Winner sound could not play:", error);
        });
      }
    } catch (error) {
      console.warn("Winner sound error:", error);
    }
  }

  /*================================================

    RESET ROUND UI

=================================================*/

  function resetRoundUI() {
    window.hideWinnerOverlay();

    document
      .querySelectorAll(".active-turn, .current-turn, .turn-active")
      .forEach((element) => {
        element.classList.remove("active-turn", "current-turn", "turn-active");
      });

    if (typeof UI !== "undefined") {
      if (typeof UI.resetRoundUI === "function") {
        UI.resetRoundUI();
      }

      if (typeof UI.updatePot === "function") {
        UI.updatePot();
      }
    }
  }

  /*================================================

    START NEW ROUND

=================================================*/

  window.startNextRound = async function () {
    if (nextRoundTimer) {
      clearTimeout(nextRoundTimer);
      nextRoundTimer = null;
    }

    if (nextRoundCountdownTimer) {
      clearInterval(nextRoundCountdownTimer);

      nextRoundCountdownTimer = null;
    }

    resetRoundUI();

    if (
      typeof BOT !== "undefined" &&
      typeof BOT.cancelPendingAction === "function"
    ) {
      BOT.cancelPendingAction();
    }

    if (typeof TURN !== "undefined" && typeof TURN.stopTimer === "function") {
      TURN.stopTimer();
    }

    const roundStarted = GAME.startRound();

    if (!roundStarted) {
      console.error("Next round could not start.");

      return false;
    }

    await DECK.startRound();

    TURN.start(GAME.turn);

    window.updateHumanActionButtons();

    console.log("New round started successfully.");

    return true;
  };

  /*================================================

    AUTO NEXT ROUND

=================================================*/

  window.scheduleNextRound = function (delay = 4000) {
    if (nextRoundTimer) {
      clearTimeout(nextRoundTimer);
    }

    if (nextRoundCountdownTimer) {
      clearInterval(nextRoundCountdownTimer);
    }

    let seconds = Math.ceil(delay / 1000);

    if (nextRoundText) {
      nextRoundText.textContent = `Next round starting in ${seconds}...`;
    }

    nextRoundCountdownTimer = setInterval(() => {
      seconds -= 1;

      if (seconds <= 0) {
        clearInterval(nextRoundCountdownTimer);

        nextRoundCountdownTimer = null;

        return;
      }

      if (nextRoundText) {
        nextRoundText.textContent = `Next round starting in ${seconds}...`;
      }
    }, 1000);

    nextRoundTimer = setTimeout(async () => {
      nextRoundTimer = null;

      await window.startNextRound();
    }, delay);
  };

  window.showSideShowPopup = function (requesterId, opponentId) {
    const modal = document.getElementById("sideShowModal");
    const message = document.getElementById("sideShowMessage");

    const requester = GAME.players.find((player) => player.id === requesterId);

    const opponent = GAME.players.find((player) => player.id === opponentId);

    if (!modal || !message || !requester || !opponent) {
      console.error("Side Show popup data missing.");
      return false;
    }

    message.textContent = `${requester.name} wants Side Show with ${opponent.name}.`;

    modal.classList.add("show");

    return true;
  };

  const acceptSideShowButton = document.getElementById("acceptSideShowButton");

  const rejectSideShowButton = document.getElementById("rejectSideShowButton");

  if (acceptSideShowButton) {
    acceptSideShowButton.addEventListener("click", function () {
      const modal = document.getElementById("sideShowModal");

      if (modal) {
        modal.classList.remove("show");
      }

      WINNER.acceptSideShow();

      if (typeof window.updateHumanActionButtons === "function") {
        window.updateHumanActionButtons();
      }
    });
  }

  if (rejectSideShowButton) {
    rejectSideShowButton.addEventListener("click", function () {
      const modal = document.getElementById("sideShowModal");

      if (modal) {
        modal.classList.remove("show");
      }

      WINNER.rejectSideShow();

      if (typeof window.updateHumanActionButtons === "function") {
        window.updateHumanActionButtons();
      }
    });
  }

  const params = new URLSearchParams(window.location.search);

  const tableId = params.get("tableId");
  console.log("TABLE ID:", tableId);

  const response = await fetch(
    APP_CONFIG.api(
        `/teenpatti/table/${tableId}`
    ),
    {
      headers: {
        Authorization: "Bearer " + localStorage.getItem("access_token"),
      },
    },
  );

  const result = await response.json();

  console.log("TABLE STATE:", result);

  if (!result.success) {
    alert(result.message || "Table state load failed.");
    return;
  }

  if (!result.data || !Array.isArray(result.data.players)) {
    console.error("Players data পাওয়া যায়নি:", result);
    alert("Table players data পাওয়া যায়নি।");
    return;
  }

  console.log("SERVER PLAYERS:", result.data.players);

  /*
  Server table data-কে global রাখা হচ্ছে,
  যাতে game.js এটি ব্যবহার করতে পারে।
*/

  window.SERVER_TABLE_STATE = result.data;

  /*================================================

      START GAME

=================================================*/

  GAME.initialize();

  TURN.initialize();

  const roundStarted = GAME.startRound();

  if (!roundStarted) {
    console.error("Round could not start.");
    return;
  }

  await DECK.startRound();

  TURN.start(GAME.turn);

  window.updateHumanActionButtons();

  window.updateHeaderWallet = function () {
    const walletElement = document.getElementById("headerWallet");

    if (!walletElement) return;

    const me = GAME.players.find((p) => p.isLocalPlayer === true);

    if (!me) return;

    walletElement.textContent =
      "৳" + Number(me.balance).toLocaleString("en-US");
  }
  window.updateHeaderWallet();

  const backButton = document.querySelector(".back-btn");

  if (backButton) {
    backButton.addEventListener("click", () => {
      window.location.href = "../pages/lobby.html";
    });
  }
  /*================================================

        SEE CARDS BUTTON

    =================================================*/

  if (seenButton) {
    seenButton.addEventListener("click", () => {
      const humanPlayer = getHumanPlayer();

      if (!humanPlayer) {
        return;
      }

      if (!isHumanTurn()) {
        console.warn("এখন Human Player-এর turn নয়।");

        return;
      }

      if (humanPlayer.seen) {
        return;
      }

      const success = DECK.seeCards(humanPlayer.id);

      if (!success) {
        return;
      }

      humanPlayer.seen = true;

      GAME.setPlayerStatus(humanPlayer.id, "SEEN");

      console.log("Human player cards revealed.");

      window.updateHumanActionButtons();
    });
  }

  /*================================================

        BLIND / CHAAL BUTTON

    =================================================*/

  if (betButton) {
    betButton.addEventListener("click", () => {
      const humanPlayer = getHumanPlayer();

      if (!humanPlayer) {
        return;
      }

      if (!isHumanTurn()) {
        console.warn("এখন Human Player-এর turn নয়।");

        return;
      }

      betButton.disabled = true;

      let success = false;

      if (humanPlayer.seen) {
        success = BETTING.chaal(humanPlayer.id);
      } else {
        success = BETTING.blind(humanPlayer.id);
      }

      if (!success) {
        window.updateHumanActionButtons();
      }
    });
  }

  /*================================================

        RAISE BUTTON

  =================================================*/

  if (raiseButton) {
    raiseButton.addEventListener("click", () => {
      const humanPlayer = getHumanPlayer();

      if (!humanPlayer) {
        return;
      }

      if (!isHumanTurn()) {
        console.warn("এখন Human Player-এর turn নয়।");

        return;
      }

      raiseButton.disabled = true;

      const success = BETTING.raise(humanPlayer.id);

      if (!success) {
        window.updateHumanActionButtons();
      }
    });
  }

  /*================================================

        PACK BUTTON

    =================================================*/

  if (packButton) {
    packButton.addEventListener("click", () => {
      if (!isHumanTurn()) {
        console.warn("এখন Human Player-এর turn নয়।");

        return;
      }

      packButton.disabled = true;
      const humanPlayer = getHumanPlayer();

      if (!humanPlayer) {
        return;
      }
      const success = BETTING.pack(humanPlayer.id);

      if (!success) {
        window.updateHumanActionButtons();
      }
    });
  }

  /*================================================

        SHOW BUTTON

    =================================================*/

  if (showButton) {
    showButton.addEventListener("click", () => {
      if (!isHumanTurn()) {
        console.warn("এখন Human Player-এর turn নয়।");
        return;
      }

      if (GAME.getActivePlayerCount() !== 2) {
        console.warn("Show করার জন্য ২ জন active player প্রয়োজন।");
        return;
      }

      if (typeof WINNER === "undefined") {
        console.error("Winner Engine পাওয়া যায়নি।");
        return;
      }

      showButton.disabled = true;

      const humanPlayer = getHumanPlayer();

      if (!humanPlayer) {
        return;
      }

      const success = WINNER.show(humanPlayer.id);
      if (!success) {
        window.updateHumanActionButtons();
      }
    });
  }

  if (sideShowButton) {
    sideShowButton.addEventListener("click", function () {
      sideShowButton.disabled = true;

      const humanPlayer = getHumanPlayer();

      if (!humanPlayer) {
        return;
      }

      const success = WINNER.sideShow(humanPlayer.id);

      if (!success) {
        if (typeof window.updateHumanActionButtons === "function") {
          window.updateHumanActionButtons();
        }
      }
    });
  }
});
