"use strict";

(() => {
  const SEGMENT_COUNT = 12;
  const SEGMENT_ANGLE = 360 / SEGMENT_COUNT;

  const state = {
    socket: null,
    animals: [],
    settings: null,
    activeRound: null,
   selectedAnimal: null,
selectedAmount: 5,

userBet: null,
userBets: [],

userBetSummary: {
  totalBets: 0,
  totalBetAmount: 0,
  animalBetAmounts: {}
},

placingBet: false,
walletBalance: 0,
    wheelRotation: 0,
    countdownTimer: null,
    spinAnimation: null,
    serverOffset: 0,
    isSpinning: false,
    soundEnabled: true,
  };

  const $ = (id) => document.getElementById(id);

  const DOM = {
    connectionStatus: $("connectionBar"),
    connectionText: $("connectionText"),
    walletBalance: $("walletBalance"),
    roundId: $("roundCode"),
    roundStatus: $("roundStatusText"),
    timerValue: $("timerValue"),

    animalWheel: $("animalWheel"),
    wheelSegments: $("wheelSegments"),
    animalOptions: $("animalOptions"),

    selectedAnimalName: $("selectedAnimalText"),
    selectedMultiplier: null,
    betAmount: $("betAmountInput"),
    possiblePayout: $("possiblePayout"),
    decreaseBet: $("decreaseBetBtn"),
    increaseBet: $("increaseBetBtn"),
    placeBetBtn: $("placeBetBtn"),

    myBetCard: $("myBetCard"),
    myBetAnimal: $("myBetAnimal"),
    myBetAmount: $("myBetAmount"),
    myBetPayout: null,

    recentResults: $("recentResults"),
    resultOverlay: $("resultOverlay"),
    resultAnimalImage: $("winnerAnimalImage"),
    resultAnimalName: $("winnerAnimalName"),
    resultMessage: $("userResultMessage"),
    closeResultBtn: $("resultCloseBtn"),

    loadingOverlay: $("loadingOverlay"),
    toast: $("gameToast"),
    soundToggle: $("soundBtn"),
  };

  function getServerUrl() {
    return (
      window.APP_CONFIG?.SERVER_URL ||
      window.APP_CONFIG?.API_URL ||
      window.location.origin
    ).replace(/\/$/, "");
  }

  function getToken() {
    return (
      localStorage.getItem("access_token") ||
      localStorage.getItem("token") ||
      sessionStorage.getItem("access_token") ||
      ""
    );
  }

  function money(value) {
    return Number(value || 0).toLocaleString("en-BD", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function animalCode(animal) {
    return animal?.animalCode || animal?.animal_code || "";
  }

  function animalName(animal) {
    return animal?.animalName || animal?.animal_name || animalCode(animal);
  }

  function animalImage(animal) {
    return (
      animal?.imageUrl ||
      animal?.image_url ||
      `../assets/bangla-wheel/${animalCode(animal)}.png`
    );
  }

  function animalMultiplier(animal) {
    return Number(animal?.multiplier || 0);
  }

  function animalSegmentIndex(animal) {
    return Number(animal?.segmentIndex ?? animal?.segment_index ?? 0);
  }

  function isBettable(animal) {
    const value = animal?.isBettable ?? animal?.is_bettable;
    return value === true || Number(value) === 1;
  }

  function showToast(message, type = "info") {
    if (!DOM.toast) return;

    DOM.toast.textContent = message;
    DOM.toast.className = `game-toast is-visible is-${type}`;

    clearTimeout(showToast.timer);

    showToast.timer = setTimeout(() => {
      DOM.toast.className = "game-toast";
    }, 3000);
  }

   function setConnected(connected) {
    DOM.connectionStatus?.classList.toggle(
      "is-connected",
      connected
    );

    DOM.connectionStatus?.classList.toggle(
      "is-disconnected",
      !connected
    );

    if (DOM.connectionText) {
      DOM.connectionText.textContent = connected
        ? "Live game connected"
        : "Connecting to live game...";
    }
  }

  function updateWallet(balance) {
    if (balance === undefined || balance === null) return;

    state.walletBalance = Number(balance);

    if (DOM.walletBalance) {
      DOM.walletBalance.textContent = `৳ ${money(state.walletBalance)}`;
    }
  }

  function calculateNetPayout() {
    if (!state.selectedAnimal || !isBettable(state.selectedAnimal)) return 0;

    const gross =
      Number(state.selectedAmount) * animalMultiplier(state.selectedAnimal);

    const feePercent = Number(
      state.settings?.serviceChargePercent ??
        state.settings?.service_charge_percent ??
        5,
    );

    return gross - gross * (feePercent / 100);
  }

  function updateBetPreview() {
    if (DOM.betAmount) {
      DOM.betAmount.value = state.selectedAmount;
    }

    if (DOM.selectedAnimalName) {
      DOM.selectedAnimalName.textContent = state.selectedAnimal
        ? animalName(state.selectedAnimal)
        : "Select an animal";
    }

    if (DOM.selectedMultiplier) {
      DOM.selectedMultiplier.textContent = state.selectedAnimal
        ? `${animalMultiplier(state.selectedAnimal)}x`
        : "—";
    }

    if (DOM.possiblePayout) {
      DOM.possiblePayout.textContent = `৳ ${money(calculateNetPayout())}`;
    }

        const placeBetText = $("placeBetText");

    if (placeBetText) {
      placeBetText.textContent = state.selectedAnimal
        ? `Bet ৳${money(state.selectedAmount)} on ${animalName(
            state.selectedAnimal
          )}`
        : "Select an animal";
    }
  }

  function buildWheelBackground() {
  if (!DOM.animalWheel) return;

  DOM.animalWheel.style.backgroundImage =
    'url("../assets/bangla-wheel/wheel-12-clean.png")';

  DOM.animalWheel.style.backgroundPosition =
    "center";

  DOM.animalWheel.style.backgroundRepeat =
    "no-repeat";

  DOM.animalWheel.style.backgroundSize =
    "contain";
}

function renderWheel() {
  if (!DOM.wheelSegments) return;

  const animals = state.animals
    .filter(
      (animal) =>
        String(
          animal.animalStatus ??
          animal.animal_status ??
          "active"
        ).toLowerCase() !== "disabled"
    )
    .slice()
    .sort(
      (a, b) =>
        animalSegmentIndex(a) -
        animalSegmentIndex(b)
    );

  buildWheelBackground();

  DOM.wheelSegments.innerHTML = animals
    .map((animal) => {
      const index =
        animalSegmentIndex(animal);

      const angle =
        index * SEGMENT_ANGLE;

      const bettable =
        isBettable(animal);

      return `
        <div
          class="wheel-segment${
            bettable ? "" : " is-nil"
          }"
          data-code="${escapeHtml(
            animalCode(animal)
          )}"
          style="--segment-angle:${angle}deg"
        >
          <div class="wheel-segment-content">
            <span class="dynamic-multiplier">
              ${
                bettable
                  ? `${animalMultiplier(animal)}x`
                  : "NIL"
              }
            </span>
          </div>
        </div>
      `;
    })
    .join("");
}

  function renderAnimalOptions() {
    if (!DOM.animalOptions) return;

    DOM.animalOptions.innerHTML = state.animals
      .map((animal) => {
        const code = animalCode(animal);
        const bettable = isBettable(animal);
        const selected = animalCode(state.selectedAnimal) === code;

        return `
        <button
          type="button"
                    class="animal-option${selected ? " is-selected" : ""}${bettable ? "" : " is-nil"}"
          data-animal-code="${escapeHtml(code)}"
          ${bettable ? "" : "disabled"}
        >
          <img
            src="${escapeHtml(animalImage(animal))}"
            alt="${escapeHtml(animalName(animal))}"
            draggable="false"
          >
          <span class="animal-option-name">
            ${escapeHtml(animalName(animal))}
          </span>
          <strong class="animal-option-multiplier">
            ${bettable ? `${animalMultiplier(animal)}x` : "NIL"}
          </strong>
        </button>
      `;
      })
      .join("");

    DOM.animalOptions
      .querySelectorAll(".animal-option:not(:disabled)")
      .forEach((button) => {
        button.addEventListener("click", () => {
          if (state.isSpinning) return;

          const code = button.dataset.animalCode;
          state.selectedAnimal =
            state.animals.find((animal) => animalCode(animal) === code) || null;

          renderAnimalOptions();
          updateBetPreview();

          setBettingEnabled(getRoundStatus(state.activeRound) === "betting");
        });
      });
  }

 function setBettingEnabled(
  enabled
) {
  const maximumBet =
    Number(
      state.settings
        ?.maximumBet ||
      state.settings
        ?.maximum_bet ||
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

  const canBet =
    enabled &&
    !state.isSpinning &&
    !state.placingBet &&
    remainingLimit > 0;

  if (DOM.placeBetBtn) {
    DOM.placeBetBtn.disabled =
      !canBet ||
      !state.selectedAnimal ||
      Number(
        state.selectedAmount
      ) >
        remainingLimit;
  }

  if (DOM.decreaseBet) {
    DOM.decreaseBet.disabled =
      !canBet;
  }

  if (DOM.increaseBet) {
    DOM.increaseBet.disabled =
      !canBet;
  }

  if (DOM.betAmount) {
    DOM.betAmount.disabled =
      !canBet;
  }

  DOM.animalOptions
    ?.querySelectorAll(
      ".animal-option:not(.is-nil)"
    )
    .forEach((button) => {
      button.disabled =
        !canBet;
    });
}

  function getRoundStatus(round) {
    return String(round?.status || round?.roundStatus || "").toLowerCase();
  }

  function parseDate(value) {
    if (!value) return 0;
    return new Date(value).getTime();
  }

  function serverNow() {
    return Date.now() + state.serverOffset;
  }

  function getRoundEndTime(round) {
    const status = getRoundStatus(round);

    if (status === "spinning") {
      return parseDate(round?.spinningEndsAt || round?.spinning_ends_at);
    }

    return parseDate(
      round?.bettingEndsAt || round?.betting_ends_at || round?.bettingClosesAt,
    );
  }

  function startCountdown() {
    clearInterval(state.countdownTimer);

    const tick = () => {
      const round = state.activeRound;
      const status = getRoundStatus(round);
      const remaining = Math.max(0, getRoundEndTime(round) - serverNow());
      const seconds = Math.ceil(remaining / 1000);

      if (DOM.timerValue) DOM.timerValue.textContent = seconds;

      if (DOM.roundStatus) {
        DOM.roundStatus.textContent =
          status === "spinning"
            ? "SPINNING"
            : status === "betting"
              ? "BETTING"
              : status
                ? status.toUpperCase()
                : "WAITING";
      }

      setBettingEnabled(status === "betting");
    };

    tick();
    state.countdownTimer = setInterval(tick, 250);
  }

  function applyRound(
  round
) {
  if (!round) return;

  const previousRoundId =
    Number(
      state.activeRound?.id ||
      0
    );

  const nextRoundId =
    Number(
      round.id ||
      0
    );

  if (
    previousRoundId &&
    nextRoundId &&
    previousRoundId !==
      nextRoundId
  ) {
    state.userBet = null;
    state.userBets = [];

    state.userBetSummary = {
      totalBets: 0,
      totalBetAmount: 0,
      animalBetAmounts: {}
    };

    state.selectedAnimal =
      null;

    DOM.myBetCard
      ?.classList.remove(
        "show"
      );
  }

  state.activeRound =
    round;

  if (DOM.roundId) {
    DOM.roundId.textContent =
      round.roundCode ||
      round.round_code ||
      `#${round.id || "—"}`;
  }

  startCountdown();
}

  function findWinningAnimal(data) {
    if (data?.winningAnimal) return data.winningAnimal;

    const round = data?.round || data;
    const code = round?.winningAnimalCode || round?.winning_animal_code;
    const index = round?.winningSegmentIndex ?? round?.winning_segment_index;

    return state.animals.find((animal) => {
      if (code) return animalCode(animal) === code;
      return animalSegmentIndex(animal) === Number(index);
    });
  }

  function getWinningIndex(data) {
    const round = data?.round || data;

    const suppliedIndex =
      round?.winningSegmentIndex ??
      round?.winning_segment_index ??
      data?.winningAnimal?.segmentIndex ??
      data?.winningAnimal?.segment_index;

    if (suppliedIndex !== undefined && suppliedIndex !== null) {
      return Number(suppliedIndex);
    }

    const animal = findWinningAnimal(data);
    return animal ? animalSegmentIndex(animal) : null;
  }

  function spinWheel(data) {
    const winningIndex = getWinningIndex(data);
    if (!Number.isInteger(winningIndex)) return;

    const round = data?.round || state.activeRound || {};
    const endingTime = parseDate(
      round.spinningEndsAt ||
        round.spinning_ends_at ||
        state.activeRound?.spinningEndsAt,
    );

    let duration = endingTime ? Math.max(800, endingTime - serverNow()) : 20000;

    duration = Math.min(duration, 20000);

    state.isSpinning = true;
    setBettingEnabled(false);

    DOM.resultOverlay?.classList.add(
  "is-hidden"
);

    const currentNormalized = ((state.wheelRotation % 360) + 360) % 360;

    const desiredNormalized =
      (((-winningIndex * SEGMENT_ANGLE) % 360) + 360) % 360;

    const alignmentDelta = (desiredNormalized - currentNormalized + 360) % 360;

        const mobileDevice = window.matchMedia("(max-width: 520px)").matches;

    const normalTurns = mobileDevice ? 6 : 9;

    const fullTurns = Math.max(
      2,
      Math.ceil(normalTurns * (duration / 20000))
    );
    const targetRotation =
      state.wheelRotation + fullTurns * 360 + alignmentDelta;

    state.spinAnimation?.cancel();

    state.spinAnimation = DOM.animalWheel.animate(
      [
        {
          transform: `rotate(${state.wheelRotation}deg)`,
          offset: 0,
        },
        {
          transform: `rotate(${targetRotation - SEGMENT_ANGLE * 5}deg)`,
          offset: 0.72,
        },
        {
          transform: `rotate(${targetRotation - SEGMENT_ANGLE}deg)`,
          offset: 0.94,
        },
        {
          transform: `rotate(${targetRotation}deg)`,
          offset: 1,
        },
      ],
      {
        duration,
        easing: "cubic-bezier(0.08, 0.72, 0.12, 1)",
        fill: "forwards",
      },
    );

    state.spinAnimation.onfinish = () => {
      state.wheelRotation = targetRotation;
      DOM.animalWheel.style.transform = `rotate(${state.wheelRotation}deg)`;
      state.spinAnimation = null;
    };
  }

  function showResult(data) {
    state.isSpinning = false;

    const animal = findWinningAnimal(data);
    if (!animal) return;

    document.querySelectorAll(".wheel-segment").forEach((segment) => {
      segment.classList.toggle(
                  "is-winner",
        segment.dataset.code === animalCode(animal),
      );
    });

    if (DOM.resultAnimalImage) {
      DOM.resultAnimalImage.src = animalImage(animal);
    }

    if (DOM.resultAnimalName) {
      DOM.resultAnimalName.textContent = animalName(animal);
    }

    if (DOM.resultMessage) {
      DOM.resultMessage.textContent = isBettable(animal)
        ? `${animalMultiplier(animal)}x winner`
        : "NIL — No payout";
    }

    DOM.resultOverlay?.classList.remove(
  "is-hidden"
);
  }

 function getBetAmount(bet) {
  return Number(
    bet?.betAmount ??
    bet?.bet_amount ??
    0
  );
}

function getBetStatus(bet) {
  return String(
    bet?.betStatus ??
    bet?.bet_status ??
    "accepted"
  ).toLowerCase();
}

function renderUserBets(
  bets = [],
  serverSummary = null
) {
  const validBets =
    Array.isArray(bets)
      ? bets.filter(Boolean)
      : [];

  state.userBets = validBets;

  state.userBet =
    validBets[validBets.length - 1] ||
    null;

  const calculatedSummary =
    validBets.reduce(
      (summary, bet) => {
        const amount =
          getBetAmount(bet);

        const code =
          String(
            bet.selectedAnimalCode ??
            bet.animalCode ??
            bet.selected_animal_code ??
            ""
          ).toLowerCase();

        summary.totalBetAmount +=
          amount;

        if (code) {
          summary.animalBetAmounts[code] =
            Number(
              summary.animalBetAmounts[code] ||
              0
            ) + amount;
        }

        return summary;
      },
      {
        totalBets: validBets.length,
        totalBetAmount: 0,
        animalBetAmounts: {}
      }
    );

  state.userBetSummary = {
    ...calculatedSummary,
    ...(serverSummary || {})
  };

  if (validBets.length === 0) {
    DOM.myBetCard?.classList.add(
      "is-hidden"
    );

    setBettingEnabled(
      getRoundStatus(
        state.activeRound
      ) === "betting"
    );

    return;
  }

  DOM.myBetCard?.classList.remove(
    "is-hidden"
  );

  const animalCodes =
    Object.keys(
      state.userBetSummary
        .animalBetAmounts ||
      {}
    );

  const animalNames =
    animalCodes.map((code) => {
      const animal =
        state.animals.find(
          (item) =>
            animalCode(item) === code
        );

      return (
        animal?.animalName ||
        animal?.animal_name ||
        code
      );
    });

  if (DOM.myBetAnimal) {
    DOM.myBetAnimal.textContent =
      animalNames.length > 0
        ? animalNames.join(", ")
        : `${validBets.length} Bets`;
  }

  if (DOM.myBetAmount) {
    DOM.myBetAmount.textContent =
      money(
        state.userBetSummary
          .totalBetAmount
      );
  }

  const multiplierElement =
    $("myBetMultiplier");

  if (multiplierElement) {
    const multipliers =
      [
        ...new Set(
          validBets.map((bet) =>
            Number(
              bet.multiplier ??
              bet.lockedMultiplier ??
              bet.locked_multiplier ??
              0
            )
          )
        )
      ];

    multiplierElement.textContent =
      multipliers.length === 1
        ? `${multipliers[0]}x`
        : "Mixed";
  }

  const statusElement =
    $("myBetStatus");

  if (statusElement) {
    const statuses =
      [
        ...new Set(
          validBets.map(
            getBetStatus
          )
        )
      ];

    statusElement.textContent =
      statuses.length === 1
        ? `${
            validBets.length
          } BET${
            validBets.length === 1
              ? ""
              : "S"
          } · ${statuses[0].toUpperCase()}`
        : `${validBets.length} BETS · SETTLED`;
  }

  setBettingEnabled(
    getRoundStatus(
      state.activeRound
    ) === "betting"
  );
}

/*
 * পুরোনো single-bet response-এর compatibility।
 */
function renderMyBet(bet) {
  if (!bet) {
    renderUserBets([]);
    return;
  }

  renderUserBets([bet]);
}

 function placeBet() {
  if (
    !state.selectedAnimal ||
    state.isSpinning ||
    state.placingBet
  ) {
    return;
  }

  if (
    !state.socket?.connected
  ) {
    showToast(
      "Game server connected নয়",
      "error"
    );

    return;
  }

  const maximumBet =
    Number(
      state.settings
        ?.maximumBet ||
      state.settings
        ?.maximum_bet ||
      1000
    );

  const currentTotal =
    Number(
      state.userBetSummary
        ?.totalBetAmount ||
      0
    );

  const amount =
    Number(
      state.selectedAmount ||
      0
    );

  if (
    currentTotal + amount >
    maximumBet
  ) {
    showToast(
      `Round bet limit ৳${money(
        maximumBet
      )}`,
      "error"
    );

    setBettingEnabled(true);

    return;
  }

  state.placingBet = true;

  setBettingEnabled(true);

  state.socket.emit(
    "bangla-wheel:place-bet",
    {
      roundId:
        Number(
          state.activeRound?.id
        ),

      animalId:
        Number(
          state.selectedAnimal?.id
        ),

      betAmount:
        amount
    },
    (response) => {
      state.placingBet = false;

      if (
        !response?.success
      ) {
        showToast(
          response?.message ||
            "Bet করা যায়নি",
          "error"
        );

        setBettingEnabled(true);

        return;
      }

      const placedBet =
        response.data?.bet ||
        response.data;

      if (placedBet) {
        state.userBet =
          placedBet;

        state.userBets = [
          ...state.userBets,
          placedBet
        ];

        state.userBetSummary = {
          ...state.userBetSummary,

          totalBets:
            state.userBets.length,

          totalBetAmount:
            currentTotal +
            amount
        };

      renderUserBets(
  state.userBets
);
      }

      updateWallet(
        response.data?.wallet
          ?.balanceAfter ??
        response.data
          ?.walletBalance ??
        response.data
          ?.balance
      );

      showToast(
        "Bet successfully placed",
        "success"
      );

      setBettingEnabled(true);
    }
  );
}

   function bindControls() {
    DOM.decreaseBet?.addEventListener("click", () => {
      const minimum = Number(
        state.settings?.minimumBet || 5
      );

      state.selectedAmount = Math.max(
        minimum,
        Number(state.selectedAmount) - 5
      );

      updateBetPreview();
    });

    DOM.increaseBet?.addEventListener("click", () => {
      const maximum = Number(
        state.settings?.maximumBet || 1000
      );

      state.selectedAmount = Math.min(
        maximum,
        Number(state.selectedAmount) + 5
      );

      updateBetPreview();
    });

    document
      .querySelectorAll("[data-amount]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          const maximum = Number(
            state.settings?.maximumBet || 1000
          );

          state.selectedAmount = Math.min(
            maximum,
            Number(button.dataset.amount)
          );

          updateBetPreview();
        });
      });

    DOM.betAmount?.addEventListener("input", () => {
      const minimum = Number(
        state.settings?.minimumBet || 5
      );

      const maximum = Number(
        state.settings?.maximumBet || 1000
      );

      const enteredAmount = Number(
        DOM.betAmount.value
      );

      if (!Number.isFinite(enteredAmount)) return;

      state.selectedAmount = Math.min(
        maximum,
        Math.max(minimum, enteredAmount)
      );

      updateBetPreview();
    });

    DOM.placeBetBtn?.addEventListener(
      "click",
      placeBet
    );

    DOM.closeResultBtn?.addEventListener("click", () => {
      DOM.resultOverlay?.classList.add(
  "is-hidden"
);
    });

    $("continueBtn")?.addEventListener("click", () => {
      DOM.resultOverlay?.classList.add(
  "is-hidden"
);
    });

    $("backBtn")?.addEventListener("click", () => {
      window.location.href = "./lobby.html";
    });

    DOM.soundToggle?.addEventListener("click", () => {
      state.soundEnabled = !state.soundEnabled;

      DOM.soundToggle.classList.toggle(
        "is-muted",
        !state.soundEnabled
      );

      const icon = DOM.soundToggle.querySelector("i");

      if (icon) {
        icon.className = state.soundEnabled
          ? "fa-solid fa-volume-high"
          : "fa-solid fa-volume-xmark";
      }
    });
  }

  function handleState(payload) {
    const data = payload?.data || payload;

    const currentServerTime = data?.serverTime || payload?.serverTime;

    if (currentServerTime) {
      state.serverOffset = new Date(currentServerTime).getTime() - Date.now();
    }

    if (Array.isArray(data?.animals)) {
      state.animals = data.animals;
      renderWheel();
      renderAnimalOptions();
    }

    if (data?.settings) {
      state.settings = data.settings;
      state.selectedAmount = Number(
        data.settings.minimumBet || data.settings.minimum_bet || 5,
      );
    }

    if (data?.activeRound) applyRound(data.activeRound);
    if (
  Array.isArray(
    data?.userBets
  )
) {
  renderUserBets(
    data.userBets,
    data.userBetSummary
  );
} else if (data?.userBet) {
  renderMyBet(
    data.userBet
  );
}

    updateWallet(data?.walletBalance ?? data?.balance);
    updateBetPreview();
  }

  function connectSocket() {
    const token = getToken();

    if (!token) {
      window.location.href = "../login.html";
      return;
    }

    state.socket = io(`${getServerUrl()}/bangla-wheel`, {
      auth: { token },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
    });

    state.socket.on("connect", () => setConnected(true));
    state.socket.on("disconnect", () => setConnected(false));

    state.socket.on("connect_error", (error) => {
      setConnected(false);
      showToast(error.message || "Connection failed", "error");
    });

    state.socket.on("bangla-wheel:state", handleState);

    state.socket.on("bangla-wheel:round-started", (payload) => {
      const data = payload?.data || payload;
      document
        .querySelectorAll(".wheel-segment")
        .forEach((segment) => segment.classList.remove("is-winner"));

      DOM.resultOverlay?.classList.add(
  "is-hidden"
);
            state.selectedAnimal = null;

      renderAnimalOptions();
      updateBetPreview();
      state.userBet = null;
state.userBets = [];

state.userBetSummary = {
  totalBets: 0,
  totalBetAmount: 0,
  animalBetAmounts: {}
};

renderUserBets([]);
      state.isSpinning = false;

      applyRound(data.round || data);
    });

        state.socket.on("bangla-wheel:betting-closed", () => {
      setBettingEnabled(false);

      const placeBetText = $("placeBetText");
      const bettingMessage = $("bettingMessage");

      if (placeBetText) {
        placeBetText.textContent = "Betting Closed";
      }

      if (bettingMessage) {
        bettingMessage.textContent =
          "Wheel spin শুরু হচ্ছে। নতুন bet বন্ধ।";
      }
    });

    state.socket.on("bangla-wheel:spin-started", (payload) => {
      const data = payload?.data || payload;

      if (payload?.serverTime) {
        state.serverOffset =
          new Date(payload.serverTime).getTime() - Date.now();
      }

      if (data?.round) applyRound(data.round);
            const spinInformation = $("spinInformation");
      const spinInformationText = $("spinInformationText");

      spinInformation?.classList.add("is-spinning");

      if (spinInformationText) {
        spinInformationText.textContent =
          "Wheel is spinning — please wait";
      }
      spinWheel(data);
    });

       state.socket.on("bangla-wheel:result", (payload) => {
      const spinInformation = $("spinInformation");
      const spinInformationText = $("spinInformationText");

      spinInformation?.classList.remove("is-spinning");

      if (spinInformationText) {
        spinInformationText.textContent =
          "Round completed";
      }

      showResult(payload?.data || payload);
    });

  state.socket.on(
  "bangla-wheel:user-result",
  (payload) => {
    const data =
      payload?.data ||
      payload ||
      {};

    updateWallet(
      data.walletBalance ??
      data.balance
    );

    if (
      Array.isArray(
        data.userBets
      )
    ) {
      renderUserBets(
        data.userBets,
        data.userBetSummary
      );
    } else if (data.userBet) {
      renderMyBet(
        data.userBet
      );
    }

    const result =
      data.resultSummary ||
      {};

    const winningBets =
      Number(
        result.winningBets ||
        0
      );

    const losingBets =
      Number(
        result.losingBets ||
        0
      );

    const netPayout =
      Number(
        result.netPayout ||
        0
      );

    if (winningBets > 0) {
      showToast(
        `${winningBets} bet won — payout ৳${money(
          netPayout
        )}`,
        "success"
      );
    } else if (losingBets > 0) {
      showToast(
        `${losingBets} bet lost this round`,
        "error"
      );
    }
  }
);

    state.socket.on("bangla-wheel:error", (payload) => {
      showToast(payload?.message || payload?.error || "Game error", "error");
    });
  }

  async function init() {
    bindControls();
    updateBetPreview();
    setConnected(false);
    connectSocket();

    DOM.loadingOverlay?.classList.add("hidden");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
