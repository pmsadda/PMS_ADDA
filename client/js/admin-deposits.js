/* ==========================================
   PMS ADDA
   Real Admin Deposit Management
   Part 1/3
========================================== */

document.addEventListener("DOMContentLoaded", () => {
    "use strict";

    const API_BASE_URL =
    APP_CONFIG.API_URL;

    /* ==========================
       Authentication
    ========================== */

    const token =
        localStorage.getItem("access_token");

    const storedUser =
        localStorage.getItem("current_user");

    let currentUser = null;

    try {
        currentUser = storedUser
            ? JSON.parse(storedUser)
            : null;
    } catch (error) {
        currentUser = null;
    }

    if (
        !token ||
        !currentUser ||
        currentUser.role !== "admin"
    ) {
        window.location.replace(
            "../pages/login.html"
        );

        return;
    }

    /* ==========================
       Main Elements
    ========================== */

    const adminSidebar =
        document.getElementById("adminSidebar");

    const sidebarToggle =
        document.getElementById("sidebarToggle");

    const sidebarOverlay =
        document.getElementById("sidebarOverlay");

    const adminLogoutBtn =
        document.getElementById("adminLogoutBtn");

    const refreshDeposits =
        document.getElementById("refreshDeposits");

    const depositSearch =
        document.getElementById("depositSearch");

    const statusFilter =
        document.getElementById("statusFilter");

    const methodFilter =
        document.getElementById("methodFilter");

    const clearFilters =
        document.getElementById("clearFilters");

    const depositTableBody =
        document.getElementById("depositTableBody");

    const emptyState =
        document.getElementById("emptyState");

    /* ==========================
       Summary Elements
    ========================== */

    const pendingDepositCount =
        document.getElementById(
            "pendingDepositCount"
        );

    const approvedTodayCount =
        document.getElementById(
            "approvedTodayCount"
        );

    const rejectedTodayCount =
        document.getElementById(
            "rejectedTodayCount"
        );

    const approvedAmountToday =
        document.getElementById(
            "approvedAmountToday"
        );

    const pendingDepositMenuCount =
        document.getElementById(
            "pendingDepositMenuCount"
        );

    /* ==========================
       Details Modal
    ========================== */

    const detailsModal =
        document.getElementById("detailsModal");

    const closeDetailsModal =
        document.getElementById(
            "closeDetailsModal"
        );

    const detailUser =
        document.getElementById("detailUser");

    const detailUserId =
        document.getElementById("detailUserId");

    const detailMethod =
        document.getElementById("detailMethod");

    const detailSender =
        document.getElementById("detailSender");

    const detailTransactionId =
        document.getElementById(
            "detailTransactionId"
        );

    const detailAmount =
        document.getElementById("detailAmount");

    const detailDate =
        document.getElementById("detailDate");

    const detailStatus =
        document.getElementById("detailStatus");

    /* ==========================
       Approve Modal
    ========================== */

    const approveModal =
        document.getElementById("approveModal");

    const closeApproveModal =
        document.getElementById(
            "closeApproveModal"
        );

    const cancelApprove =
        document.getElementById("cancelApprove");

    const confirmApprove =
        document.getElementById("confirmApprove");

    const approveRequestId =
        document.getElementById(
            "approveRequestId"
        );

    /* ==========================
       Reject Modal
    ========================== */

    const rejectModal =
        document.getElementById("rejectModal");

    const closeRejectModal =
        document.getElementById(
            "closeRejectModal"
        );

    const cancelReject =
        document.getElementById("cancelReject");

    const confirmReject =
        document.getElementById("confirmReject");

    const rejectRequestId =
        document.getElementById(
            "rejectRequestId"
        );

    const rejectReason =
        document.getElementById("rejectReason");

    const rejectNote =
        document.getElementById("rejectNote");

    /* ==========================
       Loader and Toast
    ========================== */

    const loaderOverlay =
        document.getElementById("loaderOverlay");

    const toast =
        document.getElementById("toast");

    const toastMessage =
        document.getElementById("toastMessage");

    /* ==========================
       State
    ========================== */

    let deposits = [];

    let selectedDepositId = null;

    let toastTimer = null;

    let searchTimer = null;

    /* ==========================
       Helper Functions
    ========================== */

    function showLoader() {
        if (loaderOverlay) {
            loaderOverlay.style.display = "flex";

            loaderOverlay.setAttribute(
                "aria-hidden",
                "false"
            );
        }
    }

    function hideLoader() {
        if (loaderOverlay) {
            loaderOverlay.style.display = "none";

            loaderOverlay.setAttribute(
                "aria-hidden",
                "true"
            );
        }
    }

    function showToast(message) {
        if (!toast || !toastMessage) {
            alert(message);
            return;
        }

        window.clearTimeout(toastTimer);

        toastMessage.textContent = message;
        toast.style.display = "block";

        toastTimer = window.setTimeout(() => {
            toast.style.display = "none";
        }, 2800);
    }

    function openModal(modal) {
        if (!modal) {
            return;
        }

        modal.style.display = "flex";

        modal.setAttribute(
            "aria-hidden",
            "false"
        );
    }

    function closeModal(modal) {
        if (!modal) {
            return;
        }

        modal.style.display = "none";

        modal.setAttribute(
            "aria-hidden",
            "true"
        );
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
            return "-";
        }

        return date.toLocaleString(
            "en-BD",
            {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit"
            }
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

    function getInitials(name) {
        return String(name || "User")
            .split(" ")
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part[0])
            .join("")
            .toUpperCase();
    }

    async function apiRequest(
        endpoint,
        options = {}
    ) {
        const response = await fetch(
            `${API_BASE_URL}${endpoint}`,
            {
                ...options,

                headers: {
                    "Content-Type":
                        "application/json",

                    Authorization:
                        `Bearer ${token}`,

                    ...(options.headers || {})
                }
            }
        );

        const result =
            await response.json().catch(() => ({
                success: false,
                message:
                    "Invalid server response."
            }));

        if (response.status === 401) {
            localStorage.removeItem(
                "access_token"
            );

            localStorage.removeItem(
                "current_user"
            );

            window.location.replace(
                "../pages/login.html"
            );

            throw new Error(
                "Login session expired."
            );
        }

        if (response.status === 403) {
            throw new Error(
                "Admin access is required."
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

    /* ==========================
       Summary Render
    ========================== */

    function renderSummary(summary) {
        if (pendingDepositCount) {
            pendingDepositCount.textContent =
                summary.pending || 0;
        }

        if (approvedTodayCount) {
            approvedTodayCount.textContent =
                summary.approved || 0;
        }

        if (rejectedTodayCount) {
            rejectedTodayCount.textContent =
                summary.rejected || 0;
        }

        if (approvedAmountToday) {
            approvedAmountToday.textContent =
                formatMoney(
                    summary.approvedAmount
                );
        }

        if (pendingDepositMenuCount) {
            pendingDepositMenuCount.textContent =
                summary.pending || 0;
        }
    }

    /* ==========================
       Deposit Table Render
    ========================== */

    function renderDepositTable() {
        if (!depositTableBody) {
            return;
        }

        if (deposits.length === 0) {
            depositTableBody.innerHTML = "";

            const tableWrapper =
                depositTableBody.closest(
                    ".table-wrapper"
                );

            if (tableWrapper) {
                tableWrapper.style.display =
                    "none";
            }

            if (emptyState) {
                emptyState.style.display =
                    "block";
            }

            return;
        }

        const tableWrapper =
            depositTableBody.closest(
                ".table-wrapper"
            );

        if (tableWrapper) {
            tableWrapper.style.display = "block";
        }

        if (emptyState) {
            emptyState.style.display = "none";
        }

        depositTableBody.innerHTML =
            deposits.map((deposit) => {
                const canProcess =
                    deposit.status === "pending";

                return `
                    <tr class="deposit-row">

                        <td>
                            <div class="user-cell">

                                <div class="user-avatar">
                                    ${escapeHtml(
                                        getInitials(
                                            deposit.fullName
                                        )
                                    )}
                                </div>

                                <div>
                                    <strong>
                                        ${escapeHtml(
                                            deposit.fullName
                                        )}
                                    </strong>

                                    <span>
                                        UID:
                                        ${escapeHtml(
                                            deposit.userUid
                                        )}
                                    </span>
                                </div>

                            </div>
                        </td>

                        <td>
                            <span
                                class="method-badge
                                ${escapeHtml(
                                    deposit.method
                                )}"
                            >
                                ${escapeHtml(
                                    deposit.method
                                        .toUpperCase()
                                )}
                            </span>
                        </td>

                        <td>
                            ${escapeHtml(
                                deposit.senderNumber
                            )}
                        </td>

                        <td>
                            <button
                                type="button"
                                class="copy-value-btn"
                                data-copy="${escapeHtml(
                                    deposit.transactionNumber
                                )}"
                            >
                                ${escapeHtml(
                                    deposit.transactionNumber
                                )}

                                <i class="fa-regular fa-copy"></i>
                            </button>
                        </td>

                        <td>
                            <strong class="amount-value">
                                ৳${formatMoney(
                                    deposit.amount
                                )}
                            </strong>
                        </td>

                        <td>
                            ${escapeHtml(
                                formatDate(
                                    deposit.createdAt
                                )
                            )}
                        </td>

                        <td>
                            <span
                                class="status-badge
                                ${escapeHtml(
                                    deposit.status
                                )}"
                            >
                                ${escapeHtml(
                                    deposit.status
                                        .charAt(0)
                                        .toUpperCase() +
                                    deposit.status.slice(1)
                                )}
                            </span>
                        </td>

                        <td>
                            <div class="action-buttons">

                                <button
                                    type="button"
                                    class="view-btn"
                                    data-action="view"
                                    data-id="${escapeHtml(
                                        deposit.depositId
                                    )}"
                                    title="View details"
                                >
                                    <i class="fa-solid fa-eye"></i>
                                </button>

                                ${
                                    canProcess
                                        ? `
                                        <button
                                            type="button"
                                            class="approve-btn"
                                            data-action="approve"
                                            data-id="${escapeHtml(
                                                deposit.depositId
                                            )}"
                                            title="Approve deposit"
                                        >
                                            <i class="fa-solid fa-check"></i>
                                        </button>

                                        <button
                                            type="button"
                                            class="reject-btn"
                                            data-action="reject"
                                            data-id="${escapeHtml(
                                                deposit.depositId
                                            )}"
                                            title="Reject deposit"
                                        >
                                            <i class="fa-solid fa-xmark"></i>
                                        </button>
                                        `
                                        : ""
                                }

                            </div>
                        </td>

                    </tr>
                `;
            }).join("");
    }

    /* ==========================
       Load Deposit Requests
    ========================== */

    async function loadDeposits(
        showLoading = true
    ) {
        if (showLoading) {
            showLoader();
        }

        try {
            const params =
                new URLSearchParams();

            params.set(
                "status",
                statusFilter?.value || "all"
            );

            params.set(
                "method",
                methodFilter?.value || "all"
            );

            const search =
                depositSearch?.value.trim();

            if (search) {
                params.set("search", search);
            }

            const result = await apiRequest(
                `/admin/deposits?${params.toString()}`
            );

            deposits =
                result.data.deposits || [];

            renderSummary(
                result.data.summary || {}
            );

            renderDepositTable();
        } catch (error) {
            console.error(
                "Load deposits error:",
                error
            );

            showToast(error.message);

            deposits = [];

            renderDepositTable();
        } finally {
            if (showLoading) {
                hideLoader();
            }
        }
    }

    loadDeposits();
        /* ==========================
       Find Deposit
    ========================== */

    function findDeposit(depositId) {
        return deposits.find(
            (deposit) =>
                deposit.depositId === depositId
        );
    }

    /* ==========================
       Open Details Modal
    ========================== */

    function openDepositDetails(deposit) {
        if (!deposit) {
            return;
        }

        detailUser.textContent =
            deposit.fullName || "-";

        detailUserId.textContent =
            deposit.userUid || "-";

        detailMethod.textContent =
            String(deposit.method || "-")
                .toUpperCase();

        detailSender.textContent =
            deposit.senderNumber || "-";

        detailTransactionId.textContent =
            deposit.transactionNumber || "-";

        detailAmount.textContent =
            `৳${formatMoney(deposit.amount)}`;

        detailDate.textContent =
            formatDate(deposit.createdAt);

        detailStatus.textContent =
            String(deposit.status || "-")
                .charAt(0)
                .toUpperCase() +
            String(deposit.status || "-")
                .slice(1);

        openModal(detailsModal);
    }

    /* ==========================
       Dynamic Table Actions
    ========================== */

    depositTableBody?.addEventListener(
        "click",
        async (event) => {
            const actionButton =
                event.target.closest(
                    "[data-action]"
                );

            const copyButton =
                event.target.closest(
                    ".copy-value-btn"
                );

            if (copyButton) {
                const value =
                    copyButton.dataset.copy || "";

                if (!value) {
                    return;
                }

                try {
                    await navigator.clipboard
                        .writeText(value);

                    showToast(
                        "Transaction ID copied."
                    );
                } catch (error) {
                    console.error(
                        "Copy failed:",
                        error
                    );

                    showToast(
                        "Transaction ID copy করা যায়নি।"
                    );
                }

                return;
            }

            if (!actionButton) {
                return;
            }

            const action =
                actionButton.dataset.action;

            const depositId =
                actionButton.dataset.id;

            const deposit =
                findDeposit(depositId);

            if (!deposit) {
                showToast(
                    "Deposit request পাওয়া যায়নি।"
                );

                return;
            }

            if (action === "view") {
                openDepositDetails(deposit);
                return;
            }

            if (action === "approve") {
                selectedDepositId =
                    deposit.depositId;

                approveRequestId.textContent =
                    deposit.depositId;

                openModal(approveModal);
                return;
            }

            if (action === "reject") {
                selectedDepositId =
                    deposit.depositId;

                rejectRequestId.textContent =
                    deposit.depositId;

                rejectReason.value = "";
                rejectNote.value = "";

                openModal(rejectModal);
            }
        }
    );

    /* ==========================
       Search
    ========================== */

    depositSearch?.addEventListener(
        "input",
        () => {
            window.clearTimeout(searchTimer);

            searchTimer = window.setTimeout(
                () => {
                    loadDeposits(false);
                },
                450
            );
        }
    );

    /* ==========================
       Filters
    ========================== */

    statusFilter?.addEventListener(
        "change",
        () => {
            loadDeposits();
        }
    );

    methodFilter?.addEventListener(
        "change",
        () => {
            loadDeposits();
        }
    );

    clearFilters?.addEventListener(
        "click",
        () => {
            if (depositSearch) {
                depositSearch.value = "";
            }

            if (statusFilter) {
                statusFilter.value = "all";
            }

            if (methodFilter) {
                methodFilter.value = "all";
            }

            loadDeposits();

            showToast("Filters cleared.");
        }
    );

    /* ==========================
       Refresh
    ========================== */

    refreshDeposits?.addEventListener(
        "click",
        () => {
            loadDeposits();

            showToast(
                "Deposit requests refreshed."
            );
        }
    );

    /* ==========================
       Details Modal Close
    ========================== */

    closeDetailsModal?.addEventListener(
        "click",
        () => {
            closeModal(detailsModal);
        }
    );

    /* ==========================
       Approve Modal Close
    ========================== */

    closeApproveModal?.addEventListener(
        "click",
        () => {
            closeModal(approveModal);

            selectedDepositId = null;
        }
    );

    cancelApprove?.addEventListener(
        "click",
        () => {
            closeModal(approveModal);

            selectedDepositId = null;
        }
    );

    /* ==========================
       Reject Modal Close
    ========================== */

    closeRejectModal?.addEventListener(
        "click",
        () => {
            closeModal(rejectModal);

            selectedDepositId = null;
        }
    );

    cancelReject?.addEventListener(
        "click",
        () => {
            closeModal(rejectModal);

            selectedDepositId = null;
        }
    );
        /* ==========================
       Approve Deposit
    ========================== */

    confirmApprove?.addEventListener(
        "click",
        async () => {
            if (!selectedDepositId) {
                return;
            }

            confirmApprove.disabled = true;
            closeModal(approveModal);
            showLoader();

            try {
                await apiRequest(
                    `/admin/deposits/${encodeURIComponent(
                        selectedDepositId
                    )}/approve`,
                    {
                        method: "PATCH"
                    }
                );

                showToast(
                    "Deposit approved successfully."
                );

                selectedDepositId = null;

                await loadDeposits(false);
            } catch (error) {
                console.error(
                    "Approve deposit error:",
                    error
                );

                showToast(error.message);
            } finally {
                hideLoader();
                confirmApprove.disabled = false;
            }
        }
    );

    /* ==========================
       Reject Deposit
    ========================== */

    confirmReject?.addEventListener(
        "click",
        async () => {
            if (!selectedDepositId) {
                return;
            }

            const reason =
                rejectReason?.value || "";

            const note =
                rejectNote?.value.trim() || "";

            if (!reason) {
                showToast(
                    "Reject reason নির্বাচন করো।"
                );

                rejectReason?.focus();
                return;
            }

            confirmReject.disabled = true;
            closeModal(rejectModal);
            showLoader();

            try {
                await apiRequest(
                    `/admin/deposits/${encodeURIComponent(
                        selectedDepositId
                    )}/reject`,
                    {
                        method: "PATCH",

                        body: JSON.stringify({
                            reason,
                            note
                        })
                    }
                );

                showToast(
                    "Deposit rejected successfully."
                );

                selectedDepositId = null;

                if (rejectReason) {
                    rejectReason.value = "";
                }

                if (rejectNote) {
                    rejectNote.value = "";
                }

                await loadDeposits(false);
            } catch (error) {
                console.error(
                    "Reject deposit error:",
                    error
                );

                showToast(error.message);
            } finally {
                hideLoader();
                confirmReject.disabled = false;
            }
        }
    );

    /* ==========================
       Logout
    ========================== */

    adminLogoutBtn?.addEventListener(
        "click",
        () => {
            const shouldLogout =
                window.confirm(
                    "Are you sure you want to logout?"
                );

            if (!shouldLogout) {
                return;
            }

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
    );

    /* ==========================
       Sidebar
    ========================== */

    function openSidebar() {
        adminSidebar?.classList.add("open");
        sidebarOverlay?.classList.add("show");
    }

    function closeSidebar() {
        adminSidebar?.classList.remove("open");
        sidebarOverlay?.classList.remove("show");
    }

    sidebarToggle?.addEventListener(
        "click",
        () => {
            const isOpen =
                adminSidebar?.classList.contains(
                    "open"
                );

            if (isOpen) {
                closeSidebar();
            } else {
                openSidebar();
            }
        }
    );

    sidebarOverlay?.addEventListener(
        "click",
        closeSidebar
    );

    /* ==========================
       Outside Click
    ========================== */

    window.addEventListener(
        "click",
        (event) => {
            if (event.target === detailsModal) {
                closeModal(detailsModal);
            }

            if (event.target === approveModal) {
                closeModal(approveModal);
                selectedDepositId = null;
            }

            if (event.target === rejectModal) {
                closeModal(rejectModal);
                selectedDepositId = null;
            }
        }
    );

    /* ==========================
       ESC Key
    ========================== */

    document.addEventListener(
        "keydown",
        (event) => {
            if (event.key !== "Escape") {
                return;
            }

            closeModal(detailsModal);
            closeModal(approveModal);
            closeModal(rejectModal);
            closeSidebar();

            selectedDepositId = null;
        }
    );

    /* ==========================
       Resize Cleanup
    ========================== */

    window.addEventListener(
        "resize",
        () => {
            if (window.innerWidth > 992) {
                closeSidebar();
            }
        }
    );

    console.log(
        "PMS ADDA Real Admin Deposits Loaded Successfully"
    );
});