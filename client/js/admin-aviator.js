"use strict";

(function initializeAdminAviator() {
  /* =======================================================
     DOM
  ======================================================= */

  const DOM = {
    sidebar: document.getElementById("sidebar"),

    sidebarOverlay: document.getElementById("sidebarOverlay"),

    sidebarOpenButton: document.getElementById("sidebarOpenBtn"),

    sidebarCloseButton: document.getElementById("sidebarCloseBtn"),

    logoutButton: document.getElementById("logoutBtn"),

    adminName: document.getElementById("adminName"),

    refreshSettingsButton: document.getElementById("refreshSettingsBtn"),

    summaryGameStatus: document.getElementById("summaryGameStatus"),

    summaryMinimumBet: document.getElementById("summaryMinimumBet"),

    summaryMaximumBet: document.getElementById("summaryMaximumBet"),

    summaryHouseEdge: document.getElementById("summaryHouseEdge"),

    analyticsPeriodFilter: document.getElementById("analyticsPeriodFilter"),

    analyticsTotalBet: document.getElementById("analyticsTotalBet"),

    analyticsTotalPayout: document.getElementById("analyticsTotalPayout"),

    analyticsNetCard: document.getElementById("analyticsNetCard"),

    analyticsNetProfit: document.getElementById("analyticsNetProfit"),

    analyticsProfitMargin: document.getElementById("analyticsProfitMargin"),

    analyticsCompletedRounds: document.getElementById(
      "analyticsCompletedRounds",
    ),

    analyticsPlayers: document.getElementById("analyticsPlayers"),

    analyticsActiveRound: document.getElementById("analyticsActiveRound"),

    analyticsLiveBet: document.getElementById("analyticsLiveBet"),

    analyticsLivePlayers: document.getElementById("analyticsLivePlayers"),

    analyticsRoundRows: document.getElementById("analyticsRoundRows"),

    gameStatusBadge: document.getElementById("gameStatusBadge"),

    settingsForm: document.getElementById("settingsForm"),

    gameEnabledInput: document.getElementById("gameEnabledInput"),

    maintenanceModeInput: document.getElementById("maintenanceModeInput"),

    minimumBetInput: document.getElementById("minimumBetInput"),

    maximumBetInput: document.getElementById("maximumBetInput"),

    maximumPayoutInput: document.getElementById("maximumPayoutInput"),

    bettingDurationInput: document.getElementById("bettingDurationInput"),

    roundGapInput: document.getElementById("roundGapInput"),

    maximumMultiplierInput: document.getElementById("maximumMultiplierInput"),

    houseEdgeInput: document.getElementById("houseEdgeInput"),

    volatilityProfileInput: document.getElementById("volatilityProfileInput"),

    saveSettingsButton: document.getElementById("saveSettingsBtn"),

    settingsMessage: document.getElementById("settingsMessage"),

    cancelRoundIdInput: document.getElementById("cancelRoundIdInput"),

    cancelRoundButton: document.getElementById("cancelRoundBtn"),

    cancelRoundMessage: document.getElementById("cancelRoundMessage"),

    loading: document.getElementById("adminLoading"),

    toast: document.getElementById("adminToast"),
  };

  /* =======================================================
     STATE
  ======================================================= */

  const state = {
    loading: false,
    saving: false,
    cancelling: false,
    analyticsLoading: false,
    analyticsPeriod: "today",
    toastTimer: null,
  };

  /* =======================================================
     AUTH
  ======================================================= */

  function getAccessToken() {
    return localStorage.getItem("access_token");
  }

  function getStoredAdmin() {
    const stored = localStorage.getItem("current_user");

    if (!stored) {
      return null;
    }

    try {
      return JSON.parse(stored);
    } catch (_error) {
      return null;
    }
  }

  function redirectToLogin() {
    localStorage.removeItem("access_token");

    localStorage.removeItem("current_user");

    window.location.replace("../pages/login.html");
  }

  function logout() {
    redirectToLogin();
  }

  /* =======================================================
     HELPERS
  ======================================================= */

  function toNumber(value, fallback = 0) {
    const number = Number(value);

    return Number.isFinite(number) ? number : fallback;
  }

  function formatMoney(value) {
    return toNumber(value, 0).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function formatPercent(value) {
    return toNumber(value, 0).toFixed(2);
  }

  function formatDateTime(value) {
    if (!value) {
      return "--";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "--";
    }

    return date.toLocaleString("en-BD", {
      dateStyle: "short",
      timeStyle: "short",
    });
  }

  function escapeHTML(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function setLoading(loading) {
    state.loading = Boolean(loading);

    if (!DOM.loading) {
      return;
    }

    DOM.loading.style.display = state.loading ? "flex" : "none";
  }

  function showToast(message, type = "success") {
    if (!DOM.toast) {
      return;
    }

    window.clearTimeout(state.toastTimer);

    DOM.toast.textContent = message;

    DOM.toast.className = `admin-toast show ${type}`;

    state.toastTimer = window.setTimeout(() => {
      DOM.toast.className = "admin-toast";
    }, 3200);
  }

  function setSettingsMessage(message, type = "") {
    if (!DOM.settingsMessage) {
      return;
    }

    DOM.settingsMessage.textContent = message;

    DOM.settingsMessage.className = type;
  }

  function setCancelMessage(message, type = "") {
    if (!DOM.cancelRoundMessage) {
      return;
    }

    DOM.cancelRoundMessage.textContent = message;

    DOM.cancelRoundMessage.className = `aviator-cancel-message ${type}`;
  }

  function updateAdminName() {
    const admin = getStoredAdmin();

    if (!admin || !DOM.adminName) {
      return;
    }

    DOM.adminName.textContent =
      admin.name ||
      admin.fullName ||
      admin.full_name ||
      admin.username ||
      admin.email ||
      "Admin";
  }

  /* =======================================================
     SIDEBAR
  ======================================================= */

  function openSidebar() {
    DOM.sidebar?.classList.add("open");

    DOM.sidebarOverlay?.classList.add("show");
  }

  function closeSidebar() {
    DOM.sidebar?.classList.remove("open");

    DOM.sidebarOverlay?.classList.remove("show");
  }

  /* =======================================================
     API
  ======================================================= */

  async function apiRequest(path, options = {}) {
    const token = getAccessToken();

    if (!token) {
      redirectToLogin();

      throw new Error("Admin login required.");
    }

    const response = await fetch(window.APP_CONFIG.api(path), {
      ...options,

      headers: {
        "Content-Type": "application/json",

        Authorization: `Bearer ${token}`,

        ...options.headers,
      },
    });

    const result = await response.json().catch(() => ({
      success: false,
      message: "Invalid server response.",
    }));

    if (response.status === 401) {
      redirectToLogin();

      throw new Error("Admin login expired.");
    }

    if (!response.ok || result?.success === false) {
      const error = new Error(result?.message || "Request failed.");

      error.status = response.status;

      error.code = result?.code;

      throw error;
    }

    return result?.data ?? result;
  }

  /* =======================================================
     STATUS
  ======================================================= */

  function renderGameStatus(settings) {
    const enabled = Boolean(settings?.isEnabled);

    const maintenance = Boolean(settings?.maintenanceMode);

    let label = "Disabled";

    if (maintenance) {
      label = "Maintenance";
    } else if (enabled) {
      label = "Enabled";
    }

    if (DOM.summaryGameStatus) {
      DOM.summaryGameStatus.textContent = label;
    }

    if (DOM.gameStatusBadge) {
      DOM.gameStatusBadge.textContent = label;

      DOM.gameStatusBadge.className = "game-status-badge";

      if (maintenance) {
        DOM.gameStatusBadge.classList.add("warning");
      } else if (enabled) {
        DOM.gameStatusBadge.classList.add("active");
      } else {
        DOM.gameStatusBadge.classList.add("inactive");
      }
    }
  }

  /* =======================================================
   PROFIT / LOSS ANALYTICS
======================================================= */

  function setAnalyticsPeriod(period) {
    state.analyticsPeriod = ["today", "7d", "30d"].includes(period)
      ? period
      : "today";

    DOM.analyticsPeriodFilter
      ?.querySelectorAll("[data-period]")
      .forEach((button) => {
        button.classList.toggle(
          "active",
          button.dataset.period === state.analyticsPeriod,
        );
      });
  }

  function renderAnalytics(data) {
    const summary = data?.summary || {};

    const netProfit = toNumber(summary.netProfit);

    if (DOM.analyticsTotalBet) {
      DOM.analyticsTotalBet.textContent = formatMoney(summary.totalBet);
    }

    if (DOM.analyticsTotalPayout) {
      DOM.analyticsTotalPayout.textContent = formatMoney(summary.totalPayout);
    }

    if (DOM.analyticsNetProfit) {
      DOM.analyticsNetProfit.textContent = formatMoney(netProfit);
    }

    if (DOM.analyticsProfitMargin) {
      DOM.analyticsProfitMargin.textContent = formatPercent(
        summary.profitMargin,
      );
    }

    if (DOM.analyticsCompletedRounds) {
      DOM.analyticsCompletedRounds.textContent = String(
        toNumber(summary.completedRounds),
      );
    }

    if (DOM.analyticsPlayers) {
      DOM.analyticsPlayers.textContent = String(toNumber(summary.totalPlayers));
    }

    if (DOM.analyticsNetCard) {
      DOM.analyticsNetCard.classList.toggle("profit", netProfit >= 0);

      DOM.analyticsNetCard.classList.toggle("loss", netProfit < 0);
    }

    const activeRound = data?.activeRound || null;

    if (DOM.analyticsActiveRound) {
      DOM.analyticsActiveRound.textContent = activeRound
        ? `${activeRound.roundCode} (${String(
            activeRound.status,
          ).toUpperCase()})`
        : "None";
    }

    if (DOM.analyticsLiveBet) {
      DOM.analyticsLiveBet.textContent = formatMoney(
        activeRound?.totalBetAmount,
      );
    }

    if (DOM.analyticsLivePlayers) {
      DOM.analyticsLivePlayers.textContent = activeRound
        ? `${toNumber(activeRound.openBets)} / ${toNumber(
            activeRound.openPlayers,
          )}`
        : "0 / 0";
    }

    if (!DOM.analyticsRoundRows) {
      return;
    }

    const rounds = Array.isArray(data?.rounds) ? data.rounds : [];

    if (!rounds.length) {
      DOM.analyticsRoundRows.innerHTML = `
      <tr>
        <td
          colspan="6"
          class="empty-cell"
        >
          No completed Aviator rounds in this period.
        </td>
      </tr>
    `;

      return;
    }

    DOM.analyticsRoundRows.innerHTML = rounds
      .map((round) => {
        const roundProfit = toNumber(round.netProfit);

        const profitClass = roundProfit >= 0 ? "profit-text" : "loss-text";

        return `
          <tr>
            <td>
              <strong>
                ${escapeHTML(round.roundCode)}
              </strong>

              <small>
                #${toNumber(round.id)}
              </small>
            </td>

            <td>
              ${toNumber(round.crashMultiplier).toFixed(2)}x
            </td>

            <td>
              ৳${formatMoney(round.totalBetAmount)}
            </td>

            <td>
              ৳${formatMoney(round.totalPayoutAmount)}
            </td>

            <td class="${profitClass}">
              ৳${formatMoney(roundProfit)}
            </td>

            <td>
              ${escapeHTML(formatDateTime(round.crashedAt))}
            </td>
          </tr>
        `;
      })
      .join("");
  }

  async function loadAnalytics({ silent = false } = {}) {
    if (state.analyticsLoading) {
      return;
    }

    state.analyticsLoading = true;

    try {
      const period = encodeURIComponent(state.analyticsPeriod);

      const data = await apiRequest(
        `/admin/aviator/analytics?period=${period}`,
      );

      renderAnalytics(data);

      setAnalyticsPeriod(data?.period || state.analyticsPeriod);
    } catch (error) {
      console.error("AVIATOR ADMIN ANALYTICS LOAD ERROR:", error);

      if (!silent) {
        showToast(
          error.message || "Aviator report could not be loaded.",
          "error",
        );
      }

      if (DOM.analyticsRoundRows) {
        DOM.analyticsRoundRows.innerHTML = `
        <tr>
          <td
            colspan="6"
            class="empty-cell error"
          >
            ${escapeHTML(error.message || "Report load failed.")}
          </td>
        </tr>
      `;
      }
    } finally {
      state.analyticsLoading = false;
    }
  }

  /* =======================================================
     RENDER SETTINGS
  ======================================================= */

  function renderSettings(settings) {
    if (!settings) {
      return;
    }

    const minBet = toNumber(settings.minBet);

    const maxBet = toNumber(settings.maxBet);

    const maxPayout = toNumber(settings.maxPayout);

    const bettingSeconds = toNumber(settings.bettingSeconds);

    const roundGapSeconds = toNumber(settings.roundGapSeconds);

    const maxMultiplier = toNumber(settings.maxMultiplier);

    const houseEdgePercent = toNumber(
      settings.houseEdgePercent ?? settings.houseEdge,
    );

    if (DOM.gameEnabledInput) {
      DOM.gameEnabledInput.checked = Boolean(settings.isEnabled);
    }

    if (DOM.maintenanceModeInput) {
      DOM.maintenanceModeInput.checked = Boolean(settings.maintenanceMode);
    }

    if (DOM.minimumBetInput) {
      DOM.minimumBetInput.value = String(minBet);
    }

    if (DOM.maximumBetInput) {
      DOM.maximumBetInput.value = String(maxBet);
    }

    if (DOM.maximumPayoutInput) {
      DOM.maximumPayoutInput.value = String(maxPayout);
    }

    if (DOM.bettingDurationInput) {
      DOM.bettingDurationInput.value = String(bettingSeconds);
    }

    if (DOM.roundGapInput) {
      DOM.roundGapInput.value = String(roundGapSeconds);
    }

    if (DOM.maximumMultiplierInput) {
      DOM.maximumMultiplierInput.value = String(maxMultiplier);
    }

    if (DOM.houseEdgeInput) {
      DOM.houseEdgeInput.value = String(houseEdgePercent);
    }

    const volatilityProfile = ["low", "medium", "high"].includes(
      String(settings.volatilityProfile || "").toLowerCase(),
    )
      ? String(settings.volatilityProfile).toLowerCase()
      : "medium";

    if (DOM.volatilityProfileInput) {
      DOM.volatilityProfileInput.value = volatilityProfile;
    }

    if (DOM.summaryMinimumBet) {
      DOM.summaryMinimumBet.textContent = formatMoney(minBet);
    }

    if (DOM.summaryMaximumBet) {
      DOM.summaryMaximumBet.textContent = formatMoney(maxBet);
    }

    if (DOM.summaryHouseEdge) {
      DOM.summaryHouseEdge.textContent = formatPercent(houseEdgePercent);
    }

    renderGameStatus(settings);
  }

  /* =======================================================
     LOAD SETTINGS
  ======================================================= */

  async function loadSettings({ showLoader = true } = {}) {
    if (state.loading) {
      return;
    }

    state.loading = true;

    if (showLoader) {
      setLoading(true);
    }

    if (DOM.refreshSettingsButton) {
      DOM.refreshSettingsButton.disabled = true;
    }

    try {
      const settings = await apiRequest("/admin/aviator/settings");

      renderSettings(settings);

      setSettingsMessage("Economic settings apply from the next new round.");
    } catch (error) {
      console.error("AVIATOR ADMIN SETTINGS LOAD ERROR:", error);

      showToast(
        error.message || "Aviator settings could not be loaded.",
        "error",
      );

      setSettingsMessage(error.message || "Settings load failed.", "error");
    } finally {
      state.loading = false;

      if (showLoader) {
        setLoading(false);
      }

      if (DOM.refreshSettingsButton) {
        DOM.refreshSettingsButton.disabled = false;
      }
    }
  }

  /* =======================================================
     VALIDATE SETTINGS
  ======================================================= */

  function buildSettingsPayload() {
    const minBet = toNumber(DOM.minimumBetInput?.value, NaN);

    const maxBet = toNumber(DOM.maximumBetInput?.value, NaN);

    const maxPayout = toNumber(DOM.maximumPayoutInput?.value, NaN);

    const bettingSeconds = toNumber(DOM.bettingDurationInput?.value, NaN);

    const roundGapSeconds = toNumber(DOM.roundGapInput?.value, NaN);

    const maxMultiplier = toNumber(DOM.maximumMultiplierInput?.value, NaN);

    const houseEdgePercent = toNumber(DOM.houseEdgeInput?.value, NaN);

    const volatilityProfile = String(
      DOM.volatilityProfileInput?.value || "medium",
    )
      .trim()
      .toLowerCase();

    if (!["low", "medium", "high"].includes(volatilityProfile)) {
      throw new Error("Select a valid game mode.");
    }

    if (!Number.isFinite(minBet) || minBet <= 0) {
      throw new Error("Minimum bet must be greater than 0.");
    }

    if (!Number.isFinite(maxBet) || maxBet < minBet) {
      throw new Error(
        "Maximum bet must be equal to or greater than minimum bet.",
      );
    }

    if (!Number.isFinite(maxPayout) || maxPayout < maxBet) {
      throw new Error(
        "Maximum payout must be equal to or greater than maximum bet.",
      );
    }

    if (!Number.isFinite(bettingSeconds) || bettingSeconds < 3) {
      throw new Error("Betting time must be at least 3 seconds.");
    }

    if (!Number.isFinite(roundGapSeconds) || roundGapSeconds < 1) {
      throw new Error("Round gap must be at least 1 second.");
    }

    if (!Number.isFinite(maxMultiplier) || maxMultiplier < 1.01) {
      throw new Error("Maximum multiplier must be at least 1.01x.");
    }

    if (
      !Number.isFinite(houseEdgePercent) ||
      houseEdgePercent < 0 ||
      houseEdgePercent > 20
    ) {
      throw new Error("House edge must be between 0% and 20%.");
    }

    return {
      isEnabled: Boolean(DOM.gameEnabledInput?.checked),

      maintenanceMode: Boolean(DOM.maintenanceModeInput?.checked),

      minBet,

      maxBet,

      maxPayout,

      bettingSeconds,

      roundGapSeconds,

      maxMultiplier,

      houseEdgePercent,

      volatilityProfile,
    };
  }

  /* =======================================================
     SAVE SETTINGS
  ======================================================= */

  async function saveSettings(event) {
    event?.preventDefault();

    if (state.saving) {
      return;
    }

    let payload;

    try {
      payload = buildSettingsPayload();
    } catch (error) {
      setSettingsMessage(error.message, "error");

      showToast(error.message, "error");

      return;
    }

    state.saving = true;

    if (DOM.saveSettingsButton) {
      DOM.saveSettingsButton.disabled = true;
    }

    setSettingsMessage("Saving Aviator settings...");

    try {
      const settings = await apiRequest("/admin/aviator/settings", {
        method: "PATCH",

        body: JSON.stringify(payload),
      });

      renderSettings(settings);

      setSettingsMessage(
        "Aviator settings saved. New-round settings apply from the next new round.",
        "success",
      );

      showToast("Aviator settings updated.", "success");
    } catch (error) {
      console.error("AVIATOR ADMIN SETTINGS SAVE ERROR:", error);

      setSettingsMessage(error.message || "Settings save failed.", "error");

      showToast(error.message || "Settings save failed.", "error");
    } finally {
      state.saving = false;

      if (DOM.saveSettingsButton) {
        DOM.saveSettingsButton.disabled = false;
      }
    }
  }

  /* =======================================================
     CANCEL ROUND + REFUND
  ======================================================= */

  async function cancelRoundAndRefund() {
    if (state.cancelling) {
      return;
    }

    const roundId = Number(DOM.cancelRoundIdInput?.value);

    if (!Number.isInteger(roundId) || roundId <= 0) {
      const message = "Enter a valid Aviator round ID.";

      setCancelMessage(message, "error");

      showToast(message, "error");

      return;
    }

    const confirmed = window.confirm(
      `Cancel Aviator round #${roundId} and refund all eligible placed bets?\n\nThis action cannot be undone.`,
    );

    if (!confirmed) {
      return;
    }

    state.cancelling = true;

    if (DOM.cancelRoundButton) {
      DOM.cancelRoundButton.disabled = true;
    }

    setCancelMessage(`Cancelling round #${roundId} and processing refunds...`);

    try {
      await apiRequest(`/admin/aviator/rounds/${roundId}/cancel-refund`, {
        method: "POST",
      });

      setCancelMessage(
        `Round #${roundId} cancelled. Eligible placed bets were refunded.`,
        "success",
      );

      showToast("Round cancelled and eligible bets refunded.", "success");

      if (DOM.cancelRoundIdInput) {
        DOM.cancelRoundIdInput.value = "";
      }

      await loadSettings({
        showLoader: false,
      });
    } catch (error) {
      console.error("AVIATOR ADMIN CANCEL ERROR:", error);

      setCancelMessage(error.message || "Round cancellation failed.", "error");

      showToast(error.message || "Round cancellation failed.", "error");
    } finally {
      state.cancelling = false;

      if (DOM.cancelRoundButton) {
        DOM.cancelRoundButton.disabled = false;
      }
    }
  }

  /* =======================================================
     EVENTS
  ======================================================= */

  function bindEvents() {
    DOM.sidebarOpenButton?.addEventListener("click", openSidebar);

    DOM.sidebarCloseButton?.addEventListener("click", closeSidebar);

    DOM.sidebarOverlay?.addEventListener("click", closeSidebar);

    DOM.logoutButton?.addEventListener("click", logout);

    DOM.refreshSettingsButton?.addEventListener("click", () => {
      loadSettings();

      loadAnalytics();
    });

    DOM.analyticsPeriodFilter?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-period]");

      if (!button) {
        return;
      }

      setAnalyticsPeriod(button.dataset.period);

      loadAnalytics();
    });

    DOM.settingsForm?.addEventListener("submit", saveSettings);

    DOM.cancelRoundButton?.addEventListener("click", cancelRoundAndRefund);

    DOM.gameEnabledInput?.addEventListener("change", () => {
      renderGameStatus({
        isEnabled: DOM.gameEnabledInput?.checked,

        maintenanceMode: DOM.maintenanceModeInput?.checked,
      });
    });

    DOM.maintenanceModeInput?.addEventListener("change", () => {
      renderGameStatus({
        isEnabled: DOM.gameEnabledInput?.checked,

        maintenanceMode: DOM.maintenanceModeInput?.checked,
      });
    });
  }

  /* =======================================================
     START
  ======================================================= */

  async function start() {
    if (!getAccessToken()) {
      redirectToLogin();
      return;
    }

    updateAdminName();

    bindEvents();

    await Promise.all([loadSettings(), loadAnalytics()]);
  }

  start();
})();
