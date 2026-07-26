const API_BASE_URL =
    APP_CONFIG.API_URL;

const userState = {
    page: 1,
    limit: 10,
    totalPages: 1,
    totalUsers: 0,
    search: "",
    status: "all",
    online: "all",
    selectedUserId: null,
    selectedStatus: null
};

function getToken() {
    return (
        localStorage.getItem("access_token") ||
        localStorage.getItem("token")
    );
}

function getElement(id) {
    return document.getElementById(id);
}

function setText(id, value) {
    const element = getElement(id);

    if (element) {
        element.textContent = value;
    }
}

function formatMoney(value) {
    return Number(value || 0).toLocaleString("en-BD", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
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
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
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

function getInitials(name) {
    const safeName = String(name || "U").trim();

    if (!safeName) {
        return "U";
    }

    return safeName
        .split(/\s+/)
        .slice(0, 2)
        .map(part => part.charAt(0).toUpperCase())
        .join("");
}

function showLoader() {
    getElement("loaderOverlay")
        ?.classList.add("show");
}

function hideLoader() {
    getElement("loaderOverlay")
        ?.classList.remove("show");
}

function showToast(message, type = "success") {
    const toast = getElement("toast");
    const toastMessage = getElement("toastMessage");
    const toastIcon = getElement("toastIcon");

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

    if (toastIcon) {
        toastIcon.className =
            type === "error"
                ? "fa-solid fa-circle-exclamation"
                : "fa-solid fa-circle-check";
    }

    window.clearTimeout(
        showToast.timeoutId
    );

    showToast.timeoutId =
        window.setTimeout(() => {
            toast.classList.remove("show");
        }, 3000);
}

async function apiRequest(
    url,
    options = {}
) {
    const token = getToken();

    if (!token) {
        window.location.href =
            "../pages/login.html";

        throw new Error(
            "Admin login required."
        );
    }

    const requestOptions = {
        method: options.method || "GET",
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
            ...(options.body
                ? {
                    "Content-Type":
                        "application/json"
                }
                : {}),
            ...(options.headers || {})
        }
    };

    if (options.body) {
        requestOptions.body =
            JSON.stringify(options.body);
    }

    const response = await fetch(
        url,
        requestOptions
    );

    let result;

    try {
        result = await response.json();
    } catch {
        throw new Error(
            "Invalid server response."
        );
    }

    if (
        response.status === 401 ||
        response.status === 403
    ) {
        localStorage.removeItem(
            "access_token"
        );

        localStorage.removeItem(
            "refresh_token"
        );

        localStorage.removeItem("user");

        window.location.href =
            "../pages/login.html";

        throw new Error(
            "Login session expired."
        );
    }

    if (
        !response.ok ||
        result.success === false
    ) {
        throw new Error(
            result.message ||
            "Request failed."
        );
    }

    return result;
}

async function loadUserSummary() {
    const result = await apiRequest(
        `${API_BASE_URL}/admin/users/summary`
    );

    const summary = result.data || {};

    setText(
        "totalUsers",
        summary.totalUsers || 0
    );

    setText(
        "activeUsers",
        summary.activeUsers || 0
    );

    setText(
        "bannedUsers",
        summary.bannedUsers || 0
    );

    setText(
        "onlineUsers",
        summary.onlineUsers || 0
    );

    setText(
        "totalWalletBalance",
        formatMoney(
            summary.totalWalletBalance
        )
    );

    setText(
        "totalDeposit",
        formatMoney(
            summary.totalDeposit
        )
    );

    setText(
        "totalWithdraw",
        formatMoney(
            summary.totalWithdraw
        )
    );

    setText(
        "totalTurnover",
        formatMoney(
            summary.totalTurnover
        )
    );
}

function buildUsersUrl() {
    const params = new URLSearchParams({
        page: userState.page,
        limit: userState.limit,
        search: userState.search,
        status: userState.status,
        online: userState.online
    });

    return (
        `${API_BASE_URL}` +
        `/admin/users?${params.toString()}`
    );
}

async function loadUsers() {
    try {
        showLoader();

        const result = await apiRequest(
            buildUsersUrl()
        );

        const data = result.data || {};

        renderUsersTable(
            data.users || []
        );

        updatePagination(
            data.pagination || {}
        );
    } catch (error) {
        console.error(
            "Load users error:",
            error
        );

        renderUsersTable([]);

        showToast(
            error.message,
            "error"
        );
    } finally {
        hideLoader();
    }
}

function renderUsersTable(users) {
    const tableBody = getElement(
        "usersTableBody"
    );

    if (!tableBody) {
        return;
    }

    if (
        !Array.isArray(users) ||
        users.length === 0
    ) {
        tableBody.innerHTML = `
            <tr>
                <td
                    colspan="10"
                    class="empty-cell"
                >
                    No users found.
                </td>
            </tr>
        `;

        return;
    }

    tableBody.innerHTML = users
        .map(user => {
            const fullName =
                user.full_name ||
                user.username ||
                "Unknown User";

            const status =
                user.account_status ===
                "banned"
                    ? "banned"
                    : "active";

            const onlineClass =
                user.is_online
                    ? "online"
                    : "offline";

            const onlineText =
                user.is_online
                    ? "Online"
                    : "Offline";

            const actionButton =
                status === "banned"
                    ? `
                        <button
                            type="button"
                            class="action-btn activate"
                            title="Activate user"
                            data-action="status"
                            data-user-id="${user.id}"
                            data-next-status="active"
                            data-user-name="${escapeHtml(
                                fullName
                            )}"
                        >
                            <i
                                class="fa-solid fa-user-check"
                            ></i>
                        </button>
                    `
                    : `
                        <button
                            type="button"
                            class="action-btn ban"
                            title="Ban user"
                            data-action="status"
                            data-user-id="${user.id}"
                            data-next-status="banned"
                            data-user-name="${escapeHtml(
                                fullName
                            )}"
                        >
                            <i
                                class="fa-solid fa-user-slash"
                            ></i>
                        </button>
                    `;

            return `
                <tr>
                    <td>
                        <div class="user-cell">

                            <div class="user-avatar">
                                ${escapeHtml(
                                    getInitials(
                                        fullName
                                    )
                                )}
                            </div>

                            <div>
                                <strong>
                                    ${escapeHtml(
                                        fullName
                                    )}
                                </strong>

                                <small>
                                    UID:
                                    ${escapeHtml(
                                        user.uid || "-"
                                    )}
                                </small>

                                <small>
                                    @${escapeHtml(
                                        user.username ||
                                        "-"
                                    )}
                                </small>
                            </div>

                        </div>
                    </td>

                    <td>
                        <strong>
                            ${escapeHtml(
                                user.phone || "-"
                            )}
                        </strong>

                        <small>
                            ${escapeHtml(
                                user.email || "-"
                            )}
                        </small>
                    </td>

                    <td>
                        <span class="money-positive">
                            ৳${formatMoney(
                                user.wallet_balance
                            )}
                        </span>
                    </td>

                    <td>
                        <span class="money-positive">
                            ৳${formatMoney(
                                user.total_deposit
                            )}
                        </span>
                    </td>

                    <td>
                        <span class="money-negative">
                            ৳${formatMoney(
                                user.total_withdraw
                            )}
                        </span>
                    </td>

                    <td>
                        ৳${formatMoney(
                            user.turnover_amount
                        )}
                    </td>

                    <td>
                        <span
                            class="status-badge ${status}"
                        >
                            ${escapeHtml(status)}
                        </span>
                    </td>

                    <td>
                        <span
                            class="online-badge ${onlineClass}"
                        >
                            <span
                                class="online-dot"
                            ></span>

                            ${onlineText}
                        </span>
                    </td>

                    <td>
                        ${escapeHtml(
                            formatDate(
                                user.created_at
                            )
                        )}
                    </td>

                    <td>
                        <div class="action-buttons">

                            <button
                                type="button"
                                class="action-btn view"
                                title="View details"
                                data-action="view"
                                data-user-id="${user.id}"
                            >
                                <i
                                    class="fa-solid fa-eye"
                                ></i>
                            </button>

                            ${actionButton}

                        </div>
                    </td>
                </tr>
            `;
        })
        .join("");
}

function updatePagination(pagination) {
    userState.page = Number(
        pagination.page || 1
    );

    userState.limit = Number(
        pagination.limit ||
        userState.limit ||
        10
    );

    userState.totalPages = Number(
        pagination.totalPages || 1
    );

    userState.totalUsers = Number(
        pagination.total || 0
    );

    setText(
        "paginationInfo",
        `Page ${userState.page} of ` +
        `${userState.totalPages}`
    );

    const start =
        userState.totalUsers === 0
            ? 0
            : (
                (userState.page - 1) *
                userState.limit
            ) + 1;

    const end = Math.min(
        userState.page *
        userState.limit,
        userState.totalUsers
    );

    setText(
        "paginationResults",
        userState.totalUsers === 0
            ? "Showing 0 users"
            : `Showing ${start}-${end} of ` +
              `${userState.totalUsers} users`
    );

    const previousButton =
        getElement("previousPageBtn");

    const nextButton =
        getElement("nextPageBtn");

    if (previousButton) {
        previousButton.disabled =
            userState.page <= 1;
    }

    if (nextButton) {
        nextButton.disabled =
            userState.page >=
            userState.totalPages;
    }
}

function readFilters() {
    userState.search =
        getElement("userSearch")
            ?.value.trim() || "";

    userState.status =
        getElement("statusFilter")
            ?.value || "all";

    userState.online =
        getElement("onlineFilter")
            ?.value || "all";

    userState.limit = Number(
        getElement("pageLimit")
            ?.value || 10
    );
}

function applyFilters() {
    userState.page = 1;

    readFilters();

    loadUsers();
}

function resetFilters() {
    const searchInput =
        getElement("userSearch");

    const statusFilter =
        getElement("statusFilter");

    const onlineFilter =
        getElement("onlineFilter");

    const pageLimit =
        getElement("pageLimit");

    if (searchInput) {
        searchInput.value = "";
    }

    if (statusFilter) {
        statusFilter.value = "all";
    }

    if (onlineFilter) {
        onlineFilter.value = "all";
    }

    if (pageLimit) {
        pageLimit.value = "10";
    }

    userState.page = 1;
    userState.limit = 10;
    userState.search = "";
    userState.status = "all";
    userState.online = "all";

    loadUsers();
}

async function openUserDetails(userId) {
    const modal = getElement(
        "userDetailsModal"
    );

    const content = getElement(
        "userDetailsContent"
    );

    if (!modal || !content) {
        return;
    }

    modal.classList.add("show");

    content.innerHTML = `
        <div class="modal-loading">
            Loading user details...
        </div>
    `;

    try {
        const result = await apiRequest(
            `${API_BASE_URL}/admin/users/${userId}`
        );

        const user =
            result.data?.user;

        if (!user) {
            throw new Error(
                "User information not found."
            );
        }

        renderUserDetails(user);
    } catch (error) {
        console.error(
            "Load user details error:",
            error
        );

        content.innerHTML = `
            <div class="modal-loading">
                ${escapeHtml(error.message)}
            </div>
        `;

        showToast(
            error.message,
            "error"
        );
    }
}

function renderUserDetails(user) {
    const content = getElement(
        "userDetailsContent"
    );

    if (!content) {
        return;
    }

    const fullName =
        user.full_name ||
        user.username ||
        "Unknown User";

    const status =
        user.account_status === "banned"
            ? "banned"
            : "active";

    const onlineClass =
        user.is_online
            ? "online"
            : "offline";

    const onlineText =
        user.is_online
            ? "Online"
            : "Offline";

    content.innerHTML = `
        <div class="user-detail-header">

            <div class="user-detail-avatar">
                ${escapeHtml(
                    getInitials(fullName)
                )}
            </div>

            <div>
                <h3>
                    ${escapeHtml(fullName)}
                </h3>

                <p>
                    UID:
                    ${escapeHtml(
                        user.uid || "-"
                    )}
                    ·
                    @${escapeHtml(
                        user.username || "-"
                    )}
                </p>
            </div>

        </div>

        <div class="user-detail-grid">

            ${createDetailItem(
                "Database ID",
                user.id
            )}

            ${createDetailItem(
                "Role",
                user.role || "-"
            )}

            ${createDetailItem(
                "Phone Number",
                user.phone || "-"
            )}

            ${createDetailItem(
                "Email Address",
                user.email || "-"
            )}

            <div class="detail-item">
                <span>Account Status</span>

                <strong>
                    <span
                        class="status-badge ${status}"
                    >
                        ${escapeHtml(status)}
                    </span>
                </strong>
            </div>

            <div class="detail-item">
                <span>Online Status</span>

                <strong>
                    <span
                        class="online-badge ${onlineClass}"
                    >
                        <span
                            class="online-dot"
                        ></span>

                        ${onlineText}
                    </span>
                </strong>
            </div>

            ${createDetailItem(
                "Wallet Balance",
                `৳${formatMoney(
                    user.wallet_balance
                )}`
            )}

            ${createDetailItem(
                "Turnover Amount",
                `৳${formatMoney(
                    user.turnover_amount
                )}`
            )}

            ${createDetailItem(
                "Total Deposit",
                `৳${formatMoney(
                    user.total_deposit
                )}`
            )}

            ${createDetailItem(
                "Total Withdraw",
                `৳${formatMoney(
                    user.total_withdraw
                )}`
            )}

            ${createDetailItem(
                "Last Login",
                formatDate(
                    user.last_login_at
                )
            )}

            ${createDetailItem(
                "Registered At",
                formatDate(
                    user.created_at
                )
            )}

            ${createDetailItem(
                "Last Updated",
                formatDate(
                    user.updated_at
                )
            )}

        </div>
    `;
}

function createDetailItem(
    label,
    value
) {
    return `
        <div class="detail-item">
            <span>
                ${escapeHtml(label)}
            </span>

            <strong>
                ${escapeHtml(
                    value ?? "-"
                )}
            </strong>
        </div>
    `;
}

function closeUserDetailsModal() {
    getElement("userDetailsModal")
        ?.classList.remove("show");
}

function openStatusConfirmation({
    userId,
    nextStatus,
    userName
}) {
    userState.selectedUserId =
        Number(userId);

    userState.selectedStatus =
        nextStatus;

    const modal = getElement(
        "statusConfirmModal"
    );

    const title = getElement(
        "confirmStatusTitle"
    );

    const message = getElement(
        "confirmStatusMessage"
    );

    const confirmButton = getElement(
        "confirmStatusBtn"
    );

    const icon = getElement(
        "confirmStatusIcon"
    );

    const isBanning =
        nextStatus === "banned";

    if (title) {
        title.textContent =
            isBanning
                ? "Ban User"
                : "Activate User";
    }

    if (message) {
        message.textContent =
            isBanning
                ? `Are you sure you want to ban ${userName}? The user will not be able to use the account.`
                : `Are you sure you want to activate ${userName}?`;
    }

    if (confirmButton) {
        confirmButton.textContent =
            isBanning
                ? "Ban User"
                : "Activate User";

        confirmButton.classList.toggle(
            "activate",
            !isBanning
        );
    }

    if (icon) {
        icon.innerHTML =
            isBanning
                ? `
                    <i
                        class="fa-solid fa-user-slash"
                    ></i>
                `
                : `
                    <i
                        class="fa-solid fa-user-check"
                    ></i>
                `;
    }

    modal?.classList.add("show");
}

function closeStatusConfirmation() {
    getElement("statusConfirmModal")
        ?.classList.remove("show");

    userState.selectedUserId = null;
    userState.selectedStatus = null;
}

async function confirmStatusUpdate() {
    const userId =
        userState.selectedUserId;

    const accountStatus =
        userState.selectedStatus;

    if (
        !userId ||
        !["active", "banned"].includes(
            accountStatus
        )
    ) {
        showToast(
            "Invalid user status request.",
            "error"
        );

        closeStatusConfirmation();

        return;
    }

    const confirmButton = getElement(
        "confirmStatusBtn"
    );

    const originalText =
        confirmButton?.textContent;

    try {
        if (confirmButton) {
            confirmButton.disabled = true;
            confirmButton.textContent =
                "Processing...";
        }

        showLoader();

        const result = await apiRequest(
            `${API_BASE_URL}/admin/users/${userId}/status`,
            {
                method: "PATCH",

                body: {
                    account_status:
                        accountStatus
                }
            }
        );

        closeStatusConfirmation();

        showToast(
            result.message ||
            "User status updated successfully."
        );

        await Promise.all([
            loadUserSummary(),
            loadUsers()
        ]);
    } catch (error) {
        console.error(
            "Update status error:",
            error
        );

        showToast(
            error.message,
            "error"
        );
    } finally {
        hideLoader();

        if (confirmButton) {
            confirmButton.disabled = false;

            confirmButton.textContent =
                originalText || "Confirm";
        }
    }
}

function handleTableAction(event) {
    const button =
        event.target.closest(
            "[data-action]"
        );

    if (!button) {
        return;
    }

    const action =
        button.dataset.action;

    const userId =
        button.dataset.userId;

    if (action === "view") {
        openUserDetails(userId);
        return;
    }

    if (action === "status") {
        openStatusConfirmation({
            userId,

            nextStatus:
                button.dataset.nextStatus,

            userName:
                button.dataset.userName ||
                "this user"
        });
    }
}

function openSidebar() {
    getElement("adminSidebar")
        ?.classList.add("open");

    getElement("sidebarOverlay")
        ?.classList.add("show");
}

function closeSidebar() {
    getElement("adminSidebar")
        ?.classList.remove("open");

    getElement("sidebarOverlay")
        ?.classList.remove("show");
}

function toggleSidebar() {
    const sidebar = getElement(
        "adminSidebar"
    );

    const overlay = getElement(
        "sidebarOverlay"
    );

    if (!sidebar) {
        return;
    }

    const isOpen =
        sidebar.classList.toggle("open");

    overlay?.classList.toggle(
        "show",
        isOpen
    );
}

function logoutAdmin() {
    localStorage.removeItem(
        "access_token"
    );

    localStorage.removeItem(
        "refresh_token"
    );

    localStorage.removeItem("token");
    localStorage.removeItem("user");

    window.location.href =
        "../pages/login.html";
}

function debounce(
    callback,
    delay = 450
) {
    let timeoutId;

    return function (...args) {
        window.clearTimeout(
            timeoutId
        );

        timeoutId =
            window.setTimeout(() => {
                callback.apply(
                    this,
                    args
                );
            }, delay);
    };
}

const handleSearchInput =
    debounce(() => {
        applyFilters();
    });

async function refreshUsersPage() {
    try {
        showLoader();

        await Promise.all([
            loadUserSummary(),
            loadUsers()
        ]);

        showToast(
            "Users refreshed successfully."
        );
    } catch (error) {
        showToast(
            error.message,
            "error"
        );
    } finally {
        hideLoader();
    }
}

function registerEventListeners() {
    getElement("userSearch")
        ?.addEventListener(
            "input",
            handleSearchInput
        );

    getElement("statusFilter")
        ?.addEventListener(
            "change",
            applyFilters
        );

    getElement("onlineFilter")
        ?.addEventListener(
            "change",
            applyFilters
        );

    getElement("pageLimit")
        ?.addEventListener(
            "change",
            applyFilters
        );

    getElement("resetFiltersBtn")
        ?.addEventListener(
            "click",
            resetFilters
        );

    getElement("refreshUsersBtn")
        ?.addEventListener(
            "click",
            refreshUsersPage
        );

    getElement("previousPageBtn")
        ?.addEventListener(
            "click",
            () => {
                if (userState.page <= 1) {
                    return;
                }

                userState.page -= 1;
                loadUsers();
            }
        );

    getElement("nextPageBtn")
        ?.addEventListener(
            "click",
            () => {
                if (
                    userState.page >=
                    userState.totalPages
                ) {
                    return;
                }

                userState.page += 1;
                loadUsers();
            }
        );

    getElement("usersTableBody")
        ?.addEventListener(
            "click",
            handleTableAction
        );

    getElement("closeUserModalBtn")
        ?.addEventListener(
            "click",
            closeUserDetailsModal
        );

    getElement("cancelStatusBtn")
        ?.addEventListener(
            "click",
            closeStatusConfirmation
        );

    getElement("confirmStatusBtn")
        ?.addEventListener(
            "click",
            confirmStatusUpdate
        );

    getElement("sidebarToggle")
        ?.addEventListener(
            "click",
            toggleSidebar
        );

    getElement("sidebarOverlay")
        ?.addEventListener(
            "click",
            closeSidebar
        );

    getElement("adminLogoutBtn")
        ?.addEventListener(
            "click",
            logoutAdmin
        );

    getElement("userDetailsModal")
        ?.addEventListener(
            "click",
            event => {
                if (
                    event.target.id ===
                    "userDetailsModal"
                ) {
                    closeUserDetailsModal();
                }
            }
        );

    getElement("statusConfirmModal")
        ?.addEventListener(
            "click",
            event => {
                if (
                    event.target.id ===
                    "statusConfirmModal"
                ) {
                    closeStatusConfirmation();
                }
            }
        );

    document.addEventListener(
        "keydown",
        event => {
            if (event.key !== "Escape") {
                return;
            }

            closeUserDetailsModal();
            closeStatusConfirmation();
            closeSidebar();
        }
    );

    window.addEventListener(
        "resize",
        () => {
            if (
                window.innerWidth > 850
            ) {
                closeSidebar();
            }
        }
    );
}

async function initializeUsersPage() {
    registerEventListeners();

    try {
        showLoader();

        await Promise.all([
            loadUserSummary(),
            loadUsers()
        ]);
    } catch (error) {
        console.error(
            "Initialize users page error:",
            error
        );

        showToast(
            error.message,
            "error"
        );
    } finally {
        hideLoader();
    }
}

document.addEventListener(
    "DOMContentLoaded",
    initializeUsersPage
);