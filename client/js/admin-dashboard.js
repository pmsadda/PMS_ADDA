const API_BASE_URL =
    APP_CONFIG.API_URL;

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
    maximumFractionDigits: 2
  });
}

function showLoader() {
  const loaderOverlay =
    document.getElementById("loaderOverlay");

  if (loaderOverlay) {
    loaderOverlay.classList.add("show");
    loaderOverlay.setAttribute(
      "aria-hidden",
      "false"
    );
  }

  document.body.classList.add(
    "dashboard-loading"
  );
}

function hideLoader() {
  const loaderOverlay =
    document.getElementById("loaderOverlay");

  if (loaderOverlay) {
    loaderOverlay.classList.remove("show");
    loaderOverlay.setAttribute(
      "aria-hidden",
      "true"
    );
  }

  document.body.classList.remove(
    "dashboard-loading"
  );
}

function showToast(message, type = "success") {
  const toast = document.getElementById("toast");
  const toastMessage =
    document.getElementById("toastMessage");

  if (!toast || !toastMessage) {
    return;
  }

  toastMessage.textContent = message;

  toast.classList.remove(
    "success",
    "error",
    "show"
  );

  toast.classList.add(type, "show");

  window.clearTimeout(
    showToast.timeoutId
  );

  showToast.timeoutId = window.setTimeout(
    () => {
      toast.classList.remove("show");
    },
    3000
  );
}

async function parseResponse(response) {
  const contentType =
    response.headers.get("content-type") || "";

  if (
    contentType.includes(
      "application/json"
    )
  ) {
    return response.json();
  }

  const text = await response.text();

  throw new Error(
    text || "Invalid server response."
  );
}

/* =========================
   Admin profile
========================= */

function loadAdminProfile() {
  const possibleKeys = [
    "user",
    "admin_user",
    "logged_in_user"
  ];

  let storedUser = null;

  for (const key of possibleKeys) {
    const rawValue =
      localStorage.getItem(key);

    if (!rawValue) {
      continue;
    }

    try {
      storedUser = JSON.parse(rawValue);
      break;
    } catch (error) {
      console.warn(
        `Invalid user data in ${key}`
      );
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

  const adminAvatar =
    document.getElementById("adminAvatar");

  const avatarUrl =
    storedUser.avatar ||
    storedUser.avatar_url ||
    storedUser.profile_image;

  if (adminAvatar && avatarUrl) {
    adminAvatar.src = avatarUrl;
  }
}

/* =========================
   Dashboard API
========================= */

async function loadDashboardStats({
  showSuccessMessage = false
} = {}) {
  const token = getAccessToken();

  if (!token) {
    window.location.href =
      "../pages/login.html";

    return;
  }

  try {
    showLoader();

    const response = await fetch(
      `${API_BASE_URL}/admin/dashboard/stats`,
      {
        method: "GET",

        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json"
        }
      }
    );

    const result =
      await parseResponse(response);

    if (
      response.status === 401 ||
      response.status === 403
    ) {
      localStorage.removeItem(
        "access_token"
      );

      throw new Error(
        "Your login session has expired."
      );
    }

    if (
      !response.ok ||
      !result.success ||
      !result.data
    ) {
      throw new Error(
        result.message ||
        "Failed to load dashboard."
      );
    }

    renderDashboardStats(result.data);

    if (showSuccessMessage) {
      showToast(
        "Dashboard refreshed successfully."
      );
    }
  } catch (error) {
    console.error(
      "Dashboard error:",
      error
    );

    showToast(
      error.message ||
      "Failed to load dashboard.",
      "error"
    );

    if (
      error.message ===
      "Your login session has expired."
    ) {
      window.setTimeout(() => {
        window.location.href =
          "../pages/login.html";
      }, 1200);
    }
  } finally {
    hideLoader();
  }
}

function renderDashboardStats(data) {
  const users = data.users || {};
  const deposits = data.deposits || {};
  const withdrawals =
    data.withdrawals || {};

  const depositPending =
    deposits.pending || {};

  const depositApproved =
    deposits.approved || {};

  const withdrawPending =
    withdrawals.pending || {};

  const withdrawApproved =
    withdrawals.approved || {};

  /*
  Current API-তে আলাদা todayAmount নেই।
  Backend-এ todayAmount যোগ না হওয়া পর্যন্ত
  approved total ব্যবহার করা হচ্ছে।
  */
  const todayDepositAmount =
    deposits.todayAmount ??
    depositApproved.amount ??
    0;

  const todayWithdrawAmount =
    withdrawals.todayAmount ??
    withdrawApproved.amount ??
    0;

  const pendingDepositCount =
    depositPending.count ?? 0;

  const pendingWithdrawCount =
    withdrawPending.count ?? 0;

  /* Main cards */

  setText(
    "todayDeposit",
    formatMoneyValue(
      todayDepositAmount
    )
  );

  setText(
    "todayWithdraw",
    formatMoneyValue(
      todayWithdrawAmount
    )
  );

  setText(
    "pendingDeposits",
    formatNumber(
      pendingDepositCount
    )
  );

  setText(
    "pendingWithdrawals",
    formatNumber(
      pendingWithdrawCount
    )
  );

  setText(
    "onlineUsers",
    formatNumber(users.online)
  );

  setText(
    "totalUsers",
    formatNumber(users.total)
  );

  /* Sidebar menu badges */

  setText(
    "pendingDepositMenuCount",
    formatNumber(
      pendingDepositCount
    )
  );

  setText(
    "pendingWithdrawMenuCount",
    formatNumber(
      pendingWithdrawCount
    )
  );

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
    formatMoneyValue(
      revenue.totalAmount ??
      revenue.total ??
      0
    )
  );

  setText(
    "todayRevenue",
    formatMoneyValue(
      revenue.todayAmount ??
      revenue.today ??
      0
    )
  );

  setText(
    "totalActiveRooms",
    formatNumber(
      rooms.active ??
      rooms.totalActive ??
      0
    )
  );

  setText(
    "teenPattiRevenue",
    formatMoneyValue(
      games.teenPatti?.revenue ??
      games.teen_patti?.revenue ??
      0
    )
  );

  setText(
    "pokerRevenue",
    formatMoneyValue(
      games.poker?.revenue ?? 0
    )
  );

  setText(
    "ludoRevenue",
    formatMoneyValue(
      games.ludo?.revenue ?? 0
    )
  );

  setText(
    "activeBots",
    formatNumber(
      bots.active ?? 0
    )
  );

  setText(
    "botGamesPlayed",
    formatNumber(
      bots.gamesPlayed ??
      bots.totalGames ??
      0
    )
  );

  setText(
    "botRevenue",
    formatMoneyValue(
      bots.revenue ?? 0
    )
  );

  setText(
    "botLoss",
    formatMoneyValue(
      bots.loss ?? 0
    )
  );

  const botNetResult =
    bots.netResult ??
    Number(bots.revenue || 0) -
    Number(bots.loss || 0);

  setText(
    "botNetResult",
    formatMoneyValue(botNetResult)
  );

  updateServiceChargeValues(
    data.serviceCharges ||
    data.serviceCharge ||
    {}
  );

  renderRecentDeposits(
    data.recentDeposits || []
  );

  renderRecentWithdrawals(
    data.recentWithdrawals || []
  );
}

/* =========================
   Service Charges
========================= */

function updateServiceChargeValues(
  serviceCharges
) {
  const teenPattiCharge =
    serviceCharges.teenPatti ??
    serviceCharges.teen_patti ??
    5;

  const pokerCharge =
    serviceCharges.poker ?? 5;

  const ludoCharge =
    serviceCharges.ludo ?? 5;

  setInputValue(
    "teenPattiCharge",
    teenPattiCharge
  );

  setInputValue(
    "pokerCharge",
    pokerCharge
  );

  setInputValue(
    "ludoCharge",
    ludoCharge
  );

  setText(
    "teenPattiChargeLabel",
    teenPattiCharge
  );

  setText(
    "pokerChargeLabel",
    pokerCharge
  );

  setText(
    "ludoChargeLabel",
    ludoCharge
  );
}

function setInputValue(id, value) {
  const input = document.getElementById(id);

  if (input) {
    input.value = value;
  }
}

function getChargeValues() {
  return {
    teenPatti: Number(
      document.getElementById(
        "teenPattiCharge"
      )?.value || 0
    ),

    poker: Number(
      document.getElementById(
        "pokerCharge"
      )?.value || 0
    ),

    ludo: Number(
      document.getElementById(
        "ludoCharge"
      )?.value || 0
    )
  };
}

function validateChargeValues(charges) {
  return Object.values(charges).every(
    value =>
      Number.isFinite(value) &&
      value >= 0 &&
      value <= 20
  );
}

function openChargeConfirmModal() {
  const charges = getChargeValues();

  if (!validateChargeValues(charges)) {
    showToast(
      "Service charge must be between 0 and 20.",
      "error"
    );

    return;
  }

  setText(
    "confirmTeenPattiCharge",
    charges.teenPatti
  );

  setText(
    "confirmPokerCharge",
    charges.poker
  );

  setText(
    "confirmLudoCharge",
    charges.ludo
  );

  const modal = document.getElementById(
    "chargeConfirmModal"
  );

  if (modal) {
    modal.classList.add("show");
    modal.setAttribute(
      "aria-hidden",
      "false"
    );
  }
}

function closeChargeConfirmModal() {
  const modal = document.getElementById(
    "chargeConfirmModal"
  );

  if (modal) {
    modal.classList.remove("show");
    modal.setAttribute(
      "aria-hidden",
      "true"
    );
  }
}

function confirmServiceChargeSave() {
  const charges = getChargeValues();

  /*
  Backend service-charge update API এখনো
  তৈরি না হওয়ায় শুধু UI update করা হচ্ছে।
  */

  setText(
    "teenPattiChargeLabel",
    charges.teenPatti
  );

  setText(
    "pokerChargeLabel",
    charges.poker
  );

  setText(
    "ludoChargeLabel",
    charges.ludo
  );

  closeChargeConfirmModal();

  showToast(
    "Charge values updated on the dashboard. Backend save API is not connected yet."
  );
}

/* =========================
   Recent request rendering
========================= */

function getInitials(name) {
  const safeName =
    String(name || "User").trim();

  return safeName
    .split(/\s+/)
    .slice(0, 2)
    .map(word =>
      word.charAt(0).toUpperCase()
    )
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
  const normalized =
    String(status || "").toLowerCase();

  if (normalized === "approved") {
    return "success";
  }

  if (normalized === "rejected") {
    return "failed";
  }

  return "pending";
}

function renderRecentDeposits(items) {
  const container =
    document.getElementById(
      "recentDepositList"
    );

  if (!container) {
    return;
  }

  if (
    !Array.isArray(items) ||
    items.length === 0
  ) {
    container.innerHTML = `
      <div class="empty-request-message">
        No recent deposit requests.
      </div>
    `;

    return;
  }

  container.innerHTML = items
    .slice(0, 5)
    .map(item => {
      const name =
        item.full_name ||
        item.userName ||
        item.username ||
        "Unknown User";

      const requestId =
        item.deposit_id ||
        item.requestId ||
        "-";

      const status =
        item.status || "pending";

      return `
        <article class="request-item">
          <div class="request-user">
            <div class="request-avatar">
              ${escapeHtml(
                getInitials(name)
              )}
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
              ৳${formatMoneyValue(
                item.amount
              )}
            </strong>

            <span class="request-status ${getStatusClass(
              status
            )}">
              ${escapeHtml(status)}
            </span>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderRecentWithdrawals(items) {
  const container =
    document.getElementById(
      "recentWithdrawList"
    );

  if (!container) {
    return;
  }

  if (
    !Array.isArray(items) ||
    items.length === 0
  ) {
    container.innerHTML = `
      <div class="empty-request-message">
        No recent withdrawal requests.
      </div>
    `;

    return;
  }

  container.innerHTML = items
    .slice(0, 5)
    .map(item => {
      const name =
        item.full_name ||
        item.userName ||
        item.username ||
        "Unknown User";

      const requestId =
        item.withdraw_id ||
        item.requestId ||
        "-";

      const status =
        item.status || "pending";

      return `
        <article class="request-item">
          <div class="request-user">
            <div class="request-avatar">
              ${escapeHtml(
                getInitials(name)
              )}
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
              ৳${formatMoneyValue(
                item.amount
              )}
            </strong>

            <span class="request-status ${getStatusClass(
              status
            )}">
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
  const sidebar =
    document.getElementById(
      "adminSidebar"
    );

  const overlay =
    document.getElementById(
      "sidebarOverlay"
    );

  sidebar?.classList.toggle("open");
  overlay?.classList.toggle("show");
}

function closeSidebar() {
  document
    .getElementById("adminSidebar")
    ?.classList.remove("open");

  document
    .getElementById("sidebarOverlay")
    ?.classList.remove("show");
}

/* =========================
   Logout
========================= */

function logoutAdmin() {
  localStorage.removeItem(
    "access_token"
  );

  localStorage.removeItem(
    "refresh_token"
  );

  localStorage.removeItem("user");
  localStorage.removeItem("admin_user");
  localStorage.removeItem(
    "logged_in_user"
  );

  if (dashboardRefreshTimer) {
    window.clearInterval(
      dashboardRefreshTimer
    );
  }

  window.location.href =
    "../pages/login.html";
}

/* =========================
   Events
========================= */

function bindDashboardEvents() {
  document
    .getElementById("refreshDashboard")
    ?.addEventListener(
      "click",
      () => {
        loadDashboardStats({
          showSuccessMessage: true
        });
      }
    );

  document
    .getElementById("adminLogoutBtn")
    ?.addEventListener(
      "click",
      logoutAdmin
    );

  document
    .getElementById("sidebarToggle")
    ?.addEventListener(
      "click",
      toggleSidebar
    );

  document
    .getElementById("sidebarOverlay")
    ?.addEventListener(
      "click",
      closeSidebar
    );

  document
    .getElementById(
      "serviceChargeForm"
    )
    ?.addEventListener(
      "submit",
      event => {
        event.preventDefault();
        openChargeConfirmModal();
      }
    );

  document
    .getElementById(
      "closeChargeModal"
    )
    ?.addEventListener(
      "click",
      closeChargeConfirmModal
    );

  document
    .getElementById(
      "cancelChargeSave"
    )
    ?.addEventListener(
      "click",
      closeChargeConfirmModal
    );

  document
    .getElementById(
      "confirmChargeSave"
    )
    ?.addEventListener(
      "click",
      confirmServiceChargeSave
    );

  document
    .getElementById(
      "chargeConfirmModal"
    )
    ?.addEventListener(
      "click",
      event => {
        if (
          event.target.id ===
          "chargeConfirmModal"
        ) {
          closeChargeConfirmModal();
        }
      }
    );

  document.addEventListener(
    "keydown",
    event => {
      if (event.key === "Escape") {
        closeSidebar();
        closeChargeConfirmModal();
      }
    }
  );
}

/* =========================
   Page initialization
========================= */

document.addEventListener(
  "DOMContentLoaded",
  () => {
    loadAdminProfile();
    bindDashboardEvents();
    loadDashboardStats();

    dashboardRefreshTimer =
      window.setInterval(
        () => {
          loadDashboardStats();
        },
        30000
      );
  }
);