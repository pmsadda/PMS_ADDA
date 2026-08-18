"use strict";

(() => {
  const DOM = {
    form:
      document.getElementById(
        "agentLoginForm"
      ),

    identity:
      document.getElementById(
        "agentIdentity"
      ),

    password:
      document.getElementById(
        "agentLoginPassword"
      ),

    togglePasswordBtn:
      document.getElementById(
        "toggleLoginPasswordBtn"
      ),

    loginButton:
      document.getElementById(
        "agentLoginBtn"
      ),

    loginError:
      document.getElementById(
        "loginError"
      ),

    loading:
      document.getElementById(
        "loginLoading"
      )
  };

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

  function showLoading(visible) {
    DOM.loading
      .classList
      .toggle(
        "is-hidden",
        !visible
      );
  }

  function showError(message) {
    DOM.loginError
      .textContent =
      message;

    DOM.loginError
      .classList
      .remove(
        "is-hidden"
      );
  }

  function hideError() {
    DOM.loginError
      .classList
      .add(
        "is-hidden"
      );
  }

  async function requestApi(
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

    if (!response.ok) {
      throw new Error(
        result?.message ||
        "Sign in failed."
      );
    }

    return result;
  }

  async function invalidateToken(
    token
  ) {
    if (!token) {
      return;
    }

    try {
      await requestApi(
        "/auth/logout",
        {
          method: "POST",

          headers: {
            Authorization:
              `Bearer ${token}`
          }
        }
      );
    } catch (_error) {
      // Local session is cleared below.
    }
  }

  async function login(event) {
    event.preventDefault();

    hideError();
    clearSession();

    const identity =
      String(
        DOM.identity.value ||
        ""
      )
        .trim()
        .toLowerCase();

    const password =
      String(
        DOM.password.value ||
        ""
      );

    if (
      !identity ||
      !password
    ) {
      showError(
        "Enter your assigned credentials."
      );

      return;
    }

    const originalContent =
      DOM.loginButton
        .innerHTML;

    DOM.loginButton
      .disabled =
      true;

    DOM.loginButton
      .textContent =
      "Signing in...";

    showLoading(true);

    try {
      const result =
        await requestApi(
          "/auth/login",
          {
            method: "POST",

            body:
              JSON.stringify({
                identity,
                password
              })
          }
        );

      const data =
        result?.data ||
        {};

      const token =
        data.token;

      const user =
        data.user;

      const role =
        String(
          user?.role || ""
        )
          .trim()
          .toLowerCase();

      if (
        !token ||
        !user
      ) {
        throw new Error(
          "Authentication response is invalid."
        );
      }

      if (
        role !==
        "agent"
      ) {
        await invalidateToken(
          token
        );

        clearSession();

        throw new Error(
          "This account is not authorized for Finance Operations."
        );
      }

      localStorage.setItem(
        "access_token",
        token
      );

      localStorage.setItem(
        "current_user",
        JSON.stringify(user)
      );

      localStorage.setItem(
        "user_id",
        String(user.id)
      );

      window.location.replace(
        "./dashboard.html"
      );
    } catch (error) {
      clearSession();

      showError(
        error.message ||
        "Unable to sign in."
      );
    } finally {
      showLoading(false);

      DOM.loginButton
        .disabled =
        false;

      DOM.loginButton
        .innerHTML =
        originalContent;
    }
  }

  function togglePassword() {
    const showing =
      DOM.password.type ===
      "text";

    DOM.password.type =
      showing
        ? "password"
        : "text";

    DOM.togglePasswordBtn
      .innerHTML =
      showing
        ? '<i class="fa-solid fa-eye"></i>'
        : '<i class="fa-solid fa-eye-slash"></i>';
  }

  async function checkExistingAgentSession() {
    const token =
      localStorage.getItem(
        "access_token"
      );

    if (!token) {
      return;
    }

    try {
      const result =
        await requestApi(
          "/auth/me",
          {
            method: "GET",

            headers: {
              Authorization:
                `Bearer ${token}`
            }
          }
        );

      const user =
        result?.data
          ?.user ||
        result?.data ||
        null;

      if (
        String(
          user?.role || ""
        ).toLowerCase() ===
        "agent"
      ) {
        window.location.replace(
          "./dashboard.html"
        );

        return;
      }
    } catch (_error) {
      // Invalid session is cleared below.
    }

    clearSession();
  }

  document
    .addEventListener(
      "DOMContentLoaded",
           () => {
        DOM.form
          .addEventListener(
            "submit",
            login
          );

        DOM.togglePasswordBtn
          .addEventListener(
            "click",
            togglePassword
          );

        /*
         * Separate Agent browser/session ধরে নেওয়া হয়েছে।
         * Page load-এ পুরোনো main-site session রাখা হবে না।
         */
        checkExistingAgentSession();
      }
    );
})();