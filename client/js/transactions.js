"use strict";

const API_BASE_URL =
  APP_CONFIG.API_URL;

const PDF_RECORD_LIMIT = 1000;

const historyState = {
  view: "transactions",

  page: 1,
  limit: 10,
  totalPages: 1,

  search: "",
  type: "all",
  status: "all",
  method: "all",

  startDate: "",
  endDate: "",

  currentRows: [],
};

const HISTORY_CONFIG = {
  transactions: {
    title:
      "Deposit & Withdrawal Transactions",

    description:
      "Complete deposit and withdrawal request history",

    endpoint:
      "/admin/transactions",

    pdfEnabled: false,
    showType: true,
    showStatus: true,
    showMethod: true,
    showDates: false,

    typeOptions: [
      ["all", "All Types"],
      ["deposit", "Deposit"],
      ["withdraw", "Withdraw"],
    ],

    statusOptions: [
      ["all", "All Status"],
      ["pending", "Pending"],
      ["approved", "Approved"],
      ["rejected", "Rejected"],
    ],
  },

  bonuses: {
    title:
      "Bonus Payment History",

    description:
      "First deposit and referral bonus payment records",

    endpoint:
      "/admin/transactions/bonuses",

    pdfEnabled: true,
    showType: true,
    showStatus: false,
    showMethod: false,
    showDates: true,

    typeOptions: [
      ["all", "All Bonus Types"],
      ["first_deposit", "First Deposit Bonus"],
      ["referrer_bonus", "Referrer Bonus"],
      [
        "referred_user_bonus",
        "New User Bonus",
      ],
    ],
  },

  referrals: {
    title:
      "Referral Program History",

    description:
      "Referral relations, qualifying deposits and rewards",

    endpoint:
      "/admin/transactions/referrals",

    pdfEnabled: true,
    showType: false,
    showStatus: true,
    showMethod: false,
    showDates: true,

    statusOptions: [
      ["all", "All Status"],
      ["pending", "Pending"],
      ["rewarded", "Rewarded"],
      ["cancelled", "Cancelled"],
    ],
  },
};

/* =========================
   General Helpers
========================= */

function getToken() {
  return localStorage.getItem(
    "access_token",
  );
}

function setText(id, value) {
  const element =
    document.getElementById(id);

  if (element) {
    element.textContent = value;
  }
}

function formatMoney(value) {
  return Number(value || 0)
    .toLocaleString("en-BD", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
}

function formatDate(value) {
  if (!value) {
    return "-";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return String(value);
  }

  return date.toLocaleString(
    "en-BD",
  );
}

function formatPdfDate(value) {
  if (!value) {
    return "-";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return String(value);
  }

  return date.toLocaleString(
    "en-BD",
    {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    },
  );
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll(
      "'",
      "&#039;",
    );
}

function showLoader() {
  document
    .getElementById(
      "loaderOverlay",
    )
    ?.classList.add("show");
}

function hideLoader() {
  document
    .getElementById(
      "loaderOverlay",
    )
    ?.classList.remove("show");
}

function showToast(
  message,
  type = "success",
) {
  const toast =
    document.getElementById(
      "toast",
    );

  const toastMessage =
    document.getElementById(
      "toastMessage",
    );

  if (
    !toast ||
    !toastMessage
  ) {
    return;
  }

  toastMessage.textContent =
    message;

  toast.classList.remove(
    "show",
    "success",
    "error",
  );

  toast.classList.add(
    type,
    "show",
  );

  window.clearTimeout(
    showToast.timeoutId,
  );

  showToast.timeoutId =
    window.setTimeout(() => {
      toast.classList.remove(
        "show",
      );
    }, 3200);
}

async function apiRequest(url) {
  const token =
    getToken();

  if (!token) {
    window.location.href =
      "/login";

    throw new Error(
      "Admin login required.",
    );
  }

  const response =
    await fetch(url, {
      headers: {
        Authorization:
          `Bearer ${token}`,

        Accept:
          "application/json",
      },
    });

  const contentType =
    response.headers.get(
      "content-type",
    ) || "";

  let result;

  if (
    contentType.includes(
      "application/json",
    )
  ) {
    result =
      await response.json();
  } else {
    const responseText =
      await response.text();

    throw new Error(
      responseText ||
      "Invalid server response.",
    );
  }

  if (
    response.status === 401 ||
    response.status === 403
  ) {
    localStorage.removeItem(
      "access_token",
    );

   window.location.href =
  "/login";

    throw new Error(
      "Login session expired.",
    );
  }

  if (
    !response.ok ||
    !result.success
  ) {
    throw new Error(
      result.message ||
      "Request failed.",
    );
  }

  return result;
}

function setSelectOptions(
  elementId,
  options,
  selectedValue = "all",
) {
  const select =
    document.getElementById(
      elementId,
    );

  if (!select) {
    return;
  }

  select.innerHTML =
    (options || [])
      .map(
        ([value, label]) => `
          <option value="${escapeHtml(value)}">
            ${escapeHtml(label)}
          </option>
        `,
      )
      .join("");

  select.value =
    selectedValue;
}

function setHidden(
  elementId,
  hidden,
) {
  document
    .getElementById(
      elementId,
    )
    ?.classList.toggle(
      "is-hidden",
      hidden,
    );
}

/* =========================
   View Configuration
========================= */

function configureHistoryView() {
  const config =
    HISTORY_CONFIG[
      historyState.view
    ];

  setText(
    "historyViewTitle",
    config.title,
  );

  setText(
    "historyViewDescription",
    config.description,
  );

  document
    .querySelectorAll(
      ".history-tab",
    )
    .forEach((button) => {
      const isActive =
        button.dataset
          .historyView ===
        historyState.view;

      button.classList.toggle(
        "active",
        isActive,
      );

      button.setAttribute(
        "aria-pressed",
        String(isActive),
      );
    });

  setHidden(
    "transactionSummaryGrid",
    historyState.view !==
      "transactions",
  );

  setHidden(
    "bonusSummaryGrid",
    historyState.view !==
      "bonuses",
  );

  setHidden(
    "referralSummaryGrid",
    historyState.view !==
      "referrals",
  );

  setHidden(
    "downloadHistoryPdf",
    !config.pdfEnabled,
  );

  setHidden(
    "historyTypeFilter",
    !config.showType,
  );

  setHidden(
    "historyStatusFilter",
    !config.showStatus,
  );

  setHidden(
    "historyMethodFilter",
    !config.showMethod,
  );

  setHidden(
    "historyStartDateField",
    !config.showDates,
  );

  setHidden(
    "historyEndDateField",
    !config.showDates,
  );

  if (config.showType) {
    setSelectOptions(
      "historyTypeFilter",
      config.typeOptions,
      historyState.type,
    );
  }

  if (config.showStatus) {
    setSelectOptions(
      "historyStatusFilter",
      config.statusOptions,
      historyState.status,
    );
  }

  renderHistoryTableHead();
}

function resetStateForView() {
  historyState.page = 1;
  historyState.limit = 10;
  historyState.totalPages = 1;

  historyState.search = "";
  historyState.type = "all";
  historyState.status = "all";
  historyState.method = "all";

  historyState.startDate = "";
  historyState.endDate = "";
  historyState.currentRows = [];

  const searchInput =
    document.getElementById(
      "historySearch",
    );

  if (searchInput) {
    searchInput.value = "";
  }

  const startDateInput =
    document.getElementById(
      "historyStartDate",
    );

  if (startDateInput) {
    startDateInput.value = "";
  }

  const endDateInput =
    document.getElementById(
      "historyEndDate",
    );

  if (endDateInput) {
    endDateInput.value = "";
  }

  const methodInput =
    document.getElementById(
      "historyMethodFilter",
    );

  if (methodInput) {
    methodInput.value = "all";
  }

  const limitInput =
    document.getElementById(
      "historyPageLimit",
    );

  if (limitInput) {
    limitInput.value = "10";
  }
}

async function changeHistoryView(
  view,
) {
  if (
    !HISTORY_CONFIG[view] ||
    historyState.view === view
  ) {
    return;
  }

  historyState.view = view;

  resetStateForView();
  configureHistoryView();

  await loadCurrentHistory();
}

/* =========================
   URL & Filters
========================= */

function buildHistoryUrl(
  overrides = {},
) {
  const config =
    HISTORY_CONFIG[
      historyState.view
    ];

  const page =
    Number(
      overrides.page ??
      historyState.page,
    );

  const limit =
    Number(
      overrides.limit ??
      historyState.limit,
    );

  const params =
    new URLSearchParams({
      page:
        String(page),

      limit:
        String(limit),

      search:
        historyState.search,
    });

  if (config.showType) {
    params.set(
      "type",
      historyState.type,
    );
  }

  if (config.showStatus) {
    params.set(
      "status",
      historyState.status,
    );
  }

  if (config.showMethod) {
    params.set(
      "method",
      historyState.method,
    );
  }

  if (config.showDates) {
    params.set(
      "startDate",
      historyState.startDate,
    );

    params.set(
      "endDate",
      historyState.endDate,
    );
  }

  return (
    `${API_BASE_URL}` +
    `${config.endpoint}` +
    `?${params.toString()}`
  );
}

function readHistoryFilters() {
  historyState.search =
    document.getElementById(
      "historySearch",
    )?.value.trim() || "";

  historyState.type =
    document.getElementById(
      "historyTypeFilter",
    )?.value || "all";

  historyState.status =
    document.getElementById(
      "historyStatusFilter",
    )?.value || "all";

  historyState.method =
    document.getElementById(
      "historyMethodFilter",
    )?.value || "all";

  historyState.startDate =
    document.getElementById(
      "historyStartDate",
    )?.value || "";

  historyState.endDate =
    document.getElementById(
      "historyEndDate",
    )?.value || "";

  historyState.limit =
    Number(
      document.getElementById(
        "historyPageLimit",
      )?.value || 10,
    );

  if (
    historyState.startDate &&
    historyState.endDate &&
    historyState.startDate >
      historyState.endDate
  ) {
    showToast(
      "Start date cannot be after end date.",
      "error",
    );

    return false;
  }

  return true;
}

function applyHistoryFilters() {
  if (!readHistoryFilters()) {
    return;
  }

  historyState.page = 1;

  loadCurrentHistory();
}

function resetHistoryFilters() {
  resetStateForView();
  configureHistoryView();

  loadCurrentHistory();
}

/* =========================
   Summary Loading
========================= */

async function loadTransactionSummary() {
  const result =
    await apiRequest(
      `${API_BASE_URL}/admin/transactions/summary`,
    );

  const summary =
    result.data || {};

  setText(
    "totalTransactions",
    summary.totalCount || 0,
  );

  setText(
    "approvedDeposits",
    formatMoney(
      summary.approvedDeposit,
    ),
  );

  setText(
    "approvedWithdrawals",
    formatMoney(
      summary.approvedWithdraw,
    ),
  );

  setText(
    "netCashFlow",
    formatMoney(
      summary.netCashFlow,
    ),
  );

  setText(
    "pendingTransactions",
    summary.pendingCount || 0,
  );
}

function updateBonusSummary(
  summary,
) {
  setText(
    "totalBonusRecords",
    summary.totalRecords || 0,
  );

  setText(
    "totalBonusPaid",
    formatMoney(
      summary.totalBonusPaid,
    ),
  );

  setText(
    "firstDepositBonusPaid",
    formatMoney(
      summary.firstDepositBonusPaid,
    ),
  );

  setText(
    "referrerBonusPaid",
    formatMoney(
      summary.referrerBonusPaid,
    ),
  );

  setText(
    "referredUserBonusPaid",
    formatMoney(
      summary.referredUserBonusPaid,
    ),
  );
}

function updateReferralSummary(
  summary,
) {
  setText(
    "historyTotalReferrals",
    summary.totalReferrals || 0,
  );

  setText(
    "historyPendingReferrals",
    summary.pendingReferrals || 0,
  );

  setText(
    "historyRewardedReferrals",
    summary.rewardedReferrals || 0,
  );

  setText(
    "historyCancelledReferrals",
    summary.cancelledReferrals || 0,
  );

  setText(
    "historyReferralBonusPaid",
    formatMoney(
      summary.totalBonusPaid,
    ),
  );
}

/* =========================
   History Loading
========================= */

function getRowsFromData(data) {
  if (
    historyState.view ===
    "transactions"
  ) {
    return data.transactions || [];
  }

  if (
    historyState.view ===
    "bonuses"
  ) {
    return data.bonuses || [];
  }

  return data.referrals || [];
}

async function loadCurrentHistory(
  options = {},
) {
  const shouldShowLoader =
    options.showLoader !== false;

  try {
    if (shouldShowLoader) {
      showLoader();
    }

    const result =
      await apiRequest(
        buildHistoryUrl(),
      );

    const data =
      result.data || {};

    const rows =
      getRowsFromData(data);

    historyState.currentRows =
      rows;

    if (
      historyState.view ===
      "bonuses"
    ) {
      updateBonusSummary(
        data.summary || {},
      );
    }

    if (
      historyState.view ===
      "referrals"
    ) {
      updateReferralSummary(
        data.summary || {},
      );
    }

    renderCurrentRows(rows);

    updatePagination(
      data.pagination || {},
    );
  } catch (error) {
    console.error(
      "HISTORY LOAD ERROR:",
      error,
    );

    historyState.currentRows = [];

    renderCurrentRows([]);

    showToast(
      error.message ||
      "History load failed.",
      "error",
    );
  } finally {
    if (shouldShowLoader) {
      hideLoader();
    }
  }
}

/* =========================
   Table Head
========================= */

function renderHistoryTableHead() {
  const tableHead =
    document.getElementById(
      "historyTableHead",
    );

  if (!tableHead) {
    return;
  }

  if (
    historyState.view ===
    "transactions"
  ) {
    tableHead.innerHTML = `
      <tr>
        <th>Transaction ID</th>
        <th>User</th>
        <th>Type</th>
        <th>Method</th>
        <th>Account</th>
        <th>Amount</th>
        <th>Status</th>
        <th>Date</th>
      </tr>
    `;

    return;
  }

  if (
    historyState.view ===
    "bonuses"
  ) {
    tableHead.innerHTML = `
      <tr>
        <th>Reference</th>
        <th>User</th>
        <th>Bonus Type</th>
        <th>Related User</th>
        <th>Qualifying Amount</th>
        <th>Bonus Amount</th>
        <th>Awarded At</th>
      </tr>
    `;

    return;
  }

  tableHead.innerHTML = `
    <tr>
      <th>Referral Code</th>
      <th>Referrer</th>
      <th>New User</th>
      <th>Qualifying Deposit</th>
      <th>Bonus Paid</th>
      <th>Status</th>
      <th>Date</th>
    </tr>
  `;
}

/* =========================
   Table Rows
========================= */

function renderCurrentRows(rows) {
  if (
    historyState.view ===
    "transactions"
  ) {
    renderTransactionRows(rows);
    return;
  }

  if (
    historyState.view ===
    "bonuses"
  ) {
    renderBonusRows(rows);
    return;
  }

  renderReferralRows(rows);
}

function renderEmptyRow(
  colspan,
  message,
) {
  const tableBody =
    document.getElementById(
      "historyTableBody",
    );

  if (!tableBody) {
    return;
  }

  tableBody.innerHTML = `
    <tr>
      <td
        colspan="${colspan}"
        class="empty-cell">
        ${escapeHtml(message)}
      </td>
    </tr>
  `;
}

function renderTransactionRows(
  transactions,
) {
  const tableBody =
    document.getElementById(
      "historyTableBody",
    );

  if (!tableBody) {
    return;
  }

  if (
    !Array.isArray(transactions) ||
    transactions.length === 0
  ) {
    renderEmptyRow(
      8,
      "No transactions found.",
    );

    return;
  }

  tableBody.innerHTML =
    transactions
      .map((transaction) => {
        const typeClass =
          transaction.type ===
          "deposit"
            ? "deposit"
            : "withdraw";

        const userName =
          transaction.full_name ||
          transaction.username ||
          "Unknown User";

        return `
          <tr>
            <td>
              <strong>
                ${escapeHtml(
                  transaction
                    .transaction_id,
                )}
              </strong>

              <small>
                ${escapeHtml(
                  transaction
                    .reference_number ||
                  "-",
                )}
              </small>
            </td>

            <td>
              <strong>
                ${escapeHtml(userName)}
              </strong>

              <small>
                ${escapeHtml(
                  transaction.uid ||
                  "-",
                )}
              </small>
            </td>

            <td>
              <span
                class="type-badge ${typeClass}">
                ${escapeHtml(
                  transaction.type,
                )}
              </span>
            </td>

            <td>
              ${escapeHtml(
                transaction.method ||
                "-",
              )}
            </td>

            <td>
              ${escapeHtml(
                transaction
                  .account_number ||
                "-",
              )}
            </td>

            <td>
              <strong class="history-amount">
                ৳${formatMoney(
                  transaction.amount,
                )}
              </strong>
            </td>

            <td>
              <span
                class="status-badge ${escapeHtml(
                  transaction.status,
                )}">
                ${escapeHtml(
                  transaction.status,
                )}
              </span>
            </td>

            <td>
              ${escapeHtml(
                formatDate(
                  transaction.created_at,
                ),
              )}
            </td>
          </tr>
        `;
      })
      .join("");
}

function getBonusTypeLabel(type) {
  const labels = {
    first_deposit:
      "First Deposit",

    referrer_bonus:
      "Referrer Bonus",

    referred_user_bonus:
      "New User Bonus",
  };

  return labels[type] || type;
}

function getBonusTypeClass(type) {
  return String(type || "")
    .replaceAll("_", "-");
}

function renderBonusRows(
  bonuses,
) {
  const tableBody =
    document.getElementById(
      "historyTableBody",
    );

  if (!tableBody) {
    return;
  }

  if (
    !Array.isArray(bonuses) ||
    bonuses.length === 0
  ) {
    renderEmptyRow(
      7,
      "No bonus history found.",
    );

    return;
  }

  tableBody.innerHTML =
    bonuses
      .map((bonus) => {
        const user =
          bonus.user || {};

        const relatedUser =
          bonus.relatedUser;

        const userName =
          user.fullName ||
          user.username ||
          "Unknown User";

        const relatedName =
          relatedUser
            ? (
                relatedUser.fullName ||
                relatedUser.username ||
                relatedUser.uid ||
                "-"
              )
            : "-";

        return `
          <tr>
            <td>
              <strong class="history-reference">
                ${escapeHtml(
                  bonus.referenceCode ||
                  bonus.historyKey ||
                  "-",
                )}
              </strong>

              <small>
                ${escapeHtml(
                  bonus.referenceType ||
                  "-",
                )}
              </small>
            </td>

            <td class="history-user-cell">
              <strong>
                ${escapeHtml(userName)}
              </strong>

              <small>
                ${escapeHtml(
                  user.uid || "-",
                )}
              </small>
            </td>

            <td>
              <span
                class="type-badge ${getBonusTypeClass(
                  bonus.bonusType,
                )}">
                ${escapeHtml(
                  getBonusTypeLabel(
                    bonus.bonusType,
                  ),
                )}
              </span>
            </td>

            <td class="history-related-user">
              <strong>
                ${escapeHtml(relatedName)}
              </strong>

              <small>
                ${escapeHtml(
                  relatedUser?.uid ||
                  "-",
                )}
              </small>
            </td>

            <td>
              ৳${formatMoney(
                bonus.qualifyingAmount,
              )}

              ${
                bonus.bonusType ===
                "first_deposit"
                  ? `
                    <small>
                      ${escapeHtml(
                        bonus
                          .settingsSnapshot
                          ?.bonusPercent ||
                        0,
                      )}% bonus
                    </small>
                  `
                  : ""
              }
            </td>

            <td>
              <strong class="history-amount">
                ৳${formatMoney(
                  bonus.bonusAmount,
                )}
              </strong>
            </td>

            <td>
              ${escapeHtml(
                formatDate(
                  bonus.awardedAt,
                ),
              )}
            </td>
          </tr>
        `;
      })
      .join("");
}

function renderReferralRows(
  referrals,
) {
  const tableBody =
    document.getElementById(
      "historyTableBody",
    );

  if (!tableBody) {
    return;
  }

  if (
    !Array.isArray(referrals) ||
    referrals.length === 0
  ) {
    renderEmptyRow(
      7,
      "No referral history found.",
    );

    return;
  }

  tableBody.innerHTML =
    referrals
      .map((referral) => {
        const referrer =
          referral.referrer || {};

        const referredUser =
          referral.referredUser || {};

        const deposit =
          referral.qualifyingDeposit;

        const referrerName =
          referrer.fullName ||
          referrer.username ||
          "Unknown User";

        const referredName =
          referredUser.fullName ||
          referredUser.username ||
          "Unknown User";

        return `
          <tr>
            <td>
              <strong class="history-reference">
                ${escapeHtml(
                  referral.referralCode ||
                  "-",
                )}
              </strong>
            </td>

            <td class="history-user-cell">
              <strong>
                ${escapeHtml(
                  referrerName,
                )}
              </strong>

              <small>
                ${escapeHtml(
                  referrer.uid || "-",
                )}
              </small>
            </td>

            <td class="history-related-user">
              <strong>
                ${escapeHtml(
                  referredName,
                )}
              </strong>

              <small>
                ${escapeHtml(
                  referredUser.uid ||
                  "-",
                )}
              </small>
            </td>

            <td>
              ${
                deposit
                  ? `
                    <strong>
                      ${escapeHtml(
                        deposit.depositId ||
                        "-",
                      )}
                    </strong>

                    <small>
                      ৳${formatMoney(
                        deposit.amount,
                      )}
                    </small>
                  `
                  : "-"
              }
            </td>

            <td>
              <strong class="history-amount">
                ৳${formatMoney(
                  referral.totalBonusAmount,
                )}
              </strong>

              <small>
                Referrer:
                ৳${formatMoney(
                  referral
                    .referrerBonusAmount,
                )}
                · New:
                ৳${formatMoney(
                  referral
                    .referredBonusAmount,
                )}
              </small>
            </td>

            <td>
              <span
                class="status-badge ${escapeHtml(
                  referral.status,
                )}">
                ${escapeHtml(
                  referral.status,
                )}
              </span>
            </td>

            <td>
              ${escapeHtml(
                formatDate(
                  referral.rewardedAt ||
                  referral.createdAt,
                ),
              )}
            </td>
          </tr>
        `;
      })
      .join("");
}

/* =========================
   Pagination
========================= */

function updatePagination(
  pagination,
) {
  historyState.page =
    Number(
      pagination.page || 1,
    );

  historyState.totalPages =
    Number(
      pagination.totalPages || 1,
    );

  setText(
    "historyPaginationInfo",
    `Page ${historyState.page} of ` +
    `${historyState.totalPages}`,
  );

  const previousButton =
    document.getElementById(
      "historyPreviousPage",
    );

  const nextButton =
    document.getElementById(
      "historyNextPage",
    );

  if (previousButton) {
    previousButton.disabled =
      historyState.page <= 1;
  }

  if (nextButton) {
    nextButton.disabled =
      historyState.page >=
      historyState.totalPages;
  }
}

/* =========================
   PDF Export
========================= */

async function fetchPdfHistoryData() {
  const firstResult =
    await apiRequest(
      buildHistoryUrl({
        page: 1,
        limit: 100,
      }),
    );

  const firstData =
    firstResult.data || {};

  const rows = [
    ...getRowsFromData(firstData),
  ];

  const pagination =
    firstData.pagination || {};

  const totalPages =
    Math.min(
      Number(
        pagination.totalPages || 1,
      ),
      Math.ceil(
        PDF_RECORD_LIMIT / 100,
      ),
    );

  for (
    let page = 2;
    page <= totalPages;
    page += 1
  ) {
    const result =
      await apiRequest(
        buildHistoryUrl({
          page,
          limit: 100,
        }),
      );

    const pageRows =
      getRowsFromData(
        result.data || {},
      );

    rows.push(...pageRows);

    if (
      rows.length >=
      PDF_RECORD_LIMIT
    ) {
      break;
    }
  }

  return {
    rows:
      rows.slice(
        0,
        PDF_RECORD_LIMIT,
      ),

    summary:
      firstData.summary || {},

    total:
      Number(
        pagination.total || rows.length,
      ),
  };
}

function buildBonusPdfRows(
  rows,
) {
  return rows
    .map((bonus, index) => {
      const user =
        bonus.user || {};

      const relatedUser =
        bonus.relatedUser || {};

      return `
        <tr>
          <td>${index + 1}</td>

          <td>
            ${escapeHtml(
              bonus.referenceCode ||
              bonus.historyKey ||
              "-",
            )}
          </td>

          <td>
            ${escapeHtml(
              user.fullName ||
              user.username ||
              "-",
            )}
            <br>
            <small>
              ${escapeHtml(
                user.uid || "-",
              )}
            </small>
          </td>

          <td>
            ${escapeHtml(
              getBonusTypeLabel(
                bonus.bonusType,
              ),
            )}
          </td>

          <td>
            ${escapeHtml(
              relatedUser.fullName ||
              relatedUser.username ||
              relatedUser.uid ||
              "-",
            )}
          </td>

          <td>
            ৳${formatMoney(
              bonus.qualifyingAmount,
            )}
          </td>

          <td>
            ৳${formatMoney(
              bonus.bonusAmount,
            )}
          </td>

          <td>
            ${escapeHtml(
              formatPdfDate(
                bonus.awardedAt,
              ),
            )}
          </td>
        </tr>
      `;
    })
    .join("");
}

function buildReferralPdfRows(
  rows,
) {
  return rows
    .map((referral, index) => {
      const referrer =
        referral.referrer || {};

      const referredUser =
        referral.referredUser || {};

      const deposit =
        referral.qualifyingDeposit;

      return `
        <tr>
          <td>${index + 1}</td>

          <td>
            ${escapeHtml(
              referral.referralCode ||
              "-",
            )}
          </td>

          <td>
            ${escapeHtml(
              referrer.fullName ||
              referrer.username ||
              "-",
            )}
            <br>
            <small>
              ${escapeHtml(
                referrer.uid || "-",
              )}
            </small>
          </td>

          <td>
            ${escapeHtml(
              referredUser.fullName ||
              referredUser.username ||
              "-",
            )}
            <br>
            <small>
              ${escapeHtml(
                referredUser.uid ||
                "-",
              )}
            </small>
          </td>

          <td>
            ${escapeHtml(
              deposit?.depositId ||
              "-",
            )}
            <br>
            <small>
              ৳${formatMoney(
                deposit?.amount || 0,
              )}
            </small>
          </td>

          <td>
            ৳${formatMoney(
              referral.totalBonusAmount,
            )}
          </td>

          <td>
            ${escapeHtml(
              referral.status,
            )}
          </td>

          <td>
            ${escapeHtml(
              formatPdfDate(
                referral.rewardedAt ||
                referral.createdAt,
              ),
            )}
          </td>
        </tr>
      `;
    })
    .join("");
}

function buildPdfElement(
  exportData,
) {
  const container =
    document.createElement("div");

  container.className =
    "history-pdf-document";

  const isBonus =
    historyState.view ===
    "bonuses";

  const title =
    isBonus
      ? "TPL22 Bonus History"
      : "TPL22 Referral History";

  const summary =
    exportData.summary || {};

  const summaryHtml =
    isBonus
      ? `
        <div class="pdf-summary">
          <div>
            <span>Total Records</span>
            <strong>
              ${escapeHtml(
                summary.totalRecords ||
                0,
              )}
            </strong>
          </div>

          <div>
            <span>Total Bonus Paid</span>
            <strong>
              ৳${formatMoney(
                summary.totalBonusPaid,
              )}
            </strong>
          </div>

          <div>
            <span>First Deposit</span>
            <strong>
              ৳${formatMoney(
                summary
                  .firstDepositBonusPaid,
              )}
            </strong>
          </div>

          <div>
            <span>Referral Bonuses</span>
            <strong>
              ৳${formatMoney(
                Number(
                  summary.referrerBonusPaid ||
                  0,
                ) +
                Number(
                  summary
                    .referredUserBonusPaid ||
                  0,
                ),
              )}
            </strong>
          </div>
        </div>
      `
      : `
        <div class="pdf-summary">
          <div>
            <span>Total Referrals</span>
            <strong>
              ${escapeHtml(
                summary.totalReferrals ||
                0,
              )}
            </strong>
          </div>

          <div>
            <span>Pending</span>
            <strong>
              ${escapeHtml(
                summary.pendingReferrals ||
                0,
              )}
            </strong>
          </div>

          <div>
            <span>Rewarded</span>
            <strong>
              ${escapeHtml(
                summary.rewardedReferrals ||
                0,
              )}
            </strong>
          </div>

          <div>
            <span>Total Bonus Paid</span>
            <strong>
              ৳${formatMoney(
                summary.totalBonusPaid,
              )}
            </strong>
          </div>
        </div>
      `;

  const tableHead =
    isBonus
      ? `
        <tr>
          <th>#</th>
          <th>Reference</th>
          <th>User</th>
          <th>Bonus Type</th>
          <th>Related User</th>
          <th>Deposit</th>
          <th>Bonus</th>
          <th>Date</th>
        </tr>
      `
      : `
        <tr>
          <th>#</th>
          <th>Code</th>
          <th>Referrer</th>
          <th>New User</th>
          <th>Deposit</th>
          <th>Total Bonus</th>
          <th>Status</th>
          <th>Date</th>
        </tr>
      `;

  const tableRows =
    isBonus
      ? buildBonusPdfRows(
          exportData.rows,
        )
      : buildReferralPdfRows(
          exportData.rows,
        );

  container.innerHTML = `
    <style>
      .history-pdf-document {
        width: 1120px;
        padding: 34px;
        color: #172033;
        font-family:
          Arial,
          "Noto Sans Bengali",
          sans-serif;
        background: #ffffff;
      }

      .pdf-header {
        display: flex;
        justify-content: space-between;
        gap: 24px;
        padding-bottom: 20px;
        border-bottom: 3px solid #e1ab18;
      }

      .pdf-header h1,
      .pdf-header p {
        margin: 0;
      }

      .pdf-header h1 {
        color: #172033;
        font-size: 27px;
      }

      .pdf-header p {
        margin-top: 7px;
        color: #647085;
      }

      .pdf-generated {
        text-align: right;
        font-size: 12px;
        line-height: 1.6;
      }

      .pdf-summary {
        display: grid;
        grid-template-columns:
          repeat(4, 1fr);
        gap: 12px;
        margin: 20px 0;
      }

      .pdf-summary div {
        padding: 13px;
        border: 1px solid #d8dfeb;
        border-radius: 8px;
        background: #f5f7fa;
      }

      .pdf-summary span,
      .pdf-summary strong {
        display: block;
      }

      .pdf-summary span {
        color: #667085;
        font-size: 11px;
      }

      .pdf-summary strong {
        margin-top: 6px;
        color: #172033;
        font-size: 16px;
      }

      .pdf-history-table {
        width: 100%;
        border-collapse: collapse;
        table-layout: auto;
        font-size: 10px;
      }

      .pdf-history-table th,
      .pdf-history-table td {
        padding: 8px 7px;
        border: 1px solid #d8dfeb;
        text-align: left;
        vertical-align: top;
        word-break: break-word;
      }

      .pdf-history-table th {
        color: #172033;
        background: #f3c33c;
      }

      .pdf-history-table tr {
        page-break-inside: avoid;
      }

      .pdf-history-table small {
        color: #697386;
      }

      .pdf-footer-note {
        margin-top: 16px;
        color: #697386;
        font-size: 11px;
      }
    </style>

    <div class="pdf-header">
      <div>
        <h1>${escapeHtml(title)}</h1>

        <p>
          Filtered administrative history report
        </p>
      </div>

      <div class="pdf-generated">
        <strong>TPL22</strong><br>
        Generated:
        ${escapeHtml(
          formatPdfDate(
            new Date(),
          ),
        )}<br>
        Exported records:
        ${exportData.rows.length}
      </div>
    </div>

    ${summaryHtml}

    <table class="pdf-history-table">
      <thead>
        ${tableHead}
      </thead>

      <tbody>
        ${tableRows}
      </tbody>
    </table>

    <p class="pdf-footer-note">
      This report was generated from the live TPL22
      administrative database.
    </p>
  `;

  return container;
}

async function downloadHistoryPdf() {
  if (
    historyState.view ===
    "transactions"
  ) {
    return;
  }

  if (
    typeof window.html2pdf !==
    "function"
  ) {
    showToast(
      "PDF library could not be loaded.",
      "error",
    );

    return;
  }

  const button =
    document.getElementById(
      "downloadHistoryPdf",
    );

  let pdfElement = null;

  try {
    if (button) {
      button.disabled = true;

      button.innerHTML = `
        <i class="fa-solid fa-spinner fa-spin"></i>
        Preparing PDF...
      `;
    }

    showLoader();

    const exportData =
      await fetchPdfHistoryData();

    if (
      exportData.rows.length === 0
    ) {
      throw new Error(
        "No records are available for this PDF.",
      );
    }

    pdfElement =
      buildPdfElement(
        exportData,
      );

    pdfElement.style.position =
      "fixed";

    pdfElement.style.left =
      "-100000px";

    pdfElement.style.top = "0";

    document.body.appendChild(
      pdfElement,
    );

    const datePart =
      new Date()
        .toISOString()
        .slice(0, 10);

    const fileName =
      historyState.view ===
      "bonuses"
        ? `PMS_ADDA_Bonus_History_${datePart}.pdf`
        : `PMS_ADDA_Referral_History_${datePart}.pdf`;

    await window
      .html2pdf()
      .set({
        margin: [
          7,
          7,
          7,
          7,
        ],

        filename:
          fileName,

        image: {
          type: "jpeg",
          quality: 0.96,
        },

        html2canvas: {
          scale: 1.5,
          useCORS: true,
          backgroundColor:
            "#ffffff",
        },

        jsPDF: {
          unit: "mm",
          format: "a4",
          orientation:
            "landscape",
        },

        pagebreak: {
          mode: [
            "css",
            "legacy",
          ],

          avoid: [
            "tr",
            ".pdf-summary div",
          ],
        },
      })
      .from(pdfElement)
      .save();

    if (
      exportData.total >
      PDF_RECORD_LIMIT
    ) {
      showToast(
        `PDF downloaded with the latest ${PDF_RECORD_LIMIT} filtered records.`,
      );
    } else {
      showToast(
        "History PDF downloaded successfully.",
      );
    }
  } catch (error) {
    console.error(
      "PDF EXPORT ERROR:",
      error,
    );

    showToast(
      error.message ||
      "PDF download failed.",
      "error",
    );
  } finally {
    pdfElement?.remove();

    if (button) {
      button.disabled = false;

      button.innerHTML = `
        <i class="fa-solid fa-file-pdf"></i>
        Download PDF
      `;
    }

    hideLoader();
  }
}

/* =========================
   Sidebar & Logout
========================= */

function toggleSidebar() {
  document
    .getElementById(
      "adminSidebar",
    )
    ?.classList.toggle("open");

  document
    .getElementById(
      "sidebarOverlay",
    )
    ?.classList.toggle("show");
}

function closeSidebar() {
  document
    .getElementById(
      "adminSidebar",
    )
    ?.classList.remove("open");

  document
    .getElementById(
      "sidebarOverlay",
    )
    ?.classList.remove("show");
}

function logoutAdmin() {
  localStorage.removeItem(
    "access_token",
  );

  localStorage.removeItem(
    "refresh_token",
  );

  localStorage.removeItem(
    "user",
  );

  window.location.href =
    "/login";
}

/* =========================
   Events
========================= */

function bindEvents() {
  let searchTimer = null;

  document
    .querySelector(
      ".history-tabs",
    )
    ?.addEventListener(
      "click",
      (event) => {
        const button =
          event.target.closest(
            "[data-history-view]",
          );

        if (!button) {
          return;
        }

        changeHistoryView(
          button.dataset
            .historyView,
        );
      },
    );

  document
    .getElementById(
      "historySearch",
    )
    ?.addEventListener(
      "input",
      () => {
        window.clearTimeout(
          searchTimer,
        );

        searchTimer =
          window.setTimeout(
            applyHistoryFilters,
            400,
          );
      },
    );

  [
    "historyTypeFilter",
    "historyStatusFilter",
    "historyMethodFilter",
    "historyStartDate",
    "historyEndDate",
    "historyPageLimit",
  ].forEach((elementId) => {
    document
      .getElementById(
        elementId,
      )
      ?.addEventListener(
        "change",
        applyHistoryFilters,
      );
  });

  document
    .getElementById(
      "resetHistoryFilters",
    )
    ?.addEventListener(
      "click",
      resetHistoryFilters,
    );

  document
    .getElementById(
      "historyPreviousPage",
    )
    ?.addEventListener(
      "click",
      () => {
        if (
          historyState.page > 1
        ) {
          historyState.page -= 1;

          loadCurrentHistory();
        }
      },
    );

  document
    .getElementById(
      "historyNextPage",
    )
    ?.addEventListener(
      "click",
      () => {
        if (
          historyState.page <
          historyState.totalPages
        ) {
          historyState.page += 1;

          loadCurrentHistory();
        }
      },
    );

  document
    .getElementById(
      "refreshTransactions",
    )
    ?.addEventListener(
      "click",
      async () => {
        try {
          showLoader();

          if (
            historyState.view ===
            "transactions"
          ) {
            await Promise.all([
              loadTransactionSummary(),

              loadCurrentHistory({
                showLoader: false,
              }),
            ]);
          } else {
            await loadCurrentHistory({
              showLoader: false,
            });
          }

          showToast(
            "History refreshed successfully.",
          );
        } catch (error) {
          console.error(
            "HISTORY REFRESH ERROR:",
            error,
          );

          showToast(
            error.message ||
            "History refresh failed.",
            "error",
          );
        } finally {
          hideLoader();
        }
      },
    );

  document
    .getElementById(
      "downloadHistoryPdf",
    )
    ?.addEventListener(
      "click",
      downloadHistoryPdf,
    );

  document
    .getElementById(
      "sidebarToggle",
    )
    ?.addEventListener(
      "click",
      toggleSidebar,
    );

  document
    .getElementById(
      "sidebarOverlay",
    )
    ?.addEventListener(
      "click",
      closeSidebar,
    );

  document
    .getElementById(
      "adminLogoutBtn",
    )
    ?.addEventListener(
      "click",
      logoutAdmin,
    );
}

/* =========================
   Initialize
========================= */

document.addEventListener(
  "DOMContentLoaded",
  async () => {
    configureHistoryView();
    bindEvents();

    try {
      showLoader();

      await Promise.all([
        loadTransactionSummary(),

        loadCurrentHistory({
          showLoader: false,
        }),
      ]);
    } catch (error) {
      console.error(
        "TRANSACTION PAGE INITIALIZATION ERROR:",
        error,
      );

      showToast(
        error.message ||
        "Page initialization failed.",
        "error",
      );
    } finally {
      hideLoader();
    }
  },
);