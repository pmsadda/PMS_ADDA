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
  CHERRY: "🍒",
  LEMON: "🍋",
  ORANGE: "🍊",
  GRAPE: "🍇",
  PINEAPPLE: "🍍",
  WATERMELON: "🍉",
  WILD: "⭐",
  SCATTER: "🌺",
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
  const responseData = await apiRequest("/api/fruit-fiesta/state");

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
    messageElement.textContent = "Fruit Fiesta game এখন বন্ধ আছে";
  }

  if (settings.maintenanceMode === true) {
    spinButton.disabled = true;
    messageElement.textContent = "Fruit Fiesta game maintenance চলছে";
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
    const requestPromise = apiRequest("/api/fruit-fiesta/spin", {
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
    const data = await apiRequest("/api/fruit-fiesta/history?limit=20");

    const items =
      data.history ||
      data.spins ||
      data.items ||
      (Array.isArray(data) ? data : []);

    renderHistory(items);
  } catch (error) {
    console.error("Fruit Fiesta history error:", error);
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
    showNotice(error.message || "Fruit Fiesta game load হয়নি।", "Loading Error");
  } finally {
    loadingElement.classList.add("hidden");
  }
}

document.addEventListener("DOMContentLoaded", initializeSlot);

document.addEventListener("DOMContentLoaded", () => {
  const preview = [
    "CHERRY", "LEMON", "ORANGE", "GRAPE", "PINEAPPLE",
    "LEMON", "WATERMELON", "WILD", "CHERRY", "ORANGE",
    "GRAPE", "PINEAPPLE", "CHERRY", "LEMON", "WATERMELON",
  ];

  reelCells.forEach((cell, index) => {
    cell.dataset.symbol = preview[index];
    cell.textContent = symbolIcons[preview[index]];
  });
});

(() => {
  const fruitColors = {
    CHERRY: ["#ff8494", "#d92146", "#800d31"],
    LEMON: ["#fff59d", "#ffd43c", "#d89613"],
    ORANGE: ["#ffd58c", "#ff9635", "#d94b16"],
    GRAPE: ["#ddb5ff", "#9454cd", "#51277f"],
    PINEAPPLE: ["#ffe59b", "#f7bf45", "#bf7821"],
    WATERMELON: ["#ffb3a7", "#ff5d6a", "#cf304a"],
  };

  function fruitGraphic(symbol, index) {
    const [light, main, dark] = fruitColors[symbol];
    const id = `fruit-${index}-${symbol}`;
    const fill = `url(#${id})`;
    const leaf = "#32965b";

    const shapes = {
      CHERRY: `
        <path d="M42 54Q65 28 68 14M78 57Q67 35 68 14"
          fill="none" stroke="#557532" stroke-width="5"/>
        <path d="M67 17Q92 7 95 27Q78 30 67 17Z" fill="${leaf}"/>
        <circle cx="39" cy="74" r="25" fill="${fill}"/>
        <circle cx="80" cy="77" r="25" fill="${fill}"/>
        <ellipse cx="31" cy="63" rx="7" ry="4"
          fill="white" opacity=".6" transform="rotate(-35 31 63)"/>
        <ellipse cx="72" cy="66" rx="7" ry="4"
          fill="white" opacity=".6" transform="rotate(-35 72 66)"/>`,

      LEMON: `
        <path d="M16 67Q18 38 54 28Q88 22 106 53
          Q98 83 66 91Q33 95 16 67Z" fill="${fill}"/>
        <path d="M23 66 12 68 19 57M99 51 110 49 103 59"
          fill="${dark}"/>
        <path d="M47 29Q45 8 78 16Q72 34 47 29Z" fill="${leaf}"/>
        <path d="M30 54Q43 39 61 39" fill="none"
          stroke="white" stroke-width="5" opacity=".55"
          stroke-linecap="round"/>`,

      ORANGE: `
        <circle cx="60" cy="69" r="36" fill="${fill}"/>
        <path d="M58 33 61 19" stroke="#775b30" stroke-width="5"/>
        <path d="M61 24Q77 5 98 20Q82 41 61 24Z" fill="${leaf}"/>
        <path d="M36 54Q44 40 57 41" fill="none"
          stroke="white" stroke-width="5" opacity=".55"
          stroke-linecap="round"/>`,

      GRAPE: `
        <path d="M61 29V13" stroke="#735331" stroke-width="5"/>
        <path d="M61 21Q82 5 96 27Q78 36 61 21Z" fill="${leaf}"/>
        <g fill="${fill}" stroke="${dark}" stroke-width="1">
          <circle cx="43" cy="46" r="17"/>
          <circle cx="76" cy="46" r="17"/>
          <circle cx="31" cy="70" r="17"/>
          <circle cx="60" cy="70" r="18"/>
          <circle cx="89" cy="70" r="17"/>
          <circle cx="45" cy="93" r="16"/>
          <circle cx="75" cy="93" r="16"/>
        </g>
        <ellipse cx="39" cy="40" rx="6" ry="3"
          fill="white" opacity=".55"/>`,

      PINEAPPLE: `
        <path d="M59 41 27 17 48 21 46 5 61 22
          78 5 75 23 96 17 69 44Z" fill="${leaf}"/>
        <ellipse cx="61" cy="73" rx="31" ry="37" fill="${fill}"/>
        <g fill="none" stroke="${dark}" stroke-width="2" opacity=".5">
          <path d="M38 49 83 94M31 67 66 106M54 38 91 75"/>
          <path d="M85 49 40 94M91 67 56 106M68 38 31 75"/>
        </g>
        <path d="M42 54Q46 46 54 44" stroke="white"
          stroke-width="4" opacity=".5" stroke-linecap="round"/>`,

      WATERMELON: `
        <path d="M13 39H107Q101 106 60 108Q19 105 13 39Z"
          fill="#247948"/>
        <path d="M19 39H101Q95 96 60 100Q25 96 19 39Z"
          fill="#b8e97b"/>
        <path d="M25 39H95Q89 87 60 92Q31 87 25 39Z"
          fill="${fill}"/>
        <g fill="#542234">
          <ellipse cx="40" cy="57" rx="2.5" ry="5" transform="rotate(-25 40 57)"/>
          <ellipse cx="60" cy="58" rx="2.5" ry="5"/>
          <ellipse cx="80" cy="57" rx="2.5" ry="5" transform="rotate(25 80 57)"/>
          <ellipse cx="49" cy="76" rx="2.5" ry="4"/>
          <ellipse cx="71" cy="76" rx="2.5" ry="4"/>
        </g>`,
    };

    return `<svg class="fruit-symbol-art" data-fruit-symbol="${symbol}"
      viewBox="0 0 120 120" role="img" aria-label="${symbol}">
      <defs>
        <radialGradient id="${id}" cx=".3" cy=".2" r=".9">
          <stop offset="0" stop-color="${light}"/>
          <stop offset=".55" stop-color="${main}"/>
          <stop offset="1" stop-color="${dark}"/>
        </radialGradient>
      </defs>
      ${shapes[symbol]}
    </svg>`;
  }

  function startFruitArtwork() {
    const grid = document.getElementById("slotReels");
    if (!grid) return;

    const repaint = () => {
      grid.querySelectorAll(".reel-cell").forEach((cell, index) => {
        const symbol = cell.dataset.symbol;
        if (!Object.hasOwn(fruitColors, symbol)) return;

        if (
          cell.children.length === 1 &&
          cell.firstElementChild?.dataset.fruitSymbol === symbol
        ) return;

        cell.innerHTML = fruitGraphic(symbol, index);
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
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startFruitArtwork, {
      once: true,
    });
  } else {
    startFruitArtwork();
  }
})();