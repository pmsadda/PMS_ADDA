"use strict";

(function initializeAdminKait() {
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

    currentRoundStatus:
      document.getElementById("currentRoundStatus"),

    currentRoundCode:
      document.getElementById("currentRoundCode"),

    currentRoundPlayers:
      document.getElementById("currentRoundPlayers"),

    currentRoundBets:
      document.getElementById("currentRoundBets"),

    currentRoundBetAmount:
      document.getElementById("currentRoundBetAmount"),

    currentRoundCards:
      document.getElementById("currentRoundCards"),

    currentRoundRemaining:
      document.getElementById("currentRoundRemaining"),

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

    winningMultiplierInput:
      document.getElementById("winningMultiplierInput"),

    serviceChargeInput:
      document.getElementById("serviceChargeInput"),

    bettingDurationInput:
      document.getElementById("bettingDurationInput"),

    cardDealIntervalInput:
      document.getElementById("cardDealIntervalInput"),

    resultDisplayInput:
      document.getElementById("resultDisplayInput"),

    nextRoundDelayInput:
      document.getElementById("nextRoundDelayInput"),

    saveSettingsButton:
      document.getElementById("saveSettingsBtn"),

    settingsMessage:
      document.getElementById("settingsMessage"),

    recentRoundsTableBody:
      document.getElementById("recentRoundsTableBody"),

    loading:
      document.getElementById("adminLoading"),

    toast:
      document.getElementById("adminToast")
  };


  /* =======================================================
     STATE
  ======================================================= */

  const state = {
    loading: false,
    saving: false,
    toastTimer: null
  };


  /* =======================================================
     AUTH
  ======================================================= */

  function getAccessToken() {
    return localStorage.getItem(
      "access_token"
    );
  }


  function getStoredAdmin() {
    const stored =
      localStorage.getItem(
        "current_user"
      );

    if (!stored) {
      return null;
    }

    try {
      return JSON.parse(
        stored
      );
    } catch (_error) {
      return null;
    }
  }


  function redirectToLogin() {
    localStorage.removeItem(
      "access_token"
    );

    localStorage.removeItem(
      "current_user"
    );

    window.location.replace(
      "../pages/login.html"
    );
  }


  /* =======================================================
     HELPERS
  ======================================================= */

  function toNumber(
    value,
    fallback = 0
  ) {
    const number =
      Number(value);

    return Number.isFinite(
      number
    )
      ? number
      : fallback;
  }


  function formatMoney(value) {
    return toNumber(
      value
    ).toLocaleString(
      "en-BD",
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }
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
        date.getTime()
      )
    ) {
      return "--";
    }

    return date.toLocaleString(
      "en-BD"
    );
  }


  function formatStatus(value) {
    const status =
      String(
        value || ""
      )
        .replace(
          /_/g,
          " "
        );

    return status.replace(
      /\b\w/g,
      (letter) =>
        letter.toUpperCase()
    );
  }


  function escapeHtml(value) {
    const div =
      document.createElement(
        "div"
      );

    div.textContent =
      String(
        value ?? ""
      );

    return div.innerHTML;
  }


  /* =======================================================
     UI
  ======================================================= */

  function hideLoading() {
    DOM.loading?.classList.add(
      "is-hidden"
    );
  }


  function showToast(
    message,
    type = ""
  ) {
    if (!DOM.toast) {
      return;
    }

    window.clearTimeout(
      state.toastTimer
    );

    DOM.toast.textContent =
      message;

    DOM.toast.classList.remove(
      "is-success",
      "is-error"
    );

    if (type) {
      DOM.toast.classList.add(
        `is-${type}`
      );
    }

    DOM.toast.classList.add(
      "is-visible"
    );

    state.toastTimer =
      window.setTimeout(
        () => {
          DOM.toast.classList.remove(
            "is-visible"
          );
        },
        3500
      );
  }


  function setSettingsMessage(
    message,
    type = ""
  ) {
    if (
      !DOM.settingsMessage
    ) {
      return;
    }

    DOM.settingsMessage.textContent =
      message;

    DOM.settingsMessage.classList.remove(
      "is-success",
      "is-error"
    );

    if (type) {
      DOM.settingsMessage.classList.add(
        `is-${type}`
      );
    }
  }


  function setGameStatus(
    enabled
  ) {
    DOM.gameStatusBadge
      ?.classList
      .remove(
        "is-enabled",
        "is-disabled"
      );

    if (enabled) {
      DOM.gameStatusBadge.textContent =
        "Enabled";

      DOM.gameStatusBadge
        ?.classList
        .add(
          "is-enabled"
        );

      return;
    }

    DOM.gameStatusBadge.textContent =
      "Disabled";

    DOM.gameStatusBadge
      ?.classList
      .add(
        "is-disabled"
      );
  }


  /* =======================================================
     API
  ======================================================= */

  async function apiRequest(
    path,
    options = {}
  ) {
    const token =
      getAccessToken();

    if (!token) {
      redirectToLogin();

      throw new Error(
        "Admin login required."
      );
    }

    const response =
      await fetch(
        window.APP_CONFIG.api(
          path
        ),
        {
          ...options,

          headers: {
            "Content-Type":
              "application/json",

            Authorization:
              `Bearer ${token}`,

            ...options.headers
          }
        }
      );

    const result =
      await response
        .json()
        .catch(
          () => ({
            success: false,
            message:
              "Invalid server response."
          })
        );

    if (
      response.status === 401
    ) {
      redirectToLogin();

      throw new Error(
        "Admin login expired."
      );
    }

    if (
      response.status === 403
    ) {
      throw new Error(
        result.message ||
        "Admin access required."
      );
    }

    if (
      !response.ok ||
      !result.success
    ) {
      throw new Error(
        result.message ||
        "Request failed."
      );
    }

    return result.data;
  }


  /* =======================================================
     SUMMARY
  ======================================================= */

  function renderSummary(
    summary = {}
  ) {
    DOM.totalRounds.textContent =
      String(
        summary.totalRounds ||
        0
      );

    DOM.completedRounds.textContent =
      String(
        summary.completedRounds ||
        0
      );

    DOM.totalBetAmount.textContent =
      formatMoney(
        summary.totalBetAmount ||
        0
      );

    DOM.totalServiceCharge.textContent =
      formatMoney(
        summary.totalServiceCharge ||
        0
      );
  }


  /* =======================================================
     CURRENT ROUND
  ======================================================= */

  function renderCurrentRound(
    round
  ) {
    DOM.currentRoundStatus
      ?.classList.remove(
        "is-enabled",
        "is-disabled"
      );

    if (!round) {
      DOM.currentRoundStatus.textContent =
        "No Active Round";

      DOM.currentRoundCode.value =
        "--";

      DOM.currentRoundPlayers.value =
        "0";

      DOM.currentRoundBets.value =
        "0";

      DOM.currentRoundBetAmount.value =
        "৳0.00";

      DOM.currentRoundCards.value =
        "0 / 52";

      DOM.currentRoundRemaining.value =
        "52";

      return;
    }

    const cardsDistributed =
      Math.max(
        0,
        toNumber(
          round.lastDealtPosition
        )
      );

    const remainingCards =
      Math.max(
        0,
        52 -
        cardsDistributed
      );

    DOM.currentRoundStatus.textContent =
      formatStatus(
        round.roundStatus
      );

    DOM.currentRoundCode.value =
      round.roundCode ||
      `#${round.id}`;

    DOM.currentRoundPlayers.value =
      String(
        round.totalPlayers ||
        0
      );

    DOM.currentRoundBets.value =
      String(
        round.totalBets ||
        0
      );

    DOM.currentRoundBetAmount.value =
      `৳${formatMoney(
        round.totalBetAmount ||
        0
      )}`;

    DOM.currentRoundCards.value =
      `${cardsDistributed} / 52`;

    DOM.currentRoundRemaining.value =
      String(
        remainingCards
      );
  }


  /* =======================================================
     SETTINGS
  ======================================================= */

  function renderSettings(
    settings
  ) {
    if (!settings) {
      return;
    }

    DOM.gameEnabledInput.checked =
      Boolean(
        settings.gameEnabled
      );

    DOM.minimumBetInput.value =
      settings.minimumBet;

    DOM.maximumBetInput.value =
      settings.maximumBet;

    DOM.winningMultiplierInput.value =
      settings.winningMultiplier;

    DOM.serviceChargeInput.value =
      settings.serviceChargePercent;

    DOM.bettingDurationInput.value =
      settings.bettingDurationSeconds;

    DOM.cardDealIntervalInput.value =
      settings.cardDealIntervalMs;

    DOM.resultDisplayInput.value =
      settings.resultDisplaySeconds;

    DOM.nextRoundDelayInput.value =
      settings.nextRoundDelaySeconds;

    setGameStatus(
      settings.gameEnabled
    );
  }


  /* =======================================================
     RECENT ROUNDS
  ======================================================= */

  function renderRecentRounds(
    rounds
  ) {
    if (
      !Array.isArray(rounds) ||
      rounds.length === 0
    ) {
      DOM.recentRoundsTableBody.innerHTML = `
        <tr>
          <td
            colspan="8"
            class="empty-table"
          >
            No Kait rounds found.
          </td>
        </tr>
      `;

      return;
    }

    DOM.recentRoundsTableBody.innerHTML =
      rounds
        .map(
          (round) => {

            const cards =
              Math.max(
                0,
                toNumber(
                  round.lastDealtPosition
                )
              );

            return `
              <tr>

                <td>
                  <strong>
                    ${escapeHtml(
                      round.roundCode ||
                      `#${round.id}`
                    )}
                  </strong>
                </td>

                <td>
                  <span class="status-badge">
                    ${escapeHtml(
                      formatStatus(
                        round.roundStatus
                      )
                    )}
                  </span>
                </td>

                <td>
                  ${escapeHtml(
                    round.totalPlayers ||
                    0
                  )}
                </td>

                <td>
                  ${escapeHtml(
                    round.totalBets ||
                    0
                  )}
                </td>

                <td>
                  ${cards} / 52
                </td>

                <td>
                  ৳${formatMoney(
                    round.totalBetAmount ||
                    0
                  )}
                </td>

                <td>
                  ৳${formatMoney(
                    round.totalServiceCharge ||
                    0
                  )}
                </td>

                <td>
                  ${escapeHtml(
                    formatDate(
                      round.createdAt
                    )
                  )}
                </td>

              </tr>
            `;
          }
        )
        .join("");
  }


  /* =======================================================
     DASHBOARD
  ======================================================= */

  function renderDashboard(
    data
  ) {
    renderSummary(
      data?.summary
    );

    renderCurrentRound(
      data?.currentRound
    );

    renderSettings(
      data?.settings
    );

    renderRecentRounds(
      data?.recentRounds
    );
  }


  async function loadDashboard() {
    if (state.loading) {
      return;
    }

    state.loading =
      true;

    DOM.refreshDashboardButton.disabled =
      true;

    try {
      const data =
        await apiRequest(
          "/admin/kait/dashboard"
        );

      renderDashboard(
        data
      );

    } catch (error) {
      console.error(
        "Kait admin dashboard error:",
        error
      );

      showToast(
        error.message ||
        "Kait dashboard load failed.",
        "error"
      );

    } finally {
      state.loading =
        false;

      DOM.refreshDashboardButton.disabled =
        false;

      hideLoading();
    }
  }


  /* =======================================================
     SAVE SETTINGS
  ======================================================= */

  async function saveSettings(
    event
  ) {
    event.preventDefault();

    if (state.saving) {
      return;
    }

    const payload = {
      gameEnabled:
        DOM.gameEnabledInput.checked,

      minimumBet:
        Number(
          DOM.minimumBetInput.value
        ),

      maximumBet:
        Number(
          DOM.maximumBetInput.value
        ),

      winningMultiplier:
        Number(
          DOM.winningMultiplierInput.value
        ),

      serviceChargePercent:
        Number(
          DOM.serviceChargeInput.value
        ),

      bettingDurationSeconds:
        Number(
          DOM.bettingDurationInput.value
        ),

      cardDealIntervalMs:
        Number(
          DOM.cardDealIntervalInput.value
        ),

      resultDisplaySeconds:
        Number(
          DOM.resultDisplayInput.value
        ),

      nextRoundDelaySeconds:
        Number(
          DOM.nextRoundDelayInput.value
        )
    };


    if (
      payload.minimumBet <= 0
    ) {
      setSettingsMessage(
        "Minimum bet 0-এর বেশি হতে হবে।",
        "error"
      );

      return;
    }


    if (
      payload.maximumBet <
      payload.minimumBet
    ) {
      setSettingsMessage(
        "Maximum bet minimum bet-এর চেয়ে কম হতে পারবে না।",
        "error"
      );

      return;
    }


    state.saving =
      true;

    DOM.saveSettingsButton.disabled =
      true;

    setSettingsMessage(
      "Saving Kait settings..."
    );


    try {
      const settings =
        await apiRequest(
          "/admin/kait/settings",
          {
            method: "PUT",

            body:
              JSON.stringify(
                payload
              )
          }
        );


      renderSettings(
        settings
      );


      setSettingsMessage(
        "Kait settings saved. নতুন round থেকে settings apply হবে।",
        "success"
      );


      showToast(
        "Kait settings updated.",
        "success"
      );


      await loadDashboard();

    } catch (error) {
      console.error(
        "Kait settings error:",
        error
      );


      setSettingsMessage(
        error.message ||
        "Settings save failed.",
        "error"
      );


      showToast(
        error.message ||
        "Settings save failed.",
        "error"
      );

    } finally {
      state.saving =
        false;

      DOM.saveSettingsButton.disabled =
        false;
    }
  }


  /* =======================================================
     SIDEBAR
  ======================================================= */

  function openSidebar() {
    DOM.sidebar?.classList.add(
      "is-open"
    );

    DOM.sidebarOverlay?.classList.add(
      "is-visible"
    );
  }


  function closeSidebar() {
    DOM.sidebar?.classList.remove(
      "is-open"
    );

    DOM.sidebarOverlay?.classList.remove(
      "is-visible"
    );
  }


  /* =======================================================
     LOGOUT
  ======================================================= */

  function logout() {
    localStorage.removeItem(
      "access_token"
    );

    localStorage.removeItem(
      "current_user"
    );

    window.location.replace(
      "../pages/login.html"
    );
  }


  /* =======================================================
     ADMIN INFO
  ======================================================= */

  function renderAdminInfo() {
    const admin =
      getStoredAdmin();

    if (!admin) {
      return;
    }

    DOM.adminName.textContent =
      admin.fullName ||
      admin.name ||
      admin.username ||
      "Admin";
  }


  /* =======================================================
     EVENTS
  ======================================================= */

  function bindEvents() {
    DOM.sidebarOpenButton
      ?.addEventListener(
        "click",
        openSidebar
      );

    DOM.sidebarCloseButton
      ?.addEventListener(
        "click",
        closeSidebar
      );

    DOM.sidebarOverlay
      ?.addEventListener(
        "click",
        closeSidebar
      );

    DOM.logoutButton
      ?.addEventListener(
        "click",
        logout
      );

    DOM.refreshDashboardButton
      ?.addEventListener(
        "click",
        () => {
          loadDashboard();
        }
      );

    DOM.settingsForm
      ?.addEventListener(
        "submit",
        saveSettings
      );

    DOM.gameEnabledInput
      ?.addEventListener(
        "change",
        () => {
          setGameStatus(
            DOM
              .gameEnabledInput
              .checked
          );
        }
      );
  }


  /* =======================================================
     START
  ======================================================= */

  async function initialize() {
    if (
      !getAccessToken()
    ) {
      redirectToLogin();

      return;
    }

    renderAdminInfo();

    bindEvents();

    await loadDashboard();
  }


  void initialize();

})();