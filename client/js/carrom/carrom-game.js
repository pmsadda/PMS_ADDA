/* ==========================================
   TPL22 CARROM TABLE CONTROLLER
   Frontend Demonstration
========================================== */

(() => {
  "use strict";

  /* ==================================
     DOM Elements
  ================================== */

  const elements = {
    canvas: document.getElementById("carromCanvas"),

    board: document.getElementById("carromBoard"),

    boardMessage: document.getElementById("boardMessage"),

    entryAmount: document.getElementById("entryAmount"),

    playerMode: document.getElementById("playerMode"),

    serviceCharge: document.getElementById("serviceCharge"),

    matchCode: document.getElementById("matchCode"),

    walletBalance: document.getElementById("walletBalance"),

    goldTeamScore: document.getElementById("goldTeamScore"),

    greenTeamScore: document.getElementById("greenTeamScore"),

    roundNumber: document.getElementById("roundNumber"),

    turnStatus: document.getElementById("turnStatus"),

    powerRange: document.getElementById("powerRange"),

    powerValue: document.getElementById("powerValue"),

    shootButton: document.getElementById("shootButton"),

    resetAimButton: document.getElementById("resetAimButton"),

    soundButton: document.getElementById("soundButton"),

    settingsButton: document.getElementById("settingsButton"),

    backButton: document.getElementById("backButton"),

    rulesButton: document.getElementById("rulesButton"),

    emojiButton: document.getElementById("emojiButton"),

    messageButton: document.getElementById("messageButton"),

    exitButton: document.getElementById("exitButton"),

    rulesModal: document.getElementById("rulesModal"),

    closeRulesButton: document.getElementById("closeRulesButton"),

    exitModal: document.getElementById("exitModal"),

    cancelExitButton: document.getElementById("cancelExitButton"),

    confirmExitButton: document.getElementById("confirmExitButton"),

    winnerOverlay: document.getElementById("winnerOverlay"),

    winnerName: document.getElementById("winnerName"),

    winnerMessage: document.getElementById("winnerMessage"),

    winnerPrize: document.getElementById("winnerPrize"),

    returnLobbyButton: document.getElementById("returnLobbyButton"),

    liveStatusDot: document.getElementById("liveStatusDot"),

    liveStatusText: document.getElementById("liveStatusText"),

    toast: document.getElementById("carromToast"),

    toastIcon: document.getElementById("carromToastIcon"),

    toastMessage: document.getElementById("carromToastMessage"),
  };

  /* ==================================
     State
  ================================== */

  const state = {
    user: null,

    selectedRoom: null,

    matchId: null,

    matchState: null,

    currentPlayer: null,

    isLoadingMatch: false,

    playerMode: 2,

    engine: null,

    soundEnabled: true,

    shotRunning: false,

    goldScore: 0,

    greenScore: 0,

    roundNumber: 1,

    turnSeconds: 20,

    turnTimerId: null,

    matchPollTimerId: null,

    socket: null,

    socketConnected: false,

    toastTimerId: null,
    frontendDemo: true,
  };

  /* ==================================
     Storage
  ================================== */

  function readStoredJson(key) {
    const value = localStorage.getItem(key);

    if (!value) {
      return null;
    }

    try {
      return JSON.parse(value);
    } catch (error) {
      console.error(`Invalid ${key}:`, error);

      localStorage.removeItem(key);

      return null;
    }
  }

  function initializeStoredData() {
    state.user = readStoredJson("current_user") || {};

    state.selectedRoom = readStoredJson("selected_carrom_room") || {
      game: "carrom",

      roomId: 1,

      roomCode: "CARROM-DEMO",

      roomName: "Frontend Demo Board",

      entryAmount: 20,

      playerMode: 2,

      serviceChargePercent: 10,
    };

    const selectedMode = Number(state.selectedRoom.playerMode);

    state.playerMode = selectedMode === 4 ? 4 : 2;
  }

  /* ==================================
   Real Match API
================================== */

  function getAccessToken() {
    return localStorage.getItem("access_token");
  }

  function getMatchIdFromPage() {
    const query = new URLSearchParams(window.location.search);

    const queryMatchId = Number(query.get("matchId"));

    if (Number.isInteger(queryMatchId) && queryMatchId > 0) {
      return queryMatchId;
    }

    const storedMatch = readStoredJson("current_carrom_match");

    const storedMatchId = Number(storedMatch?.matchId);

    if (Number.isInteger(storedMatchId) && storedMatchId > 0) {
      return storedMatchId;
    }

    return null;
  }

  function redirectToLogin() {
    localStorage.removeItem("access_token");

    window.location.href = "/login";
  }

  async function apiRequest(endpoint, options = {}) {
    const controller = new AbortController();

    const timeoutId = window.setTimeout(() => {
      controller.abort();
    }, 15000);

    try {
      const response = await fetch(APP_CONFIG.api(endpoint), {
        ...options,

        headers: {
          Accept: "application/json",

          ...(options.body
            ? {
                "Content-Type": "application/json",
              }
            : {}),

          Authorization: `Bearer ${getAccessToken()}`,

          ...(options.headers || {}),
        },

        signal: controller.signal,
      });

      let result = null;

      try {
        result = await response.json();
      } catch (_error) {
        result = null;
      }

      if (response.status === 401) {
        redirectToLogin();

        throw new Error("Your login session has expired");
      }

      if (!response.ok) {
        const error = new Error(
          result?.message || "Unable to load Carrom match",
        );

        error.code = result?.code || "CARROM_REQUEST_FAILED";

        error.statusCode = response.status;

        throw error;
      }

      return result;
    } catch (error) {
      if (error.name === "AbortError") {
        throw new Error("Server response timeout");
      }

      throw error;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  function applyCarromMatchState(matchState) {
    const match = matchState?.match;

    if (!match?.id) {
      throw new Error("Invalid Carrom match state");
    }

    state.matchId = Number(match.id);

    state.matchState = matchState;

    state.playerMode = Number(match.playerMode) === 4 ? 4 : 2;

    state.selectedRoom = {
      game: "carrom",

      roomId: Number(match.roomId),

      roomCode: match.roomCode,

      roomName: match.roomName,

      entryAmount: Number(match.entryAmount),

      playerMode: state.playerMode,

      serviceChargePercent: Number(match.serviceChargePercent),
    };

    const currentUserId = Number(state.user?.id || state.user?.userId);

    state.currentPlayer =
      matchState.players?.find(
        (player) => Number(player.userId) === currentUserId,
      ) || null;

    if (state.currentPlayer) {
      state.user = {
        ...state.user,

        walletBalance: Number(state.currentPlayer.walletBalance),
      };

      localStorage.setItem("current_user", JSON.stringify(state.user));
    }

    localStorage.setItem(
      "selected_carrom_room",
      JSON.stringify(state.selectedRoom),
    );

    localStorage.setItem(
      "current_carrom_match",
      JSON.stringify({
        matchId: state.matchId,

        roomId: Number(match.roomId),

        matchCode: match.matchCode,

        status: match.status,

        savedAt: new Date().toISOString(),

        state: matchState,
      }),
    );
  }

  async function loadCarromMatchState() {
    if (!getAccessToken()) {
      redirectToLogin();

      return null;
    }

    const matchId = getMatchIdFromPage();

    if (!matchId) {
      throw new Error("Carrom match ID was not found");
    }

    state.isLoadingMatch = true;

    try {
      const result = await apiRequest(`/carrom/matches/${matchId}`);

      const matchState = result?.data;

      applyCarromMatchState(matchState);

      return matchState;
    } finally {
      state.isLoadingMatch = false;
    }
  }

  /* ==================================
     General Helpers
  ================================== */

  function toMoney(value) {
    const amount = Number(value);

    if (!Number.isFinite(amount) || amount < 0) {
      return 0;
    }

    return Number(amount.toFixed(2));
  }

  function formatMoney(value) {
    return toMoney(value).toLocaleString("en-BD", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
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
    const entryAmount = toMoney(state.selectedRoom?.entryAmount);

    const playerCount = state.playerMode;

    const chargePercent = toMoney(state.selectedRoom?.serviceChargePercent);

    const grossPot = toMoney(entryAmount * playerCount);

    const serviceCharge = toMoney((grossPot * chargePercent) / 100);

    const netPrize = toMoney(grossPot - serviceCharge);

    return {
      entryAmount,
      playerCount,
      chargePercent,
      grossPot,
      serviceCharge,
      netPrize,

      prizePerWinningPlayer:
        state.playerMode === 4 ? toMoney(netPrize / 2) : netPrize,
    };
  }

  /* ==================================
     Toast and Messages
  ================================== */

  function showToast(message, type = "info") {
    if (!elements.toast || !elements.toastIcon || !elements.toastMessage) {
      return;
    }

    if (state.toastTimerId) {
      window.clearTimeout(state.toastTimerId);
    }

    elements.toast.classList.remove("is-visible", "is-success", "is-error");

    elements.toastMessage.textContent = message;

    if (type === "success") {
      elements.toast.classList.add("is-success");

      elements.toastIcon.className = "fa-solid fa-circle-check";
    } else if (type === "error") {
      elements.toast.classList.add("is-error");

      elements.toastIcon.className = "fa-solid fa-circle-exclamation";
    } else {
      elements.toastIcon.className = "fa-solid fa-circle-info";
    }

    window.requestAnimationFrame(() => {
      elements.toast.classList.add("is-visible");
    });

    state.toastTimerId = window.setTimeout(() => {
      elements.toast.classList.remove("is-visible");
    }, 3000);
  }

  function setBoardMessage(message, type = "info") {
    if (!elements.boardMessage) {
      return;
    }

    elements.boardMessage.textContent = message;

    elements.boardMessage.classList.remove("is-success", "is-error");

    if (type === "success") {
      elements.boardMessage.classList.add("is-success");
    }

    if (type === "error") {
      elements.boardMessage.classList.add("is-error");
    }
  }

  function setModalVisibility(modal, isVisible) {
    if (!modal) {
      return;
    }

    modal.hidden = !isVisible;

    document.body.style.overflow = isVisible ? "hidden" : "";
  }

  /* ==================================
     Match Information
  ================================== */
  function renderMatchInformation() {
    const match = state.matchState?.match;

    const prize = calculatePrize();

    elements.entryAmount.textContent = `Entry: ৳${formatMoney(
      match?.entryAmount ?? prize.entryAmount,
    )}`;

    elements.playerMode.textContent = `Players: ${
      match?.playerMode || state.playerMode
    }`;

    elements.serviceCharge.textContent = `Charge: ${
      match?.serviceChargePercent ?? prize.chargePercent
    }%`;

    elements.matchCode.textContent =
      match?.matchCode || state.selectedRoom?.roomCode || "CARROM";

    elements.walletBalance.textContent = `৳${formatMoney(
      state.currentPlayer?.walletBalance ?? state.user?.walletBalance,
    )}`;

    const status = String(match?.status || "waiting").toLowerCase();

    const statusLabels = {
      waiting: "Waiting for players",

      countdown: "Starting match",

      playing: "Live Match",

      paused: "Match Paused",

      settling: "Calculating Result",

      completed: "Match Completed",

      cancelled: "Match Cancelled",

      failed: "Match Failed",
    };

    elements.liveStatusText.textContent =
      statusLabels[status] || status.toUpperCase();

    const isLive = [
      "waiting",
      "countdown",
      "playing",
      "paused",
      "settling",
    ].includes(status);

    elements.liveStatusDot?.classList.toggle("is-offline", !isLive);
  }

  function configurePlayerPanels() {
    const players = Array.isArray(state.matchState?.players)
      ? state.matchState.players
      : [];

    const requiredPlayers = Number(
      state.matchState?.match?.requiredPlayers || state.playerMode,
    );

    for (let seat = 1; seat <= 4; seat += 1) {
      const panel = document.getElementById(`playerPanel${seat}`);

      const name = document.getElementById(`playerName${seat}`);

      const avatar = document.getElementById(`playerAvatar${seat}`);

      const team = document.getElementById(`playerTeam${seat}`);

      const score = document.getElementById(`playerScore${seat}`);

      const isSeatUsed = seat <= requiredPlayers;

      const player =
        players.find((item) => Number(item.seatNo) === seat) || null;

      if (panel) {
        panel.hidden = !isSeatUsed;

        panel.classList.toggle("is-empty", isSeatUsed && !player);

        panel.classList.toggle(
          "is-current-user",
          Number(player?.userId) === Number(state.currentPlayer?.userId),
        );
      }

      if (!isSeatUsed) {
        continue;
      }

      if (name) {
        name.textContent = player?.name || `Waiting for Player ${seat}`;
      }

      if (avatar) {
        avatar.src = player?.avatarUrl || "../assets/images/default-avatar.png";

        avatar.onerror = () => {
          avatar.onerror = null;

          avatar.src = "../assets/images/default-avatar.png";
        };
      }

      const teamNo = Number(
        player?.teamNo || (seat === 1 || seat === 3 ? 1 : 2),
      );

      if (team) {
        team.textContent = teamNo === 1 ? "TEAM GOLD" : "TEAM GREEN";
      }

      if (score) {
        score.textContent = player
          ? `Score: ${Number(player.score || 0)}`
          : "Waiting...";
      }
    }
  }

  /* ==================================
     Score
  ================================== */

  function updateScoreUI() {
    elements.goldTeamScore.textContent = String(state.goldScore);

    elements.greenTeamScore.textContent = String(state.greenScore);

    elements.roundNumber.textContent = String(state.roundNumber);

    const playerOneScore = document.getElementById("playerScore1");

    const playerTwoScore = document.getElementById("playerScore2");

    const playerThreeScore = document.getElementById("playerScore3");

    const playerFourScore = document.getElementById("playerScore4");

    if (playerOneScore) {
      playerOneScore.textContent = `Score: ${state.goldScore}`;
    }

    if (playerThreeScore) {
      playerThreeScore.textContent = `Score: ${state.goldScore}`;
    }

    if (playerTwoScore) {
      playerTwoScore.textContent = `Score: ${state.greenScore}`;
    }

    if (playerFourScore) {
      playerFourScore.textContent = `Score: ${state.greenScore}`;
    }
  }

  function handlePocket(piece) {
    if (piece.type === "white") {
      state.goldScore += 1;

      setBoardMessage("White coin pocketed!", "success");
    } else if (piece.type === "black") {
      state.greenScore += 1;

      setBoardMessage("Black coin pocketed!", "success");
    } else if (piece.type === "queen") {
      state.goldScore += 3;

      setBoardMessage("Queen pocketed! Cover required.", "success");
    } else if (piece.type === "striker") {
      state.goldScore = Math.max(0, state.goldScore - 1);

      setBoardMessage("Striker foul! One point deducted.", "error");
    }

    updateScoreUI();
  }

  /* ==================================
     Turn Timer
  ================================== */

  function updateTurnTimerUI() {
    const timer = document.getElementById("turnTimer1");

    if (timer) {
      timer.textContent = String(state.turnSeconds);
    }
  }

  function stopTurnTimer() {
    if (state.turnTimerId) {
      window.clearInterval(state.turnTimerId);

      state.turnTimerId = null;
    }
  }

  function startTurnTimer() {
    stopTurnTimer();

    state.turnSeconds = 20;

    updateTurnTimerUI();

    state.turnTimerId = window.setInterval(() => {
      if (state.shotRunning) {
        return;
      }

      state.turnSeconds -= 1;

      updateTurnTimerUI();

      if (state.turnSeconds <= 0) {
        state.turnSeconds = 20;

        state.engine?.resetAim();

        setBoardMessage("Turn timer restarted in frontend demo.");

        updateTurnTimerUI();
      }
    }, 1000);
  }

  /* ==================================
     Controls
  ================================== */

  function setControlsEnabled(enabled) {
    elements.powerRange.disabled = !enabled;

    elements.shootButton.disabled = !enabled;

    elements.resetAimButton.disabled = !enabled;

    elements.board?.classList.toggle("is-moving", !enabled);
  }

  function updatePower(value) {
    const power = Math.min(100, Math.max(10, Number(value) || 50));

    elements.powerRange.value = String(power);

    elements.powerValue.textContent = `${power}%`;

    state.engine?.setPower(power);
  }

  function handleShotStart() {
    state.shotRunning = true;

    stopTurnTimer();

    setControlsEnabled(false);

    setBoardMessage("Coins are moving...");

    elements.turnStatus.innerHTML = `
      <span class="carrom-live-dot"></span>

      <strong>Strike Running</strong>

      <small>Wait until every coin stops</small>
    `;
  }

  function handleShotComplete(result) {
    state.shotRunning = false;

    state.roundNumber += 1;

    updateScoreUI();

    setControlsEnabled(true);

    if (result.pocketed.length === 0) {
      setBoardMessage("No coin pocketed. Try another angle.");
    } else if (result.strikerPocketed) {
      setBoardMessage("Striker foul recorded.", "error");
    } else {
      setBoardMessage(`${result.pocketed.length} piece pocketed!`, "success");
    }

    elements.turnStatus.innerHTML = `
      <span class="carrom-live-dot"></span>

      <strong>Your Turn</strong>

      <small>Aim and select power</small>
    `;

    startTurnTimer();

    if (result.remainingCoins === 0) {
      showDemoWinner();
    }
  }

  function shootStriker() {
    if (state.shotRunning || !state.engine) {
      return;
    }

    const wasStarted = state.engine.shoot(elements.powerRange.value);

    if (!wasStarted) {
      showToast("Select a valid aim direction", "error");
    }
  }

  /* ==================================
     Winner
  ================================== */

  function showDemoWinner() {
    stopTurnTimer();

    const prize = calculatePrize();

    const goldWon = state.goldScore >= state.greenScore;

    elements.winnerName.textContent = goldWon ? "Team Gold" : "Team Green";

    elements.winnerMessage.textContent =
      "Frontend demonstration completed. No wallet transaction was made.";

    elements.winnerPrize.textContent = `৳${formatMoney(
      prize.prizePerWinningPlayer,
    )}`;

    setModalVisibility(elements.winnerOverlay, true);
  }

  /* ==================================
     Engine Initialization
  ================================== */

  function initializeEngine() {
    if (typeof window.PMSCarromEngine !== "function") {
      setBoardMessage("Carrom engine could not load.", "error");

      showToast("Carrom physics engine is unavailable", "error");

      setControlsEnabled(false);

      return;
    }

    state.engine = new window.PMSCarromEngine(elements.canvas, {
      onPocket: handlePocket,

      onShotStart: handleShotStart,

      onShotComplete: handleShotComplete,

      onAimChange: () => {
        elements.board?.classList.toggle(
          "is-aiming",
          Boolean(state.engine?.isAiming),
        );
      },
    });

    updatePower(elements.powerRange.value);

    setBoardMessage("Drag striker or tap the board to aim");

    startTurnTimer();
  }

  /* ==================================
     Events
  ================================== */

  elements.powerRange?.addEventListener("input", (event) => {
    updatePower(event.target.value);
  });

  elements.shootButton?.addEventListener("click", shootStriker);

  elements.resetAimButton?.addEventListener("click", () => {
    state.engine?.resetAim();

    setBoardMessage("Aim reset");
  });

  elements.soundButton?.addEventListener("click", () => {
    state.soundEnabled = !state.soundEnabled;

    const icon = elements.soundButton.querySelector("i");

    if (icon) {
      icon.className = state.soundEnabled
        ? "fa-solid fa-volume-high"
        : "fa-solid fa-volume-xmark";
    }

    showToast(state.soundEnabled ? "Sound enabled" : "Sound muted");
  });

  elements.settingsButton?.addEventListener("click", () => {
    showToast("More Carrom settings will be added later.");
  });

  elements.rulesButton?.addEventListener("click", () => {
    setModalVisibility(elements.rulesModal, true);
  });

  elements.closeRulesButton?.addEventListener("click", () => {
    setModalVisibility(elements.rulesModal, false);
  });

  elements.exitButton?.addEventListener("click", () => {
    setModalVisibility(elements.exitModal, true);
  });

  elements.backButton?.addEventListener("click", () => {
    setModalVisibility(elements.exitModal, true);
  });

  elements.cancelExitButton?.addEventListener("click", () => {
    setModalVisibility(elements.exitModal, false);
  });

  elements.confirmExitButton?.addEventListener("click", () => {
    window.location.href =
  "/carrom-rooms";
  });

  elements.returnLobbyButton?.addEventListener("click", () => {
    window.location.href =
  "/lobby";
  });

  elements.emojiButton?.addEventListener("click", () => {
    showToast("👏 Nice shot!", "success");
  });

  elements.messageButton?.addEventListener("click", () => {
    showToast("Quick messages will be connected with Socket.IO later.");
  });

  elements.rulesModal?.addEventListener("click", (event) => {
    if (event.target === elements.rulesModal) {
      setModalVisibility(elements.rulesModal, false);
    }
  });

  elements.exitModal?.addEventListener("click", (event) => {
    if (event.target === elements.exitModal) {
      setModalVisibility(elements.exitModal, false);
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setModalVisibility(elements.rulesModal, false);

      setModalVisibility(elements.exitModal, false);
    }

    if (
      event.code === "Space" &&
      !state.shotRunning &&
      !elements.rulesModal?.hidden === false
    ) {
      event.preventDefault();

      shootStriker();
    }
  });

  window.addEventListener("beforeunload", () => {
    stopTurnTimer();

    if (state.matchPollTimerId) {
      window.clearInterval(state.matchPollTimerId);

      state.matchPollTimerId = null;
    }

    if (state.socket) {
      state.socket.disconnect();

      state.socket = null;
    }

    state.engine?.destroy();
  });

  /* ==================================
   Carrom Socket.IO
================================== */

  function joinCarromSocketMatch() {
    if (!state.socket || !state.socketConnected || !state.matchId) {
      return;
    }

    state.socket.emit(
      "match:join",
      {
        matchId: state.matchId,
      },
      (result) => {
        if (!result?.success) {
          showToast(
            result?.message || "Unable to join live Carrom match.",
            "error",
          );

          return;
        }

        if (result.data) {
          applyCarromMatchState(result.data);

          renderRealMatchState();
        }
      },
    );
  }

  function initializeCarromSocket() {
    if (typeof window.io !== "function") {
      console.warn("Socket.IO client is unavailable.");

      return;
    }

    if (state.socket) {
      state.socket.disconnect();

      state.socket = null;
    }

    state.socket = window.io(`${APP_CONFIG.SERVER_URL}/carrom`, {
      auth: {
        token: getAccessToken(),
      },

      transports: ["websocket", "polling"],

      reconnection: true,

      reconnectionAttempts: Infinity,

      reconnectionDelay: 1000,

      reconnectionDelayMax: 5000,

      timeout: 15000,
    });

    state.socket.on("connect", () => {
      state.socketConnected = true;

      if (elements.liveStatusText) {
        elements.liveStatusText.textContent = "Live Connected";
      }

      elements.liveStatusDot?.classList.remove("is-offline");

      joinCarromSocketMatch();
    });

    state.socket.on("disconnect", () => {
      state.socketConnected = false;

      if (elements.liveStatusText) {
        elements.liveStatusText.textContent = "Reconnecting...";
      }

      elements.liveStatusDot?.classList.add("is-offline");
    });

    state.socket.on("connect_error", (error) => {
      console.error("CARROM SOCKET CONNECTION ERROR:", error);
    });

    state.socket.on("match:state", (matchState) => {
      try {
        applyCarromMatchState(matchState);

        renderRealMatchState();
      } catch (error) {
        console.error("CARROM SOCKET STATE ERROR:", error);
      }
    });

    state.socket.on("match:bots-joined", (payload) => {
      const botCount = Array.isArray(payload?.bots) ? payload.bots.length : 0;

      showToast(
        botCount > 0
          ? `${botCount} player joined the match.`
          : "Players joined the match.",
        "success",
      );
    });

    state.socket.on("match:started", (matchState) => {
      applyCarromMatchState(matchState);

      renderRealMatchState();

      showToast("Carrom match started.", "success");
    });

    state.socket.on("match:error", (error) => {
      showToast(error?.message || "Carrom live match error.", "error");
    });
  }

  /* ==================================
   Start Real Carrom Match
================================== */

  function setGameplayControlsEnabled(isEnabled) {
    if (elements.shootButton) {
      elements.shootButton.disabled = !isEnabled;
    }

    if (elements.resetAimButton) {
      elements.resetAimButton.disabled = !isEnabled;
    }

    if (elements.powerRange) {
      elements.powerRange.disabled = !isEnabled;
    }
  }

  function updateScoresFromMatchState() {
    const players = state.matchState?.players || [];

    state.goldScore = players
      .filter((player) => Number(player.teamNo) === 1)
      .reduce((total, player) => total + Number(player.score || 0), 0);

    state.greenScore = players
      .filter((player) => Number(player.teamNo) === 2)
      .reduce((total, player) => total + Number(player.score || 0), 0);

    state.roundNumber = Number(state.matchState?.gameState?.turnNumber || 1);

    updateScoreUI();
  }

  function updateMatchBoardMessage() {
    const match = state.matchState?.match;

    const matchmaking = state.matchState?.matchmaking;

    const status = String(match?.status || "waiting").toLowerCase();

    if (status === "waiting") {
      setBoardMessage(
        `Waiting for players: ${matchmaking?.joinedPlayers || 0}/${
          matchmaking?.requiredPlayers ||
          match?.requiredPlayers ||
          state.playerMode
        }`,
      );

      return;
    }

    if (status === "countdown") {
      setBoardMessage("All players joined. Match is starting...", "success");

      return;
    }

    if (status === "playing") {
      setBoardMessage(
        "Server connection is preparing the current turn.",
        "success",
      );

      return;
    }

    if (status === "completed") {
      setBoardMessage("This Carrom match has completed.", "success");

      return;
    }

    if (status === "cancelled") {
      setBoardMessage(
        match?.cancellationReason || "This Carrom match was cancelled.",
        "error",
      );

      return;
    }

    setBoardMessage(`Match status: ${status}`);
  }

  function renderRealMatchState() {
    renderMatchInformation();

    configurePlayerPanels();

    updateScoresFromMatchState();

    updateMatchBoardMessage();

    /*
     * Server-authoritative shot API এবং Socket.IO
     * যুক্ত হওয়ার আগে local demo shot বন্ধ থাকবে।
     */
    setGameplayControlsEnabled(false);
  }

  async function refreshRealMatchState() {
    try {
      await loadCarromMatchState();

      renderRealMatchState();

      const status = String(
        state.matchState?.match?.status || "",
      ).toLowerCase();

      if (["completed", "cancelled", "failed"].includes(status)) {
        if (state.matchPollTimerId) {
          window.clearInterval(state.matchPollTimerId);

          state.matchPollTimerId = null;
        }
      }
    } catch (error) {
      console.error("REFRESH CARROM MATCH ERROR:", error);
    }
  }

  function startMatchStatePolling() {
    if (state.matchPollTimerId) {
      window.clearInterval(state.matchPollTimerId);
    }

    state.matchPollTimerId = window.setInterval(() => {
      refreshRealMatchState();
    }, 2500);
  }

  async function initializeRealCarromTable() {
    initializeStoredData();

    setGameplayControlsEnabled(false);

    setBoardMessage("Loading Carrom match...");

    try {
      await loadCarromMatchState();

      renderRealMatchState();

      initializeCarromSocket();

      initializeEngine();

      stopTurnTimer();

      setGameplayControlsEnabled(false);

      startMatchStatePolling();

      showToast("Real Carrom match loaded successfully.", "success");
    } catch (error) {
      console.error("INITIALIZE CARROM MATCH ERROR:", error);

      setBoardMessage(error.message || "Unable to load Carrom match.", "error");

      showToast(error.message || "Unable to load Carrom match.", "error");

      setGameplayControlsEnabled(false);
    }
  }

  initializeRealCarromTable();
})();
