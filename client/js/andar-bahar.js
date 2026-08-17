"use strict";

(function initializeAndarBaharGame() {
  /* =======================================================
     DOM ELEMENTS
  ======================================================= */

  const DOM = {
    backButton:
      document.getElementById("backBtn"),

    soundButton:
      document.getElementById("soundBtn"),

    walletBalance:
      document.getElementById("walletBalance"),

    connectionBar:
      document.getElementById("connectionBar"),

    connectionText:
      document.getElementById("connectionText"),

    roundCode:
      document.getElementById("roundCode"),

    roundStatusText:
      document.getElementById("roundStatusText"),

    timerValue:
      document.getElementById("timerValue"),

    jokerCardImage:
      document.getElementById("jokerCardImage"),

    andarSide:
      document.getElementById("andarSide"),

    baharSide:
      document.getElementById("baharSide"),

    andarCards:
      document.getElementById("andarCards"),

    baharCards:
      document.getElementById("baharCards"),

    andarPlayers:
      document.getElementById("andarPlayers"),

    baharPlayers:
      document.getElementById("baharPlayers"),

    andarTotal:
      document.getElementById("andarTotal"),

    baharTotal:
      document.getElementById("baharTotal"),

    andarBetButton:
      document.getElementById("andarBetBtn"),

    baharBetButton:
      document.getElementById("baharBetBtn"),

    selectedSideText:
      document.getElementById("selectedSideText"),

    decreaseBetButton:
      document.getElementById("decreaseBetBtn"),

    increaseBetButton:
      document.getElementById("increaseBetBtn"),

    betAmountInput:
      document.getElementById("betAmountInput"),

    quickBetOptions:
      document.getElementById("quickBetOptions"),

    placeBetButton:
      document.getElementById("placeBetBtn"),

    placeBetText:
      document.getElementById("placeBetText"),

    bettingMessage:
      document.getElementById("bettingMessage"),

    myBetCard:
      document.getElementById("myBetCard"),

    myBetSide:
      document.getElementById("myBetSide"),

    myBetAmount:
      document.getElementById("myBetAmount"),

    myBetStatus:
      document.getElementById("myBetStatus"),

    refreshHistoryButton:
      document.getElementById("refreshHistoryBtn"),

    recentResults:
      document.getElementById("recentResults"),

    resultOverlay:
      document.getElementById("resultOverlay"),

    resultCloseButton:
      document.getElementById("resultCloseBtn"),

    continueButton:
      document.getElementById("continueBtn"),

    resultTitle:
      document.getElementById("resultTitle"),

    resultJokerCard:
      document.getElementById("resultJokerCard"),

    resultMatchingCard:
      document.getElementById("resultMatchingCard"),

    userResultMessage:
      document.getElementById("userResultMessage"),

    loadingOverlay:
      document.getElementById("loadingOverlay"),

    loadingText:
      document.getElementById("loadingText"),

    toast:
      document.getElementById("gameToast"),
  };

  /* =======================================================
     GAME STATE
  ======================================================= */

  const state = {
    socket: null,
    connected: false,

    round: null,
    settings: {
      minimumBet: 5,
      maximumBet: 1000,
      bettingDurationSeconds: 15,
      resultDisplaySeconds: 8,
      nextRoundDelaySeconds: 5,
      serviceChargePercent: 5,
    },

   selectedSide: null,
betAmount: 5,

/*
 * userBet পুরোনো client compatibility-এর জন্য।
 * userBets-এ current round-এর সব bet থাকবে।
 */
userBet: null,
userBets: [],

userBetSummary: {
  totalBets: 0,
  totalBetAmount: 0,
  andarBetAmount: 0,
  baharBetAmount: 0,
},

    bettingOpen: false,
    placingBet: false,

    serverTimeOffset: 0,
    countdownTimer: null,

    cardAnimationTimers: [],
    toastTimer: null,

    soundEnabled: true,
    privateResult: null,
  };

  /* =======================================================
     AUTHENTICATION
  ======================================================= */

  function getAccessToken() {
    return localStorage.getItem(
      "access_token",
    );
  }

  function redirectToLogin() {
    localStorage.removeItem(
      "access_token",
    );

    window.location.replace(
      "./login.html",
    );
  }

  /* =======================================================
     FORMAT HELPERS
  ======================================================= */

  function parseAmount(value) {
    const amount = Number(value);

    if (!Number.isFinite(amount)) {
      return 0;
    }

    return Number(
      amount.toFixed(2),
    );
  }

  function formatMoney(value) {
    return parseAmount(
      value,
    ).toLocaleString(
      "en-BD",
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      },
    );
  }

  function formatSide(value) {
    const side =
      String(value || "")
        .trim()
        .toLowerCase();

    if (side === "andar") {
      return "Andar";
    }

    if (side === "bahar") {
      return "Bahar";
    }

    return "--";
  }

  function formatStatus(value) {
    return String(value || "")
      .replace(/_/g, " ")
      .replace(
        /\b\w/g,
        (character) =>
          character.toUpperCase(),
      );
  }

  function getApiUrl(path) {
    return window.APP_CONFIG.api(
      path,
    );
  }

  function getCardImageUrl(
    cardCode,
  ) {
    if (!cardCode) {
      return "../assets/cards/card-back.png";
    }

    return `../assets/cards/${String(
      cardCode,
    ).toUpperCase()}.png`;
  }

  /* =======================================================
     MESSAGE HELPERS
  ======================================================= */

  function setBettingMessage(
    message,
    type = "",
  ) {
    DOM.bettingMessage.textContent =
      message;

    DOM.bettingMessage.classList.remove(
      "is-error",
      "is-success",
    );

    if (type) {
      DOM.bettingMessage.classList.add(
        `is-${type}`,
      );
    }
  }

  function showToast(
    message,
    type = "",
  ) {
    window.clearTimeout(
      state.toastTimer,
    );

    DOM.toast.textContent =
      message;

    DOM.toast.classList.remove(
      "is-error",
      "is-success",
    );

    if (type) {
      DOM.toast.classList.add(
        `is-${type}`,
      );
    }

    DOM.toast.classList.add(
      "is-visible",
    );

    state.toastTimer =
      window.setTimeout(
        () => {
          DOM.toast.classList.remove(
            "is-visible",
          );
        },
        3500,
      );
  }

  function hideLoading() {
    DOM.loadingOverlay.classList.add(
      "is-hidden",
    );
  }

  /* =======================================================
     API REQUESTS
  ======================================================= */

  async function apiRequest(
    path,
    options = {},
  ) {
    const token =
      getAccessToken();

    if (!token) {
      redirectToLogin();

      throw new Error(
        "Login session is required.",
      );
    }

    const response =
      await fetch(
        getApiUrl(path),
        {
          ...options,

          headers: {
            "Content-Type":
              "application/json",

            Authorization:
              `Bearer ${token}`,

            ...options.headers,
          },
        },
      );

    const result =
      await response.json()
        .catch(() => ({
          success: false,
          message:
            "Invalid server response.",
        }));

    if (
      response.status === 401
    ) {
      redirectToLogin();

      throw new Error(
        result.message ||
          "Login session expired.",
      );
    }

    if (
      !response.ok ||
      !result.success
    ) {
      throw new Error(
        result.message ||
          "Request failed.",
      );
    }

    return result.data;
  }

  async function loadWallet() {
    const data =
      await apiRequest(
        "/wallet/summary",
      );

    const balance =
      data?.wallet?.balance ??
      data?.user?.walletBalance ??
      0;

    DOM.walletBalance.textContent =
      formatMoney(balance);

    return parseAmount(
      balance,
    );
  }

  async function loadRecentResults() {
    try {
      DOM.refreshHistoryButton.disabled =
        true;

      const data =
        await apiRequest(
          "/andar-bahar/results/recent",
        );

      renderRecentResults(
        data?.results || [],
      );
    } catch (error) {
      console.error(
        "Andar Bahar history error:",
        error,
      );

      DOM.recentResults.innerHTML = `
        <p class="history-placeholder">
          History could not be loaded.
        </p>
      `;
    } finally {
      DOM.refreshHistoryButton.disabled =
        false;
    }
  }

  /* =======================================================
     CONNECTION UI
  ======================================================= */

  function renderConnection(
    status,
    message,
  ) {
    DOM.connectionBar.classList.remove(
      "is-connected",
      "is-disconnected",
    );

    if (
      status === "connected"
    ) {
      DOM.connectionBar.classList.add(
        "is-connected",
      );
    }

    if (
      status === "disconnected"
    ) {
      DOM.connectionBar.classList.add(
        "is-disconnected",
      );
    }

    DOM.connectionText.textContent =
      message;
  }

  /* =======================================================
     BET CONTROLS
  ======================================================= */

  function clampBetAmount(value) {
    const minimum =
      parseAmount(
        state.settings.minimumBet,
      ) || 5;

    const maximum =
      parseAmount(
        state.settings.maximumBet,
      ) || 1000;

    return Math.min(
      maximum,
      Math.max(
        minimum,
        parseAmount(value),
      ),
    );
  }

  function setBetAmount(value) {
    state.betAmount =
      clampBetAmount(value);

    DOM.betAmountInput.value =
      String(
        state.betAmount,
      );

    DOM.quickBetOptions
      .querySelectorAll(
        "button[data-amount]",
      )
      .forEach((button) => {
        button.classList.toggle(
          "is-active",
          parseAmount(
            button.dataset.amount,
          ) === state.betAmount,
        );
      });

    renderBetControls();
  }

  function selectSide(side) {
   if (
  !state.bettingOpen ||
  state.placingBet
) {
  return;
}

    state.selectedSide =
      side;

    DOM.andarSide.classList.toggle(
      "is-selected",
      side === "andar",
    );

    DOM.baharSide.classList.toggle(
      "is-selected",
      side === "bahar",
    );

    DOM.selectedSideText.textContent =
      formatSide(side);

    renderBetControls();
  }

 function renderBetControls() {
  const maximumBet =
    Number(
      state.settings
        ?.maximumBet ||
      1000
    );

  const currentRoundTotal =
    Number(
      state.userBetSummary
        ?.totalBetAmount ||
      0
    );

  const remainingLimit =
    Math.max(
      0,
      maximumBet -
        currentRoundTotal
    );

  const controlsDisabled =
    !state.bettingOpen ||
    state.placingBet ||
    remainingLimit <= 0;

  DOM.andarBetButton.disabled =
    controlsDisabled;

  DOM.baharBetButton.disabled =
    controlsDisabled;

  DOM.decreaseBetButton.disabled =
    controlsDisabled;

  DOM.increaseBetButton.disabled =
    controlsDisabled;

  DOM.betAmountInput.disabled =
    controlsDisabled;

  DOM.quickBetOptions
    .querySelectorAll("button")
    .forEach((button) => {
      const quickAmount =
        Number(
          button.dataset.amount ||
          0
        );

      button.disabled =
        controlsDisabled ||
        quickAmount >
          remainingLimit;
    });

  const selectedAmount =
    Number(
      state.betAmount ||
      0
    );

  const canPlaceBet =
    state.bettingOpen &&
    !state.placingBet &&
    Boolean(
      state.selectedSide
    ) &&
    remainingLimit > 0 &&
    selectedAmount <=
      remainingLimit;

  DOM.placeBetButton.disabled =
    !canPlaceBet;

  if (state.placingBet) {
    DOM.placeBetText.textContent =
      "Placing Bet...";

    return;
  }

  if (!state.bettingOpen) {
    DOM.placeBetText.textContent =
      "Betting Closed";

    return;
  }

  if (remainingLimit <= 0) {
    DOM.placeBetText.textContent =
      "Round Bet Limit Reached";

    return;
  }

  if (!state.selectedSide) {
    DOM.placeBetText.textContent =
      "Select Andar or Bahar";

    return;
  }

  if (
    selectedAmount >
    remainingLimit
  ) {
    DOM.placeBetText.textContent =
      `Remaining limit ৳${formatMoney(
        remainingLimit
      )}`;

    return;
  }

  DOM.placeBetText.textContent =
    `Bet ৳${formatMoney(
      state.betAmount
    )} on ${formatSide(
      state.selectedSide
    )}`;
}

  /* =======================================================
     ROUND RENDERING
  ======================================================= */

  function clearCardAnimationTimers() {
    state.cardAnimationTimers
      .forEach((timer) => {
        window.clearTimeout(
          timer,
        );
      });

    state.cardAnimationTimers = [];
  }

  function resetCards() {
    clearCardAnimationTimers();

    DOM.jokerCardImage.src =
      getCardImageUrl(null);

    DOM.andarCards.innerHTML = `
      <span class="empty-card-message">
        Cards will appear here
      </span>
    `;

    DOM.baharCards.innerHTML = `
      <span class="empty-card-message">
        Cards will appear here
      </span>
    `;

    DOM.andarSide.classList.remove(
      "is-winner",
    );

    DOM.baharSide.classList.remove(
      "is-winner",
    );
  }

  function resetForNewRound() {
    state.selectedSide = null;
state.userBet = null;
state.userBets = [];

state.userBetSummary = {
  totalBets: 0,
  totalBetAmount: 0,
  andarBetAmount: 0,
  baharBetAmount: 0,
};
    state.privateResult = null;

    DOM.andarSide.classList.remove(
      "is-selected",
      "is-winner",
    );

    DOM.baharSide.classList.remove(
      "is-selected",
      "is-winner",
    );

    DOM.selectedSideText.textContent =
      "Choose Andar or Bahar";

    DOM.myBetCard.classList.add(
      "is-hidden",
    );

    DOM.resultOverlay.classList.add(
      "is-hidden",
    );

    resetCards();

    setBetAmount(
      state.settings.minimumBet,
    );
  }

  function renderSettings(settings) {
    if (!settings) {
      return;
    }

    state.settings = {
      ...state.settings,
      ...settings,
    };

    DOM.betAmountInput.min =
      String(
        state.settings.minimumBet,
      );

    DOM.betAmountInput.max =
      String(
        state.settings.maximumBet,
      );

    setBettingMessage(
      `Minimum bet ৳${formatMoney(
        state.settings.minimumBet,
      )} and maximum bet ৳${formatMoney(
        state.settings.maximumBet,
      )}.`,
    );
  }

  function renderRound(round) {
    if (!round) {
      state.round = null;
      state.bettingOpen = false;

      DOM.roundCode.textContent =
        "Waiting...";

      DOM.roundStatusText.textContent =
        "Waiting for round";

      DOM.timerValue.textContent =
        "--";

      renderBetControls();

      return;
    }

    const previousRoundId =
      state.round?.id || null;

    state.round = round;

    if (
      previousRoundId !==
      round.id
    ) {
      resetForNewRound();
    }

    DOM.roundCode.textContent =
      round.roundCode ||
      `#${round.id}`;

      DOM.jokerCardImage.src =
  getCardImageUrl(
    round.jokerCard,
  );

    DOM.roundStatusText.textContent =
      formatStatus(
        round.roundStatus,
      );

    state.bettingOpen =
      round.roundStatus ===
      "betting";

    startCountdown();

    renderBetControls();
  }

  function updateServerTimeOffset(
    serverTime,
  ) {
    const serverTimestamp =
      new Date(
        serverTime,
      ).getTime();

    if (
      Number.isFinite(
        serverTimestamp,
      )
    ) {
      state.serverTimeOffset =
        serverTimestamp -
        Date.now();
    }
  }

  function getServerNow() {
    return (
      Date.now() +
      state.serverTimeOffset
    );
  }

  function startCountdown() {
    window.clearInterval(
      state.countdownTimer,
    );

    function updateCountdown() {
      if (
        !state.round ||
        !state.round
          .bettingClosesAt
      ) {
        DOM.timerValue.textContent =
          "--";

        return;
      }

      const closesAt =
        new Date(
          state.round
            .bettingClosesAt,
        ).getTime();

      const remaining =
        Math.max(
          0,
          closesAt -
            getServerNow(),
        );

      const seconds =
        Math.ceil(
          remaining / 1000,
        );

      DOM.timerValue.textContent =
        String(seconds);

      if (remaining <= 0) {
        state.bettingOpen = false;

        DOM.roundStatusText.textContent =
          "Betting Closed";

        renderBetControls();

        window.clearInterval(
          state.countdownTimer,
        );
      }
    }

    updateCountdown();

    state.countdownTimer =
      window.setInterval(
        updateCountdown,
        250,
      );
  }

  /* =======================================================
     BET AND TOTAL RENDERING
  ======================================================= */

  function renderBetTotals(totals) {
    DOM.andarPlayers.textContent =
      String(
        totals?.andarPlayers ||
        0,
      );

    DOM.baharPlayers.textContent =
      String(
        totals?.baharPlayers ||
        0,
      );

    DOM.andarTotal.textContent =
      formatMoney(
        totals?.totalAndarBet ||
        0,
      );

    DOM.baharTotal.textContent =
      formatMoney(
        totals?.totalBaharBet ||
        0,
      );
  }

  function renderUserBet(bet) {
    state.userBet =
      bet || null;

    if (!bet) {
      DOM.myBetCard.classList.add(
        "is-hidden",
      );

      renderBetControls();

      return;
    }

    DOM.myBetCard.classList.remove(
      "is-hidden",
    );

    DOM.myBetSide.textContent =
      formatSide(
        bet.selectedSide,
      );

    DOM.myBetAmount.textContent =
      formatMoney(
        bet.betAmount,
      );

    DOM.myBetStatus.textContent =
      formatStatus(
        bet.betStatus,
      );

    state.selectedSide =
      bet.selectedSide;

    DOM.andarSide.classList.toggle(
      "is-selected",
      bet.selectedSide ===
        "andar",
    );

    DOM.baharSide.classList.toggle(
      "is-selected",
      bet.selectedSide ===
        "bahar",
    );

    DOM.selectedSideText.textContent =
      formatSide(
        bet.selectedSide,
      );

    renderBetControls();
  }
function renderUserBets(
  bets = [],
  serverSummary = null
) {
  const validBets =
    Array.isArray(bets)
      ? bets.filter(Boolean)
      : [];

  state.userBets =
    validBets;

  state.userBet =
    validBets[
      validBets.length -
        1
    ] ||
    null;

  const calculatedSummary =
    validBets.reduce(
      (
        summary,
        bet
      ) => {
        const amount =
          Number(
            bet.betAmount ||
              0
          );

        summary.totalBetAmount +=
          amount;

        if (
          bet.selectedSide ===
          "andar"
        ) {
          summary.andarBetAmount +=
            amount;
        }

        if (
          bet.selectedSide ===
          "bahar"
        ) {
          summary.baharBetAmount +=
            amount;
        }

        return summary;
      },
      {
        totalBets:
          validBets.length,

        totalBetAmount: 0,
        andarBetAmount: 0,
        baharBetAmount: 0,
      }
    );

  state.userBetSummary = {
    ...calculatedSummary,
    ...(serverSummary || {}),
  };

  if (
    validBets.length === 0
  ) {
    DOM.myBetCard.classList.add(
      "is-hidden"
    );

    renderBetControls();

    return;
  }

  DOM.myBetCard.classList.remove(
    "is-hidden"
  );

  const hasAndarBet =
    state.userBetSummary
      .andarBetAmount > 0;

  const hasBaharBet =
    state.userBetSummary
      .baharBetAmount > 0;

  if (
    hasAndarBet &&
    hasBaharBet
  ) {
    DOM.myBetSide.textContent =
      "Andar + Bahar";
  } else if (hasAndarBet) {
    DOM.myBetSide.textContent =
      "Andar";
  } else {
    DOM.myBetSide.textContent =
      "Bahar";
  }

  DOM.myBetAmount.textContent =
    formatMoney(
      state.userBetSummary
        .totalBetAmount
    );

  DOM.myBetStatus.textContent =
    `${state.userBetSummary.totalBets} Bet${
      state.userBetSummary
        .totalBets === 1
        ? ""
        : "s"
    }`;

  renderBetControls();
}
  /* =======================================================
     CARD ANIMATION
  ======================================================= */

  function createCardElement(card) {
    const image =
      document.createElement(
        "img",
      );

    image.className =
      "dealt-card";

    if (
      card.isMatchingCard
    ) {
      image.classList.add(
        "is-matching",
      );
    }

    image.src =
      getCardImageUrl(
        card.code,
      );

    image.alt =
      `${formatSide(
        card.side,
      )} ${card.rank}`;

    return image;
  }

  function animateCardFromJoker(
  image,
  side,
) {
  if (
    !image ||
    typeof image.animate !==
      "function"
  ) {
    return;
  }

  const reduceMotion =
    window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

  if (reduceMotion) {
    return;
  }

  window.requestAnimationFrame(
    () => {
      const jokerRect =
        DOM.jokerCardImage
          .getBoundingClientRect();

      const cardRect =
        image
          .getBoundingClientRect();

      const sourceCenterX =
        jokerRect.left +
        jokerRect.width / 2;

      const sourceCenterY =
        jokerRect.top +
        jokerRect.height / 2;

      const targetCenterX =
        cardRect.left +
        cardRect.width / 2;

      const targetCenterY =
        cardRect.top +
        cardRect.height / 2;

      const translateX =
        sourceCenterX -
        targetCenterX;

      const translateY =
        sourceCenterY -
        targetCenterY;

      const startingRotation =
        side === "andar"
          ? -14
          : 14;

      image.animate(
        [
          {
            opacity: 0.15,

            transform:
              `translate(${translateX}px, ${translateY}px) ` +
              `scale(0.72) rotate(${startingRotation}deg)`,

            filter:
              "drop-shadow(0 16px 15px rgba(0, 0, 0, 0.7))",
          },

          {
            opacity: 1,

            transform:
              "translate(0, 0) scale(1.08) rotate(0deg)",

            offset: 0.82,
          },

          {
            opacity: 1,

            transform:
              "translate(0, 0) scale(1) rotate(0deg)",

            filter:
              cardRect.width
                ? "drop-shadow(0 7px 8px rgba(0, 0, 0, 0.55))"
                : "none",
          },
        ],
        {
          duration: 560,

          easing:
            "cubic-bezier(0.18, 0.82, 0.28, 1)",

          fill: "both",
        },
      );
    },
  );
}

  function showRoundResult(result) {
    if (!result?.round) {
      return;
    }

    clearCardAnimationTimers();

    const round =
      result.round;

    const cards =
      Array.isArray(
        result.cards,
      )
        ? result.cards
        : [];

    DOM.jokerCardImage.src =
      getCardImageUrl(
        round.jokerCard,
      );

    DOM.andarCards.innerHTML =
      "";

    DOM.baharCards.innerHTML =
      "";

    const dealtCards =
      cards.filter(
        (card) =>
          card.side !== "joker",
      );

    dealtCards.forEach(
      (card, index) => {
        const timer =
          window.setTimeout(
            () => {
              const container =
                card.side ===
                "andar"
                  ? DOM.andarCards
                  : DOM.baharCards;

              const cardImage =
  createCardElement(
    card,
  );

container.appendChild(
  cardImage,
);

animateCardFromJoker(
  cardImage,
  card.side,
);

container.scrollLeft =
  container.scrollWidth;
            },
            index * 750,
          );

        state.cardAnimationTimers.push(
          timer,
        );
      },
    );

   const resultDelay =
  dealtCards.length *
    750 +
  700;

    const resultTimer =
      window.setTimeout(
        () => {
          const winningSide =
            round.winningSide;

          DOM.andarSide.classList.toggle(
            "is-winner",
            winningSide ===
              "andar",
          );

          DOM.baharSide.classList.toggle(
            "is-winner",
            winningSide ===
              "bahar",
          );

          DOM.resultTitle.textContent =
            formatSide(
              winningSide,
            ).toUpperCase();

          DOM.resultJokerCard.src =
            getCardImageUrl(
              round.jokerCard,
            );

          DOM.resultMatchingCard.src =
            getCardImageUrl(
              round.matchingCard,
            );

          renderPrivateResultMessage(
            state.privateResult,
            winningSide,
          );

          DOM.resultOverlay.classList.remove(
            "is-hidden",
          );

          loadRecentResults();
        },
        resultDelay,
      );

    state.cardAnimationTimers.push(
      resultTimer,
    );
  }

  function renderPrivateResultMessage(
  privateResult,
  winningSide
) {
  const userBets =
    Array.isArray(
      privateResult?.userBets
    )
      ? privateResult.userBets
      : state.userBets;

  const validBets =
    Array.isArray(userBets)
      ? userBets.filter(Boolean)
      : [];

  if (validBets.length === 0) {
    DOM.userResultMessage.textContent =
      `${formatSide(
        winningSide
      )} won this round.`;

    return;
  }

  renderUserBets(
    validBets,
    privateResult?.userBetSummary
  );

  const calculatedResult =
    validBets.reduce(
      (summary, bet) => {
        const status =
          String(
            bet.betStatus ??
            bet.bet_status ??
            ""
          ).toLowerCase();

        const amount =
          Number(
            bet.betAmount ??
            bet.bet_amount ??
            0
          );

        const payout =
          Number(
            bet.netPayout ??
            bet.net_payout ??
            0
          );

        summary.totalBetAmount +=
          amount;

        if (status === "won") {
          summary.winningBets += 1;
          summary.netPayout +=
            payout;
        }

        if (status === "lost") {
          summary.losingBets += 1;
          summary.lostAmount +=
            amount;
        }

        if (status === "refunded") {
          summary.refundedBets += 1;
          summary.refundedAmount +=
            amount;
        }

        return summary;
      },
      {
        winningBets: 0,
        losingBets: 0,
        refundedBets: 0,
        totalBetAmount: 0,
        lostAmount: 0,
        refundedAmount: 0,
        netPayout: 0
      }
    );

  const serverResult =
    privateResult?.resultSummary ||
    {};

  const result = {
    ...calculatedResult,
    ...serverResult
  };

  if (
    result.winningBets > 0 &&
    result.losingBets > 0
  ) {
    DOM.userResultMessage.textContent =
      `${result.winningBets} bet won, ` +
      `${result.losingBets} bet lost. ` +
      `Total payout ৳${formatMoney(
        result.netPayout
      )}.`;

    return;
  }

  if (result.winningBets > 0) {
    DOM.userResultMessage.textContent =
      `${result.winningBets} bet${
        result.winningBets === 1
          ? ""
          : "s"
      } won. Total payout ৳${formatMoney(
        result.netPayout
      )}.`;

    return;
  }

  if (result.refundedBets > 0) {
    DOM.userResultMessage.textContent =
      `${result.refundedBets} bet${
        result.refundedBets === 1
          ? ""
          : "s"
      } refunded. Amount ৳${formatMoney(
        result.refundedAmount
      )}.`;

    return;
  }

  DOM.userResultMessage.textContent =
    `${result.losingBets} bet${
      result.losingBets === 1
        ? ""
        : "s"
    } lost. Total bet ৳${formatMoney(
      result.totalBetAmount
    )}.`;
}

  /* =======================================================
     HISTORY
  ======================================================= */

  function renderRecentResults(results) {
    if (
      !Array.isArray(results) ||
      results.length === 0
    ) {
      DOM.recentResults.innerHTML = `
        <p class="history-placeholder">
          No completed rounds yet.
        </p>
      `;

      return;
    }

    DOM.recentResults.innerHTML =
      "";

    results.forEach(
      (result) => {
        const item =
          document.createElement(
            "div",
          );

        item.className =
          "history-item";

        const side =
          document.createElement(
            "strong",
          );

        side.textContent =
          formatSide(
            result.winningSide,
          );

        const card =
          document.createElement(
            "span",
          );

        card.textContent =
          `${result.jokerCard || "--"} → ${result.matchingCard || "--"}`;

        item.append(
          side,
          card,
        );

        DOM.recentResults.appendChild(
          item,
        );
      },
    );
  }

  /* =======================================================
     PLACE BET
  ======================================================= */

  function submitBet() {
    if (
      !state.socket ||
      !state.connected
    ) {
      showToast(
        "Game server is not connected.",
        "error",
      );

      return;
    }

    if (
      !state.round?.id ||
      !state.bettingOpen
    ) {
      showToast(
        "Betting is closed.",
        "error",
      );

      return;
    }

    if (
      !state.selectedSide
    ) {
      showToast(
        "Select Andar or Bahar.",
        "error",
      );

      return;
    }

    const amount =
      clampBetAmount(
        DOM.betAmountInput.value,
      );

    state.placingBet = true;

    setBetAmount(amount);

    renderBetControls();

    state.socket.emit(
      "andar-bahar:place-bet",
      {
        roundId:
          state.round.id,

        selectedSide:
          state.selectedSide,

        betAmount:
          amount,
      },
      (response) => {
        state.placingBet = false;

        if (
          !response?.success
        ) {
          const message =
            response?.message ||
            "Bet could not be placed.";

          setBettingMessage(
            message,
            "error",
          );

          showToast(
            message,
            "error",
          );

          renderBetControls();

          return;
        }

       const placedBet =
  response.data?.bet ||
  null;

if (placedBet) {
  renderUserBets(
    [
      ...state.userBets,
      placedBet,
    ],
  );
}

        if (
          response.data?.wallet
            ?.balanceAfter !==
          undefined
        ) {
          DOM.walletBalance.textContent =
            formatMoney(
              response.data
                .wallet
                .balanceAfter,
            );
        }

        setBettingMessage(
          "Your bet was accepted successfully.",
          "success",
        );

        showToast(
          "Bet placed successfully.",
          "success",
        );
      },
    );
  }

  /* =======================================================
     SOCKET
  ======================================================= */

  function initializeSocket() {
    if (
      typeof window.io !==
      "function"
    ) {
      renderConnection(
        "disconnected",
        "Socket.IO client unavailable",
      );

      DOM.loadingText.textContent =
        "Game connection unavailable.";

      return;
    }

    const token =
      getAccessToken();

    if (!token) {
      redirectToLogin();

      return;
    }

    const socket =
      window.io(
        `${window.APP_CONFIG.SERVER_URL}/andar-bahar`,
        {
          auth: {
            token,
          },

          transports: [
            "websocket",
            "polling",
          ],

          reconnection: true,
          reconnectionAttempts:
            Infinity,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          timeout: 15000,
        },
      );

    state.socket = socket;

    socket.on(
      "connect",
      () => {
        state.connected = true;

        renderConnection(
          "connected",
          "Live game connected",
        );
      },
    );

    socket.on(
      "disconnect",
      () => {
        state.connected = false;

        state.bettingOpen = false;

        renderConnection(
          "disconnected",
          "Connection lost — reconnecting...",
        );

        renderBetControls();
      },
    );

    socket.on(
      "connect_error",
      (error) => {
        state.connected = false;

        renderConnection(
          "disconnected",
          error.message ||
            "Connection failed",
        );

        if (
          error.data
            ?.statusCode === 401
        ) {
          redirectToLogin();
        }
      },
    );

    socket.on(
      "andar-bahar:connected",
      (payload) => {
        updateServerTimeOffset(
          payload.serverTime,
        );
      },
    );

    socket.on(
      "andar-bahar:state",
      (payload) => {
        const data =
          payload?.data;

        if (!data) {
          return;
        }

        updateServerTimeOffset(
          data.serverTime,
        );

        renderSettings(
          data.settings,
        );

        renderRound(
          data.activeRound,
        );

        renderBetTotals(
          data.betTotals,
        );

      if (
  data.userBets !==
  undefined
) {
  renderUserBets(
    data.userBets,
    data.userBetSummary,
  );
} else if (
  data.userBet !==
  undefined
) {
  renderUserBet(
    data.userBet,
  );
}

        hideLoading();
      },
    );

    socket.on(
      "andar-bahar:round-started",
      (payload) => {
        renderSettings(
          payload.settings,
        );

        renderRound(
          payload.round,
        );

        renderBetTotals({
          andarPlayers: 0,
          baharPlayers: 0,
          totalAndarBet: 0,
          totalBaharBet: 0,
        });

        hideLoading();

        showToast(
          "New betting round started.",
          "success",
        );
      },
    );

    socket.on(
      "andar-bahar:bet-totals",
      (payload) => {
        if (
          Number(
            payload.roundId,
          ) !==
          Number(
            state.round?.id,
          )
        ) {
          return;
        }

        renderBetTotals(
          payload.totals,
        );
      },
    );

    socket.on(
      "andar-bahar:betting-closed",
      () => {
        state.bettingOpen = false;

        DOM.roundStatusText.textContent =
          "Betting Closed";

        DOM.timerValue.textContent =
          "0";

        renderBetControls();

        setBettingMessage(
          "Betting is closed. Cards are being prepared.",
        );
      },
    );

    socket.on(
      "andar-bahar:dealing",
      () => {
        DOM.roundStatusText.textContent =
          "Dealing Cards";
      },
    );

    socket.on(
      "andar-bahar:user-result",
      (payload) => {
        state.privateResult =
          payload?.data || null;

        if (
          payload?.data
            ?.walletBalance !==
          undefined
        ) {
          DOM.walletBalance.textContent =
            formatMoney(
              payload.data
                .walletBalance,
            );
        }

        if (
  Array.isArray(
    payload?.data?.userBets
  )
) {
  renderUserBets(
    payload.data.userBets,
    payload.data
      .userBetSummary,
  );
} else if (
  payload?.data?.userBet
) {
  renderUserBet(
    payload.data.userBet,
  );
}
      },
    );

    socket.on(
      "andar-bahar:result",
      (payload) => {
        DOM.roundStatusText.textContent =
          "Round Completed";

        showRoundResult(
          payload?.data,
        );
      },
    );

    socket.on(
      "andar-bahar:error",
      (payload) => {
        const message =
          payload?.message ||
          "Andar Bahar game error.";

        showToast(
          message,
          "error",
        );
      },
    );
  }

  /* =======================================================
     EVENT LISTENERS
  ======================================================= */

  function bindEvents() {
    DOM.backButton.addEventListener(
      "click",
      () => {
        window.location.href =
          "./lobby.html";
      },
    );

    DOM.soundButton.addEventListener(
      "click",
      () => {
        state.soundEnabled =
          !state.soundEnabled;

        DOM.soundButton.innerHTML =
          state.soundEnabled
            ? '<i class="fa-solid fa-volume-high"></i>'
            : '<i class="fa-solid fa-volume-xmark"></i>';
      },
    );

    DOM.andarBetButton.addEventListener(
      "click",
      () => {
        selectSide("andar");
      },
    );

    DOM.baharBetButton.addEventListener(
      "click",
      () => {
        selectSide("bahar");
      },
    );

    DOM.decreaseBetButton.addEventListener(
      "click",
      () => {
        setBetAmount(
          state.betAmount - 5,
        );
      },
    );

    DOM.increaseBetButton.addEventListener(
      "click",
      () => {
        setBetAmount(
          state.betAmount + 5,
        );
      },
    );

    DOM.betAmountInput.addEventListener(
      "change",
      () => {
        setBetAmount(
          DOM.betAmountInput.value,
        );
      },
    );

    DOM.quickBetOptions.addEventListener(
      "click",
      (event) => {
        const button =
          event.target.closest(
            "button[data-amount]",
          );

        if (!button) {
          return;
        }

        setBetAmount(
          button.dataset.amount,
        );
      },
    );

    DOM.placeBetButton.addEventListener(
      "click",
      submitBet,
    );

    DOM.refreshHistoryButton.addEventListener(
      "click",
      loadRecentResults,
    );

    DOM.resultCloseButton.addEventListener(
      "click",
      () => {
        DOM.resultOverlay.classList.add(
          "is-hidden",
        );
      },
    );

    DOM.continueButton.addEventListener(
      "click",
      () => {
        DOM.resultOverlay.classList.add(
          "is-hidden",
        );
      },
    );

    window.addEventListener(
      "beforeunload",
      () => {
        window.clearInterval(
          state.countdownTimer,
        );

        clearCardAnimationTimers();

        state.socket?.disconnect();
      },
    );
  }

  /* =======================================================
     START
  ======================================================= */

  async function startGame() {
    if (
      !getAccessToken()
    ) {
      redirectToLogin();

      return;
    }

    bindEvents();

    setBetAmount(5);

    try {
      await Promise.all([
        loadWallet(),
        loadRecentResults(),
      ]);
    } catch (error) {
      console.error(
        "Andar Bahar initial data error:",
        error,
      );
    }

    initializeSocket();

    /*
     * Socket response দেরি হলেও loading screen আটকে থাকবে না।
     */
    window.setTimeout(
      hideLoading,
      15000,
    );
  }

  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      startGame,
      {
        once: true,
      },
    );
  } else {
    startGame();
  }
})();