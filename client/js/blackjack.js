"use strict";

const elements = {
  walletBalance: document.getElementById("walletBalance"),
  dealerCards: document.getElementById("dealerCards"),
  dealerScore: document.getElementById("dealerScore"),
  playerCards: document.getElementById("playerCards"),
  playerScore: document.getElementById("playerScore"),
  betAmount: document.getElementById("betAmount"),
  dealButton: document.getElementById("dealButton"),
  hitButton: document.getElementById("hitButton"),
  standButton: document.getElementById("standButton"),
  gameMessage: document.getElementById("gameMessage"),
  lastPayout: document.getElementById("lastPayout"),
};

const state = {
  busy: false,
  currentHandId: null,
  handPlaying: false,
};

function accessToken() {
  return (
    localStorage.getItem("access_token") ||
    sessionStorage.getItem("access_token") ||
    ""
  );
}

function formatMoney(value) {
  const amount = Number(value);

  return Number.isFinite(amount) ? amount.toFixed(2) : "0.00";
}

function showMessage(message, isError = false) {
  elements.gameMessage.textContent = message;
  elements.gameMessage.classList.toggle("error", isError);
}

function updateButtons() {
  elements.dealButton.disabled = state.busy || state.handPlaying;
  elements.hitButton.disabled = state.busy || !state.handPlaying;
  elements.standButton.disabled = state.busy || !state.handPlaying;
  elements.betAmount.disabled = state.busy || state.handPlaying;

  document.querySelectorAll("[data-bet]").forEach(button => {
    button.disabled = state.busy || state.handPlaying;
  });
}

async function apiRequest(path, method = "GET", body) {
  const token = accessToken();

  if (!token) {
    window.location.replace("/login");
    throw new Error("Login required.");
  }

  const authorization = token.toLowerCase().startsWith("bearer ")
    ? token
    : `Bearer ${token}`;

  const response = await fetch(`/api/blackjack${path}`, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: authorization,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok || result.success === false) {
    throw new Error(
      result.message || `Request failed (${response.status}).`
    );
  }

  return result.data;
}

function renderCards(container, cards) {
  container.replaceChildren();

  for (const card of cards) {
    const element = document.createElement("span");

    element.className = "playing-card";

    if (card.rank === "?") {
      element.classList.add("hidden-card");
      element.textContent = "✦";
    } else {
      if (card.suit === "♥" || card.suit === "♦") {
        element.classList.add("red");
      }

      element.textContent = `${card.rank}${card.suit}`;
    }

    container.appendChild(element);
  }
}

function renderHand(hand) {
  if (!hand) {
    state.currentHandId = null;
    state.handPlaying = false;
    updateButtons();
    return;
  }

  state.currentHandId = Number(hand.id);
  state.handPlaying = hand.status === "playing";

  renderCards(elements.playerCards, hand.playerCards);
  renderCards(elements.dealerCards, hand.dealerCards);

  elements.playerScore.textContent = `Score ${hand.playerScore}`;

  elements.dealerScore.textContent =
    hand.dealerScore === null
      ? "Hidden"
      : `Score ${hand.dealerScore}`;

  elements.lastPayout.textContent = formatMoney(
    hand.payoutAmount
  );

  if (state.handPlaying) {
    showMessage("Hit অথবা Stand বেছে নিন।");
  } else {
    const messages = {
      blackjack: "Blackjack! আপনি জিতেছেন।",
      win: "আপনি জিতেছেন।",
      push: "Tie হয়েছে। Bet ফেরত পেয়েছেন।",
      lose: "Dealer জিতেছে।",
      bust: "২১ ছাড়িয়ে গেছে। Hand শেষ।",
      dealer_blackjack: "Dealer Blackjack পেয়েছে।",
    };

    showMessage(
      messages[hand.outcome] || `Result: ${hand.outcome}`
    );
  }

  updateButtons();
}

async function executeAction(action) {
  if (state.busy) return;

  state.busy = true;
  updateButtons();
  showMessage("Processing...");

  try {
    let result;

    if (action === "start") {
      result = await apiRequest("/start", "POST", {
        requestId: crypto.randomUUID(),
        betAmount: elements.betAmount.value,
      });
    } else {
      if (!state.currentHandId) {
        throw new Error("No active hand.");
      }

      result = await apiRequest(`/${action}`, "POST", {
        handId: state.currentHandId,
        actionId: crypto.randomUUID(),
      });
    }

    elements.walletBalance.textContent = formatMoney(
      result.walletBalance
    );

    renderHand(result.hand);
  } catch (error) {
    showMessage(error.message, true);
  } finally {
    state.busy = false;
    updateButtons();
  }
}

elements.dealButton.addEventListener("click", () => {
  executeAction("start");
});

elements.hitButton.addEventListener("click", () => {
  executeAction("hit");
});

elements.standButton.addEventListener("click", () => {
  executeAction("stand");
});

document.querySelectorAll("[data-bet]").forEach(button => {
  button.addEventListener("click", () => {
    elements.betAmount.value = button.dataset.bet;
  });
});

async function loadGame() {
  state.busy = true;
  updateButtons();

  try {
    const data = await apiRequest("/state");

    elements.walletBalance.textContent = formatMoney(
      data.walletBalance
    );

    renderHand(data.hand);
  } catch (error) {
    showMessage(error.message, true);
  } finally {
    state.busy = false;
    updateButtons();
  }
}

loadGame();