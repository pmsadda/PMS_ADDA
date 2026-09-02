"use strict";

(() => {
  const $ = (id) => document.getElementById(id);

  const DOM = {
    loadingOverlay: $("loadingOverlay"),

    backBtn: $("backBtn"),

    soundBtn: $("soundBtn"),

    walletBalance: $("walletBalance"),

    roundCode: $("roundCode"),

    roundStatus: $("roundStatus"),

    connectionDot: $("connectionDot"),

    connectionText: $("connectionText"),

    timerValue: $("timerValue"),

    diceCube: $("diceCube"),

    rollInformation: $("rollInformation"),

    rollInformationText: $("rollInformationText"),

    bettingMode: $("bettingMode"),

    symbolOptions: $("symbolOptions"),

    remainingLimit: $("remainingLimit"),

    decreaseBetBtn: $("decreaseBetBtn"),

    increaseBetBtn: $("increaseBetBtn"),

    betAmountInput: $("betAmountInput"),

    quickBetOptions: $("quickBetOptions"),

    selectedSymbolText: $("selectedSymbolText"),

    potentialPayout: $("potentialPayout"),

    placeBetBtn: $("placeBetBtn"),

    placeBetText: $("placeBetText"),

    myBetsCard: $("myBetsCard"),

    myBetCount: $("myBetCount"),

    myBetList: $("myBetList"),

    myBetTotal: $("myBetTotal"),

    refreshResultsBtn: $("refreshResultsBtn"),

    recentResults: $("recentResults"),

    resultOverlay: $("resultOverlay"),

    resultCloseBtn: $("resultCloseBtn"),

    continueBtn: $("continueBtn"),

    winnerImage: $("winnerImage"),

    winnerName: $("winnerName"),

    winnerMultiplier: $("winnerMultiplier"),

    userResultMessage: $("userResultMessage"),

    gameToast: $("gameToast"),
  };

  const state = {
    socket: null,

    settings: null,
    symbols: [],
    activeRound: null,

    selectedSymbol: null,
    selectedAmount: 5,

    userBets: [],

    userBetSummary: {
      totalBets: 0,
      totalBetAmount: 0,
      symbolBetAmounts: {},
    },

    walletBalance: 0,

    placingBet: false,
    isRolling: false,

    serverOffset: 0,

    countdownTimer: null,
    rollTimer: null,

    soundEnabled: true,
  };

  const FACE_TRANSFORMS = {
    1: {
      x: 0,
      y: 0,
    },

    2: {
      x: 0,
      y: 180,
    },

    3: {
      x: 0,
      y: -90,
    },

    4: {
      x: 0,
      y: 90,
    },

    5: {
      x: -90,
      y: 0,
    },

    6: {
      x: 90,
      y: 0,
    },
  };

  function getToken() {
    return (
      localStorage.getItem("access_token") ||
      localStorage.getItem("token") ||
      ""
    );
  }

  function getServerUrl() {
    return String(
      window.APP_CONFIG?.SERVER_URL || window.location.origin,
    ).replace(/\/+$/, "");
  }

  function getApiUrl(path) {
    if (window.APP_CONFIG?.api) {
      return window.APP_CONFIG.api(path);
    }

    const cleanPath = String(path).startsWith("/") ? String(path) : `/${path}`;

    return `${getServerUrl()}/api${cleanPath}`;
  }

  function getAssetUrl(path) {
    const value = String(path || "");

    if (/^https?:\/\//i.test(value)) {
      return value;
    }

    const cleanPath = value.startsWith("/") ? value : `/${value}`;

    return `${getServerUrl()}${cleanPath}`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function money(value) {
    const amount = Number(value);

    return Number.isFinite(amount) ? amount.toFixed(2) : "0.00";
  }

  function showToast(message, type = "info") {
    if (!DOM.gameToast) {
      return;
    }

    DOM.gameToast.textContent = String(message);

    DOM.gameToast.className = `game-toast is-visible is-${type}`;

    clearTimeout(showToast.timer);

    showToast.timer = setTimeout(() => {
      DOM.gameToast.className = "game-toast";
    }, 3500);
  }

  function setConnection(connected) {
    DOM.connectionText.textContent = connected ? "Connected" : "Disconnected";

    DOM.connectionDot?.parentElement?.classList.toggle(
      "is-connected",
      connected,
    );
  }

  function updateServerTime(value) {
    if (!value) {
      return;
    }

    const time = new Date(value).getTime();

    if (Number.isFinite(time)) {
      state.serverOffset = time - Date.now();
    }
  }

  function serverNow() {
    return Date.now() + state.serverOffset;
  }

  function updateWallet(value) {
    const balance = Number(value);

    if (!Number.isFinite(balance)) {
      return;
    }

    state.walletBalance = balance;

    DOM.walletBalance.textContent = money(balance);
  }

  function getRoundStatus(round = state.activeRound) {
    return String(
      round?.roundStatus || round?.round_status || "",
    ).toLowerCase();
  }

  function getMaximumBet() {
    return Number(
      state.activeRound?.maximumBet ?? state.settings?.maximumBet ?? 1000,
    );
  }

  function getMinimumBet() {
    return Number(
      state.activeRound?.minimumBet ?? state.settings?.minimumBet ?? 5,
    );
  }

  function getRemainingLimit() {
    return Math.max(
      0,
      getMaximumBet() - Number(state.userBetSummary.totalBetAmount || 0),
    );
  }

  function findSymbolById(symbolId) {
    return (
      state.symbols.find((symbol) => Number(symbol.id) === Number(symbolId)) ||
      null
    );
  }

  function findSymbolByCode(code) {
    return (
      state.symbols.find(
        (symbol) => String(symbol.symbolCode) === String(code),
      ) || null
    );
  }

  function renderSymbols() {
    if (!DOM.symbolOptions) {
      return;
    }

    if (state.symbols.length === 0) {
      DOM.symbolOptions.innerHTML = `
          <p class="loading-message">
            কোনো Dice image পাওয়া যায়নি।
          </p>
        `;

      return;
    }

    DOM.symbolOptions.innerHTML = state.symbols
      .map((symbol) => {
        const selected = Number(state.selectedSymbol?.id) === Number(symbol.id);

        return `
              <button
                type="button"
                class="symbol-option${selected ? " is-selected" : ""}"
                data-symbol-id="${Number(symbol.id)}"
              >
                <img
                  src="${escapeHtml(getAssetUrl(symbol.imagePath))}"
                  alt="${escapeHtml(symbol.symbolNameBn)}"
                >

                <span>
                  ${escapeHtml(symbol.symbolNameBn)}
                </span>

                <strong>
                  ${Number(symbol.multiplier)}x
                </strong>
              </button>
            `;
      })
      .join("");

    DOM.symbolOptions.querySelectorAll(".symbol-option").forEach((button) => {
      button.addEventListener("click", () => {
        if (
          state.isRolling ||
          state.placingBet ||
          getRoundStatus() !== "betting"
        ) {
          return;
        }

        state.selectedSymbol = findSymbolById(button.dataset.symbolId);

        renderSymbols();
        updateBetPreview();
        updateBetControls();
      });
    });
  }

  function setBetAmount(value) {
    const minimum = getMinimumBet();

    const maximum = Math.min(
      getMaximumBet(),
      Math.max(minimum, getRemainingLimit()),
    );

    const amount = Number(value);

    state.selectedAmount = Math.min(
      maximum,
      Math.max(minimum, Number.isFinite(amount) ? amount : minimum),
    );

    DOM.betAmountInput.value = state.selectedAmount;

    updateBetPreview();
    updateBetControls();
  }

  function updateBetPreview() {
    const symbol = state.selectedSymbol;

    if (!symbol) {
      DOM.selectedSymbolText.textContent = "একটি ছবি নির্বাচন করুন";

      DOM.potentialPayout.textContent = "সম্ভাব্য payout: ৳0.00";

      return;
    }

    DOM.selectedSymbolText.textContent = `${symbol.symbolNameBn}-এ ৳${money(
      state.selectedAmount,
    )} Bet`;

    const grossPayout =
      Number(state.selectedAmount) * Number(symbol.multiplier);

    const chargePercent = Number(
      state.activeRound?.serviceChargePercent ??
        state.settings?.serviceChargePercent ??
        0,
    );

    const netPayout = grossPayout - (grossPayout * chargePercent) / 100;

    DOM.potentialPayout.textContent = `সম্ভাব্য payout: ৳${money(netPayout)}`;
  }

  function updateBetControls() {
    const status = getRoundStatus();

    const remaining = getRemainingLimit();

    const canBet =
      status === "betting" &&
      !state.isRolling &&
      !state.placingBet &&
      remaining > 0;

    DOM.remainingLimit.textContent = `Remaining: ৳${money(remaining)}`;

    DOM.decreaseBetBtn.disabled = !canBet;

    DOM.increaseBetBtn.disabled = !canBet;

    DOM.betAmountInput.disabled = !canBet;

    DOM.quickBetOptions?.querySelectorAll("button").forEach((button) => {
      button.disabled = !canBet || Number(button.dataset.amount) > remaining;
    });

    DOM.symbolOptions?.querySelectorAll(".symbol-option").forEach((button) => {
      button.disabled = !canBet;
    });

    const selectedAmount = Number(state.selectedAmount);

    DOM.placeBetBtn.disabled =
      !canBet || !state.selectedSymbol || selectedAmount > remaining;

    if (state.placingBet) {
      DOM.placeBetText.textContent = "Bet দেওয়া হচ্ছে...";

      return;
    }

    if (status !== "betting") {
      DOM.placeBetText.textContent = "Betting বন্ধ";

      return;
    }

    if (remaining <= 0) {
      DOM.placeBetText.textContent = "Round limit পূর্ণ হয়েছে";

      return;
    }

    if (!state.selectedSymbol) {
      DOM.placeBetText.textContent = "ছবি নির্বাচন করুন";

      return;
    }

    if (selectedAmount > remaining) {
      DOM.placeBetText.textContent = `Remaining ৳${money(remaining)}`;

      return;
    }

    DOM.placeBetText.textContent = `৳${money(selectedAmount)} Bet করুন`;
  }

  function calculateBetSummary(bets) {
    return bets.reduce(
      (result, bet) => {
        const amount = Number(bet.betAmount || 0);

        result.totalBetAmount += amount;

        result.symbolBetAmounts[bet.selectedSymbolCode] =
          Number(result.symbolBetAmounts[bet.selectedSymbolCode] || 0) + amount;

        return result;
      },
      {
        totalBets: bets.length,

        totalBetAmount: 0,

        symbolBetAmounts: {},
      },
    );
  }

  function renderUserBets(bets = [], serverSummary = null) {
    state.userBets = Array.isArray(bets) ? bets.filter(Boolean) : [];

    state.userBetSummary = {
      ...calculateBetSummary(state.userBets),
      ...(serverSummary || {}),
    };

    if (state.userBets.length === 0) {
      DOM.myBetsCard.classList.add("is-hidden");

      updateBetControls();

      return;
    }

    DOM.myBetsCard.classList.remove("is-hidden");

    DOM.myBetCount.textContent = `${state.userBets.length} Bet${
      state.userBets.length === 1 ? "" : "s"
    }`;

    DOM.myBetTotal.textContent = money(state.userBetSummary.totalBetAmount);

    DOM.myBetList.innerHTML = state.userBets
      .map((bet) => {
        const symbol = findSymbolByCode(bet.selectedSymbolCode);

        return `
              <div class="my-bet-item">

                <img
                  src="${escapeHtml(getAssetUrl(symbol?.imagePath))}"
                  alt="${escapeHtml(bet.selectedSymbolName)}"
                >

                <div>
                  <span>
                    ${escapeHtml(bet.selectedSymbolName)}
                  </span>

                  <small>
                    ${Number(bet.multiplier)}x · ${escapeHtml(
                      String(bet.betStatus || "accepted").toUpperCase(),
                    )}
                  </small>
                </div>

                <strong>
                  ৳${money(bet.betAmount)}
                </strong>

              </div>
            `;
      })
      .join("");

    updateBetControls();
  }

  function resetRoundState() {
    state.selectedSymbol = null;

    state.userBets = [];

    state.userBetSummary = {
      totalBets: 0,
      totalBetAmount: 0,
      symbolBetAmounts: {},
    };

    DOM.resultOverlay.classList.add("is-hidden");

    renderUserBets([]);
    renderSymbols();

    setBetAmount(getMinimumBet());
  }

  function startCountdown() {
    clearInterval(state.countdownTimer);

    const tick = () => {
      const round = state.activeRound;

      if (!round) {
        DOM.timerValue.textContent = "0";

        return;
      }

      const status = getRoundStatus(round);

      const endValue =
        status === "rolling" ? round.rollingEndsAt : round.bettingEndsAt;

      const endTime = new Date(endValue).getTime();

      const remaining = Math.max(0, endTime - serverNow());

      DOM.timerValue.textContent = String(Math.ceil(remaining / 1000));

      if (remaining <= 0 && status === "betting") {
        updateBetControls();
      }
    };

    tick();

    state.countdownTimer = setInterval(tick, 250);
  }

  function applyRound(round) {
    if (!round) {
      return;
    }

    const previousId = Number(state.activeRound?.id || 0);

    const nextId = Number(round.id || 0);

    state.activeRound = round;

    if (previousId && nextId && previousId !== nextId) {
      resetRoundState();
    }

    DOM.roundCode.textContent = round.roundCode || `#${round.id}`;

    const status = getRoundStatus(round);

    if (status === "betting") {
      DOM.roundStatus.textContent = "Betting Open";

      DOM.rollInformationText.textContent = "পছন্দের ছবিতে bet করুন";
    }

    if (status === "rolling") {
      DOM.roundStatus.textContent = "Dice Rolling";
    }

    startCountdown();
    updateBetControls();
  }

  function getFinalTransform(faceNumber) {
    const face = FACE_TRANSFORMS[Number(faceNumber)] || FACE_TRANSFORMS[1];

    return (
      `rotateX(${720 + face.x}deg) ` +
      `rotateY(${1080 + face.y}deg) ` +
      "rotateZ(360deg)"
    );
  }

  function animateDice(faceNumber, endsAt) {
    state.isRolling = true;

    updateBetControls();

    DOM.rollInformation.classList.add("is-rolling");

    DOM.rollInformationText.textContent = "পাশা ঘুরছে...";

    DOM.diceCube.classList.add("is-rolling");

    clearTimeout(state.rollTimer);

    const remaining = Math.max(500, new Date(endsAt).getTime() - serverNow());

    state.rollTimer = setTimeout(() => {
      DOM.diceCube.classList.remove("is-rolling");

      DOM.diceCube.style.transform = getFinalTransform(faceNumber);

      state.isRolling = false;

      DOM.rollInformation.classList.remove("is-rolling");

      DOM.rollInformationText.textContent = "ফলাফল প্রস্তুত";

      updateBetControls();
    }, remaining);
  }

  function showResult(data) {
    const round = data?.round || data;

    const code = data?.winningSymbol?.symbolCode || round?.winningSymbolCode;

    const symbol = findSymbolByCode(code);

    if (!symbol) {
      return;
    }

    DOM.winnerImage.src = getAssetUrl(symbol.imagePath);

    DOM.winnerImage.alt = symbol.symbolNameBn;

    DOM.winnerName.textContent = symbol.symbolNameBn;

    DOM.winnerMultiplier.textContent = `${Number(
      round?.winningMultiplier ?? symbol.multiplier,
    )}x`;

    DOM.userResultMessage.textContent = `${symbol.symbolNameBn} এই round-এর winner।`;

    DOM.resultOverlay.classList.remove("is-hidden");

    void loadRecentResults();
  }

  function renderUserResult(data) {
    updateWallet(data.walletBalance);

    if (Array.isArray(data.userBets)) {
      renderUserBets(data.userBets, data.userBetSummary);
    }

    const result = data.resultSummary || {};

    const winningBets = Number(result.winningBets || 0);

    const losingBets = Number(result.losingBets || 0);

    const netPayout = Number(result.netPayout || 0);

    if (winningBets > 0) {
      DOM.userResultMessage.textContent =
        `${winningBets} bet জিতেছেন, ` + `মোট payout ৳${money(netPayout)}।`;

      showToast(`আপনি ৳${money(netPayout)} payout পেয়েছেন`, "success");

      return;
    }

    if (Number(result.refundedBets || 0) > 0) {
      DOM.userResultMessage.textContent = `আপনার bet refund হয়েছে।`;

      showToast("Dice bet refund হয়েছে", "success");

      return;
    }

    if (losingBets > 0) {
      DOM.userResultMessage.textContent = `${losingBets} bet এই round-এ জেতেনি।`;
    }
  }

  async function loadRecentResults() {
    try {
      const response = await fetch(getApiUrl("/bangla-dice/results/recent"), {
        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Result load failed.");
      }

      const results = result.data?.results || [];

      if (results.length === 0) {
        DOM.recentResults.innerHTML = `
            <p class="loading-message">
              এখনো কোনো ফলাফল নেই।
            </p>
          `;

        return;
      }

      DOM.recentResults.innerHTML = results
        .map((round) => {
          const symbol = findSymbolByCode(round.winningSymbolCode);

          if (!symbol) {
            return "";
          }

          return `
                <div class="result-item">
                  <img
                    src="${escapeHtml(getAssetUrl(symbol.imagePath))}"
                    alt="${escapeHtml(symbol.symbolNameBn)}"
                  >

                  <strong>
                    ${escapeHtml(symbol.symbolNameBn)}
                  </strong>

                  <small>
                    ${escapeHtml(round.roundCode)}
                  </small>
                </div>
              `;
        })
        .join("");
    } catch (error) {
      DOM.recentResults.innerHTML = `
          <p class="loading-message">
            ফলাফল লোড করা যায়নি।
          </p>
        `;

      console.error("DICE RESULT LOAD ERROR:", error);
    }
  }

  function placeUserBet() {
    if (
      !state.selectedSymbol ||
      state.placingBet ||
      state.isRolling ||
      getRoundStatus() !== "betting"
    ) {
      return;
    }

    if (!state.socket?.connected) {
      showToast("Game server connected নয়", "error");

      return;
    }

    state.placingBet = true;

    updateBetControls();

    state.socket.emit(
      "bangla-dice:place-bet",
      {
        roundId: Number(state.activeRound?.id),

        symbolId: Number(state.selectedSymbol.id),

        betAmount: Number(state.selectedAmount),
      },
      (response) => {
        state.placingBet = false;

        if (!response?.success) {
          showToast(response?.message || "Bet দেওয়া যায়নি", "error");

          updateBetControls();

          return;
        }

        const placedBet = response.data?.bet;

        if (placedBet) {
          renderUserBets([...state.userBets, placedBet]);
        }

        updateWallet(response.data?.wallet?.balanceAfter);

        showToast("Bet সফল হয়েছে", "success");

        updateBetControls();
      },
    );
  }

  function handleState(payload) {
    const data = payload?.data || payload || {};

    updateServerTime(data.serverTime || payload?.serverTime);

    if (data.settings) {
      state.settings = data.settings;

      DOM.bettingMode.textContent =
        data.settings.resultMode === "weighted"
          ? "Weighted Mode"
          : "Equal Chance";
    }

    if (Array.isArray(data.symbols)) {
      state.symbols = data.symbols;

      renderSymbols();
    }

    if (data.activeRound) {
      applyRound(data.activeRound);
    }

    if (Array.isArray(data.userBets)) {
      renderUserBets(data.userBets, data.userBetSummary);
    }

    if (data.walletBalance !== undefined) {
      updateWallet(data.walletBalance);
    }

    if (!state.selectedAmount || Number(DOM.betAmountInput.value) <= 0) {
      setBetAmount(getMinimumBet());
    }

    updateBetPreview();
    updateBetControls();

    DOM.loadingOverlay.classList.add("is-hidden");

    void loadRecentResults();
  }

  function connectSocket() {
    const token = getToken();

    if (!token) {
      window.location.href = "/login";

      return;
    }

    state.socket = window.io(`${getServerUrl()}/bangla-dice`, {
      auth: {
        token,
      },

      transports: ["websocket", "polling"],

      reconnection: true,

      reconnectionAttempts: Infinity,

      reconnectionDelay: 700,

      timeout: 10000,
    });

    state.socket.on("connect", () => {
      setConnection(true);
    });

    state.socket.on("disconnect", () => {
      setConnection(false);
    });

    state.socket.on("connect_error", (error) => {
      setConnection(false);

      showToast(error.message || "Dice connection failed", "error");
    });

    state.socket.on("bangla-dice:state", handleState);

    state.socket.on("bangla-dice:round-started", (payload) => {
      const data = payload?.data || payload;

      updateServerTime(payload?.serverTime);

      resetRoundState();

      state.isRolling = false;

      DOM.diceCube.classList.remove("is-rolling");

      DOM.diceCube.style.transform = "rotateX(-18deg) rotateY(28deg)";

      applyRound(data.round || data);
    });

    state.socket.on("bangla-dice:betting-closed", () => {
      DOM.roundStatus.textContent = "Betting Closed";

      DOM.rollInformationText.textContent = "পাশা ঘোরার প্রস্তুতি চলছে";

      updateBetControls();
    });

    state.socket.on("bangla-dice:roll-started", (payload) => {
      const data = payload?.data || payload;

      updateServerTime(payload?.serverTime);

      const round = data.round || data;

      applyRound(round);

      DOM.roundStatus.textContent = "Dice Rolling";

      animateDice(
        data.winningFaceNumber || round.winningFaceNumber,
        round.rollingEndsAt,
      );
    });

    state.socket.on("bangla-dice:result", (payload) => {
      DOM.roundStatus.textContent = "Round Completed";

      showResult(payload?.data || payload);
    });

    state.socket.on("bangla-dice:user-result", (payload) => {
      renderUserResult(payload?.data || payload);
    });

    state.socket.on("bangla-dice:round-refunded", () => {
      showToast("Round refund হয়েছে", "success");
    });

    state.socket.on("bangla-dice:error", (payload) => {
      showToast(payload?.message || "Dice game error", "error");
    });
  }

  function bindControls() {
    DOM.backBtn?.addEventListener("click", () => {
      window.location.href = "/lobby";
    });

    DOM.soundBtn?.addEventListener("click", () => {
      state.soundEnabled = !state.soundEnabled;

      const icon = DOM.soundBtn.querySelector("i");

      if (icon) {
        icon.className = state.soundEnabled
          ? "fa-solid fa-volume-high"
          : "fa-solid fa-volume-xmark";
      }
    });

    DOM.decreaseBetBtn?.addEventListener("click", () => {
      setBetAmount(Number(state.selectedAmount) - getMinimumBet());
    });

    DOM.increaseBetBtn?.addEventListener("click", () => {
      setBetAmount(Number(state.selectedAmount) + getMinimumBet());
    });

    DOM.betAmountInput?.addEventListener("change", () => {
      setBetAmount(DOM.betAmountInput.value);
    });

    DOM.quickBetOptions?.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => {
        setBetAmount(button.dataset.amount);
      });
    });

    DOM.placeBetBtn?.addEventListener("click", placeUserBet);

    DOM.refreshResultsBtn?.addEventListener("click", () => {
      void loadRecentResults();
    });

    DOM.resultCloseBtn?.addEventListener("click", () => {
      DOM.resultOverlay.classList.add("is-hidden");
    });

    DOM.continueBtn?.addEventListener("click", () => {
      DOM.resultOverlay.classList.add("is-hidden");
    });
  }

  function initialize() {
    bindControls();

    setConnection(false);

    updateBetPreview();
    updateBetControls();

    connectSocket();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize);
  } else {
    initialize();
  }
})();
