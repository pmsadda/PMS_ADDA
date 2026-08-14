"use strict";

(function initializeAdminAndarBahar() {
  /* =======================================================
     DOM
  ======================================================= */

  const DOM = {
    sidebar:
      document.getElementById("sidebar"),

    sidebarOverlay:
      document.getElementById("sidebarOverlay"),

    sidebarOpenButton:
      document.getElementById("sidebarOpenBtn"),

    sidebarCloseButton:
      document.getElementById("sidebarCloseBtn"),

    logoutButton:
      document.getElementById("logoutBtn"),

    adminName:
      document.getElementById("adminName"),

    refreshDashboardButton:
      document.getElementById("refreshDashboardBtn"),

    totalRounds:
      document.getElementById("totalRounds"),

    completedRounds:
      document.getElementById("completedRounds"),

    totalBetAmount:
      document.getElementById("totalBetAmount"),

    totalServiceCharge:
      document.getElementById("totalServiceCharge"),

    gameStatusBadge:
      document.getElementById("gameStatusBadge"),

    settingsForm:
      document.getElementById("settingsForm"),

    gameEnabledInput:
      document.getElementById("gameEnabledInput"),

    minimumBetInput:
      document.getElementById("minimumBetInput"),

    maximumBetInput:
      document.getElementById("maximumBetInput"),

    serviceChargeInput:
      document.getElementById("serviceChargeInput"),

    bettingDurationInput:
      document.getElementById("bettingDurationInput"),

    resultDisplayInput:
      document.getElementById("resultDisplayInput"),

    nextRoundDelayInput:
      document.getElementById("nextRoundDelayInput"),

    saveSettingsButton:
      document.getElementById("saveSettingsBtn"),

    settingsMessage:
      document.getElementById("settingsMessage"),

    roundStatusFilter:
      document.getElementById("roundStatusFilter"),

    refreshRoundsButton:
      document.getElementById("refreshRoundsBtn"),

    roundsTableBody:
      document.getElementById("roundsTableBody"),

    previousPageButton:
      document.getElementById("previousPageBtn"),

    nextPageButton:
      document.getElementById("nextPageBtn"),

    pageInformation:
      document.getElementById("pageInformation"),

    betsModal:
      document.getElementById("betsModal"),

    betsModalTitle:
      document.getElementById("betsModalTitle"),

    closeBetsModalButton:
      document.getElementById("closeBetsModalBtn"),

    betsTableBody:
      document.getElementById("betsTableBody"),

    loading:
      document.getElementById("adminLoading"),

    toast:
      document.getElementById("adminToast"),
  };

  /* =======================================================
     STATE
  ======================================================= */

  const state = {
    currentPage: 1,
    pageLimit: 20,
    totalRounds: 0,
    loadingRounds: false,
    savingSettings: false,
    toastTimer: null,
  };

  /* =======================================================
     AUTHENTICATION
  ======================================================= */

  function getAccessToken() {
    return localStorage.getItem(
      "access_token",
    );
  }

  function getStoredAdmin() {
    const storedUser =
      localStorage.getItem(
        "current_user",
      );

    if (!storedUser) {
      return null;
    }

    try {
      return JSON.parse(
        storedUser,
      );
    } catch (error) {
      console.error(
        "Invalid stored admin:",
        error,
      );

      return null;
    }
  }

  function redirectToLogin() {
    localStorage.removeItem(
      "access_token",
    );

    localStorage.removeItem(
      "current_user",
    );

    window.location.replace(
      "../pages/login.html",
    );
  }

  /* =======================================================
     FORMAT HELPERS
  ======================================================= */

  function parseAmount(value) {
    const amount =
      Number(value);

    if (!Number.isFinite(amount)) {
      return 0;
    }

    return Number(
      amount.toFixed(2),
    );
  }

  function formatMoney(value) {
    return parseAmount(
      value,
    ).toLocaleString(
      "en-BD",
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      },
    );
  }

  function formatStatus(value) {
    return String(value || "")
      .replace(/_/g, " ")
      .replace(
        /\b\w/g,
        (character) =>
          character.toUpperCase(),
      );
  }

  function formatDate(value) {
    if (!value) {
      return "--";
    }

    const date =
      new Date(value);

    if (
      Number.isNaN(
        date.getTime(),
      )
    ) {
      return "--";
    }

    return date.toLocaleString(
      "en-BD",
    );
  }

  function escapeHtml(value) {
    const element =
      document.createElement(
        "div",
      );

    element.textContent =
      String(value ?? "");

    return element.innerHTML;
  }

  /* =======================================================
     UI HELPERS
  ======================================================= */

  function hideLoading() {
    DOM.loading.classList.add(
      "is-hidden",
    );
  }

  function showToast(
    message,
    type = "",
  ) {
    window.clearTimeout(
      state.toastTimer,
    );

    DOM.toast.textContent =
      message;

    DOM.toast.classList.remove(
      "is-success",
      "is-error",
    );

    if (type) {
      DOM.toast.classList.add(
        `is-${type}`,
      );
    }

    DOM.toast.classList.add(
      "is-visible",
    );

    state.toastTimer =
      window.setTimeout(
        () => {
          DOM.toast.classList.remove(
            "is-visible",
          );
        },
        3500,
      );
  }

  function setSettingsMessage(
    message,
    type = "",
  ) {
    DOM.settingsMessage.textContent =
      message;

    DOM.settingsMessage.classList.remove(
      "is-success",
      "is-error",
    );

    if (type) {
      DOM.settingsMessage.classList.add(
        `is-${type}`,
      );
    }
  }

  function setGameStatus(
    enabled,
  ) {
    DOM.gameStatusBadge.classList.remove(
      "is-enabled",
      "is-disabled",
    );

    if (enabled) {
      DOM.gameStatusBadge.textContent =
        "Enabled";

      DOM.gameStatusBadge.classList.add(
        "is-enabled",
      );

      return;
    }

    DOM.gameStatusBadge.textContent =
      "Disabled";

    DOM.gameStatusBadge.classList.add(
      "is-disabled",
    );
  }

  /* =======================================================
     API
  ======================================================= */

  async function apiRequest(
    path,
    options = {},
  ) {
    const token =
      getAccessToken();

    if (!token) {
      redirectToLogin();

      throw new Error(
        "Admin login is required.",
      );
    }

    const response =
      await fetch(
        window.APP_CONFIG.api(
          path,
        ),
        {
          ...options,

          headers: {
            "Content-Type":
              "application/json",

            Authorization:
              `Bearer ${token}`,

            ...options.headers,
          },
        },
      );

    const result =
      await response.json()
        .catch(() => ({
          success: false,
          message:
            "Invalid server response.",
        }));

    if (
      response.status === 401
    ) {
      redirectToLogin();

      throw new Error(
        result.message ||
          "Admin login expired.",
      );
    }

    if (
      response.status === 403
    ) {
      throw new Error(
        result.message ||
          "Admin access is required.",
      );
    }

    if (
      !response.ok ||
      !result.success
    ) {
      throw new Error(
        result.message ||
          "Admin request failed.",
      );
    }

    return result.data;
  }

  /* =======================================================
     DASHBOARD
  ======================================================= */

  function renderDashboard(data) {
    const summary =
      data?.summary || {};

    DOM.totalRounds.textContent =
      String(
        summary.totalRounds ||
        0,
      );

    DOM.completedRounds.textContent =
      String(
        summary.completedRounds ||
        0,
      );

    DOM.totalBetAmount.textContent =
      formatMoney(
        summary.totalBetAmount ||
        0,
      );

    DOM.totalServiceCharge.textContent =
      formatMoney(
        summary.totalServiceCharge ||
        0,
      );

    renderSettings(
      data?.settings,
    );
  }

  function renderSettings(settings) {
    if (!settings) {
      return;
    }

    DOM.gameEnabledInput.checked =
      Boolean(
        settings.gameEnabled,
      );

    DOM.minimumBetInput.value =
      settings.minimumBet;

    DOM.maximumBetInput.value =
      settings.maximumBet;

    DOM.serviceChargeInput.value =
      settings.serviceChargePercent;

    DOM.bettingDurationInput.value =
      settings.bettingDurationSeconds;

    DOM.resultDisplayInput.value =
      settings.resultDisplaySeconds;

    DOM.nextRoundDelayInput.value =
      settings.nextRoundDelaySeconds;

    setGameStatus(
      settings.gameEnabled,
    );
  }

  async function loadDashboard() {
    DOM.refreshDashboardButton.disabled =
      true;

    try {
      const data =
        await apiRequest(
          "/admin/andar-bahar/dashboard",
        );

      renderDashboard(data);
    } catch (error) {
      console.error(
        "Admin dashboard error:",
        error,
      );

      showToast(
        error.message,
        "error",
      );
    } finally {
      DOM.refreshDashboardButton.disabled =
        false;

      hideLoading();
    }
  }

  /* =======================================================
     SETTINGS
  ======================================================= */

  async function saveSettings(
    event,
  ) {
    event.preventDefault();

    if (state.savingSettings) {
      return;
    }

    const payload = {
      gameEnabled:
        DOM.gameEnabledInput.checked,

      minimumBet:
        Number(
          DOM.minimumBetInput.value,
        ),

      maximumBet:
        Number(
          DOM.maximumBetInput.value,
        ),

      serviceChargePercent:
        Number(
          DOM.serviceChargeInput.value,
        ),

      bettingDurationSeconds:
        Number(
          DOM.bettingDurationInput.value,
        ),

      resultDisplaySeconds:
        Number(
          DOM.resultDisplayInput.value,
        ),

      nextRoundDelaySeconds:
        Number(
          DOM.nextRoundDelayInput.value,
        ),
    };

    if (
      payload.minimumBet < 5
    ) {
      setSettingsMessage(
        "Minimum bet cannot be less than ৳5.",
        "error",
      );

      return;
    }

    if (
      payload.maximumBet <
      payload.minimumBet
    ) {
      setSettingsMessage(
        "Maximum bet must be greater than minimum bet.",
        "error",
      );

      return;
    }

    state.savingSettings = true;

    DOM.saveSettingsButton.disabled =
      true;

    setSettingsMessage(
      "Saving settings...",
    );

    try {
      const data =
        await apiRequest(
          "/admin/andar-bahar/settings",
          {
            method: "PUT",

            body:
              JSON.stringify(
                payload,
              ),
          },
        );

      renderSettings(
        data.settings,
      );

      setSettingsMessage(
        "Settings saved successfully. Changes apply from the next round.",
        "success",
      );

      showToast(
        "Andar Bahar settings saved.",
        "success",
      );
    } catch (error) {
      console.error(
        "Save settings error:",
        error,
      );

      setSettingsMessage(
        error.message,
        "error",
      );

      showToast(
        error.message,
        "error",
      );
    } finally {
      state.savingSettings = false;

      DOM.saveSettingsButton.disabled =
        false;
    }
  }

  /* =======================================================
     ROUNDS
  ======================================================= */

  function renderRounds(data) {
    const rounds =
      data?.rounds || [];

    const pagination =
      data?.pagination || {};

    state.totalRounds =
      Number(
        pagination.total ||
        0,
      );

    if (
      rounds.length === 0
    ) {
      DOM.roundsTableBody.innerHTML = `
        <tr>
          <td
            colspan="8"
            class="empty-table">
            No Andar Bahar rounds found.
          </td>
        </tr>
      `;
    } else {
      DOM.roundsTableBody.innerHTML =
        rounds.map(
          (round) => `
            <tr>
              <td>
                <strong>
                  ${escapeHtml(
                    round.roundCode,
                  )}
                </strong>
              </td>

              <td>
                <span class="table-status ${escapeHtml(
                  round.roundStatus,
                )}">
                  ${escapeHtml(
                    formatStatus(
                      round.roundStatus,
                    ),
                  )}
                </span>
              </td>

              <td>
                ${escapeHtml(
                  round.jokerCard ||
                  "--",
                )}
              </td>

              <td>
                ${escapeHtml(
                  formatStatus(
                    round.winningSide ||
                    "--",
                  ),
                )}
              </td>

              <td>
                ৳${formatMoney(
                  round.totalBetAmount,
                )}
              </td>

              <td>
                ৳${formatMoney(
                  round.totalServiceCharge,
                )}
              </td>

              <td>
                ${escapeHtml(
                  formatDate(
                    round.completedAt,
                  ),
                )}
              </td>

              <td>
                <button
                  type="button"
                  class="view-bets-btn"
                  data-round-id="${Number(
                    round.id,
                  )}"
                  data-round-code="${escapeHtml(
                    round.roundCode,
                  )}">
                  View Bets
                </button>
              </td>
            </tr>
          `,
        ).join("");
    }

    const totalPages =
      Math.max(
        1,
        Math.ceil(
          state.totalRounds /
          state.pageLimit,
        ),
      );

    DOM.pageInformation.textContent =
      `Page ${state.currentPage} of ${totalPages}`;

    DOM.previousPageButton.disabled =
      state.currentPage <= 1;

    DOM.nextPageButton.disabled =
      state.currentPage >=
      totalPages;
  }

  async function loadRounds() {
    if (state.loadingRounds) {
      return;
    }

    state.loadingRounds = true;

    DOM.refreshRoundsButton.disabled =
      true;

    DOM.roundsTableBody.innerHTML = `
      <tr>
        <td
          colspan="8"
          class="empty-table">
          Loading rounds...
        </td>
      </tr>
    `;

    try {
      const status =
        DOM.roundStatusFilter.value;

      const parameters =
        new URLSearchParams({
          page:
            String(
              state.currentPage,
            ),

          limit:
            String(
              state.pageLimit,
            ),
        });

      if (status) {
        parameters.set(
          "status",
          status,
        );
      }

      const data =
        await apiRequest(
          `/admin/andar-bahar/rounds?${parameters.toString()}`,
        );

      renderRounds(data);
    } catch (error) {
      console.error(
        "Load rounds error:",
        error,
      );

      DOM.roundsTableBody.innerHTML = `
        <tr>
          <td
            colspan="8"
            class="empty-table">
            ${escapeHtml(
              error.message,
            )}
          </td>
        </tr>
      `;

      showToast(
        error.message,
        "error",
      );
    } finally {
      state.loadingRounds = false;

      DOM.refreshRoundsButton.disabled =
        false;
    }
  }

  /* =======================================================
     BET DETAILS
  ======================================================= */

  function renderRoundBets(bets) {
    if (
      !Array.isArray(bets) ||
      bets.length === 0
    ) {
      DOM.betsTableBody.innerHTML = `
        <tr>
          <td
            colspan="7"
            class="empty-table">
            No bets were placed in this round.
          </td>
        </tr>
      `;

      return;
    }

    DOM.betsTableBody.innerHTML =
      bets.map(
        (bet) => {
          const userName =
            bet.user?.username ||
            bet.user?.fullName ||
            bet.user?.phone ||
            `User ${bet.userId}`;

          return `
            <tr>
              <td>
                <strong>
                  ${escapeHtml(
                    userName,
                  )}
                </strong>
              </td>

              <td>
                ${escapeHtml(
                  formatStatus(
                    bet.selectedSide,
                  ),
                )}
              </td>

              <td>
                ৳${formatMoney(
                  bet.betAmount,
                )}
              </td>

              <td>
                <span class="table-status ${escapeHtml(
                  bet.betStatus,
                )}">
                  ${escapeHtml(
                    formatStatus(
                      bet.betStatus,
                    ),
                  )}
                </span>
              </td>

              <td>
                ৳${formatMoney(
                  bet.grossPayout,
                )}
              </td>

              <td>
                ৳${formatMoney(
                  bet.serviceCharge,
                )}
              </td>

              <td>
                ৳${formatMoney(
                  bet.netPayout,
                )}
              </td>
            </tr>
          `;
        },
      ).join("");
  }

  async function openRoundBets(
    roundId,
    roundCode,
  ) {
    DOM.betsModal.classList.remove(
      "is-hidden",
    );

    DOM.betsModalTitle.textContent =
      roundCode ||
      `Round ${roundId}`;

    DOM.betsTableBody.innerHTML = `
      <tr>
        <td
          colspan="7"
          class="empty-table">
          Loading bets...
        </td>
      </tr>
    `;

    try {
      const data =
        await apiRequest(
          `/admin/andar-bahar/rounds/${roundId}/bets`,
        );

      renderRoundBets(
        data.bets,
      );
    } catch (error) {
      DOM.betsTableBody.innerHTML = `
        <tr>
          <td
            colspan="7"
            class="empty-table">
            ${escapeHtml(
              error.message,
            )}
          </td>
        </tr>
      `;
    }
  }

  function closeBetsModal() {
    DOM.betsModal.classList.add(
      "is-hidden",
    );
  }

  /* =======================================================
     SIDEBAR AND LOGOUT
  ======================================================= */

  function openSidebar() {
    DOM.sidebar.classList.add(
      "is-open",
    );

    DOM.sidebarOverlay.classList.add(
      "is-visible",
    );
  }

  function closeSidebar() {
    DOM.sidebar.classList.remove(
      "is-open",
    );

    DOM.sidebarOverlay.classList.remove(
      "is-visible",
    );
  }

  async function logout() {
    if (
      window.AUTH_SESSION &&
      typeof window.AUTH_SESSION
        .logout === "function"
    ) {
      await window.AUTH_SESSION
        .logout();

      return;
    }

    redirectToLogin();
  }

  /* =======================================================
     EVENTS
  ======================================================= */

  function bindEvents() {
    DOM.sidebarOpenButton.addEventListener(
      "click",
      openSidebar,
    );

    DOM.sidebarCloseButton.addEventListener(
      "click",
      closeSidebar,
    );

    DOM.sidebarOverlay.addEventListener(
      "click",
      closeSidebar,
    );

    DOM.logoutButton.addEventListener(
      "click",
      logout,
    );

    DOM.refreshDashboardButton.addEventListener(
      "click",
      loadDashboard,
    );

    DOM.settingsForm.addEventListener(
      "submit",
      saveSettings,
    );

    DOM.refreshRoundsButton.addEventListener(
      "click",
      loadRounds,
    );

    DOM.roundStatusFilter.addEventListener(
      "change",
      () => {
        state.currentPage = 1;

        loadRounds();
      },
    );

    DOM.previousPageButton.addEventListener(
      "click",
      () => {
        if (
          state.currentPage <= 1
        ) {
          return;
        }

        state.currentPage -= 1;

        loadRounds();
      },
    );

    DOM.nextPageButton.addEventListener(
      "click",
      () => {
        const totalPages =
          Math.max(
            1,
            Math.ceil(
              state.totalRounds /
              state.pageLimit,
            ),
          );

        if (
          state.currentPage >=
          totalPages
        ) {
          return;
        }

        state.currentPage += 1;

        loadRounds();
      },
    );

    DOM.roundsTableBody.addEventListener(
      "click",
      (event) => {
        const button =
          event.target.closest(
            ".view-bets-btn",
          );

        if (!button) {
          return;
        }

        openRoundBets(
          Number(
            button.dataset
              .roundId,
          ),

          button.dataset
            .roundCode,
        );
      },
    );

    DOM.closeBetsModalButton.addEventListener(
      "click",
      closeBetsModal,
    );

    DOM.betsModal.addEventListener(
      "click",
      (event) => {
        if (
          event.target ===
          DOM.betsModal
        ) {
          closeBetsModal();
        }
      },
    );
  }

  /* =======================================================
     START
  ======================================================= */

  async function startAdminPage() {
    if (
      !getAccessToken()
    ) {
      redirectToLogin();

      return;
    }

    const admin =
      getStoredAdmin();

    DOM.adminName.textContent =
      admin?.username ||
      admin?.fullName ||
      admin?.full_name ||
      "Admin";

    bindEvents();

    await Promise.all([
      loadDashboard(),
      loadRounds(),
    ]);

    hideLoading();
  }

  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      startAdminPage,
      {
        once: true,
      },
    );
  } else {
    startAdminPage();
  }
})();