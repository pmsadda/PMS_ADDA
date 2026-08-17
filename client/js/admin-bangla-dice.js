"use strict";

(() => {
    const ADMIN_API =
    typeof window.APP_CONFIG?.api === "function"
      ? window.APP_CONFIG.api("/admin/bangla-dice")
      : `${window.location.origin}/api/admin/bangla-dice`;

  const state = {
    symbols: [],
    currentPage: 1,
    totalPages: 1,
    roundsLimit: 15,
    roundsStatus: "",
    toastTimer: null,
  };

  const elements = {
    loading: document.getElementById("adminLoading"),
    toast: document.getElementById("adminToast"),

    totalRounds: document.getElementById("totalRounds"),
    totalBetAmount: document.getElementById("totalBetAmount"),
    totalNetPayout: document.getElementById("totalNetPayout"),
    totalServiceCharge: document.getElementById("totalServiceCharge"),
    grossRevenue: document.getElementById("grossRevenue"),

    settingsForm: document.getElementById("settingsForm"),
    gameEnabled: document.getElementById("gameEnabled"),
    gameStatusText: document.getElementById("gameStatusText"),
    resultMode: document.getElementById("resultMode"),
    minimumBet: document.getElementById("minimumBet"),
    maximumBet: document.getElementById("maximumBet"),
    serviceChargePercent: document.getElementById(
      "serviceChargePercent"
    ),
    bettingDurationSeconds: document.getElementById(
      "bettingDurationSeconds"
    ),
    rollDurationSeconds: document.getElementById(
      "rollDurationSeconds"
    ),
    resultDisplaySeconds: document.getElementById(
      "resultDisplaySeconds"
    ),
    nextRoundDelaySeconds: document.getElementById(
      "nextRoundDelaySeconds"
    ),
    saveSettingsBtn: document.getElementById("saveSettingsBtn"),

    symbolSettingsGrid: document.getElementById(
      "symbolSettingsGrid"
    ),
    saveSymbolsBtn: document.getElementById("saveSymbolsBtn"),

    roundStatusFilter: document.getElementById("roundStatusFilter"),
    refreshRoundsBtn: document.getElementById("refreshRoundsBtn"),
    roundsTableBody: document.getElementById("roundsTableBody"),
    previousPageBtn: document.getElementById("previousPageBtn"),
    nextPageBtn: document.getElementById("nextPageBtn"),
    pageInformation: document.getElementById("pageInformation"),

    betsModal: document.getElementById("betsModal"),
    betsModalTitle: document.getElementById("betsModalTitle"),
    closeBetsModalBtn: document.getElementById(
      "closeBetsModalBtn"
    ),
    roundDetailGrid: document.getElementById("roundDetailGrid"),
    betsTableBody: document.getElementById("betsTableBody"),

    refreshPageBtn:
      document.getElementById("refreshPageBtn") ||
      document.getElementById("refreshButton"),
  };

  function getToken() {
        return (
      localStorage.getItem("access_token") ||
      localStorage.getItem("token") ||
      localStorage.getItem("authToken") ||
      sessionStorage.getItem("access_token") ||
      sessionStorage.getItem("token") ||
      ""
    );
  }

  async function apiRequest(path, options = {}) {
    const token = getToken();

    const headers = {
      Accept: "application/json",
      ...(options.body
        ? { "Content-Type": "application/json" }
        : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    };

    const response = await fetch(`${ADMIN_API}${path}`, {
      ...options,
      headers,
    });

    let result = null;

    try {
      result = await response.json();
    } catch (_error) {
      result = null;
    }

    if (response.status === 401 || response.status === 403) {
      const message =
        result?.message ||
        result?.error ||
        "Admin authentication প্রয়োজন।";

      showToast(message, "error");

      setTimeout(() => {
        window.location.href = "./login.html";
      }, 1200);

      throw new Error(message);
    }

    if (!response.ok) {
      throw new Error(
        result?.message ||
          result?.error ||
          `Request failed (${response.status})`
      );
    }

    return result?.data ?? result;
  }

  function setLoading(visible) {
    if (!elements.loading) return;

    elements.loading.classList.toggle("hidden", !visible);
    elements.loading.classList.toggle("is-hidden", !visible);
  }

  function showToast(message, type = "success") {
    if (!elements.toast) {
      console.log(message);
      return;
    }

    clearTimeout(state.toastTimer);

    elements.toast.textContent = message;
    elements.toast.className = `admin-toast ${type}`;
    elements.toast.classList.remove("hidden", "is-hidden");

    state.toastTimer = setTimeout(() => {
      elements.toast.classList.add("hidden");
    }, 3500);
  }

  function setButtonLoading(button, loading, loadingText) {
    if (!button) return;

    if (loading) {
      button.dataset.originalText = button.textContent;
      button.textContent = loadingText;
      button.disabled = true;
      return;
    }

    button.textContent =
      button.dataset.originalText || button.textContent;
    button.disabled = false;
  }

  function toNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function formatMoney(value) {
    return `৳${toNumber(value).toLocaleString("en-BD", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  function formatNumber(value) {
    return toNumber(value).toLocaleString("en-BD");
  }

  function formatDate(value) {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "—";
    }

    return date.toLocaleString("en-BD", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function getImagePath(path) {
    if (!path) return "";

    if (
      path.startsWith("http://") ||
      path.startsWith("https://") ||
      path.startsWith("data:")
    ) {
      return path;
    }

    return path.startsWith("/") ? path : `/${path}`;
  }

  function getStatusClass(status) {
    const safeStatus = String(status || "")
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "");

    return `status-${safeStatus}`;
  }

  function renderSummary(summary = {}) {
    const totalBet =
      summary.total_bet_amount ??
      summary.totalBetAmount ??
      summary.total_bet ??
      0;

    const netPayout =
      summary.total_net_payout ??
      summary.totalNetPayout ??
      summary.net_payout ??
      0;

    const serviceCharge =
      summary.total_service_charge ??
      summary.totalServiceCharge ??
      summary.service_charge ??
      0;

    const revenue =
      summary.gross_revenue ??
      summary.grossRevenue ??
      toNumber(totalBet) - toNumber(netPayout);

    if (elements.totalRounds) {
      elements.totalRounds.textContent = formatNumber(
        summary.total_rounds ?? summary.totalRounds ?? 0
      );
    }

    if (elements.totalBetAmount) {
      elements.totalBetAmount.textContent = formatMoney(totalBet);
    }

    if (elements.totalNetPayout) {
      elements.totalNetPayout.textContent = formatMoney(netPayout);
    }

    if (elements.totalServiceCharge) {
      elements.totalServiceCharge.textContent =
        formatMoney(serviceCharge);
    }

    if (elements.grossRevenue) {
      elements.grossRevenue.textContent = formatMoney(revenue);
    }
  }

  function renderSettings(settings = {}) {
    if (elements.gameEnabled) {
      elements.gameEnabled.checked = Boolean(
        Number(
          settings.game_enabled ??
            settings.gameEnabled ??
            settings.enabled ??
            0
        )
      );
    }

    updateGameStatusText();

    if (elements.resultMode) {
      elements.resultMode.value =
        settings.result_mode ??
        settings.resultMode ??
        "equal";
    }

    if (elements.minimumBet) {
      elements.minimumBet.value =
        settings.minimum_bet ?? settings.minimumBet ?? 10;
    }

    if (elements.maximumBet) {
      elements.maximumBet.value =
        settings.maximum_bet ?? settings.maximumBet ?? 10000;
    }

    if (elements.serviceChargePercent) {
      elements.serviceChargePercent.value =
        settings.service_charge_percent ??
        settings.serviceChargePercent ??
        5;
    }

    if (elements.bettingDurationSeconds) {
      elements.bettingDurationSeconds.value =
        settings.betting_duration_seconds ??
        settings.bettingDurationSeconds ??
        30;
    }

    if (elements.rollDurationSeconds) {
      elements.rollDurationSeconds.value =
        settings.roll_duration_seconds ??
        settings.rollDurationSeconds ??
        4;
    }

    if (elements.resultDisplaySeconds) {
      elements.resultDisplaySeconds.value =
        settings.result_display_seconds ??
        settings.resultDisplaySeconds ??
        7;
    }

    if (elements.nextRoundDelaySeconds) {
      elements.nextRoundDelaySeconds.value =
        settings.next_round_delay_seconds ??
        settings.nextRoundDelaySeconds ??
        3;
    }
  }

  function updateGameStatusText() {
    if (!elements.gameEnabled || !elements.gameStatusText) return;

    if (elements.gameEnabled.checked) {
      elements.gameStatusText.textContent = "Game চালু আছে";
      elements.gameStatusText.style.color = "#75f5a3";
    } else {
      elements.gameStatusText.textContent = "Game বন্ধ আছে";
      elements.gameStatusText.style.color = "#ff9b9b";
    }
  }

  function renderSymbols(symbols = []) {
    state.symbols = Array.isArray(symbols) ? symbols : [];

    if (!elements.symbolSettingsGrid) return;

    if (!state.symbols.length) {
      elements.symbolSettingsGrid.innerHTML = `
        <div class="empty-state">
          কোনো symbol পাওয়া যায়নি।
        </div>
      `;
      return;
    }

    elements.symbolSettingsGrid.innerHTML = state.symbols
      .map((symbol, index) => {
        const id = symbol.id;
        const code = symbol.code ?? symbol.symbol_code ?? "";
        const nameBn =
          symbol.name_bn ??
          symbol.symbol_name_bn ??
          symbol.name ??
          code;

        const nameEn =
          symbol.name_en ??
          symbol.symbol_name_en ??
          "";

        const imagePath =
          symbol.image_path ?? symbol.imagePath ?? "";

        const multiplier =
          symbol.multiplier ??
          symbol.payout_multiplier ??
          1;

        const weight =
          symbol.probability_weight ??
          symbol.probabilityWeight ??
          1;

        return `
          <article
            class="symbol-setting-card"
            data-index="${index}"
            data-symbol-id="${escapeHtml(id)}"
          >
            <div class="symbol-image-wrap">
              <img
                class="symbol-image"
                src="${escapeHtml(getImagePath(imagePath))}"
                alt="${escapeHtml(nameBn)}"
              >
            </div>

            <div class="symbol-info">
              <h3 class="symbol-name">
                ${escapeHtml(nameBn)}
              </h3>

              <span class="symbol-code">
                ${escapeHtml(nameEn || code)}
              </span>

              <div class="symbol-inputs">
                <div>
                  <label for="multiplier-${index}">
                    Multiplier
                  </label>

                  <input
                    id="multiplier-${index}"
                    class="symbol-multiplier"
                    type="number"
                    min="1"
                    max="1000"
                    step="0.01"
                    value="${escapeHtml(multiplier)}"
                  >
                </div>

                <div>
                  <label for="weight-${index}">
                    Weight
                  </label>

                  <input
                    id="weight-${index}"
                    class="symbol-weight"
                    type="number"
                    min="0.01"
                    max="100000"
                    step="0.01"
                    value="${escapeHtml(weight)}"
                  >
                </div>
              </div>
            </div>
          </article>
        `;
      })
      .join("");
  }

  async function loadDashboard() {
    const data = await apiRequest("/dashboard");

    const summary =
      data?.summary ??
      data?.dashboard ??
      data?.statistics ??
      data ??
      {};

    const settings =
      data?.settings ??
      data?.game_settings ??
      data?.gameSettings ??
      {};

    const symbols =
      data?.symbols ??
      data?.game_symbols ??
      data?.gameSymbols ??
      [];

    renderSummary(summary);
    renderSettings(settings);
    renderSymbols(symbols);
  }

  function validateSettings(payload) {
    if (payload.minimumBet <= 0) {
      throw new Error("Minimum bet অবশ্যই 0-এর বেশি হতে হবে।");
    }

    if (payload.maximumBet < payload.minimumBet) {
      throw new Error(
        "Maximum bet, minimum bet-এর সমান অথবা বেশি হতে হবে।"
      );
    }

    if (
      payload.serviceChargePercent < 0 ||
      payload.serviceChargePercent > 100
    ) {
      throw new Error(
        "Service charge অবশ্যই 0 থেকে 100-এর মধ্যে হতে হবে।"
      );
    }

    if (payload.bettingDurationSeconds < 5) {
      throw new Error(
        "Betting duration কমপক্ষে 5 seconds হতে হবে।"
      );
    }

    if (payload.rollDurationSeconds < 1) {
      throw new Error(
        "Roll duration কমপক্ষে 1 second হতে হবে।"
      );
    }
  }

  async function saveSettings(event) {
    event.preventDefault();

    const payload = {
      gameEnabled: elements.gameEnabled?.checked ? 1 : 0,
      resultMode: elements.resultMode?.value || "equal",
      minimumBet: toNumber(elements.minimumBet?.value),
      maximumBet: toNumber(elements.maximumBet?.value),
      serviceChargePercent: toNumber(
        elements.serviceChargePercent?.value
      ),
      bettingDurationSeconds: toNumber(
        elements.bettingDurationSeconds?.value
      ),
      rollDurationSeconds: toNumber(
        elements.rollDurationSeconds?.value
      ),
      resultDisplaySeconds: toNumber(
        elements.resultDisplaySeconds?.value
      ),
      nextRoundDelaySeconds: toNumber(
        elements.nextRoundDelaySeconds?.value
      ),
    };

    validateSettings(payload);

    setButtonLoading(
      elements.saveSettingsBtn,
      true,
      "Saving..."
    );

    try {
      const data = await apiRequest("/settings", {
        method: "PUT",
        body: JSON.stringify(payload),
      });

      renderSettings(data?.settings ?? data ?? payload);

      showToast(
        "Bangla Dice settings সফলভাবে save হয়েছে।",
        "success"
      );
    } finally {
      setButtonLoading(elements.saveSettingsBtn, false);
    }
  }

  function collectSymbolSettings() {
    const cards = elements.symbolSettingsGrid?.querySelectorAll(
      ".symbol-setting-card"
    );

    if (!cards?.length) {
      throw new Error("কোনো symbol পাওয়া যায়নি।");
    }

    return Array.from(cards).map((card) => {
      const id = toNumber(card.dataset.symbolId);
      const multiplier = toNumber(
        card.querySelector(".symbol-multiplier")?.value
      );
      const probabilityWeight = toNumber(
        card.querySelector(".symbol-weight")?.value
      );

      if (multiplier < 1) {
        throw new Error(
          "প্রতিটি symbol-এর multiplier কমপক্ষে 1 হতে হবে।"
        );
      }

      if (probabilityWeight <= 0) {
        throw new Error(
          "প্রতিটি symbol-এর probability weight 0-এর বেশি হতে হবে।"
        );
      }

      return {
        id,
        multiplier,
        probabilityWeight,
      };
    });
  }

  async function saveSymbols() {
    try {
      const symbols = collectSymbolSettings();

      setButtonLoading(
        elements.saveSymbolsBtn,
        true,
        "Saving..."
      );

      const data = await apiRequest("/symbols", {
        method: "PUT",
        body: JSON.stringify({ symbols }),
      });

      const updatedSymbols =
        data?.symbols ??
        data?.game_symbols ??
        data;

      if (Array.isArray(updatedSymbols)) {
        renderSymbols(updatedSymbols);
      }

      showToast(
        "Multiplier এবং probability weight save হয়েছে।",
        "success"
      );
    } finally {
      setButtonLoading(elements.saveSymbolsBtn, false);
    }
  }

  function extractRoundsResponse(data) {
    const rounds =
      data?.rounds ??
      data?.items ??
      data?.rows ??
      (Array.isArray(data) ? data : []);

    const pagination = data?.pagination ?? data?.meta ?? {};

    return {
      rounds: Array.isArray(rounds) ? rounds : [],
      currentPage: toNumber(
        pagination.current_page ??
          pagination.currentPage ??
          pagination.page ??
          data?.current_page ??
          data?.currentPage ??
          state.currentPage,
        1
      ),
      totalPages: Math.max(
        1,
        toNumber(
          pagination.total_pages ??
            pagination.totalPages ??
            data?.total_pages ??
            data?.totalPages ??
            1,
          1
        )
      ),
    };
  }

  function renderRounds(rounds = []) {
    if (!elements.roundsTableBody) return;

    if (!rounds.length) {
      elements.roundsTableBody.innerHTML = `
        <tr>
          <td colspan="10" class="empty-table">
            কোনো round পাওয়া যায়নি।
          </td>
        </tr>
      `;
      return;
    }

    elements.roundsTableBody.innerHTML = rounds
      .map((round) => {
        const roundId = round.id ?? round.round_id;
        const roundCode =
          round.round_code ??
          round.roundCode ??
          `#${roundId}`;

        const status =
          round.round_status ??
          round.status ??
          "unknown";

        const winnerName =
          round.winning_symbol_name_bn ??
          round.winningSymbolNameBn ??
          round.winning_symbol_code ??
          round.winningSymbolCode ??
          "—";

        const totalBetAmount =
          round.total_bet_amount ??
          round.totalBetAmount ??
          0;

        const netPayout =
          round.total_net_payout ??
          round.totalNetPayout ??
          0;

        const serviceCharge =
          round.total_service_charge ??
          round.totalServiceCharge ??
          0;

        const players =
          round.total_players ??
          round.totalPlayers ??
          round.unique_players ??
          0;

        const createdAt =
          round.created_at ??
          round.createdAt ??
          round.betting_started_at;

        return `
          <tr>
            <td>${escapeHtml(roundCode)}</td>

            <td>
              <span class="status-badge ${getStatusClass(status)}">
                ${escapeHtml(status)}
              </span>
            </td>

            <td>${escapeHtml(winnerName)}</td>
            <td>${formatNumber(players)}</td>
            <td>${formatMoney(totalBetAmount)}</td>
            <td>${formatMoney(netPayout)}</td>
            <td>${formatMoney(serviceCharge)}</td>
            <td>${formatDate(createdAt)}</td>

            <td>
              <button
                class="details-button view-round-bets"
                type="button"
                data-round-id="${escapeHtml(roundId)}"
                data-round-code="${escapeHtml(roundCode)}"
              >
                View Bets
              </button>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  function updatePagination() {
    if (elements.pageInformation) {
      elements.pageInformation.textContent =
        `Page ${state.currentPage} of ${state.totalPages}`;
    }

    if (elements.previousPageBtn) {
      elements.previousPageBtn.disabled =
        state.currentPage <= 1;
    }

    if (elements.nextPageBtn) {
      elements.nextPageBtn.disabled =
        state.currentPage >= state.totalPages;
    }
  }

  async function loadRounds(page = 1) {
    state.currentPage = Math.max(1, page);

    const parameters = new URLSearchParams({
      page: String(state.currentPage),
      limit: String(state.roundsLimit),
    });

    if (state.roundsStatus) {
      parameters.set("status", state.roundsStatus);
    }

    if (elements.roundsTableBody) {
      elements.roundsTableBody.innerHTML = `
        <tr>
          <td colspan="10" class="empty-table">
            Loading rounds...
          </td>
        </tr>
      `;
    }

    try {
      const data = await apiRequest(
        `/rounds?${parameters.toString()}`
      );

      const parsed = extractRoundsResponse(data);

      state.currentPage = parsed.currentPage;
      state.totalPages = parsed.totalPages;

      renderRounds(parsed.rounds);
      updatePagination();
    } catch (error) {
      if (elements.roundsTableBody) {
        elements.roundsTableBody.innerHTML = `
          <tr>
            <td colspan="10" class="empty-table">
              ${escapeHtml(error.message)}
            </td>
          </tr>
        `;
      }

      throw error;
    }
  }

  function renderRoundDetails(round = {}) {
    if (!elements.roundDetailGrid) return;

    const status =
      round.round_status ?? round.status ?? "unknown";

    const winner =
      round.winning_symbol_name_bn ??
      round.winningSymbolNameBn ??
      round.winning_symbol_code ??
      "—";

    const details = [
      {
        label: "Round",
        value:
          round.round_code ??
          round.roundCode ??
          round.id ??
          "—",
      },
      {
        label: "Status",
        value: status,
      },
      {
        label: "Winner",
        value: winner,
      },
      {
        label: "Total Bet",
        value: formatMoney(
          round.total_bet_amount ??
            round.totalBetAmount ??
            0
        ),
      },
      {
        label: "Net Payout",
        value: formatMoney(
          round.total_net_payout ??
            round.totalNetPayout ??
            0
        ),
      },
      {
        label: "Service Charge",
        value: formatMoney(
          round.total_service_charge ??
            round.totalServiceCharge ??
            0
        ),
      },
      {
        label: "Players",
        value: formatNumber(
          round.total_players ??
            round.totalPlayers ??
            round.unique_players ??
            0
        ),
      },
      {
        label: "Started",
        value: formatDate(
          round.betting_started_at ??
            round.created_at ??
            round.createdAt
        ),
      },
    ];

    elements.roundDetailGrid.innerHTML = details
      .map(
        (detail) => `
          <div class="detail-item">
            <span class="detail-label">
              ${escapeHtml(detail.label)}
            </span>

            <span class="detail-value">
              ${escapeHtml(detail.value)}
            </span>
          </div>
        `
      )
      .join("");
  }

  function renderRoundBets(bets = []) {
    if (!elements.betsTableBody) return;

    if (!bets.length) {
      elements.betsTableBody.innerHTML = `
        <tr>
          <td colspan="9" class="empty-table">
            এই round-এ কোনো bet পাওয়া যায়নি।
          </td>
        </tr>
      `;
      return;
    }

    elements.betsTableBody.innerHTML = bets
      .map((bet) => {
        const status =
          bet.bet_status ?? bet.status ?? "unknown";

        const user =
          bet.username ??
          bet.user_name ??
          bet.user_id ??
          "—";

        const symbol =
          bet.selected_symbol_name_bn ??
          bet.selectedSymbolNameBn ??
          bet.selected_symbol_code ??
          bet.selectedSymbolCode ??
          "—";

        return `
          <tr>
            <td>${escapeHtml(bet.bet_code ?? bet.id ?? "—")}</td>
            <td>${escapeHtml(user)}</td>
            <td>${escapeHtml(symbol)}</td>

            <td>
              ${escapeHtml(
                bet.locked_multiplier ??
                  bet.multiplier ??
                  "—"
              )}x
            </td>

            <td>${formatMoney(bet.bet_amount)}</td>

            <td>
              <span class="status-badge ${getStatusClass(status)}">
                ${escapeHtml(status)}
              </span>
            </td>

            <td>${formatMoney(bet.net_payout)}</td>
            <td>${formatMoney(bet.service_charge)}</td>

            <td>
              ${formatDate(
                bet.placed_at ??
                  bet.created_at ??
                  bet.createdAt
              )}
            </td>
          </tr>
        `;
      })
      .join("");
  }

  function openModal() {
    if (!elements.betsModal) return;

    elements.betsModal.classList.remove("hidden", "is-hidden");
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    if (!elements.betsModal) return;

    elements.betsModal.classList.add("hidden");
    document.body.style.overflow = "";
  }

  async function viewRoundBets(roundId, roundCode) {
    if (!roundId) return;

    if (elements.betsModalTitle) {
      elements.betsModalTitle.textContent =
        `${roundCode || `Round #${roundId}`} — Bets`;
    }

    if (elements.roundDetailGrid) {
      elements.roundDetailGrid.innerHTML = `
        <div class="detail-item">
          <span class="detail-value">Loading...</span>
        </div>
      `;
    }

    if (elements.betsTableBody) {
      elements.betsTableBody.innerHTML = `
        <tr>
          <td colspan="9" class="empty-table">
            Loading bets...
          </td>
        </tr>
      `;
    }

    openModal();

    try {
      const data = await apiRequest(
        `/rounds/${encodeURIComponent(roundId)}/bets`
      );

      const round =
        data?.round ??
        data?.round_details ??
        data?.roundDetails ??
        {};

      const bets =
        data?.bets ??
        data?.items ??
        data?.rows ??
        [];

      renderRoundDetails(round);
      renderRoundBets(Array.isArray(bets) ? bets : []);
    } catch (error) {
      if (elements.betsTableBody) {
        elements.betsTableBody.innerHTML = `
          <tr>
            <td colspan="9" class="empty-table">
              ${escapeHtml(error.message)}
            </td>
          </tr>
        `;
      }

      showToast(error.message, "error");
    }
  }

  function bindEvents() {
    elements.settingsForm?.addEventListener(
      "submit",
      async (event) => {
        try {
          await saveSettings(event);
        } catch (error) {
          showToast(error.message, "error");
        }
      }
    );

    elements.gameEnabled?.addEventListener(
      "change",
      updateGameStatusText
    );

    elements.saveSymbolsBtn?.addEventListener(
      "click",
      async () => {
        try {
          await saveSymbols();
        } catch (error) {
          showToast(error.message, "error");
        }
      }
    );

    elements.roundStatusFilter?.addEventListener(
      "change",
      async (event) => {
        state.roundsStatus = event.target.value || "";

        try {
          await loadRounds(1);
        } catch (error) {
          showToast(error.message, "error");
        }
      }
    );

    elements.refreshRoundsBtn?.addEventListener(
      "click",
      async () => {
        try {
          await loadRounds(state.currentPage);
          showToast("Rounds refresh হয়েছে।", "success");
        } catch (error) {
          showToast(error.message, "error");
        }
      }
    );

    elements.previousPageBtn?.addEventListener(
      "click",
      async () => {
        if (state.currentPage <= 1) return;

        try {
          await loadRounds(state.currentPage - 1);
        } catch (error) {
          showToast(error.message, "error");
        }
      }
    );

    elements.nextPageBtn?.addEventListener(
      "click",
      async () => {
        if (state.currentPage >= state.totalPages) return;

        try {
          await loadRounds(state.currentPage + 1);
        } catch (error) {
          showToast(error.message, "error");
        }
      }
    );

    elements.roundsTableBody?.addEventListener(
      "click",
      (event) => {
        const button = event.target.closest(".view-round-bets");

        if (!button) return;

        viewRoundBets(
          button.dataset.roundId,
          button.dataset.roundCode
        );
      }
    );

    elements.closeBetsModalBtn?.addEventListener(
      "click",
      closeModal
    );

    elements.betsModal?.addEventListener("click", (event) => {
      if (event.target === elements.betsModal) {
        closeModal();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeModal();
      }
    });

    elements.refreshPageBtn?.addEventListener(
      "click",
      async () => {
        await initializeAdminPage();
      }
    );
  }

  async function initializeAdminPage() {
    setLoading(true);

    try {
      await Promise.all([loadDashboard(), loadRounds(1)]);
    } catch (error) {
      console.error("Bangla Dice admin initialization error:", error);
      showToast(error.message, "error");
    } finally {
      setLoading(false);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    bindEvents();
    initializeAdminPage();
  });
})();