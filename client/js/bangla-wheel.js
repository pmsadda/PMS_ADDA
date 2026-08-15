"use strict";

(() => {
  const SEGMENT_COUNT = 13;
  const SEGMENT_ANGLE = 360 / SEGMENT_COUNT;

  const state = {
    socket: null,
    animals: [],
    settings: null,
    activeRound: null,
    selectedAnimal: null,
    selectedAmount: 5,
    walletBalance: 0,
    wheelRotation: 0,
    countdownTimer: null,
    spinAnimation: null,
    serverOffset: 0,
    isSpinning: false,
    soundEnabled: true
  };

  const $ = (id) => document.getElementById(id);

  const DOM = {
    connectionStatus: $("connectionStatus"),
    connectionText: $("connectionText"),
    walletBalance: $("walletBalance"),
    roundId: $("roundId"),
    roundStatus: $("roundStatus"),
    timerValue: $("timerValue"),

    animalWheel: $("animalWheel"),
    wheelSegments: $("wheelSegments"),
    animalOptions: $("animalOptions"),

    selectedAnimalName: $("selectedAnimalName"),
    selectedMultiplier: $("selectedMultiplier"),
    betAmount: $("betAmount"),
    possiblePayout: $("possiblePayout"),
    decreaseBet: $("decreaseBet"),
    increaseBet: $("increaseBet"),
    placeBetBtn: $("placeBetBtn"),

    myBetCard: $("myBetCard"),
    myBetAnimal: $("myBetAnimal"),
    myBetAmount: $("myBetAmount"),
    myBetPayout: $("myBetPayout"),

    recentResults: $("recentResults"),
    resultOverlay: $("resultOverlay"),
    resultAnimalImage: $("resultAnimalImage"),
    resultAnimalName: $("resultAnimalName"),
    resultMessage: $("resultMessage"),
    closeResultBtn: $("closeResultBtn"),

    loadingOverlay: $("loadingOverlay"),
    toast: $("toast"),
    soundToggle: $("soundToggle")
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
      maximumFractionDigits: 2
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
    DOM.toast.className = `toast show ${type}`;

    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => {
      DOM.toast.classList.remove("show");
    }, 3000);
  }

  function setConnected(connected) {
    DOM.connectionStatus?.classList.toggle("connected", connected);
    DOM.connectionStatus?.classList.toggle("disconnected", !connected);

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
      5
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
  }

  function buildWheelBackground() {
    if (!DOM.animalWheel) return;

    const colors = state.animals
      .slice()
      .sort((a, b) => animalSegmentIndex(a) - animalSegmentIndex(b))
      .map((animal, index) => {
        if (!isBettable(animal)) {
          return index % 2 === 0 ? "#641818" : "#421010";
        }

        return index % 2 === 0 ? "#075438" : "#0b3428";
      });

    const stops = colors.map((color, index) => {
      const start = index * SEGMENT_ANGLE;
      const end = (index + 1) * SEGMENT_ANGLE;
      return `${color} ${start}deg ${end}deg`;
    });

    DOM.animalWheel.style.background =
      `conic-gradient(from ${-90 - SEGMENT_ANGLE / 2}deg, ${stops.join(",")})`;
  }

  function renderWheel() {
    if (!DOM.wheelSegments) return;

    const animals = state.animals
      .slice()
      .sort((a, b) => animalSegmentIndex(a) - animalSegmentIndex(b));

    buildWheelBackground();

    DOM.wheelSegments.innerHTML = animals.map((animal) => {
      const index = animalSegmentIndex(animal);
      const angle = index * SEGMENT_ANGLE;
      const nilClass = isBettable(animal) ? "" : " nil";

      return `
        <div
          class="wheel-segment${nilClass}"
          data-code="${escapeHtml(animalCode(animal))}"
          style="--segment-angle:${angle}deg"
        >
          <div class="wheel-segment-content">
            <img
              src="${escapeHtml(animalImage(animal))}"
              alt="${escapeHtml(animalName(animal))}"
              draggable="false"
            >
            <strong>${escapeHtml(animalName(animal))}</strong>
            <span>
              ${isBettable(animal)
                ? `${animalMultiplier(animal)}x`
                : "NIL"}
            </span>
          </div>
        </div>
      `;
    }).join("");
  }

  function renderAnimalOptions() {
    if (!DOM.animalOptions) return;

    DOM.animalOptions.innerHTML = state.animals.map((animal) => {
      const code = animalCode(animal);
      const bettable = isBettable(animal);
      const selected = animalCode(state.selectedAnimal) === code;

      return `
        <button
          type="button"
          class="animal-option${selected ? " selected" : ""}${bettable ? "" : " nil"}"
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
    }).join("");

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
        });
      });
  }

  function setBettingEnabled(enabled) {
    const canBet = enabled && !state.isSpinning;

    DOM.placeBetBtn && (DOM.placeBetBtn.disabled =
      !canBet || !state.selectedAnimal);

    DOM.decreaseBet && (DOM.decreaseBet.disabled = !canBet);
    DOM.increaseBet && (DOM.increaseBet.disabled = !canBet);

    DOM.animalOptions
      ?.querySelectorAll(".animal-option:not(.nil)")
      .forEach((button) => {
        button.disabled = !canBet;
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
      round?.bettingEndsAt ||
      round?.betting_ends_at ||
      round?.bettingClosesAt
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
          status === "spinning" ? "SPINNING" :
          status === "betting" ? "BETTING" :
          status ? status.toUpperCase() : "WAITING";
      }

      setBettingEnabled(status === "betting" && remaining > 0);

      if (remaining <= 0 && status === "betting") {
        setBettingEnabled(false);
      }
    };

    tick();
    state.countdownTimer = setInterval(tick, 250);
  }

  function applyRound(round) {
    if (!round) return;

    state.activeRound = round;

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
    const index =
      round?.winningSegmentIndex ??
      round?.winning_segment_index;

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
      state.activeRound?.spinningEndsAt
    );

    let duration = endingTime
      ? Math.max(800, endingTime - serverNow())
      : 20000;

    duration = Math.min(duration, 20000);

    state.isSpinning = true;
    setBettingEnabled(false);

    DOM.resultOverlay?.classList.remove("show");

    const currentNormalized =
      ((state.wheelRotation % 360) + 360) % 360;

    const desiredNormalized =
      ((-winningIndex * SEGMENT_ANGLE) % 360 + 360) % 360;

    const alignmentDelta =
      (desiredNormalized - currentNormalized + 360) % 360;

    const fullTurns = Math.max(2, Math.ceil(10 * (duration / 20000)));
    const targetRotation =
      state.wheelRotation + fullTurns * 360 + alignmentDelta;

    state.spinAnimation?.cancel();

    state.spinAnimation = DOM.animalWheel.animate(
      [
        {
          transform: `rotate(${state.wheelRotation}deg)`,
          offset: 0
        },
        {
          transform: `rotate(${targetRotation - SEGMENT_ANGLE * 5}deg)`,
          offset: 0.72
        },
        {
          transform: `rotate(${targetRotation - SEGMENT_ANGLE}deg)`,
          offset: 0.94
        },
        {
          transform: `rotate(${targetRotation}deg)`,
          offset: 1
        }
      ],
      {
        duration,
        easing: "cubic-bezier(0.08, 0.72, 0.12, 1)",
        fill: "forwards"
      }
    );

    state.spinAnimation.onfinish = () => {
      state.wheelRotation = targetRotation;
      DOM.animalWheel.style.transform =
        `rotate(${state.wheelRotation}deg)`;
      state.spinAnimation = null;
    };
  }

  function showResult(data) {
    state.isSpinning = false;

    const animal = findWinningAnimal(data);
    if (!animal) return;

    document
      .querySelectorAll(".wheel-segment")
      .forEach((segment) => {
        segment.classList.toggle(
          "winner",
          segment.dataset.code === animalCode(animal)
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

    DOM.resultOverlay?.classList.add("show");
  }

  function renderMyBet(bet) {
    if (!bet) {
      DOM.myBetCard?.classList.remove("show");
      return;
    }

    const animal = state.animals.find(
      (item) =>
        animalCode(item) ===
        (bet.animalCode || bet.animal_code)
    );

    DOM.myBetCard?.classList.add("show");

    if (DOM.myBetAnimal) {
      DOM.myBetAnimal.textContent =
        animal ? animalName(animal) : "—";
    }

    if (DOM.myBetAmount) {
      DOM.myBetAmount.textContent =
        `৳ ${money(bet.betAmount || bet.bet_amount)}`;
    }

    if (DOM.myBetPayout) {
      DOM.myBetPayout.textContent =
        `৳ ${money(bet.netPayout || bet.net_payout || 0)}`;
    }
  }

  function placeBet() {
    if (!state.selectedAnimal || state.isSpinning) return;

    if (!state.socket?.connected) {
      showToast("Game server connected নয়", "error");
      return;
    }

    DOM.placeBetBtn.disabled = true;

    state.socket.emit("bangla-wheel:place-bet", {
      animalCode: animalCode(state.selectedAnimal),
      amount: Number(state.selectedAmount)
    }, (response) => {
      if (!response?.success) {
        showToast(response?.message || "Bet করা যায়নি", "error");
        setBettingEnabled(true);
        return;
      }

      renderMyBet(response.data?.bet || response.data);
      updateWallet(
        response.data?.walletBalance ??
        response.data?.balance
      );

      showToast("Bet successfully placed", "success");
    });
  }

  function bindControls() {
    DOM.decreaseBet?.addEventListener("click", () => {
      const minimum = Number(state.settings?.minimumBet || 5);
      state.selectedAmount = Math.max(
        minimum,
        Number(state.selectedAmount) - 5
      );
      updateBetPreview();
    });

    DOM.increaseBet?.addEventListener("click", () => {
      const maximum = Number(state.settings?.maximumBet || 1000);
      state.selectedAmount = Math.min(
        maximum,
        Number(state.selectedAmount) + 5
      );
      updateBetPreview();
    });

    document.querySelectorAll("[data-bet-amount]").forEach((button) => {
      button.addEventListener("click", () => {
        const maximum = Number(state.settings?.maximumBet || 1000);
        state.selectedAmount = Math.min(
          maximum,
          Number(button.dataset.betAmount)
        );
        updateBetPreview();
      });
    });

    DOM.placeBetBtn?.addEventListener("click", placeBet);

    DOM.closeResultBtn?.addEventListener("click", () => {
      DOM.resultOverlay?.classList.remove("show");
    });

    DOM.soundToggle?.addEventListener("click", () => {
      state.soundEnabled = !state.soundEnabled;
      DOM.soundToggle.classList.toggle(
        "muted",
        !state.soundEnabled
      );
    });
  }

  function handleState(payload) {
    const data = payload?.data || payload;

    if (payload?.serverTime) {
      state.serverOffset =
        new Date(payload.serverTime).getTime() - Date.now();
    }

    if (Array.isArray(data?.animals)) {
      state.animals = data.animals;
      renderWheel();
      renderAnimalOptions();
    }

    if (data?.settings) {
      state.settings = data.settings;
      state.selectedAmount = Number(
        data.settings.minimumBet ||
        data.settings.minimum_bet ||
        5
      );
    }

    if (data?.activeRound) applyRound(data.activeRound);
    if (data?.userBet) renderMyBet(data.userBet);

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
      reconnectionAttempts: Infinity
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
        .forEach((segment) => segment.classList.remove("winner"));

      DOM.resultOverlay?.classList.remove("show");
      renderMyBet(null);
      state.isSpinning = false;

      applyRound(data.round || data);
    });

    state.socket.on("bangla-wheel:betting-closed", () => {
      setBettingEnabled(false);
    });

    state.socket.on("bangla-wheel:spin-started", (payload) => {
      const data = payload?.data || payload;

      if (payload?.serverTime) {
        state.serverOffset =
          new Date(payload.serverTime).getTime() - Date.now();
      }

      if (data?.round) applyRound(data.round);
      spinWheel(data);
    });

    state.socket.on("bangla-wheel:result", (payload) => {
      showResult(payload?.data || payload);
    });

    state.socket.on("bangla-wheel:user-result", (payload) => {
      const data = payload?.data || payload;

      /*
       * এই event spin শেষ হওয়ার পর আসে।
       * তাই wallet এখানেই update হবে—আগে নয়।
       */
      updateWallet(data?.walletBalance ?? data?.balance);

      if (data?.bet) renderMyBet(data.bet);

      if (data?.won) {
        showToast(
          `You won ৳${money(data.netPayout || data.net_payout)}`,
          "success"
        );
      }
    });

    state.socket.on("bangla-wheel:error", (payload) => {
      showToast(
        payload?.message || payload?.error || "Game error",
        "error"
      );
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