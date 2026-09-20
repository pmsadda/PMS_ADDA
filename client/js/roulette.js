"use strict";

const elements = {
  walletBalance: document.getElementById("walletBalance"),
  wheel: document.getElementById("wheel"),
  wheelCanvas: document.getElementById("wheelCanvas"),
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

const wheelOrder = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34,
  6, 27, 13, 36, 11, 30, 8, 23, 10, 5,
  24, 16, 33, 1, 20, 14, 31, 9, 22, 18,
  29, 7, 28, 12, 35, 3, 26
];

const redNumbers = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18,
  19, 21, 23, 25, 27, 30, 32, 34, 36
]);

const wheelContext = elements.wheelCanvas.getContext("2d");
const pocketAngle = (Math.PI * 2) / wheelOrder.length;
let wheelRotation = 0;

function drawWheel(rotation = 0, ballAngle = -Math.PI / 2) {
  const canvas = elements.wheelCanvas;
  const size = Math.max(1, Math.round(canvas.getBoundingClientRect().width));
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const pixels = Math.round(size * pixelRatio);

  if (canvas.width !== pixels || canvas.height !== pixels) {
    canvas.width = pixels;
    canvas.height = pixels;
  }

  wheelContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  wheelContext.clearRect(0, 0, size, size);

  const center = size / 2;
  const outerRadius = size * 0.415;
  const innerRadius = size * 0.315;

  wheelContext.save();
  wheelContext.translate(center, center);

  wheelOrder.forEach((number, index) => {
    const middle = -Math.PI / 2 + index * pocketAngle + rotation;
    const start = middle - pocketAngle / 2;
    const end = middle + pocketAngle / 2;

    wheelContext.beginPath();
    wheelContext.arc(0, 0, outerRadius, start, end);
    wheelContext.arc(0, 0, innerRadius, end, start, true);
    wheelContext.closePath();

    wheelContext.fillStyle = number === 0
      ? "#086e43"
      : redNumbers.has(number)
        ? "#aa182a"
        : "#101216";

    wheelContext.fill();
    wheelContext.strokeStyle = "#dfbb70";
    wheelContext.lineWidth = Math.max(0.8, size * 0.003);
    wheelContext.stroke();

    wheelContext.save();
    wheelContext.rotate(middle);
    wheelContext.translate((outerRadius + innerRadius) / 2, 0);
wheelContext.rotate(-middle);
    wheelContext.fillStyle = "#fff4d4";
    wheelContext.font =
      `700 ${Math.max(7, Math.round(size * 0.029))}px Arial`;
    wheelContext.textAlign = "center";
    wheelContext.textBaseline = "middle";
    wheelContext.fillText(String(number), 0, 0);
    wheelContext.restore();
  });

  wheelContext.beginPath();
  wheelContext.arc(0, 0, outerRadius, 0, Math.PI * 2);
  wheelContext.strokeStyle = "#f2d28e";
  wheelContext.lineWidth = Math.max(2, size * 0.013);
  wheelContext.stroke();

  wheelContext.beginPath();
  wheelContext.arc(0, 0, innerRadius, 0, Math.PI * 2);
  wheelContext.strokeStyle = "#d8ab61";
  wheelContext.lineWidth = Math.max(2, size * 0.012);
  wheelContext.stroke();

  const ballRadius = size * 0.365;
  const ballSize = Math.max(4, size * 0.018);
  const ballX = Math.cos(ballAngle) * ballRadius;
  const ballY = Math.sin(ballAngle) * ballRadius;

  wheelContext.shadowColor = "rgba(0, 0, 0, .8)";
  wheelContext.shadowBlur = ballSize * 1.5;
  wheelContext.beginPath();
  wheelContext.arc(ballX, ballY, ballSize, 0, Math.PI * 2);
  wheelContext.fillStyle = "#fffdf4";
  wheelContext.fill();
  wheelContext.shadowBlur = 0;
  wheelContext.strokeStyle = "#bcb7a5";
  wheelContext.lineWidth = 1;
  wheelContext.stroke();

  wheelContext.restore();
}

function animateWheelTo(resultNumber) {
  const winningIndex = wheelOrder.indexOf(Number(resultNumber));

  if (winningIndex < 0) {
    throw new Error("Invalid roulette result.");
  }

  const fullTurn = Math.PI * 2;
  const targetRotation = (
    -winningIndex * pocketAngle % fullTurn + fullTurn
  ) % fullTurn;

  const currentRotation = (
    wheelRotation % fullTurn + fullTurn
  ) % fullTurn;

  const distance = (
    targetRotation - currentRotation + fullTurn
  ) % fullTurn;

  const startRotation = wheelRotation;
  const finalRotation =
    startRotation + fullTurn * 6 + distance;

  const duration = 3800;

  return new Promise(resolve => {
    const startedAt = performance.now();

    function frame(now) {
      const progress = Math.min((now - startedAt) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4);

      const rotation =
        startRotation +
        (finalRotation - startRotation) * eased;

      const ballAngle =
        -Math.PI / 2 - fullTurn * 7 * (1 - eased);

      drawWheel(rotation, ballAngle);

      if (progress < 1) {
        requestAnimationFrame(frame);
      } else {
        wheelRotation = targetRotation;
        drawWheel(wheelRotation);
        resolve();
      }
    }

    requestAnimationFrame(frame);
  });
}

async function spin() {
  if (state.busy) return;

  const requestId = crypto.randomUUID();

  setBusy(true);
  setMessage("Result আসছে...");

  try {
    const data = await apiRequest("/spin", "POST", {
      requestId,
      betAmount: elements.betAmount.value,
      selectionType: state.selectionType,
      selectedNumber: elements.selectedNumber.value,
    });

    const resultNumber = Number(data.spin?.resultNumber);

    if (!Number.isInteger(resultNumber) ||
        resultNumber < 0 ||
        resultNumber > 36) {
      throw new Error("Server থেকে সঠিক roulette result পাওয়া যায়নি।");
    }

    elements.walletBalance.textContent =
      money(data.walletBalance);

    setMessage("গুটি ঘুরছে...");
    await animateWheelTo(resultNumber);

    showSpin(data.spin);

    state.recentSpins.unshift(data.spin);
    state.recentSpins = state.recentSpins.slice(0, 10);
    renderHistory();
  } catch (error) {
    setMessage(error.message, true);
  } finally {
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
  const lastSpin = state.recentSpins[0];
  const index = wheelOrder.indexOf(Number(lastSpin.resultNumber));

  if (index >= 0) {
    wheelRotation = -index * pocketAngle;
    drawWheel(wheelRotation);
  }

  showSpin(lastSpin);
}
  } catch (error) {
    setMessage(error.message, true);
  } finally {
    setBusy(false);
  }
}

drawWheel();

window.addEventListener("resize", () => {
  drawWheel(wheelRotation);
});

loadGame();