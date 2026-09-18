"use strict";

(() => {
  const API_BASE =
    "/admin/bangla-wheel";

  const DOM = {
    sidebar:
      document.getElementById("sidebar"),

    sidebarOverlay:
      document.getElementById("sidebarOverlay"),

    sidebarOpenBtn:
      document.getElementById("sidebarOpenBtn"),

    sidebarCloseBtn:
      document.getElementById("sidebarCloseBtn"),

    logoutBtn:
      document.getElementById("logoutBtn"),

    adminName:
      document.getElementById("adminName"),

    refreshDashboardBtn:
      document.getElementById("refreshDashboardBtn"),

    totalRounds:
      document.getElementById("totalRounds"),

    completedRounds:
      document.getElementById("completedRounds"),

    totalBetAmount:
      document.getElementById("totalBetAmount"),

    totalServiceCharge:
      document.getElementById("totalServiceCharge"),

    pendingConfigBanner:
      document.getElementById("pendingConfigBanner"),

    pendingConfigText:
      document.getElementById("pendingConfigText"),

    pendingVersionBadge:
      document.getElementById("pendingVersionBadge"),

    gameStatusBadge:
      document.getElementById("gameStatusBadge"),

    settingsForm:
      document.getElementById("settingsForm"),

    gameEnabledInput:
      document.getElementById("gameEnabledInput"),

    fairModeInput:
      document.getElementById("fairModeInput"),

   configuredModeInput:
  document.getElementById("configuredModeInput"),

lowVolatilityInput:
  document.getElementById("lowVolatilityInput"),

mediumVolatilityInput:
  document.getElementById("mediumVolatilityInput"),

highVolatilityInput:
  document.getElementById("highVolatilityInput"),

minimumBetInput:
      document.getElementById("minimumBetInput"),

    maximumBetInput:
      document.getElementById("maximumBetInput"),

    serviceChargeInput:
      document.getElementById("serviceChargeInput"),

    maxLiabilityInput:
      document.getElementById("maxLiabilityInput"),

    bettingDurationInput:
      document.getElementById("bettingDurationInput"),

    spinDurationInput:
      document.getElementById("spinDurationInput"),

    resultDisplayInput:
      document.getElementById("resultDisplayInput"),

    nextRoundDelayInput:
      document.getElementById("nextRoundDelayInput"),

    animalSettingsGrid:
      document.getElementById("animalSettingsGrid"),

    weightTotalBadge:
      document.getElementById("weightTotalBadge"),

    totalWeightValue:
      document.getElementById("totalWeightValue"),

    settingsMessage:
      document.getElementById("settingsMessage"),

    saveSettingsBtn:
      document.getElementById("saveSettingsBtn"),

    roundModeFilter:
      document.getElementById("roundModeFilter"),

    roundStatusFilter:
      document.getElementById("roundStatusFilter"),

    refreshRoundsBtn:
      document.getElementById("refreshRoundsBtn"),

    roundsTableBody:
      document.getElementById("roundsTableBody"),

    previousPageBtn:
      document.getElementById("previousPageBtn"),

    nextPageBtn:
      document.getElementById("nextPageBtn"),

    pageInformation:
      document.getElementById("pageInformation"),

    betsModal:
      document.getElementById("betsModal"),

    betsModalTitle:
      document.getElementById("betsModalTitle"),

    closeBetsModalBtn:
      document.getElementById("closeBetsModalBtn"),

    betsTableBody:
      document.getElementById("betsTableBody"),

    adminLoading:
      document.getElementById("adminLoading"),

    adminToast:
      document.getElementById("adminToast")
  };

  const state = {
    animals: [],
    currentPage: 1,
    pageLimit: 20,
    totalPages: 1,
    loadingRounds: false,
    saving: false,
    toastTimer: null
  };

  function getToken() {
    return localStorage.getItem(
      "access_token"
    );
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

  function getStoredAdmin() {
    try {
      return JSON.parse(
        localStorage.getItem(
          "current_user"
        ) || "null"
      );
    } catch {
      return null;
    }
  }

  function escapeHtml(value) {
    const element =
      document.createElement("div");

    element.textContent =
      String(value ?? "");

    return element.innerHTML;
  }

  function money(value) {
    return Number(value || 0)
      .toLocaleString("en-BD", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
  }

  function formatDate(value) {
    if (!value) return "--";

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
    return String(value || "")
      .replaceAll("_", " ")
      .replace(
        /\b\w/g,
        (character) =>
          character.toUpperCase()
      );
  }

  function showToast(
    message,
    type = ""
  ) {
    clearTimeout(
      state.toastTimer
    );

    DOM.adminToast.textContent =
      message;

    DOM.adminToast.classList.remove(
      "is-success",
      "is-error"
    );

    if (type) {
      DOM.adminToast.classList.add(
        `is-${type}`
      );
    }

    DOM.adminToast.classList.add(
      "is-visible"
    );

    state.toastTimer =
      setTimeout(() => {
        DOM.adminToast.classList.remove(
          "is-visible"
        );
      }, 3500);
  }

  function setSettingsMessage(
    message,
    type = ""
  ) {
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

  async function apiRequest(
    path,
    options = {}
  ) {
    const token =
      getToken();

    if (!token) {
      redirectToLogin();

      throw new Error(
        "Admin login required."
      );
    }

    const response =
      await fetch(
        window.APP_CONFIG.api(path),
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
      await response.json()
        .catch(() => ({
          success: false,
          message:
            "Invalid server response."
        }));

    if (response.status === 401) {
      redirectToLogin();

      throw new Error(
        "Admin login expired."
      );
    }

    if (
      !response.ok ||
      !result.success
    ) {
      throw new Error(
        result.message ||
        "Admin request failed."
      );
    }

    return result.data;
  }

  function setGameStatus(enabled) {
    DOM.gameStatusBadge.classList.remove(
      "is-enabled",
      "is-disabled"
    );

    DOM.gameStatusBadge.textContent =
      enabled
        ? "Enabled"
        : "Disabled";

    DOM.gameStatusBadge.classList.add(
      enabled
        ? "is-enabled"
        : "is-disabled"
    );
  }

  function getCurrentMode() {
    return DOM.configuredModeInput.checked
      ? "admin_configured_odds"
      : "fair_equal";
  }

  function getCurrentVolatilityProfile() {
  const selectedInput =
    document.querySelector(
      'input[name="volatilityProfile"]:checked'
    );

  const selectedValue =
    String(
      selectedInput?.value ||
      "medium"
    )
      .trim()
      .toLowerCase();

  return [
    "low",
    "medium",
    "high",
  ].includes(selectedValue)
    ? selectedValue
    : "medium";
}

  function calculateWeightTotal() {
    const inputs =
      DOM.animalSettingsGrid
        .querySelectorAll(
          "[data-winning-weight]"
        );

    const total =
      Array.from(inputs)
        .reduce(
          (sum, input) =>
            sum +
            Number(
              input.value || 0
            ),
          0
        );

    DOM.totalWeightValue.textContent =
      String(total);

    DOM.weightTotalBadge.classList.toggle(
      "is-valid",
      total === 1000
    );

    DOM.weightTotalBadge.classList.toggle(
      "is-invalid",
      total !== 1000
    );

    document
      .querySelectorAll(
        "[data-chance-output]"
      )
      .forEach((output) => {
        const animalId =
          output.dataset.chanceOutput;

        const weightInput =
          DOM.animalSettingsGrid
            .querySelector(
              `[data-winning-weight="${animalId}"]`
            );

        const weight =
          Number(
            weightInput?.value || 0
          );

        output.textContent =
          total > 0
            ? `${(
                weight *
                100 /
                total
              ).toFixed(2)}%`
            : "0.00%";
      });

    return total;
  }

  function syncModeUi() {
    const configured =
      getCurrentMode() ===
      "admin_configured_odds";

    DOM.animalSettingsGrid
      .querySelectorAll(
        "[data-winning-weight]"
      )
      .forEach((input) => {
        input.disabled =
          !configured;
      });

    calculateWeightTotal();
  }

  function renderAnimals(animals) {
    state.animals =
      Array.isArray(animals)
        ? animals
        : [];

    DOM.animalSettingsGrid.innerHTML =
      state.animals.map((animal) => {
        const nilClass =
          animal.isBettable
            ? ""
            : " is-nil";

        return `
          <article
            class="bw-animal-setting-card${nilClass}"
            data-animal-id="${Number(animal.id)}">

            <div class="bw-animal-setting-image">

              <img
                src="../assets/bangla-wheel/${escapeHtml(
                  animal.animalCode
                )}.png"
                alt="${escapeHtml(
                  animal.animalName
                )}">

            </div>

            <div class="bw-animal-setting-content">

              <div class="bw-animal-setting-title">

                <strong>
                  ${escapeHtml(
                    animal.animalName
                  )}
                </strong>

                <span>
                  ${animal.isBettable
                    ? `${Number(
                        animal.multiplier
                      )}x`
                    : "NIL"}
                </span>

              </div>

              <div class="bw-animal-fields">

                <label>

                  <span>Multiplier</span>

                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value="${Number(
                      animal.multiplier
                    )}"
                    data-multiplier="${Number(
                      animal.id
                    )}"
                    ${animal.isBettable
                      ? ""
                      : "disabled"}>

                </label>

                <label>

                  <span>Weight</span>

                  <input
                    type="number"
                    min="1"
                    max="1000"
                    step="1"
                    value="${Number(
                      animal.winningWeight
                    )}"
                    data-winning-weight="${Number(
                      animal.id
                    )}">

                </label>

              </div>

              <p class="bw-configured-chance">

                Configured chance:

                <strong
                  data-chance-output="${Number(
                    animal.id
                  )}">

                  ${Number(
                    animal.winningChancePercent ||
                    0
                  ).toFixed(2)}%

                </strong>

              </p>

            </div>

          </article>
        `;
      }).join("");

    DOM.animalSettingsGrid
      .querySelectorAll(
        "[data-winning-weight]"
      )
      .forEach((input) => {
        input.addEventListener(
          "input",
          calculateWeightTotal
        );
      });

    syncModeUi();
  }

  function renderPendingConfig(
    pendingConfig
  ) {
    if (!pendingConfig) {
      DOM.pendingConfigBanner
        .classList.add(
          "is-hidden"
        );

      return;
    }

    DOM.pendingConfigBanner
      .classList.remove(
        "is-hidden"
      );

    DOM.pendingVersionBadge.textContent =
      `v${pendingConfig.configVersion}`;

    DOM.pendingConfigText.textContent =
      `Version ${pendingConfig.configVersion} is waiting for the next round.`;
  }

  function renderDashboard(data) {
    const summary =
      data?.summary || {};

    const settings =
      data?.settings || {};

    DOM.totalRounds.textContent =
      String(
        summary.totalRounds || 0
      );

    DOM.completedRounds.textContent =
      String(
        summary.completedRounds || 0
      );

    DOM.totalBetAmount.textContent =
      money(
        summary.totalBetAmount
      );

    DOM.totalServiceCharge.textContent =
      money(
        summary.totalServiceCharge
      );

    DOM.gameEnabledInput.checked =
      Boolean(
        settings.gameEnabled
      );

    DOM.minimumBetInput.value =
      settings.minimumBet ?? 5;

    DOM.maximumBetInput.value =
      settings.maximumBet ?? 1000;

    DOM.serviceChargeInput.value =
      settings.serviceChargePercent ?? 5;

    DOM.maxLiabilityInput.value =
      settings.maxRoundLiability ??
      100000;

    DOM.bettingDurationInput.value =
      settings.bettingDurationSeconds ??
      15;

    DOM.spinDurationInput.value =
      settings.spinDurationSeconds ??
      20;

    DOM.resultDisplayInput.value =
      settings.resultDisplaySeconds ??
      8;

    DOM.nextRoundDelayInput.value =
      settings.nextRoundDelaySeconds ??
      5;

    const configured =
      settings.resultMode ===
      "admin_configured_odds";

    DOM.configuredModeInput.checked =
      configured;

   DOM.fairModeInput.checked =
  !configured;

const volatilityProfile =
  [
    "low",
    "medium",
    "high",
  ].includes(
    String(
      settings.volatilityProfile ||
      ""
    ).toLowerCase()
  )
    ? String(
        settings.volatilityProfile
      ).toLowerCase()
    : "medium";

DOM.lowVolatilityInput.checked =
  volatilityProfile === "low";

DOM.mediumVolatilityInput.checked =
  volatilityProfile === "medium";

DOM.highVolatilityInput.checked =
  volatilityProfile === "high";

setGameStatus(
      Boolean(settings.gameEnabled)
    );

    renderAnimals(
      data?.animals || []
    );

    renderPendingConfig(
      data?.pendingConfig
    );
  }

  async function loadDashboard() {
    DOM.refreshDashboardBtn.disabled =
      true;

    try {
      const data =
        await apiRequest(
          `${API_BASE}/dashboard`
        );

      renderDashboard(data);
    } catch (error) {
      console.error(error);

      showToast(
        error.message,
        "error"
      );
    } finally {
      DOM.refreshDashboardBtn.disabled =
        false;

      DOM.adminLoading.classList.add(
        "is-hidden"
      );
    }
  }

  function collectAnimalSettings() {
    return state.animals.map((animal) => {
      const multiplierInput =
        DOM.animalSettingsGrid
          .querySelector(
            `[data-multiplier="${animal.id}"]`
          );

      const weightInput =
        DOM.animalSettingsGrid
          .querySelector(
            `[data-winning-weight="${animal.id}"]`
          );

      return {
        id: Number(animal.id),

        multiplier:
          animal.isBettable
            ? Number(
                multiplierInput?.value
              )
            : 0,

        isBettable:
          Boolean(
            animal.isBettable
          ),

        winningWeight:
          Number(
            weightInput?.value
          )
      };
    });
  }

  async function saveConfiguration(event) {
    event.preventDefault();

    if (state.saving) return;

    const totalWeight =
      calculateWeightTotal();

    if (totalWeight !== 1000) {
      setSettingsMessage(
        "Animal weights must total exactly 1000.",
        "error"
      );

      showToast(
        "Weight total must be 1000.",
        "error"
      );

      return;
    }

    const minimumBet =
      Number(
        DOM.minimumBetInput.value
      );

    const maximumBet =
      Number(
        DOM.maximumBetInput.value
      );

    if (
      maximumBet <
      minimumBet
    ) {
      setSettingsMessage(
        "Maximum bet cannot be lower than minimum bet.",
        "error"
      );

      return;
    }

    const payload = {
      settings: {
        gameEnabled:
          DOM.gameEnabledInput.checked,

        resultMode:
  getCurrentMode(),

volatilityProfile:
  getCurrentVolatilityProfile(),

minimumBet,

        maximumBet,

        serviceChargePercent:
          Number(
            DOM.serviceChargeInput.value
          ),

        maxRoundLiability:
          Number(
            DOM.maxLiabilityInput.value
          ),

        bettingDurationSeconds:
          Number(
            DOM.bettingDurationInput.value
          ),

        spinDurationSeconds:
          Number(
            DOM.spinDurationInput.value
          ),

        resultDisplaySeconds:
          Number(
            DOM.resultDisplayInput.value
          ),

        nextRoundDelaySeconds:
          Number(
            DOM.nextRoundDelayInput.value
          )
      },

      animals:
        collectAnimalSettings()
    };

    state.saving = true;
    DOM.saveSettingsBtn.disabled =
      true;

    setSettingsMessage(
      "Scheduling configuration..."
    );

    try {
      const data =
        await apiRequest(
          `${API_BASE}/configuration`,
          {
            method: "POST",
            body:
              JSON.stringify(payload)
          }
        );

      setSettingsMessage(
        data.message ||
        "Configuration scheduled for the next round.",
        "success"
      );

      showToast(
        "Configuration scheduled successfully.",
        "success"
      );

      await loadDashboard();
    } catch (error) {
      console.error(error);

      setSettingsMessage(
        error.message,
        "error"
      );

      showToast(
        error.message,
        "error"
      );
    } finally {
      state.saving = false;
      DOM.saveSettingsBtn.disabled =
        false;
    }
  }

  function renderRounds(data) {
    const rounds =
      data?.rounds || [];

    const pagination =
      data?.pagination || {};

    state.totalPages =
      Number(
        pagination.totalPages || 1
      );

    if (rounds.length === 0) {
      DOM.roundsTableBody.innerHTML = `
        <tr>
          <td
            colspan="9"
            class="empty-table">
            No Bangla Wheel rounds found.
          </td>
        </tr>
      `;
    } else {
      DOM.roundsTableBody.innerHTML =
        rounds.map((round) => {
          const configured =
            round.resultMode ===
            "admin_configured_odds";

          return `
            <tr>

              <td>
                <strong>
                  ${escapeHtml(
                    round.roundCode
                  )}
                </strong>
              </td>

              <td>
                <span
                  class="bw-mode-table-badge${configured
                    ? " configured"
                    : ""}">

                  ${configured
                    ? "Configured"
                    : "Fair"}

                </span>
              </td>

              <td>
                <span
                  class="status-badge status-${escapeHtml(
                    round.status
                  )}">

                  ${escapeHtml(
                    formatStatus(
                      round.status
                    )
                  )}

                </span>
              </td>

              <td>
                ${round.winningAnimalCode
                  ? `${escapeHtml(
                      formatStatus(
                        round.winningAnimalCode
                      )
                    )} (${Number(
                      round.winningMultiplier ||
                      0
                    )}x)`
                  : "--"}
              </td>

              <td>
                ${Number(
                  round.totalPlayers || 0
                )}
              </td>

              <td>
                ৳${money(
                  round.totalBetAmount
                )}
              </td>

              <td>
                ৳${money(
                  round.totalServiceCharge
                )}
              </td>

              <td>
                ${formatDate(
                  round.completedAt ||
                  round.createdAt
                )}
              </td>

              <td>
                <button
                  type="button"
                  class="table-action-btn view-bets-btn"
                  data-round-id="${Number(
                    round.id
                  )}"
                  data-round-code="${escapeHtml(
                    round.roundCode
                  )}">

                  <i class="fa-solid fa-eye"></i>

                  Bets

                </button>
              </td>

            </tr>
          `;
        }).join("");
    }

    DOM.pageInformation.textContent =
      `Page ${state.currentPage} of ${state.totalPages}`;

    DOM.previousPageBtn.disabled =
      state.currentPage <= 1;

    DOM.nextPageBtn.disabled =
      state.currentPage >=
      state.totalPages;
  }

  async function loadRounds() {
    if (state.loadingRounds) return;

    state.loadingRounds = true;
    DOM.refreshRoundsBtn.disabled =
      true;

    const parameters =
      new URLSearchParams({
        page:
          String(state.currentPage),

        limit:
          String(state.pageLimit)
      });

    if (DOM.roundStatusFilter.value) {
      parameters.set(
        "status",
        DOM.roundStatusFilter.value
      );
    }

    if (DOM.roundModeFilter.value) {
      parameters.set(
        "mode",
        DOM.roundModeFilter.value
      );
    }

    try {
      const data =
        await apiRequest(
          `${API_BASE}/rounds?${parameters}`
        );

      renderRounds(data);
    } catch (error) {
      console.error(error);

      DOM.roundsTableBody.innerHTML = `
        <tr>
          <td
            colspan="9"
            class="empty-table">
            ${escapeHtml(error.message)}
          </td>
        </tr>
      `;

      showToast(
        error.message,
        "error"
      );
    } finally {
      state.loadingRounds = false;
      DOM.refreshRoundsBtn.disabled =
        false;
    }
  }

  function closeBetsModal() {
    DOM.betsModal.classList.add(
      "is-hidden"
    );
  }

  async function openRoundBets(
    roundId,
    roundCode
  ) {
    DOM.betsModalTitle.textContent =
      `${roundCode} Bet Details`;

    DOM.betsTableBody.innerHTML = `
      <tr>
        <td
          colspan="7"
          class="empty-table">
          Loading bets...
        </td>
      </tr>
    `;

    DOM.betsModal.classList.remove(
      "is-hidden"
    );

    try {
      const data =
        await apiRequest(
          `${API_BASE}/rounds/${roundId}/bets`
        );

      const bets =
        data?.bets || [];

      if (bets.length === 0) {
        DOM.betsTableBody.innerHTML = `
          <tr>
            <td
              colspan="7"
              class="empty-table">
              No bets found.
            </td>
          </tr>
        `;

        return;
      }

      DOM.betsTableBody.innerHTML =
        bets.map((bet) => {
          const userName =
            bet.user?.username ||
            bet.user?.fullName ||
            bet.user?.uid ||
            `User ${bet.userId}`;

          return `
            <tr>

              <td>
                ${escapeHtml(userName)}
              </td>

              <td>
                ${escapeHtml(
                  bet.selectedAnimalName
                )}
                (${Number(
                  bet.lockedMultiplier
                )}x)
              </td>

              <td>
                ৳${money(
                  bet.betAmount
                )}
              </td>

              <td>
                <span
                  class="status-badge status-${escapeHtml(
                    bet.status
                  )}">

                  ${escapeHtml(
                    formatStatus(
                      bet.status
                    )
                  )}

                </span>
              </td>

              <td>
                ৳${money(
                  bet.grossPayout
                )}
              </td>

              <td>
                ৳${money(
                  bet.serviceCharge
                )}
              </td>

              <td>
                ৳${money(
                  bet.netPayout
                )}
              </td>

            </tr>
          `;
        }).join("");
    } catch (error) {
      DOM.betsTableBody.innerHTML = `
        <tr>
          <td
            colspan="7"
            class="empty-table">
            ${escapeHtml(error.message)}
          </td>
        </tr>
      `;
    }
  }

  function openSidebar() {
    DOM.sidebar.classList.add(
      "is-open"
    );

    DOM.sidebarOverlay.classList.add(
      "is-visible"
    );
  }

  function closeSidebar() {
    DOM.sidebar.classList.remove(
      "is-open"
    );

    DOM.sidebarOverlay.classList.remove(
      "is-visible"
    );
  }

  function bindEvents() {
    DOM.sidebarOpenBtn
      ?.addEventListener(
        "click",
        openSidebar
      );

    DOM.sidebarCloseBtn
      ?.addEventListener(
        "click",
        closeSidebar
      );

    DOM.sidebarOverlay
      ?.addEventListener(
        "click",
        closeSidebar
      );

    DOM.logoutBtn
      ?.addEventListener(
        "click",
        redirectToLogin
      );

    DOM.refreshDashboardBtn
      ?.addEventListener(
        "click",
        loadDashboard
      );

    DOM.settingsForm
      ?.addEventListener(
        "submit",
        saveConfiguration
      );

    DOM.fairModeInput
      ?.addEventListener(
        "change",
        syncModeUi
      );

    DOM.configuredModeInput
      ?.addEventListener(
        "change",
        syncModeUi
      );

    DOM.refreshRoundsBtn
      ?.addEventListener(
        "click",
        () => {
          state.currentPage = 1;
          loadRounds();
        }
      );

    DOM.roundStatusFilter
      ?.addEventListener(
        "change",
        () => {
          state.currentPage = 1;
          loadRounds();
        }
      );

    DOM.roundModeFilter
      ?.addEventListener(
        "change",
        () => {
          state.currentPage = 1;
          loadRounds();
        }
      );

    DOM.previousPageBtn
      ?.addEventListener(
        "click",
        () => {
          if (state.currentPage <= 1) return;

          state.currentPage -= 1;
          loadRounds();
        }
      );

    DOM.nextPageBtn
      ?.addEventListener(
        "click",
        () => {
          if (
            state.currentPage >=
            state.totalPages
          ) {
            return;
          }

          state.currentPage += 1;
          loadRounds();
        }
      );

    DOM.roundsTableBody
      ?.addEventListener(
        "click",
        (event) => {
          const button =
            event.target.closest(
              ".view-bets-btn"
            );

          if (!button) return;

          openRoundBets(
            Number(
              button.dataset.roundId
            ),
            button.dataset.roundCode
          );
        }
      );

    DOM.closeBetsModalBtn
      ?.addEventListener(
        "click",
        closeBetsModal
      );

    DOM.betsModal
      ?.addEventListener(
        "click",
        (event) => {
          if (
            event.target ===
            DOM.betsModal
          ) {
            closeBetsModal();
          }
        }
      );

    document.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape") {
          closeBetsModal();
          closeSidebar();
        }
      }
    );
  }

  async function start() {
    if (!getToken()) {
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
      loadRounds()
    ]);

    DOM.adminLoading.classList.add(
      "is-hidden"
    );
  }

  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      start,
      {
        once: true
      }
    );
  } else {
    start();
  }
})();