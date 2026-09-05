"use strict";

/* ==========================
   Elements
========================== */

const loadingOverlay = document.getElementById("loadingOverlay");

const backBtn = document.getElementById("backBtn");

const soundBtn = document.getElementById("soundBtn");

const walletBalance = document.getElementById("walletBalance");

const roundCode = document.getElementById("roundCode");

const roundStatus = document.getElementById("roundStatus");

const connectionDot = document.getElementById("connectionDot");

const connectionText = document.getElementById("connectionText");

const aviatorStage = document.getElementById("aviatorStage");

const bettingCountdown = document.getElementById("bettingCountdown");

const countdownValue = document.getElementById("countdownValue");

const multiplierValue = document.getElementById("multiplierValue");

const multiplierStatus = document.getElementById("multiplierStatus");

const crashedMessage = document.getElementById("crashedMessage");

const crashedMultiplier = document.getElementById("crashedMultiplier");

const crashHistory = document.getElementById("crashHistory");

const serverSeedHash = document.getElementById("serverSeedHash");

const serverSeed = document.getElementById("serverSeed");

const fairCrashPoint = document.getElementById("fairCrashPoint");

const gameToast = document.getElementById("gameToast");

/* ==========================
   State
========================== */

let socket = null;

let currentRound = null;

let gameSettings = null;

let currentMultiplier = 1;

let playerBets = new Map();

let countdownTimer = null;

let soundEnabled = true;

let toastTimer = null;

/* ==========================
   Token
========================== */

function getAccessToken() {
  return (
    localStorage.getItem("access_token") ||
    localStorage.getItem("token") ||
    sessionStorage.getItem("access_token") ||
    ""
  );
}

/* ==========================
   Helpers
========================== */

function money(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "0.00";
  }

  return number.toFixed(2);
}

function multiplierText(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "1.00x";
  }

  return `${number.toFixed(2)}x`;
}

function showToast(message) {
  if (!gameToast) {
    return;
  }

  gameToast.textContent = String(message || "Something went wrong.");

  gameToast.classList.add("show");

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    gameToast.classList.remove("show");
  }, 2600);
}

function setConnected(connected) {
  if (!connectionDot || !connectionText) {
    return;
  }

  connectionDot.classList.remove("connected", "disconnected");

  if (connected) {
    connectionDot.classList.add("connected");
    connectionText.textContent = "Connected";
  } else {
    connectionDot.classList.add("disconnected");
    connectionText.textContent = "Disconnected";
  }
}

function updateWallet(value) {
  if (!walletBalance) {
    return;
  }

  walletBalance.textContent = money(value);
}

function getRoundId() {
  const id = Number(currentRound?.id);

  return Number.isInteger(id) && id > 0 ? id : null;
}

/* ==========================
   Bet Elements
========================== */

function getSlotElements(slot) {
  return {
    amountInput: document.getElementById(`betAmount${slot}`),

    autoEnabled: document.getElementById(`autoCashoutEnabled${slot}`),

    autoInput: document.getElementById(`autoCashout${slot}`),

    button: document.getElementById(`betButton${slot}`),

    buttonAmount: document.getElementById(`betButtonAmount${slot}`),

    status: document.getElementById(`betStatus${slot}`),

    result: document.getElementById(`betResult${slot}`),
  };
}

/* ==========================
   Current Bet
========================== */

function getBetForSlot(slot) {
  return playerBets.get(Number(slot)) || null;
}

function normalizeBet(bet) {
  if (!bet) {
    return null;
  }

  return {
    ...bet,

    id: Number(bet.id),

    roundId: Number(bet.roundId),

    betSlot: Number(bet.betSlot),

    betAmount: Number(bet.betAmount),

    autoCashoutMultiplier:
      bet.autoCashoutMultiplier === null ||
      bet.autoCashoutMultiplier === undefined
        ? null
        : Number(bet.autoCashoutMultiplier),

    cashoutMultiplier:
      bet.cashoutMultiplier === null || bet.cashoutMultiplier === undefined
        ? null
        : Number(bet.cashoutMultiplier),

    payoutAmount: Number(bet.payoutAmount || 0),

    status: String(bet.status || ""),
  };
}

/* ==========================
   Bet UI
========================== */

function refreshBetPanel(slot) {
  const elements = getSlotElements(slot);

  const bet = getBetForSlot(slot);

  const roundState = String(currentRound?.status || "").toLowerCase();

  const amount = Number(elements.amountInput?.value || 0);

  if (elements.buttonAmount) {
    elements.buttonAmount.textContent = money(amount);
  }

  if (!bet) {
    if (elements.status) {
      elements.status.textContent =
        roundState === "betting" ? "Ready" : "Waiting";
    }

    if (elements.result) {
      elements.result.innerHTML = "<span>No active bet</span>";
    }

    if (elements.button) {
      elements.button.classList.remove("cashout");

      elements.button.innerHTML = `
        <span>BET</span>
        <strong>
          ৳${money(amount)}
        </strong>
      `;

      elements.button.disabled = roundState !== "betting";
    }

    if (elements.amountInput) {
      elements.amountInput.disabled = roundState !== "betting";
    }

    if (elements.autoEnabled) {
      elements.autoEnabled.disabled = roundState !== "betting";
    }

    if (elements.autoInput) {
      elements.autoInput.disabled =
        !elements.autoEnabled?.checked || roundState !== "betting";
    }

    return;
  }

  if (elements.amountInput) {
    elements.amountInput.disabled = true;
  }

  if (elements.autoEnabled) {
    elements.autoEnabled.disabled = true;
  }

  if (elements.autoInput) {
    elements.autoInput.disabled = true;
  }

  if (bet.status === "placed") {
    if (elements.status) {
      elements.status.textContent =
        roundState === "flying" ? "Flying" : "Bet Placed";
    }

    if (elements.result) {
      const autoText = bet.autoCashoutMultiplier
        ? ` • Auto ${multiplierText(bet.autoCashoutMultiplier)}`
        : "";

      elements.result.innerHTML = `
        <span>
          Bet ৳${money(bet.betAmount)}${autoText}
        </span>
      `;
    }

    if (elements.button) {
      if (roundState === "flying") {
        const estimatedPayout =
          Number(bet.betAmount) * Number(currentMultiplier);

        elements.button.classList.add("cashout");

        elements.button.innerHTML = `
          <span>
            CASH OUT
            ${multiplierText(currentMultiplier)}
          </span>

          <strong>
            ৳${money(estimatedPayout)}
          </strong>
        `;

        elements.button.disabled = false;
      } else {
        elements.button.classList.remove("cashout");

        elements.button.innerHTML = `
          <span>BET PLACED</span>
          <strong>
            ৳${money(bet.betAmount)}
          </strong>
        `;

        elements.button.disabled = true;
      }
    }

    return;
  }

  if (bet.status === "cashed_out") {
    if (elements.status) {
      elements.status.textContent = "Cashed Out";
    }

    if (elements.result) {
      elements.result.innerHTML = `
        <span>
          Won ৳${money(bet.payoutAmount)}
          at
          ${multiplierText(bet.cashoutMultiplier)}
        </span>
      `;
    }

    if (elements.button) {
      elements.button.classList.remove("cashout");

      elements.button.innerHTML = `
        <span>CASHED OUT</span>
        <strong>
          ৳${money(bet.payoutAmount)}
        </strong>
      `;

      elements.button.disabled = true;
    }

    return;
  }

  if (bet.status === "lost") {
    if (elements.status) {
      elements.status.textContent = "Lost";
    }

    if (elements.result) {
      elements.result.innerHTML = `
        <span>
          Lost ৳${money(bet.betAmount)}
        </span>
      `;
    }

    if (elements.button) {
      elements.button.classList.remove("cashout");

      elements.button.innerHTML = `
        <span>LOST</span>
        <strong>
          ৳${money(bet.betAmount)}
        </strong>
      `;

      elements.button.disabled = true;
    }

    return;
  }

  if (bet.status === "cancelled") {
    if (elements.status) {
      elements.status.textContent = "Refunded";
    }

    if (elements.result) {
      elements.result.innerHTML = `
        <span>
          Refunded ৳${money(bet.betAmount)}
        </span>
      `;
    }

    if (elements.button) {
      elements.button.classList.remove("cashout");

      elements.button.innerHTML = `
        <span>REFUNDED</span>
        <strong>
          ৳${money(bet.betAmount)}
        </strong>
      `;

      elements.button.disabled = true;
    }
  }
}

function refreshAllBetPanels() {
  refreshBetPanel(1);
  refreshBetPanel(2);
}

/* ==========================
   Countdown
========================== */

function clearCountdown() {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
}

function startBettingCountdown() {
  clearCountdown();

  const endTimeRaw =
    currentRound?.bettingEndsAt || currentRound?.betting_ends_at;

  const endTime = new Date(endTimeRaw).getTime();

  if (!Number.isFinite(endTime)) {
    bettingCountdown?.classList.add("is-hidden");

    return;
  }

  bettingCountdown?.classList.remove("is-hidden");

  const update = () => {
    const remaining = Math.max(0, endTime - Date.now()) / 1000;

    if (countdownValue) {
      countdownValue.textContent = remaining.toFixed(1);
    }

    if (remaining <= 0) {
      clearCountdown();
    }
  };

  update();

  countdownTimer = setInterval(update, 100);
}

/* ==========================
   Fairness
========================== */

function updateFairness(round) {
  if (!round) {
    if (serverSeedHash) {
      serverSeedHash.textContent = "--";
    }

    if (serverSeed) {
      serverSeed.textContent = "Hidden until crash";
    }

    if (fairCrashPoint) {
      fairCrashPoint.textContent = "Hidden";
    }

    return;
  }

  if (serverSeedHash) {
    serverSeedHash.textContent =
      round.serverSeedHash || round.server_seed_hash || "--";
  }

  const revealedSeed = round.serverSeed || round.server_seed || null;

  if (serverSeed) {
    serverSeed.textContent = revealedSeed || "Hidden until crash";
  }

  const crash = round.crashMultiplier ?? round.crash_multiplier;

  if (fairCrashPoint) {
    if (
      String(round.status) === "crashed" &&
      crash !== null &&
      crash !== undefined
    ) {
      fairCrashPoint.textContent = multiplierText(crash);
    } else {
      fairCrashPoint.textContent = "Hidden";
    }
  }
}

/* ==========================
   Round UI
========================== */

function updateRoundUI() {
  const round = currentRound;

  if (!round) {
    clearCountdown();

    if (roundCode) {
      roundCode.textContent = "--";
    }

    if (roundStatus) {
      roundStatus.textContent = "Waiting";
    }

    if (multiplierValue) {
      multiplierValue.textContent = "1.00x";
    }

    if (multiplierStatus) {
      multiplierStatus.textContent = "Waiting for next round";
    }

    aviatorStage?.classList.remove("flying");

    crashedMessage?.classList.add("is-hidden");

    bettingCountdown?.classList.add("is-hidden");

    updateFairness(null);

    refreshAllBetPanels();

    return;
  }

  const status = String(round.status || "").toLowerCase();

  if (roundCode) {
    roundCode.textContent =
      round.roundCode || round.round_code || round.id || "--";
  }

  if (roundStatus) {
    roundStatus.textContent = status ? status.toUpperCase() : "WAITING";
  }

  updateFairness(round);

  if (status === "betting") {
    currentMultiplier = 1;

    aviatorStage?.classList.remove("flying");

    crashedMessage?.classList.add("is-hidden");

    if (multiplierValue) {
      multiplierValue.textContent = "1.00x";
    }

    if (multiplierStatus) {
      multiplierStatus.textContent = "Place your bet";
    }

    startBettingCountdown();
  }

  if (status === "flying") {
    clearCountdown();

    bettingCountdown?.classList.add("is-hidden");

    crashedMessage?.classList.add("is-hidden");

    aviatorStage?.classList.add("flying");

    if (multiplierStatus) {
      multiplierStatus.textContent = "Flying...";
    }
  }

  if (status === "crashed") {
    clearCountdown();

    aviatorStage?.classList.remove("flying");

    bettingCountdown?.classList.add("is-hidden");

    const crash = Number(
      round.crashMultiplier ?? round.crash_multiplier ?? currentMultiplier,
    );

    currentMultiplier = Number.isFinite(crash) ? crash : currentMultiplier;

    if (multiplierValue) {
      multiplierValue.textContent = multiplierText(currentMultiplier);
    }

    if (crashedMultiplier) {
      crashedMultiplier.textContent = multiplierText(currentMultiplier);
    }

    crashedMessage?.classList.remove("is-hidden");
  }

  refreshAllBetPanels();
}

/* ==========================
   History
========================== */

function historyClass(value) {
  const multiplier = Number(value);

  if (multiplier >= 10) {
    return "high";
  }

  if (multiplier >= 2) {
    return "medium";
  }

  return "low";
}

function addCrashHistory(value) {
  const multiplier = Number(value);

  if (!Number.isFinite(multiplier)) {
    return;
  }

  const existing = Array.from(
    crashHistory?.querySelectorAll(".history-item") || [],
  );

  const firstValue = Number(existing[0]?.dataset?.multiplier);

  if (existing.length && firstValue === multiplier) {
    return;
  }

  if (!crashHistory) {
    return;
  }

  crashHistory.querySelector(".history-placeholder")?.remove();

  const item = document.createElement("span");

  item.className = `history-item ${historyClass(multiplier)}`;

  item.dataset.multiplier = String(multiplier);

  item.textContent = multiplierText(multiplier);

  crashHistory.prepend(item);

  while (crashHistory.children.length > 15) {
    crashHistory.lastElementChild?.remove();
  }
}

/* ==========================
   Player State
========================== */

function applyPlayerState(state) {
  if (!state) {
    return;
  }

  if (state.walletBalance !== undefined) {
    updateWallet(state.walletBalance);
  }

  playerBets.clear();

  const stateRoundId = Number(state.round?.id);

  const currentRoundId = Number(currentRound?.id);

  const sameRound =
    state.round &&
    Number.isInteger(stateRoundId) &&
    (!Number.isInteger(currentRoundId) || stateRoundId === currentRoundId);

  if (sameRound) {
    for (const rawBet of Array.isArray(state.bets) ? state.bets : []) {
      const bet = normalizeBet(rawBet);

      if (bet && [1, 2].includes(bet.betSlot)) {
        playerBets.set(bet.betSlot, bet);
      }
    }
  }

  refreshAllBetPanels();
}

function requestPlayerState() {
  if (!socket?.connected) {
    return;
  }

  socket.emit("aviator:get-player-state", {}, (response) => {
    if (response?.success && response.data) {
      applyPlayerState(response.data);
    }
  });
}

/* ==========================
   Public State
========================== */

function applyPublicState(state) {
  if (!state) {
    return;
  }

  gameSettings = state.settings || null;

  const previousRoundId = Number(currentRound?.id);

  const incomingRound = state.round || null;

  const incomingRoundId = Number(incomingRound?.id);

  if (
    Number.isInteger(previousRoundId) &&
    Number.isInteger(incomingRoundId) &&
    previousRoundId !== incomingRoundId
  ) {
    playerBets.clear();
  }

  currentRound = incomingRound;

  updateRoundUI();

  if (gameSettings && gameSettings.isEnabled === false) {
    if (multiplierStatus) {
      multiplierStatus.textContent = "Aviator disabled";
    }
  }

  if (gameSettings?.maintenanceMode) {
    if (multiplierStatus) {
      multiplierStatus.textContent = "Under maintenance";
    }
  }

  requestPlayerState();
}

/* ==========================
   Bet Validation
========================== */

function getBetPayload(slot) {
  const elements = getSlotElements(slot);

  const betAmount = Number(elements.amountInput?.value);

  const minimum = Number(gameSettings?.minBet ?? 10);

  const maximum = Number(gameSettings?.maxBet ?? 10000);

  if (
    !Number.isFinite(betAmount) ||
    betAmount < minimum ||
    betAmount > maximum
  ) {
    showToast(`Bet must be between ৳${money(minimum)} and ৳${money(maximum)}.`);

    return null;
  }

  let autoCashoutMultiplier = null;

  if (elements.autoEnabled?.checked) {
    const auto = Number(elements.autoInput?.value);

    if (!Number.isFinite(auto) || auto < 1.01) {
      showToast("Auto cashout must be at least 1.01x.");

      return null;
    }

    autoCashoutMultiplier = Number(auto.toFixed(2));
  }

  return {
    roundId: getRoundId(),
    betSlot: Number(slot),
    betAmount: Number(betAmount.toFixed(2)),
    autoCashoutMultiplier,
  };
}

/* ==========================
   Place Bet
========================== */

function placeBet(slot) {
  if (!socket?.connected) {
    showToast("Game is not connected.");

    return;
  }

  if (String(currentRound?.status) !== "betting") {
    showToast("Betting time is closed.");

    return;
  }

  if (getBetForSlot(slot)) {
    return;
  }

  const payload = getBetPayload(slot);

  if (!payload?.roundId) {
    showToast("Active round was not found.");

    return;
  }

  const elements = getSlotElements(slot);

  if (elements.button) {
    elements.button.disabled = true;
  }

  socket.emit("aviator:place-bet", payload, (response) => {
    if (!response?.success) {
      showToast(response?.message || "Bet could not be placed.");

      refreshBetPanel(slot);

      return;
    }

    const result = response.data || {};

    const bet = normalizeBet(result.bet);

    if (bet) {
      playerBets.set(Number(slot), bet);
    }

    if (result.wallet?.balanceAfter !== undefined) {
      updateWallet(result.wallet.balanceAfter);
    }

    refreshBetPanel(slot);

    showToast(`Bet ${slot} placed successfully.`);
  });
}

/* ==========================
   Cash Out
========================== */

function cashOut(slot) {
  if (!socket?.connected) {
    showToast("Game is not connected.");

    return;
  }

  const bet = getBetForSlot(slot);

  if (!bet || bet.status !== "placed") {
    return;
  }

  if (String(currentRound?.status) !== "flying") {
    showToast("Cash out is not available.");

    return;
  }

  const elements = getSlotElements(slot);

  if (elements.button) {
    elements.button.disabled = true;
  }

  socket.emit(
    "aviator:cash-out",
    {
      roundId: getRoundId(),
      betSlot: Number(slot),
    },
    (response) => {
      if (!response?.success) {
        showToast(response?.message || "Cash out failed.");

        refreshBetPanel(slot);

        return;
      }

      const result = response.data || {};

      const savedBet = normalizeBet(result.bet);

      if (savedBet) {
        playerBets.set(Number(slot), savedBet);
      }

      if (result.wallet?.balanceAfter !== undefined) {
        updateWallet(result.wallet.balanceAfter);
      }

      refreshBetPanel(slot);

      showToast(
        `Cashed out ৳${money(result.payoutAmount ?? savedBet?.payoutAmount)}.`,
      );
    },
  );
}

/* ==========================
   Bet Button
========================== */

function handleBetAction(slot) {
  const bet = getBetForSlot(slot);

  if (bet?.status === "placed" && String(currentRound?.status) === "flying") {
    cashOut(slot);

    return;
  }

  if (!bet) {
    placeBet(slot);
  }
}

/* ==========================
   Amount Controls
========================== */

function changeAmount(slot, difference) {
  const elements = getSlotElements(slot);

  if (!elements.amountInput || elements.amountInput.disabled) {
    return;
  }

  const minimum = Number(gameSettings?.minBet ?? 10);

  const maximum = Number(gameSettings?.maxBet ?? 10000);

  const current = Number(elements.amountInput.value || minimum);

  const next = Math.min(maximum, Math.max(minimum, current + difference));

  elements.amountInput.value = String(next);

  refreshBetPanel(slot);
}

/* ==========================
   Controls
========================== */

function bindControls() {
  backBtn?.addEventListener("click", () => {
    window.location.href = "/lobby";
  });

  soundBtn?.addEventListener("click", () => {
    soundEnabled = !soundEnabled;

    const icon = soundBtn.querySelector("i");

    if (icon) {
      icon.className = soundEnabled
        ? "fa-solid fa-volume-high"
        : "fa-solid fa-volume-xmark";
    }
  });

  for (const slot of [1, 2]) {
    const elements = getSlotElements(slot);

    elements.button?.addEventListener("click", () => handleBetAction(slot));

    elements.amountInput?.addEventListener("input", () =>
      refreshBetPanel(slot),
    );

    elements.autoEnabled?.addEventListener("change", () => {
      if (elements.autoInput) {
        elements.autoInput.disabled =
          !elements.autoEnabled.checked ||
          String(currentRound?.status) !== "betting";
      }
    });
  }

  document.querySelectorAll(".amount-minus").forEach((button) => {
    button.addEventListener("click", () => {
      const slot = Number(button.dataset.slot);

      changeAmount(slot, -10);
    });
  });

  document.querySelectorAll(".amount-plus").forEach((button) => {
    button.addEventListener("click", () => {
      const slot = Number(button.dataset.slot);

      changeAmount(slot, 10);
    });
  });

  document.querySelectorAll(".quick-bet-options button").forEach((button) => {
    button.addEventListener("click", () => {
      const slot = Number(button.dataset.slot);

      const amount = Number(button.dataset.amount);

      const elements = getSlotElements(slot);

      if (!elements.amountInput || elements.amountInput.disabled) {
        return;
      }

      elements.amountInput.value = String(amount);

      refreshBetPanel(slot);
    });
  });
}

/* ==========================
   Socket
========================== */

function connectSocket() {
  const token = getAccessToken();

  if (!token) {
    showToast("Login session was not found.");

    setTimeout(() => {
      window.location.href = "/login";
    }, 1000);

    return;
  }

  socket = io("/aviator", {
    auth: {
      token,
    },

    transports: ["websocket", "polling"],
  });

  socket.on("connect", () => {
    setConnected(true);
  });

  socket.on("disconnect", () => {
    setConnected(false);
  });

  socket.on("connect_error", (error) => {
    setConnected(false);

    showToast(error?.message || "Aviator connection failed.");
  });

  socket.on("aviator:connected", () => {
    setConnected(true);

    loadingOverlay?.classList.add("is-hidden");
  });

  socket.on("aviator:state", (payload) => {
    if (payload?.success && payload.data) {
      applyPublicState(payload.data);
    }
  });

  socket.on("aviator:player-state", (payload) => {
    if (payload?.success && payload.data) {
      applyPlayerState(payload.data);
    }
  });

  socket.on("aviator:round-started", (payload) => {
    const round = payload?.data?.round || payload?.round || payload?.data;

    if (round?.id) {
      currentRound = round;

      playerBets.clear();

      currentMultiplier = 1;

      updateRoundUI();

      requestPlayerState();
    }
  });

  socket.on("aviator:flight-started", (payload) => {
    const round = payload?.data?.round || payload?.round || payload?.data;

    if (round && typeof round === "object") {
      currentRound = {
        ...(currentRound || {}),
        ...round,
        status: "flying",
      };
    } else if (currentRound) {
      currentRound.status = "flying";
    }

    updateRoundUI();

    requestPlayerState();
  });

  socket.on("aviator:multiplier", (payload) => {
    const value = Number(payload?.data?.multiplier ?? payload?.multiplier);

    if (!Number.isFinite(value)) {
      return;
    }

    currentMultiplier = value;

    if (multiplierValue) {
      multiplierValue.textContent = multiplierText(value);
    }

    if (currentRound && String(currentRound.status) !== "crashed") {
      currentRound.status = "flying";
    }

    aviatorStage?.classList.add("flying");

    if (planeWrapper) {
      const flightProgress = Math.min(
        1,
        Math.max(0, Math.log(Math.max(value, 1)) / Math.log(100)),
      );

      const horizontalPosition = 8 + flightProgress * 72;

      const verticalPosition = 5 + flightProgress * 72;

      planeWrapper.style.left = `${horizontalPosition}%`;

      planeWrapper.style.bottom = `${verticalPosition}%`;

      planeWrapper.style.transform = "rotate(-12deg)";
    }

    bettingCountdown?.classList.add("is-hidden");

    crashedMessage?.classList.add("is-hidden");

    if (multiplierStatus) {
      multiplierStatus.textContent = "Flying...";
    }

    refreshAllBetPanels();
  });

  socket.on("aviator:crashed", (payload) => {
    const round = payload?.data?.round || payload?.round || payload?.data;

    const crash = Number(
      round?.crashMultiplier ??
        round?.crash_multiplier ??
        payload?.data?.crashMultiplier ??
        payload?.crashMultiplier,
    );

    if (round && typeof round === "object") {
      currentRound = {
        ...(currentRound || {}),
        ...round,
        status: "crashed",
      };
    } else if (currentRound) {
      currentRound.status = "crashed";

      if (Number.isFinite(crash)) {
        currentRound.crashMultiplier = crash;
      }
    }

    if (Number.isFinite(crash)) {
      currentMultiplier = crash;

      addCrashHistory(crash);
    }

    updateRoundUI();

    setTimeout(requestPlayerState, 150);
  });

  socket.on("aviator:round-cancelled", (payload) => {
    showToast(
      payload?.message || "Round cancelled. Active bets were refunded.",
    );

    if (currentRound) {
      currentRound.status = "cancelled";
    }

    clearCountdown();

    aviatorStage?.classList.remove("flying");

    requestPlayerState();
  });

  socket.on("aviator:disabled", (payload) => {
    showToast(payload?.message || "Aviator is disabled.");

    refreshAllBetPanels();
  });

  socket.on("aviator:maintenance", (payload) => {
    showToast(payload?.message || "Aviator is under maintenance.");

    refreshAllBetPanels();
  });

  socket.on("aviator:error", (payload) => {
    showToast(payload?.message || "Aviator error.");
  });
}

/* ==========================
   Start
========================== */

function initializeAviator() {
  bindControls();

  setConnected(false);

  refreshAllBetPanels();

  connectSocket();

  setTimeout(() => {
    loadingOverlay?.classList.add("is-hidden");
  }, 5000);
}

document.addEventListener("DOMContentLoaded", initializeAviator);
