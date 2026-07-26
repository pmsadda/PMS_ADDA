const API_BASE_URL =
    APP_CONFIG.api(
        "/admin/games"
    );

const state = {
    currentPage: 1,
    limit: 10,
    totalPages: 1,
    search: "",
    gameType: "all",
    status: "all",
    selectedRoomId: null,
    selectedStatus: null,
    searchTimer: null
};

/* =========================
   Elements
========================= */

const elements = {
    totalRooms: document.getElementById("totalRooms"),
    waitingRooms: document.getElementById("waitingRooms"),
    runningRooms: document.getElementById("runningRooms"),
    activePlayers: document.getElementById("activePlayers"),

    roomsTableBody: document.getElementById("roomsTableBody"),

    roomSearchInput: document.getElementById("roomSearchInput"),
    gameTypeFilter: document.getElementById("gameTypeFilter"),
    roomStatusFilter: document.getElementById("roomStatusFilter"),
    refreshRoomsBtn: document.getElementById("refreshRoomsBtn"),

    previousPageBtn: document.getElementById("previousPageBtn"),
    nextPageBtn: document.getElementById("nextPageBtn"),
    currentPageText: document.getElementById("currentPageText"),
    paginationInfo: document.getElementById("paginationInfo"),

    openCreateRoomBtn: document.getElementById("openCreateRoomBtn"),

    roomFormModal: document.getElementById("roomFormModal"),
    closeRoomFormModalBtn: document.getElementById("closeRoomFormModalBtn"),
    cancelRoomFormBtn: document.getElementById("cancelRoomFormBtn"),
    roomFormModalTitle: document.getElementById("roomFormModalTitle"),
    roomForm: document.getElementById("roomForm"),
    roomIdInput: document.getElementById("roomIdInput"),
    roomNameInput: document.getElementById("roomNameInput"),
    roomGameTypeInput: document.getElementById("roomGameTypeInput"),
    maxPlayersInput: document.getElementById("maxPlayersInput"),
    bootAmountInput: document.getElementById("bootAmountInput"),
    serviceChargeInput: document.getElementById("serviceChargeInput"),
    submitRoomFormBtn: document.getElementById("submitRoomFormBtn"),

    viewRoomModal: document.getElementById("viewRoomModal"),
    closeViewRoomModalBtn: document.getElementById("closeViewRoomModalBtn"),
    roomDetailsContent: document.getElementById("roomDetailsContent"),

    deleteRoomModal: document.getElementById("deleteRoomModal"),
    cancelDeleteRoomBtn: document.getElementById("cancelDeleteRoomBtn"),
    confirmDeleteRoomBtn: document.getElementById("confirmDeleteRoomBtn"),

    statusRoomModal: document.getElementById("statusRoomModal"),
    statusModalTitle: document.getElementById("statusModalTitle"),
    statusModalMessage: document.getElementById("statusModalMessage"),
    cancelStatusRoomBtn: document.getElementById("cancelStatusRoomBtn"),
    confirmStatusRoomBtn: document.getElementById("confirmStatusRoomBtn"),

    pageLoader: document.getElementById("pageLoader"),
    toastContainer: document.getElementById("toastContainer"),

    sidebar: document.getElementById("sidebar"),
    sidebarOverlay: document.getElementById("sidebarOverlay"),
    sidebarOpenBtn: document.getElementById("sidebarOpenBtn"),
    sidebarCloseBtn: document.getElementById("sidebarCloseBtn"),

    logoutBtn: document.getElementById("logoutBtn"),
    adminName: document.getElementById("adminName")
};

/* =========================
   Authentication
========================= */

function getToken() {
    return (
        localStorage.getItem("access_token") ||
        localStorage.getItem("token")
    );
}

function getStoredUser() {
    const savedUser =
        localStorage.getItem("user") ||
        localStorage.getItem("admin_user");

    if (!savedUser) {
        return null;
    }

    try {
        return JSON.parse(savedUser);
    } catch (error) {
        return null;
    }
}

function logout() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("admin_user");

    window.location.href = "../pages/login.html";
}

function checkAuthentication() {
    const token = getToken();

    if (!token) {
        window.location.href = "../pages/login.html";
        return false;
    }

    const user = getStoredUser();

    if (user && user.role && user.role !== "admin") {
        showToast(
            "error",
            "Access denied",
            "Only administrators can access this page."
        );

        setTimeout(logout, 1200);
        return false;
    }

    if (user) {
        elements.adminName.textContent =
            user.full_name ||
            user.username ||
            user.name ||
            "Admin";
    }

    return true;
}

/* =========================
   API Helper
========================= */

async function apiRequest(
    endpoint = "",
    options = {}
) {
    const token = getToken();

    const response = await fetch(
        `${API_BASE_URL}${endpoint}`,
        {
            method: options.method || "GET",

            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
                ...(options.headers || {})
            },

            body: options.body
                ? JSON.stringify(options.body)
                : undefined
        }
    );

    let responseData;

    try {
        responseData = await response.json();
    } catch (error) {
        responseData = {
            success: false,
            message: "Invalid server response."
        };
    }

    if (response.status === 401) {
        showToast(
            "error",
            "Session expired",
            "Please log in again."
        );

        setTimeout(logout, 1000);

        throw new Error("Unauthorized");
    }

    if (!response.ok || responseData.success === false) {
        throw new Error(
            responseData.message ||
            "Request failed."
        );
    }

    return responseData;
}

/* =========================
   Loader
========================= */

function showLoader() {
    elements.pageLoader.classList.remove("hidden");
}

function hideLoader() {
    elements.pageLoader.classList.add("hidden");
}

/* =========================
   Toast
========================= */

function showToast(
    type,
    title,
    message
) {
    const toast = document.createElement("div");

    toast.className = `toast ${type}`;

    let iconClass = "fa-circle-info";

    if (type === "success") {
        iconClass = "fa-circle-check";
    }

    if (type === "error") {
        iconClass = "fa-circle-xmark";
    }

    if (type === "warning") {
        iconClass = "fa-triangle-exclamation";
    }

    toast.innerHTML = `
        <div class="toast-icon">
            <i class="fa-solid ${iconClass}"></i>
        </div>

        <div class="toast-content">
            <strong>${escapeHtml(title)}</strong>
            <p>${escapeHtml(message)}</p>
        </div>

        <button
            type="button"
            class="toast-close-btn"
        >
            <i class="fa-solid fa-xmark"></i>
        </button>
    `;

    const closeButton =
        toast.querySelector(".toast-close-btn");

    closeButton.addEventListener(
        "click",
        () => toast.remove()
    );

    elements.toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 4000);
}

/* =========================
   Utility
========================= */

function escapeHtml(value) {
    const div = document.createElement("div");

    div.textContent = String(
        value ?? ""
    );

    return div.innerHTML;
}

function formatMoney(value) {
    const amount = Number(value || 0);

    return new Intl.NumberFormat(
        "en-BD",
        {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }
    ).format(amount);
}

function formatDate(value) {
    if (!value) {
        return "N/A";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "N/A";
    }

    return date.toLocaleString("en-BD");
}

function getGameName(gameType) {
    const gameNames = {
        teen_patti: "Teen Patti",
        poker: "Poker",
        ludo: "Ludo"
    };

    return gameNames[gameType] || gameType;
}

function capitalize(value) {
    const text = String(value || "");

    return text.charAt(0).toUpperCase() +
        text.slice(1);
}

function openModal(modal) {
    modal.classList.add("show");
    document.body.style.overflow = "hidden";
}

function closeModal(modal) {
    modal.classList.remove("show");

    const openedModal =
        document.querySelector(".modal.show");

    if (!openedModal) {
        document.body.style.overflow = "";
    }
}

/* =========================
   Summary
========================= */

async function loadSummary() {
    try {
        const response =
            await apiRequest("/summary");

        const summary =
            response.data || {};

        elements.totalRooms.textContent =
            summary.totalRooms || 0;

        elements.waitingRooms.textContent =
            summary.waitingRooms || 0;

        elements.runningRooms.textContent =
            summary.runningRooms || 0;

        elements.activePlayers.textContent =
            summary.activePlayers || 0;
    } catch (error) {
        console.error(
            "Load summary error:",
            error
        );

        showToast(
            "error",
            "Summary error",
            error.message
        );
    }
}

/* =========================
   Load Rooms
========================= */

function buildRoomQuery() {
    const params = new URLSearchParams();

    params.set(
        "page",
        state.currentPage
    );

    params.set(
        "limit",
        state.limit
    );

    if (state.search) {
        params.set(
            "search",
            state.search
        );
    }

    if (state.gameType !== "all") {
        params.set(
            "game_type",
            state.gameType
        );
    }

    if (state.status !== "all") {
        params.set(
            "status",
            state.status
        );
    }

    return params.toString();
}

async function loadRooms(
    showPageLoader = true
) {
    if (showPageLoader) {
        showLoader();
    }

    try {
        const query = buildRoomQuery();

        const response =
            await apiRequest(`?${query}`);

        const result =
            response.data || {};

        const rooms =
            result.rooms || [];

        const pagination =
            result.pagination || {};

        state.currentPage =
            Number(pagination.page || 1);

        state.totalPages =
            Number(pagination.totalPages || 1);

        renderRooms(rooms);
        renderPagination(pagination);
    } catch (error) {
        console.error(
            "Load rooms error:",
            error
        );

        elements.roomsTableBody.innerHTML = `
            <tr>
                <td
                    colspan="8"
                    class="empty-table-message"
                >
                    Failed to load rooms.
                </td>
            </tr>
        `;

        showToast(
            "error",
            "Load failed",
            error.message
        );
    } finally {
        if (showPageLoader) {
            hideLoader();
        }
    }
}

/* =========================
   Render Rooms
========================= */

function renderRooms(rooms) {
    if (!rooms.length) {
        elements.roomsTableBody.innerHTML = `
            <tr>
                <td
                    colspan="8"
                    class="empty-table-message"
                >
                    No game rooms found.
                </td>
            </tr>
        `;

        return;
    }

    elements.roomsTableBody.innerHTML =
        rooms.map(room => {
            const canEdit =
                room.status !== "running";

            const canDelete =
                room.status !== "running" &&
                Number(room.current_players || 0) === 0;

            const targetStatus =
                room.status === "disabled"
                    ? "waiting"
                    : "disabled";

            const statusIcon =
                room.status === "disabled"
                    ? "fa-circle-check"
                    : "fa-ban";

            const statusTitle =
                room.status === "disabled"
                    ? "Enable room"
                    : "Disable room";

            return `
                <tr>
                    <td>
                        <strong>
                            ${escapeHtml(room.room_code)}
                        </strong>
                    </td>

                    <td>
                        ${escapeHtml(room.room_name)}
                    </td>

                    <td>
                        <span class="game-badge">
                            ${escapeHtml(
                                getGameName(room.game_type)
                            )}
                        </span>
                    </td>

                    <td>
                        ৳${formatMoney(room.boot_amount)}
                    </td>

                    <td>
                        ${Number(room.current_players || 0)}
                        /
                        ${Number(room.max_players || 0)}
                    </td>

                    <td>
                        ${formatMoney(room.service_charge)}%
                    </td>

                    <td>
                        <span
                            class="status-badge
                            status-${escapeHtml(room.status)}"
                        >
                            ${escapeHtml(
                                capitalize(room.status)
                            )}
                        </span>
                    </td>

                    <td>
                        <div class="action-buttons">

                            <button
                                type="button"
                                class="action-btn view-btn"
                                data-action="view"
                                data-id="${room.id}"
                                title="View room"
                            >
                                <i class="fa-solid fa-eye"></i>
                            </button>

                            <button
                                type="button"
                                class="action-btn edit-btn"
                                data-action="edit"
                                data-id="${room.id}"
                                title="Edit room"
                                ${canEdit ? "" : "disabled"}
                            >
                                <i class="fa-solid fa-pen"></i>
                            </button>

                            <button
                                type="button"
                                class="action-btn status-btn"
                                data-action="status"
                                data-id="${room.id}"
                                data-status="${targetStatus}"
                                data-room-name="${escapeHtml(
                                    room.room_name
                                )}"
                                title="${statusTitle}"
                            >
                                <i class="fa-solid ${statusIcon}"></i>
                            </button>

                            <button
                                type="button"
                                class="action-btn delete-btn"
                                data-action="delete"
                                data-id="${room.id}"
                                title="Delete room"
                                ${canDelete ? "" : "disabled"}
                            >
                                <i class="fa-solid fa-trash"></i>
                            </button>

                        </div>
                    </td>
                </tr>
            `;
        }).join("");
}

/* =========================
   Pagination
========================= */

function renderPagination(pagination) {
    const page =
        Number(pagination.page || 1);

    const limit =
        Number(pagination.limit || state.limit);

    const total =
        Number(pagination.total || 0);

    const totalPages =
        Number(pagination.totalPages || 1);

    const start =
        total === 0
            ? 0
            : (page - 1) * limit + 1;

    const end =
        Math.min(
            page * limit,
            total
        );

    elements.paginationInfo.textContent =
        `Showing ${start}-${end} of ${total} rooms`;

    elements.currentPageText.textContent =
        `Page ${page} of ${totalPages}`;

    elements.previousPageBtn.disabled =
        page <= 1;

    elements.nextPageBtn.disabled =
        page >= totalPages;
}

/* =========================
   Create Room
========================= */

function openCreateRoomModal() {
    elements.roomForm.reset();

    elements.roomIdInput.value = "";
    elements.serviceChargeInput.value = "5";

    elements.roomFormModalTitle.textContent =
        "Create Game Room";

    elements.submitRoomFormBtn.innerHTML = `
        <i class="fa-solid fa-floppy-disk"></i>
        Save Room
    `;

    openModal(elements.roomFormModal);
}

/* =========================
   Get Room Details
========================= */

async function getRoom(roomId) {
    const response =
        await apiRequest(`/${roomId}`);

    return (
        response.data?.room ||
        response.data
    );
}

/* =========================
   View Room
========================= */

async function openViewRoomModal(roomId) {
    openModal(elements.viewRoomModal);

    elements.roomDetailsContent.innerHTML =
        "Loading room details...";

    try {
        const room =
            await getRoom(roomId);

        elements.roomDetailsContent.innerHTML = `
            <div class="detail-item">
                <span>Room Code</span>
                <strong>
                    ${escapeHtml(room.room_code)}
                </strong>
            </div>

            <div class="detail-item">
                <span>Room Name</span>
                <strong>
                    ${escapeHtml(room.room_name)}
                </strong>
            </div>

            <div class="detail-item">
                <span>Game Type</span>
                <strong>
                    ${escapeHtml(
                        getGameName(room.game_type)
                    )}
                </strong>
            </div>

            <div class="detail-item">
                <span>Boot Amount</span>
                <strong>
                    ৳${formatMoney(room.boot_amount)}
                </strong>
            </div>

            <div class="detail-item">
                <span>Maximum Players</span>
                <strong>
                    ${Number(room.max_players || 0)}
                </strong>
            </div>

            <div class="detail-item">
                <span>Current Players</span>
                <strong>
                    ${Number(room.current_players || 0)}
                </strong>
            </div>

            <div class="detail-item">
                <span>Service Charge</span>
                <strong>
                    ${formatMoney(room.service_charge)}%
                </strong>
            </div>

            <div class="detail-item">
                <span>Status</span>
                <strong>
                    ${escapeHtml(
                        capitalize(room.status)
                    )}
                </strong>
            </div>

            <div class="detail-item">
                <span>Created At</span>
                <strong>
                    ${escapeHtml(
                        formatDate(room.created_at)
                    )}
                </strong>
            </div>

            <div class="detail-item">
                <span>Updated At</span>
                <strong>
                    ${escapeHtml(
                        formatDate(room.updated_at)
                    )}
                </strong>
            </div>
        `;
    } catch (error) {
        elements.roomDetailsContent.innerHTML = `
            <div class="detail-item">
                <strong>
                    Failed to load room details.
                </strong>
            </div>
        `;

        showToast(
            "error",
            "Load failed",
            error.message
        );
    }
}

/* =========================
   Edit Room
========================= */

async function openEditRoomModal(roomId) {
    showLoader();

    try {
        const room =
            await getRoom(roomId);

        elements.roomIdInput.value =
            room.id;

        elements.roomNameInput.value =
            room.room_name;

        elements.roomGameTypeInput.value =
            room.game_type;

        elements.maxPlayersInput.value =
            room.max_players;

        elements.bootAmountInput.value =
            room.boot_amount;

        elements.serviceChargeInput.value =
            room.service_charge;

        elements.roomFormModalTitle.textContent =
            "Edit Game Room";

        elements.submitRoomFormBtn.innerHTML = `
            <i class="fa-solid fa-pen"></i>
            Update Room
        `;

        openModal(elements.roomFormModal);
    } catch (error) {
        showToast(
            "error",
            "Load failed",
            error.message
        );
    } finally {
        hideLoader();
    }
}

/* =========================
   Submit Create/Edit Form
========================= */

async function handleRoomFormSubmit(event) {
    event.preventDefault();

    const roomId =
        elements.roomIdInput.value.trim();

    const payload = {
        room_name:
            elements.roomNameInput.value.trim(),

        game_type:
            elements.roomGameTypeInput.value,

        max_players:
            Number(elements.maxPlayersInput.value),

        boot_amount:
            Number(elements.bootAmountInput.value),

        service_charge:
            Number(elements.serviceChargeInput.value)
    };

    if (!payload.room_name) {
        showToast(
            "warning",
            "Validation",
            "Room name is required."
        );

        return;
    }

    if (!payload.game_type) {
        showToast(
            "warning",
            "Validation",
            "Please select a game type."
        );

        return;
    }

    if (
        payload.max_players < 2 ||
        payload.max_players > 10
    ) {
        showToast(
            "warning",
            "Validation",
            "Maximum players must be between 2 and 10."
        );

        return;
    }

    showLoader();

    try {
        if (roomId) {
            await apiRequest(
                `/${roomId}`,
                {
                    method: "PATCH",
                    body: payload
                }
            );

            showToast(
                "success",
                "Room updated",
                "Game room updated successfully."
            );
        } else {
            await apiRequest(
                "",
                {
                    method: "POST",
                    body: payload
                }
            );

            showToast(
                "success",
                "Room created",
                "Game room created successfully."
            );
        }

        closeModal(elements.roomFormModal);

        await Promise.all([
            loadSummary(),
            loadRooms(false)
        ]);
    } catch (error) {
        showToast(
            "error",
            "Save failed",
            error.message
        );
    } finally {
        hideLoader();
    }
}

/* =========================
   Delete Room
========================= */

function openDeleteRoomModal(roomId) {
    state.selectedRoomId =
        Number(roomId);

    openModal(elements.deleteRoomModal);
}

async function confirmDeleteRoom() {
    if (!state.selectedRoomId) {
        return;
    }

    showLoader();

    try {
        await apiRequest(
            `/${state.selectedRoomId}`,
            {
                method: "DELETE"
            }
        );

        closeModal(elements.deleteRoomModal);

        showToast(
            "success",
            "Room deleted",
            "Game room deleted successfully."
        );

        state.selectedRoomId = null;

        await Promise.all([
            loadSummary(),
            loadRooms(false)
        ]);
    } catch (error) {
        showToast(
            "error",
            "Delete failed",
            error.message
        );
    } finally {
        hideLoader();
    }
}

/* =========================
   Change Room Status
========================= */

function openStatusRoomModal(
    roomId,
    status,
    roomName
) {
    state.selectedRoomId =
        Number(roomId);

    state.selectedStatus =
        status;

    const actionText =
        status === "disabled"
            ? "Disable"
            : "Enable";

    elements.statusModalTitle.textContent =
        `${actionText} Room`;

    elements.statusModalMessage.textContent =
        `Are you sure you want to ${actionText.toLowerCase()} "${roomName}"?`;

    elements.confirmStatusRoomBtn.textContent =
        actionText;

    openModal(elements.statusRoomModal);
}

async function confirmStatusChange() {
    if (
        !state.selectedRoomId ||
        !state.selectedStatus
    ) {
        return;
    }

    showLoader();

    try {
        await apiRequest(
            `/${state.selectedRoomId}/status`,
            {
                method: "PATCH",

                body: {
                    status:
                        state.selectedStatus
                }
            }
        );

        closeModal(elements.statusRoomModal);

        showToast(
            "success",
            "Status updated",
            "Room status updated successfully."
        );

        state.selectedRoomId = null;
        state.selectedStatus = null;

        await Promise.all([
            loadSummary(),
            loadRooms(false)
        ]);
    } catch (error) {
        showToast(
            "error",
            "Update failed",
            error.message
        );
    } finally {
        hideLoader();
    }
}

/* =========================
   Table Actions
========================= */

function handleTableAction(event) {
    const button =
        event.target.closest(
            "[data-action]"
        );

    if (!button || button.disabled) {
        return;
    }

    const action =
        button.dataset.action;

    const roomId =
        button.dataset.id;

    if (action === "view") {
        openViewRoomModal(roomId);
    }

    if (action === "edit") {
        openEditRoomModal(roomId);
    }

    if (action === "delete") {
        openDeleteRoomModal(roomId);
    }

    if (action === "status") {
        openStatusRoomModal(
            roomId,
            button.dataset.status,
            button.dataset.roomName
        );
    }
}

/* =========================
   Sidebar
========================= */

function openSidebar() {
    elements.sidebar.classList.add("show");
    elements.sidebarOverlay.classList.add("show");
}

function closeSidebar() {
    elements.sidebar.classList.remove("show");
    elements.sidebarOverlay.classList.remove("show");
}

/* =========================
   Events
========================= */

function addEventListeners() {
    elements.openCreateRoomBtn.addEventListener(
        "click",
        openCreateRoomModal
    );

    elements.closeRoomFormModalBtn.addEventListener(
        "click",
        () => closeModal(
            elements.roomFormModal
        )
    );

    elements.cancelRoomFormBtn.addEventListener(
        "click",
        () => closeModal(
            elements.roomFormModal
        )
    );

    elements.closeViewRoomModalBtn.addEventListener(
        "click",
        () => closeModal(
            elements.viewRoomModal
        )
    );

    elements.cancelDeleteRoomBtn.addEventListener(
        "click",
        () => {
            state.selectedRoomId = null;

            closeModal(
                elements.deleteRoomModal
            );
        }
    );

    elements.confirmDeleteRoomBtn.addEventListener(
        "click",
        confirmDeleteRoom
    );

    elements.cancelStatusRoomBtn.addEventListener(
        "click",
        () => {
            state.selectedRoomId = null;
            state.selectedStatus = null;

            closeModal(
                elements.statusRoomModal
            );
        }
    );

    elements.confirmStatusRoomBtn.addEventListener(
        "click",
        confirmStatusChange
    );

    elements.roomForm.addEventListener(
        "submit",
        handleRoomFormSubmit
    );

    elements.roomsTableBody.addEventListener(
        "click",
        handleTableAction
    );

    elements.refreshRoomsBtn.addEventListener(
        "click",
        async () => {
            await Promise.all([
                loadSummary(),
                loadRooms()
            ]);
        }
    );

    elements.roomSearchInput.addEventListener(
        "input",
        event => {
            clearTimeout(
                state.searchTimer
            );

            state.searchTimer =
                setTimeout(() => {
                    state.search =
                        event.target.value.trim();

                    state.currentPage = 1;

                    loadRooms();
                }, 500);
        }
    );

    elements.gameTypeFilter.addEventListener(
        "change",
        event => {
            state.gameType =
                event.target.value;

            state.currentPage = 1;

            loadRooms();
        }
    );

    elements.roomStatusFilter.addEventListener(
        "change",
        event => {
            state.status =
                event.target.value;

            state.currentPage = 1;

            loadRooms();
        }
    );

    elements.previousPageBtn.addEventListener(
        "click",
        () => {
            if (state.currentPage > 1) {
                state.currentPage -= 1;
                loadRooms();
            }
        }
    );

    elements.nextPageBtn.addEventListener(
        "click",
        () => {
            if (
                state.currentPage <
                state.totalPages
            ) {
                state.currentPage += 1;
                loadRooms();
            }
        }
    );

    elements.sidebarOpenBtn.addEventListener(
        "click",
        openSidebar
    );

    elements.sidebarCloseBtn.addEventListener(
        "click",
        closeSidebar
    );

    elements.sidebarOverlay.addEventListener(
        "click",
        closeSidebar
    );

    elements.logoutBtn.addEventListener(
        "click",
        logout
    );

    document.querySelectorAll(".modal").forEach(
        modal => {
            modal.addEventListener(
                "click",
                event => {
                    if (event.target === modal) {
                        closeModal(modal);
                    }
                }
            );
        }
    );

    document.addEventListener(
        "keydown",
        event => {
            if (event.key === "Escape") {
                document
                    .querySelectorAll(".modal.show")
                    .forEach(closeModal);

                closeSidebar();
            }
        }
    );
}

/* =========================
   Initialize
========================= */

async function initializePage() {
    const isAuthenticated =
        checkAuthentication();

    if (!isAuthenticated) {
        return;
    }

    addEventListeners();

    showLoader();

    try {
        await Promise.all([
            loadSummary(),
            loadRooms(false)
        ]);
    } finally {
        hideLoader();
    }
}

document.addEventListener(
    "DOMContentLoaded",
    initializePage
);