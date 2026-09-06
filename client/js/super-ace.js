"use strict";

/* =========================
   Elements
========================= */

const loadingElement = document.getElementById("slotLoading");
const backButton = document.getElementById("backBtn");
const walletBalanceElement = document.getElementById("walletBalance");

const freeSpinElement = document.getElementById("freeSpinBalance");

const aceMeterCountElement =
  document.getElementById("aceMeterCount");

const aceMeterTargetElement =
  document.getElementById("aceMeterTarget");

const aceMeterProgressElement =
  document.getElementById("aceMeterProgress");

const aceMeterCard =
  document.querySelector(".ace-meter-card");
const maximumMultiplierElement =
  document.getElementById("maximumMultiplier");

const reelsElement = document.getElementById("slotReels");
const reelCells = Array.from(
  document.querySelectorAll(".reel-cell"),
);

const messageElement = document.getElementById("slotMessage");
const lastWinElement = document.getElementById("lastWin");
const lastMultiplierElement =
  document.getElementById("lastMultiplier");

const betAmountElement =
  document.getElementById("betAmountDisplay");

const decreaseBetButton =
  document.getElementById("decreaseBetBtn");

const increaseBetButton =
  document.getElementById("increaseBetBtn");

const quickBetButtons = Array.from(
  document.querySelectorAll("[data-bet]"),
);

const spinButton = document.getElementById("spinBtn");
const spinButtonText =
  document.getElementById("spinButtonText");

const historyElement = document.getElementById("spinHistory");
const tabButtons = Array.from(
  document.querySelectorAll(".information-tab"),
);

const noticeElement = document.getElementById("slotNotice");
const noticeTitleElement =
  document.getElementById("noticeTitle");
const noticeMessageElement =
  document.getElementById("noticeMessage");

/* =========================
   State
========================= */

const state = {
  loading: false,
  betAmount: 10,
  minBet: 10,
  maxBet: 5000,
  walletBalance: 0,
  freeSpinsBalance: 0,
    aceMeterCount: 0,
  aceMeterTarget: 5,
  noticeTimer: null,
};

const symbolIcons = {
  TEN: "10",
  JACK: "J",
  QUEEN: "Q",
  KING: "K",
  ACE: "A",
  CROWN: "👑",
  WILD: "🃏",
  SCATTER: "💎",
};

/* =========================
   Helpers
========================= */

function getAccessToken() {
  return (
    localStorage.getItem("access_token") ||
    localStorage.getItem("token") ||
    sessionStorage.getItem("access_token") ||
    ""
  );
}

function money(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "0.00";
  }

  return number.toFixed(2);
}

function getApiUrl(path) {
  return path;
}

function redirectToLogin() {
  window.location.href = "/login";
}

function wait(milliseconds) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

function showNotice(message, title = "Notice") {
  window.clearTimeout(state.noticeTimer);

  noticeTitleElement.textContent = title;
  noticeMessageElement.textContent = message;
  noticeElement.classList.remove("hidden");

  state.noticeTimer = window.setTimeout(() => {
    noticeElement.classList.add("hidden");
  }, 3500);
}

async function apiRequest(path, options = {}) {
  const token = getAccessToken();

  if (!token) {
    redirectToLogin();
    throw new Error("Login session পাওয়া যায়নি।");
  }

  const response = await fetch(getApiUrl(path), {
    ...options,

    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  const result = await response.json().catch(() => ({
    success: false,
    message: "Server থেকে সঠিক response পাওয়া যায়নি।",
  }));

  if (response.status === 401) {
    redirectToLogin();
    throw new Error(
      result.message || "Login session শেষ হয়ে গেছে।",
    );
  }

  if (!response.ok || result.success === false) {
    const error = new Error(
      result.message || "Request failed.",
    );

    error.code = result.code || null;
    throw error;
  }

  return result.data ?? result;
}

/* =========================
   Display
========================= */

function updateBetDisplay() {
  state.betAmount = Math.min(
    state.maxBet,
    Math.max(state.minBet, Number(state.betAmount)),
  );

  betAmountElement.textContent = money(state.betAmount);

  quickBetButtons.forEach((button) => {
    button.classList.toggle(
      "active",
      Number(button.dataset.bet) === state.betAmount,
    );
  });
}

function updateFreeSpinDisplay() {
  freeSpinElement.textContent =
    String(state.freeSpinsBalance);

  spinButton.classList.toggle(
    "free-spin",
    state.freeSpinsBalance > 0,
  );

  spinButtonText.textContent =
    state.freeSpinsBalance > 0
      ? "FREE SPIN"
      : "SPIN";
}

function updateAceMeter(triggered = false) {
  const target = Math.max(
    1,
    Number(state.aceMeterTarget) || 5,
  );

  const count = Math.max(
    0,
    Number(state.aceMeterCount) || 0,
  );

  const progress = Math.min(
    100,
    (count / target) * 100,
  );

  aceMeterCountElement.textContent =
    String(count);

  aceMeterTargetElement.textContent =
    String(target);

  aceMeterProgressElement.style.width =
    `${progress}%`;

  aceMeterCard.classList.toggle(
    "triggered",
    Boolean(triggered),
  );

  if (triggered) {
    window.setTimeout(() => {
      aceMeterCard.classList.remove(
        "triggered",
      );
    }, 1800);
  }
}

function setLoading(loading) {
  state.loading = loading;
  spinButton.disabled = loading;
  decreaseBetButton.disabled = loading;
  increaseBetButton.disabled = loading;

  quickBetButtons.forEach((button) => {
    button.disabled = loading;
  });

  reelsElement.classList.toggle("spinning", loading);
  spinButton.classList.toggle("spinning", loading);

  if (loading) {
    spinButtonText.textContent = "SPINNING";
  } else {
    updateFreeSpinDisplay();
  }
}

function clearWinningCells() {
  reelCells.forEach((cell) => {
    cell.classList.remove("winning");
  });
}

function normalizeGrid(grid) {
  if (!Array.isArray(grid)) {
    return [];
  }

  if (grid.length === 3 && Array.isArray(grid[0])) {
    return grid.flat();
  }

  return grid.flat(Infinity).slice(0, 15);
}

function renderGrid(grid) {
  const symbols = normalizeGrid(grid);

  if (symbols.length < 15) {
    return;
  }

  reelCells.forEach((cell, index) => {
    const symbol = String(symbols[index] || "").toUpperCase();

    cell.textContent = symbolIcons[symbol] || symbol || "❔";
  });
}
function markWinningCells(winningLines) {
  clearWinningCells();

  if (!Array.isArray(winningLines)) {
    return;
  }

  winningLines.forEach((line) => {
    /*
     * Backend rows example:
     * [0, 0, 0, 0, 0] = ওপরের horizontal line
     * [1, 1, 1, 1, 1] = মাঝের horizontal line
     * [0, 1, 2, 1, 0] = V-shaped line
     */

    if (Array.isArray(line.rows)) {
      const matchingCount = Math.min(
        5,
        Math.max(0, Number(line.matchingCount) || 0),
      );

      for (
        let column = 0;
        column < matchingCount;
        column += 1
      ) {
        const row = Number(line.rows[column]);
        const index = row * 5 + column;

        if (reelCells[index]) {
          reelCells[index].classList.add("winning");
        }
      }

      return;
    }

    const positions =
      line.positions ||
      line.cells ||
      line.indexes ||
      [];

    if (!Array.isArray(positions)) {
      return;
    }

    positions.forEach((position) => {
      let index = Number(position);

      if (
        position &&
        typeof position === "object"
      ) {
        const row = Number(position.row);
        const column = Number(position.column);

        index = row * 5 + column;
      }

      if (reelCells[index]) {
        reelCells[index].classList.add("winning");
      }
    });
  });
}

function createWinningMessage(result) {
  const winningLines = Array.isArray(result.winningLines)
    ? result.winningLines
    : [];

  if (winningLines.length === 0) {
    return `আপনি ৳${money(result.payoutAmount)} জিতেছেন!`;
  }

  const details = winningLines
    .slice(0, 3)
    .map((line) => {
      const symbolName = String(
        line.symbol || "Symbol",
      ).toUpperCase();

      const symbolIcon =
        symbolIcons[symbolName] || symbolName;

      const lineNumber =
        Number(line.lineNumber) + 1;

      const matchingCount =
        Number(line.matchingCount) || 0;

      const multiplier =
        Number(line.lineMultiplier) || 0;

      return `Line ${lineNumber}: ${symbolIcon} ×${matchingCount} = ${multiplier}x`;
    })
    .join(" | ");

  const extraLineCount =
    winningLines.length - 3;

  const extraText =
    extraLineCount > 0
      ? ` | আরও ${extraLineCount}টি line`
      : "";

  return `${details}${extraText} • Win ৳${money(
    result.payoutAmount,
  )}`;
}

/* =========================
   Game state
========================= */

async function loadGameState() {
  const responseData = await apiRequest("/api/super-ace/state");

  const data = responseData.state || responseData;

  const settings = data.settings || data;
  const player = data.player || data.playerState || data;
  const wallet = data.wallet || data;

  state.minBet = Number(settings.minBet) || 10;
  state.maxBet = Number(settings.maxBet) || 5000;

  state.betAmount = Math.min(
    state.maxBet,
    Math.max(state.minBet, state.betAmount),
  );

  state.walletBalance = Number(
    wallet.walletBalance ??
    wallet.balance ??
    player.walletBalance ??
    0,
  );

  state.freeSpinsBalance = Number(
    player.freeSpinsBalance ??
    data.freeSpinsBalance ??
    0,
  );

    state.aceMeterCount = Number(
    player.aceMeterCount ??
    data.aceMeterCount ??
    0,
  );

  state.aceMeterTarget = Number(
    player.aceMeterTarget ??
    data.aceMeterTarget ??
    settings.aceMeterTrigger ??
    5,
  );

  walletBalanceElement.textContent =
    money(state.walletBalance);

  maximumMultiplierElement.textContent =
    `${Number(settings.maxWinMultiplier || 0)}x`;

  updateBetDisplay();
  updateFreeSpinDisplay();
    updateAceMeter(false);

  if (settings.isEnabled === false) {
    spinButton.disabled = true;
    messageElement.textContent = "Super Ace game এখন বন্ধ আছে";
  }

  if (settings.maintenanceMode === true) {
    spinButton.disabled = true;
    messageElement.textContent =
      "Super Ace game maintenance চলছে";
  }
}

/* =========================
   Spin
========================= */

function createTemporarySpin() {
  const availableSymbols = Object.values(symbolIcons);

  reelCells.forEach((cell) => {
    const randomIndex = Math.floor(
      Math.random() * availableSymbols.length,
    );

    cell.textContent = availableSymbols[randomIndex];
  });
}

async function animateSpinUntil(requestPromise) {
  const animationTimer = window.setInterval(
    createTemporarySpin,
    90,
  );

  const minimumAnimation = wait(750);

  try {
    const [result] = await Promise.all([
      requestPromise,
      minimumAnimation,
    ]);

    return result;
  } finally {
    window.clearInterval(animationTimer);
  }
}

async function spin() {
  if (state.loading) {
    return;
  }

  if (
    state.freeSpinsBalance <= 0 &&
    state.walletBalance < state.betAmount
  ) {
    showNotice("আপনার Wallet balance পর্যাপ্ত নয়।", "Balance");
    return;
  }

  clearWinningCells();
  messageElement.classList.remove("win");
  messageElement.textContent = "Reels ঘুরছে...";
  setLoading(true);

  try {
    const requestPromise = apiRequest("/api/super-ace/spin", {
      method: "POST",

      body: JSON.stringify({
        betAmount: state.betAmount,
      }),
    });

   const responseData =
  await animateSpinUntil(requestPromise);

const result =
  responseData.spin || responseData;

    renderGrid(result.grid);
    markWinningCells(result.winningLines);

    state.walletBalance = Number(
      result.walletBalance ?? state.walletBalance,
    );

    state.freeSpinsBalance = Number(
      result.freeSpinsBalance ?? 0,
    );

        state.aceMeterCount = Number(
      result.aceMeterAfter ??
      state.aceMeterCount,
    );

    state.aceMeterTarget = Number(
      result.aceMeterTarget ??
      state.aceMeterTarget,
    );

    updateAceMeter(
      result.aceBonusTriggered === true,
    );

    walletBalanceElement.textContent =
      money(state.walletBalance);

    lastWinElement.textContent =
      money(result.payoutAmount);

    lastMultiplierElement.textContent =
      `${Number(result.winMultiplier || 0).toFixed(2)}x`;

   if (Number(result.payoutAmount) > 0) {
  messageElement.textContent =
    createWinningMessage(result);

  messageElement.classList.add("win");
}else {
      messageElement.textContent =
        "এই Spin-এ Win হয়নি—আবার চেষ্টা করুন";
    }

    if (Number(result.freeSpinsWon) > 0) {
      showNotice(
        `${result.freeSpinsWon}টি Free Spin পেয়েছেন!`,
        "Free Spins",
      );
    }

        if (result.aceBonusTriggered === true) {
      showNotice(
        `Ace Meter Bonus ${Number(
          result.bonusMultiplier || 1,
        ).toFixed(2)}x চালু হয়েছে!`,
        "ACE BONUS",
      );
    }

    await loadHistory();
  } catch (error) {
    messageElement.textContent =
      error.message || "Spin সম্পন্ন হয়নি।";

    showNotice(
      error.message || "Spin সম্পন্ন হয়নি।",
      "Spin Error",
    );

    await loadGameState().catch(() => {});
  } finally {
    setLoading(false);
  }
}

/* =========================
   History
========================= */

function renderHistory(items) {
  if (!Array.isArray(items) || items.length === 0) {
    historyElement.innerHTML =
      '<p class="empty-message">কোনো Spin history নেই</p>';

    return;
  }

  historyElement.innerHTML = items
    .slice(0, 20)
    .map((item) => {
      const payout = Number(
        item.payoutAmount ??
        item.payout_amount ??
        0,
      );

      const bet = Number(
        item.betAmount ??
        item.bet_amount ??
        0,
      );

      const multiplier = Number(
        item.winMultiplier ??
        item.win_multiplier ??
        0,
      );

      const createdAt =
        item.createdAt ||
        item.created_at ||
        "";

      const dateText = createdAt
        ? new Date(createdAt).toLocaleString("en-BD")
        : "";

      return `
        <div class="history-item">
          <div>
            <strong>${item.spinCode || item.spin_code || "Spin"}</strong>
            <span>${dateText}</span>
          </div>

          <strong>৳${money(bet)}</strong>

          <strong class="${payout > 0 ? "history-win" : "history-loss"}">
            ${payout > 0 ? "+" : ""}৳${money(payout)}
            (${multiplier.toFixed(2)}x)
          </strong>
        </div>
      `;
    })
    .join("");
}

async function loadHistory() {
  try {
    const data = await apiRequest("/api/super-ace/history?limit=20");

    const items =
      data.history ||
      data.spins ||
      data.items ||
      (Array.isArray(data) ? data : []);

    renderHistory(items);
  } catch (error) {
    console.error("Super Ace history error:", error);
  }
}

/* =========================
   Controls
========================= */

function changeBet(direction) {
  const current = Number(state.betAmount);

  let step = 10;

  if (current >= 1000) {
    step = 500;
  } else if (current >= 500) {
    step = 100;
  } else if (current >= 100) {
    step = 50;
  }

  state.betAmount = current + direction * step;
  updateBetDisplay();
}

function bindControls() {
  backButton.addEventListener("click", () => {
    window.location.href = "/lobby";
  });

  decreaseBetButton.addEventListener("click", () => {
    changeBet(-1);
  });

  increaseBetButton.addEventListener("click", () => {
    changeBet(1);
  });

  quickBetButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.betAmount = Number(button.dataset.bet);
      updateBetDisplay();
    });
  });

  spinButton.addEventListener("click", spin);

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const tabName = button.dataset.tab;

      tabButtons.forEach((tabButton) => {
        tabButton.classList.toggle(
          "active",
          tabButton === button,
        );
      });

      document
        .getElementById("historyTab")
        .classList.toggle("active", tabName === "history");

      document
        .getElementById("paytableTab")
        .classList.toggle("active", tabName === "paytable");
    });
  });
}

/* =========================
   Initialize
========================= */

async function initializeSlot() {
  bindControls();

  try {
    await Promise.all([
      loadGameState(),
      loadHistory(),
    ]);
  } catch (error) {
    showNotice(
      error.message || "Super Ace game load হয়নি।",
      "Loading Error",
    );
  } finally {
    loadingElement.classList.add("hidden");
  }
}

document.addEventListener(
  "DOMContentLoaded",
  initializeSlot,
);