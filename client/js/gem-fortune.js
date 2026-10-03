"use strict";

/* =========================
   Elements
========================= */

const loadingElement = document.getElementById("slotLoading");
const backButton = document.getElementById("backBtn");
const walletBalanceElement = document.getElementById("walletBalance");

const freeSpinElement = document.getElementById("freeSpinBalance");
const maximumMultiplierElement = document.getElementById("maximumMultiplier");

const reelsElement = document.getElementById("slotReels");
const reelCells = Array.from(document.querySelectorAll(".reel-cell"));

const messageElement = document.getElementById("slotMessage");
const lastWinElement = document.getElementById("lastWin");
const lastMultiplierElement = document.getElementById("lastMultiplier");

const betAmountElement = document.getElementById("betAmountDisplay");

const decreaseBetButton = document.getElementById("decreaseBetBtn");

const increaseBetButton = document.getElementById("increaseBetBtn");

const quickBetButtons = Array.from(document.querySelectorAll("[data-bet]"));

const spinButton = document.getElementById("spinBtn");
const spinButtonText = document.getElementById("spinButtonText");

const historyElement = document.getElementById("spinHistory");
const tabButtons = Array.from(document.querySelectorAll(".information-tab"));

const noticeElement = document.getElementById("slotNotice");
const noticeTitleElement = document.getElementById("noticeTitle");
const noticeMessageElement = document.getElementById("noticeMessage");

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
  noticeTimer: null,
};

const symbolIcons = {
  RUBY: "🔴",
  SAPPHIRE: "🔵",
  EMERALD: "🟢",
  AMETHYST: "🟣",
  TOPAZ: "🟡",
  DIAMOND: "💎",
  WILD: "⭐",
  SCATTER: "🔮",
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
    throw new Error(result.message || "Login session শেষ হয়ে গেছে।");
  }

  if (!response.ok || result.success === false) {
    const error = new Error(result.message || "Request failed.");

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
  freeSpinElement.textContent = String(state.freeSpinsBalance);

  spinButton.classList.toggle("free-spin", state.freeSpinsBalance > 0);

  spinButtonText.textContent =
    state.freeSpinsBalance > 0 ? "FREE SPIN" : "SPIN";
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

  if (symbols.length !== reelCells.length) return;

  reelCells.forEach((cell, index) => {
    const symbol = String(symbols[index]).toUpperCase();

    cell.dataset.symbol = symbol;
    cell.textContent = symbolIcons[symbol] || symbol;
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

      for (let column = 0; column < matchingCount; column += 1) {
        const row = Number(line.rows[column]);
        const index = row * 5 + column;

        if (reelCells[index]) {
          reelCells[index].classList.add("winning");
        }
      }

      return;
    }

    const positions = line.positions || line.cells || line.indexes || [];

    if (!Array.isArray(positions)) {
      return;
    }

    positions.forEach((position) => {
      let index = Number(position);

      if (position && typeof position === "object") {
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
      const symbolName = String(line.symbol || "Symbol").toUpperCase();

      const symbolIcon = symbolIcons[symbolName] || symbolName;

      const lineNumber = Number(line.lineNumber) + 1;

      const matchingCount = Number(line.matchingCount) || 0;

      const multiplier = Number(line.lineMultiplier) || 0;

      return `Line ${lineNumber}: ${symbolIcon} ×${matchingCount} = ${multiplier}x`;
    })
    .join(" | ");

  const extraLineCount = winningLines.length - 3;

  const extraText = extraLineCount > 0 ? ` | আরও ${extraLineCount}টি line` : "";

  return `${details}${extraText} • Win ৳${money(result.payoutAmount)}`;
}

/* =========================
   Game state
========================= */

async function loadGameState() {
  const responseData = await apiRequest("/api/gem-fortune/state");

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
    wallet.walletBalance ?? wallet.balance ?? player.walletBalance ?? 0,
  );

  state.freeSpinsBalance = Number(
    player.freeSpinsBalance ?? data.freeSpinsBalance ?? 0,
  );

  walletBalanceElement.textContent = money(state.walletBalance);

  maximumMultiplierElement.textContent = `${Number(settings.maxWinMultiplier || 0)}x`;

  updateBetDisplay();
  updateFreeSpinDisplay();

  if (settings.isEnabled === false) {
    spinButton.disabled = true;
    messageElement.textContent = "Gem Fortune game এখন বন্ধ আছে";
  }

  if (settings.maintenanceMode === true) {
    spinButton.disabled = true;
    messageElement.textContent = "Gem Fortune game maintenance চলছে";
  }
}

/* =========================
   Spin
========================= */

function createTemporarySpin() {
  const availableSymbols = Object.values(symbolIcons);

  reelCells.forEach((cell) => {
    const randomIndex = Math.floor(Math.random() * availableSymbols.length);

    cell.textContent = availableSymbols[randomIndex];
  });
}

async function animateSpinUntil(requestPromise) {
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  if (reducedMotion) return requestPromise;

  const symbols = Object.keys(symbolIcons);
  const previousCells = reelCells.map((cell) => ({
    text: cell.textContent,
    symbol: cell.dataset.symbol,
  }));

  const timers = new Map();
  let completed = false;

  const paintColumn = (column) => {
    for (let row = 0; row < 3; row++) {
      const cell = reelCells[row * 5 + column];
      const symbol = symbols[Math.floor(Math.random() * symbols.length)];

      cell.dataset.symbol = symbol;
      cell.textContent = symbolIcons[symbol];
    }
  };

  for (let column = 0; column < 5; column++) {
    for (let row = 0; row < 3; row++) {
      reelCells[row * 5 + column].classList.add("is-rolling");
    }

    paintColumn(column);
    timers.set(
      column,
      window.setInterval(() => paintColumn(column), 85 + column * 8),
    );
  }

  try {
    const [response] = await Promise.all([requestPromise, wait(900)]);

    const result = response.spin || response;
    const finalSymbols = normalizeGrid(result.grid);

    if (
      finalSymbols.length !== 15 ||
      finalSymbols.some(
        (symbol) => !Object.hasOwn(symbolIcons, String(symbol).toUpperCase()),
      )
    ) {
      throw new Error("Spin result দেখানো যায়নি। Wallet ও History যাচাই করুন।");
    }

    for (let column = 0; column < 5; column++) {
      window.clearInterval(timers.get(column));
      timers.delete(column);

      for (let row = 0; row < 3; row++) {
        const index = row * 5 + column;
        const cell = reelCells[index];
        const symbol = String(finalSymbols[index]).toUpperCase();

        cell.classList.remove("is-rolling");
        cell.dataset.symbol = symbol;
        cell.textContent = symbolIcons[symbol];
      }

      if (column < 4) await wait(140);
    }

    completed = true;
    return response;
  } finally {
    timers.forEach((timer) => window.clearInterval(timer));

    reelCells.forEach((cell, index) => {
      cell.classList.remove("is-rolling");

      if (!completed) {
        cell.textContent = previousCells[index].text;

        if (previousCells[index].symbol) {
          cell.dataset.symbol = previousCells[index].symbol;
        } else {
          delete cell.dataset.symbol;
        }
      }
    });
  }
}

async function spin() {
  if (state.loading) {
    return;
  }

  if (state.freeSpinsBalance <= 0 && state.walletBalance < state.betAmount) {
    showNotice("আপনার Wallet balance পর্যাপ্ত নয়।", "Balance");
    return;
  }

  clearWinningCells();
  messageElement.classList.remove("win");
  messageElement.textContent = "Reels ঘুরছে...";
  setLoading(true);

  try {
    const requestPromise = apiRequest("/api/gem-fortune/spin", {
      method: "POST",

      body: JSON.stringify({
        betAmount: state.betAmount,
      }),
    });

    const responseData = await animateSpinUntil(requestPromise);

    const result = responseData.spin || responseData;

    renderGrid(result.grid);
    markWinningCells(result.winningLines);

    state.walletBalance = Number(result.walletBalance ?? state.walletBalance);

    state.freeSpinsBalance = Number(result.freeSpinsBalance ?? 0);

    walletBalanceElement.textContent = money(state.walletBalance);

    lastWinElement.textContent = money(result.payoutAmount);

    lastMultiplierElement.textContent = `${Number(result.winMultiplier || 0).toFixed(2)}x`;

    if (Number(result.payoutAmount) > 0) {
      messageElement.textContent = createWinningMessage(result);

      messageElement.classList.add("win");
    } else {
      messageElement.textContent = "এই Spin-এ Win হয়নি—আবার চেষ্টা করুন";
    }

    if (Number(result.freeSpinsWon) > 0) {
      showNotice(`${result.freeSpinsWon}টি Free Spin পেয়েছেন!`, "Free Spins");
    }

    await loadHistory();
  } catch (error) {
    messageElement.textContent = error.message || "Spin সম্পন্ন হয়নি।";

    showNotice(error.message || "Spin সম্পন্ন হয়নি।", "Spin Error");

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
      const payout = Number(item.payoutAmount ?? item.payout_amount ?? 0);

      const bet = Number(item.betAmount ?? item.bet_amount ?? 0);

      const multiplier = Number(item.winMultiplier ?? item.win_multiplier ?? 0);

      const createdAt = item.createdAt || item.created_at || "";

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
    const data = await apiRequest("/api/gem-fortune/history?limit=20");

    const items =
      data.history ||
      data.spins ||
      data.items ||
      (Array.isArray(data) ? data : []);

    renderHistory(items);
  } catch (error) {
    console.error("Gem Fortune history error:", error);
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
        tabButton.classList.toggle("active", tabButton === button);
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
    await Promise.all([loadGameState(), loadHistory()]);
  } catch (error) {
    showNotice(error.message || "Gem Fortune game load হয়নি।", "Loading Error");
  } finally {
    loadingElement.classList.add("hidden");
  }
}

document.addEventListener("DOMContentLoaded", initializeSlot);

document.addEventListener("DOMContentLoaded", () => {
  const preview = [
    "RUBY", "SAPPHIRE", "EMERALD", "AMETHYST", "TOPAZ",
    "SAPPHIRE", "DIAMOND", "WILD", "RUBY", "EMERALD",
    "AMETHYST", "TOPAZ", "RUBY", "SAPPHIRE", "DIAMOND",
  ];

  reelCells.forEach((cell, index) => {
    cell.dataset.symbol = preview[index];
    cell.textContent = symbolIcons[preview[index]];
  });
});

(() => {
  const gemPalette = {
    RUBY: ["#ffdde6", "#ff567d", "#bd1749", "#550d29"],
    SAPPHIRE: ["#e3f5ff", "#55b7ff", "#235be1", "#112667"],
    EMERALD: ["#d9fff0", "#4ce9ad", "#11956d", "#064f40"],
    AMETHYST: ["#f7e5ff", "#c889ff", "#8041c8", "#39165f"],
    TOPAZ: ["#fff9d9", "#ffda66", "#d18a19", "#6c3e0b"],
    DIAMOND: ["#ffffff", "#d5f5ff", "#80c6df", "#356c91"],
    WILD: ["#fffbea", "#ffe47d", "#d59325", "#68440a"],
    SCATTER: ["#fff0ff", "#e5a0ff", "#9650e2", "#432066"],
  };

  const gemNames = {
    RUBY: "Ruby",
    SAPPHIRE: "Sapphire",
    EMERALD: "Emerald",
    AMETHYST: "Amethyst",
    TOPAZ: "Topaz",
    DIAMOND: "Diamond",
    WILD: "Wild",
    SCATTER: "Scatter",
  };

  const gemMarkup = (symbol, cellIndex) => {
    const [light, main, dark, deep] = gemPalette[symbol];
    const gradientId = `gem-gradient-${cellIndex}-${symbol}`;

    const artwork = symbol === "WILD"
      ? `
        <path d="M60 12 73 42 106 45 81 67 88 101
          60 83 32 101 39 67 14 45 47 42Z"
          fill="url(#${gradientId})"
          stroke="${light}" stroke-width="2"/>
        <path d="M60 12 60 62 14 45 47 42Z"
          fill="${light}" opacity=".5"/>
        <path d="M60 62 88 101 60 83 32 101Z"
          fill="${deep}" opacity=".55"/>
        <text x="60" y="68" text-anchor="middle"
          fill="${deep}" font-size="16" font-weight="900"
          font-family="system-ui,sans-serif">WILD</text>`
      : symbol === "SCATTER"
      ? `
        <circle cx="60" cy="56" r="35"
          fill="url(#${gradientId})"
          stroke="${light}" stroke-width="2"/>
        <ellipse cx="49" cy="40" rx="13" ry="7"
          fill="white" opacity=".6" transform="rotate(-30 49 40)"/>
        <path d="M28 89H92L100 99H20Z" fill="${dark}"/>
        <path d="M37 86H83L89 92H31Z" fill="${light}" opacity=".75"/>
        <path d="M61 29 65 44 80 48 65 52 61 67
          57 52 42 48 57 44Z" fill="white" opacity=".85"/>`
      : `
        <path d="M30 22H90L110 47 60 105 10 47Z"
          fill="url(#${gradientId})"
          stroke="${light}" stroke-width="1.5"/>
        <path d="M30 22 44 47H10Z" fill="${light}" opacity=".75"/>
        <path d="M30 22H90L76 47H44Z" fill="${light}" opacity=".4"/>
        <path d="M90 22 110 47H76Z" fill="${main}"/>
        <path d="M10 47H44L60 105Z" fill="${dark}"/>
        <path d="M44 47H76L60 105Z" fill="${main}" opacity=".8"/>
        <path d="M76 47H110L60 105Z" fill="${deep}" opacity=".8"/>
        <path d="M30 22H90L110 47H10Z"
          fill="none" stroke="${light}" stroke-width="1.2"/>
        <path d="M44 47 60 105 76 47"
          fill="none" stroke="${light}" stroke-opacity=".5"/>
        <path d="M34 27H61" stroke="white"
          stroke-width="3" stroke-linecap="round" opacity=".7"/>`;

    return `
      <svg class="gem-symbol-art" data-gem-symbol="${symbol}"
        viewBox="0 0 120 120" role="img"
        aria-label="${gemNames[symbol]}">
        <defs>
          <linearGradient id="${gradientId}" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="${light}"/>
            <stop offset=".45" stop-color="${main}"/>
            <stop offset="1" stop-color="${deep}"/>
          </linearGradient>
        </defs>
        <ellipse cx="60" cy="109" rx="30" ry="5"
          fill="#000" opacity=".3"/>
        ${artwork}
        <path d="M94 12V24M88 18H100"
          stroke="white" stroke-width="2"
          stroke-linecap="round" opacity=".85"/>
      </svg>`;
  };

  const startGemArtwork = () => {
    const grid = document.getElementById("slotReels");
    if (!grid) return;

    const repaint = () => {
      grid.querySelectorAll(".reel-cell").forEach((cell, index) => {
        const symbol = cell.dataset.symbol;
        if (!Object.hasOwn(gemPalette, symbol)) return;

        if (
          cell.children.length === 1 &&
          cell.firstElementChild?.dataset.gemSymbol === symbol
        ) return;

        cell.innerHTML = gemMarkup(symbol, index);
      });
    };

    repaint();

    const observer = new MutationObserver(repaint);

    observer.observe(grid, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-symbol"],
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startGemArtwork, {
      once: true,
    });
  } else {
    startGemArtwork();
  }
})();