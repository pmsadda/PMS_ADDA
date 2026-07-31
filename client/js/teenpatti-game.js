"use strict";

(() => {
  /* =========================================================
     PMS ADDA — NEW TEEN PATTI FRONTEND
  ========================================================= */

  const CARD_BACK_PATH = "../assets/cards/card-back.png";

  const ROOMS_PAGE_PATH = "./teenpatti-rooms.html";

  const TURN_SECONDS = 15;

  const SOUND_PATHS = Object.freeze({
    cardDeal: "../assets/sounds/card-deal.mp3",

    chipThrow: "../assets/sounds/chip-throw.mp3",

    chipLand: "../assets/sounds/chip-land.mp3",

    winner: "../assets/sounds/winner.mp3",
  });

  const CHIP_IMAGE_PATH = "../assets/chips/chip10.png";

  const CARD_REVEAL_DURATION_MS = 2000;

  const WINNER_OVERLAY_DURATION_MS = 4000;

  const NEXT_ROUND_COUNTDOWN_SECONDS = 5;

  /* =========================================================
     PAGE PARAMETERS + AUTHENTICATION
  ========================================================= */

  const pageParameters = new URLSearchParams(window.location.search);

  const tableId = Number(pageParameters.get("tableId"));

  const accessToken =
    localStorage.getItem("access_token") || localStorage.getItem("token") || "";

  const hasValidTableId = Number.isInteger(tableId) && tableId > 0;

  /* =========================================================
     CENTRAL FRONTEND STATE
  ========================================================= */

  const STATE = {
    socket: null,

    socketConnected: false,
    socketJoined: false,

    tableId: hasValidTableId ? tableId : null,

    table: null,
    hand: null,
    players: [],

    myHandPlayerId: null,
    myCards: [],

    pendingSideShow: null,
    matchmaking: null,

    cardsRevealed: false,

    cardDistributionActive: false,
    cardDistributionProgress: new Map(),
    cardDistributionRunId: 0,
    cardDistributionEndTimeout: null,

    actionPending: false,
    leavingTable: false,

    turnInterval: null,
    winnerRevealTimeout: null,
    winnerInterval: null,
    roundCountdownInterval: null,
    matchmakingInterval: null,

    lastHandId: null,
    lastActionSequence: null,

    soundEnabled: localStorage.getItem("teenpatti_sound_enabled") !== "false",
  };

  /* =========================================================
     DOM REFERENCES
  ========================================================= */

  const DOM = {
    backButton: document.querySelector(".back-btn"),

    roomName: document.getElementById("teenPattiRoomName"),

    boot: document.getElementById("teenPattiBoot"),

    round: document.getElementById("teenPattiRound"),

    wallet: document.getElementById("headerWallet"),

    potAmount: document.getElementById("potAmount"),

    deck: document.getElementById("deck"),

    chipLayer: document.getElementById("chipLayer"),

    turnTimer: document.getElementById("turnTimer"),

    turnTimerProgress: document.getElementById("turnTimerProgress"),

    connectionDot: document.getElementById("teenPattiConnectionDot"),

    connectionText: document.getElementById("teenPattiConnectionText"),

    packButton: document.getElementById("packButton"),

    seenButton: document.getElementById("seenButton"),

    betButton: document.getElementById("betButton"),

    raiseButton: document.getElementById("raiseButton"),

    sideShowButton: document.getElementById("sideShowButton"),

    showButton: document.getElementById("showButton"),

    soundButton: document.getElementById("teenPattiSoundButton"),

    settingsButton: document.getElementById("teenPattiSettingsButton"),

    rulesButton: document.getElementById("teenPattiRulesButton"),

    exitButton: document.getElementById("teenPattiExitButton"),

    matchmakingOverlay: document.getElementById("matchmakingOverlay"),

    matchmakingMessage: document.getElementById("matchmakingMessage"),

    matchmakingCountdown: document.getElementById("matchmakingCountdown"),

    matchmakingProgressBar: document.getElementById("matchmakingProgressBar"),

    matchmakingRealPlayers: document.getElementById("matchmakingRealPlayers"),

    matchmakingTotalPlayers: document.getElementById("matchmakingTotalPlayers"),

    sideShowModal: document.getElementById("sideShowModal"),

    sideShowMessage: document.getElementById("sideShowMessage"),

    acceptSideShowButton: document.getElementById("acceptSideShowButton"),

    rejectSideShowButton: document.getElementById("rejectSideShowButton"),

    winnerOverlay: document.getElementById("winnerOverlay"),

    winnerPlayerName: document.getElementById("winnerPlayerName"),

    winnerHandName: document.getElementById("winnerHandName"),

    winnerAmount: document.getElementById("winnerAmount"),

    winnerGrossAmount: document.getElementById("winnerGrossAmount"),

    winnerServiceCharge: document.getElementById("winnerServiceCharge"),

    winnerNetAmount: document.getElementById("winnerNetAmount"),

    nextRoundText: document.getElementById("nextRoundText"),

    roundCountdownOverlay: document.getElementById("roundCountdownOverlay"),

    roundCountdownNumber: document.getElementById("roundCountdownNumber"),

    toast: document.getElementById("gameToast"),

    winnerBanner: document.getElementById("winnerBanner"),
  };

  DOM.seats = Array.from({ length: 5 }, (_, index) => {
    const seatNumber = index + 1;

    if (seatNumber === 5) {
      return {
        root: document.getElementById("currentPlayer"),

        cards: document.getElementById("currentPlayerCards"),

        name: document.getElementById("currentPlayerName"),

        balance: document.getElementById("currentPlayerBalance"),

        status: document.getElementById("currentPlayerStatus"),
      };
    }

    return {
      root: document.getElementById(`player${seatNumber}`),

      cards: document.getElementById(`player${seatNumber}Cards`),

      name: document.getElementById(`player${seatNumber}Name`),

      balance: document.getElementById(`player${seatNumber}Balance`),

      status: document.getElementById(`player${seatNumber}Status`),
    };
  });

  /* =========================================================
     BASIC UTILITIES
  ========================================================= */

  function formatMoney(value) {
    const amount = Number(value);

    return `৳${(Number.isFinite(amount) ? amount : 0).toFixed(2)}`;
  }

  function normalizeString(value) {
    return String(value || "")
      .trim()
      .toLowerCase();
  }

  function setConnectionState(connected, text) {
    STATE.socketConnected = Boolean(connected);

    if (DOM.connectionText) {
      DOM.connectionText.textContent =
        text || (connected ? "Connected" : "Disconnected");
    }

    if (DOM.connectionDot) {
      DOM.connectionDot.classList.toggle("connected", Boolean(connected));

      DOM.connectionDot.classList.toggle("disconnected", !connected);
    }
  }

  let toastTimer = null;

  function showToast(message, type = "info", duration = 2600) {
    if (!DOM.toast) {
      console.log(message);
      return;
    }

    clearTimeout(toastTimer);

    DOM.toast.textContent = String(message);
    DOM.toast.dataset.type = type;
    DOM.toast.classList.add("show");

    toastTimer = setTimeout(
      () => {
        DOM.toast.classList.remove("show");
      },
      Math.max(1000, Number(duration) || 2600),
    );
  }

  function setButtonDisabled(button, disabled) {
    if (!button) {
      return;
    }

    button.disabled = Boolean(disabled);
    button.setAttribute("aria-disabled", String(Boolean(disabled)));
  }

  function disableAllActions() {
    [
      DOM.packButton,
      DOM.seenButton,
      DOM.betButton,
      DOM.raiseButton,
      DOM.sideShowButton,
      DOM.showButton,
    ].forEach((button) => {
      setButtonDisabled(button, true);
    });
  }

  function clearTurnTimer() {
    if (STATE.turnInterval) {
      clearInterval(STATE.turnInterval);
      STATE.turnInterval = null;
    }
  }

  function clearWinnerRevealTimer() {
    if (STATE.winnerRevealTimeout) {
      clearTimeout(STATE.winnerRevealTimeout);
      STATE.winnerRevealTimeout = null;
    }
  }

  function clearWinnerTimer() {
    if (STATE.winnerInterval) {
      clearTimeout(STATE.winnerInterval);
      STATE.winnerInterval = null;
    }
  }

  function clearRoundCountdownTimer() {
    if (STATE.roundCountdownInterval) {
      clearInterval(STATE.roundCountdownInterval);
      STATE.roundCountdownInterval = null;
    }
  }

  function hideRoundCountdown() {
    clearRoundCountdownTimer();

    DOM.roundCountdownOverlay?.classList.remove("show");

    DOM.roundCountdownOverlay?.setAttribute("aria-hidden", "true");
  }

  function showRoundCountdown() {
    clearRoundCountdownTimer();

    let remainingSeconds = NEXT_ROUND_COUNTDOWN_SECONDS;

    DOM.roundCountdownOverlay?.classList.add("show");

    DOM.roundCountdownOverlay?.setAttribute("aria-hidden", "false");

    const renderCountdown = () => {
      if (DOM.roundCountdownNumber) {
        DOM.roundCountdownNumber.textContent = String(
          Math.max(0, remainingSeconds),
        );
      }
    };

    renderCountdown();

    STATE.roundCountdownInterval = window.setInterval(() => {
      remainingSeconds -= 1;

      renderCountdown();

      if (remainingSeconds <= 0) {
        clearRoundCountdownTimer();
      }
    }, 1000);
  }

  function clearMatchmakingTimer() {
    if (STATE.matchmakingInterval) {
      clearInterval(STATE.matchmakingInterval);
      STATE.matchmakingInterval = null;
    }
  }

  function goToRooms() {
    if (STATE.leavingTable) {
      return;
    }

    window.location.href = ROOMS_PAGE_PATH;
  }

  function validateFrontendRequirements() {
    if (!window.APP_CONFIG) {
      showToast("APP_CONFIG পাওয়া যায়নি।", "error");

      return false;
    }

    if (typeof window.io !== "function") {
      showToast("Socket.IO client load হয়নি।", "error");

      return false;
    }

    if (!accessToken) {
      showToast("Login token পাওয়া যায়নি। আবার login করুন।", "error");

      setTimeout(() => {
        window.location.href = "./login.html";
      }, 1400);

      return false;
    }

    if (!hasValidTableId) {
      showToast("Valid Teen Patti Table ID পাওয়া যায়নি।", "error");

      setTimeout(goToRooms, 1400);

      return false;
    }

    return true;
  }

  /* =========================================================
     SOCKET ACKNOWLEDGEMENT HELPER
  ========================================================= */

  function emitWithAcknowledgement(eventName, payload = {}, timeout = 10000) {
    return new Promise((resolve, reject) => {
      if (!STATE.socket || !STATE.socket.connected) {
        reject(new Error("Teen Patti socket is not connected."));

        return;
      }

      STATE.socket
        .timeout(timeout)
        .emit(eventName, payload, (timeoutError, response) => {
          if (timeoutError) {
            reject(new Error(`${eventName} request timed out.`));

            return;
          }

          if (!response?.success) {
            const responseError = new Error(
              response?.message || `${eventName} request failed.`,
            );

            responseError.statusCode = Number(response?.statusCode) || 500;

            responseError.code = response?.code || "SOCKET_REQUEST_FAILED";

            reject(responseError);
            return;
          }

          resolve(response);
        });
    });
  }

  /* =========================================================
     SERVER STATE NORMALIZATION
  ========================================================= */

  function unwrapSocketData(payload) {
    if (
      payload &&
      typeof payload === "object" &&
      payload.data &&
      typeof payload.data === "object"
    ) {
      return payload.data;
    }

    return payload || {};
  }

  /* =========================================================
     CARD HELPERS
  ========================================================= */

  function getCardAssetPath(card) {
    if (!card || typeof card !== "object") {
      return CARD_BACK_PATH;
    }

    const suit = String(card.suit || "")
      .trim()
      .toUpperCase();

    const rank = String(card.rank || "")
      .trim()
      .toUpperCase();

    if (
      !["S", "H", "D", "C"].includes(suit) ||
      ![
        "2",
        "3",
        "4",
        "5",
        "6",
        "7",
        "8",
        "9",
        "10",
        "J",
        "Q",
        "K",
        "A",
      ].includes(rank)
    ) {
      return CARD_BACK_PATH;
    }

    /*
     * Server code: JS, 10H ইত্যাদি।
     * Asset filename: SJ.png, H10.png ইত্যাদি।
     */
    return `../assets/cards/${suit}${rank}.png`;
  }

  function createCardImage(source, alternativeText) {
    const image = document.createElement("img");
    image.classList.add("card-arrived");

    image.src = source;
    image.alt = alternativeText;
    image.draggable = false;

    image.addEventListener(
      "error",
      () => {
        if (!image.src.endsWith("/card-back.png")) {
          image.src = CARD_BACK_PATH;
        }
      },
      { once: true },
    );

    return image;
  }

  function renderCards(
  container,
  cards,
  shouldReveal,
  cardCount = 3,
) {
  if (!container) {
    return;
  }

  const safeCards =
    Array.isArray(cards)
      ? cards
      : [];

  const totalCards = Math.max(
    0,
    Math.min(
      3,
      Number(cardCount) ||
        safeCards.length ||
        0,
    ),
  );

  const dealtCardCount =
    STATE.cardDistributionActive === true
      ? Math.max(
          0,
          Number(
            STATE.cardDistributionProgress.get(
              container,
            ) || 0,
          ),
        )
      : totalCards;

  /*
   * প্রয়োজনের অতিরিক্ত card শুধু তখনই remove হবে।
   * প্রতিটি state update-এ সব card আর recreate হবে না।
   */
  while (
    container.children.length >
    totalCards
  ) {
    container.lastElementChild?.remove();
  }

  /*
   * Missing card element শুধু প্রয়োজন হলে তৈরি হবে।
   */
  while (
    container.children.length <
    totalCards
  ) {
    container.appendChild(
      createCardImage(
        CARD_BACK_PATH,
        "Hidden card",
      ),
    );
  }

  Array.from(
    container.children,
  ).forEach(
    (cardImage, index) => {
      const card =
        safeCards[index];

      const canShowCard =
        Boolean(shouldReveal) &&
        Boolean(card);

      const desiredSource =
        canShowCard
          ? getCardAssetPath(card)
          : CARD_BACK_PATH;

      const desiredAlt =
        canShowCard
          ? `${card.rank}${card.suit}`
          : "Hidden card";

      /*
       * Source সত্যিই পরিবর্তন হলেই browser image
       * update করবে। একই action state-এ reload হবে না।
       */
      if (
        cardImage.dataset.cardSource !==
        desiredSource
      ) {
        cardImage.src =
          desiredSource;

        cardImage.dataset.cardSource =
          desiredSource;
      }

      cardImage.alt =
        desiredAlt;

      cardImage.draggable =
        false;

      cardImage.classList.toggle(
        "card-arrived",
        index < dealtCardCount,
      );
    },
  );
}

  /* =========================================================
     PLAYER HELPERS
  ========================================================= */

  function getLocalPlayer() {
    return (
      STATE.players.find((player) => Boolean(player.isLocalPlayer)) ||
      STATE.players.find(
        (player) =>
          Number(player.handPlayerId) === Number(STATE.myHandPlayerId),
      ) ||
      null
    );
  }

  function getPlayerStatus(player) {
    if (!player) {
      return "WAITING";
    }

    if (player.isCurrentTurn) {
      return "YOUR TURN";
    }

    return String(player.lastAction || player.status || "active")
      .replaceAll("_", " ")
      .toUpperCase();
  }

  function resetSeat(seat, seatNumber, localSeat = false) {
    if (!seat) {
      return;
    }

    if (seat.name) {
      seat.name.textContent = localSeat ? "You" : "Waiting…";
    }

    if (seat.balance) {
      seat.balance.textContent = formatMoney(0);
    }

    if (seat.status) {
      seat.status.textContent = "WAITING";
    }

    if (seat.cards) {
      seat.cards.replaceChildren();
    }

    if (seat.root) {
      seat.root.classList.remove(
        "occupied",
        "active-turn",
        "is-dealer",
        "is-packed",
        "is-winner",
        "is-disconnected",
      );

      seat.root.classList.add("is-resolved-seat");

      seat.root.dataset.playerId = "";
      seat.root.dataset.seatNumber = String(seatNumber);
    }

    const avatar = seat.root?.querySelector(".avatar");

    if (avatar) {
      avatar.textContent = localSeat ? "ME" : `P${seatNumber}`;
    }
  }

  function getPlayerInitial(name) {
    const normalizedName = String(name || "Player").trim();

    return normalizedName.charAt(0).toUpperCase() || "P";
  }

  function resolveAvatarUrl(avatarUrl) {
    const source = String(avatarUrl || "").trim();

    if (!source) {
      return null;
    }

    if (
      source.startsWith("http://") ||
      source.startsWith("https://") ||
      source.startsWith("data:") ||
      source.startsWith("blob:")
    ) {
      return source;
    }

    if (source.startsWith("/")) {
      return window.APP_CONFIG.server(source);
    }

    return source;
  }

  function renderPlayerAvatar(
  avatarElement,
  playerName,
  avatarUrl,
) {
  if (!avatarElement) {
    return;
  }

  const initial =
    getPlayerInitial(playerName);

  const resolvedAvatar =
    resolveAvatarUrl(avatarUrl);

  if (!resolvedAvatar) {
    const currentImage =
      avatarElement.querySelector("img");

    if (
      currentImage ||
      avatarElement.textContent.trim() !==
        initial
    ) {
      avatarElement.replaceChildren();
      avatarElement.textContent =
        initial;
    }

    return;
  }

  let image =
    avatarElement.querySelector("img");

  /*
   * Existing image থাকলে সেটিই reuse হবে।
   */
  if (!image) {
    image =
      document.createElement("img");

    image.draggable = false;

    Object.assign(
      image.style,
      {
        width: "100%",
        height: "100%",
        display: "block",
        objectFit: "cover",
        borderRadius: "50%",
      },
    );

    image.addEventListener(
      "error",
      () => {
        const fallbackInitial =
          image.dataset.fallbackInitial ||
          "P";

        avatarElement.replaceChildren();

        avatarElement.textContent =
          fallbackInitial;
      },
      {
        once: true,
      },
    );

    avatarElement.replaceChildren(
      image,
    );
  }

  image.alt =
    playerName;

  image.dataset.fallbackInitial =
    initial;

  if (
    image.dataset.avatarSource !==
    resolvedAvatar
  ) {
    image.src =
      resolvedAvatar;

    image.dataset.avatarSource =
      resolvedAvatar;
  }
}

  function renderSeat(seat, player, visualSeatNumber, localSeat = false) {
    if (!seat || !player) {
      resetSeat(seat, visualSeatNumber, localSeat);

      return;
    }

    const playerName =
      player.name ||
      player.fullName ||
      player.botName ||
      (localSeat ? "You" : `Player ${visualSeatNumber}`);

    if (seat.name) {
      seat.name.textContent = playerName;
    }

    if (seat.balance) {
      seat.balance.textContent = formatMoney(
        player.balance ?? player.endingBalance ?? player.walletBalance ?? 0,
      );
    }

    if (seat.status) {
      seat.status.textContent = getPlayerStatus(player);
    }

    const playerStatus = normalizeString(player.status || player.playerStatus);

    /*
     * Table-এ শুধু active এবং winner player দেখা যাবে।
     */
    const isVisibleTablePlayer = [
      "active",
      "winner",
      "packed",
      "timeout",
    ].includes(playerStatus);

    if (seat.root) {
      seat.root.classList.add("occupied");

      seat.root.classList.toggle("is-resolved-seat", !isVisibleTablePlayer);

      seat.root.classList.toggle("active-turn", Boolean(player.isCurrentTurn));

      seat.root.classList.toggle("is-dealer", Boolean(player.isDealer));

      seat.root.classList.toggle(
        "is-packed",
        ["packed", "timeout",].includes(playerStatus),
      );

      seat.root.classList.toggle("is-winner", playerStatus === "winner");

      seat.root.classList.toggle(
        "is-disconnected",
        Boolean(player.disconnectedAt),
      );

      seat.root.dataset.playerId = String(
        player.handPlayerId || player.tablePlayerId || player.tableBotId || "",
      );
    }

    const avatar = seat.root?.querySelector(".avatar");

    renderPlayerAvatar(
      avatar,
      playerName,
      player.avatarUrl || player.avatar_url || null,
    );

    const handCompleted = ["showdown", "completed"].includes(
      normalizeString(STATE.hand?.status),
    );

    const playerHasRevealedCards =
      Array.isArray(player.cards) && player.cards.length > 0;

    const shouldReveal = localSeat
      ? Boolean(STATE.cardsRevealed || player.isSeen || handCompleted)
      : Boolean(handCompleted && playerHasRevealedCards);

    const cards = localSeat ? STATE.myCards : player.cards;

    renderCards(seat.cards, cards, shouldReveal, player.cardCount || 3);
  }

  /* =========================================================
     TABLE + PLAYER RENDER
  ========================================================= */

  function renderPlayers() {
    const localPlayer = getLocalPlayer();

    const opponentPlayers = STATE.players
      .filter((player) => player !== localPlayer && !player.isLocalPlayer)
      .sort(
        (firstPlayer, secondPlayer) =>
          Number(firstPlayer.seatNo) - Number(secondPlayer.seatNo),
      )
      .slice(0, 4);

    for (let index = 0; index < 4; index += 1) {
      renderSeat(
        DOM.seats[index],
        opponentPlayers[index] || null,
        index + 1,
        false,
      );
    }

    renderSeat(DOM.seats[4], localPlayer, 5, true);
  }

  function renderTableInformation() {
    const table = STATE.table || {};
    const hand = STATE.hand || {};

    const roomName = table.roomName || table.room_name || "Teen Patti";

    const bootAmount =
      hand.bootAmount ?? table.bootAmount ?? table.boot_amount ?? 0;

    const roundNumber =
      hand.roundNumber ?? table.currentRound ?? table.current_round ?? 0;

    const potAmount =
      hand.potAmount ?? table.potAmount ?? table.pot_amount ?? 0;

    const localPlayer = getLocalPlayer();

    if (DOM.roomName) {
      DOM.roomName.textContent = roomName;
    }

    if (DOM.boot) {
      DOM.boot.textContent = `Boot: ${formatMoney(bootAmount)}`;
    }

    if (DOM.round) {
      DOM.round.textContent = `Round #${roundNumber}`;
    }

    if (DOM.potAmount) {
      DOM.potAmount.textContent = formatMoney(potAmount);
    }

    if (DOM.wallet) {
      DOM.wallet.textContent = formatMoney(
        localPlayer?.balance ??
          localPlayer?.endingBalance ??
          table.walletBalance ??
          0,
      );
    }
  }

  /* =========================================================
     TURN TIMER
  ========================================================= */

  function renderTurnTimer() {
    clearTurnTimer();

    const handPlaying = normalizeString(STATE.hand?.status) === "playing";

    const actionExpiresAt = STATE.hand?.actionExpiresAt;

    const updateTimer = () => {
      let remainingSeconds = 0;

      /*
       * Distribution চলাকালে timer শুধু 15 দেখাবে।
       * Distribution-এর সময় timer-এর সঙ্গে যোগ হবে না।
       */
      if (handPlaying && STATE.cardDistributionActive === true) {
        remainingSeconds = TURN_SECONDS;
      } else if (handPlaying && actionExpiresAt) {
        const expiryTimestamp = new Date(actionExpiresAt).getTime();

        remainingSeconds = Number.isFinite(expiryTimestamp)
          ? Math.max(
              0,
              Math.min(
                TURN_SECONDS,
                Math.ceil((expiryTimestamp - Date.now()) / 1000),
              ),
            )
          : 0;
      }

      if (DOM.turnTimer) {
        DOM.turnTimer.textContent = String(remainingSeconds);
      }

      if (DOM.turnTimerProgress) {
        const percentage = Math.max(
          0,
          Math.min(100, (remainingSeconds / TURN_SECONDS) * 100),
        );

        DOM.turnTimerProgress.style.width = `${percentage}%`;
      }

      if (remainingSeconds <= 0 && STATE.cardDistributionActive !== true) {
        clearTurnTimer();
      }
    };

    updateTimer();

    if (handPlaying && actionExpiresAt) {
      STATE.turnInterval = window.setInterval(updateTimer, 250);
    }
  }

  /* =========================================================
     ACTION BUTTON STATE
  ========================================================= */

  function renderActionButtons() {
    const localPlayer = getLocalPlayer();

    const handStatus = normalizeString(STATE.hand?.status);

    const playerStatus = normalizeString(
      localPlayer?.status || localPlayer?.playerStatus,
    );

    const activePlayers = STATE.players.filter((player) =>
      ["active", "winner"].includes(
        normalizeString(player.status || player.playerStatus),
      ),
    );

    const handPlaying = handStatus === "playing";

    const isActive = playerStatus === "active";

    const isMyTurn = Boolean(localPlayer?.isCurrentTurn);

    const hasPendingSideShow = Boolean(STATE.pendingSideShow);

    const controlsLocked =
      !STATE.socketConnected ||
      !STATE.socketJoined ||
      STATE.cardDistributionActive ||
      !handPlaying ||
      !isActive ||
      !isMyTurn ||
      hasPendingSideShow ||
      STATE.actionPending;

    const playerIsSeen = Boolean(localPlayer?.isSeen);

    setButtonDisabled(DOM.packButton, controlsLocked);

    setButtonDisabled(
      DOM.seenButton,
      STATE.cardDistributionActive ||
        !handPlaying ||
        !isActive ||
        playerIsSeen ||
        STATE.actionPending,
    );

    setButtonDisabled(DOM.betButton, controlsLocked);

    setButtonDisabled(DOM.raiseButton, controlsLocked);

    setButtonDisabled(
      DOM.sideShowButton,
      controlsLocked || !playerIsSeen || activePlayers.length < 3,
    );

    setButtonDisabled(
      DOM.showButton,
      controlsLocked || !playerIsSeen || activePlayers.length !== 2,
    );

    if (DOM.seenButton) {
      DOM.seenButton.textContent = playerIsSeen ? "Cards Seen" : "See Cards";
    }

    if (DOM.betButton) {
      DOM.betButton.textContent = playerIsSeen ? "Chaal" : "Blind";
    }

    if (DOM.raiseButton) {
      DOM.raiseButton.textContent = playerIsSeen
        ? "Raise Chaal"
        : "Raise Blind";
    }
  }

  /* =========================================================
   MATCHMAKING OVERLAY
========================================================= */

  function hideMatchmakingOverlay() {
    clearMatchmakingTimer();

    DOM.matchmakingOverlay?.classList.remove("show");
    DOM.matchmakingOverlay?.setAttribute("aria-hidden", "true");
  }

  function renderMatchmakingOverlay() {
    clearMatchmakingTimer();

    const matchmaking = STATE.matchmaking || {};

    const isWaiting = matchmaking.isWaiting === true;

    if (!isWaiting) {
      hideMatchmakingOverlay();
      return;
    }

    const waitSeconds = Math.max(1, Number(matchmaking.waitSeconds) || 20);

    const realPlayers = Math.max(
      0,
      Number(
        matchmaking.realPlayers ??
          matchmaking.realPlayerCount ??
          matchmaking.real_players ??
          0,
      ) || 0,
    );

    const currentPlayers = Math.max(
      realPlayers,
      Number(
        matchmaking.currentPlayers ??
          matchmaking.totalPlayers ??
          matchmaking.current_players ??
          STATE.players.length ??
          0,
      ) || 0,
    );

    DOM.matchmakingOverlay?.classList.add("show");
    DOM.matchmakingOverlay?.setAttribute("aria-hidden", "false");

    if (DOM.matchmakingRealPlayers) {
      DOM.matchmakingRealPlayers.textContent = `${Math.min(realPlayers, 5)} / 5`;
    }

    if (DOM.matchmakingTotalPlayers) {
      DOM.matchmakingTotalPlayers.textContent = `${Math.min(currentPlayers, 5)} / 5`;
    }

    if (DOM.matchmakingMessage) {
      DOM.matchmakingMessage.textContent =
        realPlayers >= 5
          ? "Table is full. Starting the hand..."
          : realPlayers > 1
            ? `${realPlayers} real players joined. Waiting for more...`
            : "Waiting for real players...";
    }

    const expiresAtTimestamp = matchmaking.expiresAt
      ? new Date(matchmaking.expiresAt).getTime()
      : NaN;

    const fallbackDeadline =
      Date.now() +
      Math.max(0, Number(matchmaking.remainingSeconds) || waitSeconds) * 1000;

    const deadline = Number.isFinite(expiresAtTimestamp)
      ? expiresAtTimestamp
      : fallbackDeadline;

    const updateCountdown = () => {
      const remainingMilliseconds = Math.max(0, deadline - Date.now());

      const remainingSeconds = Math.max(
        0,
        Math.ceil(remainingMilliseconds / 1000),
      );

      if (DOM.matchmakingCountdown) {
        DOM.matchmakingCountdown.textContent = String(remainingSeconds);
      }

      if (DOM.matchmakingProgressBar) {
        const progressPercentage = Math.max(
          0,
          Math.min(100, (remainingSeconds / waitSeconds) * 100),
        );

        DOM.matchmakingProgressBar.style.width = `${progressPercentage}%`;
      }

      if (remainingSeconds <= 0) {
        clearMatchmakingTimer();

        if (DOM.matchmakingMessage) {
          DOM.matchmakingMessage.textContent =
            "Preparing your Teen Patti table...";
        }
      }
    };

    updateCountdown();

    STATE.matchmakingInterval = setInterval(updateCountdown, 250);
  }

  /* =========================================================
     COMPLETE RENDER
  ========================================================= */

  function renderGameState() {
    renderTableInformation();
    renderPlayers();
    renderTurnTimer();
    renderActionButtons();
    renderSideShowModal();
    renderMatchmakingOverlay();
  }

  function applyTableState(payload) {
    const tableState = unwrapSocketData(payload);

    STATE.table = tableState.table || STATE.table || null;

    if (tableState.matchmaking) {
      STATE.matchmaking = tableState.matchmaking;
    } else if (tableState.table?.matchmaking) {
      STATE.matchmaking = tableState.table.matchmaking;
    }

    /*
     * কিছু response-এ players root-এ থাকবে,
     * কিছু response-এ tableState.players থাকবে।
     */
    if (Array.isArray(tableState.players)) {
      STATE.players = tableState.players;
    }

    console.log("🎴 Teen Patti public table state:", tableState);

    renderGameState();
  }

  function applyPrivateHandState(payload) {
    const handState = unwrapSocketData(payload);

    STATE.hand = handState.hand || null;

    if (Array.isArray(handState.players)) {
      STATE.players = handState.players;
    }

    STATE.myHandPlayerId = Number(handState.myHandPlayerId) || null;

    STATE.myCards = Array.isArray(handState.myCards) ? handState.myCards : [];

    STATE.pendingSideShow = handState.pendingSideShow || null;

    const newHandId =
      Number(STATE.hand?.id) || Number(STATE.hand?.handId) || null;

    if (newHandId && newHandId !== STATE.lastHandId) {
      STATE.lastHandId = newHandId;
      STATE.cardsRevealed = false;
    }

    console.log("🃏 Private Teen Patti hand state:", {
      tableId: STATE.tableId,
      hand: STATE.hand,
      playerCount: STATE.players.length,
      myHandPlayerId: STATE.myHandPlayerId,
      myCardCount: STATE.myCards.length,
      pendingSideShow: STATE.pendingSideShow,
    });

    renderGameState();
  }

  /* =========================================================
     LOAD LATEST PRIVATE STATE
  ========================================================= */

  async function requestLatestHandState() {
    try {
      const response = await emitWithAcknowledgement("hand:get-state", {
        tableId: STATE.tableId,
      });

      if (response?.data) {
        applyPrivateHandState(response.data);
      }

      return response?.data || null;
    } catch (error) {
      /*
       * এখনো hand শুরু না হলে state পাওয়া
       * না-যাওয়া স্বাভাবিক।
       */
      if (
        error.code === "HAND_NOT_FOUND" ||
        error.code === "NO_ACTIVE_HAND" ||
        Number(error.statusCode) === 404
      ) {
        return null;
      }

      console.error("LOAD PRIVATE HAND STATE ERROR:", error);

      return null;
    }
  }

  /* =========================================================
     START OR RESUME HAND
  ========================================================= */

  async function startOrResumeHand() {
    try {
      const response = await emitWithAcknowledgement("hand:start", {
        tableId: STATE.tableId,
      });

      console.log("✅ Teen Patti hand start/resume:", response);

      /*
       * Backend matchmaking waiting response দিলে
       * hand শুরু হয়েছে ধরে নেওয়া হবে না।
       */
      if (response?.waiting === true) {
        if (response?.data?.matchmaking) {
          STATE.matchmaking = response.data.matchmaking;
        }

        renderGameState();

        return null;
      }

      return response?.data || null;
    } catch (error) {
      if (
        error.code === "MATCHMAKING_IN_PROGRESS" ||
        error.code === "NOT_ENOUGH_PLAYERS" ||
        error.code === "TABLE_WAITING" ||
        Number(error.statusCode) === 409
      ) {
        showToast(error.message || "Waiting for Teen Patti players...", "info");

        renderMatchmakingOverlay();

        return null;
      }

      console.error("START OR RESUME HAND ERROR:", error);

      showToast(error.message || "Teen Patti hand শুরু করা যায়নি।", "error");

      return null;
    }
  }

  /* =========================================================
     JOIN SOCKET TABLE
  ========================================================= */

  async function joinSocketTable() {
    if (STATE.socketJoined || !STATE.socketConnected) {
      return;
    }

    try {
      setConnectionState(true, "Joining table…");

      const response = await emitWithAcknowledgement("table:join", {
        tableId: STATE.tableId,
      });

      STATE.socketJoined = true;

      if (response?.data?.tableState) {
        applyTableState(response.data.tableState);
      } else if (response?.data) {
        applyTableState(response.data);
      }

      if (response?.data?.handState) {
        applyPrivateHandState(response.data.handState);
      }

      setConnectionState(true, "Connected");

      console.log("✅ Teen Patti socket table joined:", {
        tableId: STATE.tableId,
        response,
      });

      /*
       * আগে running hand থাকলে private state নেবে।
       */
      const existingHand = await requestLatestHandState();

      const existingHandStatus = normalizeString(
        existingHand?.hand?.status ||
          existingHand?.handStatus ||
          existingHand?.status,
      );

      const hasActiveHand = ["starting", "playing", "showdown"].includes(
        existingHandStatus,
      );

      /*
       * Cancelled/completed hand active নয়।
       * তাই নতুন server-authoritative hand শুরু হবে।
       */
      if (!hasActiveHand) {
        await startOrResumeHand();
      }
    } catch (error) {
      STATE.socketJoined = false;

      console.error("TEEN PATTI TABLE JOIN ERROR:", error);

      setConnectionState(false, "Join failed");

      showToast(error.message || "Teen Patti table join করা যায়নি।", "error");
    }
  }

  /* =========================================================
     SERVER SOCKET EVENTS
  ========================================================= */

  function registerGameSocketEvents() {
    STATE.socket.on("hand:cards-seen", (payload = {}) => {
      if (Array.isArray(payload.cards)) {
        STATE.myCards = payload.cards;
      }

      STATE.cardsRevealed = true;
      renderGameState();
    });

    STATE.socket.on("table:state", (payload) => {
      applyTableState(payload);
    });

    STATE.socket.on("hand:state", (payload) => {
      applyPrivateHandState(payload);
    });

    STATE.socket.on("matchmaking:completed", async (payload = {}) => {
      console.log("✅ Teen Patti matchmaking completed:", payload);

      STATE.matchmaking = {
        ...(STATE.matchmaking || {}),
        isWaiting: false,
        completed: true,
        remainingSeconds: 0,
      };

      hideMatchmakingOverlay();

      if (payload.tableState) {
        applyTableState(payload.tableState);
      }

      showToast(
        payload.botJoined === true
          ? "Bot joined. Starting Teen Patti hand..."
          : "Players ready. Starting Teen Patti hand...",
        "success",
        1800,
      );
    });

    STATE.socket.on("hand:started", async (payload) => {
      console.log("🃏 Teen Patti hand started:", payload);

      STATE.matchmaking = {
        ...(STATE.matchmaking || {}),
        isWaiting: false,
        completed: true,
        remainingSeconds: 0,
      };

      clearWinnerRevealTimer();
      hideWinnerOverlay();
      hideRoundCountdown();
      hideMatchmakingOverlay();

      STATE.cardsRevealed = false;

      STATE.cardDistributionActive = true;
      STATE.cardDistributionProgress.clear();

      await requestLatestHandState();

      window.setTimeout(animateCardDistribution, 120);
    });

    STATE.socket.on("hand:action", async (payload) => {
      console.log("🎯 Teen Patti public action:", payload);

      animateChipToPot(payload);

      await requestLatestHandState();
    });

    STATE.socket.on("side-show:requested", async (payload) => {
      console.log("📨 Side Show requested:", payload);

      await requestLatestHandState();
    });

    STATE.socket.on("side-show:responded", async (payload) => {
      console.log("📨 Side Show responded:", payload);

      STATE.pendingSideShow = null;
      hideSideShowModal();

      await requestLatestHandState();
    });

    STATE.socket.on("hand:completed", async (payload) => {
      console.log("🏆 Teen Patti hand completed:", payload);

      const completedEventTime = Date.now();

      clearWinnerRevealTimer();
      hideWinnerOverlay();
      hideRoundCountdown();
      disableAllActions();

      /*
       * Completed state load হওয়ার পরে active player-দের
       * cards table-এ reveal হবে।
       */
      await requestLatestHandState();

      renderGameState();

      /*
       * Completed event আসার সময় থেকে মোট ২ সেকেন্ড
       * cards table-এ দেখা যাবে।
       */
      const stateLoadingTime = Date.now() - completedEventTime;

      const remainingRevealTime = Math.max(
        0,
        CARD_REVEAL_DURATION_MS - stateLoadingTime,
      );

      STATE.winnerRevealTimeout = window.setTimeout(() => {
        STATE.winnerRevealTimeout = null;

        playSound("winner", 0.8);
        showWinnerOverlay(payload);
      }, remainingRevealTime);
    });

    STATE.socket.on("hand:next-round", async (payload) => {
      console.log("🔄 Teen Patti next round:", payload);

      clearWinnerRevealTimer();
      hideWinnerOverlay();
      hideRoundCountdown();

      STATE.cardsRevealed = false;

      /*
       * New hand state আসার আগেই distribution mode
       * চালু হবে। তাই তিনটি card আগে দেখা যাবে না।
       */
      if (payload?.handStarted === true) {
        STATE.cardDistributionActive = true;

        STATE.cardDistributionProgress.clear();

        renderActionButtons();
      } else {
        STATE.cardDistributionActive = false;
      }

      await requestLatestHandState();
    });

    STATE.socket.on("table:player-disconnected", (payload) => {
      console.log("Player temporarily disconnected:", payload);
    });

    STATE.socket.on("table:player-forfeited", async (payload) => {
      console.log("Player forfeited:", payload);

      await requestLatestHandState();
    });

    STATE.socket.on("table:error", (payload = {}) => {
      console.error("Teen Patti table error:", payload);

      showToast(payload.message || "Teen Patti server error.", "error");
    });
  }

  /* =========================================================
     SOCKET CONNECTION
  ========================================================= */

  function createSocketConnection() {
    setConnectionState(false, "Connecting…");

    STATE.socket = window.io(window.APP_CONFIG.TEEN_PATTI_SOCKET_URL, {
      transports: ["websocket", "polling"],

      auth: {
        token: accessToken,
      },

      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 800,
      reconnectionDelayMax: 4000,
      timeout: 10000,
    });
    registerGameSocketEvents();

    STATE.socket.on("connect", () => {
      console.log("✅ New Teen Patti socket connected:", STATE.socket.id);

      setConnectionState(true, "Connected");

      joinSocketTable();
    });

    STATE.socket.on("connect_error", (error) => {
      console.error("TEEN PATTI SOCKET CONNECTION ERROR:", error);

      setConnectionState(false, "Connection failed");

      showToast(
        error.message || "Teen Patti server connection failed.",
        "error",
      );
    });

    STATE.socket.on("disconnect", (reason) => {
      if (STATE.leavingTable) {
        return;
      }
      console.warn("Teen Patti socket disconnected:", reason);

      STATE.socketJoined = false;
      clearMatchmakingTimer();

      setConnectionState(false, "Reconnecting…");

      disableAllActions();
    });
  }

  /* =========================================================
     SIDE SHOW MODAL
  ========================================================= */

  function getPendingSideShowRequestId() {
    return Number(
      STATE.pendingSideShow?.requestId ||
        STATE.pendingSideShow?.id ||
        STATE.pendingSideShow?.sideShowRequestId,
    );
  }

  function isLocalSideShowTarget() {
    const targetHandPlayerId = Number(
      STATE.pendingSideShow?.targetHandPlayerId ||
        STATE.pendingSideShow?.target_hand_player_id,
    );

    return (
      Boolean(STATE.pendingSideShow?.isTarget) ||
      (targetHandPlayerId > 0 &&
        targetHandPlayerId === Number(STATE.myHandPlayerId))
    );
  }

  function getSideShowRequesterName() {
    const requesterHandPlayerId = Number(
      STATE.pendingSideShow?.requesterHandPlayerId ||
        STATE.pendingSideShow?.requester_hand_player_id,
    );

    const requester = STATE.players.find(
      (player) => Number(player.handPlayerId) === requesterHandPlayerId,
    );

    return (
      requester?.name || STATE.pendingSideShow?.requesterName || "A player"
    );
  }

  function hideSideShowModal() {
    DOM.sideShowModal?.classList.remove("show");

    setButtonDisabled(DOM.acceptSideShowButton, false);

    setButtonDisabled(DOM.rejectSideShowButton, false);
  }

  function renderSideShowModal() {
    const requestId = getPendingSideShowRequestId();

    const requestStatus = normalizeString(
      STATE.pendingSideShow?.requestStatus || STATE.pendingSideShow?.status,
    );

    const isPending =
      requestId > 0 && (!requestStatus || requestStatus === "pending");

    if (!isPending || !isLocalSideShowTarget()) {
      hideSideShowModal();
      return;
    }

    if (DOM.sideShowMessage) {
      DOM.sideShowMessage.textContent = `${getSideShowRequesterName()} requested a Side Show.`;
    }

    DOM.sideShowModal?.classList.add("show");
  }

  async function respondToSideShow(decision) {
    const requestId = getPendingSideShowRequestId();

    if (!Number.isInteger(requestId) || requestId <= 0) {
      showToast("Valid Side Show request পাওয়া যায়নি।", "error");

      hideSideShowModal();
      return;
    }

    const normalizedDecision = normalizeString(decision);

    if (!["accepted", "rejected"].includes(normalizedDecision)) {
      return;
    }

    setButtonDisabled(DOM.acceptSideShowButton, true);

    setButtonDisabled(DOM.rejectSideShowButton, true);

    const response = await performPlayerAction(
      "side-show:respond",
      {
        requestId,
        decision: normalizedDecision,
      },
      {
        successMessage:
          normalizedDecision === "accepted"
            ? "Side Show accepted."
            : "Side Show rejected.",
      },
    );

    if (!response) {
      setButtonDisabled(DOM.acceptSideShowButton, false);

      setButtonDisabled(DOM.rejectSideShowButton, false);

      return;
    }

    STATE.pendingSideShow = null;
    hideSideShowModal();
    renderGameState();
  }

  /* =========================================================
     WINNER OVERLAY
  ========================================================= */

  function getSettlementFromPayload(payload = {}) {
    const data = unwrapSocketData(payload);

    return (
      data.settlement ||
      data.action?.settlement ||
      data.result?.settlement ||
      data
    );
  }

  function getWinningPlayers(settlement = {}) {
    const settlementWinners = Array.isArray(settlement.winners)
      ? settlement.winners
      : [];

    const stateWinners = STATE.players.filter(
      (player) =>
        normalizeString(player.status || player.playerStatus) === "winner" ||
        Number(player.prizeAmount) > 0,
    );

    if (stateWinners.length > 0) {
      return stateWinners;
    }

    return settlementWinners;
  }

  function getWinnerName(winners) {
    const names = winners
      .map(
        (winner) => winner.name || winner.playerName || winner.botName || null,
      )
      .filter(Boolean);

    if (names.length > 0) {
      return names.join(" & ");
    }

    return "Teen Patti Winner";
  }

  function getWinnerHandName(winners) {
    const handNames = winners
      .map((winner) => winner.handRankName || winner.handName || null)
      .filter(Boolean);

    if (handNames.length > 0) {
      return [...new Set(handNames)].join(" / ");
    }

    return "Won the Round";
  }

  function getWinnerPrizeAmount(winners, settlement) {
    const playerPrizeTotal = winners.reduce(
      (total, winner) =>
        total +
        Number(winner.prizeAmount || winner.netPrize || winner.amount || 0),
      0,
    );

    if (playerPrizeTotal > 0) {
      return playerPrizeTotal;
    }

    return Number(
      settlement.distributableAmount ||
        settlement.netAmount ||
        settlement.prizeAmount ||
        0,
    );
  }

  function hideWinnerOverlay() {
    clearWinnerTimer();

    DOM.winnerOverlay?.classList.remove("show");
  }

  function showWinnerOverlay(payload = {}) {
    const handId = Number(STATE.hand?.id || STATE.hand?.handId) || null;

    /*
     * একই completed event একাধিকবার এলেও
     * একই overlay দ্বিতীয়বার খুলবে না।
     */
    if (handId && Number(STATE.lastWinnerOverlayHandId) === handId) {
      return;
    }

    if (handId) {
      STATE.lastWinnerOverlayHandId = handId;
    }

    const settlement = getSettlementFromPayload(payload);

    const winners = getWinningPlayers(settlement);

    const grossAmount = Number(
      settlement.grossAmount ||
        settlement.grossPot ||
        settlement.potAmount ||
        STATE.hand?.potAmount ||
        0,
    );

    const serviceChargeAmount = Number(
      settlement.serviceChargeAmount ||
        settlement.serviceCharge ||
        STATE.hand?.serviceChargeAmount ||
        0,
    );

    const winnerPrize =
      getWinnerPrizeAmount(winners, settlement) ||
      Math.max(0, grossAmount - serviceChargeAmount);

    if (DOM.winnerPlayerName) {
      DOM.winnerPlayerName.textContent = getWinnerName(winners);
    }

    if (DOM.winnerHandName) {
      DOM.winnerHandName.textContent = getWinnerHandName(winners);
    }

    if (DOM.winnerAmount) {
      DOM.winnerAmount.textContent = `+${formatMoney(winnerPrize)}`;
    }

    if (DOM.winnerGrossAmount) {
      DOM.winnerGrossAmount.textContent = formatMoney(grossAmount);
    }

    if (DOM.winnerServiceCharge) {
      DOM.winnerServiceCharge.textContent = `-${formatMoney(
        serviceChargeAmount,
      )}`;
    }

    if (DOM.winnerNetAmount) {
      DOM.winnerNetAmount.textContent = formatMoney(winnerPrize);
    }

    DOM.winnerOverlay?.classList.add("show");

    if (DOM.nextRoundText) {
      DOM.nextRoundText.textContent = "New round countdown will begin shortly";
    }

    clearWinnerTimer();

    /*
     * Winner overlay ৪ সেকেন্ড দেখা যাবে।
     * তারপর overlay বন্ধ হয়ে table countdown শুরু হবে।
     */
    STATE.winnerInterval = window.setTimeout(() => {
      STATE.winnerInterval = null;

      DOM.winnerOverlay?.classList.remove("show");

      showRoundCountdown();
    }, WINNER_OVERLAY_DURATION_MS);
  }

  /* =========================================================
     AUDIO MANAGER
  ========================================================= */

  const AUDIO = {};

  function initializeGameAudio() {
    Object.entries(SOUND_PATHS).forEach(([name, source]) => {
      const audio = new Audio(source);

      audio.preload = "auto";

      AUDIO[name] = audio;
    });
  }

  function playSound(soundName, volume = 0.75) {
    if (!STATE.soundEnabled || !AUDIO[soundName]) {
      return;
    }

    const originalAudio = AUDIO[soundName];

    const playableAudio = originalAudio.cloneNode(true);

    playableAudio.volume = Math.max(0, Math.min(1, Number(volume) || 0.75));

    playableAudio.play().catch(() => {
      /*
       * Browser user interaction-এর আগে
       * autoplay block করলে game থামবে না।
       */
    });
  }

  function toggleGameSound() {
    STATE.soundEnabled = !STATE.soundEnabled;

    localStorage.setItem("teenpatti_sound_enabled", String(STATE.soundEnabled));

    if (DOM.soundButton) {
      DOM.soundButton.textContent = STATE.soundEnabled ? "🔊" : "🔇";
    }

    if (STATE.soundEnabled) {
      playSound("chipLand", 0.35);
    }
  }

  /* =========================================================
     CARD DISTRIBUTION ANIMATION
  ========================================================= */

  function createFlyingImage(source, startRectangle) {
    const image = document.createElement("img");

    image.src = source;
    image.alt = "";
    image.draggable = false;

    Object.assign(image.style, {
      position: "fixed",

      left: `${startRectangle.left}px`,

      top: `${startRectangle.top}px`,

      width: `${Math.max(30, startRectangle.width)}px`,

      height: `${Math.max(42, startRectangle.height)}px`,

      zIndex: "25000",

      objectFit: "fill",

      border: "1px solid rgba(255,255,255,.9)",

      borderRadius: "4px",

      boxShadow: "0 8px 18px rgba(0,0,0,.65)",

      pointerEvents: "none",

      transition:
        "left 360ms cubic-bezier(.2,.75,.25,1), top 360ms cubic-bezier(.2,.75,.25,1), transform 360ms ease, opacity 120ms ease",

      transform: "translate(-50%, -50%) scale(.82)",
    });

    document.body.appendChild(image);

    return image;
  }

  function waitForCardDistribution(milliseconds) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, milliseconds);
    });
  }

  async function animateSingleCard(
    targetContainer,
    cardNumber,
    distributionRunId,
  ) {
    if (
      STATE.cardDistributionRunId !== distributionRunId ||
      STATE.cardDistributionActive !== true
    ) {
      return false;
    }

    /*
     * প্রতিবার latest card element নেওয়া হবে।
     */
    const targetCard = targetContainer?.children?.[cardNumber] || null;

    const targetElement = targetCard || targetContainer;

    const deckRectangle = DOM.deck?.getBoundingClientRect();

    const targetRectangle = targetElement?.getBoundingClientRect();

    if (
      !deckRectangle ||
      !targetRectangle ||
      targetRectangle.width <= 0 ||
      targetRectangle.height <= 0
    ) {
      return false;
    }

    const startRectangle = {
      left: deckRectangle.left + deckRectangle.width / 2,

      top: deckRectangle.top + deckRectangle.height / 2,

      width: Math.max(28, deckRectangle.width * 0.72),

      height: Math.max(40, deckRectangle.height * 0.72),
    };

    const flyingCard = createFlyingImage(CARD_BACK_PATH, startRectangle);

    flyingCard.style.transition =
      "left 450ms cubic-bezier(.2,.75,.25,1), " +
      "top 450ms cubic-bezier(.2,.75,.25,1), " +
      "transform 450ms ease, opacity 70ms ease";

    playSound("cardDeal", 0.45);

    /*
     * Browser-কে starting position render করার সময় দেওয়া হবে।
     */
    await new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(resolve);
      });
    });

    if (STATE.cardDistributionRunId !== distributionRunId) {
      flyingCard.remove();
      return false;
    }

    flyingCard.style.left = `${
      targetRectangle.left + targetRectangle.width / 2
    }px`;

    flyingCard.style.top = `${
      targetRectangle.top + targetRectangle.height / 2
    }px`;

    flyingCard.style.transform = "translate(-50%, -50%) scale(1) rotate(5deg)";

    /*
     * এই card পৌঁছানো পর্যন্ত অপেক্ষা করবে।
     */
    await waitForCardDistribution(470);

    if (STATE.cardDistributionRunId !== distributionRunId) {
      flyingCard.remove();
      return false;
    }

    const previousCardCount = Number(
      STATE.cardDistributionProgress.get(targetContainer) || 0,
    );

    STATE.cardDistributionProgress.set(
      targetContainer,
      Math.max(previousCardCount, cardNumber + 1),
    );

    /*
     * State render হয়ে element বদলে গেলেও
     * latest card-টি reveal হবে।
     */
    const latestTargetCard =
      targetContainer?.children?.[cardNumber] || targetCard;

    latestTargetCard?.classList.add("card-arrived");

    flyingCard.style.opacity = "0";

    await waitForCardDistribution(50);

    flyingCard.remove();

    return true;
  }

  async function animateCardDistribution() {
    const occupiedSeats = DOM.seats.filter(
      (seat) => seat.root?.classList.contains("occupied") && seat.cards,
    );

    if (occupiedSeats.length < 2) {
      STATE.cardDistributionActive = false;

      renderActionButtons();
      renderTurnTimer();

      return;
    }

    /*
     * আগের distribution invalid হয়ে যাবে।
     */
    STATE.cardDistributionRunId += 1;

    const distributionRunId = STATE.cardDistributionRunId;

    if (STATE.cardDistributionEndTimeout) {
      clearTimeout(STATE.cardDistributionEndTimeout);

      STATE.cardDistributionEndTimeout = null;
    }

    STATE.cardDistributionActive = true;

    STATE.cardDistributionProgress.clear();

    renderActionButtons();
    renderTurnTimer();

    /*
     * শুরুতে সব card hidden থাকবে।
     */
    occupiedSeats.forEach((seat) => {
      STATE.cardDistributionProgress.set(seat.cards, 0);

      Array.from(seat.cards.children).forEach((card) => {
        card.classList.remove("card-arrived");
      });
    });

    /*
     * Round-robin:
     * সবাইকে প্রথম card,
     * সবাইকে দ্বিতীয় card,
     * সবাইকে তৃতীয় card।
     */
    for (let cardNumber = 0; cardNumber < 3; cardNumber += 1) {
      for (const seat of occupiedSeats) {
        if (STATE.cardDistributionRunId !== distributionRunId) {
          return;
        }

        await animateSingleCard(seat.cards, cardNumber, distributionRunId);
      }
    }

    if (STATE.cardDistributionRunId !== distributionRunId) {
      return;
    }

    /*
     * সব card পৌঁছানোর পর distribution শেষ।
     */
    STATE.cardDistributionActive = false;

    occupiedSeats.forEach((seat) => {
      Array.from(seat.cards.children).forEach((card) => {
        card.classList.add("card-arrived");
      });
    });

    STATE.cardDistributionProgress.clear();

    renderActionButtons();
    renderTurnTimer();
  }
  /* =========================================================
     CHIP-TO-POT ANIMATION
  ========================================================= */

  function findActionPlayerElement(payload = {}) {
    const handPlayerId = Number(
      payload.handPlayerId || payload.action?.handPlayerId || payload.playerId,
    );

    if (handPlayerId > 0) {
      const matchingSeat = DOM.seats.find(
        (seat) => Number(seat.root?.dataset.playerId) === handPlayerId,
      );

      if (matchingSeat?.root) {
        return matchingSeat.root;
      }
    }

    const userId = Number(payload.userId);

    if (userId > 0) {
      const player = STATE.players.find(
        (candidate) => Number(candidate.userId) === userId,
      );

      if (player) {
        const matchingSeat = DOM.seats.find(
          (seat) =>
            Number(seat.root?.dataset.playerId) === Number(player.handPlayerId),
        );

        return matchingSeat?.root || null;
      }
    }

    return null;
  }

  function animateChipToPot(payload = {}) {
    const contributionAmount = Number(
      payload.contributionAmount || payload.action?.contributionAmount || 0,
    );

    if (contributionAmount <= 0) {
      return;
    }

    const playerElement = findActionPlayerElement(payload);

    const potElement = DOM.potAmount?.closest(".tp-pot");

    if (!playerElement || !potElement) {
      return;
    }

    const sourceRectangle = playerElement.getBoundingClientRect();

    const potRectangle = potElement.getBoundingClientRect();

    const chip = document.createElement("img");

    chip.src = CHIP_IMAGE_PATH;
    chip.alt = "";
    chip.draggable = false;

    Object.assign(chip.style, {
      position: "fixed",

      left: `${sourceRectangle.left + sourceRectangle.width / 2}px`,

      top: `${sourceRectangle.top + sourceRectangle.height / 2}px`,

      width: "34px",
      height: "34px",

      zIndex: "26000",

      objectFit: "contain",

      borderRadius: "50%",

      pointerEvents: "none",

      filter: "drop-shadow(0 6px 8px rgba(0,0,0,.7))",

      transition:
        "left 420ms cubic-bezier(.22,.75,.24,1), top 420ms cubic-bezier(.22,.75,.24,1), transform 420ms ease, opacity 140ms ease",

      transform: "translate(-50%, -50%) scale(.8)",
    });

    document.body.appendChild(chip);

    playSound("chipThrow", 0.65);

    requestAnimationFrame(() => {
      chip.style.left = `${potRectangle.left + potRectangle.width / 2}px`;

      chip.style.top = `${potRectangle.top + potRectangle.height / 2}px`;

      chip.style.transform = "translate(-50%, -50%) scale(1.08) rotate(300deg)";
    });

    window.setTimeout(() => {
      playSound("chipLand", 0.7);

      potElement.classList.add("pot-chip-bounce");

      window.setTimeout(() => {
        potElement.classList.remove("pot-chip-bounce");
      }, 340);

      chip.style.opacity = "0";

      window.setTimeout(() => chip.remove(), 150);
    }, 430);
  }

  /* =========================================================
     PLAYER ACTION WRAPPER
  ========================================================= */

  async function performPlayerAction(eventName, payload = {}, options = {}) {
    if (STATE.actionPending) {
      return null;
    }

    if (!STATE.socketConnected || !STATE.socketJoined) {
      showToast("Teen Patti server connected নয়।", "error");

      return null;
    }

    STATE.actionPending = true;
    renderActionButtons();

    try {
      const response = await emitWithAcknowledgement(eventName, {
        tableId: STATE.tableId,
        ...payload,
      });

      /*
       * Local player-এর bet acknowledgement থেকে
       * সরাসরি chip animation ও sound চালাবে।
       */
      if (["hand:bet", "hand:show"].includes(eventName)) {
        const localAction = response?.data?.action || response?.data || {};

        const contributionAmount = Number(localAction.contributionAmount || 0);

        if (contributionAmount > 0) {
          const localPlayer = getLocalPlayer();

          animateChipToPot({
            handPlayerId: localPlayer?.handPlayerId || STATE.myHandPlayerId,

            userId: localPlayer?.userId,

            contributionAmount,
          });
        }
      }

      if (options.successMessage) {
        showToast(options.successMessage, "success", 1800);
      }

      /*
       * Server broadcast আসার আগেই যদি response-এ
       * private state থাকে, সেটিও process করবে।
       */
      if (response?.data?.handState) {
        applyPrivateHandState(response.data.handState);
      }

      await requestLatestHandState();

      return response;
    } catch (error) {
      console.error(`TEEN PATTI ${eventName} ERROR:`, error);

      showToast(
        error.message || options.errorMessage || "Teen Patti action failed.",
        "error",
      );

      return null;
    } finally {
      STATE.actionPending = false;
      renderActionButtons();
    }
  }

  /* =========================================================
     SEE PRIVATE CARDS
  ========================================================= */

  async function handleSeeCards() {
    const localPlayer = getLocalPlayer();

    if (!localPlayer) {
      showToast("Local player পাওয়া যায়নি।", "error");

      return;
    }

    if (localPlayer.isSeen) {
      STATE.cardsRevealed = true;
      renderGameState();
      return;
    }

    const response = await performPlayerAction(
      "hand:see-cards",
      {},
      {
        successMessage: "Cards দেখা হয়েছে।",
      },
    );

    if (!response) {
      return;
    }

    STATE.cardsRevealed = true;

    if (Array.isArray(response.data?.cards)) {
      STATE.myCards = response.data.cards;
    }

    if (Array.isArray(response.data?.myCards)) {
      STATE.myCards = response.data.myCards;
    }

    renderGameState();
  }

  /* =========================================================
     BLIND / CHAAL
  ========================================================= */

  async function handleBetAction() {
    const localPlayer = getLocalPlayer();

    const action = localPlayer?.isSeen ? "chaal" : "blind";

    await performPlayerAction(
      "hand:bet",
      {
        action,
      },
      {
        successMessage:
          action === "blind" ? "Blind দেওয়া হয়েছে।" : "Chaal দেওয়া হয়েছে।",
      },
    );
  }

  /* =========================================================
     RAISE
  ========================================================= */

  async function handleRaiseAction() {
    const localPlayer = getLocalPlayer();

    await performPlayerAction(
      "hand:bet",
      {
        action: "raise",
      },
      {
        successMessage: localPlayer?.isSeen
          ? "Seen Chaal raise হয়েছে।"
          : "Blind raise হয়েছে।",
      },
    );
  }

  /* =========================================================
     PACK
  ========================================================= */

  async function handlePackAction() {
    await performPlayerAction(
      "hand:pack",
      {},
      {
        successMessage: "আপনি hand Pack করেছেন।",
      },
    );
  }

  /* =========================================================
     SHOW
  ========================================================= */

  async function handleShowAction() {
    const activePlayers = STATE.players.filter(
      (player) =>
        normalizeString(player.status || player.playerStatus) === "active",
    );

    if (activePlayers.length !== 2) {
      showToast("Show করতে ঠিক ২ জন active player থাকতে হবে।", "error");

      return;
    }

    await performPlayerAction(
      "hand:show",
      {},
      {
        successMessage: "Show request completed.",
      },
    );
  }

  /* =========================================================
     SIDE SHOW REQUEST
  ========================================================= */

  async function handleSideShowRequest() {
    const activePlayers = STATE.players.filter(
      (player) =>
        normalizeString(player.status || player.playerStatus) === "active",
    );

    if (activePlayers.length < 3) {
      showToast(
        "Side Show-এর জন্য কমপক্ষে ৩ জন active player প্রয়োজন।",
        "error",
      );

      return;
    }

    const response = await performPlayerAction(
      "side-show:request",
      {},
      {
        successMessage: "Side Show request পাঠানো হয়েছে।",
      },
    );

    if (!response) {
      return;
    }

    if (response.data?.pendingSideShow) {
      STATE.pendingSideShow = response.data.pendingSideShow;
    }

    renderActionButtons();
  }

  /* =========================================================
     SAFE TABLE EXIT
  ========================================================= */

  async function leaveTeenPattiTableThroughHttp() {
    const response = await fetch(
      window.APP_CONFIG.api(`/teenpatti/table/${STATE.tableId}/leave`),
      {
        method: "POST",

        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    const result = await response.json().catch(() => ({}));

    if (!response.ok || result?.success !== true) {
      const error = new Error(
        result?.message || "HTTP দিয়ে Teen Patti table clear করা যায়নি।",
      );

      error.statusCode = response.status;
      error.code = result?.code || "TABLE_HTTP_LEAVE_FAILED";

      throw error;
    }

    return result;
  }

  async function leaveTeenPattiTable() {
    if (STATE.leavingTable) {
      return;
    }

    STATE.leavingTable = true;

    disableAllActions();
    setButtonDisabled(DOM.exitButton, true);
    setButtonDisabled(DOM.backButton, true);

    try {
      let serverLeaveCompleted = false;

      /*
       * প্রথমে দ্রুত Socket.IO exit চেষ্টা করবে।
       */
      if (STATE.socket && STATE.socket.connected && STATE.socketJoined) {
        try {
          await emitWithAcknowledgement(
            "table:leave",
            {
              tableId: STATE.tableId,
            },
            8000,
          );

          serverLeaveCompleted = true;
        } catch (socketError) {
          console.warn(
            "Socket table exit failed; using HTTP fallback:",
            socketError,
          );
        }
      }

      /*
       * Socket disconnected অথবা acknowledgement fail হলে
       * authenticated HTTP route table clear করবে।
       */
      if (!serverLeaveCompleted) {
        await leaveTeenPattiTableThroughHttp();
      }

      STATE.socketJoined = false;

      clearTurnTimer();
      clearWinnerRevealTimer();
      clearWinnerTimer();
      clearRoundCountdownTimer();
      clearMatchmakingTimer();

      hideWinnerOverlay();
      hideRoundCountdown();

      localStorage.removeItem("current_table");
      localStorage.removeItem("selected_teenpatti_room");

      if (STATE.socket) {
        STATE.socket.disconnect();
      }

      window.location.replace(ROOMS_PAGE_PATH);
    } catch (error) {
      console.error("TEEN PATTI TABLE EXIT ERROR:", error);

      STATE.leavingTable = false;

      setButtonDisabled(DOM.exitButton, false);
      setButtonDisabled(DOM.backButton, false);

      renderActionButtons();

      showToast(error.message || "Table থেকে বের হওয়া যায়নি।", "error");
    }
  }

  /* =========================================================
     BUTTON EVENT BINDING
  ========================================================= */

  function bindGameActionEvents() {
    DOM.seenButton?.addEventListener("click", handleSeeCards);

    DOM.betButton?.addEventListener("click", handleBetAction);

    DOM.raiseButton?.addEventListener("click", handleRaiseAction);

    DOM.packButton?.addEventListener("click", handlePackAction);

    DOM.showButton?.addEventListener("click", handleShowAction);

    DOM.sideShowButton?.addEventListener("click", handleSideShowRequest);

    DOM.acceptSideShowButton?.addEventListener("click", () => {
      respondToSideShow("accepted");
    });

    DOM.rejectSideShowButton?.addEventListener("click", () => {
      respondToSideShow("rejected");
    });

    DOM.backButton?.addEventListener("click", leaveTeenPattiTable);

    DOM.exitButton?.addEventListener("click", leaveTeenPattiTable);

    DOM.soundButton?.addEventListener("click", toggleGameSound);
  }

  /* =========================================================
     INITIALIZATION
  ========================================================= */

  function initializeTeenPattiGame() {
    disableAllActions();

    if (!validateFrontendRequirements()) {
      return;
    }

    if (DOM.soundButton) {
      DOM.soundButton.textContent = STATE.soundEnabled ? "🔊" : "🔇";
    }

    initializeGameAudio();
    bindGameActionEvents();
    createSocketConnection();

    console.log("✅ PMS ADDA new Teen Patti frontend base loaded", {
      tableId: STATE.tableId,
      socketUrl: window.APP_CONFIG.TEEN_PATTI_SOCKET_URL,
    });
  }

  document.addEventListener("DOMContentLoaded", initializeTeenPattiGame, {
    once: true,
  });
})();
