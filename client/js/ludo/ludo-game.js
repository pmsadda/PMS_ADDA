"use strict";

/* ==========================================
   PMS ADDA LUDO
   Glossy Board Generator
========================================== */

const LUDO_DESIGN = {
  boardSize: 15,

  safeCells: new Set([
    "6-1",
    "8-2",
    "1-8",
    "2-6",
    "6-12",
    "8-13",
    "12-8",
    "13-6",
  ]),

  startCells: {
    "6-1": "red",
    "1-8": "green",
    "8-13": "yellow",
    "13-6": "blue",
  },

  homeAreas: [
    {
      color: "red",
      row: 0,
      column: 0,
    },
    {
      color: "green",
      row: 0,
      column: 9,
    },
    {
      color: "blue",
      row: 9,
      column: 0,
    },
    {
      color: "yellow",
      row: 9,
      column: 9,
    },
  ],

  initialize() {
    this.createBoard();
    this.initializeAvatarFallbacks();
    this.initializeButtons();
  },

  isInsideArea(row, column, startRow, startColumn, size) {
    return (
      row >= startRow &&
      row < startRow + size &&
      column >= startColumn &&
      column < startColumn + size
    );
  },

  isHomeArea(row, column) {
    return this.homeAreas.some((area) =>
      this.isInsideArea(row, column, area.row, area.column, 6),
    );
  },

  isCenterArea(row, column) {
    return this.isInsideArea(row, column, 6, 6, 3);
  },

  getHomePathColor(row, column) {
    /*
     * Red home path।
     */
    if (row === 7 && column >= 1 && column <= 5) {
      return "red";
    }

    /*
     * Green home path।
     */
    if (column === 7 && row >= 1 && row <= 5) {
      return "green";
    }

    /*
     * Yellow home path।
     */
    if (row === 7 && column >= 9 && column <= 13) {
      return "yellow";
    }

    /*
     * Blue home path।
     */
    if (column === 7 && row >= 9 && row <= 13) {
      return "blue";
    }

    return null;
  },

  createHomeArea(area) {
    const home = document.createElement("section");

    home.className = `home-yard home-${area.color}`;

    home.dataset.color = area.color;

    home.style.gridRow = `${area.row + 1} / span 6`;

    home.style.gridColumn = `${area.column + 1} / span 6`;

    for (let pawnNumber = 1; pawnNumber <= 4; pawnNumber += 1) {
      const slot = document.createElement("div");

      slot.className = "yard-slot";

      slot.dataset.color = area.color;

      slot.dataset.pawnNumber = String(pawnNumber);

      home.appendChild(slot);
    }

    return home;
  },

  createCenterArea() {
    const center = document.createElement("section");

    center.className = "board-center";

    center.style.gridRow = "7 / span 3";
    center.style.gridColumn = "7 / span 3";

    ["red", "green", "yellow", "blue"].forEach((color) => {
      const triangle = document.createElement("span");

      triangle.className = `center-triangle center-${color}`;

      center.appendChild(triangle);
    });

    return center;
  },

  createBoardCell(row, column) {
    const coordinate = `${row}-${column}`;

    const cell = document.createElement("div");

    cell.className = "board-cell";

    cell.dataset.row = String(row);
    cell.dataset.column = String(column);
    cell.dataset.coordinate = coordinate;

    cell.style.gridRow = String(row + 1);

    cell.style.gridColumn = String(column + 1);

    const homePathColor = this.getHomePathColor(row, column);

    const startColor = this.startCells[coordinate];

    if (homePathColor) {
      cell.classList.add(`cell-${homePathColor}`, "is-home-path");
    }

    if (startColor) {
      cell.classList.add(`cell-${startColor}`, "is-start");
    }

    if (this.safeCells.has(coordinate)) {
      cell.classList.add("is-safe");
    }

    return cell;
  },

  createBoard() {
    const boardGrid = document.getElementById("boardGrid");

    if (!boardGrid) {
      console.error("Ludo board grid was not found.");

      return;
    }

    boardGrid.replaceChildren();

    /*
     * চারটি home yard।
     */
    this.homeAreas.forEach((area) => {
      boardGrid.appendChild(this.createHomeArea(area));
    });

    /*
     * 15 × 15 movement cells।
     */
    for (let row = 0; row < this.boardSize; row += 1) {
      for (let column = 0; column < this.boardSize; column += 1) {
        if (this.isHomeArea(row, column) || this.isCenterArea(row, column)) {
          continue;
        }

        boardGrid.appendChild(this.createBoardCell(row, column));
      }
    }

    boardGrid.appendChild(this.createCenterArea());

    console.log("✅ Glossy Ludo board created.");
  },

  initializeAvatarFallbacks() {
    const avatarData = [
      {
        id: "playerAvatarRed",
        color: "red",
        letter: "R",
      },
      {
        id: "playerAvatarGreen",
        color: "green",
        letter: "G",
      },
      {
        id: "playerAvatarYellow",
        color: "yellow",
        letter: "Y",
      },
      {
        id: "playerAvatarBlue",
        color: "blue",
        letter: "B",
      },
    ];

    avatarData.forEach((item) => {
      const image = document.getElementById(item.id);

      if (!image) {
        return;
      }

      const avatar = image.closest(".player-avatar");

      if (!avatar) {
        return;
      }

      const showFallback = () => {
        image.hidden = true;

        avatar.classList.add("has-fallback-avatar");

        avatar.dataset.letter = item.letter;

        avatar.dataset.avatarColor = item.color;
      };

      image.addEventListener("error", showFallback, {
        once: true,
      });

      if (image.complete && image.naturalWidth === 0) {
        showFallback();
      }
    });
  },

  initializeButtons() {
    const backButton = document.getElementById("backButton");

    const exitButton = document.getElementById("exitButton");

    const returnLobbyButton = document.getElementById("returnLobbyButton");

    const goToLobby = () => {
      window.location.href = "lobby.html";
    };

    backButton?.addEventListener("click", goToLobby);

    exitButton?.addEventListener("click", goToLobby);

    returnLobbyButton?.addEventListener("click", goToLobby);
  },
};

/* ==========================================
   LIVE MULTIPLAYER CONTROLLER
========================================== */

const LUDO_LIVE = {
  socket: null,
  state: null,
  matchId: null,
  currentUserId: null,
  matchPlayerId: null,
  rolling: false,
  moving: false,
  diceAnimating: false,
  diceAnimationTimer: null,
  countdownInterval: null,
  turnTimerInterval: null,
  singlePawnAutoMoveTimer: null,
  singlePawnAutoMoveKey: null,

  diceFaces: {
    1: "⚀",
    2: "⚁",
    3: "⚂",
    4: "⚃",
    5: "⚄",
    6: "⚅",
  },

  colors: ["red", "green", "yellow", "blue"],

  getElement(id) {
    return document.getElementById(id);
  },

  formatMoney(value) {
    return `৳${Number(value || 0).toFixed(2)}`;
  },

  parseDate(value) {
    if (!value) {
      return null;
    }

    const normalized = String(value).includes("T")
      ? String(value)
      : String(value).replace(" ", "T");

    const timestamp = new Date(normalized).getTime();

    return Number.isFinite(timestamp) ? timestamp : null;
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
      console.error("Unable to decode login token:", error);

      return null;
    }
  },

  resolveMatchId() {
    const query = new URLSearchParams(window.location.search);

    const queryMatchId = Number(query.get("matchId"));

    if (Number.isInteger(queryMatchId) && queryMatchId > 0) {
      return queryMatchId;
    }

    try {
      const stored = JSON.parse(
        localStorage.getItem("current_ludo_table") || "null",
      );

      const storedMatchId = Number(stored?.matchId || stored?.id);

      return Number.isInteger(storedMatchId) && storedMatchId > 0
        ? storedMatchId
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

  getCurrentTurnPlayer() {
    const currentTurnPlayerId = Number(
      this.state?.gameState?.currentTurnPlayerId,
    );

    return (
      this.state?.players?.find(
        (player) => Number(player.id) === currentTurnPlayerId,
      ) || null
    );
  },

  setLiveStatus(text, connected) {
    const statusText = this.getElement("liveStatusText");

    const statusDot = this.getElement("liveStatusDot");

    if (statusText) {
      statusText.textContent = text;
    }

    statusDot?.classList.toggle("is-connected", Boolean(connected));
  },

  setMessage(message) {
    const turnStatus = this.getElement("turnStatus");

    if (turnStatus) {
      turnStatus.textContent = message;
    }
  },

  initialize() {
    const token = localStorage.getItem("access_token");

    this.matchId = this.resolveMatchId();

    this.currentUserId = this.decodeUserId(token || "");

    if (!token) {
      window.location.replace("login.html");

      return;
    }

    if (!this.matchId) {
      this.setLiveStatus("Match information missing", false);

      this.setMessage("Please enter through a Ludo room.");

      return;
    }

    if (typeof window.io !== "function") {
      this.setLiveStatus("Socket.IO unavailable", false);

      return;
    }

    this.initializeControls();
    this.connectSocket(token);
  },

  initializeControls() {
    this.getElement("diceButton")?.addEventListener("click", () => {
      this.rollDice();
    });

    const leaveMatch = () => {
      this.leaveMatch();
    };

    this.getElement("backButton")?.addEventListener("click", leaveMatch);

    this.getElement("exitButton")?.addEventListener("click", leaveMatch);

    this.getElement("returnLobbyButton")?.addEventListener("click", leaveMatch);
  },

  connectSocket(token) {
    this.setLiveStatus("Connecting…", false);

    this.socket = window.io(`${this.getServerUrl()}/ludo`, {
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
      console.log("✅ Ludo socket connected:", this.socket.id);

      this.setLiveStatus("Connected", true);

      this.joinMatch();
    });

    this.socket.on("connect_error", (error) => {
      console.error("Ludo socket connection error:", error);

      this.setLiveStatus(error.message || "Connection failed", false);

      this.setMessage(error.message || "Unable to connect.");
    });

    this.socket.on("disconnect", () => {
      this.setLiveStatus("Reconnecting…", false);

      this.disableDice();
    });

    this.socket.on("match:state", (state) => {
      this.applyMatchState(state);
    });

    this.socket.on("matchmaking:completed", () => {
      this.hideMatchmaking();
    });

    this.socket.on("dice:rolled", (result) => {
      const value = Number(result?.value);

      if (Number.isInteger(value) && value >= 1 && value <= 6) {
        this.animateDice(value);
      }
    });

    this.socket.on("pawn:moved", () => {
      this.moving = false;
    });

    this.socket.on("match:completed", () => {
      if (this.state) {
        this.showWinner();
      }
    });

    this.socket.on("match:error", (error) => {
      console.error("Ludo match error:", error);

      clearTimeout(this.singlePawnAutoMoveTimer);

      this.singlePawnAutoMoveTimer = null;

      this.rolling = false;
      this.moving = false;

      this.setMessage(error?.message || "Ludo match error.");

      this.renderPawns();
      this.updateDiceButton();
    });

    this.socket.on("match:player-disconnected", () => {
      this.setLiveStatus("Player reconnecting…", true);
    });
  },

  joinMatch() {
    this.socket.emit(
      "match:join",
      {
        matchId: this.matchId,
      },
      (response) => {
        if (!response?.success) {
          console.error("Ludo join failed:", response);

          this.setMessage(response?.message || "Unable to join match.");

          return;
        }

        this.matchPlayerId = Number(response.data?.matchPlayerId);

        console.log("✅ Ludo match joined:", response.data);
      },
    );
  },

  applyMatchState(state) {
    if (
      !state?.match ||
      !Array.isArray(state.players) ||
      !Array.isArray(state.pawns)
    ) {
      console.error("Invalid Ludo match state:", state);

      return;
    }

    this.state = state;

    if (!this.diceAnimating) {
      this.rolling = false;
    }

    this.moving = false;

    const me = this.getMe();

    if (me) {
      this.matchPlayerId = Number(me.id);
    }

    this.renderMatchHeader();
    this.renderPlayers();
    this.renderPawns();
    this.renderMatchmaking();
    this.renderTurn();
    this.renderDice();
    this.showWinner();
    this.scheduleSinglePawnAutoMove();
  },

  renderMatchHeader() {
    const match = this.state.match;

    const entryAmount = this.getElement("entryAmount");

    const playerMode = this.getElement("playerMode");

    const matchCode = this.getElement("matchCode");

    const wallet = this.getElement("walletBalance");

    const me = this.getMe();

    if (entryAmount) {
      entryAmount.textContent = `Entry: ${this.formatMoney(match.entryAmount)}`;
    }

    if (playerMode) {
      playerMode.textContent = `Players: ${Number(
        match.playerMode || match.requiredPlayers || 2,
      )}`;
    }

    if (matchCode) {
      matchCode.textContent = `Match: ${match.matchCode || match.id}`;
    }

    if (wallet) {
      wallet.textContent = this.formatMoney(me?.walletBalance);
    }
  },

renderPlayers() {
  const me = this.getMe();

  /*
   * Local player সবসময় bottom-left।
   *
   * Clockwise visual slots:
   * 0 = bottom-left
   * 1 = top-left
   * 2 = top-right
   * 3 = bottom-right
   */
  const perspectiveSlots = [
    "view-bottom-left",
    "view-top-left",
    "view-top-right",
    "view-bottom-right",
  ];

  /*
   * এই color order board-এর clockwise order:
   *
   * Red    → top-left
   * Green  → top-right
   * Yellow → bottom-right
   * Blue   → bottom-left
   */
  const localColor = String(
    me?.color || "",
  ).toLowerCase();

  const localColorIndex =
    this.colors.indexOf(localColor);

  const playerMode = Number(
    this.state?.match?.playerMode ||
      this.state?.match?.requestedPlayerMode ||
      this.state?.match?.requiredPlayers ||
      2,
  );

  const isTwoPlayerMode =
    playerMode === 2;

  const isFourPlayerMode =
    playerMode === 4;

  /*
   * Local player পাওয়া গেলে 2-player এবং
   * 4-player উভয় mode-এ perspective ব্যবহার হবে।
   */
  const useLocalPerspective =
    localColorIndex >= 0;

  const gameStage =
    document.querySelector(
      ".game-stage",
    );

  if (gameStage) {
    gameStage.classList.toggle(
      "is-two-player-mode",
      isTwoPlayerMode,
    );

    gameStage.classList.toggle(
      "is-four-player-mode",
      isFourPlayerMode,
    );

    gameStage.classList.toggle(
      "has-local-perspective",
      useLocalPerspective,
    );

    /*
     * CSS এই value ব্যবহার করে board rotate করবে।
     */
    gameStage.dataset.localColor =
      useLocalPerspective
        ? localColor
        : "";
  }

  this.colors.forEach((color) => {
    const suffix =
      color.charAt(0).toUpperCase() +
      color.slice(1);

    const panel =
      this.getElement(
        `playerPanel${suffix}`,
      );

    const name =
      this.getElement(
        `playerName${suffix}`,
      );

    const balance =
      this.getElement(
        `playerBalance${suffix}`,
      );

    const avatar =
      this.getElement(
        `playerAvatar${suffix}`,
      );

    const player =
      this.state.players.find(
        (item) =>
          String(
            item.color || "",
          ).toLowerCase() === color,
      );

    panel?.classList.remove(
      ...perspectiveSlots,
      "is-local-player",
      "is-bot-player",
    );

    panel?.classList.toggle(
      "is-empty",
      !player,
    );

    panel?.classList.toggle(
      "is-online",
      Boolean(player),
    );

    if (!player) {
      if (name) {
        name.textContent =
          "Waiting…";
      }

      if (balance) {
        balance.hidden = false;

        balance.textContent =
          "৳0.00";
      }

      return;
    }

    /*
     * Local color থেকে clockwise distance
     * হিসাব করে visual slot নির্ধারণ।
     *
     * এতে প্রত্যেক real user নিজের screen-এ
     * নিজের panel bottom-left-এ দেখবে।
     */
    if (
      panel &&
      useLocalPerspective
    ) {
      const playerColorIndex =
        this.colors.indexOf(
          color,
        );

      const relativePosition =
        (
          playerColorIndex -
          localColorIndex +
          this.colors.length
        ) %
        this.colors.length;

      panel.classList.add(
        perspectiveSlots[
          relativePosition
        ],
      );
    }

    const isLocalPlayer =
      Number(player.id) ===
      Number(me?.id);

    panel?.classList.toggle(
      "is-local-player",
      isLocalPlayer,
    );

    panel?.classList.toggle(
      "is-bot-player",
      Boolean(player.isBot),
    );

    if (name) {
      /*
       * Bot-এর আসল নাম থাকবে।
       * কোথাও BOT label দেখানো হবে না।
       */
      name.textContent =
        player.fullName ||
        player.name ||
        player.username ||
        `Player ${player.seatNo}`;
    }

    if (balance) {
      /*
       * Real এবং bot—সব player-এর
       * current wallet balance দেখা যাবে।
       */
      balance.hidden = false;

      balance.textContent =
        this.formatMoney(
          player.walletBalance ??
          player.balance ??
          player.endingBalance ??
          0,
        );
    }

    if (!avatar) {
      return;
    }

    const avatarWrapper =
      avatar.closest(
        ".player-avatar",
      );

    const playerInitial =
      (
        player.fullName ||
        player.name ||
        player.username ||
        color
      )
        .charAt(0)
        .toUpperCase();

    const showAvatarFallback = () => {
      avatar.hidden = true;

      avatarWrapper?.classList.add(
        "has-fallback-avatar",
      );

      if (avatarWrapper) {
        avatarWrapper.dataset.letter =
          playerInitial;
      }
    };

    const rawAvatarUrl =
      String(
        player.avatarUrl || "",
      ).trim();

    if (!rawAvatarUrl) {
      showAvatarFallback();

      return;
    }

    let avatarUrl =
      rawAvatarUrl;

    if (
      !/^https?:\/\//i.test(
        rawAvatarUrl,
      ) &&
      !rawAvatarUrl.startsWith("/")
    ) {
      avatarUrl =
        rawAvatarUrl.startsWith(
          "assets/",
        )
          ? `../${rawAvatarUrl}`
          : `../assets/images/avatars/${rawAvatarUrl}`;
    }

    const absoluteAvatarUrl =
      new URL(
        avatarUrl,
        window.location.href,
      ).href;

    avatar.onerror = () => {
      avatar.dataset.failedSrc =
        absoluteAvatarUrl;

      showAvatarFallback();
    };

    if (
      avatar.dataset.failedSrc ===
      absoluteAvatarUrl
    ) {
      showAvatarFallback();

      return;
    }

    avatarWrapper?.classList.remove(
      "has-fallback-avatar",
    );

    avatar.hidden = false;

    if (
      avatar.src !==
      absoluteAvatarUrl
    ) {
      avatar.src =
        absoluteAvatarUrl;
    }
  });
},

  renderMatchmaking() {
    const match = this.state.match;

    if (match.status !== "waiting") {
      this.hideMatchmaking();

      return;
    }

    const overlay = this.getElement("matchmakingOverlay");

    const joined = this.getElement("joinedPlayers");

    const maximum = this.getElement("maximumPlayers");

    const message = this.getElement("matchmakingMessage");

    overlay?.removeAttribute("hidden");

    if (joined) {
      joined.textContent = String(this.state.players.length);
    }

    if (maximum) {
      maximum.textContent = String(
        Number(
          match.requestedPlayerMode ||
            match.playerMode ||
            match.requiredPlayers ||
            2,
        ),
      );
    }

    if (message) {
      message.textContent = "Waiting for real players…";
    }

    this.startMatchmakingTimer();
  },

  startMatchmakingTimer() {
    clearInterval(this.countdownInterval);

    const timer = this.getElement("matchmakingTimer");

    const expiresAt = this.parseDate(this.state.match.matchmakingExpiresAt);

    const update = () => {
      const seconds = expiresAt
        ? Math.max(Math.ceil((expiresAt - Date.now()) / 1000), 0)
        : 0;

      if (timer) {
        timer.textContent = String(seconds);
      }

      if (seconds <= 0) {
        clearInterval(this.countdownInterval);
      }
    };

    update();

    this.countdownInterval = setInterval(update, 250);
  },

  hideMatchmaking() {
    clearInterval(this.countdownInterval);

    this.getElement("matchmakingOverlay")?.setAttribute("hidden", "");
  },

  renderTurn() {
    clearInterval(this.turnTimerInterval);

    const match = this.state.match;

    const gameState = this.state.gameState;

    this.colors.forEach((color) => {
      const suffix = color.charAt(0).toUpperCase() + color.slice(1);

      this.getElement(`playerPanel${suffix}`)?.classList.remove(
        "is-active-turn",
      );
    });

    if (match.status !== "playing" || !gameState) {
      this.setMessage(
        match.status === "waiting"
          ? "Waiting for players…"
          : "Preparing match…",
      );

      this.disableDice();

      return;
    }

    const currentPlayer = this.getCurrentTurnPlayer();

    if (!currentPlayer) {
      this.setMessage("Updating turn…");

      this.disableDice();

      return;
    }

    const suffix =
      currentPlayer.color.charAt(0).toUpperCase() +
      currentPlayer.color.slice(1);

    this.getElement(`playerPanel${suffix}`)?.classList.add("is-active-turn");

    const isMyTurn = Number(currentPlayer.id) === Number(this.matchPlayerId);

    this.setMessage(
      isMyTurn ? "Your turn" : `${currentPlayer.fullName || "Player"}'s turn`,
    );

    this.startTurnTimer(currentPlayer.color, gameState.turnExpiresAt);

    this.updateDiceButton();
  },

  startTurnTimer(color, expiresAtValue) {
    const suffix = color.charAt(0).toUpperCase() + color.slice(1);

    const timer = this.getElement(`turnTimer${suffix}`);

    const expiresAt = this.parseDate(expiresAtValue);

    const duration = Number(this.state?.gameState?.turnDurationSeconds || 15);

    const update = () => {
      const seconds = expiresAt
        ? Math.max(Math.ceil((expiresAt - Date.now()) / 1000), 0)
        : duration;

      if (timer) {
        timer.textContent = String(seconds);
      }

      if (seconds <= 0) {
        clearInterval(this.turnTimerInterval);
      }
    };

    update();

    this.turnTimerInterval = setInterval(update, 250);
  },

  disableDice() {
    const button = this.getElement("diceButton");

    if (button) {
      button.disabled = true;
    }
  },

  updateDiceButton() {
    const button = this.getElement("diceButton");

    const hint = this.getElement("diceHint");

    const currentPlayer = this.getCurrentTurnPlayer();

    const gameState = this.state?.gameState;

    const isMyTurn = Number(currentPlayer?.id) === Number(this.matchPlayerId);

    const canRoll =
      this.socket?.connected &&
      this.state?.match?.status === "playing" &&
      isMyTurn &&
      !gameState?.diceRolled &&
      !this.rolling &&
      !this.moving;

    if (button) {
      button.disabled = !canRoll;
    }

    if (hint) {
      const movablePawnCount = this.getMovablePawnNumbers().size;

      hint.textContent = canRoll
        ? "TAP TO ROLL"
        : isMyTurn && gameState?.diceRolled && movablePawnCount === 1
          ? "AUTO MOVE"
          : isMyTurn && gameState?.diceRolled
            ? "SELECT PAWN"
            : "WAIT";
    }
  },

  renderDice() {
    if (this.diceAnimating) {
      return;
    }

    const value = Number(this.state?.gameState?.diceValue);

    this.showDice(value >= 1 && value <= 6 ? value : null);

    this.updateDiceButton();
  },

  animateDice(finalValue) {
    const face = this.getElement("diceFace");

    if (!face || this.diceAnimating) {
      this.showDice(finalValue);
      this.rolling = false;
      this.updateDiceButton();

      return;
    }

    this.diceAnimating = true;

    face.classList.add("is-rolling");

    clearInterval(this.diceAnimationTimer);

    let changes = 0;

    this.diceAnimationTimer = setInterval(() => {
      const randomValue = Math.floor(Math.random() * 6) + 1;

      this.showDice(randomValue);

      changes += 1;

      if (changes >= 10) {
        clearInterval(this.diceAnimationTimer);

        face.classList.remove("is-rolling");

        this.showDice(finalValue);

        this.diceAnimating = false;

        this.rolling = false;

        this.updateDiceButton();
      }
    }, 70);
  },

  showDice(value) {
    const face = this.getElement("diceFace");

    if (!face) {
      return;
    }

    const pipMap = {
      1: [5],
      2: [1, 9],
      3: [1, 5, 9],
      4: [1, 3, 7, 9],
      5: [1, 3, 5, 7, 9],
      6: [1, 3, 4, 6, 7, 9],
    };

    const diceValue =
      Number(value) >= 1 && Number(value) <= 6 ? Number(value) : 1;

    const activePips = new Set(pipMap[diceValue]);

    face.replaceChildren();

    for (let position = 1; position <= 9; position += 1) {
      const pip = document.createElement("span");

      pip.className = "dice-pip";

      pip.classList.toggle("is-visible", activePips.has(position));

      face.appendChild(pip);
    }

    face.dataset.value = String(diceValue);
  },

  rollDice() {
    if (this.rolling || !this.socket?.connected) {
      return;
    }

    const currentPlayer = this.getCurrentTurnPlayer();

    const gameState = this.state?.gameState;

    const canRoll =
      this.state?.match?.status === "playing" &&
      Number(currentPlayer?.id) === Number(this.matchPlayerId) &&
      !gameState?.diceRolled;

    if (!canRoll) {
      return;
    }

    this.rolling = true;
    this.updateDiceButton();
    this.setMessage("Rolling dice…");

    this.socket.emit(
      "dice:roll",
      {
        matchId: this.matchId,
      },
      (response) => {
        this.rolling = false;

        if (!response?.success) {
          this.setMessage(response?.message || "Dice roll failed.");

          this.updateDiceButton();

          return;
        }

        const value = Number(response.data?.value);

        if (value >= 1 && value <= 6) {
          this.showDice(value);
        }
      },
    );
  },

  getMovablePawnNumbers() {
    const gameState = this.state?.gameState;

    if (
      !gameState?.diceRolled ||
      Number(this.getCurrentTurnPlayer()?.id) !== Number(this.matchPlayerId)
    ) {
      return new Set();
    }

    const dice = Number(gameState.diceValue);

    const numbers = this.state.pawns
      .filter((pawn) => {
        if (
          Number(pawn.matchPlayerId) !== Number(this.matchPlayerId) ||
          pawn.status === "finished"
        ) {
          return false;
        }

        if (pawn.status === "yard") {
          return dice === 6;
        }

        return Number(pawn.totalSteps) + dice <= 56;
      })
      .map((pawn) => Number(pawn.pawnNo));

    return new Set(numbers);
  },

  scheduleSinglePawnAutoMove() {
    clearTimeout(this.singlePawnAutoMoveTimer);

    this.singlePawnAutoMoveTimer = null;

    const gameState = this.state?.gameState;

    const currentPlayer = this.getCurrentTurnPlayer();

    const isMyTurn = Number(currentPlayer?.id) === Number(this.matchPlayerId);

    const canAutoMove =
      this.socket?.connected &&
      this.state?.match?.status === "playing" &&
      gameState?.status === "playing" &&
      gameState?.diceRolled &&
      isMyTurn &&
      !this.moving;

    if (!canAutoMove) {
      this.singlePawnAutoMoveKey = null;

      return;
    }

    const movablePawnNumbers = [...this.getMovablePawnNumbers()];

    /*
     * একটির বেশি legal pawn থাকলে
     * player নিজে pawn নির্বাচন করবে।
     */
    if (movablePawnNumbers.length !== 1) {
      this.singlePawnAutoMoveKey = null;

      return;
    }

    const pawnNo = Number(movablePawnNumbers[0]);

    const stateVersion = Number(gameState.stateVersion || 0);

    const autoMoveKey = [
      this.matchId,
      stateVersion,
      gameState.currentTurnPlayerId,
      gameState.diceValue,
      pawnNo,
    ].join(":");

    /*
     * একই dice state থেকে duplicate
     * auto-move request আটকাবে।
     */
    if (this.singlePawnAutoMoveKey === autoMoveKey) {
      return;
    }

    this.singlePawnAutoMoveKey = autoMoveKey;

    const attemptAutoMove = () => {
      this.singlePawnAutoMoveTimer = null;

      /*
       * Dice animation শেষ না হওয়া পর্যন্ত
       * pawn movement অপেক্ষা করবে।
       */
      if (this.diceAnimating) {
        this.singlePawnAutoMoveTimer = setTimeout(attemptAutoMove, 100);

        return;
      }

      const latestGameState = this.state?.gameState;

      const latestCurrentPlayer = this.getCurrentTurnPlayer();

      const latestMovablePawns = [...this.getMovablePawnNumbers()];

      const latestKey = [
        this.matchId,
        Number(latestGameState?.stateVersion || 0),
        latestGameState?.currentTurnPlayerId,
        latestGameState?.diceValue,
        pawnNo,
      ].join(":");

      const stateStillValid =
        this.socket?.connected &&
        this.state?.match?.status === "playing" &&
        latestGameState?.status === "playing" &&
        latestGameState?.diceRolled &&
        Number(latestCurrentPlayer?.id) === Number(this.matchPlayerId) &&
        latestMovablePawns.length === 1 &&
        Number(latestMovablePawns[0]) === pawnNo &&
        latestKey === autoMoveKey &&
        this.singlePawnAutoMoveKey === autoMoveKey &&
        !this.moving;

      if (!stateStillValid) {
        return;
      }

      this.setMessage("Moving the only available pawn…");

      this.movePawn(pawnNo);
    };

    /*
     * Dice result দেখার জন্য অল্প delay।
     */
    this.singlePawnAutoMoveTimer = setTimeout(attemptAutoMove, 850);
  },

  getPawnPosition(pawn) {
    if (pawn.status === "yard") {
      const slot = document.querySelector(
        `.yard-slot[data-color="${pawn.color}"][data-pawn-number="${pawn.pawnNo}"]`,
      );

      const board = this.getElement("ludoBoard");

      if (slot && board) {
        const slotRect = slot.getBoundingClientRect();

        const boardRect = board.getBoundingClientRect();

        return {
          left:
            ((slotRect.left + slotRect.width / 2 - boardRect.left) /
              boardRect.width) *
            100,

          top:
            ((slotRect.top + slotRect.height / 2 - boardRect.top) /
              boardRect.height) *
            100,
        };
      }
    }

    if (pawn.status === "finished") {
      const finishedOffsets = {
        red: {
          left: 45,
          top: 50,
        },

        green: {
          left: 50,
          top: 45,
        },

        yellow: {
          left: 55,
          top: 50,
        },

        blue: {
          left: 50,
          top: 55,
        },
      };

      return (
        finishedOffsets[pawn.color] || {
          left: 50,
          top: 50,
        }
      );
    }

    const coordinate = String(pawn.boardCoordinate || "");

    const parts = coordinate.split("-").map(Number);

    if (parts.length !== 2 || !parts.every(Number.isInteger)) {
      return null;
    }

    const [row, column] = parts;

    return {
      left: ((column + 0.5) / 15) * 100,

      top: ((row + 0.5) / 15) * 100,
    };
  },

  renderPawns() {
    const layer = this.getElement("pawnLayer");

    if (!layer) {
      return;
    }

    const movable = this.getMovablePawnNumbers();

    const coordinateCounts = new Map();

    layer.replaceChildren();

    this.state.pawns.forEach((pawn) => {
      const position = this.getPawnPosition(pawn);

      if (!position) {
        return;
      }

      const overlapKey =
        pawn.status === "yard"
          ? `${pawn.color}-yard-${pawn.pawnNo}`
          : pawn.boardCoordinate || `${pawn.color}-finished`;

      const overlapIndex = coordinateCounts.get(overlapKey) || 0;

      coordinateCounts.set(overlapKey, overlapIndex + 1);

      const offsets = [
        [0, 0],
        [-1.2, -1.2],
        [1.2, -1.2],
        [-1.2, 1.2],
        [1.2, 1.2],
      ];

      const offset = offsets[overlapIndex % offsets.length];

      const button = document.createElement("button");

      button.type = "button";

      button.className = `ludo-pawn pawn-${pawn.color}`;

      button.dataset.pawnNo = String(pawn.pawnNo);

      button.dataset.playerId = String(pawn.matchPlayerId);

      button.style.left = `${position.left + offset[0]}%`;

      button.style.top = `${position.top + offset[1]}%`;

      const canMove =
        Number(pawn.matchPlayerId) === Number(this.matchPlayerId) &&
        movable.has(Number(pawn.pawnNo));

      button.classList.toggle("can-move", canMove);

      button.disabled = !canMove;

      button.setAttribute("aria-label", `${pawn.color} pawn ${pawn.pawnNo}`);

      button.addEventListener("click", () => {
        if (canMove) {
          this.movePawn(pawn.pawnNo);
        }
      });

      layer.appendChild(button);
    });
  },

  movePawn(pawnNo) {
    if (this.moving || !this.socket?.connected) {
      return;
    }

    const movable = this.getMovablePawnNumbers();

    if (!movable.has(Number(pawnNo))) {
      return;
    }

    this.moving = true;
    this.updateDiceButton();
    this.setMessage("Moving pawn…");

    this.socket.emit(
      "pawn:move",
      {
        matchId: this.matchId,
        pawnNo: Number(pawnNo),
      },
      (response) => {
        if (!response?.success) {
          this.moving = false;

          this.setMessage(response?.message || "Pawn movement failed.");

          this.renderPawns();
          this.updateDiceButton();
        }
      },
    );
  },

  showWinner() {
    const match = this.state?.match;

    if (!match || match.status !== "completed") {
      return;
    }

    const winner = this.state.players.find(
      (player) =>
        Number(player.finishPosition) === 1 ||
        Number(player.id) === Number(match.winnerPlayerId) ||
        (!player.isBot && Number(player.userId) === Number(match.winnerUserId)),
    );

    if (!winner) {
      return;
    }

    const overlay = this.getElement("winnerOverlay");

    const name = this.getElement("winnerName");

    const message = this.getElement("winnerMessage");

    const prize = this.getElement("winnerPrize");

    const isMe = Number(winner.id) === Number(this.matchPlayerId);

    if (name) {
      name.textContent = winner.fullName || winner.username || "Winner";
    }

    if (message) {
      message.textContent = isMe
        ? "Congratulations! You won the match."
        : `${winner.fullName || "Player"} won the match.`;
    }

    if (prize) {
      prize.textContent = this.formatMoney(
        winner.prizeAmount || match.firstPrize,
      );
    }

    overlay?.removeAttribute("hidden");

    this.disableDice();
    this.hideMatchmaking();
  },

  leaveMatch() {
    const goBack = () => {
      window.location.href = "ludo-rooms.html";
    };

    if (!this.socket?.connected || !this.matchId) {
      goBack();

      return;
    }

    this.socket.emit(
      "match:leave",
      {
        matchId: this.matchId,
      },
      () => {
        this.socket.disconnect();
        goBack();
      },
    );

    setTimeout(goBack, 800);
  },
};

window.LUDO_DESIGN = LUDO_DESIGN;

window.LUDO_LIVE = LUDO_LIVE;

const initializeLudoGame = () => {
  LUDO_DESIGN.createBoard();
  LUDO_DESIGN.initializeAvatarFallbacks();

  LUDO_LIVE.initialize();

  console.log("✅ PMS ADDA glossy Ludo table loaded");
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeLudoGame, {
    once: true,
  });
} else {
  initializeLudoGame();
}
