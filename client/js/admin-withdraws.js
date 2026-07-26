/* ==========================================
   PMS ADDA
   Admin Withdrawals
   Backend Connected
========================================== */

document.addEventListener("DOMContentLoaded", () => {

    "use strict";

   const API_URL =
    APP_CONFIG.api(
        "/admin/withdraws"
    );

    const token =
        localStorage.getItem("access_token");

    /* ==========================
       Elements
    ========================== */

    const adminSidebar =
        document.getElementById("adminSidebar");

    const sidebarToggle =
        document.getElementById("sidebarToggle");

    const sidebarOverlay =
        document.getElementById("sidebarOverlay");

    const adminLogoutBtn =
        document.getElementById("adminLogoutBtn");

    const refreshWithdraws =
        document.getElementById("refreshWithdraws");

    const withdrawSearch =
        document.getElementById("withdrawSearch");

    const statusFilter =
        document.getElementById("statusFilter");

    const methodFilter =
        document.getElementById("methodFilter");

    const clearFilters =
        document.getElementById("clearFilters");

    const withdrawTableBody =
        document.getElementById("withdrawTableBody");

    const emptyState =
        document.getElementById("emptyState");

    const pendingWithdrawCount =
        document.getElementById("pendingWithdrawCount");

    const approvedWithdrawCount =
        document.getElementById("approvedWithdrawCount");

    const rejectedWithdrawCount =
        document.getElementById("rejectedWithdrawCount");

    const paidToday =
        document.getElementById("paidToday");

    const pendingWithdrawMenuCount =
        document.getElementById(
            "pendingWithdrawMenuCount"
        );

    /* Modals */

    const detailsModal =
        document.getElementById("detailsModal");

    const approveModal =
        document.getElementById("approveModal");

    const rejectModal =
        document.getElementById("rejectModal");

    const closeDetailsModal =
        document.getElementById("closeDetailsModal");

    const closeApproveModal =
        document.getElementById("closeApproveModal");

    const closeRejectModal =
        document.getElementById("closeRejectModal");

    const cancelApprove =
        document.getElementById("cancelApprove");

    const cancelReject =
        document.getElementById("cancelReject");

    const confirmApprove =
        document.getElementById("confirmApprove");

    const confirmReject =
        document.getElementById("confirmReject");

    /* Approve fields */

    const approveRequestId =
        document.getElementById("approveRequestId");

    const approveAmount =
        document.getElementById("approveAmount");

    const approveAccount =
        document.getElementById("approveAccount");

    const adminPaymentReference =
        document.getElementById(
            "adminPaymentReference"
        );

    /* Reject fields */

    const rejectRequestId =
        document.getElementById("rejectRequestId");

    const rejectAmount =
        document.getElementById("rejectAmount");

    const rejectReason =
        document.getElementById("rejectReason");

    const rejectNote =
        document.getElementById("rejectNote");

    /* Details fields */

    const detailUser =
        document.getElementById("detailUser");

    const detailUserId =
        document.getElementById("detailUserId");

    const detailMethod =
        document.getElementById("detailMethod");

    const detailAccount =
        document.getElementById("detailAccount");

    const detailLastFour =
        document.getElementById("detailLastFour");

    const detailRequestId =
        document.getElementById("detailRequestId");

    const detailAmount =
        document.getElementById("detailAmount");

    const detailDeposit =
        document.getElementById("detailDeposit");

    const detailPlayed =
        document.getElementById("detailPlayed");

    const detailTurnoverStatus =
        document.getElementById(
            "detailTurnoverStatus"
        );

    const detailStatus =
        document.getElementById("detailStatus");

    /* Loader and toast */

    const loaderOverlay =
        document.getElementById("loaderOverlay");

    const toast =
        document.getElementById("toast");

    const toastMessage =
        document.getElementById("toastMessage");

    /* ==========================
       State
    ========================== */

    let withdrawals = [];

    let selectedWithdrawal = null;

    let toastTimer = null;

    /* ==========================
       Authentication
    ========================== */

    if (!token) {
        window.location.replace("../pages/login.html");
        return;
    }

    /* ==========================
       Helpers
    ========================== */

    function showLoader() {
        if (loaderOverlay) {
            loaderOverlay.style.display = "flex";
        }
    }

    function hideLoader() {
        if (loaderOverlay) {
            loaderOverlay.style.display = "none";
        }
    }

    function showToast(message) {
        if (!toast || !toastMessage) {
            return;
        }

        clearTimeout(toastTimer);

        toastMessage.textContent = message;
        toast.style.display = "block";

        toastTimer = setTimeout(() => {
            toast.style.display = "none";
        }, 2600);
    }

    function openModal(modal) {
        if (modal) {
            modal.style.display = "flex";
        }
    }

    function closeModal(modal) {
        if (modal) {
            modal.style.display = "none";
        }
    }

    function formatMoney(amount) {
        return Number(amount || 0).toLocaleString(
            "en-BD",
            {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }
        );
    }

    function formatDate(dateValue) {
        if (!dateValue) {
            return "-";
        }

        return new Date(dateValue).toLocaleString(
            "en-BD"
        );
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function handleUnauthorized(response) {
        if (
            response.status === 401 ||
            response.status === 403
        ) {
            localStorage.removeItem("access_token");
            localStorage.removeItem("current_user");

            window.location.replace(
                "../pages/login.html"
            );

            return true;
        }

        return false;
    }

    /* ==========================
       Sidebar
    ========================== */

    function closeSidebar() {
        adminSidebar?.classList.remove("open");
        sidebarOverlay?.classList.remove("show");
    }

    sidebarToggle?.addEventListener(
        "click",
        () => {
            adminSidebar?.classList.toggle("open");
            sidebarOverlay?.classList.toggle("show");
        }
    );

    sidebarOverlay?.addEventListener(
        "click",
        closeSidebar
    );

    /* ==========================
       Load Withdrawals
    ========================== */

    async function loadWithdrawals() {
        showLoader();

        try {
            const response = await fetch(
                `${API_URL}?status=all`,
                {
                    method: "GET",

                    headers: {
                        Authorization:
                            `Bearer ${token}`
                    }
                }
            );

            if (handleUnauthorized(response)) {
                return;
            }

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(
                    result.message ||
                    "Withdraw requests load failed."
                );
            }

            withdrawals =
                result.data.withdrawals || [];

            updateSummary();
            renderWithdrawals();

        } catch (error) {
            console.error(
                "Load withdrawals error:",
                error
            );

            showToast(
                error.message ||
                "Could not load withdrawals."
            );

        } finally {
            hideLoader();
        }
    }

    /* ==========================
       Summary
    ========================== */

    function updateSummary() {
        const pending =
            withdrawals.filter(
                item => item.status === "pending"
            );

        const approved =
            withdrawals.filter(
                item => item.status === "approved"
            );

        const rejected =
            withdrawals.filter(
                item => item.status === "rejected"
            );

        const today =
            new Date().toDateString();

        const paidTodayAmount =
            approved
                .filter(item => {
                    return new Date(
                        item.updatedAt
                    ).toDateString() === today;
                })
                .reduce(
                    (total, item) =>
                        total + Number(item.amount),
                    0
                );

        if (pendingWithdrawCount) {
            pendingWithdrawCount.textContent =
                pending.length;
        }

        if (approvedWithdrawCount) {
            approvedWithdrawCount.textContent =
                approved.length;
        }

        if (rejectedWithdrawCount) {
            rejectedWithdrawCount.textContent =
                rejected.length;
        }

        if (paidToday) {
            paidToday.textContent =
                formatMoney(paidTodayAmount);
        }

        if (pendingWithdrawMenuCount) {
            pendingWithdrawMenuCount.textContent =
                pending.length;
        }
    }

    /* ==========================
       Filter and Render
    ========================== */

    function getFilteredWithdrawals() {
        const search =
            String(
                withdrawSearch?.value || ""
            ).toLowerCase().trim();

        const status =
            statusFilter?.value || "all";

        const method =
            methodFilter?.value || "all";

        return withdrawals.filter(item => {
            const searchableText = [
                item.id,
                item.uid,
                item.fullName,
                item.username,
                item.phone,
                item.accountNumber,
                item.method
            ]
                .join(" ")
                .toLowerCase();

            const searchMatched =
                !search ||
                searchableText.includes(search);

            const statusMatched =
                status === "all" ||
                item.status === status;

            const methodMatched =
                method === "all" ||
                item.method === method;

            return (
                searchMatched &&
                statusMatched &&
                methodMatched
            );
        });
    }

    function renderWithdrawals() {
        const filtered =
            getFilteredWithdrawals();

        withdrawTableBody.innerHTML = "";

        if (!filtered.length) {
            if (emptyState) {
                emptyState.style.display = "block";
            }

            return;
        }

        if (emptyState) {
            emptyState.style.display = "none";
        }

        filtered.forEach(item => {
            const row =
                document.createElement("tr");

            row.className = "withdraw-row";

            const actionButtons =
                item.status === "pending"
                    ? `
                        <button
                            type="button"
                            data-action="approve"
                            data-id="${item.id}"
                            class="action-btn approve-btn"
                        >
                            Approve
                        </button>

                        <button
                            type="button"
                            data-action="reject"
                            data-id="${item.id}"
                            class="action-btn reject-btn"
                        >
                            Reject
                        </button>
                    `
                    : "";

            row.innerHTML = `
                <td class="user-cell">
                    <strong>
                        ${escapeHtml(
                            item.fullName ||
                            item.username ||
                            "User"
                        )}
                    </strong>

                    <span>
                        ${escapeHtml(item.uid || "-")}
                    </span>
                </td>

                <td>
                    <span class="method-badge">
                        ${escapeHtml(
                            String(
                                item.method || "-"
                            ).toUpperCase()
                        )}
                    </span>
                </td>

                <td class="account-cell">
                    <strong>
                        ${escapeHtml(
                            item.accountNumber || "-"
                        )}
                    </strong>

                    <small>
                        Last 4:
                        ${escapeHtml(
                            item.lastFourDigits || "-"
                        )}
                    </small>
                </td>

                <td>
                    <strong class="amount-value">
                        ৳${formatMoney(item.amount)}
                    </strong>
                </td>

                <td class="turnover-cell">
                    <span class="turnover-badge">
                        Verified
                    </span>

                    <small>
                        Server validated
                    </small>
                </td>

                <td>
                    <span class="status-badge ${escapeHtml(
                        item.status
                    )}">
                        ${escapeHtml(
                            item.status
                                .charAt(0)
                                .toUpperCase() +
                            item.status.slice(1)
                        )}
                    </span>
                </td>

                <td>
                    ${escapeHtml(
                        formatDate(item.createdAt)
                    )}
                </td>

                <td class="action-cell">
                    <button
                        type="button"
                        data-action="view"
                        data-id="${item.id}"
                        class="action-btn view-btn"
                    >
                        View
                    </button>

                    ${actionButtons}
                </td>
            `;

            withdrawTableBody.appendChild(row);
        });
    }

    /* ==========================
       Search and Filters
    ========================== */

    withdrawSearch?.addEventListener(
        "input",
        renderWithdrawals
    );

    statusFilter?.addEventListener(
        "change",
        renderWithdrawals
    );

    methodFilter?.addEventListener(
        "change",
        renderWithdrawals
    );

    clearFilters?.addEventListener(
        "click",
        () => {
            withdrawSearch.value = "";
            statusFilter.value = "all";
            methodFilter.value = "all";

            renderWithdrawals();

            showToast("Filters cleared.");
        }
    );

    /* ==========================
       Table Buttons
    ========================== */

    withdrawTableBody?.addEventListener(
        "click",
        event => {
            const button =
                event.target.closest(
                    "[data-action]"
                );

            if (!button) {
                return;
            }

            const id =
                Number(button.dataset.id);

            const item =
                withdrawals.find(
                    withdrawal =>
                        Number(withdrawal.id) === id
                );

            if (!item) {
                showToast(
                    "Withdraw request not found."
                );

                return;
            }

            selectedWithdrawal = item;

            const action =
                button.dataset.action;

            if (action === "view") {
                showDetails(item);
            }

            if (action === "approve") {
                openApprove(item);
            }

            if (action === "reject") {
                openReject(item);
            }
        }
    );

    /* ==========================
       Details Modal
    ========================== */

    function showDetails(item) {
        detailUser.textContent =
            item.fullName ||
            item.username ||
            "-";

        detailUserId.textContent =
            item.uid || "-";

        detailMethod.textContent =
            String(
                item.method || "-"
            ).toUpperCase();

        detailAccount.textContent =
            item.accountNumber || "-";

        detailLastFour.textContent =
            item.lastFourDigits || "-";

        detailRequestId.textContent =
            item.id;

        detailAmount.textContent =
            `৳${formatMoney(item.amount)}`;

        if (detailDeposit) {
            detailDeposit.textContent = "-";
        }

        if (detailPlayed) {
            detailPlayed.textContent = "-";
        }

        if (detailTurnoverStatus) {
            detailTurnoverStatus.textContent =
                "Server validated";
        }

        detailStatus.textContent =
            item.status;

        openModal(detailsModal);
    }

    /* ==========================
       Approve Modal
    ========================== */

    function openApprove(item) {
        approveRequestId.textContent =
            item.id;

        approveAmount.textContent =
            `৳${formatMoney(item.amount)}`;

        approveAccount.textContent =
            item.accountNumber;

        adminPaymentReference.value = "";

        openModal(approveModal);
    }

    confirmApprove?.addEventListener(
        "click",
        async () => {
            if (!selectedWithdrawal) {
                return;
            }

            const paymentReference =
                adminPaymentReference.value.trim();

            if (paymentReference.length < 4) {
                showToast(
                    "Enter payment reference."
                );

                adminPaymentReference.focus();
                return;
            }

            confirmApprove.disabled = true;
            closeModal(approveModal);
            showLoader();

            try {
                const response = await fetch(
                    `${API_URL}/${selectedWithdrawal.id}/approve`,
                    {
                        method: "PATCH",

                        headers: {
                            "Content-Type":
                                "application/json",

                            Authorization:
                                `Bearer ${token}`
                        },

                        body: JSON.stringify({
                            adminNote:
                                `Payment reference: ${paymentReference}`
                        })
                    }
                );

                if (handleUnauthorized(response)) {
                    return;
                }

                const result =
                    await response.json();

                if (
                    !response.ok ||
                    !result.success
                ) {
                    throw new Error(
                        result.message ||
                        "Approve failed."
                    );
                }

                showToast(
                    "Withdrawal approved successfully."
                );

                await loadWithdrawals();

            } catch (error) {
                console.error(error);

                showToast(
                    error.message ||
                    "Could not approve withdrawal."
                );

            } finally {
                hideLoader();

                confirmApprove.disabled = false;
                selectedWithdrawal = null;
            }
        }
    );

    /* ==========================
       Reject Modal
    ========================== */

    function openReject(item) {
        rejectRequestId.textContent =
            item.id;

        rejectAmount.textContent =
            `৳${formatMoney(item.amount)}`;

        rejectReason.value = "";
        rejectNote.value = "";

        openModal(rejectModal);
    }

    confirmReject?.addEventListener(
        "click",
        async () => {
            if (!selectedWithdrawal) {
                return;
            }

            const reason =
                rejectReason.value;

            const note =
                rejectNote.value.trim();

            if (!reason) {
                showToast(
                    "Select a reject reason."
                );

                rejectReason.focus();
                return;
            }

            confirmReject.disabled = true;
            closeModal(rejectModal);
            showLoader();

            try {
                const adminNote =
                    note
                        ? `${reason}: ${note}`
                        : reason;

                const response = await fetch(
                    `${API_URL}/${selectedWithdrawal.id}/reject`,
                    {
                        method: "PATCH",

                        headers: {
                            "Content-Type":
                                "application/json",

                            Authorization:
                                `Bearer ${token}`
                        },

                        body: JSON.stringify({
                            adminNote
                        })
                    }
                );

                if (handleUnauthorized(response)) {
                    return;
                }

                const result =
                    await response.json();

                if (
                    !response.ok ||
                    !result.success
                ) {
                    throw new Error(
                        result.message ||
                        "Reject failed."
                    );
                }

                showToast(
                    "Withdrawal rejected. Balance refunded."
                );

                await loadWithdrawals();

            } catch (error) {
                console.error(error);

                showToast(
                    error.message ||
                    "Could not reject withdrawal."
                );

            } finally {
                hideLoader();

                confirmReject.disabled = false;
                selectedWithdrawal = null;
            }
        }
    );

    /* ==========================
       Modal Close
    ========================== */

    closeDetailsModal?.addEventListener(
        "click",
        () => closeModal(detailsModal)
    );

    closeApproveModal?.addEventListener(
        "click",
        () => closeModal(approveModal)
    );

    closeRejectModal?.addEventListener(
        "click",
        () => closeModal(rejectModal)
    );

    cancelApprove?.addEventListener(
        "click",
        () => closeModal(approveModal)
    );

    cancelReject?.addEventListener(
        "click",
        () => closeModal(rejectModal)
    );

    window.addEventListener(
        "click",
        event => {
            if (event.target === detailsModal) {
                closeModal(detailsModal);
            }

            if (event.target === approveModal) {
                closeModal(approveModal);
            }

            if (event.target === rejectModal) {
                closeModal(rejectModal);
            }
        }
    );

    /* ==========================
       Refresh
    ========================== */

    refreshWithdraws?.addEventListener(
        "click",
        async () => {
            await loadWithdrawals();

            showToast(
                "Withdrawal requests refreshed."
            );
        }
    );

    /* ==========================
       Logout
    ========================== */

    adminLogoutBtn?.addEventListener(
        "click",
        () => {
            const shouldLogout =
                confirm(
                    "Are you sure you want to logout?"
                );

            if (!shouldLogout) {
                return;
            }

            localStorage.removeItem("access_token");
            localStorage.removeItem("refresh_token");
            localStorage.removeItem("current_user");

            window.location.href =
                "../pages/login.html";
        }
    );

    /* ==========================
       Start
    ========================== */

    loadWithdrawals();

    console.log(
        "Admin Withdraw API Connected"
    );

});