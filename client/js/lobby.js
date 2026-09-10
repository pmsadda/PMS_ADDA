"use strict";

document.addEventListener("DOMContentLoaded", () => {
  /* =========================================================
     CONFIGURATION
  ========================================================= */

  const LOGIN_PAGE = "/login";

  const token =
    localStorage.getItem("access_token") || localStorage.getItem("token") || "";

  const STATE = {
    user: null,
    deposits: [],
    withdrawals: [],
    notifications: [],
    lobbyNotices: [],
    lobbyBanners: [],
    lobbyBannerIndex: 0,
    lobbyBannerTimer: null,
    lobbyBannerRenderToken: 0,
    gameAvailability: {},
    referral: null,
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

    lobbyNotice: document.getElementById("lobbyNotice"),

    lobbyNoticeTrack: document.getElementById("lobbyNoticeTrack"),

    lobbyNoticeText: document.getElementById("lobbyNoticeText"),

    lobbyBanner: document.getElementById("lobbyBanner"),

    lobbyBannerLink: document.getElementById("lobbyBannerLink"),

    lobbyBannerImage: document.getElementById("lobbyBannerImage"),

    lobbyBannerLoading: document.getElementById("lobbyBannerLoading"),

    lobbyBannerPrevious: document.getElementById("lobbyBannerPrevious"),

    lobbyBannerNext: document.getElementById("lobbyBannerNext"),

    lobbyBannerCounter: document.getElementById("lobbyBannerCounter"),

    lobbyBannerDots: document.getElementById("lobbyBannerDots"),

    lobbyOfferPopup: document.getElementById("lobbyOfferPopup"),
    lobbyOfferBackdrop: document.getElementById("lobbyOfferBackdrop"),
    lobbyOfferClose: document.getElementById("lobbyOfferClose"),
    lobbyOfferImage: document.getElementById("lobbyOfferImage"),
    lobbyOfferTitle: document.getElementById("lobbyOfferTitle"),
    lobbyOfferMessage: document.getElementById("lobbyOfferMessage"),
    lobbyOfferAction: document.getElementById("lobbyOfferAction"),
    lobbyOfferHideToday: document.getElementById("lobbyOfferHideToday"),

    refreshButton: document.getElementById("refreshBtn"),

    downloadAppButton: document.getElementById("downloadAppBtn"),

    loader: document.getElementById("loaderOverlay"),

    toast: document.getElementById("toast"),
    toastMessage: document.getElementById("toastMessage"),

    notificationButton: document.getElementById("notifyBtn"),
    notificationBadge: document.getElementById("notificationBadge"),
    notificationModal: document.getElementById("notificationModal"),
    notificationList: document.getElementById("notificationList"),
    closeNotification: document.getElementById("closeNotification"),

    logoutButton: document.getElementById("logoutBtn"),
    logoutModal: document.getElementById("logoutModal"),
    closeLogoutModal: document.getElementById("closeLogoutModal"),
    cancelLogoutButton: document.getElementById("cancelLogoutBtn"),
    confirmLogoutButton: document.getElementById("confirmLogoutBtn"),

    homeButton: document.getElementById("homeBtn"),
    walletButton: document.getElementById("walletBtn"),
    supportButton: document.getElementById("supportBtn"),
    profileButton: document.getElementById("profileBtn"),

    depositButton: document.getElementById("depositBtn"),
    withdrawButton: document.getElementById("withdrawBtn"),

    referButton: document.getElementById("referBtn"),

    referralModal: document.getElementById("referralModal"),

    closeReferralModal: document.getElementById("closeReferralModal"),

    referralProgramStatus: document.getElementById("referralProgramStatus"),

    referrerRewardAmount: document.getElementById("referrerRewardAmount"),

    referredRewardAmount: document.getElementById("referredRewardAmount"),

    referralMinimumText: document.getElementById("referralMinimumText"),

    referralCode: document.getElementById("myReferralCode"),

    referralLink: document.getElementById("myReferralLink"),

    copyReferralCode: document.getElementById("copyReferralCode"),

    copyReferralLink: document.getElementById("copyReferralLink"),

    shareReferralLink: document.getElementById("shareReferralLink"),

    teenPattiButton: document.getElementById("teenPattiBtn"),
    pokerButton: document.getElementById("pokerBtn"),
    ludoButton: document.getElementById("ludoBtn"),
    carromButton: document.getElementById("carromBtn"),
    andarBaharButton: document.getElementById("andarBaharBtn"),
    banglaWheelButton: document.getElementById("banglaWheelBtn"),
    banglaDiceButton: document.getElementById("banglaDiceBtn"),
    aviatorButton: document.getElementById("aviatorBtn"),
    kaitButton: document.getElementById("kaitBtn"),
    lotteryButton: document.getElementById("lotteryBtn"),

    settingsButton: document.getElementById("settingsBtn"),
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

    return (Number.isFinite(amount) ? amount : 0).toLocaleString("en-BD", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
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

    const anyOpenModal = Array.from(document.querySelectorAll(".modal")).some(
      (item) => item.style.display === "flex",
    );

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

  async function requestPublicAPI(path) {
    const response = await fetch(window.APP_CONFIG.api(path), {
      method: "GET",

      headers: {
        Accept: "application/json",
      },

      cache: "no-store",
    });

    let result = null;

    try {
      result = await response.json();
    } catch (error) {
      result = null;
    }

    if (!response.ok) {
      throw new Error(result?.message || "Public Lobby data load করা যায়নি.");
    }

    return result;
  }

  function extractReferral(result) {
    return result?.data?.referral || result?.referral || null;
  }

  function buildReferralLink(referralCode) {
    const url = new URL("/register", window.location.origin);

    url.search = "";
    url.hash = "";

    url.searchParams.set("ref", referralCode);

    return url.toString();
  }

  async function copyReferralText(value, successMessage) {
    const safeValue = String(value || "").trim();

    if (!safeValue) {
      showToast("Referral information পাওয়া যায়নি।", "error");

      return;
    }

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(safeValue);
      } else {
        const temporaryInput = document.createElement("textarea");

        temporaryInput.value = safeValue;

        temporaryInput.style.position = "fixed";

        temporaryInput.style.opacity = "0";

        document.body.appendChild(temporaryInput);

        temporaryInput.select();

        document.execCommand("copy");

        temporaryInput.remove();
      }

      showToast(successMessage, "success");
    } catch (error) {
      console.error("REFERRAL COPY ERROR:", error);

      showToast("Copy করা যায়নি।", "error");
    }
  }

  function renderReferral() {
    const referral = STATE.referral || {};

    const settings = referral.settings || {};

    const stats = referral.stats || {};

    const referralCode = String(
      referral.referralCode || STATE.user?.referralCode || "",
    )
      .trim()
      .toUpperCase();

    const enabled = Boolean(settings.isEnabled);

    const referralLink = referralCode ? buildReferralLink(referralCode) : "";

    if (DOM.referralCode) {
      DOM.referralCode.value = referralCode || "Unavailable";
    }

    if (DOM.referralLink) {
      DOM.referralLink.value = referralLink || "Unavailable";
    }

    if (DOM.referralProgramStatus) {
      DOM.referralProgramStatus.classList.toggle("is-disabled", !enabled);

      DOM.referralProgramStatus.textContent = enabled
        ? "Referral Program Active"
        : "Referral Program Disabled";
    }

    if (DOM.referrerRewardAmount) {
      DOM.referrerRewardAmount.textContent = formatMoney(
        settings.referrerBonus || 0,
      );
    }

    if (DOM.referredRewardAmount) {
      DOM.referredRewardAmount.textContent = formatMoney(
        settings.referredUserBonus || 0,
      );
    }

    const minimumDeposit = Number(settings.minimumFirstDeposit || 0);

    if (DOM.referralMinimumText) {
      DOM.referralMinimumText.textContent =
        minimumDeposit > 0
          ? `Minimum first deposit: ` + `৳${formatMoney(minimumDeposit)}`
          : "Any valid first deposit qualifies.";
    }

    setReferralStat("myTotalReferrals", stats.total || 0);

    setReferralStat("myRewardedReferrals", stats.rewarded || 0);

    setReferralStat("myPendingReferrals", stats.pending || 0);

    setReferralStat("myReferralEarnings", formatMoney(stats.earnedBonus || 0));

    const actionsEnabled = enabled && Boolean(referralCode);

    [DOM.copyReferralCode, DOM.copyReferralLink, DOM.shareReferralLink].forEach(
      (button) => {
        if (button) {
          button.disabled = !actionsEnabled;
        }
      },
    );
  }

  function setReferralStat(elementId, value) {
    const element = document.getElementById(elementId);

    if (element) {
      element.textContent = String(value);
    }
  }

  async function refreshReferralSummary() {
    try {
      const result = await requestAPI("/auth/referral-summary");

      STATE.referral = extractReferral(result);

      renderReferral();

      return STATE.referral;
    } catch (error) {
      console.error("REFERRAL SUMMARY ERROR:", error);

      STATE.referral = null;

      renderReferral();

      throw error;
    }
  }

  function extractUser(result) {
    return result?.data?.user || result?.user || result?.data || null;
  }

  function extractHistory(result, possibleKeys = []) {
    const candidates = [
      result?.data,
      result,
      ...possibleKeys.flatMap((key) => [result?.data?.[key], result?.[key]]),
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
      user?.fullName || user?.full_name || user?.username || "TPL22 Player"
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

    const walletBalance = user.walletBalance ?? user.wallet_balance ?? 0;

    if (DOM.playerName) {
      DOM.playerName.textContent = displayName;
    }

    if (DOM.playerId) {
      DOM.playerId.textContent = user.uid || user.userUid || "-";
    }

    if (DOM.balance) {
      DOM.balance.textContent = formatMoney(walletBalance);
    }

    if (DOM.profileImage) {
      DOM.profileImage.src = getUserAvatar(user);
      DOM.profileImage.alt = `${displayName} profile`;

      DOM.profileImage.onerror = () => {
        DOM.profileImage.onerror = null;
        DOM.profileImage.src = "../assets/images/default-avatar.png";
      };
    }

    localStorage.setItem("current_user", JSON.stringify(user));
  }

  /* =========================================================
     NOTIFICATION NORMALIZATION
  ========================================================= */

  function normalizeHistoryItem(item, type) {
    const status = normalizeString(
      item.status || item.requestStatus || item.request_status || "pending",
    );

    const amount = Number(
      item.amount || item.requestAmount || item.request_amount || 0,
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
    const depositNotifications = STATE.deposits.map((item) =>
      normalizeHistoryItem(item, "deposit"),
    );

    const withdrawNotifications = STATE.withdrawals.map((item) =>
      normalizeHistoryItem(item, "withdraw"),
    );

    STATE.notifications = [...depositNotifications, ...withdrawNotifications]
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
    const action = notification.type === "deposit" ? "Deposit" : "Withdraw";

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

    amount.textContent = `৳${formatMoney(notification.amount)}`;

    titleRow.append(title, amount);

    const metaRow = document.createElement("div");

    metaRow.className = "notification-item-meta";

    const date = document.createElement("span");

    date.textContent = formatDate(notification.createdAt);

    const status = document.createElement("span");

    status.className = `notification-status ${notification.status}`;

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
        fragment.appendChild(createNotificationElement(notification));
      });

      DOM.notificationList.appendChild(fragment);
    }

    const pendingCount = STATE.notifications.filter(
      (notification) => notification.status === "pending",
    ).length;

    if (DOM.notificationBadge) {
      DOM.notificationBadge.hidden = pendingCount === 0;

      DOM.notificationBadge.textContent =
        pendingCount > 99 ? "99+" : String(pendingCount);
    }
  }

  /* =========================================================
     DYNAMIC LOBBY NOTICE
  ========================================================= */

  function extractLobbyNotices(result) {
    const notices = result?.data?.notices ?? result?.notices ?? [];

    if (!Array.isArray(notices)) {
      return [];
    }

    return notices.filter((notice) => {
      return (
        notice &&
        typeof notice.noticeText === "string" &&
        notice.noticeText.trim()
      );
    });
  }

  function extractGameAvailability(result) {
    const games = result?.data?.games || result?.games || {};

    if (!games || typeof games !== "object" || Array.isArray(games)) {
      return {};
    }

    return games;
  }

  function renderGameAvailability() {
    const gameConfigs = [
      {
        gameType: "teen_patti",
        button: DOM.teenPattiButton,
      },
      {
        gameType: "poker",
        button: DOM.pokerButton,
      },
      {
        gameType: "ludo",
        button: DOM.ludoButton,
      },

      {
        gameType: "carrom",
        button: DOM.carromButton,
      },
    ];

    gameConfigs.forEach(({ gameType, button }) => {
      if (!button) {
        return;
      }

      const game = STATE.gameAvailability[gameType] || null;

      /*
       * API data পাওয়া না গেলে network
       * সমস্যার কারণে game বন্ধ হবে না।
       */
      const available = game?.available !== false;

      const card = button.closest(".game-card");

      button.disabled = !available;

      button.setAttribute("aria-disabled", String(!available));

      card?.classList.toggle("is-unavailable", !available);

      const icon = document.createElement("i");

      icon.className = available ? "fa-solid fa-play" : "fa-solid fa-ban";

      button.replaceChildren(
        icon,

        document.createTextNode(available ? " Play Now" : " Unavailable"),
      );

      const gameInfo = card?.querySelector(".game-info");

      if (!gameInfo) {
        return;
      }

      let liveStatus = gameInfo.querySelector(".game-live-status");

      if (!liveStatus) {
        liveStatus = document.createElement("p");

        liveStatus.className = "game-live-status";

        gameInfo.insertBefore(liveStatus, button);
      }

      if (!available) {
        liveStatus.textContent = "Temporarily unavailable";

        liveStatus.classList.add("is-offline");

        return;
      }

      liveStatus.classList.remove("is-offline");

      const activePlayers = Number(game?.activePlayers || 0);

      const availableRooms = Number(game?.availableRooms || 0);

      if (activePlayers > 0) {
        liveStatus.textContent = `${activePlayers} players active`;
      } else if (availableRooms > 0) {
        liveStatus.textContent = `${availableRooms} rooms available`;
      } else {
        liveStatus.textContent = "Available now";
      }
    });
  }

  function hideLobbyNotice() {
    if (DOM.lobbyNotice) {
      DOM.lobbyNotice.hidden = true;
    }

    if (DOM.lobbyNoticeText) {
      DOM.lobbyNoticeText.textContent = "";
    }
  }

  function renderLobbyNotice() {
    if (!DOM.lobbyNotice || !DOM.lobbyNoticeTrack || !DOM.lobbyNoticeText) {
      return;
    }

    const noticeText = STATE.lobbyNotices
      .map((notice) => String(notice.noticeText || "").trim())
      .filter(Boolean)
      .join("   ✦   ");

    if (!noticeText) {
      hideLobbyNotice();
      return;
    }

    DOM.lobbyNoticeText.textContent = `📢 ${noticeText}`;

    /*
     * Notice বড় হলে animation ধীরে চলবে,
     * ছোট হলে অপ্রয়োজনীয় ধীর হবে না।
     */
    const durationSeconds = Math.min(
      45,
      Math.max(14, Math.ceil(noticeText.length * 0.16)),
    );

    DOM.lobbyNoticeTrack.style.setProperty(
      "--notice-duration",
      `${durationSeconds}s`,
    );

    /*
     * Updated notice এলে animation শুরু থেকে চালু হবে।
     */
    DOM.lobbyNoticeTrack.style.animation = "none";

    void DOM.lobbyNoticeTrack.offsetWidth;

    DOM.lobbyNoticeTrack.style.animation = "";

    DOM.lobbyNotice.hidden = false;
  }

  /* =========================================================
   DYNAMIC LOBBY BANNER CAROUSEL
========================================================= */

  const LOBBY_BANNER_INTERVAL_MS = 5000;

  function extractLobbyBanners(result) {
    const banners = Array.isArray(result?.data?.banners)
      ? result.data.banners
      : [];

    return banners
      .filter(
        (banner) => banner && banner.status === "active" && banner.imageUrl,
      )
      .sort(
        (firstBanner, secondBanner) =>
          Number(firstBanner.displayOrder || 0) -
          Number(secondBanner.displayOrder || 0),
      )
      .slice(0, 5);
  }

  function resolveLobbyBannerImageUrl(imageUrl) {
    if (!imageUrl) {
      return null;
    }

    if (/^https?:\/\//i.test(imageUrl)) {
      return imageUrl;
    }

    const apiOrigin = new URL(window.APP_CONFIG.API_URL, window.location.origin)
      .origin;

    return new URL(imageUrl, apiOrigin).href;
  }

  function stopLobbyBannerTimer() {
    if (!STATE.lobbyBannerTimer) {
      return;
    }

    window.clearInterval(STATE.lobbyBannerTimer);

    STATE.lobbyBannerTimer = null;
  }

  function startLobbyBannerTimer() {
    stopLobbyBannerTimer();

    if (
      document.visibilityState !== "visible" ||
      STATE.lobbyBanners.length < 2
    ) {
      return;
    }

    STATE.lobbyBannerTimer = window.setInterval(() => {
      showLobbyBanner(STATE.lobbyBannerIndex + 1);
    }, LOBBY_BANNER_INTERVAL_MS);
  }

  function hideLobbyBannerControls() {
    if (DOM.lobbyBannerPrevious) {
      DOM.lobbyBannerPrevious.hidden = true;
    }

    if (DOM.lobbyBannerNext) {
      DOM.lobbyBannerNext.hidden = true;
    }

    if (DOM.lobbyBannerCounter) {
      DOM.lobbyBannerCounter.hidden = true;
      DOM.lobbyBannerCounter.textContent = "";
    }

    if (DOM.lobbyBannerDots) {
      DOM.lobbyBannerDots.hidden = true;
      DOM.lobbyBannerDots.innerHTML = "";
    }
  }

  function hideLobbyBanner() {
    stopLobbyBannerTimer();

    STATE.lobbyBannerRenderToken += 1;
    STATE.lobbyBannerIndex = 0;

    if (DOM.lobbyBanner) {
      DOM.lobbyBanner.hidden = true;
    }

    if (DOM.lobbyBannerImage) {
      DOM.lobbyBannerImage.classList.remove("is-changing");

      DOM.lobbyBannerImage.removeAttribute("src");

      DOM.lobbyBannerImage.alt = "TPL22 lobby advertisement";
    }

    if (DOM.lobbyBannerLoading) {
      DOM.lobbyBannerLoading.hidden = true;
    }

    if (DOM.lobbyBannerLink) {
      DOM.lobbyBannerLink.removeAttribute("href");

      DOM.lobbyBannerLink.removeAttribute("target");

      DOM.lobbyBannerLink.removeAttribute("title");
    }

    hideLobbyBannerControls();
  }

  function setLobbyBannerTarget(banner) {
    if (!DOM.lobbyBannerLink) {
      return;
    }

    const targetUrl = String(banner?.targetUrl || "").trim();

    DOM.lobbyBannerLink.removeAttribute("href");

    DOM.lobbyBannerLink.removeAttribute("target");

    DOM.lobbyBannerLink.removeAttribute("title");

    if (!targetUrl) {
      return;
    }

    let parsedUrl;

    try {
      parsedUrl = new URL(targetUrl);
    } catch (error) {
      return;
    }

    if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
      return;
    }

    DOM.lobbyBannerLink.href = parsedUrl.toString();

    DOM.lobbyBannerLink.target = "_blank";

    DOM.lobbyBannerLink.rel = "noopener noreferrer";

    DOM.lobbyBannerLink.title = banner.title || "Open advertisement";
  }

  function normalizeLobbyBannerIndex(index) {
    const total = STATE.lobbyBanners.length;

    if (total < 1) {
      return 0;
    }

    return ((Number(index) % total) + total) % total;
  }

  function renderLobbyBannerControls() {
    const total = STATE.lobbyBanners.length;

    const hasMultipleBanners = total > 1;

    if (DOM.lobbyBannerPrevious) {
      DOM.lobbyBannerPrevious.hidden = !hasMultipleBanners;
    }

    if (DOM.lobbyBannerNext) {
      DOM.lobbyBannerNext.hidden = !hasMultipleBanners;
    }

    if (DOM.lobbyBannerCounter) {
      DOM.lobbyBannerCounter.hidden = !hasMultipleBanners;

      DOM.lobbyBannerCounter.textContent = hasMultipleBanners
        ? `${STATE.lobbyBannerIndex + 1}/${total}`
        : "";
    }

    if (!DOM.lobbyBannerDots) {
      return;
    }

    DOM.lobbyBannerDots.hidden = !hasMultipleBanners;

    if (!hasMultipleBanners) {
      DOM.lobbyBannerDots.innerHTML = "";
      return;
    }

    DOM.lobbyBannerDots.innerHTML = STATE.lobbyBanners
      .map((banner, index) => {
        const isActive = index === STATE.lobbyBannerIndex;

        return `
          <button
            type="button"
            class="lobby-banner-dot${isActive ? " is-active" : ""}"
            data-banner-index="${index}"
            role="tab"
            aria-label="Show advertisement ${index + 1}"
            aria-selected="${String(isActive)}"
          ></button>
        `;
      })
      .join("");
  }

  function removeBrokenLobbyBanner(bannerId) {
    STATE.lobbyBanners = STATE.lobbyBanners.filter(
      (banner) => Number(banner.id) !== Number(bannerId),
    );

    if (STATE.lobbyBannerIndex >= STATE.lobbyBanners.length) {
      STATE.lobbyBannerIndex = 0;
    }

    renderLobbyBanner();
  }

  function showLobbyBanner(requestedIndex, options = {}) {
    if (!DOM.lobbyBanner || !DOM.lobbyBannerImage) {
      return;
    }

    const total = STATE.lobbyBanners.length;

    if (total < 1) {
      hideLobbyBanner();
      return;
    }

    const index = normalizeLobbyBannerIndex(requestedIndex);

    const banner = STATE.lobbyBanners[index];

    const imageUrl = resolveLobbyBannerImageUrl(banner.imageUrl);

    if (!imageUrl) {
      removeBrokenLobbyBanner(banner.id);

      return;
    }

    STATE.lobbyBannerIndex = index;
    STATE.lobbyBannerRenderToken += 1;

    const renderToken = STATE.lobbyBannerRenderToken;

    DOM.lobbyBanner.hidden = false;

    renderLobbyBannerControls();

    const hasCurrentImage = Boolean(DOM.lobbyBannerImage.getAttribute("src"));

    if (DOM.lobbyBannerLoading && !hasCurrentImage) {
      DOM.lobbyBannerLoading.hidden = false;
    }

    const preloadedImage = new Image();

    preloadedImage.onload = () => {
      if (renderToken !== STATE.lobbyBannerRenderToken) {
        return;
      }

      DOM.lobbyBannerImage.classList.add("is-changing");

      window.setTimeout(
        () => {
          if (renderToken !== STATE.lobbyBannerRenderToken) {
            return;
          }

          DOM.lobbyBannerImage.alt =
            banner.title || "TPL22 lobby advertisement";

          setLobbyBannerTarget(banner);

          DOM.lobbyBannerImage.src = imageUrl;

          if (DOM.lobbyBannerLoading) {
            DOM.lobbyBannerLoading.hidden = true;
          }

          window.requestAnimationFrame(() => {
            DOM.lobbyBannerImage.classList.remove("is-changing");
          });
        },
        hasCurrentImage ? 150 : 0,
      );
    };

    preloadedImage.onerror = () => {
      if (renderToken !== STATE.lobbyBannerRenderToken) {
        return;
      }

      console.error(`Lobby banner ${banner.id} image could not be loaded.`);

      removeBrokenLobbyBanner(banner.id);
    };

    preloadedImage.src = imageUrl;

    if (options.restartTimer === true) {
      startLobbyBannerTimer();
    }
  }

  function renderLobbyBanner() {
    if (STATE.lobbyBanners.length < 1) {
      hideLobbyBanner();
      return;
    }

    STATE.lobbyBannerIndex = normalizeLobbyBannerIndex(STATE.lobbyBannerIndex);

    showLobbyBanner(STATE.lobbyBannerIndex);

    startLobbyBannerTimer();
  }

  function selectLobbyBanner(index) {
    showLobbyBanner(index, {
      restartTimer: true,
    });
  }

  DOM.lobbyBannerPrevious?.addEventListener("click", () => {
    selectLobbyBanner(STATE.lobbyBannerIndex - 1);
  });

  DOM.lobbyBannerNext?.addEventListener("click", () => {
    selectLobbyBanner(STATE.lobbyBannerIndex + 1);
  });

  DOM.lobbyBannerDots?.addEventListener("click", (event) => {
    const button = event.target.closest(".lobby-banner-dot");

    if (!button) {
      return;
    }

    const selectedIndex = Number(button.dataset.bannerIndex);

    if (!Number.isInteger(selectedIndex)) {
      return;
    }

    selectLobbyBanner(selectedIndex);
  });

  /* =========================================================
   ADMIN CONTROLLED OFFER POPUP
========================================================= */

const LOBBY_OFFER_HIDE_DATE_KEY = "pms_adda_offer_hidden_date";
const LOBBY_OFFER_SESSION_PREFIX = "pms_adda_offer_seen_";

function getLocalDateKey() {
  const currentDate = new Date();

  const year = currentDate.getFullYear();
  const month = String(currentDate.getMonth() + 1).padStart(2, "0");
  const day = String(currentDate.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getActivePopupBanner() {
  return (
    STATE.lobbyBanners.find((banner) => {
      if (
        !banner ||
        banner.status !== "active" ||
        banner.showAsPopup !== true ||
        !banner.imageUrl
      ) {
        return false;
      }

      const sessionKey =
        `${LOBBY_OFFER_SESSION_PREFIX}${banner.id}`;

      return sessionStorage.getItem(sessionKey) !== "1";
    }) || null
  );
}

function closeLobbyOfferPopup() {
  if (!DOM.lobbyOfferPopup) {
    return;
  }

  const bannerId =
    DOM.lobbyOfferPopup.dataset.bannerId;

  const hideAllToday = Boolean(
    DOM.lobbyOfferHideToday?.checked,
  );

  if (bannerId) {
    sessionStorage.setItem(
      `${LOBBY_OFFER_SESSION_PREFIX}${bannerId}`,
      "1",
    );
  }

  if (hideAllToday) {
    localStorage.setItem(
      LOBBY_OFFER_HIDE_DATE_KEY,
      getLocalDateKey(),
    );
  }

  DOM.lobbyOfferPopup.hidden = true;
  DOM.lobbyOfferPopup.removeAttribute(
    "data-banner-id",
  );

  document.body.classList.remove(
    "lobby-offer-open",
  );

  /*
   * Hide today select না করলে
   * পরবর্তী active popup দেখানো হবে।
   */
  if (!hideAllToday) {
    window.setTimeout(() => {
      renderLobbyOfferPopup();
    }, 200);
  }
}

function setLobbyOfferTarget(banner) {
  if (!DOM.lobbyOfferAction) {
    return;
  }

  const targetUrl = String(banner?.targetUrl || "").trim();

  DOM.lobbyOfferAction.hidden = true;
  DOM.lobbyOfferAction.removeAttribute("href");
  DOM.lobbyOfferAction.removeAttribute("target");
  DOM.lobbyOfferAction.removeAttribute("rel");

  if (!targetUrl) {
    return;
  }

  let parsedUrl;

  try {
    parsedUrl = new URL(targetUrl, window.location.origin);
  } catch (error) {
    return;
  }

  if (
    parsedUrl.protocol !== "https:" &&
    parsedUrl.protocol !== "http:"
  ) {
    return;
  }

  DOM.lobbyOfferAction.href = parsedUrl.toString();
  DOM.lobbyOfferAction.target = "_blank";
  DOM.lobbyOfferAction.rel = "noopener noreferrer";
  DOM.lobbyOfferAction.textContent =
    String(banner.popupButtonText || "").trim() || "View Offer";

  DOM.lobbyOfferAction.hidden = false;
}

function renderLobbyOfferPopup() {
  if (
    !DOM.lobbyOfferPopup ||
    !DOM.lobbyOfferImage ||
    !DOM.lobbyOfferTitle ||
    !DOM.lobbyOfferMessage
  ) {
    return;
  }

  if (
    localStorage.getItem(LOBBY_OFFER_HIDE_DATE_KEY) ===
    getLocalDateKey()
  ) {
    return;
  }

  const banner = getActivePopupBanner();

  if (!banner) {
    return;
  }

  const sessionKey = `${LOBBY_OFFER_SESSION_PREFIX}${banner.id}`;

  if (sessionStorage.getItem(sessionKey) === "1") {
    return;
  }

  const imageUrl = resolveLobbyBannerImageUrl(banner.imageUrl);

  if (!imageUrl) {
    return;
  }

  DOM.lobbyOfferPopup.dataset.bannerId = String(banner.id);

  DOM.lobbyOfferTitle.textContent =
    String(banner.title || "").trim() || "Special Offer";

  DOM.lobbyOfferMessage.textContent =
    String(banner.popupMessage || "").trim();

  DOM.lobbyOfferMessage.hidden =
    DOM.lobbyOfferMessage.textContent.length === 0;

  DOM.lobbyOfferImage.src = imageUrl;
  DOM.lobbyOfferImage.alt =
    String(banner.title || "").trim() || "TPL22 offer";

  DOM.lobbyOfferImage.onerror = () => {
    DOM.lobbyOfferImage.onerror = null;

    closeLobbyOfferPopup();
  };

  if (DOM.lobbyOfferHideToday) {
    DOM.lobbyOfferHideToday.checked = false;
  }

  setLobbyOfferTarget(banner);

  DOM.lobbyOfferPopup.hidden = false;
  document.body.classList.add("lobby-offer-open");
}

DOM.lobbyOfferClose?.addEventListener(
  "click",
  closeLobbyOfferPopup,
);

DOM.lobbyOfferBackdrop?.addEventListener(
  "click",
  closeLobbyOfferPopup,
);

DOM.lobbyOfferAction?.addEventListener("click", () => {
  closeLobbyOfferPopup();
});

document.addEventListener("keydown", (event) => {
  if (
    event.key === "Escape" &&
    DOM.lobbyOfferPopup &&
    !DOM.lobbyOfferPopup.hidden
  ) {
    closeLobbyOfferPopup();
  }
});

  async function loadGuestLobbyData(options = {}) {
    if (STATE.loading) {
      return;
    }

    const showFullLoader = options.showLoader === true;

    if (showFullLoader) {
      showLoader();
    } else if (DOM.refreshButton) {
      DOM.refreshButton.disabled = true;
      DOM.refreshButton.setAttribute("aria-busy", "true");
    }

    try {
      const [noticeResult, bannerResult, gameResult] = await Promise.allSettled(
        [
          requestPublicAPI("/lobby-notices/public"),

          requestPublicAPI("/lobby-banner"),

          requestPublicAPI("/games/availability"),
        ],
      );

      STATE.lobbyNotices =
        noticeResult.status === "fulfilled"
          ? extractLobbyNotices(noticeResult.value)
          : [];

      STATE.lobbyBanners =
        bannerResult.status === "fulfilled"
          ? extractLobbyBanners(bannerResult.value)
          : [];

      STATE.lobbyBannerIndex = 0;

      STATE.gameAvailability =
        gameResult.status === "fulfilled"
          ? extractGameAvailability(gameResult.value)
          : {};

      renderLobbyNotice();
      renderLobbyBanner();
      renderLobbyOfferPopup();
      renderGameAvailability();

      STATE.lastLoadedAt = Date.now();

      if (options.showSuccess === true) {
        showToast("Lobby updated successfully.", "success");
      }
    } catch (error) {
      console.error("GUEST LOBBY LOAD ERROR:", error);

      showToast(error.message || "Lobby data load করা যায়নি.", "error");
    } finally {
      hideLoader();
    }
  }
  /* =========================================================
     LOAD DYNAMIC LOBBY DATA
  ========================================================= */

  async function loadLobbyData(options = {}) {
    if (STATE.loading) {
      return;
    }

    const showFullLoader = options.showLoader === true;

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
        noticeResult,
        bannerResult,
        gameResult,
        referralResult,
      ] = await Promise.allSettled([
        requestAPI("/auth/me"),
        requestAPI("/deposits/my-history"),
        requestAPI("/withdraws/my-history"),
        requestAPI("/lobby-notices/public"),
        requestAPI("/lobby-banner"),
        requestAPI("/games/availability"),
        requestAPI("/auth/referral-summary"),
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
          ? extractHistory(depositResult.value, [
              "deposits",
              "requests",
              "history",
              "items",
            ])
          : [];

      STATE.withdrawals =
        withdrawResult.status === "fulfilled"
          ? extractHistory(withdrawResult.value, [
              "withdrawals",
              "requests",
              "history",
              "items",
            ])
          : [];

      STATE.lobbyNotices =
        noticeResult.status === "fulfilled"
          ? extractLobbyNotices(noticeResult.value)
          : [];

      STATE.lobbyBanners =
        bannerResult.status === "fulfilled"
          ? extractLobbyBanners(bannerResult.value)
          : [];

      STATE.lobbyBannerIndex = 0;

      STATE.gameAvailability =
        gameResult.status === "fulfilled"
          ? extractGameAvailability(gameResult.value)
          : {};

      STATE.referral =
        referralResult.status === "fulfilled"
          ? extractReferral(referralResult.value)
          : null;

      renderLobbyNotice();
      renderLobbyBanner();
      renderLobbyOfferPopup();

      renderGameAvailability();
      renderReferral();

      buildNotifications();
      renderUser();
      renderNotifications();

      STATE.lastLoadedAt = Date.now();

      if (options.showSuccess === true) {
        showToast("Lobby updated successfully.", "success");
      }
    } catch (error) {
      console.error("DYNAMIC LOBBY LOAD ERROR:", error);

      showToast(error.message || "Lobby data load করা যায়নি।", "error");
    } finally {
      hideLoader();
    }
  }

  /* =========================================================
     MODAL EVENTS
  ========================================================= */

  DOM.notificationButton?.addEventListener("click", async () => {
    openModal(DOM.notificationModal);

    /*
     * পুরোনো data হলে notification খোলার সময় refresh।
     */
    if (Date.now() - STATE.lastLoadedAt > 15000) {
      loadLobbyData();
    }
  });

  DOM.referButton?.addEventListener("click", async () => {
    openModal(DOM.referralModal);

    renderReferral();

    try {
      await refreshReferralSummary();
    } catch (error) {
      showToast(error.message || "Referral data load করা যায়নি।", "error");
    }
  });

  DOM.closeReferralModal?.addEventListener("click", () => {
    closeModal(DOM.referralModal);
  });

  DOM.copyReferralCode?.addEventListener("click", () => {
    copyReferralText(DOM.referralCode?.value, "Referral code copied.");
  });

  DOM.copyReferralLink?.addEventListener("click", () => {
    copyReferralText(DOM.referralLink?.value, "Referral link copied.");
  });

  DOM.shareReferralLink?.addEventListener("click", async () => {
    const link = DOM.referralLink?.value || "";

    const settings = STATE.referral?.settings || {};

    const shareText =
      `TPL22-তে account খুলুন। ` +
      `প্রথম qualifying deposit-এ ` +
      `৳${formatMoney(settings.referredUserBonus || 0)} referral bonus পাবেন।`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: "TPL22 Referral",

          text: shareText,

          url: link,
        });

        return;
      } catch (error) {
        if (error.name === "AbortError") {
          return;
        }
      }
    }

    await copyReferralText(link, "Referral link copied for sharing.");
  });

  DOM.closeNotification?.addEventListener("click", () =>
    closeModal(DOM.notificationModal),
  );

  DOM.logoutButton?.addEventListener("click", () => openModal(DOM.logoutModal));

  DOM.closeLogoutModal?.addEventListener("click", () =>
    closeModal(DOM.logoutModal),
  );

  DOM.cancelLogoutButton?.addEventListener("click", () =>
    closeModal(DOM.logoutModal),
  );

  DOM.confirmLogoutButton?.addEventListener("click", () => {
    if (window.AUTH_SESSION?.logout) {
      window.AUTH_SESSION.logout();

      return;
    }

    clearAuthentication();

    window.location.replace(LOGIN_PAGE);
  });

  window.addEventListener("click", (event) => {
    if (event.target === DOM.notificationModal) {
      closeModal(DOM.notificationModal);
    }

    if (event.target === DOM.referralModal) {
      closeModal(DOM.referralModal);
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

    closeModal(DOM.referralModal);

    closeModal(DOM.logoutModal);
  });

  /* =========================================================
     REFRESH BUTTON
  ========================================================= */

  DOM.refreshButton?.addEventListener("click", async () => {
    if (STATE.loading) {
      return;
    }

    const icon = DOM.refreshButton.querySelector("i");

    icon?.classList.add("fa-spin");

    if (isGuestUser()) {
      await loadGuestLobbyData({
        showSuccess: true,
      });
    } else {
      await loadLobbyData({
        showSuccess: true,
      });
    }

    icon?.classList.remove("fa-spin");
  });

  /* =========================================================
   QUICK MENU NAVIGATION
========================================================= */
  DOM.depositButton?.addEventListener("click", () => {
    if (!token) {
      navigateTo("/login");
      return;
    }

    navigateTo("/deposit");
  });

  DOM.withdrawButton?.addEventListener("click", () => navigateTo("/withdraw"));

  /* =========================================================
   GAME NAVIGATION
========================================================= */

  DOM.teenPattiButton?.addEventListener("click", () =>
    navigateTo("/teenpatti-rooms"),
  );

  DOM.pokerButton?.addEventListener("click", () => navigateTo("/poker-rooms"));

  DOM.ludoButton?.addEventListener("click", () => navigateTo("/ludo-rooms"));

  DOM.carromButton?.addEventListener("click", () => {
    showToast("Carrom-এর কাজ চলছে। শীঘ্রই চালু হবে।", "info");
  });

  DOM.andarBaharButton?.addEventListener("click", () =>
    navigateTo("/andar-bahar"),
  );

  DOM.banglaWheelButton?.addEventListener("click", () =>
    navigateTo("/bangla-wheel"),
  );

  DOM.banglaDiceButton?.addEventListener("click", () =>
    navigateTo("/bangla-dice"),
  );

  DOM.aviatorButton?.addEventListener("click", () => navigateTo("/aviator"));

  DOM.kaitButton?.addEventListener("click", () => navigateTo("/kait"));

  DOM.lotteryButton?.addEventListener("click", () => navigateTo("/lottery"));

  /* =========================================================
   BOTTOM NAVIGATION
========================================================= */

  DOM.homeButton?.addEventListener("click", () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  });

  DOM.walletButton?.addEventListener("click", () => navigateTo("/wallet"));

  DOM.supportButton?.addEventListener("click", () => navigateTo("/support"));

  DOM.profileButton?.addEventListener("click", () => navigateTo("/profile"));

  DOM.settingsButton?.addEventListener("click", () => {
    showToast("Settings-এর কাজ চলছে। শীঘ্রই চালু হবে।", "info");
  });

  /* =========================================================
     PAGE VISIBILITY REFRESH
  ========================================================= */

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      stopLobbyBannerTimer();
      return;
    }

    startLobbyBannerTimer();

    if (Date.now() - STATE.lastLoadedAt > 15000) {
      if (isGuestUser()) {
        loadGuestLobbyData();
      } else {
        loadLobbyData();
      }
    }
  });

  window.addEventListener("focus", () => {
    if (Date.now() - STATE.lastLoadedAt > 15000) {
      if (isGuestUser()) {
        loadGuestLobbyData();
      } else {
        loadLobbyData();
      }
    }
  });

  window.addEventListener("beforeunload", () => {
    stopLobbyBannerTimer();
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
      STATE.user = null;

      document.body.classList.add("guest-user");

      if (DOM.logoutButton) {
        DOM.logoutButton.style.display = "none";
      }

      await loadGuestLobbyData({
        showLoader: true,
      });

      console.log("✅ Guest Lobby loaded");

      return;
    }

    const cachedUser = (() => {
      try {
        return JSON.parse(localStorage.getItem("current_user") || "null");
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

    console.log("✅ TPL22 dynamic Lobby loaded");
  }

  initializeLobby();
    DOM.downloadAppButton?.addEventListener(
    "click",
    async () => {
      try {
        const result =
          await requestPublicAPI(
            "/app-download/info"
          );

        const app =
          result?.data?.app ||
          result?.app ||
          null;

        if (
          !app?.downloadEnabled
        ) {
          showToast(
            "App download এখন বন্ধ আছে।",
            "error"
          );

          return;
        }

        if (!app?.available) {
          showToast(
            "App এখনো upload করা হয়নি।",
            "error"
          );

          return;
        }

        let downloadUrl =
          window.APP_CONFIG.api(
            "/app-download/download"
          );

        const currentToken =
          localStorage.getItem(
            "access_token"
          ) ||
          localStorage.getItem(
            "token"
          ) ||
          "";

        if (currentToken) {
          try {
            const ticketResponse =
              await fetch(
                window.APP_CONFIG.api(
                  "/app-download/download-ticket"
                ),
                {
                  method: "POST",

                  headers: {
                    Accept:
                      "application/json",

                    Authorization:
                      `Bearer ${currentToken}`
                  },

                  cache:
                    "no-store"
                }
              );

            let ticketResult =
              null;

            try {
              ticketResult =
                await ticketResponse.json();
            } catch (error) {
              ticketResult =
                null;
            }

            const downloadTicket =
              ticketResult?.data
                ?.downloadTicket ||
              "";

            if (
              ticketResponse.ok &&
              downloadTicket
            ) {
              downloadUrl +=
                `?download_ticket=${encodeURIComponent(
                  downloadTicket
                )}`;
            }
          } catch (error) {
            console.warn(
              "DOWNLOAD TICKET ERROR; CONTINUING AS GUEST:",
              error
            );
          }
        }

        const link =
          document.createElement(
            "a"
          );

        link.href =
          downloadUrl;

        link.download =
          app?.fileName ||
          "TPL22.apk";

        document.body.appendChild(
          link
        );

        link.click();
        link.remove();
      } catch (error) {
        console.error(
          "APP DOWNLOAD ERROR:",
          error
        );

        showToast(
          error.message ||
            "App download করা যাচ্ছে না।",
          "error"
        );
      }
    }
  );

  /* =========================================================
   GUEST AUTH POPUP
========================================================= */

  const guestAuthModal = document.getElementById("guestAuthModal");

  const guestAuthClose = document.getElementById("guestAuthClose");

  const guestSignupButton = document.getElementById("guestSignupBtn");

  const guestLoginButton = document.getElementById("guestLoginBtn");

  function isGuestUser() {
    return !(
      localStorage.getItem("access_token") || localStorage.getItem("token")
    );
  }

  function showGuestAuthPopup() {
    if (!guestAuthModal || !isGuestUser()) {
      return;
    }

    guestAuthModal.hidden = false;
  }

  function hideGuestAuthPopup() {
    if (!guestAuthModal) {
      return;
    }

    guestAuthModal.hidden = true;
  }

  /* CLOSE */

  guestAuthClose?.addEventListener("click", () => {
    hideGuestAuthPopup();
  });

  /* SIGN UP */

  guestSignupButton?.addEventListener("click", () => {
    window.location.href = "/register";
  });

  /* LOGIN */

  guestLoginButton?.addEventListener("click", () => {
    window.location.href = "/login";
  });

  /* =========================================================
   PROTECTED BUTTONS FOR GUEST
========================================================= */

  const guestProtectedIds = new Set([
    "notifyBtn",
    "depositBtn",
    "withdrawBtn",
    "walletBtn",
    "supportBtn",
    "profileBtn",
    "settingsBtn",
    "referBtn",

    "teenPattiBtn",
    "pokerBtn",
    "ludoBtn",
    "carromBtn",

    "andarBaharBtn",
    "banglaWheelBtn",
    "banglaDiceBtn",
    "aviatorBtn",
    "kaitBtn",
    "lotteryBtn",
  ]);

  document.addEventListener(
    "click",
    (event) => {
      if (!isGuestUser()) {
        return;
      }

      const button = event.target.closest("button, a");

      if (!button) {
        return;
      }

      if (!guestProtectedIds.has(button.id)) {
        return;
      }

      event.preventDefault();

      event.stopPropagation();

      event.stopImmediatePropagation();

      showGuestAuthPopup();
    },
    true,
  );
});
