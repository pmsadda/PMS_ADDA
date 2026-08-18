"use strict";

(() => {
  document.documentElement
    .style.visibility =
    "hidden";

 const LOGIN_URL =
    "./login.html";
  const token =
    localStorage.getItem(
      "access_token"
    );

  function clearSession() {
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
  }

  function showPage() {
    document.documentElement
      .style.visibility =
      "visible";
  }

  function goToLogin() {
    clearSession();

    window.location.replace(
      LOGIN_URL
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

  async function verifyAgent() {
    if (!token) {
      goToLogin();
      return;
    }

    try {
      const response =
        await fetch(
          getApiUrl(
            "/auth/me"
          ),
          {
            method: "GET",

            headers: {
              Accept:
                "application/json",

              Authorization:
                `Bearer ${token}`
            },

            cache:
              "no-store"
          }
        );

      const result =
        await response.json();

      if (
        !response.ok ||
        !result.success
      ) {
        throw new Error(
          result.message ||
          "Authentication failed."
        );
      }

      const user =
        result.data
          ?.user ||
        result.data ||
        null;

      const role =
        String(
          user?.role || ""
        )
          .trim()
          .toLowerCase();

           if (
        role !==
        "agent"
      ) {
        goToLogin();
        return;
      }

      localStorage.setItem(
        "current_user",
        JSON.stringify(user)
      );

      if (user?.id) {
        localStorage.setItem(
          "user_id",
          String(user.id)
        );
      }

      window.AGENT_CURRENT_USER =
        user;

      showPage();

      window.dispatchEvent(
        new CustomEvent(
          "agent-auth-ready",
          {
            detail: {
              user
            }
          }
        )
      );
    } catch (error) {
      console.error(
        "Agent authentication error:",
        error
      );

      goToLogin();
    }
  }

  verifyAgent();
})();