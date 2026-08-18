"use strict";

(() => {
  const state = {
    deposits: [],
    withdrawals: [],
    pendingDeposits: [],
    pendingWithdrawals: [],
    activeTab: "deposits",
    selectedAction: null,
    toastTimer: null
  };

  const DOM = {
    agentUsername:
      document.getElementById(
        "agentUsername"
      ),

    refreshDashboardBtn:
      document.getElementById(
        "refreshDashboardBtn"
      ),

    logoutBtn:
      document.getElementById(
        "logoutBtn"
      ),

    pendingDepositCount:
      document.getElementById(
        "pendingDepositCount"
      ),

    pendingWithdrawalCount:
      document.getElementById(
        "pendingWithdrawalCount"
      ),

    pendingDepositAmount:
      document.getElementById(
        "pendingDepositAmount"
      ),

    pendingWithdrawalAmount:
      document.getElementById(
        "pendingWithdrawalAmount"
      ),

    depositTabBtn:
      document.getElementById(
        "depositTabBtn"
      ),

    withdrawalTabBtn:
      document.getElementById(
        "withdrawalTabBtn"
      ),

    depositTabCount:
      document.getElementById(
        "depositTabCount"
      ),

    withdrawalTabCount:
      document.getElementById(
        "withdrawalTabCount"
      ),

    depositPanel:
      document.getElementById(
        "depositPanel"
      ),

    withdrawalPanel:
      document.getElementById(
        "withdrawalPanel"
      ),

    depositSearchInput:
      document.getElementById(
        "depositSearchInput"
      ),

    depositStatusFilter:
      document.getElementById(
        "depositStatusFilter"
      ),

    refreshDepositsBtn:
      document.getElementById(
        "refreshDepositsBtn"
      ),

    depositTableBody:
      document.getElementById(
        "depositTableBody"
      ),

    withdrawalSearchInput:
      document.getElementById(
        "withdrawalSearchInput"
      ),

    withdrawalStatusFilter:
      document.getElementById(
        "withdrawalStatusFilter"
      ),

    refreshWithdrawalsBtn:
      document.getElementById(
        "refreshWithdrawalsBtn"
      ),

    withdrawalTableBody:
      document.getElementById(
        "withdrawalTableBody"
      ),

    actionModal:
      document.getElementById(
        "actionModal"
      ),

    modalCategory:
      document.getElementById(
        "modalCategory"
      ),

    modalTitle:
      document.getElementById(
        "modalTitle"
      ),

    closeModalBtn:
      document.getElementById(
        "closeModalBtn"
      ),

    requestDetails:
      document.getElementById(
        "requestDetails"
      ),

    reasonField:
      document.getElementById(
        "reasonField"
      ),

    rejectReasonSelect:
      document.getElementById(
        "rejectReasonSelect"
      ),

    noteLabel:
      document.getElementById(
        "noteLabel"
      ),

    actionNote:
      document.getElementById(
        "actionNote"
      ),

    cancelActionBtn:
      document.getElementById(
        "cancelActionBtn"
      ),

    confirmActionBtn:
      document.getElementById(
        "confirmActionBtn"
      ),

    agentLoading:
      document.getElementById(
        "agentLoading"
      ),

    agentToast:
      document.getElementById(
        "agentToast"
      )
  };

  function getToken() {
    return (
      localStorage.getItem(
        "access_token"
      ) ||
      ""
    );
  }

  function getApiUrl(path) {
    if (
      typeof window.APP_CONFIG
        ?.api ===
      "function"
    ) {
      return window.APP_CONFIG
        .api(path);
    }

    const cleanPath =
      String(path)
        .startsWith("/")
        ? String(path)
        : `/${path}`;

    return (
      `${window.location.origin}` +
      `/api${cleanPath}`
    );
  }

  async function apiRequest(
    path,
    options = {}
  ) {
    const response =
      await fetch(
        getApiUrl(path),
        {
          ...options,

          headers: {
            Accept:
              "application/json",

            Authorization:
              `Bearer ${getToken()}`,

            ...(options.body
              ? {
                  "Content-Type":
                    "application/json"
                }
              : {}),

            ...(options.headers ||
              {})
          },

          cache:
            "no-store"
        }
      );

    let result = null;

    try {
      result =
        await response.json();
    } catch (_error) {
      result = null;
    }

    if (
      response.status === 401 ||
      response.status === 403
    ) {
      throw new Error(
        result?.message ||
        "Agent access is not available."
      );
    }

    if (!response.ok) {
      throw new Error(
        result?.message ||
        `Request failed (${response.status}).`
      );
    }

    return (
      result?.data ??
      result
    );
  }

  function escapeHtml(value) {
    return String(
      value ?? ""
    )
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function toNumber(
    value,
    fallback = 0
  ) {
    const number =
      Number(value);

    return Number.isFinite(number)
      ? number
      : fallback;
  }

  function money(value) {
    return (
      "৳" +
      toNumber(value)
        .toLocaleString(
          "en-BD",
          {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          }
        )
    );
  }

  function dateTime(value) {
    if (!value) {
      return "—";
    }

    const date =
      new Date(value);

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return "—";
    }

    return date
      .toLocaleString(
        "en-BD",
        {
          year: "numeric",
          month: "short",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit"
        }
      );
  }

  function showLoading(visible) {
    DOM.agentLoading
      ?.classList
      .toggle(
        "is-hidden",
        !visible
      );
  }

  function showToast(
    message,
    type = "success"
  ) {
    if (!DOM.agentToast) {
      return;
    }

    clearTimeout(
      state.toastTimer
    );

    DOM.agentToast
      .textContent =
      message;

    DOM.agentToast
      .className =
      `agent-toast ${type}`;

    state.toastTimer =
      setTimeout(
        () => {
          DOM.agentToast
            .classList
            .add(
              "is-hidden"
            );
        },
        3500
      );
  }

  function getCurrentUser() {
    try {
      return JSON.parse(
        localStorage.getItem(
          "current_user"
        ) ||
        "null"
      );
    } catch (_error) {
      return null;
    }
  }

  function renderIdentity(user) {
    const name =
      user?.username ||
      user?.fullName ||
      user?.full_name ||
      user?.uid ||
      "Agent";

    if (DOM.agentUsername) {
      DOM.agentUsername
        .textContent =
        name;
    }
  }

  function statusBadge(status) {
    const safeStatus =
      String(
        status || "unknown"
      )
        .trim()
        .toLowerCase();

    return `
      <span
        class="status-badge status-${escapeHtml(
          safeStatus
        )}">
        ${escapeHtml(safeStatus)}
      </span>
    `;
  }

  function renderSummary() {
    const depositAmount =
      state.pendingDeposits
        .reduce(
          (total, item) =>
            total +
            toNumber(
              item.amount
            ),
          0
        );

    const withdrawalAmount =
      state.pendingWithdrawals
        .reduce(
          (total, item) =>
            total +
            toNumber(
              item.amount
            ),
          0
        );

    DOM.pendingDepositCount
      .textContent =
      String(
        state
          .pendingDeposits
          .length
      );

    DOM.pendingWithdrawalCount
      .textContent =
      String(
        state
          .pendingWithdrawals
          .length
      );

    DOM.pendingDepositAmount
      .textContent =
      money(depositAmount);

    DOM.pendingWithdrawalAmount
      .textContent =
      money(
        withdrawalAmount
      );

    DOM.depositTabCount
      .textContent =
      String(
        state
          .pendingDeposits
          .length
      );

    DOM.withdrawalTabCount
      .textContent =
      String(
        state
          .pendingWithdrawals
          .length
      );
  }

  function getDepositUser(
    deposit
  ) {
    return (
      deposit.fullName ||
      deposit.username ||
      deposit.userUid ||
      deposit.userPhone ||
      `User #${deposit.userId}`
    );
  }

  function getWithdrawalUser(
    withdrawal
  ) {
    return (
      withdrawal.username ||
      withdrawal.userUid ||
      `User #${withdrawal.userId}`
    );
  }

  function renderDeposits() {
    const search =
      String(
        DOM.depositSearchInput
          ?.value ||
        ""
      )
        .trim()
        .toLowerCase();

    const deposits =
      state.deposits
        .filter((deposit) => {
          if (!search) {
            return true;
          }

          return [
            deposit.depositId,
            deposit.fullName,
            deposit.username,
            deposit.userUid,
            deposit.userPhone,
            deposit.transactionNumber,
            deposit.senderNumber
          ]
            .some((value) =>
              String(value || "")
                .toLowerCase()
                .includes(search)
            );
        });

    if (!deposits.length) {
      DOM.depositTableBody
        .innerHTML =
        `
          <tr>
            <td
              colspan="9"
              class="empty-table">
              No deposit requests found.
            </td>
          </tr>
        `;

      return;
    }

    DOM.depositTableBody
      .innerHTML =
      deposits
        .map((deposit) => {
          const isPending =
            String(
              deposit.status
            ).toLowerCase() ===
            "pending";

          return `
            <tr>
              <td>
                ${escapeHtml(
                  deposit.depositId ||
                  deposit.id
                )}
              </td>

              <td>
                ${escapeHtml(
                  getDepositUser(
                    deposit
                  )
                )}
              </td>

              <td>
                ${escapeHtml(
                  deposit.method ||
                  "—"
                )}
              </td>

              <td>
                ${escapeHtml(
                  deposit.senderNumber ||
                  "—"
                )}
              </td>

              <td>
                ${escapeHtml(
                  deposit.transactionNumber ||
                  "—"
                )}
              </td>

              <td>
                <strong>
                  ${money(
                    deposit.amount
                  )}
                </strong>
              </td>

              <td>
                ${statusBadge(
                  deposit.status
                )}
              </td>

              <td>
                ${dateTime(
                  deposit.createdAt
                )}
              </td>

              <td>
                ${
                  isPending
                    ? `
                      <div class="table-actions">
                        <button
                          class="action-button approve-button"
                          type="button"
                          data-category="deposit"
                          data-action="approve"
                          data-id="${escapeHtml(
                            deposit.depositId
                          )}">
                          Approve
                        </button>

                        <button
                          class="action-button reject-button"
                          type="button"
                          data-category="deposit"
                          data-action="reject"
                          data-id="${escapeHtml(
                            deposit.depositId
                          )}">
                          Reject
                        </button>
                      </div>
                    `
                    : "—"
                }
              </td>
            </tr>
          `;
        })
        .join("");
  }

  function renderWithdrawals() {
    const search =
      String(
        DOM.withdrawalSearchInput
          ?.value ||
        ""
      )
        .trim()
        .toLowerCase();

    const withdrawals =
      state.withdrawals
        .filter(
          (withdrawal) => {
            if (!search) {
              return true;
            }

            return [
              withdrawal.id,
              withdrawal.withdrawId,
              withdrawal.username,
              withdrawal.userId,
              withdrawal.method,
              withdrawal.accountNumber,
              withdrawal.lastFourDigits
            ]
              .some((value) =>
                String(value || "")
                  .toLowerCase()
                  .includes(search)
              );
          }
        );

    if (!withdrawals.length) {
      DOM.withdrawalTableBody
        .innerHTML =
        `
          <tr>
            <td
              colspan="8"
              class="empty-table">
              No withdrawal requests found.
            </td>
          </tr>
        `;

      return;
    }

    DOM.withdrawalTableBody
      .innerHTML =
      withdrawals
        .map(
          (withdrawal) => {
            const isPending =
              String(
                withdrawal.status
              ).toLowerCase() ===
              "pending";

            const account =
              withdrawal.accountNumber ||
              (
                withdrawal.lastFourDigits
                  ? `****${withdrawal.lastFourDigits}`
                  : "—"
              );

            return `
              <tr>
                <td>
                  ${escapeHtml(
                    withdrawal.withdrawId ||
                    withdrawal.id
                  )}
                </td>

                <td>
                  ${escapeHtml(
                    getWithdrawalUser(
                      withdrawal
                    )
                  )}
                </td>

                <td>
                  ${escapeHtml(
                    withdrawal.method ||
                    "—"
                  )}
                </td>

                <td>
                  ${escapeHtml(
                    account
                  )}
                </td>

                <td>
                  <strong>
                    ${money(
                      withdrawal.amount
                    )}
                  </strong>
                </td>

                <td>
                  ${statusBadge(
                    withdrawal.status
                  )}
                </td>

                <td>
                  ${dateTime(
                    withdrawal.createdAt
                  )}
                </td>

                <td>
                  ${
                    isPending
                      ? `
                        <div class="table-actions">
                          <button
                            class="action-button approve-button"
                            type="button"
                            data-category="withdrawal"
                            data-action="approve"
                            data-id="${escapeHtml(
                              withdrawal.id
                            )}">
                            Approve
                          </button>

                          <button
                            class="action-button reject-button"
                            type="button"
                            data-category="withdrawal"
                            data-action="reject"
                            data-id="${escapeHtml(
                              withdrawal.id
                            )}">
                            Reject
                          </button>
                        </div>
                      `
                      : "—"
                  }
                </td>
              </tr>
            `;
          }
        )
        .join("");
  }

  async function fetchDeposits(
    status = "pending"
  ) {
    const parameters =
      new URLSearchParams({
        status,
        method: "all"
      });

    const data =
      await apiRequest(
        `/agent/deposits?${parameters.toString()}`
      );

    return Array.isArray(
      data?.deposits
    )
      ? data.deposits
      : [];
  }

  async function fetchWithdrawals(
    status = "pending"
  ) {
    const parameters =
      new URLSearchParams({
        status
      });

    const data =
      await apiRequest(
        `/agent/withdrawals?${parameters.toString()}`
      );

    return Array.isArray(
      data?.withdrawals
    )
      ? data.withdrawals
      : [];
  }

  async function loadDeposits() {
    const status =
      DOM.depositStatusFilter
        ?.value ||
      "pending";

    DOM.depositTableBody
      .innerHTML =
      `
        <tr>
          <td
            colspan="9"
            class="empty-table">
            Loading deposits...
          </td>
        </tr>
      `;

    state.deposits =
      await fetchDeposits(
        status
      );

    renderDeposits();
  }

  async function loadWithdrawals() {
    const status =
      DOM.withdrawalStatusFilter
        ?.value ||
      "pending";

    DOM.withdrawalTableBody
      .innerHTML =
      `
        <tr>
          <td
            colspan="8"
            class="empty-table">
            Loading withdrawals...
          </td>
        </tr>
      `;

    state.withdrawals =
      await fetchWithdrawals(
        status
      );

    renderWithdrawals();
  }

  async function loadSummary() {
    const [
      deposits,
      withdrawals
    ] =
      await Promise.all([
        fetchDeposits(
          "pending"
        ),

        fetchWithdrawals(
          "pending"
        )
      ]);

    state.pendingDeposits =
      deposits;

    state.pendingWithdrawals =
      withdrawals;

    renderSummary();
  }

  async function loadDashboard(
    showFullLoader = true
  ) {
    if (showFullLoader) {
      showLoading(true);
    }

    try {
      await Promise.all([
        loadSummary(),
        loadDeposits(),
        loadWithdrawals()
      ]);
    } catch (error) {
      console.error(
        "Agent dashboard load error:",
        error
      );

      showToast(
        error.message,
        "error"
      );
    } finally {
      showLoading(false);
    }
  }

  function switchTab(tab) {
    state.activeTab =
      tab;

    const showDeposits =
      tab ===
      "deposits";

    DOM.depositTabBtn
      .classList
      .toggle(
        "active",
        showDeposits
      );

    DOM.withdrawalTabBtn
      .classList
      .toggle(
        "active",
        !showDeposits
      );

    DOM.depositPanel
      .classList
      .toggle(
        "is-hidden",
        !showDeposits
      );

    DOM.withdrawalPanel
      .classList
      .toggle(
        "is-hidden",
        showDeposits
      );
  }

  function findSelectedItem(
    category,
    id
  ) {
    if (
      category ===
      "deposit"
    ) {
      return state.deposits
        .find(
          (item) =>
            String(
              item.depositId
            ) ===
            String(id)
        );
    }

    return state.withdrawals
      .find(
        (item) =>
          String(item.id) ===
          String(id)
      );
  }

  function openActionModal({
    category,
    action,
    id
  }) {
    const item =
      findSelectedItem(
        category,
        id
      );

    if (!item) {
      showToast(
        "Request was not found.",
        "error"
      );

      return;
    }

    state.selectedAction = {
      category,
      action,
      id,
      item
    };

    const isReject =
      action ===
      "reject";

    const isDeposit =
      category ===
      "deposit";

    DOM.modalCategory
      .textContent =
      isDeposit
        ? "Deposit Request"
        : "Withdrawal Request";

    DOM.modalTitle
      .textContent =
      `${isReject
        ? "Reject"
        : "Approve"} ${
        isDeposit
          ? "Deposit"
          : "Withdrawal"
      }`;

    const reference =
      isDeposit
        ? item.depositId
        : (
            item.withdrawId ||
            item.id
          );

    const user =
      isDeposit
        ? getDepositUser(item)
        : getWithdrawalUser(
            item
          );

    DOM.requestDetails
      .innerHTML =
      `
        <div class="detail-item">
          <span>Reference</span>
          <strong>
            ${escapeHtml(
              reference
            )}
          </strong>
        </div>

        <div class="detail-item">
          <span>User</span>
          <strong>
            ${escapeHtml(user)}
          </strong>
        </div>

        <div class="detail-item">
          <span>Amount</span>
          <strong>
            ${money(item.amount)}
          </strong>
        </div>

        <div class="detail-item">
          <span>Method</span>
          <strong>
            ${escapeHtml(
              item.method ||
              "—"
            )}
          </strong>
        </div>
      `;

    DOM.reasonField
      .classList
      .toggle(
        "is-hidden",
        !(
          isReject &&
          isDeposit
        )
      );

    DOM.rejectReasonSelect
      .value =
      "";

    DOM.actionNote
      .value =
      "";

    DOM.noteLabel
      .textContent =
      isReject
        ? "Rejection Note"
        : "Agent Note (optional)";

    DOM.confirmActionBtn
      .textContent =
      isReject
        ? "Confirm Reject"
        : "Confirm Approve";

    DOM.confirmActionBtn
      .classList
      .toggle(
        "is-danger",
        isReject
      );

    DOM.actionModal
      .classList
      .remove(
        "is-hidden"
      );

    document.body
      .style.overflow =
      "hidden";
  }

  function closeActionModal() {
    state.selectedAction =
      null;

    DOM.actionModal
      .classList
      .add(
        "is-hidden"
      );

    document.body
      .style.overflow =
      "";
  }

  async function confirmAction() {
    const selected =
      state.selectedAction;

    if (!selected) {
      return;
    }

    const {
      category,
      action,
      id
    } = selected;

    const isReject =
      action ===
      "reject";

    const note =
      String(
        DOM.actionNote
          .value ||
        ""
      ).trim();

    const reason =
      DOM.rejectReasonSelect
        .value;

    if (
      isReject &&
      category ===
        "deposit" &&
      !reason
    ) {
      showToast(
        "Select a deposit rejection reason.",
        "error"
      );

      return;
    }

    if (
      isReject &&
      category ===
        "withdrawal" &&
      !note
    ) {
      showToast(
        "Withdrawal rejection reason is required.",
        "error"
      );

      return;
    }

    const path =
      category ===
      "deposit"
        ? (
            `/agent/deposits/` +
            `${encodeURIComponent(id)}/` +
            `${action}`
          )
        : (
            `/agent/withdrawals/` +
            `${encodeURIComponent(id)}/` +
            `${action}`
          );

    const body =
      category ===
      "deposit"
        ? {
            reason:
              isReject
                ? reason
                : undefined,

            note:
              note || undefined
          }
        : {
            adminNote:
              note || undefined
          };

    const originalText =
      DOM.confirmActionBtn
        .textContent;

    DOM.confirmActionBtn
      .disabled =
      true;

    DOM.confirmActionBtn
      .textContent =
      "Processing...";

    try {
      await apiRequest(
        path,
        {
          method: "PATCH",
          body:
            JSON.stringify(body)
        }
      );

      closeActionModal();

      showToast(
        `${category === "deposit"
          ? "Deposit"
          : "Withdrawal"} ${
          action === "approve"
            ? "approved"
            : "rejected"
        } successfully.`,
        "success"
      );

      await loadDashboard(
        false
      );
    } catch (error) {
      showToast(
        error.message,
        "error"
      );
    } finally {
      DOM.confirmActionBtn
        .disabled =
        false;

      DOM.confirmActionBtn
        .textContent =
        originalText;
    }
  }

  async function logout() {
    try {
      await apiRequest(
        "/auth/logout",
        {
          method: "POST"
        }
      );
    } catch (_error) {
      // Local session will still be cleared.
    }

    [
      "access_token",
      "token",
      "refresh_token",
      "current_user",
      "user",
      "user_id"
    ].forEach((key) => {
      localStorage.removeItem(
        key
      );
    });

    window.location.replace(
  "./login.html"
);
  }

  function bindEvents() {
    DOM.depositTabBtn
      ?.addEventListener(
        "click",
        () => {
          switchTab(
            "deposits"
          );
        }
      );

    DOM.withdrawalTabBtn
      ?.addEventListener(
        "click",
        () => {
          switchTab(
            "withdrawals"
          );
        }
      );

    DOM.depositSearchInput
      ?.addEventListener(
        "input",
        renderDeposits
      );

    DOM.withdrawalSearchInput
      ?.addEventListener(
        "input",
        renderWithdrawals
      );

    DOM.depositStatusFilter
      ?.addEventListener(
        "change",
        async () => {
          try {
            await loadDeposits();
          } catch (error) {
            showToast(
              error.message,
              "error"
            );
          }
        }
      );

    DOM.withdrawalStatusFilter
      ?.addEventListener(
        "change",
        async () => {
          try {
            await loadWithdrawals();
          } catch (error) {
            showToast(
              error.message,
              "error"
            );
          }
        }
      );

    DOM.refreshDepositsBtn
      ?.addEventListener(
        "click",
        async () => {
          try {
            await loadDeposits();
            await loadSummary();

            showToast(
              "Deposits refreshed."
            );
          } catch (error) {
            showToast(
              error.message,
              "error"
            );
          }
        }
      );

    DOM.refreshWithdrawalsBtn
      ?.addEventListener(
        "click",
        async () => {
          try {
            await loadWithdrawals();
            await loadSummary();

            showToast(
              "Withdrawals refreshed."
            );
          } catch (error) {
            showToast(
              error.message,
              "error"
            );
          }
        }
      );

    DOM.refreshDashboardBtn
      ?.addEventListener(
        "click",
        () => {
          loadDashboard(
            true
          );
        }
      );

    DOM.depositTableBody
      ?.addEventListener(
        "click",
        (event) => {
          const button =
            event.target
              .closest(
                "[data-action]"
              );

          if (!button) {
            return;
          }

          openActionModal({
            category:
              button.dataset
                .category,

            action:
              button.dataset
                .action,

            id:
              button.dataset.id
          });
        }
      );

    DOM.withdrawalTableBody
      ?.addEventListener(
        "click",
        (event) => {
          const button =
            event.target
              .closest(
                "[data-action]"
              );

          if (!button) {
            return;
          }

          openActionModal({
            category:
              button.dataset
                .category,

            action:
              button.dataset
                .action,

            id:
              button.dataset.id
          });
        }
      );

    DOM.closeModalBtn
      ?.addEventListener(
        "click",
        closeActionModal
      );

    DOM.cancelActionBtn
      ?.addEventListener(
        "click",
        closeActionModal
      );

    DOM.confirmActionBtn
      ?.addEventListener(
        "click",
        confirmAction
      );

    DOM.actionModal
      ?.addEventListener(
        "click",
        (event) => {
          if (
            event.target ===
            DOM.actionModal
          ) {
            closeActionModal();
          }
        }
      );

    DOM.logoutBtn
      ?.addEventListener(
        "click",
        logout
      );

    document
      .addEventListener(
        "keydown",
        (event) => {
          if (
            event.key ===
            "Escape"
          ) {
            closeActionModal();
          }
        }
      );

    window
      .addEventListener(
        "agent-auth-ready",
        (event) => {
          renderIdentity(
            event.detail?.user
          );
        }
      );
  }

  document
    .addEventListener(
      "DOMContentLoaded",
      () => {
        bindEvents();

        renderIdentity(
          window
            .AGENT_CURRENT_USER ||
          getCurrentUser()
        );

        switchTab(
          "deposits"
        );

        loadDashboard(
          true
        );
      }
    );
})();