document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  const loginForm = document.getElementById("loginForm");

  const identityInput = document.getElementById("identity");

  const passwordInput = document.getElementById("password");

  const loginButton = document.getElementById("loginButton");

  const togglePassword = document.getElementById("togglePassword");

  const loaderOverlay = document.getElementById("loaderOverlay");

  const toast = document.getElementById("toast");

  const toastMessage = document.getElementById("toastMessage");

  const API_BASE_URL = APP_CONFIG.API_URL;

  let toastTimer;

  function showLoader() {
    if (loaderOverlay) {
      loaderOverlay.style.display = "flex";
    }

    if (loginButton) {
      loginButton.disabled = true;
    }
  }

  function hideLoader() {
    if (loaderOverlay) {
      loaderOverlay.style.display = "none";
    }

    if (loginButton) {
      loginButton.disabled = false;
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
    }, 2600);
  }

  if (togglePassword && passwordInput) {
    togglePassword.addEventListener("click", () => {
      const isPassword = passwordInput.type === "password";

      passwordInput.type = isPassword ? "text" : "password";

      const icon = togglePassword.querySelector("i");

      if (icon) {
        icon.className = isPassword
          ? "fa-solid fa-eye-slash"
          : "fa-solid fa-eye";
      }
    });
  }

  if (!loginForm) {
    console.error("loginForm পাওয়া যায়নি।");

    return;
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const identity = identityInput ? identityInput.value.trim() : "";

    const password = passwordInput ? passwordInput.value : "";

    if (!identity) {
      showToast("Username, phone অথবা email দিন।");

      identityInput?.focus();

      return;
    }

    if (!password) {
      showToast("Password দিন.");

      passwordInput?.focus();

      return;
    }

    showLoader();

    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          identity,
          password,
        }),
      });

      let result;

      try {
        result = await response.json();
      } catch {
        throw new Error("Server থেকে সঠিক response পাওয়া যায়নি।");
      }

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Login failed.");
      }

      const loginData = result.data || {};

      const token = loginData.token;

      const user = loginData.user;

      const redirectTo = loginData.redirectTo;

      if (!token) {
        throw new Error("Login token পাওয়া যায়নি।");
      }

      if (!user) {
        throw new Error("User information পাওয়া যায়নি।");
      }

      console.log(result);

      localStorage.setItem("access_token", token);

      localStorage.setItem("current_user", JSON.stringify(user));

      localStorage.setItem("user_id", String(user.id));

      showToast("Login successful.");

      window.setTimeout(() => {
        if (redirectTo) {
          window.location.href = `..${redirectTo}`;

          return;
        }

        if (String(user.role).toLowerCase() === "admin") {
          window.location.href = "../admin/dashboard.html";
        } else {
          window.location.href = "./lobby.html";
        }
      }, 700);
    } catch (error) {
      console.error("Login error:", error);

      showToast(error.message || "Server-এর সঙ্গে সংযোগ করা যায়নি।");
    } finally {
      hideLoader();
    }
  });
});
