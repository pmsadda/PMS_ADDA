"use strict";

/* ==========================================
   PMS ADDA POKER
   Live Matchmaking UI
========================================== */

const POKER_GAME = {
  socket: null,
  state: null,

  tableId: null,
  currentUserId: null,
  tablePlayerId: null,

  matchmakingTimer: null,
  turnTimer: null,
  nextHandCountdownTimer: null,

  showdownRevealTimer: null,

  winnerOverlayTimer: null,

  actionPending: false,
  exitPending: false,

  soundEnabled: localStorage.getItem("poker_sound_enabled") !== "false",

  sounds: null,

  lastAnimatedHandId: null,

  getElement(id) {
    return document.getElementById(id);
  },

  formatMoney(value) {
    return Number(value || 0).toLocaleString("en-BD", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  },

  decodeUserId(token) {
    try {
      const payloadPart = token.split(".")[1];

      const normalized = payloadPart.replace(/-/g, "+").replace(/_/g, "/");

      const payload = JSON.parse(
        decodeURIComponent(
          atob(normalized)
            .split("")
            .map(
              (character) =>
                `%${character.charCodeAt(0).toString(16).padStart(2, "0")}`,
            )
            .join(""),
        ),
      );

      return Number(payload.id) || null;
    } catch (error) {
      console.error("Unable to decode Poker token:", error);

      return null;
    }
  },

  resolveTableId() {
    const query = new URLSearchParams(window.location.search);

    const queryTableId = Number(query.get("tableId"));

    if (Number.isInteger(queryTableId) && queryTableId > 0) {
      return queryTableId;
    }

    try {
      const stored = JSON.parse(
        localStorage.getItem("current_poker_table") || "null",
      );

      const storedTableId = Number(stored?.tableId || stored?.table?.id);

      return Number.isInteger(storedTableId) && storedTableId > 0
        ? storedTableId
        : null;
    } catch {
      return null;
    }
  },

  getServerUrl() {
    return String(
      window.APP_CONFIG?.SERVER_URL || "http://localhost:5000",
    ).replace(/\/+$/, "");
  },

  getMe() {
    return (
      this.state?.players?.find(
        (player) =>
          !player.isBot && Number(player.userId) === Number(this.currentUserId),
      ) || null
    );
  },

  getLocalServerSeatNo() {
    const localPlayer =
      this.getMe() ||
      this.state?.players?.find(
        (player) =>
          !player.isBot && Number(player.id) === Number(this.tablePlayerId),
      ) ||
      null;

    const seatNo = Number(localPlayer?.seatNo);

    return Number.isInteger(seatNo) && seatNo >= 1 && seatNo <= 5
      ? seatNo
      : null;
  },

  getVisualSeatNo(serverSeatNo) {
    const validServerSeatNo = Number(serverSeatNo);

    if (
      !Number.isInteger(validServerSeatNo) ||
      validServerSeatNo < 1 ||
      validServerSeatNo > 5
    ) {
      return null;
    }

    const localServerSeatNo = this.getLocalServerSeatNo();

    if (!localServerSeatNo) {
      return validServerSeatNo;
    }

    /*
     * Local real player সবসময় visual seat 1।
     * অন্য seatগুলো clockwiseভাবে ঘুরবে।
     */
    return ((validServerSeatNo - localServerSeatNo + 5) % 5) + 1;
  },

  getServerSeatNoForVisualSeat(visualSeatNo) {
    const validVisualSeatNo = Number(visualSeatNo);

    if (
      !Number.isInteger(validVisualSeatNo) ||
      validVisualSeatNo < 1 ||
      validVisualSeatNo > 5
    ) {
      return null;
    }

    const localServerSeatNo = this.getLocalServerSeatNo();

    if (!localServerSeatNo) {
      return validVisualSeatNo;
    }

    return ((localServerSeatNo + validVisualSeatNo - 2) % 5) + 1;
  },

  getSeatElementByServerSeat(serverSeatNo) {
    const visualSeatNo = this.getVisualSeatNo(serverSeatNo);

    return visualSeatNo ? this.getElement(`playerSeat${visualSeatNo}`) : null;
  },

  initializeSounds() {
    this.sounds = {
      cardDeal: new Audio("../assets/sounds/card-deal.mp3"),

      chipThrow: new Audio("../assets/sounds/chip-throw.mp3"),

      chipLand: new Audio("../assets/sounds/chip-land.mp3"),

      winner: new Audio("../assets/sounds/winner.mp3"),
    };

    Object.values(this.sounds).forEach((audio) => {
      audio.preload = "auto";
    });

    this.updateSoundButton();

    /*
     * Browser autoplay restriction unlock।
     * প্রথম click/touch-এর পরে sound চলবে।
     */
    document.addEventListener(
      "pointerdown",
      () => {
        Object.values(this.sounds).forEach((audio) => {
          const previousVolume = audio.volume;

          audio.volume = 0;

          const promise = audio.play();

          if (promise && typeof promise.catch === "function") {
            promise.catch(() => {});
          }

          audio.pause();
          audio.currentTime = 0;
          audio.volume = previousVolume;
        });
      },
      {
        once: true,
      },
    );
  },

  playSound(soundName, volume = 0.75) {
    if (!this.soundEnabled || !this.sounds?.[soundName]) {
      return;
    }

    try {
      const sound = this.sounds[soundName].cloneNode();

      sound.volume = Math.min(Math.max(Number(volume), 0), 1);

      const promise = sound.play();

      if (promise && typeof promise.catch === "function") {
        promise.catch(() => {});
      }
    } catch (error) {
      console.warn("Poker sound failed:", error);
    }
  },

  toggleSound() {
    this.soundEnabled = !this.soundEnabled;

    localStorage.setItem("poker_sound_enabled", String(this.soundEnabled));

    this.updateSoundButton();

    if (this.soundEnabled) {
      this.playSound("chipLand", 0.55);
    }
  },

  updateSoundButton() {
    const button = this.getElement("soundButton");

    if (!button) {
      return;
    }

    button.textContent = this.soundEnabled ? "🔊" : "🔇";

    button.setAttribute(
      "aria-label",
      this.soundEnabled ? "Mute Poker sounds" : "Enable Poker sounds",
    );
  },

  initialize() {
    const token = localStorage.getItem("access_token");

    if (!token) {
      window.location.replace("login.html");

      return;
    }

    this.tableId = this.resolveTableId();

    this.currentUserId = this.decodeUserId(token);

    if (!this.tableId) {
      this.setConnection("Poker table information missing", false);

      this.setRoundStatus("Please enter through Poker Rooms.");

      return;
    }

    if (typeof window.io !== "function") {
      this.setConnection("Socket.IO unavailable", false);

      return;
    }

    this.initializeSounds();

    this.initializeControls();
    this.connectSocket(token);
  },

  initializeControls() {
    const goToRooms = () => {
      this.exitPokerTable();
    };

    this.getElement("soundButton")?.addEventListener("click", () => {
      this.toggleSound();
    });

    this.getElement("backButton")?.addEventListener("click", goToRooms);

    this.getElement("exitButton")?.addEventListener("click", goToRooms);

    this.getElement("resultExitButton")?.addEventListener("click", goToRooms);

    this.getElement("foldButton")?.addEventListener("click", () => {
      this.submitAction("fold");
    });

    this.getElement("checkCallButton")?.addEventListener("click", () => {
      const actions = this.state?.myAction?.allowedActions || [];

      this.submitAction(actions.includes("check") ? "check" : "call");
    });

    this.getElement("raiseButton")?.addEventListener("click", () => {
      const slider = this.getElement("raiseSlider");

      this.submitAction("raise", Number(slider?.value));
    });

    this.getElement("allInButton")?.addEventListener("click", () => {
      this.submitAction("all_in");
    });

    this.getElement("raiseSlider")?.addEventListener("input", (event) => {
      const amount = this.getElement("raiseAmount");

      if (amount) {
        amount.textContent = `৳${this.formatMoney(event.target.value)}`;
      }
    });
  },

  connectSocket(token) {
    this.setConnection("Connecting…", false);

    this.socket = window.io(`${this.getServerUrl()}/poker`, {
      auth: {
        token,
      },

      transports: ["websocket", "polling"],

      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 700,
      timeout: 10000,
    });

    this.registerSocketEvents();
  },

  registerSocketEvents() {
    this.socket.on("connect", () => {
      console.log("✅ Poker socket connected:", this.socket.id);

      this.setConnection("Connected", true);

      this.joinTable();
    });

    this.socket.on("connect_error", (error) => {
      console.error("Poker socket error:", error);

      this.setConnection(error.message || "Connection failed", false);

      this.setRoundStatus(error.message || "Unable to connect.");
    });

    this.socket.on(
  "account:blocked",
  (payload = {}) => {
    window.alert(
      payload.message ||
      "Your account has been banned.",
    );

    if (
      typeof window.AUTH_SESSION
        ?.logout === "function"
    ) {
      window.AUTH_SESSION.logout();
      return;
    }

    [
      "access_token",
      "token",
      "refresh_token",
      "current_user",
      "user",
      "user_id",
    ].forEach((key) => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    });

    window.location.replace(
      "login.html",
    );
  },
);

    this.socket.on("disconnect", () => {
      this.setConnection("Reconnecting…", false);

      this.disableActions();
    });

    this.socket.on("table:state", (state) => {
      this.applyState(state);
    });

    this.socket.on("matchmaking:completed", (data) => {
      console.log("✅ Poker matchmaking completed:", data);

      this.hideMatchmaking();
    });

    this.socket.on("table:player-joined", () => {
      this.requestLatestState();
    });

    this.socket.on("table:player-disconnected", () => {
      this.setRoundStatus("A player lost connection");
    });

    this.socket.on("table:player-reconnected", () => {
      this.setConnection("Connected", true);

      this.setRoundStatus("Player reconnected");

      this.requestLatestState();
    });

    this.socket.on("hand:action", (action) => {
      console.log("🃏 Poker hand action:", action);

      this.animateChipToPot(action);

      this.animateDealtStreets(action.dealtStreets);
    });

    this.socket.on("hand:countdown", (payload = {}) => {
      this.startNextHandCountdown(payload);
    });

    this.socket.on("hand:completed", (settlement) => {
      console.log("🏆 Poker hand completed:", settlement);

      this.handleHandCompleted(settlement);
    });

    this.socket.on("hand:started", (hand) => {
      clearTimeout(this.showdownRevealTimer);

      clearTimeout(this.winnerOverlayTimer);

      this.showdownRevealTimer = null;

      this.winnerOverlayTimer = null;
      this.clearNextHandCountdown();

      /*
       * আগের hand-এর winner এবং opponent
       * cards নতুন hand শুরুর আগেই সরানো হবে।
       */
      this.clearPokerCardsForCountdown();

      console.log("🃏 Poker hand started:", hand);

      this.getElement("winnerOverlay")?.setAttribute("hidden", "");

      document.querySelectorAll(".player-seat").forEach((seat) => {
        seat.classList.remove("is-winner", "is-folded");
      });

      this.setRoundStatus(`Hand #${hand.handNumber} started`);

      /*
       * Server থেকে নতুন personalized
       * state আবার নেওয়া হবে।
       */
      this.requestLatestState();
    });

    this.socket.on("table:error", (error) => {
      console.error("Poker table error:", error);

      this.setRoundStatus(error?.message || "Poker table error.");
    });
  },

  joinTable() {
    this.socket.emit(
      "table:join",
      {
        tableId: this.tableId,
      },
      (response) => {
        if (!response?.success) {
          console.error("Poker table join failed:", response);

          this.setRoundStatus(
            response?.message || "Unable to join Poker table.",
          );

          return;
        }

        this.tablePlayerId = Number(response.data?.tablePlayerId);

        console.log("✅ Poker table joined:", response.data);
      },
    );
  },

  requestLatestState() {
    if (!this.socket?.connected) {
      return;
    }

    this.socket.emit("table:get-state", {
      tableId: this.tableId,
    });
  },

  applyState(state) {
    if (!state?.table || !Array.isArray(state.players)) {
      console.error("Invalid Poker state:", state);

      return;
    }

    this.state = state;

    const me = this.getMe();

    if (me) {
      this.tablePlayerId = Number(me.id);
    }

    this.renderHeader();
    this.renderPlayers();
    this.renderPokerHand();
    this.renderTableStatus();
    this.renderMatchmaking();
    this.renderActionControls();
    this.startTurnTimer();
    this.animateInitialDeal();

    console.log("🃏 Poker table state:", state);
  },

  getCardImagePath(cardCode) {
    const safeCode = String(cardCode || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");

    return safeCode ? `../assets/cards/${safeCode}.png` : null;
  },

  renderCardFace(cardElement, cardCode) {
    if (!cardElement) {
      return;
    }

    const normalizedCode = String(cardCode || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");

    /*
     * Card না থাকলে আগের hand-এর inline
     * background এবং animation সম্পূর্ণ clear।
     */
    if (!normalizedCode) {
      cardElement.classList.remove("has-card", "is-revealing", "is-dealing");

      delete cardElement.dataset.cardCode;

      cardElement.style.removeProperty("background-image");

      return;
    }

    const previousCode = String(cardElement.dataset.cardCode || "");

    cardElement.dataset.cardCode = normalizedCode;

    cardElement.classList.add("has-card");

    if (previousCode !== normalizedCode || !cardElement.style.backgroundImage) {
      cardElement.style.backgroundImage = `url("${this.getCardImagePath(
        normalizedCode,
      )}")`;
    }
  },

  getHandPlayerBySeat(seatNo) {
    return (
      this.state?.handPlayers?.find(
        (player) => Number(player.seatNo) === Number(seatNo),
      ) || null
    );
  },

  renderPokerHand() {
    const hand = this.state?.hand;

    const potAmount = this.getElement("potAmount");

    if (potAmount) {
      potAmount.textContent = `৳${this.formatMoney(hand?.potAmount || 0)}`;
    }

    const communityCards = Array.isArray(hand?.communityCards)
      ? hand.communityCards
      : [];

    document
      .querySelectorAll(".community-card")
      .forEach((cardElement, index) => {
        const cardCode = communityCards[index];

        this.renderCardFace(cardElement, cardCode);
      });

    for (let visualSeatNo = 1; visualSeatNo <= 5; visualSeatNo += 1) {
      const seat = this.getElement(`playerSeat${visualSeatNo}`);

      if (!seat) {
        continue;
      }

      const serverSeatNo = this.getServerSeatNoForVisualSeat(visualSeatNo);

      const handPlayer = this.getHandPlayerBySeat(serverSeatNo);

      seat.classList.remove(
        "is-current-turn",
        "is-folded",
        "is-dealer",
        "is-small-blind",
        "is-big-blind",
      );

      if (!handPlayer) {
        seat.querySelectorAll(".hole-card").forEach((card) => {
          this.renderCardFace(card, null);
        });

        continue;
      }

      seat.classList.toggle(
        "is-current-turn",
        Number(hand?.currentTurnPlayerId) === Number(handPlayer.tablePlayerId),
      );

      seat.classList.toggle("is-folded", handPlayer.status === "folded");

      seat.classList.toggle("is-dealer", Boolean(handPlayer.isDealer));

      seat.classList.toggle("is-small-blind", Boolean(handPlayer.isSmallBlind));

      seat.classList.toggle("is-big-blind", Boolean(handPlayer.isBigBlind));

      const stack = seat.querySelector(".player-stack");

      if (stack) {
        stack.textContent = `৳${this.formatMoney(handPlayer.endingStack)}`;
      }

      const action = seat.querySelector(".player-action");

      if (action) {
        action.textContent = String(
          handPlayer.lastAction || handPlayer.status || "active",
        )
          .replace("_", " ")
          .toUpperCase();
      }

      const betBox = seat.querySelector(".player-bet");

      const betAmount = betBox?.querySelector("strong");

      const roundBet = Number(handPlayer.roundBet || 0);

      betBox?.classList.toggle("has-bet", roundBet > 0);

      if (betAmount) {
        betAmount.textContent = `৳${this.formatMoney(roundBet)}`;
      }

      const holeCards = seat.querySelectorAll(".hole-card");

      /*
       * Live hand-এ শুধু local player's
       * personalized cards render হবে।
       */
      const ownsVisibleCards =
        Number(handPlayer.tablePlayerId) === Number(this.tablePlayerId);

      const visibleCards =
        ownsVisibleCards && Array.isArray(handPlayer.holeCards)
          ? handPlayer.holeCards
          : [];

      holeCards.forEach((cardElement, cardIndex) => {
        const cardCode = visibleCards[cardIndex];

        this.renderCardFace(cardElement, cardCode);
      });
    }

    if (hand?.status) {
      this.setRoundStatus(
        `${String(hand.status).toUpperCase()} • Pot ৳${this.formatMoney(
          hand.potAmount,
        )}`,
      );
    }
  },

  renderActionControls() {
    const actionState = this.state?.myAction;

    const allowed = Array.isArray(actionState?.allowedActions)
      ? actionState.allowedActions
      : [];

    const canAct =
      Boolean(actionState?.isMyTurn) &&
      !this.actionPending &&
      this.socket?.connected;

    const foldButton = this.getElement("foldButton");

    const checkCallButton = this.getElement("checkCallButton");

    const raiseButton = this.getElement("raiseButton");

    const allInButton = this.getElement("allInButton");

    const raiseSlider = this.getElement("raiseSlider");

    if (foldButton) {
      foldButton.disabled = !canAct || !allowed.includes("fold");
    }

    if (checkCallButton) {
      const canCheck = allowed.includes("check");

      const canCall = allowed.includes("call");

      checkCallButton.textContent = canCheck
        ? "Check"
        : `Call ৳${this.formatMoney(actionState?.callAmount)}`;

      checkCallButton.disabled = !canAct || (!canCheck && !canCall);
    }

    const minimumRaise = Number(actionState?.minimumRaiseTo || 0);

    const maximumRaise = Number(actionState?.maximumRaiseTo || 0);

    if (raiseSlider) {
      raiseSlider.min = String(minimumRaise);

      raiseSlider.max = String(Math.max(maximumRaise, minimumRaise));

      raiseSlider.step = "0.50";

      const oldValue = Number(raiseSlider.value);

      const nextValue =
        oldValue >= minimumRaise && oldValue <= maximumRaise
          ? oldValue
          : minimumRaise;

      raiseSlider.value = String(nextValue);

      raiseSlider.disabled = !canAct || !allowed.includes("raise");
    }

    const raiseAmount = this.getElement("raiseAmount");

    if (raiseAmount) {
      raiseAmount.textContent = `৳${this.formatMoney(
        raiseSlider?.value || minimumRaise,
      )}`;
    }

    if (raiseButton) {
      raiseButton.disabled = !canAct || !allowed.includes("raise");
    }

    if (allInButton) {
      allInButton.disabled = !canAct || !allowed.includes("all_in");
    }
  },

  completePokerExit(response) {
    console.log("✅ Poker cash-out:", response?.data);

    localStorage.removeItem("current_poker_table");

    window.location.replace("poker-rooms.html");
  },

  async exitPokerTableViaHttp() {
    const token = localStorage.getItem("access_token");

    if (!token) {
      throw new Error("Authentication token is missing.");
    }

    const response = await fetch(
      `${this.getServerUrl()}/api/poker/table/${this.tableId}/exit`,
      {
        method: "POST",

        headers: {
          Authorization: `Bearer ${token}`,

          "Content-Type": "application/json",
        },
      },
    );

    const result = await response.json().catch(() => null);

    if (!response.ok || !result?.success) {
      throw new Error(result?.message || "Unable to exit Poker table.");
    }

    return result;
  },

  async exitPokerTable() {
    if (this.exitPending) {
      return;
    }

    this.exitPending = true;

    this.disableActions();

    this.setRoundStatus("Cash-out in progress…");

    /*
     * Socket connected থাকলে existing
     * real-time Exit flow ব্যবহার হবে।
     */
    if (this.socket?.connected) {
      this.socket.emit(
        "table:exit",
        {
          tableId: this.tableId,
        },
        (response) => {
          if (!response?.success) {
            this.exitPending = false;

            this.setRoundStatus(
              response?.message || "Unable to exit Poker table.",
            );

            this.renderActionControls();

            return;
          }

          this.completePokerExit(response);
        },
      );

      return;
    }

    /*
     * Socket disconnected হলেও HTTP দিয়ে
     * server-side fold + cash-out হবে।
     */
    try {
      const response = await this.exitPokerTableViaHttp();

      this.completePokerExit(response);
    } catch (error) {
      console.error("POKER HTTP EXIT ERROR:", error);

      this.exitPending = false;

      this.setRoundStatus(error.message || "Unable to exit Poker table.");

      this.renderActionControls();
    }
  },

  submitAction(action, amount = null) {
    if (this.actionPending || !this.socket?.connected) {
      return;
    }

    this.actionPending = true;
    this.disableActions();

    this.socket.emit(
      "hand:action",
      {
        tableId: this.tableId,

        action,

        amount,
      },
      (response) => {
        this.actionPending = false;

        if (!response?.success) {
          console.error("Poker action failed:", response);

          this.setRoundStatus(response?.message || "Poker action failed.");

          this.renderActionControls();

          return;
        }

        console.log("✅ Poker action:", response.data);
      },
    );
  },

  startTurnTimer() {
    clearInterval(this.turnTimer);

    document.querySelectorAll(".turn-timer").forEach((timer) => {
      timer.textContent = "15";
    });

    const hand = this.state?.hand;

    if (!hand?.currentTurnPlayerId || !hand?.actionExpiresAt) {
      return;
    }

    const handPlayer = this.state.handPlayers?.find(
      (player) =>
        Number(player.tablePlayerId) === Number(hand.currentTurnPlayerId),
    );

    const seat = handPlayer
      ? this.getSeatElementByServerSeat(handPlayer.seatNo)
      : null;

    const timerElement = seat?.querySelector(".turn-timer");

    const normalized = String(hand.actionExpiresAt).includes("T")
      ? String(hand.actionExpiresAt)
      : String(hand.actionExpiresAt).replace(" ", "T");

    const expiresAt = new Date(normalized).getTime();

    const update = () => {
      const seconds = Math.max(Math.ceil((expiresAt - Date.now()) / 1000), 0);

      if (timerElement) {
        timerElement.textContent = String(seconds);
      }

      if (seconds <= 0) {
        clearInterval(this.turnTimer);
      }
    };

    update();

    this.turnTimer = setInterval(update, 250);
  },

  animateChipToPot(action) {
    if (Number(action?.contribution) <= 0) {
      return;
    }

    const handPlayer = this.state?.handPlayers?.find(
      (player) =>
        Number(player.tablePlayerId) === Number(action.actorTablePlayerId),
    );

    const seat = handPlayer
      ? this.getElement(`playerSeat${handPlayer.seatNo}`)
      : null;

    const pot = this.getElement("potAmount");

    const table = this.getElement("pokerTable");

    if (!seat || !pot || !table) {
      return;
    }

    const tableRect = table.getBoundingClientRect();

    const seatRect = seat.getBoundingClientRect();

    const potRect = pot.getBoundingClientRect();

    const chip = document.createElement("div");

    chip.className = "flying-poker-chip";

    chip.textContent = `৳${this.formatMoney(action.contribution)}`;

    chip.style.left = `${
      seatRect.left - tableRect.left + seatRect.width / 2
    }px`;

    chip.style.top = `${seatRect.top - tableRect.top + seatRect.height / 2}px`;

    chip.style.setProperty(
      "--chip-x",
      `${
        potRect.left - seatRect.left + potRect.width / 2 - seatRect.width / 2
      }px`,
    );

    chip.style.setProperty(
      "--chip-y",
      `${
        potRect.top - seatRect.top + potRect.height / 2 - seatRect.height / 2
      }px`,
    );

    table.appendChild(chip);

    this.playSound("chipThrow", 0.7);

    chip.addEventListener(
      "animationend",
      () => {
        chip.remove();

        this.playSound("chipLand", 0.62);
      },
      {
        once: true,
      },
    );
  },

  animateDealtStreets(streets) {
    if (!Array.isArray(streets)) {
      return;
    }

    streets.forEach((street, streetIndex) => {
      const cards = Array.isArray(street.cards) ? street.cards : [];

      cards.forEach((cardCode, cardIndex) => {
        const finalIndex =
          street.street === "flop"
            ? cardIndex
            : street.street === "turn"
              ? 3
              : 4;

        const cardElement = document.querySelector(
          `.community-card[data-card-index="${finalIndex}"]`,
        );

        window.setTimeout(
          () => {
            if (!cardElement) {
              return;
            }

            this.playSound("cardDeal", 0.62);

            cardElement.classList.add("has-card", "is-revealing");

            cardElement.style.backgroundImage = `url("${this.getCardImagePath(
              cardCode,
            )}")`;

            window.setTimeout(
              () => cardElement.classList.remove("is-revealing"),
              650,
            );
          },
          streetIndex * 450 + cardIndex * 150,
        );
      });
    });
  },

  clearNextHandCountdown() {
    clearInterval(this.nextHandCountdownTimer);

    this.nextHandCountdownTimer = null;
  },

  clearPokerCardsForCountdown() {
    document.querySelectorAll(".community-card").forEach((cardElement) => {
      cardElement.classList.remove("is-revealing");

      this.renderCardFace(cardElement, null);
    });

    document.querySelectorAll(".player-seat").forEach((seat) => {
      seat.classList.remove(
        "is-winner",
        "is-current-turn",
        "is-folded",
        "is-dealer",
        "is-small-blind",
        "is-big-blind",
      );

      seat.querySelectorAll(".hole-card").forEach((cardElement) => {
        cardElement.classList.remove("is-revealing", "is-dealing");

        this.renderCardFace(cardElement, null);
      });

      const betBox = seat.querySelector(".player-bet");

      betBox?.classList.remove("has-bet");
    });
  },

  startNextHandCountdown(payload = {}) {
    clearTimeout(this.showdownRevealTimer);

    clearTimeout(this.winnerOverlayTimer);

    this.showdownRevealTimer = null;

    this.winnerOverlayTimer = null;

    this.clearNextHandCountdown();

    this.clearPokerCardsForCountdown();

    const overlay = this.getElement("winnerOverlay");

    const winnerCard = overlay?.querySelector(".winner-card");

    const crown = winnerCard?.querySelector(".winner-crown");

    const label = winnerCard?.querySelector(":scope > span");

    const winnerName = this.getElement("winnerName");

    const winnerHand = this.getElement("winnerHand");

    const winnerAmount = this.getElement("winnerAmount");

    const button = this.getElement("continueButton");

    if (crown) {
      crown.textContent = "⏳";
    }

    if (label) {
      label.textContent = "NEW ROUND";
    }

    if (winnerName) {
      winnerName.textContent = "Next Hand";
    }

    if (winnerHand) {
      winnerHand.textContent = "Get Ready";
    }

    if (winnerAmount) {
      winnerAmount.textContent = "";
    }

    if (button) {
      button.disabled = true;
    }

    /*
     * Countdown button winner overlay-এর
     * ভিতরে। তাই overlay visible রাখতে হবে।
     */
    overlay?.removeAttribute("hidden");

    const providedStartsAt = new Date(payload.startsAt).getTime();

    const fallbackSeconds = Math.max(1, Number(payload.seconds) || 5);

    const startsAt = Number.isFinite(providedStartsAt)
      ? providedStartsAt
      : Date.now() + fallbackSeconds * 1000;

    const updateCountdown = () => {
      const seconds = Math.max(0, Math.ceil((startsAt - Date.now()) / 1000));

      if (button) {
        button.textContent =
          seconds > 0 ? `Next Hand in ${seconds}` : "Dealing Cards…";
      }

      this.setRoundStatus(
        seconds > 0
          ? `Next hand starts in ${seconds} seconds`
          : "Dealing new Poker cards…",
      );

      if (seconds <= 0) {
        this.clearNextHandCountdown();
      }
    };

    updateCountdown();

    this.nextHandCountdownTimer = window.setInterval(updateCountdown, 200);
  },

  handleHandCompleted(settlement) {
    const winners = Array.isArray(settlement?.winners)
      ? settlement.winners
      : [];

    const showdownPlayers = Array.isArray(settlement?.showdownPlayers)
      ? settlement.showdownPlayers
      : [];

    if (winners.length === 0) {
      return;
    }

    clearInterval(this.turnTimer);

    this.disableActions();

    this.clearNextHandCountdown();

    clearTimeout(this.showdownRevealTimer);

    clearTimeout(this.winnerOverlayTimer);

    this.showdownRevealTimer = null;

    this.winnerOverlayTimer = null;

    const overlay = this.getElement("winnerOverlay");

    /*
     * প্রথম দুই সেকেন্ড overlay থাকবে না।
     * Table-এর উপর showdown cards দেখা যাবে।
     */
    overlay?.setAttribute("hidden", "");

    document.querySelectorAll(".player-seat").forEach((seat) => {
      seat.classList.remove("is-winner");
    });

    this.revealShowdownCards(showdownPlayers, winners);

    winners.forEach((winner) => {
      this.animatePotToWinner(winner);
    });

    this.setRoundStatus(
      showdownPlayers.length > 1 ? "Showdown" : "Hand completed",
    );

    /*
     * Showdown cards দুই সেকেন্ড দেখানোর
     * পরে winner overlay আসবে।
     */
    this.showdownRevealTimer = window.setTimeout(() => {
      this.showdownRevealTimer = null;

      const crown = overlay?.querySelector(".winner-crown");

      const label = overlay?.querySelector(".winner-card > span");

      if (crown) {
        crown.textContent = "👑";
      }

      if (label) {
        label.textContent = "HAND WINNER";
      }

      this.showWinnerOverlay(settlement, winners);

      /*
       * সাধারণত server-এর countdown event
       * এই timer-এর আগেই overlay-কে
       * countdown screen-এ বদলে দেবে।
       *
       * Next hand না হলে এটি fallback hide।
       */
      this.winnerOverlayTimer = window.setTimeout(() => {
        this.getElement("winnerOverlay")?.setAttribute("hidden", "");

        this.winnerOverlayTimer = null;
      }, 2500);
    }, 2000);
  },

  revealShowdownCards(showdownPlayers, winners) {
    const winnerPlayerIds = new Set(
      winners.map((winner) => Number(winner.tablePlayerId)),
    );

    showdownPlayers.forEach((player) => {
      const cards = Array.isArray(player.holeCards) ? player.holeCards : [];

      if (cards.length !== 2) {
        return;
      }

      const seat = this.getSeatElementByServerSeat(player.seatNo);

      if (!seat) {
        return;
      }

      const isWinner = winnerPlayerIds.has(Number(player.tablePlayerId));

      seat.classList.toggle("is-winner", isWinner);

      seat.querySelectorAll(".hole-card").forEach((cardElement, index) => {
        const cardCode = cards[index];

        if (!cardCode) {
          this.renderCardFace(cardElement, null);

          return;
        }

        this.renderCardFace(cardElement, cardCode);

        cardElement.classList.add("is-revealing");
      });
    });
  },

  revealWinnerCards(winner) {
    const cards = Array.isArray(winner.holeCards) ? winner.holeCards : [];

    if (cards.length !== 2) {
      return;
    }

    const seat = this.getSeatElementByServerSeat(winner.seatNo);

    if (!seat) {
      return;
    }

    seat.classList.add("is-winner");

    seat.querySelectorAll(".hole-card").forEach((cardElement, index) => {
      const cardCode = cards[index];

      if (!cardCode) {
        this.renderCardFace(cardElement, null);

        return;
      }

      /*
       * একই renderer ব্যবহার করায়
       * dataset এবং background synchronized থাকবে।
       */
      this.renderCardFace(cardElement, cardCode);

      cardElement.classList.add("is-revealing");
    });
  },

  animatePotToWinner(winner) {
    const table = this.getElement("pokerTable");

    const pot = this.getElement("potAmount");

    const seat = this.getSeatElementByServerSeat(winner.seatNo);

    if (!table || !pot || !seat) {
      return;
    }

    const tableRect = table.getBoundingClientRect();

    const potRect = pot.getBoundingClientRect();

    const seatRect = seat.getBoundingClientRect();

    for (let index = 0; index < 5; index += 1) {
      window.setTimeout(() => {
        const chip = document.createElement("div");

        chip.className = "winner-poker-chip";

        chip.style.left = `${
          potRect.left - tableRect.left + potRect.width / 2
        }px`;

        chip.style.top = `${
          potRect.top - tableRect.top + potRect.height / 2
        }px`;

        chip.style.setProperty(
          "--winner-chip-x",
          `${
            seatRect.left -
            potRect.left +
            seatRect.width / 2 -
            potRect.width / 2
          }px`,
        );

        chip.style.setProperty(
          "--winner-chip-y",
          `${
            seatRect.top -
            potRect.top +
            seatRect.height / 2 -
            potRect.height / 2
          }px`,
        );

        table.appendChild(chip);

        chip.addEventListener("animationend", () => chip.remove(), {
          once: true,
        });
      }, index * 100);
    }
  },

  showWinnerOverlay(settlement, winners) {
    const overlay = this.getElement("winnerOverlay");

    const winnerName = this.getElement("winnerName");

    const winnerHand = this.getElement("winnerHand");

    const winnerAmount = this.getElement("winnerAmount");

    const winner = winners[0];

    const player = this.state?.players?.find(
      (item) => Number(item.id) === Number(winner.tablePlayerId),
    );

    if (winnerName) {
      winnerName.textContent =
        winners.length > 1
          ? `${winners.length} Split Winners`
          : player?.name || (winner.isBot ? "Poker Bot" : "Player");
    }

    if (winnerHand) {
      winnerHand.textContent = winner.handRankName || "Winner";
    }

    const totalPrize = winners.reduce(
      (total, item) => total + Number(item.prizeAmount || 0),
      0,
    );

    if (winnerAmount) {
      winnerAmount.textContent = `+৳${this.formatMoney(totalPrize)}`;
    }

    overlay?.removeAttribute("hidden");

    this.setRoundStatus(
      `Hand completed • Service charge ৳${this.formatMoney(
        settlement.serviceChargeAmount,
      )}`,
    );
  },

  animateInitialDeal() {
    const handId = Number(this.state?.hand?.id);

    if (!handId || this.lastAnimatedHandId === handId) {
      return;
    }

    this.lastAnimatedHandId = handId;

    const occupiedSeats = Array.from(
      document.querySelectorAll(".player-seat:not(.is-empty)"),
    );

    let delay = 0;

    for (let round = 0; round < 2; round += 1) {
      occupiedSeats.forEach((seat) => {
        const card = seat.querySelectorAll(".hole-card")[round];

        if (!card) {
          return;
        }

        card.classList.remove("is-dealing");

        window.setTimeout(() => {
          this.playSound("cardDeal", 0.58);

          card.classList.add("is-dealing");

          window.setTimeout(() => card.classList.remove("is-dealing"), 550);
        }, delay);

        delay += 120;
      });
    }
  },

  renderHeader() {
    const table = this.state.table;

    const blindInfo = this.getElement("blindInfo");

    const tableCode = this.getElement("tableCode");

    const handNumber = this.getElement("handNumber");

    const walletBalance = this.getElement("walletBalance");

    const me = this.getMe();

    if (blindInfo) {
      blindInfo.textContent = `Blinds: ৳${this.formatMoney(
        table.smallBlind,
      )} / ৳${this.formatMoney(table.bigBlind)}`;
    }

    if (tableCode) {
      tableCode.textContent = `Table: ${table.tableCode || table.id}`;
    }

    if (handNumber) {
      handNumber.textContent = `Hand #${Number(table.currentHandNumber || 0)}`;
    }

    if (walletBalance) {
      walletBalance.textContent = `৳${this.formatMoney(me?.walletBalance)}`;
    }
  },

  resetSeat(seat) {
    seat.classList.add("is-empty");

    seat.classList.remove(
      "is-current-turn",
      "is-folded",
      "is-winner",
      "is-dealer",
      "is-small-blind",
      "is-big-blind",
    );

    const name = seat.querySelector(".player-name");

    const stack = seat.querySelector(".player-stack");

    const action = seat.querySelector(".player-action");

    if (name) {
      name.textContent = "Waiting…";
    }

    if (stack) {
      stack.textContent = "৳0.00";
    }

    if (action) {
      action.textContent = "EMPTY";
    }
  },

  renderPlayers() {
    for (let visualSeatNo = 1; visualSeatNo <= 5; visualSeatNo += 1) {
      const seat = this.getElement(`playerSeat${visualSeatNo}`);

      if (!seat) {
        continue;
      }

      const serverSeatNo = this.getServerSeatNoForVisualSeat(visualSeatNo);

      const player = this.state.players.find(
        (item) => Number(item.seatNo) === Number(serverSeatNo),
      );

      seat.dataset.serverSeatNo = String(serverSeatNo || "");

      if (!player) {
        this.resetSeat(seat);

        continue;
      }

      seat.classList.remove("is-empty");

      const name = seat.querySelector(".player-name");

      const stack = seat.querySelector(".player-stack");

      const action = seat.querySelector(".player-action");

      const avatar = seat.querySelector(".player-avatar img");

      if (name) {
        name.textContent =
          player.name ||
          (player.isBot ? "Poker Bot" : `Player ${serverSeatNo}`);
      }

      if (stack) {
        stack.textContent = `৳${this.formatMoney(player.stackAmount)}`;
      }

      if (action) {
        action.textContent = player.isBot
          ? "BOT"
          : Number(player.id) === Number(this.tablePlayerId)
            ? "YOU"
            : String(player.status || "PLAYER").toUpperCase();
      }

      this.renderAvatar(avatar, player);
    }
  },

  renderAvatar(avatar, player) {
    if (!avatar) {
      return;
    }

    const fallbackPath = "../assets/images/default-avatar.png";

    const rawUrl = String(player.avatarUrl || "").trim();

    let avatarUrl = fallbackPath;

    if (rawUrl) {
      if (/^https?:\/\//i.test(rawUrl) || rawUrl.startsWith("/")) {
        avatarUrl = rawUrl;
      } else {
        avatarUrl = rawUrl.startsWith("assets/")
          ? `../${rawUrl}`
          : `../assets/images/avatars/${rawUrl}`;
      }
    }

    /*
     * একই image প্রত্যেক state update-এ
     * আবার load করা হবে না।
     */
    if (avatar.dataset.avatarSource === avatarUrl) {
      return;
    }

    avatar.dataset.avatarSource = avatarUrl;

    avatar.onerror = () => {
      avatar.onerror = null;

      avatar.dataset.avatarSource = fallbackPath;

      if (avatar.getAttribute("src") !== fallbackPath) {
        avatar.setAttribute("src", fallbackPath);
      }
    };

    avatar.setAttribute("src", avatarUrl);
  },

  renderTableStatus() {
    const status = this.state.table.status;

    const me = this.getMe();

    if (me?.status === "sitting_out" && Number(me.stackAmount || 0) <= 0) {
      this.setRoundStatus(
        "Your Poker chips are finished • Exit and select a new buy-in",
      );

      this.disableActions();

      return;
    }

    if (status === "waiting") {
      this.setRoundStatus("Waiting for Poker players…");
    } else if (status === "starting") {
      this.setRoundStatus("Players ready • Preparing first hand…");

      this.hideMatchmaking();
    } else if (status === "playing") {
      this.setRoundStatus("Poker hand in progress");

      this.hideMatchmaking();
    } else if (status === "paused") {
      this.setRoundStatus("Poker table paused");
    } else {
      this.setRoundStatus("Poker table closed");
    }

    this.disableActions();
  },

  renderMatchmaking() {
    if (this.state.table.status !== "waiting") {
      this.hideMatchmaking();

      return;
    }

    const overlay = this.getElement("matchmakingOverlay");

    const playerCount = this.getElement("joinedPlayerCount");

    const message = this.getElement("matchmakingMessage");

    overlay?.removeAttribute("hidden");

    if (playerCount) {
      playerCount.textContent = String(
        this.state.players.filter((player) => !player.isBot).length,
      );
    }

    if (message) {
      message.textContent = "Waiting for real players…";
    }

    this.startMatchmakingTimer();
  },

  startMatchmakingTimer() {
    clearInterval(this.matchmakingTimer);

    const timer = this.getElement("matchmakingTimer");

    const rawExpiresAt = String(this.state.table.matchmakingExpiresAt || "");

    const normalizedExpiresAt = rawExpiresAt.includes("T")
      ? rawExpiresAt
      : rawExpiresAt.replace(" ", "T");

    const expiresAt = new Date(normalizedExpiresAt).getTime();

    const update = () => {
      const seconds = Number.isFinite(expiresAt)
        ? Math.max(Math.ceil((expiresAt - Date.now()) / 1000), 0)
        : 20;

      if (timer) {
        timer.textContent = String(seconds);
      }

      if (seconds <= 0) {
        clearInterval(this.matchmakingTimer);
      }
    };

    update();

    this.matchmakingTimer = setInterval(update, 250);
  },

  hideMatchmaking() {
    clearInterval(this.matchmakingTimer);

    this.getElement("matchmakingOverlay")?.setAttribute("hidden", "");
  },

  setConnection(message, connected) {
    const text = this.getElement("connectionText");

    const dot = this.getElement("connectionDot");

    if (text) {
      text.textContent = message;
    }

    dot?.classList.toggle("is-connected", Boolean(connected));
  },

  setRoundStatus(message) {
    const status = this.getElement("roundStatus");

    if (status) {
      status.textContent = message;
    }
  },

  disableActions() {
    [
      "foldButton",
      "checkCallButton",
      "raiseButton",
      "allInButton",
      "raiseSlider",
    ].forEach((id) => {
      const control = this.getElement(id);

      if (control) {
        control.disabled = true;
      }
    });
  },
};

window.POKER_GAME = POKER_GAME;

const initializePokerGame = () => {
  POKER_GAME.initialize();

  console.log("✅ PMS ADDA glossy Poker table loaded");
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializePokerGame, {
    once: true,
  });
} else {
  initializePokerGame();
}
