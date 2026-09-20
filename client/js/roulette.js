"use strict";

const elements = {
  walletBalance: document.getElementById("walletBalance"),
  wheel: document.getElementById("wheel"),
  resultBall: document.getElementById("resultBall"),
  resultText: document.getElementById("resultText"),
  betAmount: document.getElementById("betAmount"),
  selectedNumber: document.getElementById("selectedNumber"),
  numberField: document.getElementById("numberField"),
  spinButton: document.getElementById("spinButton"),
  message: document.getElementById("message"),
  lastPayout: document.getElementById("lastPayout"),
  recentSpins: document.getElementById("recentSpins"),
};

const state = {
  selectionType: "red",
  busy: false,
  recentSpins: [],
};

function getToken() {
  return (
    localStorage.getItem("access_token") ||
    sessionStorage.getItem("access_token") ||
    ""
  );
}

function money(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount.toFixed(2) : "0.00";
}

function setMessage(text, isError = false) {
  elements.message.textContent = text;
  elements.message.classList.toggle("error", isError);
}

function setBusy(value) {
  state.busy = value;
  elements.spinButton.disabled = value;
  elements.betAmount.disabled = value;
  elements.selectedNumber.disabled = value;

  document.querySelectorAll("[data-selection], [data-bet]")
    .forEach(button => {
      button.disabled = value;
    });
}

async function apiRequest(path, method = "GET", body) {
  const token = getToken();

  if (!token) {
    window.location.replace("/login");
    throw new Error("Login required.");
  }

  const authorization = token.toLowerCase().startsWith("bearer ")
    ? token
    : `Bearer ${token}`;

  const response = await fetch(`/api/roulette${path}`, {
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

function selectionLabel(spin) {
  if (spin.selectionType === "number") {
    return `Number ${spin.selectedNumber}`;
  }

  return spin.selectionType.toUpperCase();
}

function renderHistory() {
  elements.recentSpins.replaceChildren();

  if (!state.recentSpins.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "এখনো কোনো spin নেই।";

    elements.recentSpins.append(empty);
    return;
  }

  for (const spin of state.recentSpins.slice(0, 10)) {
    const row = document.createElement("div");
    row.className = "history-row";

    const details = document.createElement("span");
    details.textContent =
      `${selectionLabel(spin)} · Result ${spin.resultNumber} ` +
      `(${spin.resultColor})`;

    const payout = document.createElement("strong");
    payout.textContent = `৳${money(spin.payoutAmount)}`;

    row.append(details, payout);
    elements.recentSpins.append(row);
  }
}

function showSpin(spin) {
  elements.resultBall.className =
    `result-ball ${spin.resultColor}`;

  elements.resultBall.textContent =
    String(spin.resultNumber);

  elements.lastPayout.textContent =
    money(spin.payoutAmount);

  elements.resultText.textContent =
    `Result: ${spin.resultNumber} · ` +
    `${spin.resultColor.toUpperCase()}`;

  setMessage(
    spin.resultStatus === "won"
      ? `আপনি জিতেছেন! Payout ৳${money(spin.payoutAmount)}`
      : "এই spin-এ জয় হয়নি।"
  );
}

function delay(milliseconds) {
  return new Promise(resolve => {
    window.setTimeout(resolve, milliseconds);
  });
}

async function spin() {
  if (state.busy) return;

  const requestId = crypto.randomUUID();

  setBusy(true);
  setMessage("Wheel ঘুরছে...");
  elements.wheel.classList.remove("spinning");

  void elements.wheel.offsetWidth;

  elements.wheel.classList.add("spinning");

  try {
    const [data] = await Promise.all([
      apiRequest("/spin", "POST", {
        requestId,
        betAmount: elements.betAmount.value,
        selectionType: state.selectionType,
        selectedNumber: elements.selectedNumber.value,
      }),
      delay(950),
    ]);

    elements.walletBalance.textContent =
      money(data.walletBalance);

    showSpin(data.spin);

    state.recentSpins.unshift(data.spin);
    state.recentSpins = state.recentSpins.slice(0, 10);

    renderHistory();
  } catch (error) {
    setMessage(error.message, true);
  } finally {
    elements.wheel.classList.remove("spinning");
    setBusy(false);
  }
}

document.querySelectorAll("[data-selection]")
  .forEach(button => {
    button.addEventListener("click", () => {
      if (state.busy) return;

      state.selectionType = button.dataset.selection;

      document.querySelectorAll("[data-selection]")
        .forEach(otherButton => {
          otherButton.classList.toggle(
            "selected",
            otherButton === button
          );
        });

      elements.numberField.classList.toggle(
        "hidden",
        state.selectionType !== "number"
      );
    });
  });

document.querySelectorAll("[data-bet]")
  .forEach(button => {
    button.addEventListener("click", () => {
      elements.betAmount.value = button.dataset.bet;
    });
  });

elements.spinButton.addEventListener("click", spin);

async function loadGame() {
  setBusy(true);

  try {
    const data = await apiRequest("/state");

    elements.walletBalance.textContent =
      money(data.walletBalance);

    state.recentSpins = Array.isArray(data.recentSpins)
      ? data.recentSpins
      : [];

    renderHistory();

    if (state.recentSpins.length) {
      showSpin(state.recentSpins[0]);
    }
  } catch (error) {
    setMessage(error.message, true);
  } finally {
    setBusy(false);
  }
}

loadGame();