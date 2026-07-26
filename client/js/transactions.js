const API_BASE_URL =
    APP_CONFIG.API_URL;

const transactionState = {
  page: 1,
  limit: 10,
  totalPages: 1,
  search: "",
  type: "all",
  status: "all",
  method: "all"
};

function getToken() {
  return localStorage.getItem(
    "access_token"
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
  return Number(value || 0).toLocaleString(
    "en-BD",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }
  );
}

function formatDate(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-BD");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showLoader() {
  document
    .getElementById("loaderOverlay")
    ?.classList.add("show");
}

function hideLoader() {
  document
    .getElementById("loaderOverlay")
    ?.classList.remove("show");
}

function showToast(
  message,
  type = "success"
) {
  const toast =
    document.getElementById("toast");

  const toastMessage =
    document.getElementById(
      "toastMessage"
    );

  if (!toast || !toastMessage) {
    return;
  }

  toastMessage.textContent = message;

  toast.classList.remove(
    "show",
    "success",
    "error"
  );

  toast.classList.add(type, "show");

  window.setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}

async function apiRequest(url) {
  const token = getToken();

  if (!token) {
    window.location.href =
      "../pages/login.html";

    throw new Error(
      "Admin login required."
    );
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json"
    }
  });

  const result = await response.json();

  if (
    response.status === 401 ||
    response.status === 403
  ) {
    localStorage.removeItem(
      "access_token"
    );

    window.location.href =
      "../pages/login.html";

    throw new Error(
      "Login session expired."
    );
  }

  if (!response.ok || !result.success) {
    throw new Error(
      result.message ||
      "Request failed."
    );
  }

  return result;
}

async function loadTransactionSummary() {
  const result = await apiRequest(
    `${API_BASE_URL}/admin/transactions/summary`
  );

  const summary = result.data || {};

  setText(
    "totalTransactions",
    summary.totalCount || 0
  );

  setText(
    "approvedDeposits",
    formatMoney(
      summary.approvedDeposit
    )
  );

  setText(
    "approvedWithdrawals",
    formatMoney(
      summary.approvedWithdraw
    )
  );

  setText(
    "netCashFlow",
    formatMoney(
      summary.netCashFlow
    )
  );

  setText(
    "pendingTransactions",
    summary.pendingCount || 0
  );
}

function buildTransactionUrl() {
  const params = new URLSearchParams({
    page: transactionState.page,
    limit: transactionState.limit,
    search: transactionState.search,
    type: transactionState.type,
    status: transactionState.status,
    method: transactionState.method
  });

  return (
    `${API_BASE_URL}` +
    `/admin/transactions?${params}`
  );
}

async function loadTransactions() {
  try {
    showLoader();

    const result = await apiRequest(
      buildTransactionUrl()
    );

    const data = result.data || {};

    renderTransactionTable(
      data.transactions || []
    );

    updatePagination(
      data.pagination || {}
    );
  } catch (error) {
    console.error(
      "Transaction load error:",
      error
    );

    renderTransactionTable([]);

    showToast(
      error.message,
      "error"
    );
  } finally {
    hideLoader();
  }
}

function renderTransactionTable(
  transactions
) {
  const tableBody =
    document.getElementById(
      "transactionTableBody"
    );

  if (!tableBody) {
    return;
  }

  if (
    !Array.isArray(transactions) ||
    transactions.length === 0
  ) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="8" class="empty-cell">
          No transactions found.
        </td>
      </tr>
    `;

    return;
  }

  tableBody.innerHTML = transactions
    .map(transaction => {
      const typeClass =
        transaction.type === "deposit"
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
                transaction.transaction_id
              )}
            </strong>

            <small>
              ${escapeHtml(
                transaction.reference_number ||
                "-"
              )}
            </small>
          </td>

          <td>
            <strong>
              ${escapeHtml(userName)}
            </strong>

            <small>
              ${escapeHtml(
                transaction.uid || "-"
              )}
            </small>
          </td>

          <td>
            <span class="type-badge ${typeClass}">
              ${escapeHtml(
                transaction.type
              )}
            </span>
          </td>

          <td>
            ${escapeHtml(
              transaction.method || "-"
            )}
          </td>

          <td>
            ${escapeHtml(
              transaction.account_number ||
              "-"
            )}
          </td>

          <td>
            <strong>
              ৳${formatMoney(
                transaction.amount
              )}
            </strong>
          </td>

          <td>
            <span class="status-badge ${escapeHtml(
              transaction.status
            )}">
              ${escapeHtml(
                transaction.status
              )}
            </span>
          </td>

          <td>
            ${escapeHtml(
              formatDate(
                transaction.created_at
              )
            )}
          </td>
        </tr>
      `;
    })
    .join("");
}

function updatePagination(pagination) {
  transactionState.page =
    Number(pagination.page || 1);

  transactionState.totalPages =
    Number(
      pagination.totalPages || 1
    );

  setText(
    "paginationInfo",
    `Page ${transactionState.page} of ` +
    `${transactionState.totalPages}`
  );

  const previousButton =
    document.getElementById(
      "previousPage"
    );

  const nextButton =
    document.getElementById(
      "nextPage"
    );

  if (previousButton) {
    previousButton.disabled =
      transactionState.page <= 1;
  }

  if (nextButton) {
    nextButton.disabled =
      transactionState.page >=
      transactionState.totalPages;
  }
}

function applyFilters() {
  transactionState.page = 1;

  transactionState.search =
    document.getElementById(
      "transactionSearch"
    )?.value.trim() || "";

  transactionState.type =
    document.getElementById(
      "transactionType"
    )?.value || "all";

  transactionState.status =
    document.getElementById(
      "transactionStatus"
    )?.value || "all";

  transactionState.method =
    document.getElementById(
      "transactionMethod"
    )?.value || "all";

  transactionState.limit = Number(
    document.getElementById(
      "pageLimit"
    )?.value || 10
  );

  loadTransactions();
}

function resetFilters() {
  document.getElementById(
    "transactionSearch"
  ).value = "";

  document.getElementById(
    "transactionType"
  ).value = "all";

  document.getElementById(
    "transactionStatus"
  ).value = "all";

  document.getElementById(
    "transactionMethod"
  ).value = "all";

  document.getElementById(
    "pageLimit"
  ).value = "10";

  transactionState.page = 1;
  transactionState.limit = 10;
  transactionState.search = "";
  transactionState.type = "all";
  transactionState.status = "all";
  transactionState.method = "all";

  loadTransactions();
}

function toggleSidebar() {
  document
    .getElementById("adminSidebar")
    ?.classList.toggle("open");

  document
    .getElementById("sidebarOverlay")
    ?.classList.toggle("show");
}

function closeSidebar() {
  document
    .getElementById("adminSidebar")
    ?.classList.remove("open");

  document
    .getElementById("sidebarOverlay")
    ?.classList.remove("show");
}

function logoutAdmin() {
  localStorage.removeItem(
    "access_token"
  );

  localStorage.removeItem(
    "refresh_token"
  );

  localStorage.removeItem("user");

  window.location.href =
    "../pages/login.html";
}

function bindEvents() {
  let searchTimer = null;

  document
    .getElementById(
      "transactionSearch"
    )
    ?.addEventListener(
      "input",
      () => {
        window.clearTimeout(searchTimer);

        searchTimer =
          window.setTimeout(
            applyFilters,
            400
          );
      }
    );

  [
    "transactionType",
    "transactionStatus",
    "transactionMethod",
    "pageLimit"
  ].forEach(id => {
    document
      .getElementById(id)
      ?.addEventListener(
        "change",
        applyFilters
      );
  });

  document
    .getElementById("resetFilters")
    ?.addEventListener(
      "click",
      resetFilters
    );

  document
    .getElementById("previousPage")
    ?.addEventListener(
      "click",
      () => {
        if (
          transactionState.page > 1
        ) {
          transactionState.page -= 1;
          loadTransactions();
        }
      }
    );

  document
    .getElementById("nextPage")
    ?.addEventListener(
      "click",
      () => {
        if (
          transactionState.page <
          transactionState.totalPages
        ) {
          transactionState.page += 1;
          loadTransactions();
        }
      }
    );

  document
    .getElementById(
      "refreshTransactions"
    )
    ?.addEventListener(
      "click",
      async () => {
        await Promise.all([
          loadTransactionSummary(),
          loadTransactions()
        ]);

        showToast(
          "Transactions refreshed."
        );
      }
    );

  document
    .getElementById("sidebarToggle")
    ?.addEventListener(
      "click",
      toggleSidebar
    );

  document
    .getElementById("sidebarOverlay")
    ?.addEventListener(
      "click",
      closeSidebar
    );

  document
    .getElementById("adminLogoutBtn")
    ?.addEventListener(
      "click",
      logoutAdmin
    );
}

document.addEventListener(
  "DOMContentLoaded",
  async () => {
    bindEvents();

    try {
      await Promise.all([
        loadTransactionSummary(),
        loadTransactions()
      ]);
    } catch (error) {
      console.error(error);
    }
  }
);