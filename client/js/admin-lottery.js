"use strict";

/* ==========================================
   PMS ADDA ADMIN LOTTERY
========================================== */

const LOTTERY_API_URL =
  APP_CONFIG.api(
    "/admin/lottery/draws",
  );

const state = {
  draws: [],

  currentPage: 1,

  limit: 20,

  totalPages: 1,

  totalDraws: 0,

  search: "",

  status: "",

  ticketPrice: "",

  searchTimer: null,

  selectedDrawId: null,

  pendingAction: null,

  pendingActionDraw: null,

  countdownTimer: null,

  refreshTimer: null,

  isLoading: false,
};

/* ==========================================
   DOM Elements
========================================== */

const elements = {
  sidebar:
    document.getElementById(
      "sidebar",
    ),

  sidebarOverlay:
    document.getElementById(
      "sidebarOverlay",
    ),

  sidebarOpenBtn:
    document.getElementById(
      "sidebarOpenBtn",
    ),

  sidebarCloseBtn:
    document.getElementById(
      "sidebarCloseBtn",
    ),

  logoutBtn:
    document.getElementById(
      "logoutBtn",
    ),

  adminName:
    document.getElementById(
      "adminName",
    ),

  totalDraws:
    document.getElementById(
      "totalDraws",
    ),

  liveDraws:
    document.getElementById(
      "liveDraws",
    ),

  completedDraws:
    document.getElementById(
      "completedDraws",
    ),

  serviceRevenue:
    document.getElementById(
      "serviceRevenue",
    ),

  refreshDrawsBtn:
    document.getElementById(
      "refreshDrawsBtn",
    ),

  openCreateDrawBtn:
    document.getElementById(
      "openCreateDrawBtn",
    ),

  drawSearchInput:
    document.getElementById(
      "drawSearchInput",
    ),

  drawStatusFilter:
    document.getElementById(
      "drawStatusFilter",
    ),

  ticketPriceFilter:
    document.getElementById(
      "ticketPriceFilter",
    ),

  drawTableBody:
    document.getElementById(
      "drawTableBody",
    ),

  paginationInfo:
    document.getElementById(
      "paginationInfo",
    ),

  previousPageBtn:
    document.getElementById(
      "previousPageBtn",
    ),

  nextPageBtn:
    document.getElementById(
      "nextPageBtn",
    ),

  currentPageText:
    document.getElementById(
      "currentPageText",
    ),

  createDrawModal:
    document.getElementById(
      "createDrawModal",
    ),

  closeCreateDrawModalBtn:
    document.getElementById(
      "closeCreateDrawModalBtn",
    ),

  cancelCreateDrawBtn:
    document.getElementById(
      "cancelCreateDrawBtn",
    ),

  createDrawForm:
    document.getElementById(
      "createDrawForm",
    ),

  drawTitleInput:
    document.getElementById(
      "drawTitleInput",
    ),

  ticketPriceInput:
    document.getElementById(
      "ticketPriceInput",
    ),

  targetQuantityInput:
    document.getElementById(
      "targetQuantityInput",
    ),

  maxTicketsPerUserInput:
    document.getElementById(
      "maxTicketsPerUserInput",
    ),

  minimumPlayersInput:
    document.getElementById(
      "minimumPlayersInput",
    ),

  countdownMinutesInput:
    document.getElementById(
      "countdownMinutesInput",
    ),

  firstPrizeInput:
    document.getElementById(
      "firstPrizeInput",
    ),

  secondPrizeInput:
    document.getElementById(
      "secondPrizeInput",
    ),

  thirdPrizeInput:
    document.getElementById(
      "thirdPrizeInput",
    ),

  serviceChargeInput:
    document.getElementById(
      "serviceChargeInput",
    ),

  cancellationFeeInput:
    document.getElementById(
      "cancellationFeeInput",
    ),

  distributionTotal:
    document.getElementById(
      "distributionTotal",
    ),

  projectedGrossAmount:
    document.getElementById(
      "projectedGrossAmount",
    ),

  projectedPrizeAmount:
    document.getElementById(
      "projectedPrizeAmount",
    ),

  projectedServiceAmount:
    document.getElementById(
      "projectedServiceAmount",
    ),

  submitCreateDrawBtn:
    document.getElementById(
      "submitCreateDrawBtn",
    ),

  drawDetailsModal:
    document.getElementById(
      "drawDetailsModal",
    ),

  closeDrawDetailsModalBtn:
    document.getElementById(
      "closeDrawDetailsModalBtn",
    ),

  drawDetailsTitle:
    document.getElementById(
      "drawDetailsTitle",
    ),

  drawDetailsSubtitle:
    document.getElementById(
      "drawDetailsSubtitle",
    ),

  drawDetailsSummary:
    document.getElementById(
      "drawDetailsSummary",
    ),

  detailsTicketCount:
    document.getElementById(
      "detailsTicketCount",
    ),

  detailsTicketTableBody:
    document.getElementById(
      "detailsTicketTableBody",
    ),

  detailsWinnerGrid:
    document.getElementById(
      "detailsWinnerGrid",
    ),

  detailsRevenueList:
    document.getElementById(
      "detailsRevenueList",
    ),

  detailsProofGrid:
    document.getElementById(
      "detailsProofGrid",
    ),

  actionConfirmModal:
    document.getElementById(
      "actionConfirmModal",
    ),

  actionModalIcon:
    document.getElementById(
      "actionModalIcon",
    ),

  actionConfirmTitle:
    document.getElementById(
      "actionConfirmTitle",
    ),

  actionConfirmMessage:
    document.getElementById(
      "actionConfirmMessage",
    ),

  cancelReasonGroup:
    document.getElementById(
      "cancelReasonGroup",
    ),

  cancelReasonInput:
    document.getElementById(
      "cancelReasonInput",
    ),

  cancelActionBtn:
    document.getElementById(
      "cancelActionBtn",
    ),

  confirmActionBtn:
    document.getElementById(
      "confirmActionBtn",
    ),

  pageLoader:
    document.getElementById(
      "pageLoader",
    ),

  loaderMessage:
    document.getElementById(
      "loaderMessage",
    ),

  toastContainer:
    document.getElementById(
      "toastContainer",
    ),
};

/* ==========================================
   Authentication
========================================== */

function getToken() {
  return (
    localStorage.getItem(
      "access_token",
    ) ||
    localStorage.getItem(
      "token",
    )
  );
}

function getStoredUser() {
  const savedUser =
    localStorage.getItem(
      "current_user",
    ) ||
    localStorage.getItem(
      "user",
    ) ||
    localStorage.getItem(
      "admin_user",
    );

  if (!savedUser) {
    return null;
  }

  try {
    return JSON.parse(
      savedUser,
    );
  } catch (_error) {
    return null;
  }
}

function logout() {
  [
    "access_token",
    "token",
    "current_user",
    "user",
    "admin_user",
  ].forEach(
    (key) =>
      localStorage.removeItem(
        key,
      ),
  );

  window.location.href =
    "../pages/login.html";
}

function checkAuthentication() {
  const token = getToken();

  if (!token) {
    logout();

    return false;
  }

  const user =
    getStoredUser();

  if (
    user?.role &&
    String(
      user.role,
    ).toLowerCase() !==
      "admin"
  ) {
    showToast(
      "error",
      "Access denied",
      "Administrator access is required.",
    );

    window.setTimeout(
      logout,
      1000,
    );

    return false;
  }

  elements.adminName
    .textContent =
    user?.fullName ||
    user?.full_name ||
    user?.username ||
    user?.name ||
    "Admin";

  return true;
}

/* ==========================================
   API Helper
========================================== */

async function apiRequest(
  endpoint = "",
  options = {},
) {
  const token =
    getToken();

  const response =
    await fetch(
      `${LOTTERY_API_URL}${endpoint}`,
      {
        method:
          options.method ||
          "GET",

        headers: {
          Accept:
            "application/json",

          ...(options.body
            ? {
                "Content-Type":
                  "application/json",
              }
            : {}),

          Authorization:
            `Bearer ${token}`,

          ...(
            options.headers ||
            {}
          ),
        },

        body:
          options.body
            ? JSON.stringify(
                options.body,
              )
            : undefined,
      },
    );

  let result = null;

  try {
    result =
      await response.json();
  } catch (_error) {
    result = null;
  }

  if (
    response.status ===
    401
  ) {
    showToast(
      "error",
      "Session expired",
      "Please login again.",
    );

    window.setTimeout(
      logout,
      900,
    );

    throw new Error(
      "Unauthorized",
    );
  }

  if (
    !response.ok ||
    result?.success ===
      false
  ) {
    const error =
      new Error(
        result?.message ||
          "Request failed.",
      );

    error.status =
      response.status;

    error.code =
      result?.code ||
      "REQUEST_FAILED";

    throw error;
  }

  return result;
}

/* ==========================================
   Common Helpers
========================================== */

function escapeHtml(value) {
  const element =
    document.createElement(
      "div",
    );

  element.textContent =
    String(value ?? "");

  return element.innerHTML;
}

function toAmount(value) {
  const amount =
    Number(value);

  return Number.isFinite(
    amount,
  )
    ? amount
    : 0;
}

function formatMoney(value) {
  return toAmount(
    value,
  ).toLocaleString(
    "en-BD",
    {
      minimumFractionDigits:
        2,

      maximumFractionDigits:
        2,
    },
  );
}

function formatDate(value) {
  if (!value) {
    return "N/A";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return "N/A";
  }

  return date.toLocaleString(
    "en-BD",
    {
      dateStyle:
        "medium",

      timeStyle:
        "short",
    },
  );
}

function normalizeStatusClass(
  status,
) {
  return String(
    status || "",
  )
    .trim()
    .toLowerCase()
    .replace(
      /_/g,
      "-",
    )
    .replace(
      /[^a-z0-9-]/g,
      "",
    );
}

function formatStatus(
  status,
) {
  return String(
    status || "-",
  )
    .replace(
      /_/g,
      " ",
    )
    .replace(
      /\b\w/g,
      (letter) =>
        letter.toUpperCase(),
    );
}

function formatCountdown(
  seconds,
) {
  const safeSeconds =
    Math.max(
      0,
      Math.floor(
        Number(seconds) ||
          0,
      ),
    );

  const hours =
    Math.floor(
      safeSeconds /
        3600,
    );

  const minutes =
    Math.floor(
      (
        safeSeconds %
        3600
      ) /
        60,
    );

  const remainingSeconds =
    safeSeconds % 60;

  return [
    hours,
    minutes,
    remainingSeconds,
  ]
    .map(
      (value) =>
        String(value)
          .padStart(
            2,
            "0",
          ),
    )
    .join(":");
}

function showLoader(
  message =
    "Please wait...",
) {
  elements.loaderMessage
    .textContent =
    message;

  elements.pageLoader
    .classList.remove(
      "hidden",
    );
}

function hideLoader() {
  elements.pageLoader
    .classList.add(
      "hidden",
    );
}

function openModal(modal) {
  modal.classList.add(
    "show",
  );

  modal.setAttribute(
    "aria-hidden",
    "false",
  );

  document.body.style
    .overflow =
    "hidden";
}

function closeModal(modal) {
  modal.classList.remove(
    "show",
  );

  modal.setAttribute(
    "aria-hidden",
    "true",
  );

  if (
    !document.querySelector(
      ".modal.show",
    )
  ) {
    document.body.style
      .overflow = "";
  }
}

function showToast(
  type,
  title,
  message,
) {
  const toast =
    document.createElement(
      "div",
    );

  toast.className =
    `toast ${type}`;

  const icons = {
    success:
      "fa-circle-check",

    error:
      "fa-circle-xmark",

    warning:
      "fa-triangle-exclamation",

    info:
      "fa-circle-info",
  };

  toast.innerHTML = `
    <div class="toast-icon">

      <i class="fa-solid ${
        icons[type] ||
        icons.info
      }"></i>

    </div>

    <div class="toast-content">

      <strong>
        ${escapeHtml(title)}
      </strong>

      <p>
        ${escapeHtml(message)}
      </p>

    </div>

    <button
      type="button"
      class="toast-close-btn"
      aria-label="Close notification">

      <i class="fa-solid fa-xmark"></i>

    </button>
  `;

  toast
    .querySelector(
      ".toast-close-btn",
    )
    .addEventListener(
      "click",
      () =>
        toast.remove(),
    );

  elements.toastContainer
    .appendChild(
      toast,
    );

  window.setTimeout(
    () =>
      toast.remove(),
    4200,
  );
}

/* ==========================================
   Sidebar
========================================== */

function openSidebar() {
  elements.sidebar
    .classList.add(
      "show",
    );

  elements.sidebarOverlay
    .classList.add(
      "show",
    );
}

function closeSidebar() {
  elements.sidebar
    .classList.remove(
      "show",
    );

  elements.sidebarOverlay
    .classList.remove(
      "show",
    );
}

/* LOT5C-3A END */
/* Continue LOT5C-3B below */

/* ==========================================
   Draw List Helpers
========================================== */

function buildDrawQuery() {
  const parameters =
    new URLSearchParams();

  parameters.set(
    "page",
    state.currentPage,
  );

  parameters.set(
    "limit",
    state.limit,
  );

  if (state.search) {
    parameters.set(
      "search",
      state.search,
    );
  }

  if (state.status) {
    parameters.set(
      "status",
      state.status,
    );
  }

  if (state.ticketPrice) {
    parameters.set(
      "ticketPrice",
      state.ticketPrice,
    );
  }

  return parameters
    .toString();
}

function prepareDraw(draw) {
  const remainingSeconds =
    Math.max(
      0,
      Number(
        draw
          ?.remainingSeconds ||
          0,
      ),
    );

  return {
    ...draw,

    drawId:
      Number(draw?.drawId),

    ticketPrice:
      toAmount(
        draw?.ticketPrice,
      ),

    activeTicketCount:
      Number(
        draw
          ?.activeTicketCount ||
          0,
      ),

    targetTicketQuantity:
      Number(
        draw
          ?.targetTicketQuantity ||
          0,
      ),

    uniquePlayerCount:
      Number(
        draw
          ?.uniquePlayerCount ||
          0,
      ),

    winnerCount:
      Number(
        draw
          ?.winnerCount ||
          0,
      ),

    progressPercent:
      Math.min(
        100,
        Math.max(
          0,
          Number(
            draw
              ?.progressPercent ||
              0,
          ),
        ),
      ),

    remainingSeconds,

    countdownDeadline:
      remainingSeconds > 0
        ? Date.now() +
          remainingSeconds *
            1000
        : null,
  };
}

function getRemainingSeconds(
  draw,
) {
  if (
    !draw
      ?.countdownDeadline
  ) {
    return Math.max(
      0,
      Number(
        draw
          ?.remainingSeconds ||
          0,
      ),
    );
  }

  return Math.max(
    0,
    Math.ceil(
      (
        draw
          .countdownDeadline -
        Date.now()
      ) /
        1000,
    ),
  );
}

function getDrawById(drawId) {
  return (
    state.draws.find(
      (draw) =>
        Number(draw.drawId) ===
        Number(drawId),
    ) || null
  );
}

/* ==========================================
   Summary
========================================== */

function renderSummary() {
  const liveStatuses =
    new Set([
      "selling",
      "paused",
      "sold_out",
      "countdown",
      "ready_to_draw",
      "drawing",
    ]);

  const liveDrawCount =
    state.draws.filter(
      (draw) =>
        liveStatuses.has(
          String(
            draw.status,
          ),
        ),
    ).length;

  const completedDrawCount =
    state.draws.filter(
      (draw) =>
        String(draw.status) ===
        "completed",
    ).length;

  const revenueAmount =
    state.draws
      .filter(
        (draw) =>
          String(
            draw.status,
          ) ===
          "completed",
      )
      .reduce(
        (
          total,
          draw,
        ) =>
          total +
          toAmount(
            draw
              .prizeDistribution
              ?.serviceCharge
              ?.amount,
          ),
        0,
      );

  elements.totalDraws
    .textContent =
    String(
      state.totalDraws,
    );

  elements.liveDraws
    .textContent =
    String(
      liveDrawCount,
    );

  elements.completedDraws
    .textContent =
    String(
      completedDrawCount,
    );

  elements.serviceRevenue
    .textContent =
    formatMoney(
      revenueAmount,
    );
}

/* ==========================================
   Draw Table
========================================== */

function createStatusMarkup(
  status,
) {
  return `
    <span
      class="status-badge status-${normalizeStatusClass(
        status,
      )}">

      ${escapeHtml(
        formatStatus(
          status,
        ),
      )}

    </span>
  `;
}

function getTimerMarkup(draw) {
  const status =
    String(
      draw.status ||
      "",
    );

  if (
    ![
      "countdown",
      "ready_to_draw",
      "drawing",
    ].includes(status)
  ) {
    if (
      status ===
      "completed"
    ) {
      return escapeHtml(
        formatDate(
          draw.timeline
            ?.drawnAt,
        ),
      );
    }

    return "-";
  }

  if (
    status ===
    "drawing"
  ) {
    return `
      <span class="timer-cell">
        DRAWING
      </span>
    `;
  }

  const remainingSeconds =
    getRemainingSeconds(
      draw,
    );

  return `
    <span
      class="timer-cell ${
        remainingSeconds <= 0
          ? "is-ready"
          : ""
      }"
      data-draw-timer="${
        draw.drawId
      }">

      ${
        remainingSeconds <= 0
          ? "READY"
          : formatCountdown(
              remainingSeconds,
            )
      }

    </span>
  `;
}

function createActionMarkup(
  draw,
) {
  const status =
    String(
      draw.status ||
      "",
    );

  const remainingSeconds =
    getRemainingSeconds(
      draw,
    );

  const canOpen =
    status ===
    "draft";

  const canDraw =
    (
      status ===
        "ready_to_draw" ||
      status ===
        "countdown"
    ) &&
    remainingSeconds <= 0;

  const canCancel =
    [
      "draft",
      "selling",
      "paused",
      "sold_out",
      "countdown",
      "ready_to_draw",
      "failed",
    ].includes(status);

  return `
    <div class="action-buttons">

      <button
        type="button"
        class="action-btn action-view"
        data-action="view"
        data-draw-id="${
          draw.drawId
        }"
        title="View details">

        <i class="fa-solid fa-eye"></i>

      </button>

      <button
        type="button"
        class="action-btn action-open"
        data-action="open"
        data-draw-id="${
          draw.drawId
        }"
        title="Open ticket sales"
        ${canOpen
          ? ""
          : "disabled"}>

        <i class="fa-solid fa-door-open"></i>

      </button>

      <button
        type="button"
        class="action-btn action-draw"
        data-action="draw"
        data-draw-id="${
          draw.drawId
        }"
        title="Run fair draw"
        ${canDraw
          ? ""
          : "disabled"}>

        <i class="fa-solid fa-shuffle"></i>

      </button>

      <button
        type="button"
        class="action-btn action-cancel"
        data-action="cancel"
        data-draw-id="${
          draw.drawId
        }"
        title="Cancel and refund"
        ${canCancel
          ? ""
          : "disabled"}>

        <i class="fa-solid fa-ban"></i>

      </button>

    </div>
  `;
}

function renderDraws() {
  if (!state.draws.length) {
    elements.drawTableBody
      .innerHTML = `
        <tr>

          <td
            colspan="8"
            class="empty-table-message">

            No Lottery draw found.

          </td>

        </tr>
      `;

    return;
  }

  elements.drawTableBody
    .innerHTML =
    state.draws
      .map(
        (draw) => {
          const distribution =
            draw
              .prizeDistribution ||
            {};

          return `
            <tr>

              <td>

                <div class="draw-name">

                  <strong>
                    ${escapeHtml(
                      draw.title ||
                      "PMS Lottery Draw",
                    )}
                  </strong>

                  <span>
                    ${escapeHtml(
                      draw.drawCode ||
                      "-",
                    )}
                  </span>

                </div>

              </td>

              <td>

                <strong>
                  ৳${formatMoney(
                    draw.ticketPrice,
                  )}
                </strong>

              </td>

              <td>

                <div class="sales-cell">

                  <strong>

                    <span>
                      ${
                        draw
                          .activeTicketCount
                      } /
                      ${
                        draw
                          .targetTicketQuantity
                      }
                    </span>

                    <span>
                      ${
                        draw
                          .progressPercent
                      }%
                    </span>

                  </strong>

                  <div class="sales-track">

                    <div
                      class="sales-bar"
                      style="width: ${
                        draw
                          .progressPercent
                      }%">
                    </div>

                  </div>

                </div>

              </td>

              <td>

                <strong>
                  ${
                    draw
                      .uniquePlayerCount
                  }
                </strong>

              </td>

              <td>

                <div class="money-stack">

                  <strong>
                    Prize ৳${formatMoney(
                      toAmount(
                        distribution
                          .first
                          ?.amount,
                      ) +
                      toAmount(
                        distribution
                          .second
                          ?.amount,
                      ) +
                      toAmount(
                        distribution
                          .third
                          ?.amount,
                      ),
                    )}
                  </strong>

                  <small>
                    Revenue ৳${formatMoney(
                      distribution
                        .serviceCharge
                        ?.amount,
                    )}
                  </small>

                </div>

              </td>

              <td>
                ${createStatusMarkup(
                  draw.status,
                )}
              </td>

              <td>
                ${getTimerMarkup(
                  draw,
                )}
              </td>

              <td>
                ${createActionMarkup(
                  draw,
                )}
              </td>

            </tr>
          `;
        },
      )
      .join("");
}

function renderPagination(
  pagination,
) {
  state.currentPage =
    Number(
      pagination.page ||
        1,
    );

  state.totalPages =
    Math.max(
      1,
      Number(
        pagination
          .totalPages ||
          1,
      ),
    );

  state.totalDraws =
    Number(
      pagination.total ||
        0,
    );

  const firstItem =
    state.totalDraws === 0
      ? 0
      : (
          state.currentPage -
          1
        ) *
          state.limit +
        1;

  const lastItem =
    Math.min(
      state.totalDraws,
      state.currentPage *
        state.limit,
    );

  elements.paginationInfo
    .textContent =
    `Showing ${firstItem}-${lastItem} of ${state.totalDraws} draws`;

  elements.currentPageText
    .textContent =
    `Page ${state.currentPage}`;

  elements.previousPageBtn
    .disabled =
    state.currentPage <= 1;

  elements.nextPageBtn
    .disabled =
    state.currentPage >=
    state.totalPages;
}

/* ==========================================
   Load Draws
========================================== */

async function loadDraws(
  showPageLoader = true,
) {
  if (state.isLoading) {
    return;
  }

  state.isLoading = true;

  if (showPageLoader) {
    showLoader(
      "Loading Lottery draws...",
    );
  }

  try {
    const query =
      buildDrawQuery();

    const result =
      await apiRequest(
        `?${query}`,
      );

    const data =
      result?.data || {};

    state.draws =
      Array.isArray(
        data.draws,
      )
        ? data.draws
            .map(
              prepareDraw,
            )
            .filter(
              (draw) =>
                Number.isInteger(
                  draw.drawId,
                ) &&
                draw.drawId > 0,
            )
        : [];

    renderPagination(
      data.pagination ||
        {},
    );

    renderDraws();

    renderSummary();
  } catch (error) {
    console.error(
      "Load Lottery draws error:",
      error,
    );

    elements.drawTableBody
      .innerHTML = `
        <tr>

          <td
            colspan="8"
            class="empty-table-message">

            Failed to load Lottery draws.

          </td>

        </tr>
      `;

    showToast(
      "error",
      "Load failed",
      error.message,
    );
  } finally {
    state.isLoading =
      false;

    if (showPageLoader) {
      hideLoader();
    }
  }
}

/* ==========================================
   Countdown Refresh
========================================== */

function refreshCountdowns() {
  state.draws.forEach(
    (draw) => {
      const timer =
        document.querySelector(
          `[data-draw-timer="${draw.drawId}"]`,
        );

      if (!timer) {
        return;
      }

      const remainingSeconds =
        getRemainingSeconds(
          draw,
        );

      if (
        remainingSeconds <= 0
      ) {
        timer.textContent =
          "READY";

        timer.classList.add(
          "is-ready",
        );

        const drawButton =
          document.querySelector(
            `[data-action="draw"][data-draw-id="${draw.drawId}"]`,
          );

        if (
          drawButton &&
          String(
            draw.status,
          ) ===
            "countdown"
        ) {
          drawButton.disabled =
            false;
        }

        return;
      }

      timer.textContent =
        formatCountdown(
          remainingSeconds,
        );
    },
  );
}

/* ==========================================
   Create Draw
========================================== */

function calculateCreatePreview() {
  const ticketPrice =
    toAmount(
      elements
        .ticketPriceInput
        .value,
    );

  const targetQuantity =
    Math.max(
      0,
      Number(
        elements
          .targetQuantityInput
          .value,
      ) || 0,
    );

  const firstPercent =
    toAmount(
      elements
        .firstPrizeInput
        .value,
    );

  const secondPercent =
    toAmount(
      elements
        .secondPrizeInput
        .value,
    );

  const thirdPercent =
    toAmount(
      elements
        .thirdPrizeInput
        .value,
    );

  const servicePercent =
    toAmount(
      elements
        .serviceChargeInput
        .value,
    );

  const distributionTotal =
    Number(
      (
        firstPercent +
        secondPercent +
        thirdPercent +
        servicePercent
      ).toFixed(2),
    );

  const grossAmount =
    ticketPrice *
    targetQuantity;

  const prizePercent =
    firstPercent +
    secondPercent +
    thirdPercent;

  elements.distributionTotal
    .textContent =
    `${distributionTotal}%`;

  elements.distributionTotal
    .classList.toggle(
      "is-invalid",
      distributionTotal !==
        100,
    );

  elements.projectedGrossAmount
    .textContent =
    formatMoney(
      grossAmount,
    );

  elements.projectedPrizeAmount
    .textContent =
    formatMoney(
      grossAmount *
        prizePercent /
        100,
    );

  elements.projectedServiceAmount
    .textContent =
    formatMoney(
      grossAmount *
        servicePercent /
        100,
    );

  return (
    distributionTotal ===
    100
  );
}

function resetCreateDrawForm() {
  elements.createDrawForm
    .reset();

  elements.ticketPriceInput
    .value = "20";

  elements.targetQuantityInput
    .value = "100";

  elements.maxTicketsPerUserInput
    .value = "10";

  elements.minimumPlayersInput
    .value = "3";

  elements.countdownMinutesInput
    .value = "10";

  elements.firstPrizeInput
    .value = "50";

  elements.secondPrizeInput
    .value = "30";

  elements.thirdPrizeInput
    .value = "10";

  elements.serviceChargeInput
    .value = "10";

  elements.cancellationFeeInput
    .value = "20";

  calculateCreatePreview();
}

function openCreateDrawModal() {
  resetCreateDrawForm();

  openModal(
    elements
      .createDrawModal,
  );

  elements.drawTitleInput
    .focus();
}

async function handleCreateDraw(
  event,
) {
  event.preventDefault();

  if (
    !calculateCreatePreview()
  ) {
    showToast(
      "error",
      "Invalid distribution",
      "Prize and service percentages must total 100%.",
    );

    return;
  }

  const targetQuantity =
    Number.parseInt(
      elements
        .targetQuantityInput
        .value,
      10,
    );

  const maxTicketsPerUser =
    Number.parseInt(
      elements
        .maxTicketsPerUserInput
        .value,
      10,
    );

  const minimumPlayers =
    Number.parseInt(
      elements
        .minimumPlayersInput
        .value,
      10,
    );

  if (
    maxTicketsPerUser >
      targetQuantity ||
    minimumPlayers >
      targetQuantity
  ) {
    showToast(
      "error",
      "Invalid quantity",
      "User limit and minimum players cannot exceed target quantity.",
    );

    return;
  }

  const body = {
    drawTitle:
      elements
        .drawTitleInput
        .value
        .trim(),

    ticketPrice:
      Number(
        elements
          .ticketPriceInput
          .value,
      ),

    targetTicketQuantity:
      targetQuantity,

    maxTicketsPerUser,

    minimumUniquePlayers:
      minimumPlayers,

    countdownMinutes:
      Number.parseInt(
        elements
          .countdownMinutesInput
          .value,
        10,
      ),

    firstPrizePercent:
      toAmount(
        elements
          .firstPrizeInput
          .value,
      ),

    secondPrizePercent:
      toAmount(
        elements
          .secondPrizeInput
          .value,
      ),

    thirdPrizePercent:
      toAmount(
        elements
          .thirdPrizeInput
          .value,
      ),

    serviceChargePercent:
      toAmount(
        elements
          .serviceChargeInput
          .value,
      ),

    cancellationFeePercent:
      toAmount(
        elements
          .cancellationFeeInput
          .value,
      ),
  };

  elements.submitCreateDrawBtn
    .disabled = true;

  showLoader(
    "Creating Lottery draft...",
  );

  try {
    const result =
      await apiRequest(
        "",
        {
          method:
            "POST",

          body,
        },
      );

    closeModal(
      elements
        .createDrawModal,
    );

    showToast(
      "success",
      "Draft created",
      `Draw ${result?.data?.draw?.drawCode || ""} created successfully.`,
    );

    state.currentPage = 1;

    await loadDraws(
      false,
    );
  } catch (error) {
    showToast(
      "error",
      "Create failed",
      error.message,
    );
  } finally {
    elements.submitCreateDrawBtn
      .disabled = false;

    hideLoader();
  }
}

/* LOT5C-3B END */
/* Continue LOT5C-3C below */

/* ==========================================
   Draw Details Rendering
========================================== */

function renderDrawDetails(
  data,
) {
  const draw =
    data?.draw || {};

  const tickets =
    Array.isArray(
      data?.tickets,
    )
      ? data.tickets
      : [];

  const winners =
    Array.isArray(
      data?.winners,
    )
      ? data.winners
      : [];

  const revenue =
    Array.isArray(
      data?.revenue,
    )
      ? data.revenue
      : [];

  const distribution =
    draw
      .prizeDistribution ||
    {};

  elements.drawDetailsTitle
    .textContent =
    draw.title ||
    "Lottery Draw Details";

  elements.drawDetailsSubtitle
    .textContent =
    `${draw.drawCode || "-"} • ${formatStatus(
      draw.status,
    )}`;

  elements.drawDetailsSummary
    .innerHTML = `
      <article class="detail-summary-card">

        <span>Ticket Price</span>

        <strong>
          ৳${formatMoney(
            draw.ticketPrice,
          )}
        </strong>

      </article>

      <article class="detail-summary-card">

        <span>Ticket Sales</span>

        <strong>
          ${Number(
            draw.activeTicketCount ||
              0,
          )} /
          ${Number(
            draw.targetTicketQuantity ||
              0,
          )}
        </strong>

      </article>

      <article class="detail-summary-card">

        <span>Unique Players</span>

        <strong>
          ${Number(
            draw.uniquePlayerCount ||
              0,
          )}
        </strong>

      </article>

      <article class="detail-summary-card">

        <span>Gross Sales</span>

        <strong>
          ৳${formatMoney(
            distribution
              .grossAmount,
          )}
        </strong>

      </article>

      <article class="detail-summary-card">

        <span>Total Prize</span>

        <strong>
          ৳${formatMoney(
            toAmount(
              distribution
                .first?.amount,
            ) +
            toAmount(
              distribution
                .second?.amount,
            ) +
            toAmount(
              distribution
                .third?.amount,
            ),
          )}
        </strong>

      </article>

      <article class="detail-summary-card">

        <span>Service Charge</span>

        <strong>
          ৳${formatMoney(
            distribution
              .serviceCharge
              ?.amount,
          )}
        </strong>

      </article>

      <article class="detail-summary-card">

        <span>Countdown</span>

        <strong>
          ${Number(
            draw.countdownSeconds ||
              0,
          )} seconds
        </strong>

      </article>

      <article class="detail-summary-card">

        <span>Created By</span>

        <strong>
          ${escapeHtml(
            draw.createdBy?.name ||
              draw.createdBy?.uid ||
              "-",
          )}
        </strong>

      </article>
    `;

  elements.detailsTicketCount
    .textContent =
    `${Number(
      data?.pagination?.total ||
        tickets.length,
    )} tickets`;

  if (!tickets.length) {
    elements.detailsTicketTableBody
      .innerHTML = `
        <tr>

          <td
            colspan="6"
            class="empty-table-message">

            No ticket found.

          </td>

        </tr>
      `;
  } else {
    elements.detailsTicketTableBody
      .innerHTML =
      tickets
        .map(
          (ticket) => {
            const resultAmount =
              String(
                ticket.status,
              ) ===
              "winner"
                ? `Prize ৳${formatMoney(
                    ticket.prizeAmount,
                  )}`
                : toAmount(
                      ticket
                        .refundAmount,
                    ) >
                    0
                  ? `Refund ৳${formatMoney(
                      ticket
                        .refundAmount,
                    )}`
                  : "-";

            return `
              <tr>

                <td class="ticket-code-cell">
                  ${escapeHtml(
                    ticket.ticketCode ||
                      "-",
                  )}
                </td>

                <td>

                  <div class="buyer-cell">

                    <strong>
                      ${escapeHtml(
                        ticket.buyer?.name ||
                          "-",
                      )}
                    </strong>

                    <span>
                      ${escapeHtml(
                        ticket.buyer?.uid ||
                          "-",
                      )}
                    </span>

                  </div>

                </td>

                <td>
                  ৳${formatMoney(
                    ticket.ticketPrice,
                  )}
                </td>

                <td>
                  ${createStatusMarkup(
                    ticket.status,
                  )}
                </td>

                <td>
                  ৳${formatMoney(
                    ticket
                      .turnoverAmount,
                  )}
                </td>

                <td>
                  ${escapeHtml(
                    resultAmount,
                  )}
                </td>

              </tr>
            `;
          },
        )
        .join("");
  }

  if (!winners.length) {
    elements.detailsWinnerGrid
      .innerHTML = `
        <div class="details-empty-state">
          No winners yet.
        </div>
      `;
  } else {
    elements.detailsWinnerGrid
      .innerHTML =
      winners
        .map(
          (winner) => `
            <article class="winner-card">

              <span class="winner-rank">

                <i class="fa-solid ${
                  Number(
                    winner.prizeRank,
                  ) === 1
                    ? "fa-crown"
                    : Number(
                          winner.prizeRank,
                        ) === 2
                      ? "fa-medal"
                      : "fa-award"
                }"></i>

                Rank ${
                  winner.prizeRank
                }

              </span>

              <h4>
                ${escapeHtml(
                  winner.winnerName ||
                    "-",
                )}
              </h4>

              <p>
                ${escapeHtml(
                  winner.winnerUid ||
                    "-",
                )}
                •
                ${escapeHtml(
                  winner.ticketCode ||
                    "-",
                )}
              </p>

              <strong>
                ৳${formatMoney(
                  winner.prizeAmount,
                )}
              </strong>

            </article>
          `,
        )
        .join("");
  }

  if (!revenue.length) {
    elements.detailsRevenueList
      .innerHTML = `
        <div class="details-empty-state">
          No revenue record found.
        </div>
      `;
  } else {
    elements.detailsRevenueList
      .innerHTML =
      revenue
        .map(
          (item) => `
            <article class="revenue-row">

              <strong>
                ${escapeHtml(
                  formatStatus(
                    item.type,
                  ),
                )}
              </strong>

              <span>
                Gross:
                ৳${formatMoney(
                  item.grossAmount,
                )}
              </span>

              <span>
                ${formatMoney(
                  item.percent,
                )}%
              </span>

              <strong class="revenue-amount">
                ৳${formatMoney(
                  item.amount,
                )}
              </strong>

            </article>
          `,
        )
        .join("");
  }

  const proof =
    draw.proof || {};

  const proofItems = [
    [
      "Seed Commitment",
      proof.seedCommitment,
    ],

    [
      "Ticket Set Hash",
      proof.ticketSetHash,
    ],

    [
      "Shuffle Proof Hash",
      proof.shuffleProofHash,
    ],

    [
      "Revealed Seed",
      proof.revealedSeed,
    ],
  ];

  elements.detailsProofGrid
    .innerHTML =
    proofItems
      .map(
        ([
          label,
          value,
        ]) => `
          <article class="proof-item">

            <span>
              ${escapeHtml(
                label,
              )}
            </span>

            <code>
              ${escapeHtml(
                value ||
                  "Not available yet",
              )}
            </code>

          </article>
        `,
      )
      .join("");
}

async function openDrawDetails(
  drawId,
) {
  showLoader(
    "Loading draw details...",
  );

  try {
    const result =
      await apiRequest(
        `/${drawId}?limit=100`,
      );

    renderDrawDetails(
      result?.data || {},
    );

    openModal(
      elements
        .drawDetailsModal,
    );
  } catch (error) {
    showToast(
      "error",
      "Details failed",
      error.message,
    );
  } finally {
    hideLoader();
  }
}

/* ==========================================
   Admin Actions
========================================== */

function clearPendingAction() {
  state.pendingAction =
    null;

  state.pendingActionDraw =
    null;

  state.selectedDrawId =
    null;

  elements.cancelReasonInput
    .value = "";

  elements.cancelReasonGroup
    .hidden = true;

  elements.actionModalIcon
    .classList.remove(
      "is-danger",
      "is-draw",
    );
}

function openActionConfirmation(
  action,
  draw,
) {
  if (!draw) {
    return;
  }

  state.pendingAction =
    action;

  state.pendingActionDraw =
    draw;

  state.selectedDrawId =
    Number(draw.drawId);

  elements.cancelReasonInput
    .value = "";

  elements.cancelReasonGroup
    .hidden =
    action !==
    "cancel";

  elements.actionModalIcon
    .classList.remove(
      "is-danger",
      "is-draw",
    );

  if (
    action ===
    "open"
  ) {
    elements.actionConfirmTitle
      .textContent =
      "Open Ticket Sales?";

    elements.actionConfirmMessage
      .textContent =
      `${draw.title} will become visible to players.`;

    elements.confirmActionBtn
      .className =
      "primary-btn";

    elements.confirmActionBtn
      .innerHTML = `
        <i class="fa-solid fa-door-open"></i>
        Open Sales
      `;
  }

  if (
    action ===
    "draw"
  ) {
    elements.actionConfirmTitle
      .textContent =
      "Run Fair Draw?";

    elements.actionConfirmMessage
      .textContent =
      "The server will cryptographically shuffle locked tickets and immediately pay three unique winners.";

    elements.actionModalIcon
      .classList.add(
        "is-draw",
      );

    elements.confirmActionBtn
      .className =
      "primary-btn";

    elements.confirmActionBtn
      .innerHTML = `
        <i class="fa-solid fa-shuffle"></i>
        Run Fair Draw
      `;
  }

  if (
    action ===
    "cancel"
  ) {
    elements.actionConfirmTitle
      .textContent =
      "Cancel This Draw?";

    elements.actionConfirmMessage
      .textContent =
      "Eligible active or locked tickets will receive a full refund. Player-cancelled ticket fees will not be returned.";

    elements.actionModalIcon
      .classList.add(
        "is-danger",
      );

    elements.confirmActionBtn
      .className =
      "danger-btn";

    elements.confirmActionBtn
      .innerHTML = `
        <i class="fa-solid fa-ban"></i>
        Cancel & Refund
      `;
  }

  openModal(
    elements
      .actionConfirmModal,
  );
}

async function confirmPendingAction() {
  const action =
    state.pendingAction;

  const drawId =
    state.selectedDrawId;

  if (
    !action ||
    !drawId
  ) {
    return;
  }

  let endpoint = "";

  let body = null;

  let loaderText =
    "Processing Lottery action...";

  if (
    action ===
    "open"
  ) {
    endpoint =
      `/${drawId}/open`;

    loaderText =
      "Opening ticket sales...";
  }

  if (
    action ===
    "draw"
  ) {
    endpoint =
      `/${drawId}/draw`;

    loaderText =
      "Running cryptographic fair draw...";
  }

  if (
    action ===
    "cancel"
  ) {
    const reason =
      elements
        .cancelReasonInput
        .value
        .trim();

    if (
      reason.length < 5
    ) {
      showToast(
        "error",
        "Reason required",
        "Enter a clear cancellation reason.",
      );

      elements.cancelReasonInput
        .focus();

      return;
    }

    endpoint =
      `/${drawId}/cancel`;

    body = {
      reason,
    };

    loaderText =
      "Cancelling draw and processing refunds...";
  }

  elements.confirmActionBtn
    .disabled = true;

  showLoader(
    loaderText,
  );

  try {
    const result =
      await apiRequest(
        endpoint,
        {
          method:
            "PATCH",

          body,
        },
      );

    closeModal(
      elements
        .actionConfirmModal,
    );

    const successMessages = {
      open:
        "Lottery ticket sales opened successfully.",

      draw:
        "Fair draw completed and winners were paid.",

      cancel:
        "Lottery draw cancelled and eligible tickets refunded.",
    };

    showToast(
      "success",
      "Action completed",
      successMessages[action],
    );

    clearPendingAction();

    await loadDraws(
      false,
    );

    if (
      action ===
      "draw"
    ) {
      await openDrawDetails(
        drawId,
      );
    }

    console.log(
      "Lottery action result:",
      result,
    );
  } catch (error) {
    showToast(
      "error",
      "Action failed",
      error.message,
    );
  } finally {
    elements.confirmActionBtn
      .disabled = false;

    hideLoader();
  }
}

/* ==========================================
   Table Action Handler
========================================== */

function handleDrawTableAction(
  event,
) {
  const button =
    event.target.closest(
      "[data-action][data-draw-id]",
    );

  if (
    !button ||
    button.disabled
  ) {
    return;
  }

  const action =
    button.dataset.action;

  const drawId =
    Number(
      button.dataset
        .drawId,
    );

  const draw =
    getDrawById(
      drawId,
    );

  if (
    action ===
    "view"
  ) {
    openDrawDetails(
      drawId,
    );

    return;
  }

  if (
    [
      "open",
      "draw",
      "cancel",
    ].includes(action)
  ) {
    openActionConfirmation(
      action,
      draw,
    );
  }
}

/* ==========================================
   Events
========================================== */

function addEventListeners() {
  elements.sidebarOpenBtn
    .addEventListener(
      "click",
      openSidebar,
    );

  elements.sidebarCloseBtn
    .addEventListener(
      "click",
      closeSidebar,
    );

  elements.sidebarOverlay
    .addEventListener(
      "click",
      closeSidebar,
    );

  elements.logoutBtn
    .addEventListener(
      "click",
      logout,
    );

  elements.refreshDrawsBtn
    .addEventListener(
      "click",
      () =>
        loadDraws(),
    );

  elements.openCreateDrawBtn
    .addEventListener(
      "click",
      openCreateDrawModal,
    );

  elements.closeCreateDrawModalBtn
    .addEventListener(
      "click",
      () =>
        closeModal(
          elements
            .createDrawModal,
        ),
    );

  elements.cancelCreateDrawBtn
    .addEventListener(
      "click",
      () =>
        closeModal(
          elements
            .createDrawModal,
        ),
    );

  elements.closeDrawDetailsModalBtn
    .addEventListener(
      "click",
      () =>
        closeModal(
          elements
            .drawDetailsModal,
        ),
    );

  elements.cancelActionBtn
    .addEventListener(
      "click",
      () => {
        closeModal(
          elements
            .actionConfirmModal,
        );

        clearPendingAction();
      },
    );

  elements.confirmActionBtn
    .addEventListener(
      "click",
      confirmPendingAction,
    );

  elements.createDrawForm
    .addEventListener(
      "submit",
      handleCreateDraw,
    );

  elements.drawTableBody
    .addEventListener(
      "click",
      handleDrawTableAction,
    );

  elements.drawSearchInput
    .addEventListener(
      "input",
      (event) => {
        window.clearTimeout(
          state.searchTimer,
        );

        state.searchTimer =
          window.setTimeout(
            () => {
              state.search =
                event.target
                  .value
                  .trim();

              state.currentPage =
                1;

              loadDraws();
            },
            450,
          );
      },
    );

  elements.drawStatusFilter
    .addEventListener(
      "change",
      (event) => {
        state.status =
          event.target.value;

        state.currentPage =
          1;

        loadDraws();
      },
    );

  elements.ticketPriceFilter
    .addEventListener(
      "change",
      (event) => {
        state.ticketPrice =
          event.target.value;

        state.currentPage =
          1;

        loadDraws();
      },
    );

  elements.previousPageBtn
    .addEventListener(
      "click",
      () => {
        if (
          state.currentPage >
          1
        ) {
          state.currentPage -=
            1;

          loadDraws();
        }
      },
    );

  elements.nextPageBtn
    .addEventListener(
      "click",
      () => {
        if (
          state.currentPage <
          state.totalPages
        ) {
          state.currentPage +=
            1;

          loadDraws();
        }
      },
    );

  [
    elements.ticketPriceInput,
    elements.targetQuantityInput,
    elements.firstPrizeInput,
    elements.secondPrizeInput,
    elements.thirdPrizeInput,
    elements.serviceChargeInput,
  ].forEach(
    (input) =>
      input.addEventListener(
        "input",
        calculateCreatePreview,
      ),
  );

  document
    .querySelectorAll(
      ".modal",
    )
    .forEach(
      (modal) => {
        modal.addEventListener(
          "click",
          (event) => {
            if (
              event.target ===
              modal
            ) {
              closeModal(
                modal,
              );

              if (
                modal ===
                elements
                  .actionConfirmModal
              ) {
                clearPendingAction();
              }
            }
          },
        );
      },
    );

  document.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key !==
        "Escape"
      ) {
        return;
      }

      document
        .querySelectorAll(
          ".modal.show",
        )
        .forEach(
          closeModal,
        );

      clearPendingAction();

      closeSidebar();
    },
  );

  document.addEventListener(
    "visibilitychange",
    () => {
      if (
        document
          .visibilityState ===
        "visible"
      ) {
        loadDraws(
          false,
        );
      }
    },
  );

  window.addEventListener(
    "beforeunload",
    () => {
      if (
        state.countdownTimer
      ) {
        window.clearInterval(
          state.countdownTimer,
        );
      }

      if (
        state.refreshTimer
      ) {
        window.clearInterval(
          state.refreshTimer,
        );
      }
    },
  );
}

/* ==========================================
   Initialize
========================================== */

async function initializePage() {
  if (
    !checkAuthentication()
  ) {
    return;
  }

  addEventListeners();

  resetCreateDrawForm();

  state.countdownTimer =
    window.setInterval(
      refreshCountdowns,
      1000,
    );

  await loadDraws();

  state.refreshTimer =
    window.setInterval(
      () => {
        if (
          document
            .visibilityState ===
            "visible"
        ) {
          loadDraws(
            false,
          );
        }
      },
      15000,
    );
}

document.addEventListener(
  "DOMContentLoaded",
  initializePage,
);

/* LOT5C-3 END */