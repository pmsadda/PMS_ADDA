const API_BASE_URL = APP_CONFIG.API_URL;

let dashboardRefreshTimer = null;

/* =========================
   Helpers
========================= */

function getAccessToken() {
  return localStorage.getItem("access_token");
}

function setText(id, value) {
  const element = document.getElementById(id);

  if (element) {
    element.textContent = value;
  }
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("en-BD");
}

/*
HTML-এ ৳ চিহ্ন আগে থেকেই আছে।
তাই এখানে শুধু সংখ্যাটি return করা হচ্ছে।
*/
function formatMoneyValue(value) {
  return Number(value || 0).toLocaleString("en-BD", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function showLoader() {
  const loaderOverlay = document.getElementById("loaderOverlay");

  if (loaderOverlay) {
    loaderOverlay.classList.add("show");
    loaderOverlay.setAttribute("aria-hidden", "false");
  }

  document.body.classList.add("dashboard-loading");
}

function hideLoader() {
  const loaderOverlay = document.getElementById("loaderOverlay");

  if (loaderOverlay) {
    loaderOverlay.classList.remove("show");
    loaderOverlay.setAttribute("aria-hidden", "true");
  }

  document.body.classList.remove("dashboard-loading");
}

function showToast(message, type = "success") {
  const toast = document.getElementById("toast");
  const toastMessage = document.getElementById("toastMessage");

  if (!toast || !toastMessage) {
    return;
  }

  toastMessage.textContent = message;

  toast.classList.remove("success", "error", "show");

  toast.classList.add(type, "show");

  window.clearTimeout(showToast.timeoutId);

  showToast.timeoutId = window.setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}

async function parseResponse(response) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();

  throw new Error(text || "Invalid server response.");
}

/* =========================
   Admin profile
========================= */

function loadAdminProfile() {
  const possibleKeys = ["user", "admin_user", "logged_in_user"];

  let storedUser = null;

  for (const key of possibleKeys) {
    const rawValue = localStorage.getItem(key);

    if (!rawValue) {
      continue;
    }

    try {
      storedUser = JSON.parse(rawValue);
      break;
    } catch (error) {
      console.warn(`Invalid user data in ${key}`);
    }
  }

  if (!storedUser) {
    return;
  }

  const adminName =
    storedUser.full_name ||
    storedUser.fullName ||
    storedUser.username ||
    storedUser.name ||
    "Administrator";

  setText("adminName", adminName);

  const adminAvatar = document.getElementById("adminAvatar");

  const avatarUrl =
    storedUser.avatar || storedUser.avatar_url || storedUser.profile_image;

  if (adminAvatar && avatarUrl) {
    adminAvatar.src = avatarUrl;
  }
}

/* =========================
   Dashboard API
========================= */

async function loadDashboardStats({ showSuccessMessage = false } = {}) {
  const token = getAccessToken();

  if (!token) {
    window.location.href = "../pages/login.html";

    return;
  }

  try {
    showLoader();

    const response = await fetch(`${API_BASE_URL}/admin/dashboard/stats`, {
      method: "GET",

      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    const result = await parseResponse(response);

    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem("access_token");

      throw new Error("Your login session has expired.");
    }

    if (!response.ok || !result.success || !result.data) {
      throw new Error(result.message || "Failed to load dashboard.");
    }

    renderDashboardStats(result.data);

    if (showSuccessMessage) {
      showToast("Dashboard refreshed successfully.");
    }
  } catch (error) {
    console.error("Dashboard error:", error);

    showToast(error.message || "Failed to load dashboard.", "error");

    if (error.message === "Your login session has expired.") {
      window.setTimeout(() => {
        window.location.href = "../pages/login.html";
      }, 1200);
    }
  } finally {
    hideLoader();
  }
}

function renderDashboardStats(data) {
  const users = data.users || {};
  const deposits = data.deposits || {};
  const withdrawals = data.withdrawals || {};

  const depositPending = deposits.pending || {};

  const depositApproved = deposits.approved || {};

  const withdrawPending = withdrawals.pending || {};

  const withdrawApproved = withdrawals.approved || {};

  /*
  Current API-তে আলাদা todayAmount নেই।
  Backend-এ todayAmount যোগ না হওয়া পর্যন্ত
  approved total ব্যবহার করা হচ্ছে।
  */
  const todayDepositAmount =
    deposits.todayAmount ?? depositApproved.amount ?? 0;

  const todayWithdrawAmount =
    withdrawals.todayAmount ?? withdrawApproved.amount ?? 0;

  const pendingDepositCount = depositPending.count ?? 0;

  const pendingWithdrawCount = withdrawPending.count ?? 0;

  /* Main cards */

  setText("todayDeposit", formatMoneyValue(todayDepositAmount));

  setText("todayWithdraw", formatMoneyValue(todayWithdrawAmount));

  setText("pendingDeposits", formatNumber(pendingDepositCount));

  setText("pendingWithdrawals", formatNumber(pendingWithdrawCount));

  setText("onlineUsers", formatNumber(users.online));

  setText("totalUsers", formatNumber(users.total));

  /* Sidebar menu badges */

  setText("pendingDepositMenuCount", formatNumber(pendingDepositCount));

  setText("pendingWithdrawMenuCount", formatNumber(pendingWithdrawCount));

  /*
  বর্তমান API-তে game revenue, rooms,
  bot statistics ও service-charge revenue নেই।
  তাই API field থাকলে value দেখাবে,
  না থাকলে 0 দেখাবে।
  */

  const revenue = data.revenue || {};
  const rooms = data.rooms || {};
  const games = data.games || {};
  const bots = data.bots || {};

  setText(
    "totalRevenue",
    formatMoneyValue(revenue.totalAmount ?? revenue.total ?? 0),
  );

  setText(
    "todayRevenue",
    formatMoneyValue(revenue.todayAmount ?? revenue.today ?? 0),
  );

  setText(
    "totalActiveRooms",
    formatNumber(rooms.active ?? rooms.totalActive ?? 0),
  );

  setText(
    "teenPattiRevenue",
    formatMoneyValue(
      games.teenPatti?.revenue ?? games.teen_patti?.revenue ?? 0,
    ),
  );

  setText("pokerRevenue", formatMoneyValue(games.poker?.revenue ?? 0));

  setText("ludoRevenue", formatMoneyValue(games.ludo?.revenue ?? 0));

  setText("activeBots", formatNumber(bots.active ?? 0));

  setText(
    "botGamesPlayed",
    formatNumber(bots.gamesPlayed ?? bots.totalGames ?? 0),
  );

  setText("botRevenue", formatMoneyValue(bots.revenue ?? 0));

  setText("botLoss", formatMoneyValue(bots.loss ?? 0));

  const botNetResult =
    bots.netResult ?? Number(bots.revenue || 0) - Number(bots.loss || 0);

  setText("botNetResult", formatMoneyValue(botNetResult));

  updateServiceChargeValues(data.serviceCharges || data.serviceCharge || {});

  renderRecentDeposits(data.recentDeposits || []);

  renderRecentWithdrawals(data.recentWithdrawals || []);
}

/* =========================
   Service Charges
========================= */

function updateServiceChargeValues(serviceCharges) {
  const teenPattiCharge =
    serviceCharges.teenPatti ?? serviceCharges.teen_patti ?? 5;

  const pokerCharge = serviceCharges.poker ?? 5;

  const ludoCharge = serviceCharges.ludo ?? 10;

  setInputValue("teenPattiCharge", teenPattiCharge);

  setInputValue("pokerCharge", pokerCharge);

  setInputValue("ludoCharge", ludoCharge);

  setText("teenPattiChargeLabel", teenPattiCharge);

  setText("pokerChargeLabel", pokerCharge);

  setText("ludoChargeLabel", ludoCharge);
}

function setInputValue(id, value) {
  const input = document.getElementById(id);

  if (input) {
    input.value = value;
  }
}

function getChargeValues() {
  return {
    teenPatti: Number(document.getElementById("teenPattiCharge")?.value || 0),

    poker: Number(document.getElementById("pokerCharge")?.value || 0),

    ludo: Number(document.getElementById("ludoCharge")?.value || 0),
  };
}

function validateChargeValues(charges) {
  return Object.values(charges).every(
    (value) => Number.isFinite(value) && value >= 0 && value <= 20,
  );
}

function openChargeConfirmModal() {
  const charges = getChargeValues();

  if (!validateChargeValues(charges)) {
    showToast(
      "Service charge must be between 0 and 20.",
      "error",
    );

    return;
  }

  setText(
    "confirmTeenPattiCharge",
    charges.teenPatti,
  );

  setText(
    "confirmPokerCharge",
    charges.poker,
  );

  setText(
    "confirmLudoCharge",
    charges.ludo,
  );

  const modal =
    document.getElementById(
      "chargeConfirmModal",
    );

  if (modal) {
    modal.classList.add("show");

    modal.style.display = "flex";

    modal.setAttribute(
      "aria-hidden",
      "false",
    );
  }
}

function closeChargeConfirmModal() {
  const modal =
    document.getElementById(
      "chargeConfirmModal",
    );

  if (modal) {
    modal.classList.remove("show");

    modal.style.display = "none";

    modal.setAttribute(
      "aria-hidden",
      "true",
    );
  }
}

async function confirmServiceChargeSave() {
  const charges = getChargeValues();

  if (!validateChargeValues(charges)) {
    showToast(
      "Service charge must be between 0 and 20.",
      "error",
    );

    return;
  }

  const token = getAccessToken();

  if (!token) {
    window.location.href =
      "../pages/login.html";

    return;
  }

  const confirmButton =
    document.getElementById(
      "confirmChargeSave",
    );

  try {
    if (confirmButton) {
      confirmButton.disabled = true;
    }

    showLoader();

    const response = await fetch(
      `${API_BASE_URL}/admin/dashboard/service-charges`,
      {
        method: "PATCH",

        headers: {
          Authorization:
            `Bearer ${token}`,

          Accept:
            "application/json",

          "Content-Type":
            "application/json",
        },

        body: JSON.stringify(charges),
      },
    );

    const result =
      await parseResponse(response);

    if (
      response.status === 401 ||
      response.status === 403
    ) {
      localStorage.removeItem(
        "access_token",
      );

      throw new Error(
        "Your admin session has expired.",
      );
    }

    if (
      !response.ok ||
      !result.success
    ) {
      throw new Error(
        result.message ||
        "Service charge update failed.",
      );
    }

    const savedCharges =
      result.data?.serviceCharges ||
      charges;

    updateServiceChargeValues(
      savedCharges,
    );

    closeChargeConfirmModal();

    showToast(
      result.message ||
      "Service charges updated successfully.",
    );
  } catch (error) {
    console.error(
      "SERVICE CHARGE UPDATE ERROR:",
      error,
    );

    showToast(
      error.message ||
      "Service charge update failed.",
      "error",
    );

    if (
      error.message ===
      "Your admin session has expired."
    ) {
      window.setTimeout(() => {
        window.location.href =
          "../pages/login.html";
      }, 1200);
    }
  } finally {
    if (confirmButton) {
      confirmButton.disabled = false;
    }

    hideLoader();
  }
}



/* =========================
   Recent request rendering
========================= */

function getInitials(name) {
  const safeName = String(name || "User").trim();

  return safeName
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getStatusClass(status) {
  const normalized = String(status || "").toLowerCase();

  if (normalized === "approved") {
    return "success";
  }

  if (normalized === "rejected") {
    return "failed";
  }

  return "pending";
}

function renderRecentDeposits(items) {
  const container = document.getElementById("recentDepositList");

  if (!container) {
    return;
  }

  if (!Array.isArray(items) || items.length === 0) {
    container.innerHTML = `
      <div class="empty-request-message">
        No recent deposit requests.
      </div>
    `;

    return;
  }

  container.innerHTML = items
    .slice(0, 5)
    .map((item) => {
      const name =
        item.full_name || item.userName || item.username || "Unknown User";

      const requestId = item.deposit_id || item.requestId || "-";

      const status = item.status || "pending";

      return `
        <article class="request-item">
          <div class="request-user">
            <div class="request-avatar">
              ${escapeHtml(getInitials(name))}
            </div>

            <div>
              <strong>
                ${escapeHtml(name)}
              </strong>

              <span>
                ${escapeHtml(requestId)}
              </span>
            </div>
          </div>

          <div class="request-details">
            <strong>
              ৳${formatMoneyValue(item.amount)}
            </strong>

            <span class="request-status ${getStatusClass(status)}">
              ${escapeHtml(status)}
            </span>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderRecentWithdrawals(items) {
  const container = document.getElementById("recentWithdrawList");

  if (!container) {
    return;
  }

  if (!Array.isArray(items) || items.length === 0) {
    container.innerHTML = `
      <div class="empty-request-message">
        No recent withdrawal requests.
      </div>
    `;

    return;
  }

  container.innerHTML = items
    .slice(0, 5)
    .map((item) => {
      const name =
        item.full_name || item.userName || item.username || "Unknown User";

      const requestId = item.withdraw_id || item.requestId || "-";

      const status = item.status || "pending";

      return `
        <article class="request-item">
          <div class="request-user">
            <div class="request-avatar">
              ${escapeHtml(getInitials(name))}
            </div>

            <div>
              <strong>
                ${escapeHtml(name)}
              </strong>

              <span>
                ${escapeHtml(requestId)}
              </span>
            </div>
          </div>

          <div class="request-details">
            <strong>
              ৳${formatMoneyValue(item.amount)}
            </strong>

            <span class="request-status ${getStatusClass(status)}">
              ${escapeHtml(status)}
            </span>
          </div>
        </article>
      `;
    })
    .join("");
}

/* =========================
   Sidebar
========================= */

function toggleSidebar() {
  const sidebar = document.getElementById("adminSidebar");

  const overlay = document.getElementById("sidebarOverlay");

  sidebar?.classList.toggle("open");
  overlay?.classList.toggle("show");
}

function closeSidebar() {
  document.getElementById("adminSidebar")?.classList.remove("open");

  document.getElementById("sidebarOverlay")?.classList.remove("show");
}

/* =========================
   Logout
========================= */

function logoutAdmin() {
  localStorage.removeItem("access_token");

  localStorage.removeItem("refresh_token");

  localStorage.removeItem("user");
  localStorage.removeItem("admin_user");
  localStorage.removeItem("logged_in_user");

  if (dashboardRefreshTimer) {
    window.clearInterval(dashboardRefreshTimer);
  }

  window.location.href = "../pages/login.html";
}

/* =========================
   Events
========================= */

function bindDashboardEvents() {
  document.getElementById("refreshDashboard")?.addEventListener("click", () => {
    loadDashboardStats({
      showSuccessMessage: true,
    });
  });

  document
    .getElementById("adminLogoutBtn")
    ?.addEventListener("click", logoutAdmin);

  document
    .getElementById("sidebarToggle")
    ?.addEventListener("click", toggleSidebar);

  document
    .getElementById("sidebarOverlay")
    ?.addEventListener("click", closeSidebar);

  document
    .getElementById("serviceChargeForm")
    ?.addEventListener("submit", (event) => {
      event.preventDefault();
      openChargeConfirmModal();
    });

  document
    .getElementById("closeChargeModal")
    ?.addEventListener("click", closeChargeConfirmModal);

  document
    .getElementById("cancelChargeSave")
    ?.addEventListener("click", closeChargeConfirmModal);

  document
    .getElementById("confirmChargeSave")
    ?.addEventListener("click", confirmServiceChargeSave);

  document
    .getElementById("chargeConfirmModal")
    ?.addEventListener("click", (event) => {
      if (event.target.id === "chargeConfirmModal") {
        closeChargeConfirmModal();
      }
    });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeSidebar();
      closeChargeConfirmModal();
    }
  });
}

/* ==========================================
   LOBBY NOTICE MANAGEMENT
========================================== */

const LOBBY_NOTICE_STATE = {
  notices: [],
  loading: false,
};

function getNoticeElements() {
  return {
    textInput: document.getElementById("lobbyNoticeInput"),

    startsAt: document.getElementById("noticeStartsAt"),

    endsAt: document.getElementById("noticeEndsAt"),

    editingId: document.getElementById("editingNoticeId"),

    formTitle: document.getElementById("noticeFormTitle"),

    editBadge: document.getElementById("noticeEditBadge"),

    characterCount: document.getElementById("noticeCharacterCount"),

    noticeList: document.getElementById("adminNoticeList"),

    totalCount: document.getElementById("noticeTotalCount"),

    saveDraft: document.getElementById("saveNoticeDraft"),

    publish: document.getElementById("publishLobbyNotice"),

    cancelEdit: document.getElementById("cancelNoticeEdit"),

    refresh: document.getElementById("refreshLobbyNotices"),
  };
}

function formatNoticeDate(value) {
  if (!value) {
    return "Not set";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not set";
  }

  return date.toLocaleString("en-BD", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toDatetimeLocalValue(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);

  return localDate.toISOString().slice(0, 16);
}

function updateNoticeCharacterCount() {
  const elements = getNoticeElements();

  if (!elements.textInput || !elements.characterCount) {
    return;
  }

  const length = elements.textInput.value.length;

  elements.characterCount.textContent = String(length);

  const countContainer = elements.characterCount.parentElement;

  countContainer?.classList.toggle("limit-near", length >= 450 && length < 500);

  countContainer?.classList.toggle("limit-reached", length >= 500);
}

function setNoticeControlsDisabled(disabled) {
  const elements = getNoticeElements();

  [
    elements.textInput,
    elements.startsAt,
    elements.endsAt,
    elements.saveDraft,
    elements.publish,
    elements.cancelEdit,
    elements.refresh,
  ].forEach((element) => {
    if (element) {
      element.disabled = disabled;
    }
  });
}

function resetNoticeForm() {
  const elements = getNoticeElements();

  if (elements.textInput) {
    elements.textInput.value = "";
  }

  if (elements.startsAt) {
    elements.startsAt.value = "";
  }

  if (elements.endsAt) {
    elements.endsAt.value = "";
  }

  if (elements.editingId) {
    elements.editingId.value = "";
  }

  if (elements.formTitle) {
    elements.formTitle.textContent = "Create Notice";
  }

  if (elements.editBadge) {
    elements.editBadge.hidden = true;
  }

  if (elements.cancelEdit) {
    elements.cancelEdit.hidden = true;
  }

  updateNoticeCharacterCount();
}

function startNoticeEdit(noticeId) {
  const notice = LOBBY_NOTICE_STATE.notices.find(
    (item) => Number(item.id) === Number(noticeId),
  );

  if (!notice) {
    showToast("Lobby notice পাওয়া যায়নি।", "error");

    return;
  }

  const elements = getNoticeElements();

  if (elements.editingId) {
    elements.editingId.value = String(notice.id);
  }

  if (elements.textInput) {
    elements.textInput.value = notice.noticeText || "";
  }

  if (elements.startsAt) {
    elements.startsAt.value = toDatetimeLocalValue(notice.startsAt);
  }

  if (elements.endsAt) {
    elements.endsAt.value = toDatetimeLocalValue(notice.endsAt);
  }

  if (elements.formTitle) {
    elements.formTitle.textContent = "Edit Notice";
  }

  if (elements.editBadge) {
    elements.editBadge.hidden = false;
  }

  if (elements.cancelEdit) {
    elements.cancelEdit.hidden = false;
  }

  updateNoticeCharacterCount();

  elements.textInput?.focus();

  document.querySelector(".notice-management-section")?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

function renderAdminLobbyNotices() {
  const elements = getNoticeElements();

  if (!elements.noticeList || !elements.totalCount) {
    return;
  }

  elements.totalCount.textContent = String(LOBBY_NOTICE_STATE.notices.length);

  elements.noticeList.innerHTML = "";

  if (LOBBY_NOTICE_STATE.notices.length === 0) {
    elements.noticeList.innerHTML = `
      <div class="admin-notice-empty">
        <i class="fa-regular fa-message"></i>
        <p>No Lobby notices found.</p>
      </div>
    `;

    return;
  }

  LOBBY_NOTICE_STATE.notices.forEach((notice) => {
    const noticeItem = document.createElement("article");

    noticeItem.className = "admin-notice-item";

    if (notice.status === "published") {
      noticeItem.classList.add("is-published");
    }

    const header = document.createElement("div");

    header.className = "admin-notice-item-header";

    const status = document.createElement("span");

    status.className = `admin-notice-status ${notice.status || "draft"}`;

    status.textContent = notice.status || "draft";

    const createdAt = document.createElement("span");

    createdAt.className = "admin-notice-date";

    createdAt.textContent = formatNoticeDate(notice.createdAt);

    header.append(status, createdAt);

    const noticeText = document.createElement("p");

    noticeText.className = "admin-notice-text";

    noticeText.textContent = notice.noticeText || "";

    const schedule = document.createElement("div");

    schedule.className = "admin-notice-schedule";

    const startText = document.createElement("span");

    startText.innerHTML = '<i class="fa-regular fa-clock"></i>';

    startText.append(
      document.createTextNode(` Start: ${formatNoticeDate(notice.startsAt)}`),
    );

    const endText = document.createElement("span");

    endText.innerHTML = '<i class="fa-regular fa-calendar-xmark"></i>';

    endText.append(
      document.createTextNode(` End: ${formatNoticeDate(notice.endsAt)}`),
    );

    schedule.append(startText, endText);

    const actions = document.createElement("div");

    actions.className = "admin-notice-actions";

    const editButton = document.createElement("button");

    editButton.type = "button";

    editButton.className = "notice-edit-action";

    editButton.dataset.action = "edit";
    editButton.dataset.noticeId = String(notice.id);

    editButton.innerHTML = `
        <i class="fa-solid fa-pen"></i>
        Edit
      `;

    actions.appendChild(editButton);

    if (notice.status !== "published") {
      const publishButton = document.createElement("button");

      publishButton.type = "button";

      publishButton.className = "notice-publish-action";

      publishButton.dataset.action = "publish";

      publishButton.dataset.noticeId = String(notice.id);

      publishButton.innerHTML = `
          <i class="fa-solid fa-paper-plane"></i>
          Publish
        `;

      actions.appendChild(publishButton);
    }

    if (notice.status !== "inactive") {
      const inactiveButton = document.createElement("button");

      inactiveButton.type = "button";

      inactiveButton.className = "notice-inactive-action";

      inactiveButton.dataset.action = "inactive";

      inactiveButton.dataset.noticeId = String(notice.id);

      inactiveButton.innerHTML = `
          <i class="fa-solid fa-ban"></i>
          Inactive
        `;

      actions.appendChild(inactiveButton);
    }

    noticeItem.append(header, noticeText, schedule, actions);

    elements.noticeList.appendChild(noticeItem);
  });
}

async function requestLobbyNoticeAPI(path = "", options = {}) {
  const token = getAccessToken();

  if (!token) {
    window.location.href = "../pages/login.html";

    throw new Error("Admin login is required.");
  }

  const response = await fetch(`${API_BASE_URL}/lobby-notices/admin${path}`, {
    method: options.method || "GET",

    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,

      ...(options.body
        ? {
            "Content-Type": "application/json",
          }
        : {}),
    },

    body: options.body ? JSON.stringify(options.body) : undefined,

    cache: "no-store",
  });

  const result = await parseResponse(response);

  if (response.status === 401 || response.status === 403) {
    throw new Error(result.message || "Admin authorization failed.");
  }

  if (!response.ok || !result.success) {
    throw new Error(result.message || "Lobby notice request failed.");
  }

  return result;
}

async function loadLobbyNotices({ showSuccess = false } = {}) {
  if (LOBBY_NOTICE_STATE.loading) {
    return;
  }

  LOBBY_NOTICE_STATE.loading = true;

  setNoticeControlsDisabled(true);

  const refreshButton = getNoticeElements().refresh;

  refreshButton?.querySelector("i")?.classList.add("fa-spin");

  try {
    const result = await requestLobbyNoticeAPI();

    LOBBY_NOTICE_STATE.notices = Array.isArray(result?.data?.notices)
      ? result.data.notices
      : [];

    renderAdminLobbyNotices();

    if (showSuccess) {
      showToast("Lobby notices refreshed successfully.");
    }
  } catch (error) {
    console.error("LOAD LOBBY NOTICES ERROR:", error);

    showToast(error.message || "Lobby notices load করা যায়নি।", "error");
  } finally {
    LOBBY_NOTICE_STATE.loading = false;

    setNoticeControlsDisabled(false);

    refreshButton?.querySelector("i")?.classList.remove("fa-spin");
  }
}

function getNoticeFormPayload(status) {
  const elements = getNoticeElements();

  const noticeText = String(elements.textInput?.value || "").trim();

  if (!noticeText) {
    throw new Error("Notice text লিখুন।");
  }

  if (noticeText.length > 500) {
    throw new Error("Notice সর্বোচ্চ 500 characters হতে পারবে।");
  }

  const startsAt = elements.startsAt?.value || null;

  const endsAt = elements.endsAt?.value || null;

  if (
    startsAt &&
    endsAt &&
    new Date(endsAt).getTime() <= new Date(startsAt).getTime()
  ) {
    throw new Error("End Time অবশ্যই Start Time-এর পরে হতে হবে।");
  }

  return {
    noticeText,
    status,
    startsAt,
    endsAt,
  };
}

async function submitLobbyNotice(status) {
  if (LOBBY_NOTICE_STATE.loading) {
    return;
  }

  let payload;

  try {
    payload = getNoticeFormPayload(status);
  } catch (error) {
    showToast(error.message, "error");

    return;
  }

  const elements = getNoticeElements();

  const noticeId = Number.parseInt(elements.editingId?.value || "", 10);

  const isEditing = Number.isInteger(noticeId) && noticeId > 0;

  LOBBY_NOTICE_STATE.loading = true;

  setNoticeControlsDisabled(true);

  try {
    const result = await requestLobbyNoticeAPI(
      isEditing ? `/${noticeId}` : "",
      {
        method: isEditing ? "PATCH" : "POST",

        body: payload,
      },
    );

    showToast(result.message || "Lobby notice saved successfully.");

    resetNoticeForm();

    LOBBY_NOTICE_STATE.loading = false;

    await loadLobbyNotices();
  } catch (error) {
    console.error("SAVE LOBBY NOTICE ERROR:", error);

    showToast(error.message || "Lobby notice save করা যায়নি।", "error");
  } finally {
    LOBBY_NOTICE_STATE.loading = false;

    setNoticeControlsDisabled(false);
  }
}

async function updateLobbyNoticeStatus(noticeId, status) {
  if (LOBBY_NOTICE_STATE.loading) {
    return;
  }

  LOBBY_NOTICE_STATE.loading = true;

  setNoticeControlsDisabled(true);

  try {
    const result = await requestLobbyNoticeAPI(`/${noticeId}`, {
      method: "PATCH",

      body: {
        status,
      },
    });

    showToast(result.message || "Notice status updated successfully.");

    if (Number(getNoticeElements().editingId?.value) === Number(noticeId)) {
      resetNoticeForm();
    }

    LOBBY_NOTICE_STATE.loading = false;

    await loadLobbyNotices();
    
  } catch (error) {
    console.error("UPDATE NOTICE STATUS ERROR:", error);

    showToast(error.message || "Notice status update করা যায়নি।", "error");
  } finally {
    LOBBY_NOTICE_STATE.loading = false;

    setNoticeControlsDisabled(false);
  }
}

function bindLobbyNoticeEvents() {
  const elements = getNoticeElements();

  elements.textInput?.addEventListener("input", updateNoticeCharacterCount);

  elements.saveDraft?.addEventListener("click", () => {
    submitLobbyNotice("draft");
  });

  elements.publish?.addEventListener("click", () => {
    submitLobbyNotice("published");
  });

  elements.cancelEdit?.addEventListener("click", resetNoticeForm);

  elements.refresh?.addEventListener("click", () => {
    loadLobbyNotices({
      showSuccess: true,
    });
  });

  elements.noticeList?.addEventListener("click", (event) => {
    const actionButton = event.target.closest(
      "button[data-action][data-notice-id]",
    );

    if (!actionButton) {
      return;
    }

    const noticeId = Number.parseInt(actionButton.dataset.noticeId, 10);

    if (!noticeId) {
      return;
    }

    const action = actionButton.dataset.action;

    if (action === "edit") {
      startNoticeEdit(noticeId);
      return;
    }

    if (action === "publish") {
      updateLobbyNoticeStatus(noticeId, "published");

      return;
    }

    if (action === "inactive") {
      updateLobbyNoticeStatus(noticeId, "inactive");
    }
  });

  updateNoticeCharacterCount();
}

/* =========================
   Page initialization
========================= */

document.addEventListener("DOMContentLoaded", () => {
  loadAdminProfile();
  bindDashboardEvents();
  loadDashboardStats();
  bindLobbyNoticeEvents();
  loadLobbyNotices();

  dashboardRefreshTimer = window.setInterval(() => {
    loadDashboardStats();
  }, 30000);
});
