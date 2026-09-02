(function () {
  "use strict";

  const token =
    localStorage.getItem("access_token") ||
    localStorage.getItem("token") ||
    "";

  const userText =
    localStorage.getItem("current_user");

  let currentUser = null;

  try {
    currentUser = userText
      ? JSON.parse(userText)
      : null;
  } catch (error) {
    currentUser = null;
  }

  const currentPath =
    String(window.location.pathname || "/")
      .toLowerCase()
      .replace(/\/+$/, "") || "/";

  const isAdminPage =
    currentPath.includes("/client/admin/") ||
    currentPath.startsWith("/admin/");

  const isAgentPage =
    currentPath.includes("/client/agent/") ||
    currentPath.startsWith("/agent/");

  const isPublicPage =
    currentPath === "/" ||
    currentPath === "/lobby" ||
    currentPath === "/login" ||
    currentPath === "/register" ||
    currentPath.endsWith("/login.html") ||
    currentPath.endsWith("/register.html") ||
    currentPath.endsWith("/lobby.html");


  function goToLogin() {
    window.location.replace("/login");
  }


  function goToLobby() {
    window.location.replace("/lobby");
  }


  function goToAdminDashboard() {
    window.location.replace(
      "/client/admin/dashboard.html"
    );
  }


  function goToAgentDashboard() {
    window.location.replace(
      "/client/agent/dashboard.html"
    );
  }


  function getRole() {
    return String(
      currentUser?.role || ""
    )
      .trim()
      .toLowerCase();
  }


  function goToRoleHome() {
    const role = getRole();

    if (role === "admin") {
      goToAdminDashboard();
      return;
    }

    if (role === "agent") {
      goToAgentDashboard();
      return;
    }

    goToLobby();
  }


  /* =========================================================
     PUBLIC PAGES
  ========================================================= */

  if (isPublicPage) {
    return;
  }


  /* =========================================================
     LOGIN REQUIRED
  ========================================================= */

  if (!token || !currentUser) {
    goToLogin();
    return;
  }


  const role = getRole();


  /* =========================================================
     ADMIN PAGE
  ========================================================= */

  if (isAdminPage) {
    if (role !== "admin") {
      goToRoleHome();
    }

    return;
  }


  /* =========================================================
     AGENT PAGE
  ========================================================= */

  if (isAgentPage) {
    if (role !== "agent") {
      goToRoleHome();
    }

    return;
  }


  /* =========================================================
     NORMAL USER PAGE
  ========================================================= */

  if (role === "admin") {
    goToAdminDashboard();
    return;
  }

  if (role === "agent") {
    goToAgentDashboard();
  }
})();