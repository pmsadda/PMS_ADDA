(function () {
    "use strict";

    const token =
        localStorage.getItem("access_token");

    const userText =
        localStorage.getItem("current_user");

    let currentUser = null;

    try {
        currentUser =
            userText
                ? JSON.parse(userText)
                : null;
    } catch (error) {
        currentUser = null;
    }

    const currentPath =
        window.location.pathname.toLowerCase();

    const isAdminPage =
        currentPath.includes("/admin/");

    const isLoginPage =
        currentPath.endsWith("/login.html");

    const isRegisterPage =
        currentPath.endsWith("/register.html");

    function goToLogin() {
        if (isAdminPage) {
            window.location.replace(
                "../pages/login.html"
            );
        } else {
            window.location.replace(
                "login.html"
            );
        }
    }

    function goToLobby() {
        if (isAdminPage) {
            window.location.replace(
                "../pages/lobby.html"
            );
        } else {
            window.location.replace(
                "lobby.html"
            );
        }
    }

    function goToAdminDashboard() {
        window.location.replace(
            "../admin/dashboard.html"
        );
    }

    /* Login/Register page guard */

    if (
        isLoginPage ||
        isRegisterPage
    ) {
        if (token && currentUser) {
            if (currentUser.role === "admin") {
                goToAdminDashboard();
            } else {
                goToLobby();
            }
        }

        return;
    }

    /* Protected page guard */

    if (!token || !currentUser) {
        goToLogin();
        return;
    }

    /* Admin page guard */

    if (
        isAdminPage &&
        currentUser.role !== "admin"
    ) {
        goToLobby();
        return;
    }

    /* User page guard */

    if (
        !isAdminPage &&
        currentUser.role === "admin"
    ) {
        goToAdminDashboard();
    }
})();