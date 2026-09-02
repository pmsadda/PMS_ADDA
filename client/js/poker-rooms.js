/* ==========================================
   PMS ADDA
   Teen Patti Room Selection
   Version 1.0.0
========================================== */

document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  /* ==========================================
     Configuration
  ========================================== */

  const API_BASE_URL = APP_CONFIG.API_URL;

  const API_TIMEOUT_MS = 15000;

  const ROOM_AMOUNTS = Object.freeze([5, 10, 20, 30, 50, 100, 200, 500, 1000]);

  /* ==========================================
     DOM Elements
  ========================================== */

  const elements = {
    roomGrid: document.getElementById("roomGrid"),

    walletBalance: document.getElementById("walletBalance"),

    backBtn: document.getElementById("backBtn"),

    refreshBalanceBtn: document.getElementById("refreshBalanceBtn"),

    loaderOverlay: document.getElementById("loaderOverlay"),

    loaderMessage: document.getElementById("loaderMessage"),

    toast: document.getElementById("toast"),

    toastMessage: document.getElementById("toastMessage"),

    toastIcon: document.getElementById("toastIcon"),
  };

  /* ==========================================
     State
  ========================================== */

  const state = {
    user: null,

    isJoining: false,

    toastTimer: null,
  };

  /* ==========================================
     Storage Helpers
  ========================================== */

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
      console.error("Invalid current_user data:", error);

      localStorage.removeItem("current_user");

      return null;
    }
  }

  function saveCurrentUser(user) {
    localStorage.setItem("current_user", JSON.stringify(user));
  }

  function clearGameStorage() {
    localStorage.removeItem("selected_poker_room");

    localStorage.removeItem("current_poker_table");
  }

  /* ==========================================
     Number Helpers
  ========================================== */

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

  /* ==========================================
     Authentication Guard
  ========================================== */

  function redirectToLogin() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("current_user");

    window.location.replace("/login");
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

  /* ==========================================
     UI Helpers
  ========================================== */

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

  /* ==========================================
     API Helper
  ========================================== */

  async function apiRequest(endpoint, options = {}) {
    const controller = new AbortController();

    const timeoutId = window.setTimeout(() => {
      controller.abort();
    }, API_TIMEOUT_MS);

    try {
      const token = getAccessToken();

      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
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
        const message = result?.message || result?.error || "Request failed";

        const requestError = new Error(message);

        requestError.status = response.status;

        throw requestError;
      }

      return result;
    } catch (error) {
      if (error.name === "AbortError") {
        throw new Error("Server response timeout. Please try again.");
      }

      throw error;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  /* ==========================================
     Room Rendering
  ========================================== */

  function createRoomCard(bigBlind) {
    const smallBlind = bigBlind / 2;

    const minimumBuyIn = bigBlind * 20;

    const maximumBuyIn = bigBlind * 100;

    const hasEnoughBalance = getWalletBalance() >= minimumBuyIn;

    const card = document.createElement("article");

    card.className = "tp-room-card";

    if (!hasEnoughBalance) {
      card.classList.add("is-unavailable");
    }

    const statusText = hasEnoughBalance
      ? "Ready to join"
      : `Minimum ৳${minimumBuyIn.toLocaleString("en-BD")} required`;

    card.innerHTML = `
    <div class="tp-room-top">

      <div>

        <p class="tp-room-label">
          BIG BLIND
        </p>

        <h3 class="tp-boot-amount">
          ৳${bigBlind.toLocaleString("en-BD")}
        </h3>

      </div>

      <div class="tp-room-icon">
        <i class="fa-solid fa-diamond"></i>
      </div>

    </div>

    <div class="tp-room-details">

      <div class="tp-room-stat">
        <span>Small Blind</span>

        <strong>
          ৳${smallBlind.toLocaleString("en-BD")}
        </strong>
      </div>

      <div class="tp-room-stat">
        <span>Minimum Buy-in</span>

        <strong>
          ৳${minimumBuyIn.toLocaleString("en-BD")}
        </strong>
      </div>

    </div>

    <div class="tp-room-status">

      <span class="tp-room-status-dot">
      </span>

      <span>${statusText}</span>

    </div>

    <button
      type="button"
      class="tp-join-button"
      data-boot-amount="${bigBlind}"
      data-buy-in-amount="${minimumBuyIn}"
      ${hasEnoughBalance ? "" : "disabled"}>

      <i class="fa-solid fa-play"></i>

      <span>
        ${hasEnoughBalance ? "Play Poker" : "Low Balance"}
      </span>

    </button>
  `;

    card.dataset.maximumBuyIn = String(maximumBuyIn);

    return card;
  }

  function renderRooms() {
    const fragment = document.createDocumentFragment();

    ROOM_AMOUNTS.forEach((bootAmount) => {
      fragment.appendChild(createRoomCard(bootAmount));
    });

    elements.roomGrid.replaceChildren(fragment);
  }

  /* ==========================================
     User Data
  ========================================== */

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
        showToast("Balance updated successfully", "success");
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

  /* ==========================================
     Matchmaking
  ========================================== */

  function validateBootAmount(bootAmount) {
    return ROOM_AMOUNTS.includes(bootAmount);
  }

  function saveSelectedRoom(bigBlind, buyInAmount) {
    const roomData = {
      bigBlind,

      smallBlind: bigBlind / 2,

      buyInAmount,

      minimumBuyIn: bigBlind * 20,

      maximumBuyIn: bigBlind * 100,

      selectedAt: new Date().toISOString(),
    };

    localStorage.setItem("selected_poker_room", JSON.stringify(roomData));
  }

  async function joinRoom(bigBlind, buyInAmount) {
    if (state.isJoining) {
      return;
    }

    if (!validateBootAmount(bigBlind)) {
      showToast("Invalid Poker room selected", "error");

      return;
    }

    const minimumBuyIn = bigBlind * 20;

    const maximumBuyIn = bigBlind * 100;

    const validBuyIn = Number(buyInAmount);

    if (
      !Number.isFinite(validBuyIn) ||
      validBuyIn < minimumBuyIn ||
      validBuyIn > maximumBuyIn
    ) {
      showToast(
        `Buy-in must be between ৳${minimumBuyIn.toLocaleString(
          "en-BD",
        )} and ৳${maximumBuyIn.toLocaleString("en-BD")}`,
        "error",
      );

      return;
    }

    if (getWalletBalance() < validBuyIn) {
      showToast(
        `Minimum ৳${validBuyIn.toLocaleString("en-BD")} balance required`,
        "error",
      );

      return;
    }

    state.isJoining = true;

    showLoader(`Joining ৳${bigBlind.toLocaleString("en-BD")} Poker room...`);

    try {
      clearGameStorage();

      const result = await apiRequest("/poker/matchmaking/join", {
        method: "POST",

        body: JSON.stringify({
          bigBlind,

          buyInAmount: validBuyIn,
        }),
      });

      const tableData = result?.data;

      if (!tableData?.tableId) {
        throw new Error("Invalid Poker table information received");
      }

      saveSelectedRoom(bigBlind, validBuyIn);

      localStorage.setItem("current_poker_table", JSON.stringify(tableData));

      const tableId = encodeURIComponent(tableData.tableId);

      window.location.href = `/poker-table?tableId=${tableId}`;
    } catch (error) {
      console.error("Join Poker room error:", error);

      showToast(error.message || "Unable to join Poker room", "error");
    } finally {
      state.isJoining = false;

      hideLoader();
    }
  }

  /* ==========================================
     Events
  ========================================== */

  function handleRoomGridClick(event) {
    const button = event.target.closest(".tp-join-button");

    if (!button || button.disabled || state.isJoining) {
      return;
    }

    const bigBlind = Number(button.dataset.bootAmount);

    const buyInAmount = Number(button.dataset.buyInAmount);

    joinRoom(bigBlind, buyInAmount);
  }

  elements.roomGrid.addEventListener("click", handleRoomGridClick);

  elements.backBtn.addEventListener("click", () => {
    if (state.isJoining) {
      return;
    }

    window.location.href = "lobby";
  });

  elements.refreshBalanceBtn.addEventListener("click", () => {
    loadLatestUserData({
      showFeedback: true,
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !state.isJoining) {
      window.location.href = "lobby";
    }
  });

  /* ==========================================
     Initialize
  ========================================== */

  function initialize() {
    if (!initializeUser()) {
      return;
    }

    clearGameStorage();

    updateBalanceUI();

    renderRooms();

    loadLatestUserData();

    console.log("PMS ADDA Poker Rooms initialized");
  }

  initialize();
});
