"use strict";

(() => {
  const $ = (id) => document.getElementById(id);
  const grid = $("gpGrid");
  const spinButton = $("gpSpin");
  const betInput = $("gpBet");
  const message = $("gpMessage");

  const symbols = [
    ["CHERRY", "Ankh"],
    ["LEMON", "Pyramid"],
    ["ORANGE", "Lotus"],
    ["GRAPE", "Eye of Horus"],
    ["BELL", "Scarab"],
    ["SEVEN", "Pharaoh"],
    ["WILD", "Crown · Wild"],
    ["SCATTER", "Gem · Scatter"],
  ];

  const indexes = new Map(symbols.map(([key], index) => [key, index]));
  const state = { busy: true, settings: null, wallet: 0, freeSpins: 0 };
  const cells = [];

  const money = (value) => `৳${Number(value || 0).toFixed(2)}`;

  function paint(element, key) {
    const index = indexes.get(key) ?? 0;
    element.style.backgroundPosition =
      `${(index % 4) * (100 / 3)}% ${Math.floor(index / 4) * 100}%`;
    element.title = symbols[index][1];
  }

  for (let index = 0; index < 25; index++) {
    const cell = document.createElement("div");
    const symbol = document.createElement("span");
    cell.className = "gp-cell";
    symbol.className = "gp-symbol";
    paint(symbol, symbols[index % symbols.length][0]);
    cell.append(symbol);
    grid.append(cell);
    cells.push({ cell, symbol });
  }

  symbols.forEach(([key, name]) => {
    const item = document.createElement("div");
    const icon = document.createElement("span");
    const label = document.createElement("small");
    icon.className = "gp-symbol";
    paint(icon, key);
    label.textContent = name;
    item.append(icon, label);
    $("gpLegend").append(item);
  });

  for (let index = 0; index < 25; index++) {
    const slope = Math.floor(index / 5);
    const start = index % 5;
    const rows = Array.from(
      { length: 5 },
      (_, column) => ((start + slope * column) % 5) + 1
    );
    const line = document.createElement("div");
    line.textContent = `${index + 1}: ${rows.join(" → ")}`;
    $("gpLines").append(line);
  }

  function updateControls() {
    const settings = state.settings;
    const enabled = settings?.isEnabled && !settings?.maintenanceMode;
    spinButton.disabled = state.busy || !enabled;
    spinButton.textContent = state.busy
      ? "PLEASE WAIT"
      : state.freeSpins > 0 ? "FREE SPIN" : "SPIN";

    const lockBet = state.busy || !enabled || state.freeSpins > 0;
    betInput.disabled = lockBet;
    $("gpMinus").disabled = lockBet;
    $("gpPlus").disabled = lockBet;
    grid.classList.toggle("spinning", state.busy);
  }

  async function api(path, options = {}) {
    const token =
      localStorage.getItem("access_token") ||
      localStorage.getItem("token") ||
      sessionStorage.getItem("access_token");

    if (!token) {
      location.href = "/login";
      throw new Error("Login প্রয়োজন।");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
      const response = await fetch(`/api/golden-pharaoh${path}`, {
        ...options,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      const result = await response.json();

      if (response.status === 401) location.href = "/login";

      if (!response.ok || result.success === false) {
        throw new Error(result.message || "Request failed.");
      }

      return result.data ?? result;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function loadState() {
    const data = await api("/state");
    const player = data.state || data;
    state.settings = player.settings;
    state.wallet = Number(player.walletBalance);
    state.freeSpins = Number(player.freeSpinsBalance || 0);

    $("gpWallet").textContent = money(state.wallet);
    $("gpFreeSpins").textContent = state.freeSpins;

    const settings = state.settings;
    betInput.min = settings.minBet;
    betInput.max = settings.maxBet;

    if (state.freeSpins > 0 && Number(player.freeSpinBetAmount) > 0) {
      betInput.value = Number(player.freeSpinBetAmount).toFixed(2);
    } else {
      betInput.value = Math.min(
        settings.maxBet,
        Math.max(settings.minBet, Number(betInput.value) || settings.minBet)
      ).toFixed(2);
    }

    $("gpLimits").textContent =
      `Bet ${money(settings.minBet)}–${money(settings.maxBet)} · ` +
      `Max payout ${money(settings.maxPayoutPerSpin)}`;

    if (!settings.isEnabled) message.textContent = "গেম এখন বন্ধ আছে।";
    else if (settings.maintenanceMode) message.textContent = "Maintenance চলছে।";

    updateControls();
  }

  async function loadHistory() {
    const data = await api("/history?limit=15");
    const history = data.history || [];
    $("gpHistory").replaceChildren();

    if (!history.length) {
      $("gpHistory").textContent = "এখনো কোনো spin নেই।";
      return;
    }

    history.forEach((spin) => {
      const row = document.createElement("div");
      const bet = document.createElement("span");
      const win = document.createElement("strong");
      row.className = "gp-history-row";
      bet.textContent = spin.isFreeSpin ? "Free Spin" : `Bet ${money(spin.betAmount)}`;
      win.textContent = `Win ${money(spin.payoutAmount)}`;
      row.title = String(spin.spinCode || "");
      row.append(bet, win);
      $("gpHistory").append(row);
    });
  }

  function changeBet(direction) {
    if (!state.settings || state.busy || state.freeSpins > 0) return;
    const step = Number(state.settings.minBet);
    betInput.value = Math.min(
      state.settings.maxBet,
      Math.max(state.settings.minBet, Number(betInput.value) + direction * step)
    ).toFixed(2);
  }

  $("gpMinus").addEventListener("click", () => changeBet(-1));
  $("gpPlus").addEventListener("click", () => changeBet(1));

  spinButton.addEventListener("click", async () => {
    if (state.busy || !state.settings) return;

    const bet = Number(betInput.value);
    const settings = state.settings;

    if (!Number.isFinite(bet) || bet < settings.minBet || bet > settings.maxBet) {
      message.textContent = "অনুমোদিত সীমার মধ্যে bet দাও।";
      return;
    }

    if (state.freeSpins === 0 && bet > state.wallet) {
      message.textContent = "Wallet balance পর্যাপ্ত নয়।";
      return;
    }

    state.busy = true;
    updateControls();
    message.classList.remove("win");
    message.textContent = "Reels ঘুরছে...";
    cells.forEach(({ cell }) => cell.classList.remove("winning"));

    const started = performance.now();
    const timer = setInterval(() => {
      cells.forEach(({ symbol }) => {
        paint(symbol, symbols[Math.floor(Math.random() * symbols.length)][0]);
      });
    }, 90);

    try {
      const data = await api("/spin", {
        method: "POST",
        body: JSON.stringify({ betAmount: bet }),
      });

      const spin = data.spin || data;

      await new Promise((resolve) => {
        setTimeout(resolve, Math.max(0, 900 - (performance.now() - started)));
      });

      clearInterval(timer);

      if (
        !Array.isArray(spin.grid) ||
        spin.grid.length !== 5 ||
        spin.grid.some((row) => !Array.isArray(row) || row.length !== 5)
      ) {
        throw new Error("৫×৫ ফল পাওয়া যায়নি। পেজ reload করে history দেখো।");
      }

      spin.grid.flat().forEach((key, index) => paint(cells[index].symbol, key));

      (spin.winningLines || []).forEach((line) => {
        (line.rows || []).slice(0, line.matchingCount).forEach((row, column) => {
          cells[Number(row) * 5 + column]?.cell.classList.add("winning");
        });
      });

      state.wallet = Number(spin.walletBalance);
      state.freeSpins = Number(spin.freeSpinsBalance || 0);

      $("gpWallet").textContent = money(state.wallet);
      $("gpFreeSpins").textContent = state.freeSpins;
      $("gpLastWin").textContent = money(spin.payoutAmount);

      const won = Number(spin.payoutAmount) > 0;
      message.classList.toggle("win", won);
      message.textContent = won
        ? `WIN ${money(spin.payoutAmount)}`
        : "এই spin-এ win হয়নি।";

      if (Number(spin.freeSpinsWon) > 0) {
        message.textContent += ` · ${spin.freeSpinsWon} Free Spins!`;
      }

      if (state.freeSpins > 0) {
        betInput.value = Number(spin.betAmount).toFixed(2);
      }

      loadHistory().catch(() => {
        $("gpHistory").textContent = "History পাওয়া যায়নি।";
      });
    } catch (error) {
      clearInterval(timer);

      await loadState().catch(() => {});

      message.textContent = error.name === "AbortError" ||
        error instanceof TypeError
        ? "ফল নিশ্চিত করা যায়নি। Reload করে history দেখো; request আবার পাঠানো হয়নি।"
        : error.message;
    } finally {
      clearInterval(timer);
      state.busy = false;
      updateControls();
    }
  });

  async function initialize() {
    try {
      await loadState();

      if (state.settings.isEnabled && !state.settings.maintenanceMode) {
        message.textContent = "Ready · 5 × 5 · 25 Paylines";
      }

      await loadHistory();
    } catch (error) {
      message.textContent = error.message || "গেম load হয়নি।";
    } finally {
      state.busy = false;
      updateControls();
    }
  }

  initialize();
})();