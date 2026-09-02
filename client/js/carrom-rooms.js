/* ==========================================
   PMS ADDA
   Carrom Room Selection Frontend
========================================== */

document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  /* ==================================
     Configuration
  ================================== */

  const API_TIMEOUT_MS = 15000;

  /* ==================================
     DOM Elements
  ================================== */

  const elements = {
    roomGrid: document.getElementById("roomGrid"),

    modeSelector: document.getElementById("carromPlayerMode"),

    walletBalance: document.getElementById("walletBalance"),

    serviceChargePreview: document.getElementById("serviceChargePreview"),

    emptyState: document.getElementById("emptyState"),

    retryRoomsBtn: document.getElementById("retryRoomsBtn"),

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

    rooms: [],

    playerMode: 2,

    isLoadingRooms: false,

    isSelectingRoom: false,

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

  function saveSelectedRoom(room) {
    const selectedRoom = {
      game: "carrom",

      roomId: Number(room.id),

      roomCode: room.roomCode,

      roomName: room.roomName,

      entryAmount: Number(room.entryAmount),

      playerMode: state.playerMode,

      serviceChargePercent: Number(room.serviceChargePercent),

      selectedAt: new Date().toISOString(),
    };

    localStorage.setItem("selected_carrom_room", JSON.stringify(selectedRoom));

    return selectedRoom;
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

  function roundMoney(value) {
    return Number(toValidAmount(value).toFixed(2));
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

  function calculateRoomMoney(room) {
    const entryAmount = toValidAmount(room.entryAmount);

    const playerCount = Number(state.playerMode);

    const serviceChargePercent = toValidAmount(room.serviceChargePercent);

    const grossPot = roundMoney(entryAmount * playerCount);

    const serviceChargeAmount = roundMoney(
      (grossPot * serviceChargePercent) / 100,
    );

    const winnerPrize = roundMoney(grossPot - serviceChargeAmount);

    return {
      entryAmount,
      playerCount,
      grossPot,
      serviceChargePercent,
      serviceChargeAmount,
      winnerPrize,
    };
  }

  /* ==================================
     Authentication
  ================================== */

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

  /* ==================================
     UI Helpers
  ================================== */

  function updateBalanceUI() {
    if (!elements.walletBalance) {
      return;
    }

    elements.walletBalance.textContent = formatMoney(getWalletBalance());
  }

  function updateServiceChargePreview() {
    if (!elements.serviceChargePreview) {
      return;
    }

    const activeRoom = state.rooms.find((room) => room.status === "active");

    if (!activeRoom) {
      elements.serviceChargePreview.textContent = "--%";

      return;
    }

    elements.serviceChargePreview.textContent = `${toValidAmount(
      activeRoom.serviceChargePercent,
    )}%`;
  }

  function showLoader(message = "Please wait...") {
    if (!elements.loaderOverlay || !elements.loaderMessage) {
      return;
    }

    elements.loaderMessage.textContent = message;

    elements.loaderOverlay.classList.add("is-visible");

    elements.loaderOverlay.setAttribute("aria-hidden", "false");
  }

  function hideLoader() {
    if (!elements.loaderOverlay) {
      return;
    }

    elements.loaderOverlay.classList.remove("is-visible");

    elements.loaderOverlay.setAttribute("aria-hidden", "true");
  }

  function showToast(message, type = "info") {
    if (!elements.toast || !elements.toastMessage || !elements.toastIcon) {
      return;
    }

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
    }, 3000);
  }

  function setRefreshLoading(isLoading) {
    if (!elements.refreshBalanceBtn) {
      return;
    }

    elements.refreshBalanceBtn.disabled = isLoading;

    elements.refreshBalanceBtn.classList.toggle("is-loading", isLoading);

    const icon = elements.refreshBalanceBtn.querySelector("i");

    icon?.classList.toggle("fa-spin", isLoading);
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
      const response = await fetch(APP_CONFIG.api(endpoint), {
        ...options,

        headers: {
          Accept: "application/json",

          ...(options.body
            ? {
                "Content-Type": "application/json",
              }
            : {}),

          Authorization: `Bearer ${getAccessToken()}`,

          ...(options.headers || {}),
        },

        signal: controller.signal,
      });

      let result = null;

      try {
        result = await response.json();
      } catch (_error) {
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

  function escapeHtml(value) {
    const element = document.createElement("div");

    element.textContent = String(value ?? "");

    return element.innerHTML;
  }

  function createRoomCard(room) {
    const money = calculateRoomMoney(room);

    const hasEnoughBalance = getWalletBalance() >= money.entryAmount;

    const isRoomActive = room.status === "active";

    const canJoin = hasEnoughBalance && isRoomActive;

    const card = document.createElement("article");

    card.className = "carrom-room-card";

    if (!canJoin) {
      card.classList.add("is-disabled");
    }

    const statusText = isRoomActive ? "OPEN" : "CLOSED";

    const buttonText = !isRoomActive
      ? "Room Closed"
      : hasEnoughBalance
        ? "Select Room"
        : "Low Balance";

    const buttonIcon = canJoin ? "fa-solid fa-play" : "fa-solid fa-lock";

    card.innerHTML = `
      <div class="carrom-room-card-header">

        <div class="carrom-room-identity">

          <div class="carrom-room-icon">
            <i class="fa-solid fa-circle-dot"></i>
          </div>

          <div class="carrom-room-name">

            <span>
              ${escapeHtml(room.roomCode || "CARROM")}
            </span>

            <h3>
              ${escapeHtml(room.roomName || "Carrom Room")}
            </h3>

          </div>

        </div>

        <div class="carrom-room-status ${isRoomActive ? "" : "is-closed"}">
          ${statusText}
        </div>

      </div>

      <div class="carrom-room-price">

        <small>ENTRY FEE</small>

        <strong>
          ৳${formatMoney(money.entryAmount)}
        </strong>

        <span>
          ${money.playerCount}
          players match
        </span>

      </div>

      <div class="carrom-room-calculation">

        <div class="carrom-room-stat">

          <small>Total Pot</small>

          <strong>
            ৳${formatMoney(money.grossPot)}
          </strong>

        </div>

        <div class="carrom-room-stat">

          <small>Charge</small>

          <strong>
            ${money.serviceChargePercent}%
          </strong>

        </div>

        <div class="carrom-room-stat is-prize">

          <small>Winner Prize</small>

          <strong>
            ৳${formatMoney(money.winnerPrize)}
          </strong>

        </div>

      </div>

      <div class="carrom-room-fee-row">

        <span>
          <i class="fa-solid fa-receipt"></i>
          Service charge
        </span>

        <strong>
          ৳${formatMoney(money.serviceChargeAmount)}
        </strong>

      </div>

      <button
        type="button"
        class="carrom-join-button"
        data-room-id="${Number(room.id)}"
        ${canJoin ? "" : "disabled"}>

        <i class="${buttonIcon}"></i>

        <span>
          ${buttonText}
        </span>

      </button>
    `;

    return card;
  }

  function renderRooms() {
    if (!elements.roomGrid || !elements.emptyState) {
      return;
    }

    elements.roomGrid.replaceChildren();

    if (state.isLoadingRooms) {
      elements.emptyState.hidden = true;

      return;
    }

    if (!state.rooms.length) {
      elements.emptyState.hidden = false;

      return;
    }

    elements.emptyState.hidden = true;

    const fragment = document.createDocumentFragment();

    state.rooms.forEach((room) => {
      fragment.appendChild(createRoomCard(room));
    });

    elements.roomGrid.appendChild(fragment);

    updateServiceChargePreview();
  }
  async function loadAvailableRooms() {
    if (state.isLoadingRooms) {
      return;
    }

    state.isLoadingRooms = true;

    state.rooms = [];

    elements.emptyState.hidden = true;

    renderRooms();

    showLoader(`Loading ${state.playerMode}-player Carrom rooms...`);

    try {
      const result = await apiRequest(
        `/carrom/rooms?playerMode=${encodeURIComponent(state.playerMode)}`,
      );

      const rooms = Array.isArray(result?.data?.rooms) ? result.data.rooms : [];

      state.rooms = rooms
        .map((room) => ({
          id: Number(room.id),

          roomCode: room.roomCode || null,

          roomName: room.roomName || "Carrom Room",

          playerMode: Number(room.playerMode),

          entryAmount: Number(room.entryAmount),

          serviceChargePercent: Number(room.serviceChargePercent),

          matchmakingWaitSeconds: Number(room.matchmakingWaitSeconds || 20),

          turnSeconds: Number(room.turnSeconds || 20),

          grossPoolAmount: Number(room.grossPoolAmount),

          serviceChargeAmount: Number(room.serviceChargeAmount),

          prizePoolAmount: Number(room.prizePoolAmount),

          winnerCount: Number(room.winnerCount),

          prizePerWinner: Number(room.prizePerWinner),

          status: room.status || "active",
        }))
        .filter(
          (room) =>
            Number.isInteger(room.id) &&
            room.id > 0 &&
            room.playerMode === state.playerMode &&
            Number.isFinite(room.entryAmount) &&
            room.entryAmount > 0 &&
            Number.isFinite(room.serviceChargePercent),
        );
    } catch (error) {
      state.rooms = [];

      console.error("Load Carrom rooms error:", error);

      showToast(error.message || "Unable to load Carrom rooms", "error");
    } finally {
      state.isLoadingRooms = false;

      hideLoader();

      renderRooms();
    }
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
      console.error("Load Carrom user error:", error);

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

  async function selectRoom(roomId) {
    if (state.isSelectingRoom) {
      return;
    }

    const validRoomId = Number(roomId);

    const room = state.rooms.find((item) => Number(item.id) === validRoomId);

    if (!room) {
      showToast("Invalid Carrom room selected", "error");

      return;
    }

    if (room.status !== "active") {
      showToast("This Carrom room is closed", "error");

      return;
    }

    if (getWalletBalance() < Number(room.entryAmount)) {
      showToast(
        `Minimum ৳${formatMoney(room.entryAmount)} balance required`,
        "error",
      );

      return;
    }

    state.isSelectingRoom = true;

    showLoader("Joining Carrom matchmaking...");

    try {
      const result = await apiRequest("/carrom/matchmaking/join", {
        method: "POST",

        body: JSON.stringify({
          roomId: validRoomId,
        }),
      });

      const data = result?.data || {};

      const match = data.match || data.matchState?.match || null;

      const matchId = Number(match?.matchId || match?.id || data.matchId);

      if (!Number.isInteger(matchId) || matchId < 1) {
        throw new Error("Carrom match ID was not returned by the server");
      }

      saveSelectedRoom(room);

      localStorage.setItem(
        "current_carrom_match",
        JSON.stringify({
          matchId,

          roomId: validRoomId,

          matchCode: match?.matchCode || match?.code || null,

          status: match?.status || "waiting",

          savedAt: new Date().toISOString(),

          state: data,
        }),
      );

      showToast(result?.message || "Carrom matchmaking joined", "success");

      window.setTimeout(() => {
        window.location.href = `/carrom-table?matchId=${encodeURIComponent(
          matchId,
        )}`;
      }, 500);
    } catch (error) {
      console.error("JOIN CARROM MATCHMAKING ERROR:", error);

      showToast(error.message || "Unable to join Carrom matchmaking", "error");

      state.isSelectingRoom = false;
    } finally {
      hideLoader();
    }
  }

  /* ==================================
     Events
  ================================== */

  elements.modeSelector?.addEventListener("click", (event) => {
    const button = event.target.closest(".carrom-mode-button");

    if (!button || state.isSelectingRoom) {
      return;
    }

    const selectedMode = Number(button.dataset.playerMode);

    if (selectedMode !== 2 && selectedMode !== 4) {
      return;
    }

    state.playerMode = selectedMode;

    elements.modeSelector
      .querySelectorAll(".carrom-mode-button")
      .forEach((modeButton) => {
        const isActive = Number(modeButton.dataset.playerMode) === selectedMode;

        modeButton.classList.toggle("is-active", isActive);

        modeButton.setAttribute("aria-pressed", String(isActive));
      });

    loadAvailableRooms();

    showToast(`${selectedMode}-player Carrom selected`, "success");
  });

  elements.roomGrid?.addEventListener("click", (event) => {
    const button = event.target.closest(".carrom-join-button");

    if (!button || button.disabled) {
      return;
    }

    selectRoom(button.dataset.roomId);
  });

  elements.backBtn?.addEventListener("click", () => {
    window.location.href = "lobby";
  });

  elements.refreshBalanceBtn?.addEventListener("click", () => {
    loadLatestUserData({
      showFeedback: true,
    });
  });

  elements.retryRoomsBtn?.addEventListener("click", () => {
    loadAvailableRooms();
  });

  /* ==================================
     Start
  ================================== */

  if (!initializeUser()) {
    return;
  }

  updateBalanceUI();

  loadAvailableRooms();

  loadLatestUserData();
});
