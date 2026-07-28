/* ==========================================
   PMS ADDA
   Ludo Room Selection
========================================== */

document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  /* ==================================
           Configuration
        ================================== */

  const API_TIMEOUT_MS = 15000;

  const ROOM_AMOUNTS = Object.freeze([50, 100, 200, 250, 500, 1000]);

  /* ==================================
           DOM Elements
        ================================== */

  const elements = {
    roomGrid: document.getElementById("roomGrid"),

    modeSelector: document.getElementById("ludoPlayerMode"),

    walletBalance: document.getElementById("walletBalance"),

    backBtn: document.getElementById("backBtn"),

    refreshBalanceBtn: document.getElementById("refreshBalanceBtn"),

    loaderOverlay: document.getElementById("loaderOverlay"),

    loaderMessage: document.getElementById("loaderMessage"),

    toast: document.getElementById("toast"),

    toastMessage: document.getElementById("toastMessage"),

    toastIcon: document.getElementById("toastIcon"),
  };

  /* ==================================
           State
        ================================== */

  const state = {
    user: null,

    playerMode: 2,

    isJoining: false,

    toastTimer: null,
  };

  /* ==================================
           Storage
        ================================== */

  function getAccessToken() {
    return localStorage.getItem("access_token");
  }

  function getStoredUser() {
    const storedUser = localStorage.getItem("current_user");

    if (!storedUser) {
      return null;
    }

    try {
      return JSON.parse(storedUser);
    } catch (error) {
      console.error("Invalid current_user:", error);

      localStorage.removeItem("current_user");

      return null;
    }
  }

  function saveCurrentUser(user) {
    localStorage.setItem("current_user", JSON.stringify(user));
  }

  function clearLudoStorage() {
    localStorage.removeItem("selected_ludo_room");

    localStorage.removeItem("current_ludo_table");
  }

  /* ==================================
           Money Helpers
        ================================== */

  function toValidAmount(value) {
    const amount = Number(value);

    if (!Number.isFinite(amount) || amount < 0) {
      return 0;
    }

    return amount;
  }

  function formatMoney(value) {
    return toValidAmount(value).toLocaleString("en-BD", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function getWalletBalance() {
    return toValidAmount(state.user?.walletBalance);
  }

  /* ==================================
           Authentication
        ================================== */

  function redirectToLogin() {
    localStorage.removeItem("access_token");

    localStorage.removeItem("current_user");

    window.location.replace("login.html");
  }

  function initializeUser() {
    const token = getAccessToken();

    const user = getStoredUser();

    if (!token || !user) {
      redirectToLogin();

      return false;
    }

    state.user = user;

    return true;
  }

  /* ==================================
           UI Helpers
        ================================== */

  function updateBalanceUI() {
    elements.walletBalance.textContent = formatMoney(getWalletBalance());
  }

  function showLoader(message = "Please wait...") {
    elements.loaderMessage.textContent = message;

    elements.loaderOverlay.classList.add("is-visible");

    elements.loaderOverlay.setAttribute("aria-hidden", "false");
  }

  function hideLoader() {
    elements.loaderOverlay.classList.remove("is-visible");

    elements.loaderOverlay.setAttribute("aria-hidden", "true");
  }

  function showToast(message, type = "info") {
    if (state.toastTimer) {
      window.clearTimeout(state.toastTimer);
    }

    elements.toast.classList.remove("is-error", "is-success", "is-visible");

    elements.toastMessage.textContent = message;

    if (type === "error") {
      elements.toast.classList.add("is-error");

      elements.toastIcon.className = "fa-solid fa-circle-exclamation";
    } else if (type === "success") {
      elements.toast.classList.add("is-success");

      elements.toastIcon.className = "fa-solid fa-circle-check";
    } else {
      elements.toastIcon.className = "fa-solid fa-circle-info";
    }

    window.requestAnimationFrame(() => {
      elements.toast.classList.add("is-visible");
    });

    state.toastTimer = window.setTimeout(() => {
      elements.toast.classList.remove("is-visible");
    }, 2800);
  }

  function setRefreshLoading(isLoading) {
    elements.refreshBalanceBtn.disabled = isLoading;

    elements.refreshBalanceBtn.classList.toggle("is-loading", isLoading);
  }

  /* ==================================
           API Helper
        ================================== */

  async function apiRequest(endpoint, options = {}) {
    const controller = new AbortController();

    const timeoutId = window.setTimeout(() => {
      controller.abort();
    }, API_TIMEOUT_MS);

    try {
      const token = getAccessToken();

      const response = await fetch(APP_CONFIG.api(endpoint), {
        ...options,

        headers: {
          Accept: "application/json",

          ...(options.body
            ? {
                "Content-Type": "application/json",
              }
            : {}),

          Authorization: `Bearer ${token}`,

          ...(options.headers || {}),
        },

        signal: controller.signal,
      });

      let result = null;

      try {
        result = await response.json();
      } catch (error) {
        result = null;
      }

      if (response.status === 401) {
        redirectToLogin();

        throw new Error("Session expired");
      }

      if (!response.ok) {
        throw new Error(result?.message || result?.error || "Request failed");
      }

      return result;
    } catch (error) {
      if (error.name === "AbortError") {
        throw new Error("Server response timeout");
      }

      throw error;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  /* ==================================
           Room Rendering
        ================================== */

  function createRoomCard(entryAmount) {
    const hasEnoughBalance = getWalletBalance() >= entryAmount;

    const potentialPrize = entryAmount * state.playerMode;

    const card = document.createElement("article");

    card.className = "tp-room-card";

    if (!hasEnoughBalance) {
      card.classList.add("is-unavailable");
    }

    const statusText = hasEnoughBalance
      ? "Ready to play"
      : `Minimum ৳${entryAmount} required`;

    card.innerHTML = `
                <div class="tp-room-top">

                    <div>

                        <p class="tp-room-label">
                            ENTRY AMOUNT
                        </p>

                        <h3 class="tp-boot-amount">
                            ৳${entryAmount.toLocaleString("en-BD")}
                        </h3>

                        <div class="ludo-room-colors">
                            <span class="ludo-color-red"></span>
                            <span class="ludo-color-green"></span>
                            <span class="ludo-color-yellow"></span>
                            <span class="ludo-color-blue"></span>
                        </div>

                    </div>

                    <div class="tp-room-icon ludo-room-icon">

                        <i class="fa-solid fa-dice-six"></i>

                    </div>

                </div>

                <div class="tp-room-details">

                    <div class="tp-room-stat">

                        <span>Players</span>

                        <strong>
    ${state.playerMode}
</strong>

                    </div>

                    <div class="tp-room-stat">

                        <span>Base Prize</span>

                        <strong>
                            ৳${potentialPrize.toLocaleString("en-BD")}
                        </strong>

                    </div>

                </div>

                <div class="tp-room-status">

                    <span class="tp-room-status-dot"></span>

                    <span>
                        ${statusText}
                    </span>

                </div>

                <button
                    type="button"
                    class="tp-join-button"
                    data-entry-amount="${entryAmount}"
                    ${hasEnoughBalance ? "" : "disabled"}
                >

                    <i class="fa-solid fa-play"></i>

                    <span>
                        ${hasEnoughBalance ? "Play Now" : "Low Balance"}
                    </span>

                </button>
            `;

    return card;
  }

  function renderRooms() {
    const fragment = document.createDocumentFragment();

    ROOM_AMOUNTS.forEach((entryAmount) => {
      fragment.appendChild(createRoomCard(entryAmount));
    });

    elements.roomGrid.replaceChildren(fragment);
  }

  /* ==================================
           Latest User Data
        ================================== */

  async function loadLatestUserData({ showFeedback = false } = {}) {
    setRefreshLoading(true);

    try {
      const result = await apiRequest("/auth/me");

      const user = result?.data?.user;

      if (!user) {
        throw new Error("Unable to load account information");
      }

      state.user = user;

      saveCurrentUser(user);

      updateBalanceUI();

      renderRooms();

      if (showFeedback) {
        showToast("Balance updated", "success");
      }
    } catch (error) {
      console.error("Load user error:", error);

      if (showFeedback) {
        showToast(error.message || "Unable to update balance", "error");
      }
    } finally {
      setRefreshLoading(false);
    }
  }

  /* ==================================
           Room Selection
        ================================== */

  function validateEntryAmount(entryAmount) {
    return ROOM_AMOUNTS.includes(entryAmount);
  }

  function saveSelectedRoom(entryAmount) {
    const roomData = {
      game: "ludo",

      entryAmount,

      playerMode: state.playerMode,

      selectedAt: new Date().toISOString(),
    };

    localStorage.setItem("selected_ludo_room", JSON.stringify(roomData));
  }

  async function joinRoom(entryAmount) {
    if (state.isJoining) {
      return;
    }

    const amount = Number(entryAmount);

    if (!validateEntryAmount(amount)) {
      showToast("Invalid room selected", "error");

      return;
    }

    if (getWalletBalance() < amount) {
      showToast(
        `Minimum ৳${amount.toLocaleString("en-BD")} balance required`,
        "error",
      );

      return;
    }

    state.isJoining = true;

    showLoader(`Finding ৳${amount.toLocaleString("en-BD")} Ludo match...`);

    try {
      const result = await apiRequest("/ludo/matchmaking/join", {
        method: "POST",

        body: JSON.stringify({
          entryAmount: amount,
          playerMode: state.playerMode,
        }),
      });

      const matchState = result?.data;

      const match = matchState?.match;

      const matchId = Number(match?.id);

      if (!Number.isInteger(matchId) || matchId <= 0) {
        throw new Error("Valid Ludo match ID পাওয়া যায়নি");
      }

      const selectedRoom = {
        game: "ludo",

        entryAmount: Number(match.entryAmount || amount),

        playerMode: Number(
          match.requestedPlayerMode || match.playerMode || state.playerMode,
        ),

        matchId,

        matchCode: match.matchCode || null,

        matchStatus: match.status || "waiting",

        selectedAt: new Date().toISOString(),
      };

      const currentTable = {
        matchId,

        match: matchState.match,

        players: Array.isArray(matchState.players) ? matchState.players : [],

        matchmaking: matchState.matchmaking || {},

        joinedPlayer: matchState.joinedPlayer || null,

        savedAt: new Date().toISOString(),
      };

      localStorage.setItem("selected_ludo_room", JSON.stringify(selectedRoom));

      localStorage.setItem("current_ludo_table", JSON.stringify(currentTable));

      /*
       * Match full হলে backend entry fee debit করে।
       * Response-এর player list থেকে local user-এর
       * নতুন wallet balance পাওয়া গেলে current_user
       * storage update করা হচ্ছে।
       */
      const currentUserId = Number(state.user?.id);

      const localMatchPlayer = currentTable.players.find(
        (player) => Number(player.userId) === currentUserId,
      );

      if (
        localMatchPlayer &&
        Number.isFinite(Number(localMatchPlayer.walletBalance))
      ) {
        state.user = {
          ...state.user,

          walletBalance: Number(localMatchPlayer.walletBalance),
        };

        saveCurrentUser(state.user);
      }

      showLoader(
        match.status === "waiting"
          ? "Waiting for another player..."
          : "Opening Ludo table...",
      );

      window.location.assign(
        `./ludo-table.html?matchId=${encodeURIComponent(
          matchId,
        )}&entryAmount=${encodeURIComponent(selectedRoom.entryAmount)}`,
      );
    } catch (error) {
      console.error("Ludo matchmaking error:", error);

      state.isJoining = false;

      hideLoader();

      showToast(error.message || "Ludo matchmaking failed", "error");
    }
  }

  /* ==================================
           Events
        ================================== */

  function handleRoomGridClick(event) {
    const button = event.target.closest(".tp-join-button");

    if (!button || button.disabled || state.isJoining) {
      return;
    }

    const entryAmount = Number(button.dataset.entryAmount);

    joinRoom(entryAmount);
  }

  elements.modeSelector?.addEventListener("click", (event) => {
    const button = event.target.closest(".ludo-mode-button");

    if (!button || state.isJoining) {
      return;
    }

    const selectedMode = Number(button.dataset.playerMode);

    if (selectedMode !== 2 && selectedMode !== 4) {
      return;
    }

    state.playerMode = selectedMode;

    elements.modeSelector
      .querySelectorAll(".ludo-mode-button")
      .forEach((modeButton) => {
        const isActive = Number(modeButton.dataset.playerMode) === selectedMode;

        modeButton.classList.toggle("is-active", isActive);

        modeButton.setAttribute("aria-pressed", String(isActive));
      });

    renderRooms();

    showToast(`${selectedMode}-player Ludo selected`, "success");
  });

  elements.roomGrid.addEventListener("click", handleRoomGridClick);

  elements.backBtn.addEventListener("click", () => {
    window.location.href = "lobby.html";
  });

  elements.refreshBalanceBtn.addEventListener("click", () => {
    loadLatestUserData({
      showFeedback: true,
    });
  });

  /* ==================================
           Start
        ================================== */

  if (!initializeUser()) {
    return;
  }

  updateBalanceUI();

  renderRooms();

  loadLatestUserData();
});
