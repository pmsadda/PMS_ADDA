const API_BASE_URL =
    APP_CONFIG.api(
        "/admin/bots"
    );

const botState = {
  bots: [],
  selectedBotId: null,
  selectedStatus: null,
  search: "",
  status: "all",
};

/* =========================
   Elements
========================= */

const elements = {
  totalBots: document.getElementById("totalBots"),

  activeBots: document.getElementById("activeBots"),

  disabledBots: document.getElementById("disabledBots"),

  totalBotBalance: document.getElementById("totalBotBalance"),

  botsTableBody: document.getElementById("botsTableBody"),

  botSearchInput: document.getElementById("botSearchInput"),

  botStatusFilter: document.getElementById("botStatusFilter"),

  refreshBotsBtn: document.getElementById("refreshBotsBtn"),

  balanceModal: document.getElementById("balanceModal"),

  balanceForm: document.getElementById("balanceForm"),

  selectedBotId: document.getElementById("selectedBotId"),

  selectedBotName: document.getElementById("selectedBotName"),

  balanceAction: document.getElementById("balanceAction"),

  balanceAmount: document.getElementById("balanceAmount"),

  balanceNote: document.getElementById("balanceNote"),

  closeBalanceModalBtn: document.getElementById("closeBalanceModalBtn"),

  cancelBalanceBtn: document.getElementById("cancelBalanceBtn"),

  saveBalanceBtn: document.getElementById("saveBalanceBtn"),

  historyModal: document.getElementById("historyModal"),

  historyBotName: document.getElementById("historyBotName"),

  historyTableBody: document.getElementById("historyTableBody"),

  closeHistoryModalBtn: document.getElementById("closeHistoryModalBtn"),

  statusModal: document.getElementById("statusModal"),

  statusModalTitle: document.getElementById("statusModalTitle"),

  statusModalMessage: document.getElementById("statusModalMessage"),

  cancelStatusBtn: document.getElementById("cancelStatusBtn"),

  confirmStatusBtn: document.getElementById("confirmStatusBtn"),

  settingsModal: document.getElementById("settingsModal"),

  settingsForm: document.getElementById("settingsForm"),

  settingsBotId: document.getElementById("settingsBotId"),

  settingsBotName: document.getElementById("settingsBotName"),

  botDifficulty: document.getElementById("botDifficulty"),

  botPlayingStyle: document.getElementById("botPlayingStyle"),

  closeSettingsModalBtn: document.getElementById("closeSettingsModalBtn"),

  cancelSettingsBtn: document.getElementById("cancelSettingsBtn"),

  saveSettingsBtn: document.getElementById("saveSettingsBtn"),

  pageLoader: document.getElementById("pageLoader"),

  toastContainer: document.getElementById("toastContainer"),

  sidebar: document.getElementById("sidebar"),

  sidebarOverlay: document.getElementById("sidebarOverlay"),

  sidebarOpenBtn: document.getElementById("sidebarOpenBtn"),

  sidebarCloseBtn: document.getElementById("sidebarCloseBtn"),

  logoutBtn: document.getElementById("logoutBtn"),

  adminName: document.getElementById("adminName"),
};

/* =========================
   Authentication
========================= */

function getToken() {
  return localStorage.getItem("access_token") || localStorage.getItem("token");
}

function getStoredUser() {
  const savedUser =
    localStorage.getItem("current_user") ||
    localStorage.getItem("user") ||
    localStorage.getItem("admin_user");

  if (!savedUser) {
    return null;
  }

  try {
    return JSON.parse(savedUser);
  } catch (error) {
    return null;
  }
}

function logout() {
  localStorage.removeItem("access_token");

  localStorage.removeItem("refresh_token");

  localStorage.removeItem("token");

  localStorage.removeItem("current_user");

  localStorage.removeItem("user");

  localStorage.removeItem("admin_user");

  window.location.href = "../pages/login.html";
}

function showAdminName() {
  const user = getStoredUser();

  if (!user) {
    return;
  }

  if (user.role && user.role !== "admin") {
    logout();
    return;
  }

  elements.adminName.textContent =
    user.full_name || user.fullName || user.username || user.name || "Admin";
}

/* =========================
   Helpers
========================= */

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString("en-BD", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString("en-BD", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getBotInitial(name) {
  const safeName = String(name || "B").trim();

  return safeName.charAt(0).toUpperCase() || "B";
}

/* =========================
   Loader
========================= */

function showLoader() {
  elements.pageLoader?.classList.remove("hidden");
}

function hideLoader() {
  elements.pageLoader?.classList.add("hidden");
}

/* =========================
   Toast
========================= */

function showToast(message, type = "success") {
  if (!elements.toastContainer) {
    alert(message);
    return;
  }

  const toast = document.createElement("div");

  toast.className = `toast-message toast-${type}`;

  toast.textContent = message;

  elements.toastContainer.appendChild(toast);

  window.setTimeout(() => {
    toast.remove();
  }, 3000);
}

/* =========================
   API Request
========================= */

async function apiRequest(endpoint = "", options = {}) {
  const token = getToken();

  if (!token) {
    logout();

    throw new Error("Admin login required.");
  }

  const requestOptions = {
    method: options.method || "GET",

    headers: {
      Authorization: `Bearer ${token}`,

      Accept: "application/json",
    },
  };

  if (options.body) {
    requestOptions.headers["Content-Type"] = "application/json";

    requestOptions.body = JSON.stringify(options.body);
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, requestOptions);

  let result;

  try {
    result = await response.json();
  } catch (error) {
    throw new Error("Invalid server response.");
  }

  if (response.status === 401 || response.status === 403) {
    logout();

    throw new Error("Session expired.");
  }

  if (!response.ok || result.success === false) {
    throw new Error(result.message || "Request failed.");
  }

  return result;
}

/* =========================
   Summary
========================= */

function renderSummary() {
  const total = botState.bots.length;

  const active = botState.bots.filter((bot) => bot.status === "active").length;

  const disabled = botState.bots.filter(
    (bot) => bot.status === "disabled",
  ).length;

  const totalBalance = botState.bots.reduce((totalAmount, bot) => {
    return totalAmount + Number(bot.walletBalance || 0);
  }, 0);

  elements.totalBots.textContent = total;

  elements.activeBots.textContent = active;

  elements.disabledBots.textContent = disabled;

  elements.totalBotBalance.textContent = formatMoney(totalBalance);
}

/* =========================
   Filtered Bots
========================= */

function getFilteredBots() {
  const search = botState.search.trim().toLowerCase();

  return botState.bots.filter((bot) => {
    const matchesSearch =
      !search ||
      String(bot.botName || "")
        .toLowerCase()
        .includes(search) ||
      String(bot.botCode || "")
        .toLowerCase()
        .includes(search);

    const matchesStatus =
      botState.status === "all" || bot.status === botState.status;

    return matchesSearch && matchesStatus;
  });
}

/* =========================
   Render Bot Table
========================= */

function renderBots() {
  const bots = getFilteredBots();

  if (!bots.length) {
    elements.botsTableBody.innerHTML = `
                <tr>
                    <td
                        colspan="8"
                        class="empty-table-message"
                    >
                        No bots found.
                    </td>
                </tr>
            `;

    return;
  }

  elements.botsTableBody.innerHTML = bots
    .map((bot) => {
      const botId = Number(bot.id);

      const botName = escapeHtml(bot.botName || "Bot");

      const botCode = escapeHtml(bot.botCode || "-");

      const difficulty = String(bot.difficulty || "normal")
        .trim()
        .toLowerCase();

      const playingStyle = String(bot.playingStyle || "balanced")
        .trim()
        .toLowerCase();

      const difficultyText =
        {
          easy: "Easy",
          normal: "Normal",
          hard: "Hard",
        }[difficulty] || "Normal";

      const playingStyleText =
        {
          aggressive: "Aggressive",
          balanced: "Balanced",
          defensive: "Defensive",
        }[playingStyle] || "Balanced";

      const status = bot.status === "active" ? "active" : "disabled";

      const nextStatus = status === "active" ? "disabled" : "active";

      const statusText = status === "active" ? "Active" : "Disabled";

      const statusButtonText = status === "active" ? "Disable" : "Enable";

      const statusButtonClass =
        status === "active" ? "disable-btn" : "enable-btn";

      const avatarHtml = bot.avatarUrl
        ? `
                            <img
                                src="${escapeHtml(bot.avatarUrl)}"
                                alt="${botName}"
                                class="bot-avatar"
                            >
                        `
        : `
                            <div
                                class="bot-avatar-placeholder"
                            >
                                ${getBotInitial(bot.botName)}
                            </div>
                        `;

      return `
                    <tr>
                        <td>
                            #${botId}
                        </td>

                        <td>
                            <div class="bot-info">
                                ${avatarHtml}

                                <div>
                                    <div class="bot-name">
                                        ${botName}
                                    </div>
                                </div>
                            </div>
                        </td>

                        <td>
                            ${botCode}
                        </td>

                        <td>
                            <span class="bot-balance">
                                ৳${formatMoney(bot.walletBalance)}
                            </span>
                        </td>

                        <td>
    <span class="status-badge">
        ${difficultyText}
    </span>
</td>

<td>
    <span class="status-badge">
        ${playingStyleText}
    </span>
</td>

                        <td>
                            <span
                                class="status-badge status-${status}"
                            >
                                ${statusText}
                            </span>
                        </td>

                        <td>
                            <div class="action-buttons">

                                <button
                                    type="button"
                                    class="action-btn balance-btn"
                                    data-action="balance"
                                    data-bot-id="${botId}"
                                    title="Update balance"
                                >
                                    <i class="fa-solid fa-wallet"></i>
                                </button>

                                <button
                                    type="button"
                                    class="action-btn history-btn"
                                    data-action="history"
                                    data-bot-id="${botId}"
                                    title="Balance history"
                                >
                                    <i class="fa-solid fa-clock-rotate-left"></i>
                                </button>

                                <button
    type="button"
    class="action-btn"
    data-action="settings"
    data-bot-id="${botId}"
    title="Bot AI settings"
>
    <i class="fa-solid fa-sliders"></i>
</button>

                                <button
                                    type="button"
                                    class="action-btn ${statusButtonClass}"
                                    data-action="status"
                                    data-bot-id="${botId}"
                                    data-status="${nextStatus}"
                                    title="${statusButtonText} bot"
                                >
                                    <i class="fa-solid ${
                                      nextStatus === "active"
                                        ? "fa-circle-check"
                                        : "fa-circle-xmark"
                                    }"></i>
                                </button>

                            </div>
                        </td>
                    </tr>
                `;
    })
    .join("");
}

/* =========================
   Load Bots
========================= */

async function loadBots() {
  showLoader();

  try {
    const result = await apiRequest();

    botState.bots = Array.isArray(result.data) ? result.data : [];

    renderSummary();
    renderBots();
  } catch (error) {
    elements.botsTableBody.innerHTML = `
                <tr>
                    <td
                        colspan="6"
                        class="empty-table-message"
                    >
                        ${escapeHtml(error.message)}
                    </td>
                </tr>
            `;

    showToast(error.message, "error");
  } finally {
    hideLoader();
  }
}

/* =========================
   Find Bot
========================= */

function findBot(botId) {
  return botState.bots.find((bot) => Number(bot.id) === Number(botId));
}

/* =========================
   Balance Modal
========================= */

function openBalanceModal(botId) {
  const bot = findBot(botId);

  if (!bot) {
    showToast("Bot not found.", "error");

    return;
  }

  botState.selectedBotId = Number(bot.id);

  elements.selectedBotId.value = bot.id;

  elements.selectedBotName.textContent = `${bot.botName} — Current Balance: ৳${formatMoney(
    bot.walletBalance,
  )}`;

  elements.balanceAction.value = "add";

  elements.balanceAmount.value = "";

  elements.balanceNote.value = "";

  elements.balanceModal.classList.add("show");
}

function closeBalanceModal() {
  elements.balanceModal.classList.remove("show");

  elements.balanceForm.reset();

  botState.selectedBotId = null;
}

async function submitBalanceForm(event) {
  event.preventDefault();

  const botId = Number(elements.selectedBotId.value);

  const actionType = elements.balanceAction.value;

  const amount = Number(elements.balanceAmount.value);

  const note = elements.balanceNote.value.trim();

  if (!botId || !Number.isFinite(amount) || amount < 0) {
    showToast("Enter a valid amount.", "error");

    return;
  }

  if (actionType !== "set" && amount <= 0) {
    showToast("Amount must be greater than zero.", "error");

    return;
  }

  elements.saveBalanceBtn.disabled = true;

  showLoader();

  try {
    const result = await apiRequest(`/${botId}/balance`, {
      method: "PATCH",

      body: {
        actionType,
        amount,
        note,
      },
    });

    showToast(result.message || "Bot balance updated.");

    closeBalanceModal();

    await loadBots();
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    elements.saveBalanceBtn.disabled = false;

    hideLoader();
  }
}

/* =========================
   History Modal
========================= */

async function openHistoryModal(botId) {
  const bot = findBot(botId);

  if (!bot) {
    showToast("Bot not found.", "error");

    return;
  }

  elements.historyBotName.textContent = `${bot.botName} balance changes`;

  elements.historyTableBody.innerHTML = `
            <tr>
                <td
                    colspan="7"
                    class="empty-table-message"
                >
                    Loading history...
                </td>
            </tr>
        `;

  elements.historyModal.classList.add("show");

  try {
    const result = await apiRequest(`/${botId}/balance-history`);

    const history = Array.isArray(result.data) ? result.data : [];

    renderHistory(history);
  } catch (error) {
    elements.historyTableBody.innerHTML = `
                <tr>
                    <td
                        colspan="7"
                        class="empty-table-message"
                    >
                        ${escapeHtml(error.message)}
                    </td>
                </tr>
            `;

    showToast(error.message, "error");
  }
}

function renderHistory(history) {
  if (!history.length) {
    elements.historyTableBody.innerHTML = `
                <tr>
                    <td
                        colspan="7"
                        class="empty-table-message"
                    >
                        No balance history found.
                    </td>
                </tr>
            `;

    return;
  }

  elements.historyTableBody.innerHTML = history
    .map((item) => {
      const actionText =
        {
          add: "Added",
          deduct: "Deducted",
          set: "Set",
        }[item.actionType] || item.actionType;

      const adminName =
        item.adminName || item.adminUsername || `Admin #${item.adminUserId}`;

      return `
                    <tr>
                        <td>
                            ${formatDate(item.createdAt)}
                        </td>

                        <td>
                            ${escapeHtml(actionText)}
                        </td>

                        <td>
                            ৳${formatMoney(item.amount)}
                        </td>

                        <td>
                            ৳${formatMoney(item.balanceBefore)}
                        </td>

                        <td>
                            ৳${formatMoney(item.balanceAfter)}
                        </td>

                        <td>
                            ${escapeHtml(adminName)}
                        </td>

                        <td>
                            ${escapeHtml(item.note || "-")}
                        </td>
                    </tr>
                `;
    })
    .join("");
}

function closeHistoryModal() {
  elements.historyModal.classList.remove("show");
}

/* =========================
   Settings Modal
========================= */

function openSettingsModal(botId) {
  const bot = findBot(botId);

  if (!bot) {
    showToast("Bot not found.", "error");

    return;
  }

  botState.selectedBotId = Number(bot.id);

  elements.settingsBotId.value = bot.id;

  elements.settingsBotName.textContent = `${bot.botName} AI settings`;

  elements.botDifficulty.value = bot.difficulty || "normal";

  elements.botPlayingStyle.value = bot.playingStyle || "balanced";

  elements.settingsModal.classList.add("show");
}

function closeSettingsModal() {
  elements.settingsModal.classList.remove("show");

  elements.settingsForm.reset();

  botState.selectedBotId = null;
}

async function submitSettingsForm(event) {
  event.preventDefault();

  const botId = Number(elements.settingsBotId.value);

  const difficulty = elements.botDifficulty.value;

  const playingStyle = elements.botPlayingStyle.value;

  if (!botId) {
    showToast("Invalid bot.", "error");

    return;
  }

  elements.saveSettingsBtn.disabled = true;

  showLoader();

  try {
    const result = await apiRequest(`/${botId}/settings`, {
      method: "PATCH",

      body: {
        difficulty,
        playingStyle,
      },
    });

    showToast(result.message || "Bot settings updated.");

    closeSettingsModal();

    await loadBots();
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    elements.saveSettingsBtn.disabled = false;

    hideLoader();
  }
}

/* =========================
   Status Modal
========================= */

function openStatusModal(botId, nextStatus) {
  const bot = findBot(botId);

  if (!bot) {
    showToast("Bot not found.", "error");

    return;
  }

  botState.selectedBotId = Number(botId);

  botState.selectedStatus = nextStatus;

  const actionText = nextStatus === "active" ? "enable" : "disable";

  elements.statusModalTitle.textContent = `${
    nextStatus === "active" ? "Enable" : "Disable"
  } Bot`;

  elements.statusModalMessage.textContent = `Are you sure you want to ${actionText} ${bot.botName}?`;

  elements.statusModal.classList.add("show");
}

function closeStatusModal() {
  elements.statusModal.classList.remove("show");

  botState.selectedBotId = null;

  botState.selectedStatus = null;
}

async function confirmStatusChange() {
  const botId = botState.selectedBotId;

  const status = botState.selectedStatus;

  if (!botId || !status) {
    return;
  }

  elements.confirmStatusBtn.disabled = true;

  showLoader();

  try {
    const result = await apiRequest(`/${botId}/status`, {
      method: "PATCH",

      body: {
        status,
      },
    });

    showToast(result.message || "Bot status updated.");

    closeStatusModal();

    await loadBots();
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    elements.confirmStatusBtn.disabled = false;

    hideLoader();
  }
}

/* =========================
   Table Actions
========================= */

function handleTableClick(event) {
  const button = event.target.closest("[data-action]");

  if (!button) {
    return;
  }

  const botId = Number(button.dataset.botId);

  const action = button.dataset.action;

  if (action === "balance") {
    openBalanceModal(botId);

    return;
  }

  if (action === "history") {
    openHistoryModal(botId);

    return;
  }

  if (action === "settings") {
    openSettingsModal(botId);

    return;
  }

  if (action === "status") {
    openStatusModal(botId, button.dataset.status);
  }
}

/* =========================
   Sidebar
========================= */

function openSidebar() {
  elements.sidebar?.classList.add("show");

  elements.sidebarOverlay?.classList.add("show");
}

function closeSidebar() {
  elements.sidebar?.classList.remove("show");

  elements.sidebarOverlay?.classList.remove("show");
}

/* =========================
   Modal Outside Click
========================= */

function closeModalOnOutsideClick(event) {
  if (event.target === elements.balanceModal) {
    closeBalanceModal();
  }

  if (event.target === elements.historyModal) {
    closeHistoryModal();
  }

  if (event.target === elements.statusModal) {
    closeStatusModal();
  }

  if (event.target === elements.settingsModal) {
    closeSettingsModal();
  }
}

/* =========================
   Event Listeners
========================= */

function bindEvents() {
  elements.refreshBotsBtn?.addEventListener("click", loadBots);

  elements.botSearchInput?.addEventListener("input", (event) => {
    botState.search = event.target.value;

    renderBots();
  });

  elements.botStatusFilter?.addEventListener("change", (event) => {
    botState.status = event.target.value;

    renderBots();
  });

  elements.botsTableBody?.addEventListener("click", handleTableClick);

  elements.balanceForm?.addEventListener("submit", submitBalanceForm);

  elements.settingsForm?.addEventListener("submit", submitSettingsForm);

  elements.closeSettingsModalBtn?.addEventListener("click", closeSettingsModal);

  elements.cancelSettingsBtn?.addEventListener("click", closeSettingsModal);

  elements.closeBalanceModalBtn?.addEventListener("click", closeBalanceModal);

  elements.cancelBalanceBtn?.addEventListener("click", closeBalanceModal);

  elements.closeHistoryModalBtn?.addEventListener("click", closeHistoryModal);

  elements.cancelStatusBtn?.addEventListener("click", closeStatusModal);

  elements.confirmStatusBtn?.addEventListener("click", confirmStatusChange);

  elements.sidebarOpenBtn?.addEventListener("click", openSidebar);

  elements.sidebarCloseBtn?.addEventListener("click", closeSidebar);

  elements.sidebarOverlay?.addEventListener("click", closeSidebar);

  elements.logoutBtn?.addEventListener("click", logout);

  elements.balanceModal?.addEventListener("click", closeModalOnOutsideClick);

  elements.historyModal?.addEventListener("click", closeModalOnOutsideClick);

  elements.settingsModal?.addEventListener("click", closeModalOnOutsideClick);

  elements.statusModal?.addEventListener("click", closeModalOnOutsideClick);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeBalanceModal();
      closeHistoryModal();
      closeStatusModal();
      closeSettingsModal();
    }
  });
}

/* =========================
   Initialize
========================= */

async function initializePage() {
  showAdminName();
  bindEvents();
  await loadBots();
}

document.addEventListener("DOMContentLoaded", initializePage);
