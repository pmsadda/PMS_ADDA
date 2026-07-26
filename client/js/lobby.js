"use strict";

document.addEventListener("DOMContentLoaded", () => {
  /* =========================================================
     CONFIGURATION
  ========================================================= */

  const LOGIN_PAGE = "./login.html";

  const token =
    localStorage.getItem("access_token") ||
    localStorage.getItem("token") ||
    "";

  const STATE = {
    user: null,
    deposits: [],
    withdrawals: [],
    notifications: [],
    loading: false,
    lastLoadedAt: 0,
    toastTimer: null,
  };

  /* =========================================================
     DOM REFERENCES
  ========================================================= */

  const DOM = {
    balance: document.getElementById("balance"),
    playerName: document.getElementById("playerName"),
    playerId: document.getElementById("playerId"),
    profileImage: document.getElementById("profileImage"),

    refreshButton: document.getElementById("refreshBtn"),

    loader: document.getElementById("loaderOverlay"),

    toast: document.getElementById("toast"),
    toastMessage: document.getElementById("toastMessage"),

    notificationButton: document.getElementById("notifyBtn"),
    notificationBadge:
      document.getElementById("notificationBadge"),
    notificationModal:
      document.getElementById("notificationModal"),
    notificationList:
      document.getElementById("notificationList"),
    closeNotification:
      document.getElementById("closeNotification"),

    logoutButton: document.getElementById("logoutBtn"),
    logoutModal: document.getElementById("logoutModal"),
    closeLogoutModal:
      document.getElementById("closeLogoutModal"),
    cancelLogoutButton:
      document.getElementById("cancelLogoutBtn"),
    confirmLogoutButton:
      document.getElementById("confirmLogoutBtn"),

    homeButton: document.getElementById("homeBtn"),
    walletButton: document.getElementById("walletBtn"),
    supportButton: document.getElementById("supportBtn"),
    profileButton: document.getElementById("profileBtn"),

    depositButton: document.getElementById("depositBtn"),
    withdrawButton: document.getElementById("withdrawBtn"),
    historyButton: document.getElementById("historyBtn"),

    teenPattiButton: document.getElementById("teenPattiBtn"),
    pokerButton: document.getElementById("pokerBtn"),
    ludoButton: document.getElementById("ludoBtn"),

    settingsButton:
      document.getElementById("settingsBtn"),
  };

  /* =========================================================
     BASIC HELPERS
  ========================================================= */

  function normalizeString(value) {
    return String(value || "")
      .trim()
      .toLowerCase();
  }

  function formatMoney(value) {
    const amount = Number(value);

    return (Number.isFinite(amount) ? amount : 0).toLocaleString(
      "en-BD",
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      },
    );
  }

  function formatDate(value) {
    const date = value ? new Date(value) : null;

    if (!date || Number.isNaN(date.getTime())) {
      return "Recently";
    }

    return date.toLocaleString("en-BD", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function navigateTo(path) {
    window.location.href = path;
  }

  function clearAuthentication() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("token");
    localStorage.removeItem("current_user");
  }

  function redirectToLogin() {
    clearAuthentication();
    window.location.replace(LOGIN_PAGE);
  }

  function showLoader() {
    STATE.loading = true;

    if (DOM.loader) {
      DOM.loader.style.display = "flex";
    }

    if (DOM.refreshButton) {
      DOM.refreshButton.disabled = true;
      DOM.refreshButton.setAttribute("aria-busy", "true");
    }
  }

  function hideLoader() {
    STATE.loading = false;

    if (DOM.loader) {
      DOM.loader.style.display = "none";
    }

    if (DOM.refreshButton) {
      DOM.refreshButton.disabled = false;
      DOM.refreshButton.setAttribute("aria-busy", "false");
    }
  }

  function showToast(message, type = "info") {
    if (!DOM.toast || !DOM.toastMessage) {
      console.log(message);
      return;
    }

    window.clearTimeout(STATE.toastTimer);

    DOM.toast.dataset.type = type;
    DOM.toastMessage.textContent = String(message);
    DOM.toast.style.display = "block";

    STATE.toastTimer = window.setTimeout(() => {
      DOM.toast.style.display = "none";
    }, 2600);
  }

  function openModal(modal) {
    if (!modal) {
      return;
    }

    modal.style.display = "flex";
    document.body.style.overflow = "hidden";
  }

  function closeModal(modal) {
    if (!modal) {
      return;
    }

    modal.style.display = "none";

    const anyOpenModal = Array.from(
      document.querySelectorAll(".modal"),
    ).some((item) => item.style.display === "flex");

    if (!anyOpenModal) {
      document.body.style.overflow = "";
    }
  }

  /* =========================================================
     SECURE API
  ========================================================= */

  async function requestAPI(path) {
    const response = await fetch(window.APP_CONFIG.api(path), {
      method: "GET",

      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },

      cache: "no-store",
    });

    let result = null;

    try {
      result = await response.json();
    } catch (error) {
      result = null;
    }

    if (response.status === 401) {
      redirectToLogin();

      throw new Error("Your login session has expired.");
    }

    if (!response.ok) {
      const requestError = new Error(
        result?.message || "Failed to load Lobby data.",
      );

      requestError.statusCode = response.status;
      requestError.code = result?.code || "LOBBY_API_ERROR";

      throw requestError;
    }

    return result;
  }

  function extractUser(result) {
    return (
      result?.data?.user ||
      result?.user ||
      result?.data ||
      null
    );
  }

  function extractHistory(result, possibleKeys = []) {
    const candidates = [
      result?.data,
      result,
      ...possibleKeys.flatMap((key) => [
        result?.data?.[key],
        result?.[key],
      ]),
    ];

    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        return candidate;
      }
    }

    return [];
  }

  /* =========================================================
     USER RENDER
  ========================================================= */

  function getUserDisplayName(user) {
    return (
      user?.fullName ||
      user?.full_name ||
      user?.username ||
      "PMS ADDA Player"
    );
  }

  function getUserAvatar(user) {
    return (
      user?.avatarUrl ||
      user?.avatar_url ||
      user?.profileImage ||
      user?.profile_image ||
      "../assets/images/default-avatar.png"
    );
  }

  function renderUser() {
    const user = STATE.user || {};

    const displayName = getUserDisplayName(user);

    const walletBalance =
      user.walletBalance ??
      user.wallet_balance ??
      0;

    if (DOM.playerName) {
      DOM.playerName.textContent = displayName;
    }

    if (DOM.playerId) {
      DOM.playerId.textContent =
        user.uid || user.userUid || "-";
    }

    if (DOM.balance) {
      DOM.balance.textContent =
        formatMoney(walletBalance);
    }

    if (DOM.profileImage) {
      DOM.profileImage.src = getUserAvatar(user);
      DOM.profileImage.alt = `${displayName} profile`;

      DOM.profileImage.onerror = () => {
        DOM.profileImage.onerror = null;
        DOM.profileImage.src =
          "../assets/images/default-avatar.png";
      };
    }

    localStorage.setItem(
      "current_user",
      JSON.stringify(user),
    );
  }

  /* =========================================================
     NOTIFICATION NORMALIZATION
  ========================================================= */

  function normalizeHistoryItem(item, type) {
    const status = normalizeString(
      item.status ||
      item.requestStatus ||
      item.request_status ||
      "pending",
    );

    const amount = Number(
      item.amount ||
      item.requestAmount ||
      item.request_amount ||
      0,
    );

    const createdAt =
      item.createdAt ||
      item.created_at ||
      item.requestedAt ||
      item.requested_at ||
      null;

    const identifier =
      item.id ||
      item.requestId ||
      item.request_id ||
      `${type}-${createdAt}-${amount}`;

    return {
      id: String(identifier),
      type,
      status,
      amount: Number.isFinite(amount) ? amount : 0,
      createdAt,
    };
  }

  function buildNotifications() {
    const depositNotifications = STATE.deposits.map(
      (item) => normalizeHistoryItem(item, "deposit"),
    );

    const withdrawNotifications = STATE.withdrawals.map(
      (item) => normalizeHistoryItem(item, "withdraw"),
    );

    STATE.notifications = [
      ...depositNotifications,
      ...withdrawNotifications,
    ]
      .sort((firstItem, secondItem) => {
        const firstTime = firstItem.createdAt
          ? new Date(firstItem.createdAt).getTime()
          : 0;

        const secondTime = secondItem.createdAt
          ? new Date(secondItem.createdAt).getTime()
          : 0;

        return secondTime - firstTime;
      })
      .slice(0, 20);
  }

  function getNotificationTitle(notification) {
    const action =
      notification.type === "deposit"
        ? "Deposit"
        : "Withdraw";

    const status = notification.status;

    if (status === "pending") {
      return `${action} request pending`;
    }

    if (
      status === "approved" ||
      status === "completed" ||
      status === "success"
    ) {
      return `${action} successful`;
    }

    if (
      status === "rejected" ||
      status === "failed" ||
      status === "cancelled"
    ) {
      return `${action} ${status}`;
    }

    return `${action} update`;
  }

  function createNotificationElement(notification) {
    const item = document.createElement("article");

    item.className = "notification-item";

    const icon = document.createElement("div");

    icon.className = "notification-item-icon";

    const iconElement = document.createElement("i");

    iconElement.className =
      notification.type === "deposit"
        ? "fa-solid fa-circle-plus"
        : "fa-solid fa-money-bill-transfer";

    icon.appendChild(iconElement);

    const copy = document.createElement("div");

    copy.className = "notification-item-copy";

    const titleRow = document.createElement("div");

    titleRow.className = "notification-item-title";

    const title = document.createElement("span");

    title.textContent = getNotificationTitle(notification);

    const amount = document.createElement("strong");

    amount.textContent =
      `৳${formatMoney(notification.amount)}`;

    titleRow.append(title, amount);

    const metaRow = document.createElement("div");

    metaRow.className = "notification-item-meta";

    const date = document.createElement("span");

    date.textContent = formatDate(notification.createdAt);

    const status = document.createElement("span");

    status.className =
      `notification-status ${notification.status}`;

    status.textContent = notification.status || "pending";

    metaRow.append(date, status);
    copy.append(titleRow, metaRow);
    item.append(icon, copy);

    return item;
  }

  function renderNotifications() {
    if (!DOM.notificationList) {
      return;
    }

    DOM.notificationList.replaceChildren();

    if (STATE.notifications.length === 0) {
      const empty = document.createElement("div");

      empty.className = "notification-empty";

      const icon = document.createElement("i");

      icon.className = "fa-regular fa-bell-slash";

      const text = document.createElement("p");

      text.textContent = "No notifications yet.";

      empty.append(icon, text);
      DOM.notificationList.appendChild(empty);
    } else {
      const fragment = document.createDocumentFragment();

      STATE.notifications.forEach((notification) => {
        fragment.appendChild(
          createNotificationElement(notification),
        );
      });

      DOM.notificationList.appendChild(fragment);
    }

    const pendingCount = STATE.notifications.filter(
      (notification) =>
        notification.status === "pending",
    ).length;

    if (DOM.notificationBadge) {
      DOM.notificationBadge.hidden =
        pendingCount === 0;

      DOM.notificationBadge.textContent =
        pendingCount > 99
          ? "99+"
          : String(pendingCount);
    }
  }

  /* =========================================================
     LOAD DYNAMIC LOBBY DATA
  ========================================================= */

  async function loadLobbyData(options = {}) {
    if (STATE.loading) {
      return;
    }

    const showFullLoader =
      options.showLoader === true;

    if (showFullLoader) {
      showLoader();
    } else if (DOM.refreshButton) {
      DOM.refreshButton.disabled = true;
      DOM.refreshButton.setAttribute("aria-busy", "true");
    }

    try {
      const [
        userResult,
        depositResult,
        withdrawResult,
      ] = await Promise.allSettled([
        requestAPI("/auth/me"),
        requestAPI("/deposit/my-history"),
        requestAPI("/withdraw/my-history"),
      ]);

      if (userResult.status === "rejected") {
        throw userResult.reason;
      }

      STATE.user = extractUser(userResult.value);

      if (!STATE.user) {
        throw new Error("User information was not found.");
      }

      STATE.deposits =
        depositResult.status === "fulfilled"
          ? extractHistory(
              depositResult.value,
              [
                "deposits",
                "requests",
                "history",
                "items",
              ],
            )
          : [];

      STATE.withdrawals =
        withdrawResult.status === "fulfilled"
          ? extractHistory(
              withdrawResult.value,
              [
                "withdrawals",
                "requests",
                "history",
                "items",
              ],
            )
          : [];

      buildNotifications();
      renderUser();
      renderNotifications();

      STATE.lastLoadedAt = Date.now();

      if (options.showSuccess === true) {
        showToast("Lobby updated successfully.", "success");
      }
    } catch (error) {
      console.error("DYNAMIC LOBBY LOAD ERROR:", error);

      showToast(
        error.message || "Lobby data load করা যায়নি।",
        "error",
      );
    } finally {
      hideLoader();
    }
  }

  /* =========================================================
     MODAL EVENTS
  ========================================================= */

  DOM.notificationButton?.addEventListener(
    "click",
    async () => {
      openModal(DOM.notificationModal);

      /*
       * পুরোনো data হলে notification খোলার সময় refresh।
       */
      if (Date.now() - STATE.lastLoadedAt > 15000) {
        await loadLobbyData();
      }
    },
  );

  DOM.closeNotification?.addEventListener(
    "click",
    () => closeModal(DOM.notificationModal),
  );

  DOM.logoutButton?.addEventListener(
    "click",
    () => openModal(DOM.logoutModal),
  );

  DOM.closeLogoutModal?.addEventListener(
    "click",
    () => closeModal(DOM.logoutModal),
  );

  DOM.cancelLogoutButton?.addEventListener(
    "click",
    () => closeModal(DOM.logoutModal),
  );

  DOM.confirmLogoutButton?.addEventListener(
    "click",
    () => {
      clearAuthentication();
      window.location.replace(LOGIN_PAGE);
    },
  );

  window.addEventListener("click", (event) => {
    if (event.target === DOM.notificationModal) {
      closeModal(DOM.notificationModal);
    }

    if (event.target === DOM.logoutModal) {
      closeModal(DOM.logoutModal);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }

    closeModal(DOM.notificationModal);
    closeModal(DOM.logoutModal);
  });

  /* =========================================================
     REFRESH BUTTON
  ========================================================= */

  DOM.refreshButton?.addEventListener(
    "click",
    async () => {
      if (STATE.loading) {
        return;
      }

      const icon =
        DOM.refreshButton.querySelector("i");

      icon?.classList.add("fa-spin");

      await loadLobbyData({
        showSuccess: true,
      });

      icon?.classList.remove("fa-spin");
    },
  );

  /* =========================================================
     QUICK MENU NAVIGATION
  ========================================================= */

  DOM.depositButton?.addEventListener(
    "click",
    () => navigateTo("./deposit.html"),
  );

  DOM.withdrawButton?.addEventListener(
    "click",
    () => navigateTo("./withdraw.html"),
  );

  DOM.historyButton?.addEventListener(
    "click",
    () => navigateTo("./history.html"),
  );

  /* =========================================================
     GAME NAVIGATION
  ========================================================= */

  DOM.teenPattiButton?.addEventListener(
    "click",
    () => navigateTo("./teenpatti-rooms.html"),
  );

  DOM.pokerButton?.addEventListener(
    "click",
    () => navigateTo("./poker-rooms.html"),
  );

  DOM.ludoButton?.addEventListener(
    "click",
    () => navigateTo("./ludo-rooms.html"),
  );

  /* =========================================================
     BOTTOM NAVIGATION
  ========================================================= */

  DOM.homeButton?.addEventListener(
    "click",
    () => {
      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    },
  );

  DOM.walletButton?.addEventListener(
    "click",
    () => navigateTo("./wallet.html"),
  );

  DOM.supportButton?.addEventListener(
    "click",
    () => navigateTo("./support.html"),
  );

  DOM.profileButton?.addEventListener(
    "click",
    () => navigateTo("./profile.html"),
  );

  DOM.settingsButton?.addEventListener(
    "click",
    () => navigateTo("./settings.html"),
  );

  /* =========================================================
     PAGE VISIBILITY REFRESH
  ========================================================= */

  document.addEventListener(
    "visibilitychange",
    () => {
      if (
        document.visibilityState === "visible" &&
        Date.now() - STATE.lastLoadedAt > 15000
      ) {
        loadLobbyData();
      }
    },
  );

  window.addEventListener("focus", () => {
    if (Date.now() - STATE.lastLoadedAt > 15000) {
      loadLobbyData();
    }
  });

  /* =========================================================
     INITIALIZE
  ========================================================= */

  async function initializeLobby() {
    if (!window.APP_CONFIG) {
      showToast("APP_CONFIG পাওয়া যায়নি।", "error");
      return;
    }

    if (!token) {
      redirectToLogin();
      return;
    }

    const cachedUser = (() => {
      try {
        return JSON.parse(
          localStorage.getItem("current_user") || "null",
        );
      } catch (error) {
        return null;
      }
    })();

    if (cachedUser) {
      STATE.user = cachedUser;
      renderUser();
    }

    await loadLobbyData({
      showLoader: !cachedUser,
    });

    console.log("✅ PMS ADDA dynamic Lobby loaded");
  }

  initializeLobby();
});