/* ==========================================
   TPL22 LOTTERY
   PLAYER FRONTEND
========================================== */

document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  /* ======================================
       Configuration
    ====================================== */

  const API_TIMEOUT_MS = 15000;

  const TICKET_PAGE_LIMIT = 20;

  const PENDING_PURCHASE_KEY = "pms_lottery_pending_purchase";

  /* ======================================
       DOM Elements
    ====================================== */

  const elements = {
    backBtn: document.getElementById("backBtn"),

    walletBalance: document.getElementById("walletBalance"),

    refreshBalanceBtn: document.getElementById("refreshBalanceBtn"),

    activeDrawCount: document.getElementById("activeDrawCount"),

    myActiveTicketCount: document.getElementById("myActiveTicketCount"),

    recentWinnerCount: document.getElementById("recentWinnerCount"),

    refreshDrawsBtn: document.getElementById("refreshDrawsBtn"),

    refreshTicketsBtn: document.getElementById("refreshTicketsBtn"),

    priceFilter: document.getElementById("priceFilter"),

    drawGrid: document.getElementById("drawGrid"),

    myTicketGrid: document.getElementById("myTicketGrid"),

    loadMoreTicketsBtn: document.getElementById("loadMoreTicketsBtn"),

    winnerList: document.getElementById("winnerList"),

    purchaseModal: document.getElementById("purchaseModal"),

    closePurchaseModalBtn: document.getElementById("closePurchaseModalBtn"),

    purchaseDrawTitle: document.getElementById("purchaseDrawTitle"),

    purchaseTicketPrice: document.getElementById("purchaseTicketPrice"),

    purchaseRemainingTickets: document.getElementById(
      "purchaseRemainingTickets",
    ),

    ticketQuantity: document.getElementById("ticketQuantity"),

    decreaseQuantityBtn: document.getElementById("decreaseQuantityBtn"),

    increaseQuantityBtn: document.getElementById("increaseQuantityBtn"),

    purchaseTotalAmount: document.getElementById("purchaseTotalAmount"),

    confirmPurchaseBtn: document.getElementById("confirmPurchaseBtn"),

    cancelTicketModal: document.getElementById("cancelTicketModal"),

    closeCancelModalBtn: document.getElementById("closeCancelModalBtn"),

    cancelTicketCode: document.getElementById("cancelTicketCode"),

    cancelTicketPrice: document.getElementById("cancelTicketPrice"),

    cancelFeeAmount: document.getElementById("cancelFeeAmount"),

    cancelRefundAmount: document.getElementById("cancelRefundAmount"),

    confirmCancelTicketBtn: document.getElementById("confirmCancelTicketBtn"),
          lotteryDrawAnimationOverlay:
        document.getElementById(
          "lotteryDrawAnimationOverlay",
        ),

      drawAnimationTitle:
        document.getElementById(
          "drawAnimationTitle",
        ),

      drawAnimationCode:
        document.getElementById(
          "drawAnimationCode",
        ),

      drawShuffleStage:
        document.getElementById(
          "drawShuffleStage",
        ),

      drawShuffleTrack:
        document.getElementById(
          "drawShuffleTrack",
        ),

      drawAnimationStatus:
        document.getElementById(
          "drawAnimationStatus",
        ),

      drawWinnerRevealStage:
        document.getElementById(
          "drawWinnerRevealStage",
        ),

      drawWinnerRevealGrid:
        document.getElementById(
          "drawWinnerRevealGrid",
        ),

      personalWinnerNotice:
        document.getElementById(
          "personalWinnerNotice",
        ),

      personalWinnerTitle:
        document.getElementById(
          "personalWinnerTitle",
        ),

      personalWinnerMessage:
        document.getElementById(
          "personalWinnerMessage",
        ),

      personalWinnerPrize:
        document.getElementById(
          "personalWinnerPrize",
        ),

      personalWinnerTicket:
        document.getElementById(
          "personalWinnerTicket",
        ),

      closeDrawAnimationBtn:
        document.getElementById(
          "closeDrawAnimationBtn",
        ),

    loaderOverlay: document.getElementById("loaderOverlay"),

    loaderMessage: document.getElementById("loaderMessage"),

    toast: document.getElementById("toast"),

    toastIcon: document.getElementById("toastIcon"),

    toastMessage: document.getElementById("toastMessage"),
  };

  /* ======================================
       State
    ====================================== */

  const state = {
    user: null,

    draws: [],

    tickets: [],

    winners: [],

    ticketPage: 1,

    ticketTotalPages: 1,

    selectedPrice: "all",

    selectedDraw: null,

    selectedTicket: null,

    isLoadingDraws: false,

    isLoadingTickets: false,

    isLoadingWinners: false,

    isPurchasing: false,

    isCancelling: false,

    countdownTimer: null,

    toastTimer: null,
          socket:
        null,

      socketConnected:
        false,

      activeDrawEvent:
        null,

      completedDrawEvent:
        null,

              notifications:
        [],

      unreadNotificationCount:
        0,

      isLoadingNotifications:
        false,

      activeNotificationDrawId:
        null,

      winnerNotification:
        null,

              drawAnimationStartedAt:
        0,

      drawAnimationTimer:
        null,

      winnerRevealTimers:
        [],

      drawAnimationRunning:
        false,

      completedAnimationDrawId:
        null,
  };

  /* ======================================
       Storage and Authentication
    ====================================== */

  function getAccessToken() {
    return localStorage.getItem("access_token");
  }

  function getStoredUser() {
    const storedUser = localStorage.getItem("current_user");

    if (!storedUser) {
      return null;
    }

    try {
      return JSON.parse(storedUser);
    } catch (error) {
      console.error("Invalid stored user:", error);

      localStorage.removeItem("current_user");

      return null;
    }
  }

  function saveCurrentUser(user) {
    localStorage.setItem("current_user", JSON.stringify(user));
  }

  function redirectToLogin() {
    localStorage.removeItem("access_token");

    localStorage.removeItem("current_user");

    window.location.replace("/login");
  }

  function initializeUser() {
    const token = getAccessToken();

    const user = getStoredUser();

    if (!token || !user) {
      redirectToLogin();

      return false;
    }

    state.user = user;

    return true;
  }

  /* ======================================
       Formatting Helpers
    ====================================== */

  function toValidAmount(value) {
    const amount = Number(value);

    if (!Number.isFinite(amount) || amount < 0) {
      return 0;
    }

    return amount;
  }

  function formatMoney(value) {
    return toValidAmount(value).toLocaleString("en-BD", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function getWalletBalance() {
    return toValidAmount(
      state.user?.walletBalance ?? state.user?.wallet_balance,
    );
  }

  function escapeHtml(value) {
    const element = document.createElement("div");

    element.textContent = String(value ?? "");

    return element.innerHTML;
  }

  function normalizeStatusClass(status) {
    return String(status || "")
      .trim()
      .toLowerCase()
      .replace(/_/g, "-")
      .replace(/[^a-z0-9-]/g, "");
  }

  function getStatusLabel(status) {
    const labels = {
      selling: "Selling",

      paused: "Paused",

      sold_out: "Sold Out",

      countdown: "Countdown",

      ready_to_draw: "Ready to Draw",

      drawing: "Drawing",

      completed: "Completed",

      active: "Active",

      locked: "Locked",

      cancelled: "Cancelled",

      admin_refunded: "Admin Refunded",

      winner: "Winner",

      non_winner: "Not Winner",
    };

    return labels[String(status || "")] || String(status || "-");
  }

  function formatCountdown(seconds) {
    const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));

    const hours = Math.floor(safeSeconds / 3600);

    const minutes = Math.floor((safeSeconds % 3600) / 60);

    const remainingSeconds = safeSeconds % 60;

    return [hours, minutes, remainingSeconds]
      .map((value) => String(value).padStart(2, "0"))
      .join(":");
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
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

  function createRequestKey() {
    const browserCrypto = window.crypto || null;

    if (browserCrypto && typeof browserCrypto.randomUUID === "function") {
      return browserCrypto.randomUUID();
    }

    if (browserCrypto && typeof browserCrypto.getRandomValues === "function") {
      const randomPart = browserCrypto
        .getRandomValues(new Uint32Array(4))
        .join("-");

      return ["lottery", Date.now(), randomPart].join("-");
    }

    return ["lottery", Date.now(), Math.random().toString(36).slice(2)].join(
      "-",
    );
  }

  /* ======================================
       Pending Purchase Protection
    ====================================== */

  function readPendingPurchase() {
    const storedValue = localStorage.getItem(PENDING_PURCHASE_KEY);

    if (!storedValue) {
      return null;
    }

    try {
      const pending = JSON.parse(storedValue);

      if (
        !pending ||
        !pending.requestKey ||
        !Number.isInteger(Number(pending.drawId)) ||
        !Number.isInteger(Number(pending.quantity))
      ) {
        throw new Error("Invalid pending purchase");
      }

      return pending;
    } catch (_error) {
      localStorage.removeItem(PENDING_PURCHASE_KEY);

      return null;
    }
  }

  function getPurchaseRequestKey(drawId, quantity) {
    const existing = readPendingPurchase();

    if (
      existing &&
      Number(existing.drawId) === Number(drawId) &&
      Number(existing.quantity) === Number(quantity)
    ) {
      return existing.requestKey;
    }

    const pending = {
      drawId: Number(drawId),

      quantity: Number(quantity),

      requestKey: createRequestKey(),

      createdAt: new Date().toISOString(),
    };

    localStorage.setItem(PENDING_PURCHASE_KEY, JSON.stringify(pending));

    return pending.requestKey;
  }

  function clearPendingPurchase() {
    localStorage.removeItem(PENDING_PURCHASE_KEY);
  }

  /* ======================================
       UI Helpers
    ====================================== */

  function updateBalanceUI() {
    elements.walletBalance.textContent = formatMoney(getWalletBalance());
  }

  function showLoader(message = "Please wait...") {
    elements.loaderMessage.textContent = message;

    elements.loaderOverlay.classList.add("is-visible");

    elements.loaderOverlay.setAttribute("aria-hidden", "false");
  }

  function hideLoader() {
    elements.loaderOverlay.classList.remove("is-visible");

    elements.loaderOverlay.setAttribute("aria-hidden", "true");
  }

  function showToast(message, type = "info") {
    if (state.toastTimer) {
      window.clearTimeout(state.toastTimer);
    }

    elements.toast.classList.remove("is-visible", "is-success", "is-error");

    elements.toastMessage.textContent = String(message || "");

    if (type === "success") {
      elements.toast.classList.add("is-success");

      elements.toastIcon.className = "fa-solid fa-circle-check";
    } else if (type === "error") {
      elements.toast.classList.add("is-error");

      elements.toastIcon.className = "fa-solid fa-circle-exclamation";
    } else {
      elements.toastIcon.className = "fa-solid fa-circle-info";
    }

    window.requestAnimationFrame(() => {
      elements.toast.classList.add("is-visible");
    });

    state.toastTimer = window.setTimeout(() => {
      elements.toast.classList.remove("is-visible");
    }, 3200);
  }

  function setButtonLoading(button, isLoading) {
    if (!button) {
      return;
    }

    button.disabled = isLoading;

    button.classList.toggle("is-loading", isLoading);
  }

  function setModalVisible(modal, isVisible) {
    if (!modal) {
      return;
    }

    modal.classList.toggle("is-visible", isVisible);

    modal.setAttribute("aria-hidden", String(!isVisible));

    document.body.style.overflow = isVisible ? "hidden" : "";
  }

  /* ======================================
       API Helper
    ====================================== */

  async function apiRequest(endpoint, options = {}) {
    const controller = new AbortController();

    const timeoutId = window.setTimeout(() => {
      controller.abort();
    }, API_TIMEOUT_MS);

    try {
      const token = getAccessToken();

      const response = await fetch(APP_CONFIG.api(endpoint), {
        ...options,

        headers: {
          Accept: "application/json",

          ...(options.body
            ? {
                "Content-Type": "application/json",
              }
            : {}),

          Authorization: `Bearer ${token}`,

          ...(options.headers || {}),
        },

        signal: controller.signal,
      });

      let result = null;

      try {
        result = await response.json();
      } catch (_error) {
        result = null;
      }

      if (response.status === 401) {
        redirectToLogin();

        throw new Error("Session expired");
      }

      if (!response.ok) {
        const error = new Error(result?.message || "Request failed.");

        error.status = response.status;

        error.code = result?.code || "REQUEST_FAILED";

        throw error;
      }

      return result;
    } catch (error) {
      if (error.name === "AbortError") {
        const timeoutError = new Error(
          "Server response timeout. Please try again.",
        );

        timeoutError.code = "REQUEST_TIMEOUT";

        throw timeoutError;
      }

      throw error;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  /* ======================================
       Latest Wallet
    ====================================== */

  async function loadLatestUserData({ showFeedback = false } = {}) {
    setButtonLoading(elements.refreshBalanceBtn, true);

    try {
      const result = await apiRequest("/auth/me");

      const user = result?.data?.user;

      if (!user) {
        throw new Error("Account information was not found.");
      }

      state.user = user;

      saveCurrentUser(user);

      updateBalanceUI();

      if (showFeedback) {
        showToast("Wallet balance updated.", "success");
      }
    } catch (error) {
      console.error("Lottery wallet error:", error);

      if (showFeedback) {
        showToast(error.message, "error");
      }
    } finally {
      setButtonLoading(elements.refreshBalanceBtn, false);
    }
  }

  /* ======================================
       LP1C PART 1 END
       Continue in the same function.
    ====================================== */
  /* ======================================
       Draw Helpers
    ====================================== */

  function prepareDraw(draw) {
    const remainingSeconds = Math.max(0, Number(draw?.remainingSeconds || 0));

    return {
      ...draw,

      drawId: Number(draw?.drawId),

      ticketPrice: toValidAmount(draw?.ticketPrice),

      activeTicketCount: Number(draw?.activeTicketCount || 0),

      targetTicketQuantity: Number(draw?.targetTicketQuantity || 0),

      remainingTicketCount: Number(draw?.remainingTicketCount || 0),

      maxTicketsPerUser: Number(draw?.maxTicketsPerUser || 0),

      myTicketCount: Number(draw?.myTicketCount || 0),

      progressPercent: Math.min(
        100,
        Math.max(0, Number(draw?.progressPercent || 0)),
      ),

      remainingSeconds,

      countdownDeadline:
        remainingSeconds > 0 ? Date.now() + remainingSeconds * 1000 : null,
    };
  }

  function getDrawRemainingSeconds(draw) {
    if (!draw?.countdownDeadline) {
      return Math.max(0, Number(draw?.remainingSeconds || 0));
    }

    return Math.max(0, Math.ceil((draw.countdownDeadline - Date.now()) / 1000));
  }

  function getFilteredDraws() {
    if (state.selectedPrice === "all") {
      return state.draws;
    }

    const selectedPrice = Number(state.selectedPrice);

    return state.draws.filter(
      (draw) => Number(draw.ticketPrice) === selectedPrice,
    );
  }

  function getDrawById(drawId) {
    return (
      state.draws.find((draw) => Number(draw.drawId) === Number(drawId)) || null
    );
  }

  function getTicketById(ticketId) {
    return (
      state.tickets.find(
        (ticket) => Number(ticket.ticketId) === Number(ticketId),
      ) || null
    );
  }

  /* ======================================
       Summary Rendering
    ====================================== */

  function renderSummary() {
    const activeDrawStatuses = new Set([
      "selling",
      "paused",
      "sold_out",
      "countdown",
      "ready_to_draw",
      "drawing",
    ]);

    const activeDrawCount = state.draws.filter((draw) =>
      activeDrawStatuses.has(String(draw.status)),
    ).length;

    const activeTicketCount = state.tickets.filter((ticket) =>
      ["active", "locked"].includes(String(ticket.status)),
    ).length;

    elements.activeDrawCount.textContent = String(activeDrawCount);

    elements.myActiveTicketCount.textContent = String(activeTicketCount);

    elements.recentWinnerCount.textContent = String(state.winners.length);
  }

  /* ======================================
       Draw Rendering
    ====================================== */

  function createPrizeMarkup(prize, iconClass, label) {
    return `
        <article>

          <i class="${iconClass}"></i>

          <span>
            ${escapeHtml(label)}
            ${toValidAmount(prize?.percent)}%
          </span>

          <strong>
            ৳${formatMoney(prize?.amount)}
          </strong>

        </article>
      `;
  }

  function createCountdownMarkup(draw) {
    const status = String(draw.status || "");

    if (
      !["sold_out", "countdown", "ready_to_draw", "drawing"].includes(status)
    ) {
      return "";
    }

    const remainingSeconds = getDrawRemainingSeconds(draw);

    const isReady = remainingSeconds <= 0;

    const label =
      status === "drawing"
        ? "Fair shuffle running"
        : isReady
          ? "Waiting for admin draw"
          : "Draw countdown";

    const value =
      status === "drawing"
        ? "SHUFFLING"
        : isReady
          ? "READY"
          : formatCountdown(remainingSeconds);

    return `
        <div
          class="draw-countdown ${isReady ? "is-ready" : ""}"
          data-countdown-draw-id="${draw.drawId}"
        >

          <span>
            ${escapeHtml(label)}
          </span>

          <strong
            data-countdown-value>
            ${escapeHtml(value)}
          </strong>

        </div>
      `;
  }

  function createDrawCard(draw) {
    const status = String(draw.status || "");

    const statusClass = normalizeStatusClass(status);

    const prizeDistribution = draw.prizeDistribution || {};

    const hasEnoughBalance = getWalletBalance() >= draw.ticketPrice;

    const canBuy =
      Boolean(draw.canBuy) && draw.remainingTicketCount > 0 && hasEnoughBalance;

    let buttonText = "Buy Ticket";

    let buttonIcon = "fa-solid fa-ticket";

    if (status !== "selling") {
      buttonText = getStatusLabel(status);

      buttonIcon = "fa-solid fa-lock";
    } else if (!hasEnoughBalance) {
      buttonText = "Low Balance";

      buttonIcon = "fa-solid fa-wallet";
    } else if (draw.remainingTicketCount < 1) {
      buttonText = "Sold Out";

      buttonIcon = "fa-solid fa-lock";
    }

    const card = document.createElement("article");

    card.className = [
      "lottery-draw-card",

      status === "countdown" ? "is-countdown" : "",

      status === "completed" ? "is-completed" : "",
    ]
      .filter(Boolean)
      .join(" ");

    card.innerHTML = `
        <div class="draw-card-header">

          <div>

            <h3>
              ${escapeHtml(draw.title || "PMS Lucky Draw")}
            </h3>

            <p>
              ${escapeHtml(draw.drawCode || "-")}
            </p>

          </div>

          <span
            class="draw-status is-${statusClass}">
            ${escapeHtml(getStatusLabel(status))}
          </span>

        </div>

        <div class="draw-ticket-visual">

          <div class="draw-ticket-copy">

            <small>
              TPL22 LOTTERY
            </small>

            <strong>
              ${escapeHtml(draw.drawCode || "LUCKY-DRAW")}
            </strong>

            <span>
              Lifetime unique ticket number
            </span>

          </div>

          <div class="draw-ticket-price">
            ৳${formatMoney(draw.ticketPrice).replace(".00", "")}
          </div>

        </div>

        <div class="draw-progress">

          <div class="draw-progress-copy">

            <span>
              Ticket Sales
            </span>

            <strong>
              ${draw.activeTicketCount} /
              ${draw.targetTicketQuantity}
            </strong>

          </div>

          <div class="draw-progress-track">

            <div
              class="draw-progress-bar"
              style="width: ${draw.progressPercent}%">
            </div>

          </div>

        </div>

        <div class="draw-stat-grid">

          <div>

            <span>Remaining</span>

            <strong>
              ${draw.remainingTicketCount}
            </strong>

          </div>

          <div>

            <span>My Tickets</span>

            <strong>
              ${draw.myTicketCount}
            </strong>

          </div>

          <div>

            <span>Max Per User</span>

            <strong>
              ${draw.maxTicketsPerUser}
            </strong>

          </div>

        </div>

        <div class="draw-prize-grid">

          ${createPrizeMarkup(
            prizeDistribution.first,
            "fa-solid fa-crown",
            "1st",
          )}

          ${createPrizeMarkup(
            prizeDistribution.second,
            "fa-solid fa-medal",
            "2nd",
          )}

          ${createPrizeMarkup(
            prizeDistribution.third,
            "fa-solid fa-award",
            "3rd",
          )}

        </div>

        ${createCountdownMarkup(draw)}

        <button
          type="button"
          class="buy-ticket-button"
          data-buy-draw-id="${draw.drawId}"
          ${canBuy ? "" : "disabled"}
        >

          <i class="${buttonIcon}"></i>

          <span>
            ${escapeHtml(buttonText)}
          </span>

        </button>
      `;

    return card;
  }

  function renderDraws() {
    const draws = getFilteredDraws();

    if (state.isLoadingDraws) {
      elements.drawGrid.innerHTML = `
            <div class="lottery-empty-state">

              <i class="fa-solid fa-spinner fa-spin"></i>

              <h3>
                Loading Lottery Draws
              </h3>

              <p>
                Please wait...
              </p>

            </div>
          `;

      return;
    }

    if (!draws.length) {
      elements.drawGrid.innerHTML = `
            <div class="lottery-empty-state">

              <i class="fa-solid fa-ticket"></i>

              <h3>
                No Lottery Draw Available
              </h3>

              <p>
                এই ticket price-এর কোনো active draw নেই।
              </p>

            </div>
          `;

      return;
    }

    const fragment = document.createDocumentFragment();

    draws.forEach((draw) => {
      fragment.appendChild(createDrawCard(draw));
    });

    elements.drawGrid.replaceChildren(fragment);
  }

  /* ======================================
       Ticket Rendering
    ====================================== */

  function getTicketResultNote(ticket) {
    const status = String(ticket.status || "");

    if (status === "winner") {
      return `
          <p class="ticket-result-note">
            <i class="fa-solid fa-trophy"></i>
            Rank ${Number(ticket.winnerRank) || "-"} winner —
            Prize ৳${formatMoney(ticket.prizeAmount)}
          </p>
        `;
    }

    if (["cancelled", "admin_refunded"].includes(status)) {
      return `
          <p class="ticket-result-note">
            Refund ৳${formatMoney(ticket.refundAmount)}
            ${
              toValidAmount(ticket.cancellationFeeAmount) > 0
                ? `• Fee ৳${formatMoney(ticket.cancellationFeeAmount)}`
                : ""
            }
          </p>
        `;
    }

    if (status === "non_winner") {
      return `
          <p class="ticket-result-note">
            This ticket did not win this draw.
          </p>
        `;
    }

    return "";
  }

  function createTicketCard(ticket) {
    const status = String(ticket.status || "");

    const statusClass = normalizeStatusClass(status);

    const canCancel = Boolean(ticket.canCancel);

    const card = document.createElement("article");

    card.className = "my-ticket-card";

    card.innerHTML = `
        <div
          class="ticket-paper is-${statusClass}">

          <div>

            <span class="ticket-brand">
              TPL22 LOTTERY
            </span>

            <div class="ticket-number">
              ${escapeHtml(ticket.ticketCode || "-")}
            </div>

            <div class="ticket-draw-code">
              ${escapeHtml(ticket.drawCode || ticket.drawTitle || "-")}
            </div>

          </div>

          <div class="ticket-price-block">

            <span>
              TICKET
            </span>

            <strong>
              ৳${formatMoney(ticket.ticketPrice).replace(".00", "")}
            </strong>

          </div>

        </div>

        <div class="ticket-card-footer">

          <span
            class="ticket-status is-${statusClass}">

            ${escapeHtml(getStatusLabel(status))}

          </span>

          ${
            canCancel
              ? `
                <button
                  type="button"
                  class="cancel-ticket-button"
                  data-cancel-ticket-id="${ticket.ticketId}"
                >
                  <i class="fa-solid fa-ban"></i>
                  Cancel Ticket
                </button>
              `
              : `
                <span class="ticket-purchase-date">
                  ${escapeHtml(formatDate(ticket.purchasedAt))}
                </span>
              `
          }

        </div>

        ${getTicketResultNote(ticket)}
      `;

    return card;
  }

  function renderTickets() {
    if (state.isLoadingTickets && state.ticketPage === 1) {
      elements.myTicketGrid.innerHTML = `
            <div class="lottery-empty-state">

              <i class="fa-solid fa-spinner fa-spin"></i>

              <h3>
                Loading Your Tickets
              </h3>

              <p>
                Please wait...
              </p>

            </div>
          `;

      elements.loadMoreTicketsBtn.hidden = true;

      return;
    }

    if (!state.tickets.length) {
      elements.myTicketGrid.innerHTML = `
            <div class="lottery-empty-state">

              <i class="fa-solid fa-ticket"></i>

              <h3>
                No Lottery Ticket Yet
              </h3>

              <p>
                Available draw থেকে আপনার প্রথম ticket কিনুন।
              </p>

            </div>
          `;

      elements.loadMoreTicketsBtn.hidden = true;

      return;
    }

    const fragment = document.createDocumentFragment();

    state.tickets.forEach((ticket) => {
      fragment.appendChild(createTicketCard(ticket));
    });

    elements.myTicketGrid.replaceChildren(fragment);

    elements.loadMoreTicketsBtn.hidden =
      state.ticketPage >= state.ticketTotalPages;

    elements.loadMoreTicketsBtn.disabled = state.isLoadingTickets;
  }

  /* ======================================
       Winner Rendering
    ====================================== */

  function getWinnerRankIcon(rank) {
    if (Number(rank) === 1) {
      return "fa-solid fa-crown";
    }

    if (Number(rank) === 2) {
      return "fa-solid fa-medal";
    }

    return "fa-solid fa-award";
  }

  function renderWinners() {
    if (state.isLoadingWinners) {
      elements.winnerList.innerHTML = `
            <div class="lottery-empty-state">

              <i class="fa-solid fa-spinner fa-spin"></i>

              <h3>
                Loading Winners
              </h3>

            </div>
          `;

      return;
    }

    if (!state.winners.length) {
      elements.winnerList.innerHTML = `
            <div class="lottery-empty-state">

              <i class="fa-solid fa-trophy"></i>

              <h3>
                No Winner Yet
              </h3>

              <p>
                Completed draw-এর winner এখানে দেখা যাবে।
              </p>

            </div>
          `;

      return;
    }

    const fragment = document.createDocumentFragment();

    state.winners.forEach((winner) => {
      const row = document.createElement("article");

      row.className = "winner-row";

      row.innerHTML = `
            <span class="winner-rank">

              <i class="${getWinnerRankIcon(winner.prizeRank)}"></i>

            </span>

            <div class="winner-info">

              <strong>
                ${escapeHtml(winner.winnerName || "PMS Player")}
              </strong>

              <span>
                UID:
                ${escapeHtml(winner.winnerUid || "-")}
                •
                ${escapeHtml(winner.ticketCode || "-")}
              </span>

            </div>

            <strong class="winner-prize">
              ৳${formatMoney(winner.prizeAmount)}
            </strong>

                        <p class="winner-wishing-message">
              ${escapeHtml(
                winner.winnerMessage ||
                  "Congratulations on your Lottery win!",
              )}
            </p>
          `;

      fragment.appendChild(row);
    });

    elements.winnerList.replaceChildren(fragment);
  }

  /* ======================================
       Countdown UI
    ====================================== */

  function refreshCountdownUI() {
    state.draws.forEach((draw) => {
      const countdown = document.querySelector(
        `[data-countdown-draw-id="${draw.drawId}"]`,
      );

      if (!countdown) {
        return;
      }

      const valueElement = countdown.querySelector("[data-countdown-value]");

      if (!valueElement) {
        return;
      }

      if (String(draw.status) === "drawing") {
        valueElement.textContent = "SHUFFLING";

        return;
      }

      const remainingSeconds = getDrawRemainingSeconds(draw);

      if (remainingSeconds <= 0) {
        countdown.classList.add("is-ready");

        valueElement.textContent = "READY";

        return;
      }

      countdown.classList.remove("is-ready");

      valueElement.textContent = formatCountdown(remainingSeconds);
    });
  }

  function startCountdownTimer() {
    if (state.countdownTimer) {
      window.clearInterval(state.countdownTimer);
    }

    state.countdownTimer = window.setInterval(refreshCountdownUI, 1000);
  }

  /* ======================================
       LP1C PART 2 END
       Continue in the same function.
    ====================================== */

  /* ======================================
       Draw API
    ====================================== */

  async function loadDraws({ showFeedback = false } = {}) {
    state.isLoadingDraws = true;

    setButtonLoading(elements.refreshDrawsBtn, true);

    renderDraws();

    try {
      const result = await apiRequest("/lottery/draws");

      const draws = Array.isArray(result?.data?.draws) ? result.data.draws : [];

      state.draws = draws
        .map(prepareDraw)
        .filter((draw) => Number.isInteger(draw.drawId) && draw.drawId > 0);

      if (showFeedback) {
        showToast("Lottery draws updated.", "success");
      }
    } catch (error) {
      console.error("Load lottery draws error:", error);

      state.draws = [];

      showToast(error.message || "Unable to load lottery draws.", "error");
    } finally {
      state.isLoadingDraws = false;

      setButtonLoading(elements.refreshDrawsBtn, false);

      renderDraws();

      renderSummary();

      refreshCountdownUI();
    }
  }

  /* ======================================
       Ticket API
    ====================================== */

  async function loadTickets({
    page = 1,
    append = false,
    showFeedback = false,
  } = {}) {
    if (state.isLoadingTickets) {
      return;
    }

    state.isLoadingTickets = true;

    state.ticketPage = Number(page) || 1;

    setButtonLoading(elements.refreshTicketsBtn, true);

    elements.loadMoreTicketsBtn.disabled = true;

    if (!append) {
      renderTickets();
    }

    try {
      const result = await apiRequest(
        `/lottery/my-tickets?page=${state.ticketPage}&limit=${TICKET_PAGE_LIMIT}`,
      );

      const newTickets = Array.isArray(result?.data?.tickets)
        ? result.data.tickets
        : [];

      const pagination = result?.data?.pagination || {};

      if (append) {
        const ticketMap = new Map(
          state.tickets.map((ticket) => [Number(ticket.ticketId), ticket]),
        );

        newTickets.forEach((ticket) => {
          ticketMap.set(Number(ticket.ticketId), ticket);
        });

        state.tickets = Array.from(ticketMap.values());
      } else {
        state.tickets = newTickets;
      }

      state.ticketPage = Number(pagination.page || state.ticketPage);

      state.ticketTotalPages = Math.max(1, Number(pagination.totalPages || 1));

      if (showFeedback) {
        showToast("Lottery tickets updated.", "success");
      }
    } catch (error) {
      console.error("Load lottery tickets error:", error);

      if (!append) {
        state.tickets = [];
      }

      showToast(error.message || "Unable to load lottery tickets.", "error");
    } finally {
      state.isLoadingTickets = false;

      setButtonLoading(elements.refreshTicketsBtn, false);

      renderTickets();

      renderSummary();
    }
  }

  /* ======================================
       Winner API
    ====================================== */

  async function loadWinners() {
    state.isLoadingWinners = true;

    renderWinners();

    try {
      const result = await apiRequest("/lottery/winners/recent?limit=20");

      state.winners = Array.isArray(result?.data?.winners)
        ? result.data.winners
        : [];
    } catch (error) {
      console.error("Load lottery winners error:", error);

      state.winners = [];
    } finally {
      state.isLoadingWinners = false;

      renderWinners();

      renderSummary();
    }
  }

  /* ======================================
       Purchase Modal
    ====================================== */

  function getMaximumPurchaseQuantity(draw) {
    if (!draw) {
      return 0;
    }

    const userRemaining = Math.max(
      0,
      Number(draw.maxTicketsPerUser) - Number(draw.myTicketCount),
    );

    return Math.max(
      0,
      Math.min(10, Number(draw.remainingTicketCount), userRemaining),
    );
  }

  function updatePurchaseSummary() {
    const draw = state.selectedDraw;

    if (!draw) {
      return;
    }

    const maximumQuantity = getMaximumPurchaseQuantity(draw);

    let quantity = Number.parseInt(elements.ticketQuantity.value, 10);

    if (!Number.isInteger(quantity)) {
      quantity = 1;
    }

    quantity = Math.min(maximumQuantity, Math.max(1, quantity));

    elements.ticketQuantity.value = String(quantity);

    elements.ticketQuantity.max = String(maximumQuantity);

    elements.purchaseTotalAmount.textContent = formatMoney(
      draw.ticketPrice * quantity,
    );

    elements.decreaseQuantityBtn.disabled = quantity <= 1;

    elements.increaseQuantityBtn.disabled = quantity >= maximumQuantity;

    elements.confirmPurchaseBtn.disabled =
      maximumQuantity < 1 || state.isPurchasing;
  }

  function openPurchaseModal(draw) {
    if (!draw || !draw.canBuy || String(draw.status) !== "selling") {
      showToast("এই draw-এর ticket এখন কেনা যাবে না।", "error");

      return;
    }

    const maximumQuantity = getMaximumPurchaseQuantity(draw);

    if (maximumQuantity < 1) {
      showToast("আপনার ticket limit অথবা available ticket শেষ হয়েছে।", "error");

      return;
    }

    if (getWalletBalance() < draw.ticketPrice) {
      showToast(
        `Minimum ৳${formatMoney(draw.ticketPrice)} balance required.`,
        "error",
      );

      return;
    }

    state.selectedDraw = draw;

    elements.purchaseDrawTitle.textContent =
      draw.title || draw.drawCode || "PMS Lucky Draw";

    elements.purchaseTicketPrice.textContent = formatMoney(draw.ticketPrice);

    elements.purchaseRemainingTickets.textContent = String(
      draw.remainingTicketCount,
    );

    elements.ticketQuantity.value = "1";

    updatePurchaseSummary();

    setModalVisible(elements.purchaseModal, true);
  }

  function closePurchaseModal() {
    if (state.isPurchasing) {
      return;
    }

    setModalVisible(elements.purchaseModal, false);

    state.selectedDraw = null;
  }

  async function confirmPurchase() {
    const draw = state.selectedDraw;

    if (!draw || state.isPurchasing) {
      return;
    }

    updatePurchaseSummary();

    const quantity = Number.parseInt(elements.ticketQuantity.value, 10);

    const maximumQuantity = getMaximumPurchaseQuantity(draw);

    if (
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > maximumQuantity
    ) {
      showToast("Valid ticket quantity নির্বাচন করুন।", "error");

      return;
    }

    const totalAmount = draw.ticketPrice * quantity;

    if (getWalletBalance() < totalAmount) {
      showToast(
        `Minimum ৳${formatMoney(totalAmount)} balance required.`,
        "error",
      );

      return;
    }

    const requestKey = getPurchaseRequestKey(draw.drawId, quantity);

    state.isPurchasing = true;

    elements.confirmPurchaseBtn.disabled = true;

    showLoader(`Buying ${quantity} lottery ticket(s)...`);

    try {
      const result = await apiRequest(`/lottery/draws/${draw.drawId}/tickets`, {
        method: "POST",

        body: JSON.stringify({
          quantity,
          requestKey,
        }),
      });

      clearPendingPurchase();

      const walletBalance = Number(result?.data?.walletBalance);

      if (Number.isFinite(walletBalance)) {
        state.user = {
          ...(state.user || {}),

          walletBalance,
        };

        saveCurrentUser(state.user);

        updateBalanceUI();
      }

      setModalVisible(elements.purchaseModal, false);

      state.selectedDraw = null;

      const ticketCount = Array.isArray(result?.data?.tickets)
        ? result.data.tickets.length
        : quantity;

      showToast(
        `${ticketCount} lottery ticket purchased successfully.`,
        "success",
      );

      await Promise.all([
        loadLatestUserData(),
        loadDraws(),
        loadTickets({
          page: 1,
        }),
      ]);
    } catch (error) {
      console.error("Lottery purchase error:", error);

      showToast(error.message || "Lottery purchase failed.", "error");
    } finally {
      state.isPurchasing = false;

      elements.confirmPurchaseBtn.disabled = false;

      hideLoader();

      if (state.selectedDraw) {
        updatePurchaseSummary();
      }
    }
  }

  /* ======================================
       Cancel Modal
    ====================================== */

  function openCancelModal(ticket) {
    if (!ticket || !ticket.canCancel) {
      showToast("এই ticket cancel করা যাবে না।", "error");

      return;
    }

    const draw = getDrawById(ticket.drawId);

    const feePercent = toValidAmount(draw?.cancellationFeePercent || 20);

    const ticketPrice = toValidAmount(ticket.ticketPrice);

    const feeAmount = Number(((ticketPrice * feePercent) / 100).toFixed(2));

    const refundAmount = Number((ticketPrice - feeAmount).toFixed(2));

    state.selectedTicket = ticket;

    elements.cancelTicketCode.textContent = ticket.ticketCode || "-";

    elements.cancelTicketPrice.textContent = formatMoney(ticketPrice);

    elements.cancelFeeAmount.textContent = formatMoney(feeAmount);

    elements.cancelRefundAmount.textContent = formatMoney(refundAmount);

    setModalVisible(elements.cancelTicketModal, true);
  }

  function closeCancelModal() {
    if (state.isCancelling) {
      return;
    }

    setModalVisible(elements.cancelTicketModal, false);

    state.selectedTicket = null;
  }

  async function confirmTicketCancellation() {
    const ticket = state.selectedTicket;

    if (!ticket || state.isCancelling) {
      return;
    }

    state.isCancelling = true;

    elements.confirmCancelTicketBtn.disabled = true;

    showLoader("Cancelling ticket and processing refund...");

    try {
      const result = await apiRequest(
        `/lottery/tickets/${ticket.ticketId}/cancel`,
        {
          method: "POST",
        },
      );

      const walletBalance = Number(result?.data?.walletBalance);

      if (Number.isFinite(walletBalance)) {
        state.user = {
          ...(state.user || {}),

          walletBalance,
        };

        saveCurrentUser(state.user);

        updateBalanceUI();
      }

      setModalVisible(elements.cancelTicketModal, false);

      state.selectedTicket = null;

      showToast(
        `Ticket cancelled. ৳${formatMoney(
          result?.data?.refundAmount,
        )} refunded.`,
        "success",
      );

      await Promise.all([
        loadLatestUserData(),
        loadDraws(),
        loadTickets({
          page: 1,
        }),
      ]);
    } catch (error) {
      console.error("Lottery cancellation error:", error);

      showToast(error.message || "Ticket cancellation failed.", "error");
    } finally {
      state.isCancelling = false;

      elements.confirmCancelTicketBtn.disabled = false;

      hideLoader();
    }
  }

  /* ======================================
       Events
    ====================================== */

  elements.backBtn.addEventListener("click", () => {
    window.location.href = "/lobby";
  });

  elements.refreshBalanceBtn.addEventListener("click", async () => {
    await loadLatestUserData({
      showFeedback: true,
    });

    renderDraws();
  });

  elements.refreshDrawsBtn.addEventListener("click", () => {
    loadDraws({
      showFeedback: true,
    });
  });

  elements.refreshTicketsBtn.addEventListener("click", () => {
    loadTickets({
      page: 1,
      showFeedback: true,
    });
  });

  elements.loadMoreTicketsBtn.addEventListener("click", () => {
    if (state.ticketPage >= state.ticketTotalPages) {
      return;
    }

    loadTickets({
      page: state.ticketPage + 1,

      append: true,
    });
  });

  elements.priceFilter.addEventListener("click", (event) => {
    const button = event.target.closest("[data-ticket-price]");

    if (!button) {
      return;
    }

    state.selectedPrice = button.dataset.ticketPrice || "all";

    elements.priceFilter
      .querySelectorAll("[data-ticket-price]")
      .forEach((filterButton) => {
        const isActive = filterButton === button;

        filterButton.classList.toggle("is-active", isActive);

        filterButton.setAttribute("aria-pressed", String(isActive));
      });

    renderDraws();
  });

  elements.drawGrid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-buy-draw-id]");

    if (!button) {
      return;
    }

    const draw = getDrawById(button.dataset.buyDrawId);

    openPurchaseModal(draw);
  });

  elements.myTicketGrid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-cancel-ticket-id]");

    if (!button) {
      return;
    }

    const ticket = getTicketById(button.dataset.cancelTicketId);

    openCancelModal(ticket);
  });

  elements.decreaseQuantityBtn.addEventListener("click", () => {
    elements.ticketQuantity.value = String(
      Math.max(1, Number(elements.ticketQuantity.value) - 1),
    );

    updatePurchaseSummary();
  });

  elements.increaseQuantityBtn.addEventListener("click", () => {
    elements.ticketQuantity.value = String(
      Number(elements.ticketQuantity.value) + 1,
    );

    updatePurchaseSummary();
  });

  elements.ticketQuantity.addEventListener("input", updatePurchaseSummary);

  elements.confirmPurchaseBtn.addEventListener("click", confirmPurchase);

  elements.confirmCancelTicketBtn.addEventListener(
    "click",
    confirmTicketCancellation,
  );

  elements.closePurchaseModalBtn.addEventListener("click", closePurchaseModal);

  elements.closeCancelModalBtn.addEventListener("click", closeCancelModal);

  document
    .querySelectorAll("[data-close-purchase-modal]")
    .forEach((element) => {
      element.addEventListener("click", closePurchaseModal);
    });

  document.querySelectorAll("[data-close-cancel-modal]").forEach((element) => {
    element.addEventListener("click", closeCancelModal);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }

    closePurchaseModal();

    closeCancelModal();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      Promise.allSettled([
        loadLatestUserData(),
        loadDraws(),
                   loadTickets({
              page: 1,
            }),

            loadLotteryNotifications(),
          ]);
    }
  });

         elements.closeDrawAnimationBtn
      .addEventListener(
        "click",
        async () => {
          const drawId =
            Number(
              state.activeNotificationDrawId ||
              state.winnerNotification?.drawId,
            );

          let markedRead =
            true;

          if (
            Number.isInteger(
              drawId,
            ) &&
            drawId > 0
          ) {
            markedRead =
              await markWinnerNotificationRead(
                drawId,
              );
          }

          state.activeNotificationDrawId =
            null;

          closeDrawAnimation();

          elements.winnerList
            ?.scrollIntoView({
              behavior:
                "smooth",

              block:
                "start",
            });

          if (markedRead) {
            window.setTimeout(
              showNextUnreadLotteryNotification,
              350,
            );
          }
        },
      );

  window.addEventListener("beforeunload", () => {
            clearDrawAnimationTimers();
    if (state.countdownTimer) {
      window.clearInterval(state.countdownTimer);
    }
  });

          if (
          state.socket
        ) {
          state.socket.disconnect();
        }

            /* ======================================
       Live Draw Animation Helpers
    ====================================== */

    function clearDrawAnimationTimers() {
      if (
        state.drawAnimationTimer
      ) {
        window.clearTimeout(
          state.drawAnimationTimer,
        );

        state.drawAnimationTimer =
          null;
      }

      state.winnerRevealTimers
        .forEach(
          (timer) => {
            window.clearTimeout(
              timer,
            );
          },
        );

      state.winnerRevealTimers =
        [];
    }

    function removeDrawConfetti() {
      elements
        .lotteryDrawAnimationOverlay
        .querySelectorAll(
          ".draw-confetti",
        )
        .forEach(
          (confetti) =>
            confetti.remove(),
        );
    }

    function resetDrawAnimationUI() {
      clearDrawAnimationTimers();

      removeDrawConfetti();

      elements.drawShuffleStage
        .hidden = false;

      elements.drawAnimationStatus
        .hidden = false;

      elements.drawWinnerRevealStage
        .hidden = true;

      elements.personalWinnerNotice
        .hidden = true;

      elements.closeDrawAnimationBtn
        .hidden = true;

      elements.drawShuffleTrack
        .replaceChildren();

      elements.drawWinnerRevealGrid
        .replaceChildren();

      elements.drawAnimationStatus
        .innerHTML = `
          <span class="draw-status-spinner"></span>

          <div>

            <strong>
              Securely shuffling tickets...
            </strong>

            <p>
              Cryptographic fair selection is running
            </p>

          </div>
        `;
    }

    function createShuffleTicketElements(
      ticketPreview,
    ) {
      const tickets =
        Array.isArray(
          ticketPreview,
        )
          ? ticketPreview
              .filter(Boolean)
              .slice(
                0,
                18,
              )
          : [];

      const visibleTickets =
        tickets.length
          ? tickets
          : [
              "SECURE-TICKET-01",
              "SECURE-TICKET-02",
              "SECURE-TICKET-03",
              "SECURE-TICKET-04",
              "SECURE-TICKET-05",
              "SECURE-TICKET-06",
            ];

      const fragment =
        document
          .createDocumentFragment();

      visibleTickets.forEach(
        (
          ticketCode,
          index,
        ) => {
          const ticket =
            document.createElement(
              "span",
            );

          const angle =
            (
              360 /
              visibleTickets.length
            ) *
            index;

          const delay =
            -(
              index *
              0.13
            );

          const duration =
            2.1 +
            (
              index %
              5
            ) *
              0.17;

          ticket.className =
            "shuffle-ticket-chip";

          ticket.textContent =
            String(
              ticketCode,
            );

          ticket.style
            .setProperty(
              "--ticket-angle",
              `${angle}deg`,
            );

          ticket.style
            .setProperty(
              "--ticket-delay",
              `${delay}s`,
            );

          ticket.style
            .setProperty(
              "--ticket-duration",
              `${duration}s`,
            );

          fragment.appendChild(
            ticket,
          );
        },
      );

      elements.drawShuffleTrack
        .replaceChildren(
          fragment,
        );
    }

    function openDrawAnimation(
      payload = {},
    ) {
      resetDrawAnimationUI();

      state.activeDrawEvent =
        payload;

            state.completedDrawEvent =
        null;

      state.winnerNotification =
        null;

      state.drawAnimationStartedAt =
        Date.now();

      state.drawAnimationRunning =
        true;

      state.completedAnimationDrawId =
        null;

      elements.drawAnimationTitle
        .textContent =
        payload.drawTitle ||
        "PMS Lottery Draw";

      elements.drawAnimationCode
        .textContent =
        payload.drawCode ||
        "Secure fair draw";

      createShuffleTicketElements(
        payload.ticketPreview,
      );

      elements
        .lotteryDrawAnimationOverlay
        .classList.add(
          "is-visible",
        );

      elements
        .lotteryDrawAnimationOverlay
        .setAttribute(
          "aria-hidden",
          "false",
        );

      document.body.style
        .overflow =
        "hidden";
    }

    function createDrawConfetti() {
      const colors = [
        "#facc15",
        "#fb7185",
        "#a78bfa",
        "#38bdf8",
        "#4ade80",
        "#f97316",
      ];

      const fragment =
        document
          .createDocumentFragment();

      for (
        let index = 0;
        index < 46;
        index += 1
      ) {
        const confetti =
          document.createElement(
            "span",
          );

        confetti.className =
          "draw-confetti";

        confetti.style
          .setProperty(
            "--confetti-left",
            `${
              Math.random() *
              100
            }%`,
          );

        confetti.style
          .setProperty(
            "--confetti-delay",
            `${
              Math.random() *
              1.2
            }s`,
          );

        confetti.style
          .setProperty(
            "--confetti-color",
            colors[
              index %
              colors.length
            ],
          );

        fragment.appendChild(
          confetti,
        );
      }

      elements
        .lotteryDrawAnimationOverlay
        .querySelector(
          ".lottery-draw-animation-card",
        )
        ?.appendChild(
          fragment,
        );

      window.setTimeout(
        removeDrawConfetti,
        4500,
      );
    }

    function closeDrawAnimation() {
      clearDrawAnimationTimers();

      removeDrawConfetti();

      state.drawAnimationRunning =
        false;

      state.activeDrawEvent =
        null;

      state.completedDrawEvent =
        null;

      state.winnerNotification =
        null;

      elements
        .lotteryDrawAnimationOverlay
        .classList.remove(
          "is-visible",
        );

      elements
        .lotteryDrawAnimationOverlay
        .setAttribute(
          "aria-hidden",
          "true",
        );

      document.body.style
        .overflow =
        "";
    }

        function getRevealRankLabel(
      prizeRank,
    ) {
      const rank =
        Number(
          prizeRank,
        );

      if (rank === 1) {
        return "1st Winner";
      }

      if (rank === 2) {
        return "2nd Winner";
      }

      return "3rd Winner";
    }

    function getRevealRankIcon(
      prizeRank,
    ) {
      const rank =
        Number(
          prizeRank,
        );

      if (rank === 1) {
        return "fa-crown";
      }

      if (rank === 2) {
        return "fa-medal";
      }

      return "fa-award";
    }

    function createWinnerRevealCard(
      winner,
    ) {
      const rank =
        Number(
          winner.prizeRank,
        );

      const card =
        document.createElement(
          "article",
        );

      card.className =
        `winner-reveal-card rank-${rank}`;

      card.innerHTML = `
        <span class="winner-reveal-rank">

          <i class="fa-solid ${getRevealRankIcon(
            rank,
          )}"></i>

          ${escapeHtml(
            getRevealRankLabel(
              rank,
            ),
          )}

        </span>

        <h4>
          ${escapeHtml(
            winner.winnerName ||
              "Lottery Winner",
          )}
        </h4>

        <p>
          ${escapeHtml(
            winner.winnerUid ||
              "-",
          )}
        </p>

        <span class="winner-reveal-ticket">
          ${escapeHtml(
            winner.ticketCode ||
              "-",
          )}
        </span>

        <strong class="winner-reveal-prize">
          ৳${formatMoney(
            winner.prizeAmount,
          )}
        </strong>

        <em class="winner-reveal-message">
          ${escapeHtml(
            winner.winnerMessage ||
              "Congratulations on your Lottery win!",
          )}
        </em>
      `;

      return card;
    }

    function showPersonalWinnerNotification(
      notification,
    ) {
      if (!notification) {
        return;
      }

      elements.personalWinnerTitle
        .textContent =
        `Congratulations, ${
          notification
            .winnerName ||
          "Winner"
        }!`;

      elements.personalWinnerMessage
        .textContent =
        notification
          .winnerMessage ||
        `You won ${getRevealRankLabel(
          notification.prizeRank,
        )}.`;

      elements.personalWinnerPrize
        .textContent =
        `৳${formatMoney(
          notification
            .prizeAmount,
        )}`;

      elements.personalWinnerTicket
        .textContent =
        `Winning Ticket: ${
          notification
            .ticketCode ||
          "-"
        }`;

      elements.personalWinnerNotice
        .hidden = false;

      showToast(
        notification
          .winnerMessage ||
          "Congratulations! You won a Lottery prize.",
        "success",
      );
    }

    async function refreshLotteryAfterDraw() {
      await Promise.allSettled([
        loadLatestUserData(),

        loadDraws(),

        loadTickets({
          page: 1,
        }),

               loadWinners(),

        loadLotteryNotifications(),
      ]);

      updateBalanceUI();

      renderDraws();

      renderTickets();

      renderWinners();

      renderSummary();
    }

    function revealCompletedLotteryDraw(
      payload,
    ) {
      const drawId =
        Number(
          payload?.drawId,
        );

      if (
        !Number.isInteger(
          drawId,
        ) ||
        drawId < 1
      ) {
        return;
      }

      if (
        Number(
          state
            .completedAnimationDrawId,
        ) ===
        drawId
      ) {
        return;
      }

      state.completedAnimationDrawId =
        drawId;

      clearDrawAnimationTimers();

      elements.drawShuffleStage
        .hidden = true;

      elements.drawAnimationStatus
        .hidden = true;

      elements.drawWinnerRevealStage
        .hidden = false;

      elements.drawWinnerRevealGrid
        .replaceChildren();

      const winners =
        Array.isArray(
          payload.winners,
        )
          ? [
              ...payload.winners,
            ].sort(
              (
                firstWinner,
                secondWinner,
              ) =>
                Number(
                  firstWinner
                    .prizeRank,
                ) -
                Number(
                  secondWinner
                    .prizeRank,
                ),
            )
          : [];

      if (!winners.length) {
        elements.drawWinnerRevealGrid
          .innerHTML = `
            <div class="lottery-empty-state">

              <i class="fa-solid fa-circle-exclamation"></i>

              <h3>
                Result unavailable
              </h3>

              <p>
                Refresh the page to load the completed result.
              </p>

            </div>
          `;

        elements.closeDrawAnimationBtn
          .hidden = false;

        refreshLotteryAfterDraw();

        return;
      }

      const revealInterval =
        Math.max(
          1200,
          Number(
            state
              .activeDrawEvent
              ?.revealIntervalMs ||
              2200,
          ),
        );

      winners.forEach(
        (
          winner,
          index,
        ) => {
          const timer =
            window.setTimeout(
              () => {
                const card =
                  createWinnerRevealCard(
                    winner,
                  );

                elements
                  .drawWinnerRevealGrid
                  .appendChild(
                    card,
                  );

                window
                  .requestAnimationFrame(
                    () => {
                      card.classList
                        .add(
                          "is-revealed",
                        );
                    },
                  );

                if (index === 0) {
                  createDrawConfetti();
                }
              },
              index *
                revealInterval,
            );

          state.winnerRevealTimers
            .push(
              timer,
            );
        },
      );

      const finishTimer =
        window.setTimeout(
          () => {
            const privateNotice =
              state
                .winnerNotification;

            if (
              privateNotice &&
              Number(
                privateNotice
                  .drawId,
              ) ===
                drawId
            ) {
              showPersonalWinnerNotification(
                privateNotice,
              );
            }

            elements
              .closeDrawAnimationBtn
              .hidden = false;

            state
              .drawAnimationRunning =
              false;

            createDrawConfetti();

            refreshLotteryAfterDraw();
          },
          winners.length *
            revealInterval +
            850,
        );

      state.winnerRevealTimers
        .push(
          finishTimer,
        );
    }

    function queueCompletedLotteryDraw(
      payload,
    ) {
      const drawId =
        Number(
          payload?.drawId,
        );

      if (
        !Number.isInteger(
          drawId,
        ) ||
        drawId < 1
      ) {
        return;
      }

      if (
        !state
          .drawAnimationRunning ||
        Number(
          state
            .activeDrawEvent
            ?.drawId,
        ) !==
          drawId
      ) {
        openDrawAnimation({
          drawId,

          drawCode:
            payload.drawCode,

          drawTitle:
            payload.winners?.[0]
              ?.drawTitle ||
            "PMS Lottery Draw",

          ticketPreview:
            [],

          animationDurationMs:
            3500,

          revealIntervalMs:
            2200,
        });
      }

      state.completedDrawEvent =
        payload;

      const animationDuration =
        Math.max(
          3000,
          Number(
            state
              .activeDrawEvent
              ?.animationDurationMs ||
              9000,
          ),
        );

      const elapsed =
        Math.max(
          0,
          Date.now() -
            state
              .drawAnimationStartedAt,
        );

      const remainingDelay =
        Math.max(
          0,
          animationDuration -
            elapsed,
        );

      if (
        state.drawAnimationTimer
      ) {
        window.clearTimeout(
          state.drawAnimationTimer,
        );
      }

      state.drawAnimationTimer =
        window.setTimeout(
          () => {
            state.drawAnimationTimer =
              null;

            revealCompletedLotteryDraw(
              payload,
            );
          },
          remainingDelay,
        );
    }

        /* ======================================
       Persistent Winner Notifications
    ====================================== */

    async function loadLotteryNotifications() {
      if (
        state
          .isLoadingNotifications
      ) {
        return;
      }

      state.isLoadingNotifications =
        true;

      try {
        const result =
          await apiRequest(
            "/lottery/notifications?limit=20",
          );

        state.notifications =
          Array.isArray(
            result
              ?.data
              ?.notifications,
          )
            ? result
                .data
                .notifications
            : [];

        state.unreadNotificationCount =
          Number(
            result
              ?.data
              ?.unreadCount ||
              0,
          );
      } catch (error) {
        console.error(
          "Load Lottery notifications error:",
          error,
        );

        state.notifications =
          [];

        state.unreadNotificationCount =
          0;
      } finally {
        state.isLoadingNotifications =
          false;
      }
    }

    async function markWinnerNotificationRead(
      drawId,
    ) {
      const validDrawId =
        Number(
          drawId,
        );

      if (
        !Number.isInteger(
          validDrawId,
        ) ||
        validDrawId < 1
      ) {
                return false;
      }

      try {
        await apiRequest(
          `/lottery/notifications/${validDrawId}/read`,
          {
            method:
              "PATCH",
          },
        );

        state.notifications =
          state.notifications.map(
            (notification) =>
              Number(
                notification
                  .drawId,
              ) ===
                validDrawId
                ? {
                    ...notification,

                    isRead:
                      true,

                    readAt:
                      new Date()
                        .toISOString(),
                  }
                : notification,
          );

        state.unreadNotificationCount =
          state.notifications.filter(
            (notification) =>
              !notification.isRead,
          ).length;
                  return true;
      } catch (error) {
        console.error(
          "Mark Lottery notification read error:",
          error,
        );
                return false;
      }
    }

    function showStoredWinnerNotification(
      notification,
    ) {
      if (!notification) {
        return;
      }

      resetDrawAnimationUI();

      state.winnerNotification =
        notification;

      state.activeNotificationDrawId =
        Number(
          notification.drawId,
        );

      state.completedAnimationDrawId =
        Number(
          notification.drawId,
        );

      state.drawAnimationRunning =
        false;

      elements.drawAnimationTitle
        .textContent =
        notification
          .drawTitle ||
        "PMS Lottery Winner";

      elements.drawAnimationCode
        .textContent =
        notification
          .drawCode ||
        "Winner notification";

      elements.drawShuffleStage
        .hidden = true;

      elements.drawAnimationStatus
        .hidden = true;

      elements.drawWinnerRevealStage
        .hidden = true;

      showPersonalWinnerNotification(
        notification,
      );

      elements.closeDrawAnimationBtn
        .hidden = false;

      elements
        .lotteryDrawAnimationOverlay
        .classList.add(
          "is-visible",
        );

      elements
        .lotteryDrawAnimationOverlay
        .setAttribute(
          "aria-hidden",
          "false",
        );

      document.body.style
        .overflow =
        "hidden";

      createDrawConfetti();
    }

    function showNextUnreadLotteryNotification() {
      if (
        state.drawAnimationRunning ||
        elements
          .lotteryDrawAnimationOverlay
          .getAttribute(
            "aria-hidden",
          ) ===
          "false"
      ) {
        return;
      }

      const notification =
        state.notifications.find(
          (item) =>
            !item.isRead,
        );

      if (!notification) {
        return;
      }

      showStoredWinnerNotification(
        notification,
      );
    }

      /* ======================================
       Real-time Lottery Socket
    ====================================== */

    function initializeLotterySocket() {
      if (
        typeof window.io !==
        "function"
      ) {
        console.error(
          "Lottery Socket.IO client is unavailable.",
        );

        return;
      }

      const token =
        getAccessToken();

      if (!token) {
        return;
      }

      const socket =
        window.io(
          `${window.APP_CONFIG.SERVER_URL}/lottery`,
          {
            auth: {
              token,
            },

            transports: [
              "websocket",
              "polling",
            ],

            reconnection:
              true,

            reconnectionAttempts:
              Infinity,

            reconnectionDelay:
              1000,

            reconnectionDelayMax:
              5000,

            timeout:
              15000,
          },
        );

      state.socket =
        socket;

      socket.on(
        "connect",
        () => {
          state.socketConnected =
            true;

          console.log(
            "Lottery socket connected:",
            socket.id,
          );
        },
      );

      socket.on(
  "account:blocked",
  (payload = {}) => {
    window.alert(
      payload.message ||
      "Your account has been banned.",
    );

    if (
      typeof window.AUTH_SESSION
        ?.logout === "function"
    ) {
      window.AUTH_SESSION.logout();
      return;
    }

    redirectToLogin();
  },
);

      socket.on(
        "disconnect",
        (reason) => {
          state.socketConnected =
            false;

          console.warn(
            "Lottery socket disconnected:",
            reason,
          );
        },
      );

      socket.on(
        "connect_error",
        (error) => {
          state.socketConnected =
            false;

          console.error(
            "Lottery socket connection error:",
            error.message,
          );
        },
      );

      socket.on(
        "lottery:connected",
        (payload) => {
          console.log(
            "Lottery real-time connection ready:",
            payload,
          );
        },
      );

           socket.on(
        "lottery:draw-started",
        (payload) => {
          const draw =
            state.draws.find(
              (item) =>
                Number(
                  item.drawId,
                ) ===
                Number(
                  payload.drawId,
                ),
            );

          if (draw) {
            draw.status =
              "drawing";

            draw.remainingSeconds =
              0;

            draw.countdownDeadline =
              null;

            renderDraws();

            refreshCountdownUI();
          }

          openDrawAnimation(
            payload,
          );

          console.log(
            "Lottery draw started:",
            payload,
          );
        },
      );

            socket.on(
        "lottery:draw-completed",
        (payload) => {
          queueCompletedLotteryDraw(
            payload,
          );

          console.log(
            "Lottery draw completed:",
            payload,
          );
        },
      );

           socket.on(
        "lottery:draw-failed",
        (payload) => {
          if (
            state.drawAnimationRunning
          ) {
            closeDrawAnimation();
          }

          state.activeDrawEvent =
            null;

          state.completedDrawEvent =
            null;

          showToast(
            payload.message ||
              "Lottery draw failed.",
            "error",
          );

          loadDraws();

          console.error(
            "Lottery draw failed:",
            payload,
          );
        },
      );

            socket.on(
        "lottery:winner-notification",
        (payload) => {
          state.winnerNotification =
            payload;

          if (
            Number(
              state
                .completedAnimationDrawId,
            ) ===
              Number(
                payload.drawId,
              ) &&
            !elements
              .closeDrawAnimationBtn
              .hidden
          ) {
            showPersonalWinnerNotification(
              payload,
            );
          }

          console.log(
            "Private Lottery winner notification:",
            payload,
          );
        },
      );

    }


  /* ======================================
       Initialization
    ====================================== */

  async function initializeLottery() {
         if (!initializeUser()) {
        return;
      }

      initializeLotterySocket();

      updateBalanceUI();

    renderDraws();

    renderTickets();

    renderWinners();

    startCountdownTimer();

    showLoader("Loading Lottery...");

    try {
      await Promise.allSettled([
        loadLatestUserData(),
        loadDraws(),
        loadTickets({
          page: 1,
        }),
                 loadWinners(),

          loadLotteryNotifications(),
        ]);

      updateBalanceUI();

      renderDraws();

      renderTickets();

      renderWinners();

      renderSummary();
         } finally {
        hideLoader();
      }

      window.setTimeout(
        showNextUnreadLotteryNotification,
        350,
      );

      window.setInterval(() => {
      if (document.visibilityState === "visible" && !state.isLoadingDraws) {
        loadDraws();
      }
    }, 30000);
  }

  initializeLottery();

  /* ======================================
       LP1C PART 3 END
    ====================================== */
});
