"use strict";

(() => {
  const $ = id => document.getElementById(id);
  const sides = [...document.querySelectorAll("[data-side]")];
  const money = value => `৳${Number(value || 0).toFixed(2)}`;
  const suits = { spades: "♠", hearts: "♥", clubs: "♣", diamonds: "♦" };

  let selected = "dragon";
  let busy = true;
  let config = null;
  let storageKey = "";
  let pending = null;

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
      const response = await fetch(`/api/dragon-tiger${path}`, {
        ...options,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        }
      });

      const result = await response.json();

      if (response.status === 401) location.href = "/login";

      if (!response.ok || !result.success) {
        const error = new Error(result.message || "Request failed.");
        error.status = response.status;
        throw error;
      }

      return result.data;
    } finally {
      clearTimeout(timeout);
    }
  }

  function controls() {
    const available = config?.isEnabled && !config?.maintenanceMode;
    const locked = busy || Boolean(pending) || !available;

    sides.forEach(button => {
      button.disabled = locked;
      button.classList.toggle("selected", button.dataset.side === selected);
    });

    $("dtBet").disabled = locked;
    $("dtPlay").disabled = busy || (!pending && !available);
    $("dtPlay").textContent = busy
      ? "PLEASE WAIT"
      : pending ? "CHECK RESULT" : "DEAL CARDS";
  }

  async function loadState() {
    const player = await api("/state");
    config = player.settings;
    storageKey = `dt_pending_${player.userId}`;

    $("dtWallet").textContent = money(player.walletBalance);
    $("dtBet").min = config.minBet;
    $("dtBet").max = config.maxBet;

    $("dtLimits").textContent =
      `Bet ${money(config.minBet)}–${money(config.maxBet)} · ` +
      `Max return ${money(config.maxPayoutPerRound)}`;

    if (!config.isEnabled || config.maintenanceMode) {
      $("dtMessage").textContent = "গেম এখন বন্ধ বা maintenance-এ আছে।";
    }

    controls();
  }

  async function loadHistory() {
    const history = await api("/history");
    $("dtHistory").replaceChildren();

    if (!history.length) {
      $("dtHistory").textContent = "এখনো কোনো hand নেই।";
      return;
    }

    history.forEach(round => {
      const row = document.createElement("div");
      row.className = "dt-history-row";
      row.title = round.roundCode;

      [
        `Bet: ${round.side.toUpperCase()} ${money(round.betAmount)}`,
        `Result: ${round.outcome.toUpperCase()}`,
        `Return: ${money(round.payoutAmount)}`
      ].forEach(text => {
        const span = document.createElement("span");
        span.textContent = text;
        row.append(span);
      });

      $("dtHistory").append(row);
    });
  }

  function showCard(id, card) {
    const element = $(id);
    element.className = "dt-card";
    element.classList.toggle("red", ["hearts", "diamonds"].includes(card.suit));
    element.replaceChildren();

    [
      ["rank", card.rank],
      ["suit", suits[card.suit]],
      ["corner", card.rank]
    ].forEach(([className, text]) => {
      const span = document.createElement("span");
      span.className = className;
      span.textContent = text;
      element.append(span);
    });
  }

  function clearPending() {
    pending = null;
    sessionStorage.removeItem(storageKey);
  }

  sides.forEach(button => {
    button.addEventListener("click", () => {
      selected = button.dataset.side;
      controls();
    });
  });

  $("dtPlay").addEventListener("click", async () => {
    if (busy || !config) return;

    if (!pending) {
      const amount = Number($("dtBet").value);
      const minor = Math.round(amount * 100);

      if (
        !Number.isFinite(amount) ||
        amount < config.minBet ||
        amount > config.maxBet ||
        Math.abs(amount * 100 - minor) > 0.00001 ||
        minor % 2 !== 0
      ) {
        $("dtMessage").textContent = "সীমার মধ্যে ০.০২ টাকার ধাপে bet দাও।";
        return;
      }

      pending = {
        requestId: crypto.randomUUID(),
        side: selected,
        betAmount: amount.toFixed(2)
      };

      sessionStorage.setItem(storageKey, JSON.stringify(pending));
    }

    busy = true;
    controls();
    $("dtMessage").textContent = "Dealing cards...";

    try {
      const round = await api("/play", {
        method: "POST",
        body: JSON.stringify(pending)
      });

      clearPending();

      showCard("dtDragon", round.dragon);
      showCard("dtTiger", round.tiger);

      $("dtDragon").classList.toggle(
        "winner", round.outcome === "dragon" || round.outcome === "tie"
      );

      $("dtTiger").classList.toggle(
        "winner", round.outcome === "tiger" || round.outcome === "tie"
      );

      $("dtWallet").textContent = money(round.walletBalance);
      $("dtMessage").textContent =
        `${round.outcome.toUpperCase()} · Return ${money(round.payoutAmount)}` +
        (round.replayed ? " · Previous result" : "");

      await loadState().catch(() => {});

      loadHistory().catch(() => {
        $("dtHistory").textContent = "History পাওয়া যায়নি।";
      });
    } catch (error) {
      if (error.status && error.status < 500) {
        clearPending();
        $("dtMessage").textContent = error.message;
      } else {
        $("dtMessage").textContent =
          "ফল নিশ্চিত করা যায়নি। CHECK RESULT চাপলে একই request যাচাই হবে।";
      }

      await loadState().catch(() => {});
    } finally {
      busy = false;
      controls();
    }
  });

  async function initialize() {
    try {
      await loadState();

      try {
        pending = JSON.parse(sessionStorage.getItem(storageKey) || "null");
      } catch {
        sessionStorage.removeItem(storageKey);
      }

      if (pending) {
        selected = pending.side;
        $("dtBet").value = pending.betAmount;
        $("dtMessage").textContent = "আগের request-এর জন্য CHECK RESULT চাপো।";
      } else if (config.isEnabled && !config.maintenanceMode) {
        $("dtMessage").textContent = "Dragon, Tiger অথবা Tie বেছে bet দাও।";
      }

      await loadHistory();
    } catch (error) {
      $("dtMessage").textContent = error.message || "Game load হয়নি।";
    } finally {
      busy = false;
      controls();
    }
  }

  initialize();
})();