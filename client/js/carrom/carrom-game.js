/* ==========================================
   PMS ADDA CARROM TABLE CONTROLLER
   Frontend Demonstration
========================================== */

(() => {
  "use strict";

  /* ==================================
     DOM Elements
  ================================== */

  const elements = {
    canvas:
      document.getElementById(
        "carromCanvas",
      ),

    board:
      document.getElementById(
        "carromBoard",
      ),

    boardMessage:
      document.getElementById(
        "boardMessage",
      ),

    entryAmount:
      document.getElementById(
        "entryAmount",
      ),

    playerMode:
      document.getElementById(
        "playerMode",
      ),

    serviceCharge:
      document.getElementById(
        "serviceCharge",
      ),

    matchCode:
      document.getElementById(
        "matchCode",
      ),

    walletBalance:
      document.getElementById(
        "walletBalance",
      ),

    goldTeamScore:
      document.getElementById(
        "goldTeamScore",
      ),

    greenTeamScore:
      document.getElementById(
        "greenTeamScore",
      ),

    roundNumber:
      document.getElementById(
        "roundNumber",
      ),

    turnStatus:
      document.getElementById(
        "turnStatus",
      ),

    powerRange:
      document.getElementById(
        "powerRange",
      ),

    powerValue:
      document.getElementById(
        "powerValue",
      ),

    shootButton:
      document.getElementById(
        "shootButton",
      ),

    resetAimButton:
      document.getElementById(
        "resetAimButton",
      ),

    soundButton:
      document.getElementById(
        "soundButton",
      ),

    settingsButton:
      document.getElementById(
        "settingsButton",
      ),

    backButton:
      document.getElementById(
        "backButton",
      ),

    rulesButton:
      document.getElementById(
        "rulesButton",
      ),

    emojiButton:
      document.getElementById(
        "emojiButton",
      ),

    messageButton:
      document.getElementById(
        "messageButton",
      ),

    exitButton:
      document.getElementById(
        "exitButton",
      ),

    rulesModal:
      document.getElementById(
        "rulesModal",
      ),

    closeRulesButton:
      document.getElementById(
        "closeRulesButton",
      ),

    exitModal:
      document.getElementById(
        "exitModal",
      ),

    cancelExitButton:
      document.getElementById(
        "cancelExitButton",
      ),

    confirmExitButton:
      document.getElementById(
        "confirmExitButton",
      ),

    winnerOverlay:
      document.getElementById(
        "winnerOverlay",
      ),

    winnerName:
      document.getElementById(
        "winnerName",
      ),

    winnerMessage:
      document.getElementById(
        "winnerMessage",
      ),

    winnerPrize:
      document.getElementById(
        "winnerPrize",
      ),

    returnLobbyButton:
      document.getElementById(
        "returnLobbyButton",
      ),

    liveStatusDot:
      document.getElementById(
        "liveStatusDot",
      ),

    liveStatusText:
      document.getElementById(
        "liveStatusText",
      ),

    toast:
      document.getElementById(
        "carromToast",
      ),

    toastIcon:
      document.getElementById(
        "carromToastIcon",
      ),

    toastMessage:
      document.getElementById(
        "carromToastMessage",
      ),
  };

  /* ==================================
     State
  ================================== */

  const state = {
    user: null,

    selectedRoom: null,

    playerMode: 2,

    engine: null,

    soundEnabled: true,

    shotRunning: false,

    goldScore: 0,

    greenScore: 0,

    roundNumber: 1,

    turnSeconds: 20,

    turnTimerId: null,

    toastTimerId: null,

    frontendDemo: true,
  };

  /* ==================================
     Storage
  ================================== */

  function readStoredJson(key) {
    const value =
      localStorage.getItem(key);

    if (!value) {
      return null;
    }

    try {
      return JSON.parse(value);
    } catch (error) {
      console.error(
        `Invalid ${key}:`,
        error,
      );

      localStorage.removeItem(key);

      return null;
    }
  }

  function initializeStoredData() {
    state.user =
      readStoredJson(
        "current_user",
      ) || {};

    state.selectedRoom =
      readStoredJson(
        "selected_carrom_room",
      ) || {
        game: "carrom",

        roomId: 1,

        roomCode:
          "CARROM-DEMO",

        roomName:
          "Frontend Demo Board",

        entryAmount: 20,

        playerMode: 2,

        serviceChargePercent: 10,
      };

    const selectedMode =
      Number(
        state.selectedRoom
          .playerMode,
      );

    state.playerMode =
      selectedMode === 4
        ? 4
        : 2;
  }

  /* ==================================
     General Helpers
  ================================== */

  function toMoney(value) {
    const amount =
      Number(value);

    if (
      !Number.isFinite(amount) ||
      amount < 0
    ) {
      return 0;
    }

    return Number(
      amount.toFixed(2),
    );
  }

  function formatMoney(value) {
    return toMoney(value)
      .toLocaleString(
        "en-BD",
        {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        },
      );
  }

  function getUserName() {
    return String(
      state.user?.fullName ||
        state.user?.full_name ||
        state.user?.username ||
        state.user?.uid ||
        "You",
    ).trim();
  }

  function getUserAvatar() {
    return (
      state.user?.avatarUrl ||
      state.user?.avatar_url ||
      "../assets/images/default-avatar.png"
    );
  }

  function calculatePrize() {
    const entryAmount =
      toMoney(
        state.selectedRoom
          ?.entryAmount,
      );

    const playerCount =
      state.playerMode;

    const chargePercent =
      toMoney(
        state.selectedRoom
          ?.serviceChargePercent,
      );

    const grossPot =
      toMoney(
        entryAmount *
          playerCount,
      );

    const serviceCharge =
      toMoney(
        grossPot *
          chargePercent /
          100,
      );

    const netPrize =
      toMoney(
        grossPot -
          serviceCharge,
      );

    return {
      entryAmount,
      playerCount,
      chargePercent,
      grossPot,
      serviceCharge,
      netPrize,

      prizePerWinningPlayer:
        state.playerMode === 4
          ? toMoney(
              netPrize / 2,
            )
          : netPrize,
    };
  }

  /* ==================================
     Toast and Messages
  ================================== */

  function showToast(
    message,
    type = "info",
  ) {
    if (
      !elements.toast ||
      !elements.toastIcon ||
      !elements.toastMessage
    ) {
      return;
    }

    if (state.toastTimerId) {
      window.clearTimeout(
        state.toastTimerId,
      );
    }

    elements.toast.classList.remove(
      "is-visible",
      "is-success",
      "is-error",
    );

    elements.toastMessage.textContent =
      message;

    if (type === "success") {
      elements.toast.classList.add(
        "is-success",
      );

      elements.toastIcon.className =
        "fa-solid fa-circle-check";
    } else if (
      type === "error"
    ) {
      elements.toast.classList.add(
        "is-error",
      );

      elements.toastIcon.className =
        "fa-solid fa-circle-exclamation";
    } else {
      elements.toastIcon.className =
        "fa-solid fa-circle-info";
    }

    window.requestAnimationFrame(
      () => {
        elements.toast.classList.add(
          "is-visible",
        );
      },
    );

    state.toastTimerId =
      window.setTimeout(() => {
        elements.toast.classList.remove(
          "is-visible",
        );
      }, 3000);
  }

  function setBoardMessage(
    message,
    type = "info",
  ) {
    if (!elements.boardMessage) {
      return;
    }

    elements.boardMessage.textContent =
      message;

    elements.boardMessage
      .classList.remove(
        "is-success",
        "is-error",
      );

    if (type === "success") {
      elements.boardMessage
        .classList.add(
          "is-success",
        );
    }

    if (type === "error") {
      elements.boardMessage
        .classList.add(
          "is-error",
        );
    }
  }

  function setModalVisibility(
    modal,
    isVisible,
  ) {
    if (!modal) {
      return;
    }

    modal.hidden =
      !isVisible;

    document.body.style.overflow =
      isVisible
        ? "hidden"
        : "";
  }

  /* ==================================
     Match Information
  ================================== */

  function renderMatchInformation() {
    const prize =
      calculatePrize();

    elements.entryAmount.textContent =
      `Entry: ৳${formatMoney(
        prize.entryAmount,
      )}`;

    elements.playerMode.textContent =
      `Players: ${
        state.playerMode
      }`;

    elements.serviceCharge.textContent =
      `Charge: ${
        prize.chargePercent
      }%`;

    elements.matchCode.textContent =
      state.selectedRoom
        ?.roomCode ||
      "CARROM-DEMO";

    elements.walletBalance.textContent =
      `৳${formatMoney(
        state.user
          ?.walletBalance,
      )}`;

    elements.liveStatusText.textContent =
      "Frontend Demo";

    elements.liveStatusDot
      ?.classList.remove(
        "is-offline",
      );
  }

  function configurePlayerPanels() {
    const userName =
      getUserName();

    const userAvatar =
      getUserAvatar();

    const playerNames =
      state.playerMode === 4
        ? [
            userName,
            "Player 2",
            "Player 3",
            "Player 4",
          ]
        : [
            userName,
            "Opponent",
          ];

    for (
      let seat = 1;
      seat <= 4;
      seat += 1
    ) {
      const panel =
        document.getElementById(
          `playerPanel${seat}`,
        );

      const name =
        document.getElementById(
          `playerName${seat}`,
        );

      const avatar =
        document.getElementById(
          `playerAvatar${seat}`,
        );

      const team =
        document.getElementById(
          `playerTeam${seat}`,
        );

      const score =
        document.getElementById(
          `playerScore${seat}`,
        );

      const isSeatUsed =
        seat <=
        state.playerMode;

      if (panel) {
        panel.hidden =
          !isSeatUsed;

        panel.classList.toggle(
          "is-empty",
          !isSeatUsed,
        );
      }

      if (!isSeatUsed) {
        continue;
      }

      if (name) {
        name.textContent =
          playerNames[
            seat - 1
          ];
      }

      if (avatar) {
        avatar.src =
          seat === 1
            ? userAvatar
            : "../assets/images/default-avatar.png";

        avatar.onerror = () => {
          avatar.onerror = null;

          avatar.src =
            "../assets/images/default-avatar.png";
        };
      }

      const isGoldTeam =
        seat === 1 ||
        seat === 3;

      if (team) {
        team.textContent =
          isGoldTeam
            ? "TEAM GOLD"
            : "TEAM GREEN";
      }

      if (score) {
        score.textContent =
          "Score: 0";
      }
    }
  }

  /* ==================================
     Score
  ================================== */

  function updateScoreUI() {
    elements.goldTeamScore.textContent =
      String(state.goldScore);

    elements.greenTeamScore.textContent =
      String(state.greenScore);

    elements.roundNumber.textContent =
      String(state.roundNumber);

    const playerOneScore =
      document.getElementById(
        "playerScore1",
      );

    const playerTwoScore =
      document.getElementById(
        "playerScore2",
      );

    const playerThreeScore =
      document.getElementById(
        "playerScore3",
      );

    const playerFourScore =
      document.getElementById(
        "playerScore4",
      );

    if (playerOneScore) {
      playerOneScore.textContent =
        `Score: ${state.goldScore}`;
    }

    if (playerThreeScore) {
      playerThreeScore.textContent =
        `Score: ${state.goldScore}`;
    }

    if (playerTwoScore) {
      playerTwoScore.textContent =
        `Score: ${state.greenScore}`;
    }

    if (playerFourScore) {
      playerFourScore.textContent =
        `Score: ${state.greenScore}`;
    }
  }

  function handlePocket(piece) {
    if (
      piece.type === "white"
    ) {
      state.goldScore += 1;

      setBoardMessage(
        "White coin pocketed!",
        "success",
      );
    } else if (
      piece.type === "black"
    ) {
      state.greenScore += 1;

      setBoardMessage(
        "Black coin pocketed!",
        "success",
      );
    } else if (
      piece.type === "queen"
    ) {
      state.goldScore += 3;

      setBoardMessage(
        "Queen pocketed! Cover required.",
        "success",
      );
    } else if (
      piece.type === "striker"
    ) {
      state.goldScore =
        Math.max(
          0,
          state.goldScore - 1,
        );

      setBoardMessage(
        "Striker foul! One point deducted.",
        "error",
      );
    }

    updateScoreUI();
  }

  /* ==================================
     Turn Timer
  ================================== */

  function updateTurnTimerUI() {
    const timer =
      document.getElementById(
        "turnTimer1",
      );

    if (timer) {
      timer.textContent =
        String(
          state.turnSeconds,
        );
    }
  }

  function stopTurnTimer() {
    if (state.turnTimerId) {
      window.clearInterval(
        state.turnTimerId,
      );

      state.turnTimerId = null;
    }
  }

  function startTurnTimer() {
    stopTurnTimer();

    state.turnSeconds = 20;

    updateTurnTimerUI();

    state.turnTimerId =
      window.setInterval(() => {
        if (state.shotRunning) {
          return;
        }

        state.turnSeconds -= 1;

        updateTurnTimerUI();

        if (
          state.turnSeconds <= 0
        ) {
          state.turnSeconds = 20;

          state.engine?.resetAim();

          setBoardMessage(
            "Turn timer restarted in frontend demo.",
          );

          updateTurnTimerUI();
        }
      }, 1000);
  }

  /* ==================================
     Controls
  ================================== */

  function setControlsEnabled(
    enabled,
  ) {
    elements.powerRange.disabled =
      !enabled;

    elements.shootButton.disabled =
      !enabled;

    elements.resetAimButton.disabled =
      !enabled;

    elements.board
      ?.classList.toggle(
        "is-moving",
        !enabled,
      );
  }

  function updatePower(value) {
    const power =
      Math.min(
        100,
        Math.max(
          10,
          Number(value) || 50,
        ),
      );

    elements.powerRange.value =
      String(power);

    elements.powerValue.textContent =
      `${power}%`;

    state.engine?.setPower(
      power,
    );
  }

  function handleShotStart() {
    state.shotRunning = true;

    stopTurnTimer();

    setControlsEnabled(false);

    setBoardMessage(
      "Coins are moving...",
    );

    elements.turnStatus.innerHTML = `
      <span class="carrom-live-dot"></span>

      <strong>Strike Running</strong>

      <small>Wait until every coin stops</small>
    `;
  }

  function handleShotComplete(
    result,
  ) {
    state.shotRunning = false;

    state.roundNumber += 1;

    updateScoreUI();

    setControlsEnabled(true);

    if (
      result.pocketed.length === 0
    ) {
      setBoardMessage(
        "No coin pocketed. Try another angle.",
      );
    } else if (
      result.strikerPocketed
    ) {
      setBoardMessage(
        "Striker foul recorded.",
        "error",
      );
    } else {
      setBoardMessage(
        `${result.pocketed.length} piece pocketed!`,
        "success",
      );
    }

    elements.turnStatus.innerHTML = `
      <span class="carrom-live-dot"></span>

      <strong>Your Turn</strong>

      <small>Aim and select power</small>
    `;

    startTurnTimer();

    if (
      result.remainingCoins === 0
    ) {
      showDemoWinner();
    }
  }

  function shootStriker() {
    if (
      state.shotRunning ||
      !state.engine
    ) {
      return;
    }

    const wasStarted =
      state.engine.shoot(
        elements.powerRange.value,
      );

    if (!wasStarted) {
      showToast(
        "Select a valid aim direction",
        "error",
      );
    }
  }

  /* ==================================
     Winner
  ================================== */

  function showDemoWinner() {
    stopTurnTimer();

    const prize =
      calculatePrize();

    const goldWon =
      state.goldScore >=
      state.greenScore;

    elements.winnerName.textContent =
      goldWon
        ? "Team Gold"
        : "Team Green";

    elements.winnerMessage.textContent =
      "Frontend demonstration completed. No wallet transaction was made.";

    elements.winnerPrize.textContent =
      `৳${formatMoney(
        prize.prizePerWinningPlayer,
      )}`;

    setModalVisibility(
      elements.winnerOverlay,
      true,
    );
  }

  /* ==================================
     Engine Initialization
  ================================== */

  function initializeEngine() {
    if (
      typeof window
        .PMSCarromEngine !==
      "function"
    ) {
      setBoardMessage(
        "Carrom engine could not load.",
        "error",
      );

      showToast(
        "Carrom physics engine is unavailable",
        "error",
      );

      setControlsEnabled(false);

      return;
    }

    state.engine =
      new window.PMSCarromEngine(
        elements.canvas,
        {
          onPocket:
            handlePocket,

          onShotStart:
            handleShotStart,

          onShotComplete:
            handleShotComplete,

          onAimChange:
            () => {
              elements.board
                ?.classList.toggle(
                  "is-aiming",
                  Boolean(
                    state.engine
                      ?.isAiming,
                  ),
                );
            },
        },
      );

    updatePower(
      elements.powerRange.value,
    );

    setBoardMessage(
      "Drag striker or tap the board to aim",
    );

    startTurnTimer();
  }

  /* ==================================
     Events
  ================================== */

  elements.powerRange
    ?.addEventListener(
      "input",
      (event) => {
        updatePower(
          event.target.value,
        );
      },
    );

  elements.shootButton
    ?.addEventListener(
      "click",
      shootStriker,
    );

  elements.resetAimButton
    ?.addEventListener(
      "click",
      () => {
        state.engine?.resetAim();

        setBoardMessage(
          "Aim reset",
        );
      },
    );

  elements.soundButton
    ?.addEventListener(
      "click",
      () => {
        state.soundEnabled =
          !state.soundEnabled;

        const icon =
          elements.soundButton
            .querySelector("i");

        if (icon) {
          icon.className =
            state.soundEnabled
              ? "fa-solid fa-volume-high"
              : "fa-solid fa-volume-xmark";
        }

        showToast(
          state.soundEnabled
            ? "Sound enabled"
            : "Sound muted",
        );
      },
    );

  elements.settingsButton
    ?.addEventListener(
      "click",
      () => {
        showToast(
          "More Carrom settings will be added later.",
        );
      },
    );

  elements.rulesButton
    ?.addEventListener(
      "click",
      () => {
        setModalVisibility(
          elements.rulesModal,
          true,
        );
      },
    );

  elements.closeRulesButton
    ?.addEventListener(
      "click",
      () => {
        setModalVisibility(
          elements.rulesModal,
          false,
        );
      },
    );

  elements.exitButton
    ?.addEventListener(
      "click",
      () => {
        setModalVisibility(
          elements.exitModal,
          true,
        );
      },
    );

  elements.backButton
    ?.addEventListener(
      "click",
      () => {
        setModalVisibility(
          elements.exitModal,
          true,
        );
      },
    );

  elements.cancelExitButton
    ?.addEventListener(
      "click",
      () => {
        setModalVisibility(
          elements.exitModal,
          false,
        );
      },
    );

  elements.confirmExitButton
    ?.addEventListener(
      "click",
      () => {
        window.location.href =
          "carrom-rooms.html";
      },
    );

  elements.returnLobbyButton
    ?.addEventListener(
      "click",
      () => {
        window.location.href =
          "lobby.html";
      },
    );

  elements.emojiButton
    ?.addEventListener(
      "click",
      () => {
        showToast(
          "👏 Nice shot!",
          "success",
        );
      },
    );

  elements.messageButton
    ?.addEventListener(
      "click",
      () => {
        showToast(
          "Quick messages will be connected with Socket.IO later.",
        );
      },
    );

  elements.rulesModal
    ?.addEventListener(
      "click",
      (event) => {
        if (
          event.target ===
          elements.rulesModal
        ) {
          setModalVisibility(
            elements.rulesModal,
            false,
          );
        }
      },
    );

  elements.exitModal
    ?.addEventListener(
      "click",
      (event) => {
        if (
          event.target ===
          elements.exitModal
        ) {
          setModalVisibility(
            elements.exitModal,
            false,
          );
        }
      },
    );

  window.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape") {
        setModalVisibility(
          elements.rulesModal,
          false,
        );

        setModalVisibility(
          elements.exitModal,
          false,
        );
      }

      if (
        event.code === "Space" &&
        !state.shotRunning &&
        !elements.rulesModal
          ?.hidden === false
      ) {
        event.preventDefault();

        shootStriker();
      }
    },
  );

  window.addEventListener(
    "beforeunload",
    () => {
      stopTurnTimer();

      state.engine?.destroy();
    },
  );

  /* ==================================
     Start Frontend Demo
  ================================== */

  initializeStoredData();

  renderMatchInformation();

  configurePlayerPanels();

  updateScoreUI();

  initializeEngine();

  showToast(
    "Carrom frontend demo loaded. Wallet has not been charged.",
    "success",
  );
})();