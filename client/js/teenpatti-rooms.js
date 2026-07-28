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
  const POT_LIMIT_MULTIPLIER = 120;

  function getPotLimit(bootAmount) {
    return bootAmount * POT_LIMIT_MULTIPLIER;
  }
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
    localStorage.removeItem("selected_teenpatti_room");
    localStorage.removeItem("current_table");
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

  function createRoomCard(bootAmount) {
    const blindAmount = bootAmount;

    const chaalAmount = blindAmount * 2;

    const potLimit = getPotLimit(bootAmount);

    const hasEnoughBalance = getWalletBalance() >= bootAmount;

    const card = document.createElement("article");

    card.className = "tp-room-card";

    if (!hasEnoughBalance) {
      card.classList.add("is-unavailable");
    }

    const statusText = hasEnoughBalance
      ? "Ready to join"
      : `Minimum ৳${bootAmount} required`;

    card.innerHTML = `
      <div class="tp-room-top">

        <div>

          <p class="tp-room-label">
            BOOT AMOUNT
          </p>

          <h3 class="tp-boot-amount">
            ৳${bootAmount.toLocaleString("en-BD")}
          </h3>

        </div>

        <div class="tp-room-icon">

          <i class="fa-solid fa-coins"></i>

        </div>

      </div>

      <div class="tp-room-details">

        <div class="tp-room-stat">

          <span>Blind</span>

          <strong>
            ৳${blindAmount.toLocaleString("en-BD")}
          </strong>

        </div>

        <div class="tp-room-stat">

          <span>Chaal</span>

          <strong>
            ৳${chaalAmount.toLocaleString("en-BD")}
          </strong>

        </div>
        <div class="tp-room-stat tp-pot-limit-stat">

  <span>Pot Limit</span>

  <strong>
    ৳${potLimit.toLocaleString("en-BD")}
  </strong>

</div>

      </div>

      <div class="tp-room-status">

        <span class="tp-room-status-dot"></span>

        <span>${statusText}</span>

      </div>

      <button
        type="button"
        class="tp-join-button"
        data-boot-amount="${bootAmount}"
        ${hasEnoughBalance ? "" : "disabled"}>

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

  function saveSelectedRoom(bootAmount) {
    const roomData = {
      bootAmount,

      blindAmount: bootAmount,

      chaalAmount: bootAmount * 2,

      potLimit: getPotLimit(bootAmount),


      selectedAt: new Date().toISOString(),
    };

    localStorage.setItem("selected_teenpatti_room", JSON.stringify(roomData));
  }

  async function joinRoom(bootAmount) {
    if (state.isJoining) {
      return;
    }

    if (!validateBootAmount(bootAmount)) {
      showToast("Invalid room selected", "error");

      return;
    }

    if (getWalletBalance() < bootAmount) {
      showToast(
        `Minimum ৳${bootAmount.toLocaleString("en-BD")} balance required`,
        "error",
      );

      return;
    }

    state.isJoining = true;

    showLoader(`Joining ৳${bootAmount.toLocaleString("en-BD")} room...`);

    try {
      clearGameStorage();

      const result = await apiRequest("/teenpatti/matchmaking/join", {
        method: "POST",

        body: JSON.stringify({
          bootAmount,
        }),
      });

      const tableData = result?.data;

      if (!tableData?.tableId) {
        throw new Error("Invalid table information received");
      }

      saveSelectedRoom(bootAmount);

      localStorage.setItem("current_table", JSON.stringify(tableData));

      const tableId = encodeURIComponent(tableData.tableId);

      window.location.href = `teenpatti-table.html?tableId=${tableId}`;
    } catch (error) {
      console.error("Join room error:", error);

      showToast(error.message || "Unable to join the room", "error");
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

    const bootAmount = Number(button.dataset.bootAmount);

    joinRoom(bootAmount);
  }

  elements.roomGrid.addEventListener("click", handleRoomGridClick);

  elements.backBtn.addEventListener("click", () => {
    if (state.isJoining) {
      return;
    }

    window.location.href = "lobby.html";
  });

  elements.refreshBalanceBtn.addEventListener("click", () => {
    loadLatestUserData({
      showFeedback: true,
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !state.isJoining) {
      window.location.href = "lobby.html";
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

    console.log("PMS ADDA Teen Patti Rooms initialized");
  }

  initialize();
});
