"use strict";

/* =========================
   Elements
========================= */

const loadingElement = document.getElementById("adminLoading");
const backButton = document.getElementById("backBtn");
const refreshButton = document.getElementById("refreshBtn");
const saveButton = document.getElementById("saveSettingsBtn");

const form = document.getElementById("slotSettingsForm");

const fields = {
  isEnabled: document.getElementById("isEnabled"),
  maintenanceMode: document.getElementById("maintenanceMode"),
  wildEnabled: document.getElementById("wildEnabled"),
  scatterEnabled: document.getElementById("scatterEnabled"),
  freeSpinsEnabled: document.getElementById("freeSpinsEnabled"),
  minBet: document.getElementById("minBet"),
  maxBet: document.getElementById("maxBet"),
  maxPayoutPerSpin:
    document.getElementById("maxPayoutPerSpin"),
  maxWinMultiplier:
    document.getElementById("maxWinMultiplier"),
  rtpPercent: document.getElementById("rtpPercent"),
  houseEdgePercent:
    document.getElementById("houseEdgePercent"),
  volatilityProfile:
    document.getElementById("volatilityProfile"),
  freeSpinsAward:
    document.getElementById("freeSpinsAward"),
  freeSpinsMultiplier:
    document.getElementById("freeSpinsMultiplier"),
  dailyPayoutLimit:
    document.getElementById("dailyPayoutLimit"),
  dailyAdminLossLimit:
    document.getElementById("dailyAdminLossLimit"),
};

const todaySpinsElement = document.getElementById("todaySpins");
const todayBetElement = document.getElementById("todayBet");
const todayPayoutElement =
  document.getElementById("todayPayout");
const todayAdminResultElement =
  document.getElementById("todayAdminResult");

const spinHistoryBody =
  document.getElementById("spinHistoryBody");
const dailyStatsBody =
  document.getElementById("dailyStatsBody");

const toastElement = document.getElementById("adminToast");
const toastTitleElement =
  document.getElementById("toastTitle");
const toastMessageElement =
  document.getElementById("toastMessage");

let toastTimer = null;

/* =========================
   Helpers
========================= */

function getAccessToken() {
  return (
    localStorage.getItem("access_token") ||
    localStorage.getItem("token") ||
    sessionStorage.getItem("access_token") ||
    ""
  );
}

function redirectToLogin() {
  window.location.href = "/login";
}

function money(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "0.00";
  }

  return number.toFixed(2);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message, title = "Notice") {
  window.clearTimeout(toastTimer);

  toastTitleElement.textContent = title;
  toastMessageElement.textContent = message;
  toastElement.classList.remove("hidden");

  toastTimer = window.setTimeout(() => {
    toastElement.classList.add("hidden");
  }, 3500);
}

async function apiRequest(path, options = {}) {
  const token = getAccessToken();

  if (!token) {
    redirectToLogin();
    throw new Error("Admin login session পাওয়া যায়নি।");
  }

  const response = await fetch(path, {
    ...options,

    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  const result = await response.json().catch(() => ({
    success: false,
    message: "Server থেকে invalid response এসেছে।",
  }));

  if (response.status === 401) {
    redirectToLogin();
    throw new Error(
      result.message || "Admin session শেষ হয়ে গেছে।",
    );
  }

  if (!response.ok || result.success === false) {
    const error = new Error(
      result.message || "Request failed.",
    );

    error.code = result.code || null;
    throw error;
  }

  return result.data ?? result;
}

/* =========================
   Settings
========================= */

function setCheckbox(field, value) {
  field.checked =
    value === true ||
    value === 1 ||
    value === "1";
}

function fillSettings(settings) {
  if (!settings) {
    return;
  }

  setCheckbox(fields.isEnabled, settings.isEnabled);
  setCheckbox(
    fields.maintenanceMode,
    settings.maintenanceMode,
  );
  setCheckbox(fields.wildEnabled, settings.wildEnabled);
  setCheckbox(
    fields.scatterEnabled,
    settings.scatterEnabled,
  );
  setCheckbox(
    fields.freeSpinsEnabled,
    settings.freeSpinsEnabled,
  );

  fields.minBet.value = settings.minBet ?? 10;
  fields.maxBet.value = settings.maxBet ?? 5000;

  fields.maxPayoutPerSpin.value =
    settings.maxPayoutPerSpin ?? 50000;

  fields.maxWinMultiplier.value =
    settings.maxWinMultiplier ?? 250;

  fields.rtpPercent.value =
    settings.rtpPercent ?? 95;

  fields.volatilityProfile.value =
    settings.volatilityProfile || "medium";

  fields.freeSpinsAward.value =
    settings.freeSpinsAward ?? 8;

  fields.freeSpinsMultiplier.value =
    settings.freeSpinsMultiplier ?? 1;

  fields.dailyPayoutLimit.value =
    settings.dailyPayoutLimit ?? 200000;

  fields.dailyAdminLossLimit.value =
    settings.dailyAdminLossLimit ?? 50000;

  updateHouseEdge();
}

function updateHouseEdge() {
  const rtp = Number(fields.rtpPercent.value);

  fields.houseEdgePercent.value =
    Number.isFinite(rtp)
      ? `${Math.max(0, 100 - rtp).toFixed(2)}%`
      : "--";
}

function collectSettings() {
  return {
    isEnabled: fields.isEnabled.checked,

    maintenanceMode:
      fields.maintenanceMode.checked,

    wildEnabled:
      fields.wildEnabled.checked,

    scatterEnabled:
      fields.scatterEnabled.checked,

    freeSpinsEnabled:
      fields.freeSpinsEnabled.checked,

    minBet: Number(fields.minBet.value),

    maxBet: Number(fields.maxBet.value),

    maxPayoutPerSpin:
      Number(fields.maxPayoutPerSpin.value),

    maxWinMultiplier:
      Number(fields.maxWinMultiplier.value),

    rtpPercent:
      Number(fields.rtpPercent.value),

    volatilityProfile:
      fields.volatilityProfile.value,

    freeSpinsAward:
      Number(fields.freeSpinsAward.value),

    freeSpinsMultiplier:
      Number(fields.freeSpinsMultiplier.value),

    dailyPayoutLimit:
      Number(fields.dailyPayoutLimit.value),

    dailyAdminLossLimit:
      Number(fields.dailyAdminLossLimit.value),
  };
}

function validateSettings(settings) {
  if (
    !Number.isFinite(settings.minBet) ||
    settings.minBet <= 0
  ) {
    throw new Error("Minimum Bet সঠিকভাবে দিন।");
  }

  if (
    !Number.isFinite(settings.maxBet) ||
    settings.maxBet < settings.minBet
  ) {
    throw new Error(
      "Maximum Bet অবশ্যই Minimum Bet-এর সমান বা বেশি হবে।",
    );
  }

  if (
    !Number.isFinite(settings.rtpPercent) ||
    settings.rtpPercent <= 0 ||
    settings.rtpPercent >= 100
  ) {
    throw new Error("RTP অবশ্যই 0 থেকে 100-এর মধ্যে হবে।");
  }

  if (
    !Number.isFinite(settings.maxWinMultiplier) ||
    settings.maxWinMultiplier < 1
  ) {
    throw new Error(
      "Maximum Win Multiplier কমপক্ষে 1x হতে হবে।",
    );
  }

  if (
    settings.maxPayoutPerSpin < 0 ||
    settings.dailyPayoutLimit < 0 ||
    settings.dailyAdminLossLimit < 0
  ) {
    throw new Error("Limit value negative হতে পারবে না।");
  }
}

async function loadSettings() {
  const data = await apiRequest(
    "/api/admin/slot/settings",
  );

  fillSettings(data.settings || data);
}

async function saveSettings() {
  if (!form.reportValidity()) {
    return;
  }

  try {
    const settings = collectSettings();

    validateSettings(settings);

    saveButton.disabled = true;
    saveButton.textContent = "Saving...";

    const data = await apiRequest(
      "/api/admin/slot/settings",
      {
        method: "PATCH",
        body: JSON.stringify(settings),
      },
    );

    fillSettings(data.settings || data);

    showToast(
      "Slot settings সফলভাবে save হয়েছে।",
      "Saved",
    );

    await loadDashboard();
  } catch (error) {
    showToast(
      error.message || "Settings save হয়নি।",
      "Save Error",
    );
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = "Save Settings";
  }
}

/* =========================
   Dashboard
========================= */

function renderSummary(today) {
  const totalSpins = Number(
    today?.totalSpins ??
    today?.total_spins ??
    0,
  );

  const totalBet = Number(
    today?.totalBet ??
    today?.total_bet ??
    0,
  );

  const totalPayout = Number(
    today?.totalPayout ??
    today?.total_payout ??
    0,
  );

  const adminResult = Number(
    today?.netAdminResult ??
    today?.net_admin_result ??
    totalBet - totalPayout,
  );

  todaySpinsElement.textContent =
    String(totalSpins);

  todayBetElement.textContent =
    money(totalBet);

  todayPayoutElement.textContent =
    money(totalPayout);

  todayAdminResultElement.textContent =
    `${adminResult >= 0 ? "+" : "-"}৳${money(
      Math.abs(adminResult),
    )}`;

  todayAdminResultElement.classList.toggle(
    "positive-result",
    adminResult >= 0,
  );

  todayAdminResultElement.classList.toggle(
    "negative-result",
    adminResult < 0,
  );
}

function renderSpinHistory(items) {
  if (!Array.isArray(items) || items.length === 0) {
    spinHistoryBody.innerHTML = `
      <tr>
        <td colspan="8" class="empty-row">
          কোনো Spin পাওয়া যায়নি
        </td>
      </tr>
    `;

    return;
  }

  spinHistoryBody.innerHTML = items.map((item) => {
    const payout = Number(
      item.payoutAmount ??
      item.payout_amount ??
      0,
    );

    const bet = Number(
      item.betAmount ??
      item.bet_amount ??
      0,
    );

    const multiplier = Number(
      item.winMultiplier ??
      item.win_multiplier ??
      0,
    );

    const isFreeSpin =
      item.isFreeSpin === true ||
      item.is_free_spin === 1 ||
      item.is_free_spin === true;

    const dateValue =
      item.createdAt ||
      item.created_at ||
      "";

    const dateText = dateValue
      ? new Date(dateValue).toLocaleString("en-BD")
      : "--";

    const player =
      item.username ||
      item.uid ||
      item.userId ||
      item.user_id ||
      "--";

    return `
      <tr>
        <td>${escapeHtml(
          item.spinCode || item.spin_code || "--",
        )}</td>

        <td>${escapeHtml(player)}</td>

        <td>৳${money(bet)}</td>

        <td>${multiplier.toFixed(2)}x</td>

        <td class="${
          payout > 0
            ? "positive-result"
            : "negative-result"
        }">
          ৳${money(payout)}
        </td>

        <td>
          <span class="status-badge">
            ${escapeHtml(
              item.volatilityProfile ||
              item.volatility_profile ||
              "--",
            )}
          </span>
        </td>

        <td>
          ${
            isFreeSpin
              ? '<span class="status-badge free-badge">Yes</span>'
              : "No"
          }
        </td>

        <td>${escapeHtml(dateText)}</td>
      </tr>
    `;
  }).join("");
}

function renderDailyStats(items) {
  if (!Array.isArray(items) || items.length === 0) {
    dailyStatsBody.innerHTML = `
      <tr>
        <td colspan="5" class="empty-row">
          কোনো Daily result পাওয়া যায়নি
        </td>
      </tr>
    `;

    return;
  }

  dailyStatsBody.innerHTML = items.map((item) => {
    const totalBet = Number(
      item.totalBet ??
      item.total_bet ??
      0,
    );

    const totalPayout = Number(
      item.totalPayout ??
      item.total_payout ??
      0,
    );

    const adminResult = Number(
      item.netAdminResult ??
      item.net_admin_result ??
      totalBet - totalPayout,
    );

    return `
      <tr>
        <td>${escapeHtml(
          item.statDate || item.stat_date || "--",
        )}</td>

        <td>${Number(
          item.totalSpins ??
          item.total_spins ??
          0,
        )}</td>

        <td>৳${money(totalBet)}</td>

        <td>৳${money(totalPayout)}</td>

        <td class="${
          adminResult >= 0
            ? "positive-result"
            : "negative-result"
        }">
          ${adminResult >= 0 ? "+" : "-"}৳${money(
            Math.abs(adminResult),
          )}
        </td>
      </tr>
    `;
  }).join("");
}

async function loadDashboard() {
  const data = await apiRequest(
    "/api/admin/slot/dashboard?limit=100",
  );

  const history =
    data.history ||
    data.spins ||
    data.items ||
    [];

  const dailyStats =
    data.dailyStats ||
    data.daily_stats ||
    [];

  renderSummary(data.today || {});
  renderSpinHistory(history);
  renderDailyStats(dailyStats);
}

async function refreshAll() {
  refreshButton.disabled = true;
  refreshButton.textContent = "Loading...";

  try {
    await Promise.all([
      loadSettings(),
      loadDashboard(),
    ]);
  } catch (error) {
    showToast(
      error.message || "Slot dashboard load হয়নি।",
      "Loading Error",
    );
  } finally {
    refreshButton.disabled = false;
    refreshButton.textContent = "Refresh";
  }
}

/* =========================
   Initialize
========================= */

function bindControls() {
  backButton.addEventListener("click", () => {
    window.location.href = "dashboard.html";
  });

  refreshButton.addEventListener("click", refreshAll);
  saveButton.addEventListener("click", saveSettings);

  fields.rtpPercent.addEventListener(
    "input",
    updateHouseEdge,
  );

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    saveSettings();
  });
}

async function initializeAdminSlot() {
  bindControls();

  try {
    await refreshAll();
  } finally {
    loadingElement.classList.add("hidden");
  }
}

document.addEventListener(
  "DOMContentLoaded",
  initializeAdminSlot,
);