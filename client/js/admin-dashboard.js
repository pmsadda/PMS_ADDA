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

  updateSignupBonusSettingsValues(data.signupBonusSettings || {});

  updateWithdrawSettingsValues(data.withdrawSettings || {});

  updateFirstDepositBonusSettingsValues(data.firstDepositBonusSettings || {});

  updateReferralSettingsValues(data.referralSettings || {});

  updateReferralStats(data.referrals || {});

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
    showToast("Service charge must be between 0 and 20.", "error");

    return;
  }

  setText("confirmTeenPattiCharge", charges.teenPatti);

  setText("confirmPokerCharge", charges.poker);

  setText("confirmLudoCharge", charges.ludo);

  const modal = document.getElementById("chargeConfirmModal");

  if (modal) {
    modal.classList.add("show");

    modal.style.display = "flex";

    modal.setAttribute("aria-hidden", "false");
  }
}

function closeChargeConfirmModal() {
  const modal = document.getElementById("chargeConfirmModal");

  if (modal) {
    modal.classList.remove("show");

    modal.style.display = "none";

    modal.setAttribute("aria-hidden", "true");
  }
}

async function confirmServiceChargeSave() {
  const charges = getChargeValues();

  if (!validateChargeValues(charges)) {
    showToast("Service charge must be between 0 and 20.", "error");

    return;
  }

  const token = getAccessToken();

  if (!token) {
    window.location.href = "../pages/login.html";

    return;
  }

  const confirmButton = document.getElementById("confirmChargeSave");

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
          Authorization: `Bearer ${token}`,

          Accept: "application/json",

          "Content-Type": "application/json",
        },

        body: JSON.stringify(charges),
      },
    );

    const result = await parseResponse(response);

    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem("access_token");

      throw new Error("Your admin session has expired.");
    }

    if (!response.ok || !result.success) {
      throw new Error(result.message || "Service charge update failed.");
    }

    const savedCharges = result.data?.serviceCharges || charges;

    updateServiceChargeValues(savedCharges);

    closeChargeConfirmModal();

    showToast(result.message || "Service charges updated successfully.");
  } catch (error) {
    console.error("SERVICE CHARGE UPDATE ERROR:", error);

    showToast(error.message || "Service charge update failed.", "error");

    if (error.message === "Your admin session has expired.") {
      window.setTimeout(() => {
        window.location.href = "../pages/login.html";
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
   Signup Bonus Settings
========================= */

function updateSignupBonusStatusLabel() {
  const enabled = Boolean(
    document.getElementById("signupBonusEnabled")?.checked,
  );

  setText("signupBonusStatusLabel", enabled ? "Enabled" : "Disabled");
}

function updateSignupBonusSettingsValues(settings) {
  const enabledInput = document.getElementById("signupBonusEnabled");

  if (enabledInput) {
    enabledInput.checked =
      settings.isEnabled === undefined ? true : Boolean(settings.isEnabled);
  }

  setInputValue("signupBonusAmount", Number(settings.bonusAmount ?? 50));

  updateSignupBonusStatusLabel();
}

async function saveSignupBonusSettings(event) {
  event.preventDefault();

  const settings = {
    isEnabled: Boolean(document.getElementById("signupBonusEnabled")?.checked),

    bonusAmount: Number(document.getElementById("signupBonusAmount")?.value),
  };

  if (
    !Number.isFinite(settings.bonusAmount) ||
    settings.bonusAmount < 0 ||
    settings.bonusAmount > 1000000
  ) {
    showToast("Signup bonus must be between ৳0 and ৳1000000.", "error");

    return;
  }

  const token = getAccessToken();

  if (!token) {
    window.location.href = "../pages/login.html";

    return;
  }

  const saveButton = document.getElementById("saveSignupBonusSettings");

  try {
    if (saveButton) {
      saveButton.disabled = true;

      saveButton.innerHTML = `
        <i class="fa-solid fa-spinner fa-spin"></i>
        Saving...
      `;
    }

    showLoader();

    const response = await fetch(
      `${API_BASE_URL}/admin/dashboard/signup-bonus-settings`,
      {
        method: "PATCH",

        headers: {
          Authorization: `Bearer ${token}`,

          Accept: "application/json",

          "Content-Type": "application/json",
        },

        body: JSON.stringify(settings),
      },
    );

    const result = await parseResponse(response);

    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem("access_token");

      throw new Error("Your admin session has expired.");
    }

    if (!response.ok || !result.success) {
      throw new Error(result.message || "Signup bonus update failed.");
    }

    const savedSettings = result.data?.signupBonusSettings || settings;

    updateSignupBonusSettingsValues(savedSettings);

    showToast(result.message || "Signup bonus settings updated successfully.");
  } catch (error) {
    console.error("SIGNUP BONUS SETTINGS UPDATE ERROR:", error);

    showToast(error.message || "Signup bonus update failed.", "error");

    if (error.message === "Your admin session has expired.") {
      window.setTimeout(() => {
        window.location.href = "../pages/login.html";
      }, 1200);
    }
  } finally {
    if (saveButton) {
      saveButton.disabled = false;

      saveButton.innerHTML = `
        <i class="fa-solid fa-floppy-disk"></i>
        Save Signup Bonus Settings
      `;
    }

    hideLoader();
  }
}

/* =========================
   Withdrawal Settings
========================= */

function updateWithdrawSettingsValues(settings) {
  setInputValue(
    "minimumWithdrawAmount",
    Number(settings.minimumWithdrawAmount ?? 100),
  );
}

async function saveWithdrawSettings(event) {
  event.preventDefault();

  const settings = {
    minimumWithdrawAmount: Number(
      document.getElementById("minimumWithdrawAmount")?.value,
    ),
  };

  if (
    !Number.isFinite(settings.minimumWithdrawAmount) ||
    settings.minimumWithdrawAmount < 1 ||
    settings.minimumWithdrawAmount > 1000000
  ) {
    showToast(
      "Minimum withdrawal amount must be between ৳1 and ৳1000000.",
      "error",
    );

    return;
  }

  const token = getAccessToken();

  if (!token) {
    window.location.href = "../pages/login.html";

    return;
  }

  const saveButton = document.getElementById("saveWithdrawSettings");

  try {
    if (saveButton) {
      saveButton.disabled = true;

      saveButton.innerHTML = `
        <i class="fa-solid fa-spinner fa-spin"></i>
        Saving...
      `;
    }

    showLoader();

    const response = await fetch(
      `${API_BASE_URL}/admin/dashboard/withdraw-settings`,
      {
        method: "PATCH",

        headers: {
          Authorization: `Bearer ${token}`,

          Accept: "application/json",

          "Content-Type": "application/json",
        },

        body: JSON.stringify(settings),
      },
    );

    const result = await parseResponse(response);

    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem("access_token");

      throw new Error("Your admin session has expired.");
    }

    if (!response.ok || !result.success) {
      throw new Error(result.message || "Withdrawal settings update failed.");
    }

    const savedSettings = result.data?.withdrawSettings || settings;

    updateWithdrawSettingsValues(savedSettings);

    showToast(result.message || "Withdrawal settings updated successfully.");
  } catch (error) {
    console.error("WITHDRAW SETTINGS UPDATE ERROR:", error);

    showToast(error.message || "Withdrawal settings update failed.", "error");

    if (error.message === "Your admin session has expired.") {
      window.setTimeout(() => {
        window.location.href = "../pages/login.html";
      }, 1200);
    }
  } finally {
    if (saveButton) {
      saveButton.disabled = false;

      saveButton.innerHTML = `
        <i class="fa-solid fa-floppy-disk"></i>
        Save Withdrawal Settings
      `;
    }

    hideLoader();
  }
}

/* =========================
   First Deposit Bonus Settings
========================= */

function updateFirstDepositBonusStatusLabel() {
  const enabled = Boolean(
    document.getElementById("firstDepositBonusEnabled")?.checked,
  );

  setText("firstDepositBonusStatusLabel", enabled ? "Enabled" : "Disabled");
}

function updateFirstDepositBonusSettingsValues(settings) {
  const enabledInput = document.getElementById("firstDepositBonusEnabled");

  if (enabledInput) {
    enabledInput.checked =
      settings.isEnabled === undefined ? true : Boolean(settings.isEnabled);
  }

  setInputValue(
    "firstDepositBonusPercent",
    Number(settings.bonusPercent ?? 50),
  );

  setInputValue(
    "firstDepositMaximumBonus",
    Number(settings.maximumBonus ?? 2000),
  );

  setInputValue(
    "firstDepositMinimumDeposit",
    Number(settings.minimumDeposit ?? 0),
  );

  updateFirstDepositBonusStatusLabel();
}

function getFirstDepositBonusSettingsValues() {
  return {
    isEnabled: Boolean(
      document.getElementById("firstDepositBonusEnabled")?.checked,
    ),

    bonusPercent: Number(
      document.getElementById("firstDepositBonusPercent")?.value,
    ),

    maximumBonus: Number(
      document.getElementById("firstDepositMaximumBonus")?.value,
    ),

    minimumDeposit: Number(
      document.getElementById("firstDepositMinimumDeposit")?.value,
    ),
  };
}

function validateFirstDepositBonusSettings(settings) {
  const isValidPercent =
    Number.isFinite(settings.bonusPercent) &&
    settings.bonusPercent >= 0 &&
    settings.bonusPercent <= 100;

  const isValidMaximumBonus =
    Number.isFinite(settings.maximumBonus) &&
    settings.maximumBonus >= 0 &&
    settings.maximumBonus <= 1000000;

  const isValidMinimumDeposit =
    Number.isFinite(settings.minimumDeposit) &&
    settings.minimumDeposit >= 0 &&
    settings.minimumDeposit <= 1000000;

  return isValidPercent && isValidMaximumBonus && isValidMinimumDeposit;
}

function openFirstDepositBonusConfirmModal() {
  const settings = getFirstDepositBonusSettingsValues();

  if (!validateFirstDepositBonusSettings(settings)) {
    showToast(
      "Bonus percentage must be 0–100 and amounts must be 0–1000000.",
      "error",
    );

    return;
  }

  setText(
    "confirmFirstDepositBonusStatus",
    settings.isEnabled ? "Enabled" : "Disabled",
  );

  setText("confirmFirstDepositBonusPercent", settings.bonusPercent);

  setText(
    "confirmFirstDepositMaximumBonus",
    formatMoneyValue(settings.maximumBonus),
  );

  setText(
    "confirmFirstDepositMinimumDeposit",
    formatMoneyValue(settings.minimumDeposit),
  );

  const modal = document.getElementById("firstDepositBonusConfirmModal");

  if (modal) {
    modal.classList.add("show");

    modal.style.display = "flex";

    modal.setAttribute("aria-hidden", "false");
  }
}

function closeFirstDepositBonusConfirmModal() {
  const modal = document.getElementById("firstDepositBonusConfirmModal");

  if (modal) {
    modal.classList.remove("show");

    modal.style.display = "none";

    modal.setAttribute("aria-hidden", "true");
  }
}

async function confirmFirstDepositBonusSettingsSave() {
  const settings = getFirstDepositBonusSettingsValues();

  if (!validateFirstDepositBonusSettings(settings)) {
    showToast("Invalid first deposit bonus settings.", "error");

    return;
  }

  const token = getAccessToken();

  if (!token) {
    window.location.href = "../pages/login.html";

    return;
  }

  const confirmButton = document.getElementById("confirmFirstDepositBonusSave");

  try {
    if (confirmButton) {
      confirmButton.disabled = true;

      confirmButton.innerHTML = `
        <i class="fa-solid fa-spinner fa-spin"></i>
        Saving...
      `;
    }

    showLoader();

    const response = await fetch(
      `${API_BASE_URL}/admin/dashboard/first-deposit-bonus-settings`,
      {
        method: "PATCH",

        headers: {
          Authorization: `Bearer ${token}`,

          Accept: "application/json",

          "Content-Type": "application/json",
        },

        body: JSON.stringify(settings),
      },
    );

    const result = await parseResponse(response);

    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem("access_token");

      throw new Error("Your admin session has expired.");
    }

    if (!response.ok || !result.success) {
      throw new Error(
        result.message || "First deposit bonus settings update failed.",
      );
    }

    const savedSettings = result.data?.firstDepositBonusSettings || settings;

    updateFirstDepositBonusSettingsValues(savedSettings);

    closeFirstDepositBonusConfirmModal();

    showToast(
      result.message || "First deposit bonus settings updated successfully.",
    );
  } catch (error) {
    console.error("FIRST DEPOSIT BONUS SETTINGS UPDATE ERROR:", error);

    showToast(
      error.message || "First deposit bonus settings update failed.",
      "error",
    );

    if (error.message === "Your admin session has expired.") {
      window.setTimeout(() => {
        window.location.href = "../pages/login.html";
      }, 1200);
    }
  } finally {
    if (confirmButton) {
      confirmButton.disabled = false;

      confirmButton.innerHTML = `
        <i class="fa-solid fa-check"></i>
        Confirm & Save
      `;
    }

    hideLoader();
  }
}

/* =========================
   Referral Settings
========================= */

function updateReferralStatusLabel() {
  const enabled = Boolean(document.getElementById("referralEnabled")?.checked);

  setText("referralStatusLabel", enabled ? "Enabled" : "Disabled");
}

function updateReferralSettingsValues(settings) {
  const enabledInput = document.getElementById("referralEnabled");

  if (enabledInput) {
    enabledInput.checked = Boolean(settings.isEnabled);
  }

  setInputValue("referrerBonus", Number(settings.referrerBonus ?? 200));

  setInputValue("referredUserBonus", Number(settings.referredUserBonus ?? 100));

  setInputValue(
    "minimumFirstDeposit",
    Number(settings.minimumFirstDeposit ?? 0),
  );

  updateReferralStatusLabel();
}

function updateReferralStats(stats) {
  setText("totalReferrals", formatNumber(stats.total || 0));

  setText("pendingReferrals", formatNumber(stats.pending || 0));

  setText("rewardedReferrals", formatNumber(stats.rewarded || 0));

  const totalBonus =
    Number(stats.totalReferrerBonus || 0) +
    Number(stats.totalReferredBonus || 0);

  setText("totalReferralBonus", formatMoneyValue(totalBonus));
}

function getReferralSettingsValues() {
  return {
    isEnabled: Boolean(document.getElementById("referralEnabled")?.checked),

    referrerBonus: Number(document.getElementById("referrerBonus")?.value),

    referredUserBonus: Number(
      document.getElementById("referredUserBonus")?.value,
    ),

    minimumFirstDeposit: Number(
      document.getElementById("minimumFirstDeposit")?.value,
    ),
  };
}

function validateReferralSettings(settings) {
  return [
    settings.referrerBonus,
    settings.referredUserBonus,
    settings.minimumFirstDeposit,
  ].every((value) => Number.isFinite(value) && value >= 0 && value <= 1000000);
}

function openReferralConfirmModal() {
  const settings = getReferralSettingsValues();

  if (!validateReferralSettings(settings)) {
    showToast("Referral amounts must be between 0 and 1000000.", "error");

    return;
  }

  setText("confirmReferralStatus", settings.isEnabled ? "Enabled" : "Disabled");

  setText("confirmReferrerBonus", formatMoneyValue(settings.referrerBonus));

  setText("confirmReferredBonus", formatMoneyValue(settings.referredUserBonus));

  setText(
    "confirmMinimumDeposit",
    formatMoneyValue(settings.minimumFirstDeposit),
  );

  const modal = document.getElementById("referralConfirmModal");

  if (modal) {
    modal.classList.add("show");

    modal.style.display = "flex";

    modal.setAttribute("aria-hidden", "false");
  }
}

function closeReferralConfirmModal() {
  const modal = document.getElementById("referralConfirmModal");

  if (modal) {
    modal.classList.remove("show");

    modal.style.display = "none";

    modal.setAttribute("aria-hidden", "true");
  }
}

async function confirmReferralSettingsSave() {
  const settings = getReferralSettingsValues();

  if (!validateReferralSettings(settings)) {
    showToast("Invalid referral settings.", "error");

    return;
  }

  const token = getAccessToken();

  if (!token) {
    window.location.href = "../pages/login.html";

    return;
  }

  const confirmButton = document.getElementById("confirmReferralSave");

  try {
    if (confirmButton) {
      confirmButton.disabled = true;

      confirmButton.innerHTML = `
        <i class="fa-solid fa-spinner fa-spin"></i>
        Saving...
      `;
    }

    showLoader();

    const response = await fetch(
      `${API_BASE_URL}/admin/dashboard/referral-settings`,
      {
        method: "PATCH",

        headers: {
          Authorization: `Bearer ${token}`,

          Accept: "application/json",

          "Content-Type": "application/json",
        },

        body: JSON.stringify(settings),
      },
    );

    const result = await parseResponse(response);

    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem("access_token");

      throw new Error("Your admin session has expired.");
    }

    if (!response.ok || !result.success) {
      throw new Error(result.message || "Referral settings update failed.");
    }

    const savedSettings = result.data?.referralSettings || settings;

    updateReferralSettingsValues(savedSettings);

    closeReferralConfirmModal();

    showToast(result.message || "Referral settings updated successfully.");
  } catch (error) {
    console.error("REFERRAL SETTINGS UPDATE ERROR:", error);

    showToast(error.message || "Referral settings update failed.", "error");

    if (error.message === "Your admin session has expired.") {
      window.setTimeout(() => {
        window.location.href = "../pages/login.html";
      }, 1200);
    }
  } finally {
    if (confirmButton) {
      confirmButton.disabled = false;

      confirmButton.innerHTML = `
        <i class="fa-solid fa-check"></i>
        Confirm
      `;
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

  document
    .getElementById("signupBonusEnabled")
    ?.addEventListener("change", updateSignupBonusStatusLabel);

  document
    .getElementById("signupBonusSettingsForm")
    ?.addEventListener("submit", saveSignupBonusSettings);

  document
    .getElementById("withdrawSettingsForm")
    ?.addEventListener("submit", saveWithdrawSettings);

  document
    .getElementById("firstDepositBonusEnabled")
    ?.addEventListener("change", updateFirstDepositBonusStatusLabel);

  document
    .getElementById("firstDepositBonusSettingsForm")
    ?.addEventListener("submit", (event) => {
      event.preventDefault();

      openFirstDepositBonusConfirmModal();
    });

  document
    .getElementById("closeFirstDepositBonusModal")
    ?.addEventListener("click", closeFirstDepositBonusConfirmModal);

  document
    .getElementById("cancelFirstDepositBonusSave")
    ?.addEventListener("click", closeFirstDepositBonusConfirmModal);

  document
    .getElementById("confirmFirstDepositBonusSave")
    ?.addEventListener("click", confirmFirstDepositBonusSettingsSave);

  document
    .getElementById("firstDepositBonusConfirmModal")
    ?.addEventListener("click", (event) => {
      if (event.target.id === "firstDepositBonusConfirmModal") {
        closeFirstDepositBonusConfirmModal();
      }
    });

  document
    .getElementById("referralEnabled")
    ?.addEventListener("change", updateReferralStatusLabel);

  document
    .getElementById("referralSettingsForm")
    ?.addEventListener("submit", (event) => {
      event.preventDefault();

      openReferralConfirmModal();
    });

  document
    .getElementById("closeReferralModal")
    ?.addEventListener("click", closeReferralConfirmModal);

  document
    .getElementById("cancelReferralSave")
    ?.addEventListener("click", closeReferralConfirmModal);

  document
    .getElementById("confirmReferralSave")
    ?.addEventListener("click", confirmReferralSettingsSave);

  document
    .getElementById("referralConfirmModal")
    ?.addEventListener("click", (event) => {
      if (event.target.id === "referralConfirmModal") {
        closeReferralConfirmModal();
      }
    });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeSidebar();
      closeChargeConfirmModal();
      closeFirstDepositBonusConfirmModal();
      closeReferralConfirmModal();
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

/* ==========================================
   LOBBY BANNER MANAGEMENT
========================================== */

const LOBBY_BANNER_STATE = {
  banners: [],
  maximumBanners: 5,

  selectedBannerId: null,
  mode: "edit",

  selectedFile: null,
  previewObjectUrl: null,

  loading: false,
};

function getLobbyBannerElements() {
  return {
    form: document.getElementById("lobbyBannerForm"),

    bannerId: document.getElementById("lobbyBannerId"),

    list: document.getElementById("lobbyBannerList"),

    count: document.getElementById("lobbyBannerCount"),

    add: document.getElementById("addLobbyBanner"),

    refresh: document.getElementById("refreshLobbyBanner"),

    preview: document.getElementById("lobbyBannerPreview"),

    previewEmpty: document.getElementById("lobbyBannerPreviewEmpty"),

    fileInput: document.getElementById("lobbyBannerFile"),

    chooseFile: document.getElementById("chooseLobbyBanner"),

    fileName: document.getElementById("lobbyBannerFileName"),

    title: document.getElementById("lobbyBannerTitle"),

    targetUrl: document.getElementById("lobbyBannerTargetUrl"),

    status: document.getElementById("lobbyBannerStatus"),

    showAsPopup: document.getElementById("lobbyBannerShowPopup"),

    popupMessage: document.getElementById("lobbyBannerPopupMessage"),

    popupButtonText: document.getElementById("lobbyBannerPopupButtonText"),

    statusBadge: document.getElementById("lobbyBannerCurrentStatus"),

    orderText: document.getElementById("lobbyBannerOrderText"),

    formMode: document.getElementById("lobbyBannerFormMode"),

    formTitle: document.getElementById("lobbyBannerFormTitle"),

    updatedText: document.getElementById("lobbyBannerUpdatedText"),

    save: document.getElementById("saveLobbyBanner"),

    cancel: document.getElementById("cancelLobbyBannerEdit"),

    delete: document.getElementById("deleteLobbyBanner"),
  };
}

function getSelectedLobbyBanner() {
  return (
    LOBBY_BANNER_STATE.banners.find(
      (banner) =>
        Number(banner.id) === Number(LOBBY_BANNER_STATE.selectedBannerId),
    ) || null
  );
}

function resolveLobbyBannerUrl(imageUrl) {
  if (!imageUrl) {
    return null;
  }

  if (/^https?:\/\//i.test(imageUrl)) {
    return imageUrl;
  }

  const apiOrigin = new URL(API_BASE_URL, window.location.origin).origin;

  return new URL(imageUrl, apiOrigin).href;
}

function revokeLobbyBannerPreviewUrl() {
  if (LOBBY_BANNER_STATE.previewObjectUrl) {
    URL.revokeObjectURL(LOBBY_BANNER_STATE.previewObjectUrl);

    LOBBY_BANNER_STATE.previewObjectUrl = null;
  }
}

function showLobbyBannerEmptyPreview() {
  const elements = getLobbyBannerElements();

  revokeLobbyBannerPreviewUrl();

  if (elements.preview) {
    elements.preview.hidden = true;

    elements.preview.removeAttribute("src");
  }

  if (elements.previewEmpty) {
    elements.previewEmpty.hidden = false;
  }
}

function showLobbyBannerBlobPreview(blob, expectedBannerId = null) {
  if (
    expectedBannerId !== null &&
    Number(expectedBannerId) !== Number(LOBBY_BANNER_STATE.selectedBannerId)
  ) {
    return;
  }

  const elements = getLobbyBannerElements();

  if (!elements.preview || !blob) {
    showLobbyBannerEmptyPreview();
    return;
  }

  revokeLobbyBannerPreviewUrl();

  const objectUrl = URL.createObjectURL(blob);

  LOBBY_BANNER_STATE.previewObjectUrl = objectUrl;

  elements.preview.onload = () => {
    elements.preview.hidden = false;

    if (elements.previewEmpty) {
      elements.previewEmpty.hidden = true;
    }
  };

  elements.preview.onerror = () => {
    showLobbyBannerEmptyPreview();
  };

  elements.preview.src = objectUrl;
}

function updateLobbyBannerStatusBadge(status) {
  const badge = getLobbyBannerElements().statusBadge;

  if (!badge) {
    return;
  }

  const isActive = status === "active";

  badge.textContent = isActive ? "Active" : "Disabled";

  badge.classList.toggle("is-active", isActive);

  badge.classList.toggle("is-disabled", !isActive);
}

function formatLobbyBannerUpdatedAt(value) {
  if (!value) {
    return "Not saved yet";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not saved yet";
  }

  return date.toLocaleString("en-BD", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderLobbyBannerList() {
  const elements = getLobbyBannerElements();

  const banners = [...LOBBY_BANNER_STATE.banners].sort(
    (first, second) =>
      Number(first.displayOrder || first.id) -
      Number(second.displayOrder || second.id),
  );

  if (elements.count) {
    elements.count.textContent =
      `${banners.length} / ` + `${LOBBY_BANNER_STATE.maximumBanners}`;
  }

  if (elements.add) {
    elements.add.disabled =
      LOBBY_BANNER_STATE.loading ||
      banners.length >= LOBBY_BANNER_STATE.maximumBanners;
  }

  if (!elements.list) {
    return;
  }

  if (banners.length === 0) {
    elements.list.innerHTML = `
      <div class="banner-slot-empty">
        <i class="fa-regular fa-images"></i>

        <p>
          No Lobby banners found.
          Click Add Banner to create one.
        </p>
      </div>
    `;

    return;
  }

  elements.list.innerHTML = banners
    .map((banner) => {
      const isSelected =
        LOBBY_BANNER_STATE.mode === "edit" &&
        Number(banner.id) === Number(LOBBY_BANNER_STATE.selectedBannerId);

      const isActive = banner.status === "active";

      return `
          <button
            type="button"
            class="banner-slot-card${isSelected ? " is-selected" : ""}"
            data-banner-id="${Number(banner.id)}">

            <span class="banner-slot-card-top">

              <span class="banner-slot-number">
                ${Number(banner.displayOrder || 1)}
              </span>

              <span
                class="banner-slot-status${isActive ? " is-active" : ""}">

                ${isActive ? "Active" : "Disabled"}

              </span>

            </span>

            <strong>
              ${escapeHtml(banner.title || "Lobby Banner")}
            </strong>

            <small>
              ${escapeHtml(banner.fileName || "No image")}
            </small>

          </button>
        `;
    })
    .join("");
}

function setLobbyBannerControlsDisabled(disabled) {
  const elements = getLobbyBannerElements();

  [
    elements.fileInput,
    elements.chooseFile,
    elements.title,
    elements.targetUrl,
    elements.status,
    elements.showAsPopup,
    elements.popupMessage,
    elements.popupButtonText,
    elements.refresh,
    elements.cancel,
    elements.delete,
    elements.save,
  ].forEach((element) => {
    if (element) {
      element.disabled = disabled;
    }
  });

  elements.list
    ?.querySelectorAll("button[data-banner-id]")
    .forEach((button) => {
      button.disabled = disabled;
    });

  if (elements.add) {
    elements.add.disabled =
      disabled ||
      LOBBY_BANNER_STATE.banners.length >= LOBBY_BANNER_STATE.maximumBanners;
  }

  if (elements.save) {
    elements.save.innerHTML = disabled
      ? `
          <i class="fa-solid fa-spinner fa-spin"></i>
          Please Wait...
        `
      : `
          <i class="fa-solid fa-floppy-disk"></i>
          ${
            LOBBY_BANNER_STATE.mode === "create"
              ? "Create Banner"
              : "Save Banner"
          }
        `;
  }
}

async function loadAdminLobbyBannerImage(banner) {
  const resolvedUrl = resolveLobbyBannerUrl(banner?.imageUrl);

  if (!resolvedUrl) {
    showLobbyBannerEmptyPreview();
    return;
  }

  const token = getAccessToken();

  const expectedBannerId = Number(banner.id);

  const response = await fetch(resolvedUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
    },

    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Banner preview could not be loaded.");
  }

  const imageBlob = await response.blob();

  showLobbyBannerBlobPreview(imageBlob, expectedBannerId);
}

async function renderLobbyBannerEditor(banner, mode = "edit") {
  const elements = getLobbyBannerElements();

  LOBBY_BANNER_STATE.mode = mode;

  LOBBY_BANNER_STATE.selectedFile = null;

  if (elements.fileInput) {
    elements.fileInput.value = "";
  }

  if (mode === "create") {
    LOBBY_BANNER_STATE.selectedBannerId = null;

    if (elements.bannerId) {
      elements.bannerId.value = "";
    }

    if (elements.formMode) {
      elements.formMode.textContent = "CREATE NEW BANNER";
    }

    if (elements.formTitle) {
      elements.formTitle.textContent = `Banner ${
        LOBBY_BANNER_STATE.banners.length + 1
      } of ${LOBBY_BANNER_STATE.maximumBanners}`;
    }

    if (elements.title) {
      elements.title.value = "Lobby Banner";
    }

    if (elements.targetUrl) {
      elements.targetUrl.value = "";
    }

    if (elements.status) {
      elements.status.value = "disabled";
    }

    if (elements.fileName) {
      elements.fileName.textContent =
        "Select a JPG, PNG or WebP image · Maximum 3 MB";
    }

    if (elements.orderText) {
      elements.orderText.textContent = `Carousel position: ${
        LOBBY_BANNER_STATE.banners.length + 1
      }`;
    }

    if (elements.updatedText) {
      elements.updatedText.textContent = "This banner has not been saved yet.";
    }

    if (elements.cancel) {
      elements.cancel.hidden = false;
    }

    if (elements.delete) {
      elements.delete.hidden = true;
    }

    updateLobbyBannerStatusBadge("disabled");

    showLobbyBannerEmptyPreview();

    renderLobbyBannerList();

    setLobbyBannerControlsDisabled(false);

    return;
  }

  if (!banner) {
    showLobbyBannerEmptyPreview();
    return;
  }

  LOBBY_BANNER_STATE.selectedBannerId = Number(banner.id);

  if (elements.bannerId) {
    elements.bannerId.value = String(banner.id);
  }

  if (elements.formMode) {
    elements.formMode.textContent = "EDIT BANNER";
  }

  if (elements.formTitle) {
    elements.formTitle.textContent = banner.title || "Lobby Banner";
  }

  if (elements.title) {
    elements.title.value = banner.title || "Lobby Banner";
  }

  if (elements.targetUrl) {
    elements.targetUrl.value = banner.targetUrl || "";
  }

  if (elements.status) {
    elements.status.value = banner.status || "disabled";
  }

  if (elements.showAsPopup) {
    elements.showAsPopup.value = banner.showAsPopup ? "true" : "false";
  }

  if (elements.popupMessage) {
    elements.popupMessage.value = banner.popupMessage || "";
  }

  if (elements.popupButtonText) {
    elements.popupButtonText.value = banner.popupButtonText || "View Offer";
  }

  if (elements.showAsPopup) {
    elements.showAsPopup.value = "false";
  }

  if (elements.popupMessage) {
    elements.popupMessage.value = "";
  }

  if (elements.popupButtonText) {
    elements.popupButtonText.value = "View Offer";
  }

  if (elements.fileName) {
    elements.fileName.textContent = banner.fileName
      ? `Current image: ${banner.fileName}`
      : "JPG, PNG or WebP · Maximum 3 MB";
  }

  if (elements.orderText) {
    elements.orderText.textContent = `Carousel position: ${
      banner.displayOrder || "-"
    }`;
  }

  if (elements.updatedText) {
    elements.updatedText.textContent = `Last updated: ${formatLobbyBannerUpdatedAt(
      banner.updatedAt,
    )}`;
  }

  if (elements.cancel) {
    elements.cancel.hidden = true;
  }

  if (elements.delete) {
    elements.delete.hidden = false;
  }

  updateLobbyBannerStatusBadge(banner.status || "disabled");

  renderLobbyBannerList();

  if (banner.hasImage && banner.imageUrl) {
    try {
      await loadAdminLobbyBannerImage(banner);
    } catch (error) {
      console.error("LOAD BANNER PREVIEW ERROR:", error);

      showLobbyBannerEmptyPreview();
    }
  } else {
    showLobbyBannerEmptyPreview();
  }

  setLobbyBannerControlsDisabled(false);
}

async function requestAdminLobbyBanner(path = "", options = {}) {
  const token = getAccessToken();

  if (!token) {
    window.location.href = "../pages/login.html";

    throw new Error("Admin login is required.");
  }

  const response = await fetch(`${API_BASE_URL}/admin/lobby-banner${path}`, {
    method: options.method || "GET",

    headers: {
      Accept: "application/json",

      Authorization: `Bearer ${token}`,
    },

    body: options.body || undefined,

    cache: "no-store",
  });

  const result = await parseResponse(response);

  if (response.status === 401 || response.status === 403) {
    throw new Error(result.message || "Admin authorization failed.");
  }

  if (!response.ok || !result.success) {
    throw new Error(result.message || "Lobby banner request failed.");
  }

  return result;
}

async function loadLobbyBanners({
  showSuccess = false,
  preferredBannerId = null,
} = {}) {
  if (LOBBY_BANNER_STATE.loading) {
    return;
  }

  LOBBY_BANNER_STATE.loading = true;

  setLobbyBannerControlsDisabled(true);

  const refreshIcon = getLobbyBannerElements().refresh?.querySelector("i");

  refreshIcon?.classList.add("fa-spin");

  try {
    const result = await requestAdminLobbyBanner();

    const banners = Array.isArray(result.data?.banners)
      ? result.data.banners
      : [];

    LOBBY_BANNER_STATE.banners = banners.sort(
      (first, second) =>
        Number(first.displayOrder || first.id) -
        Number(second.displayOrder || second.id),
    );

    LOBBY_BANNER_STATE.maximumBanners = Number(
      result.data?.maximumBanners || 5,
    );

    const preferredBanner = LOBBY_BANNER_STATE.banners.find(
      (banner) => Number(banner.id) === Number(preferredBannerId),
    );

    const selectedBanner =
      preferredBanner || LOBBY_BANNER_STATE.banners[0] || null;

    LOBBY_BANNER_STATE.loading = false;

    renderLobbyBannerList();

    if (selectedBanner) {
      await renderLobbyBannerEditor(selectedBanner, "edit");
    } else {
      await renderLobbyBannerEditor(null, "create");
    }

    if (showSuccess) {
      showToast("Lobby banners refreshed successfully.");
    }
  } catch (error) {
    console.error("LOAD LOBBY BANNERS ERROR:", error);

    showLobbyBannerEmptyPreview();

    showToast(error.message || "Lobby banners load করা যায়নি।", "error");
  } finally {
    LOBBY_BANNER_STATE.loading = false;

    setLobbyBannerControlsDisabled(false);

    refreshIcon?.classList.remove("fa-spin");

    renderLobbyBannerList();
  }
}

function validateLobbyBannerFile(file) {
  const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

  if (!allowedTypes.has(file.type)) {
    throw new Error("শুধু JPG, PNG অথবা WebP image দিন।");
  }

  const maximumSize = 3 * 1024 * 1024;

  if (file.size > maximumSize) {
    throw new Error("Banner image সর্বোচ্চ 3 MB হতে পারবে।");
  }
}

function validateLobbyBannerUrl(value) {
  const targetUrl = String(value || "").trim();

  if (!targetUrl) {
    return "";
  }

  let parsedUrl;

  try {
    parsedUrl = new URL(targetUrl);
  } catch (error) {
    throw new Error("সঠিক Banner Click Link দিন।");
  }

  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
    throw new Error("Banner link অবশ্যই HTTP অথবা HTTPS হতে হবে।");
  }

  return parsedUrl.toString();
}

function handleLobbyBannerFileSelection(file) {
  if (!file) {
    return;
  }

  try {
    validateLobbyBannerFile(file);
  } catch (error) {
    const elements = getLobbyBannerElements();

    if (elements.fileInput) {
      elements.fileInput.value = "";
    }

    showToast(error.message, "error");

    return;
  }

  LOBBY_BANNER_STATE.selectedFile = file;

  const elements = getLobbyBannerElements();

  if (elements.fileName) {
    elements.fileName.textContent = `Selected: ${file.name}`;
  }

  showLobbyBannerBlobPreview(file);
}

function startCreateLobbyBanner() {
  if (LOBBY_BANNER_STATE.loading) {
    return;
  }

  if (LOBBY_BANNER_STATE.banners.length >= LOBBY_BANNER_STATE.maximumBanners) {
    showToast(
      `Maximum ${LOBBY_BANNER_STATE.maximumBanners} banners are allowed.`,
      "error",
    );

    return;
  }

  renderLobbyBannerEditor(null, "create");
}

function cancelLobbyBannerEdit() {
  const firstBanner = LOBBY_BANNER_STATE.banners[0] || null;

  if (firstBanner) {
    renderLobbyBannerEditor(firstBanner, "edit");

    return;
  }

  renderLobbyBannerEditor(null, "create");
}

function selectLobbyBanner(bannerId) {
  if (LOBBY_BANNER_STATE.loading) {
    return;
  }

  const banner = LOBBY_BANNER_STATE.banners.find(
    (item) => Number(item.id) === Number(bannerId),
  );

  if (!banner) {
    return;
  }

  renderLobbyBannerEditor(banner, "edit");
}

async function saveLobbyBannerSettings() {
  if (LOBBY_BANNER_STATE.loading) {
    return;
  }

  const elements = getLobbyBannerElements();

  const title = String(elements.title?.value || "").trim();

  const status = elements.status?.value || "disabled";

  const showAsPopup = elements.showAsPopup?.value === "true";

  const popupMessage = String(elements.popupMessage?.value || "").trim();

  const popupButtonText = String(
    elements.popupButtonText?.value || "View Offer",
  ).trim();

  if (showAsPopup && !popupMessage) {
    showToast("Popup চালু করলে Popup Message লিখতে হবে।", "error");

    elements.popupMessage?.focus();

    return;
  }

  if (popupMessage.length > 1000) {
    showToast("Popup message সর্বোচ্চ 1000 characters হতে পারবে।", "error");

    return;
  }

  if (!popupButtonText || popupButtonText.length > 60) {
    showToast("Popup button text 1–60 characters হতে হবে।", "error");

    return;
  }

  let targetUrl;

  try {
    targetUrl = validateLobbyBannerUrl(elements.targetUrl?.value);
  } catch (error) {
    showToast(error.message, "error");

    elements.targetUrl?.focus();

    return;
  }

  if (!title || title.length > 100) {
    showToast("Banner title 1–100 characters হতে হবে।", "error");

    elements.title?.focus();

    return;
  }

  const currentBanner = getSelectedLobbyBanner();

  const isCreate = LOBBY_BANNER_STATE.mode === "create";

  const hasImage = Boolean(
    LOBBY_BANNER_STATE.selectedFile || currentBanner?.hasImage,
  );

  if (isCreate && !LOBBY_BANNER_STATE.selectedFile) {
    showToast("নতুন banner তৈরির জন্য image নির্বাচন করুন।", "error");

    return;
  }

  if (status === "active" && !hasImage) {
    showToast("Active করার আগে একটি banner image upload করুন।", "error");

    return;
  }

  const shouldSave = window.confirm(
    isCreate
      ? "Create this Lobby banner?"
      : "Save changes to this Lobby banner?",
  );

  if (!shouldSave) {
    return;
  }

  const formData = new FormData();

  formData.append("title", title);

  formData.append("targetUrl", targetUrl);

  formData.append("status", status);

  formData.append("showAsPopup", String(showAsPopup));

  formData.append("popupMessage", popupMessage);

  formData.append("popupButtonText", popupButtonText);

  if (LOBBY_BANNER_STATE.selectedFile) {
    formData.append("bannerImage", LOBBY_BANNER_STATE.selectedFile);
  }

  LOBBY_BANNER_STATE.loading = true;

  setLobbyBannerControlsDisabled(true);

  try {
    const path = isCreate ? "" : `/${Number(currentBanner.id)}`;

    const result = await requestAdminLobbyBanner(path, {
      method: isCreate ? "POST" : "PATCH",

      body: formData,
    });

    const savedBanner = result.data?.banner;

    if (!savedBanner) {
      throw new Error("Saved banner data was not returned.");
    }

    if (isCreate) {
      LOBBY_BANNER_STATE.banners.push(savedBanner);
    } else {
      LOBBY_BANNER_STATE.banners = LOBBY_BANNER_STATE.banners.map((banner) =>
        Number(banner.id) === Number(savedBanner.id) ? savedBanner : banner,
      );
    }

    LOBBY_BANNER_STATE.banners.sort(
      (first, second) =>
        Number(first.displayOrder || first.id) -
        Number(second.displayOrder || second.id),
    );

    LOBBY_BANNER_STATE.loading = false;

    await renderLobbyBannerEditor(savedBanner, "edit");

    showToast(result.message || "Lobby banner saved successfully.");
  } catch (error) {
    console.error("SAVE LOBBY BANNER ERROR:", error);

    showToast(error.message || "Lobby banner save করা যায়নি।", "error");
  } finally {
    LOBBY_BANNER_STATE.loading = false;

    setLobbyBannerControlsDisabled(false);

    renderLobbyBannerList();
  }
}

async function deleteSelectedLobbyBanner() {
  if (LOBBY_BANNER_STATE.loading || LOBBY_BANNER_STATE.mode !== "edit") {
    return;
  }

  const banner = getSelectedLobbyBanner();

  if (!banner) {
    return;
  }

  const shouldDelete = window.confirm(
    `Delete "${banner.title}"? This action cannot be undone.`,
  );

  if (!shouldDelete) {
    return;
  }

  LOBBY_BANNER_STATE.loading = true;

  setLobbyBannerControlsDisabled(true);

  try {
    const result = await requestAdminLobbyBanner(`/${Number(banner.id)}`, {
      method: "DELETE",
    });

    LOBBY_BANNER_STATE.banners = LOBBY_BANNER_STATE.banners
      .filter((item) => Number(item.id) !== Number(banner.id))
      .map((item, index) => ({
        ...item,

        displayOrder: index + 1,
      }));

    LOBBY_BANNER_STATE.loading = false;

    revokeLobbyBannerPreviewUrl();

    renderLobbyBannerList();

    const nextBanner = LOBBY_BANNER_STATE.banners[0] || null;

    if (nextBanner) {
      await renderLobbyBannerEditor(nextBanner, "edit");
    } else {
      await renderLobbyBannerEditor(null, "create");
    }

    showToast(result.message || "Lobby banner deleted successfully.");
  } catch (error) {
    console.error("DELETE LOBBY BANNER ERROR:", error);

    showToast(error.message || "Lobby banner delete করা যায়নি।", "error");
  } finally {
    LOBBY_BANNER_STATE.loading = false;

    setLobbyBannerControlsDisabled(false);

    renderLobbyBannerList();
  }
}

function bindLobbyBannerEvents() {
  const elements = getLobbyBannerElements();

  elements.chooseFile?.addEventListener("click", () => {
    elements.fileInput?.click();
  });

  elements.fileInput?.addEventListener("change", () => {
    const file = elements.fileInput?.files?.[0];

    handleLobbyBannerFileSelection(file);
  });

  elements.status?.addEventListener("change", () => {
    updateLobbyBannerStatusBadge(elements.status.value);
  });

  elements.form?.addEventListener("submit", (event) => {
    event.preventDefault();

    saveLobbyBannerSettings();
  });

  elements.list?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-banner-id]");

    if (!button) {
      return;
    }

    selectLobbyBanner(button.dataset.bannerId);
  });

  elements.add?.addEventListener("click", startCreateLobbyBanner);

  elements.cancel?.addEventListener("click", cancelLobbyBannerEdit);

  elements.delete?.addEventListener("click", deleteSelectedLobbyBanner);

  elements.refresh?.addEventListener("click", () => {
    loadLobbyBanners({
      showSuccess: true,
    });
  });

  window.addEventListener("beforeunload", revokeLobbyBannerPreviewUrl);
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

  bindLobbyBannerEvents();
  loadLobbyBanners();

  dashboardRefreshTimer = window.setInterval(() => {
    loadDashboardStats();
  }, 30000);
});
