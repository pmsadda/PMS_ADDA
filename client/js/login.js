document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  const elements = {
    loginForm: document.getElementById("loginForm"),

    identityInput: document.getElementById("identity"),

    passwordInput: document.getElementById("password"),

    loginButton: document.getElementById("loginButton"),

    togglePassword: document.getElementById("togglePassword"),

    loaderOverlay: document.getElementById("loaderOverlay"),

    toast: document.getElementById("toast"),

    toastMessage: document.getElementById("toastMessage"),

    forgotLink: document.getElementById("forgotPasswordLink"),

    forgotModal: document.getElementById("forgotPasswordModal"),

    closeForgotModal: document.getElementById("closePasswordReset"),

    requestStep: document.getElementById("forgotRequestStep"),

    otpStep: document.getElementById("forgotOtpStep"),

    resetStep: document.getElementById("forgotResetStep"),

    requestForm: document.getElementById("forgotRequestForm"),

    emailInput: document.getElementById("forgotEmail"),

    requestButton: document.getElementById("forgotRequestButton"),

    otpForm: document.getElementById("forgotOtpForm"),

    otpInput: document.getElementById("forgotOtp"),

    verifyButton: document.getElementById("forgotVerifyButton"),

    maskedEmail: document.getElementById("forgotMaskedEmail"),

    otpTimer: document.getElementById("forgotOtpTimer"),

    resendButton: document.getElementById("forgotResendButton"),

    resetForm: document.getElementById("forgotResetForm"),

    newPassword: document.getElementById("forgotNewPassword"),

    confirmPassword: document.getElementById("forgotConfirmPassword"),

    resetButton: document.getElementById("forgotResetButton"),
  };

  const API_BASE_URL = APP_CONFIG.API_URL;

  const state = {
    email: "",
    requestId: "",
    resetToken: "",

    otpExpiresAt: 0,
    resendAvailableAt: 0,

    isResending: false,
  };

  let toastTimer = null;
  let otpTimerInterval = null;

  function normalizeEmail(value) {
    return String(value || "")
      .trim()
      .toLowerCase();
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function showLoader() {
    if (elements.loaderOverlay) {
      elements.loaderOverlay.style.display = "flex";
    }

    if (elements.loginButton) {
      elements.loginButton.disabled = true;
    }
  }

  function hideLoader() {
    if (elements.loaderOverlay) {
      elements.loaderOverlay.style.display = "none";
    }

    if (elements.loginButton) {
      elements.loginButton.disabled = false;
    }
  }

  function showToast(message) {
    if (!elements.toast || !elements.toastMessage) {
      alert(message);
      return;
    }

    window.clearTimeout(toastTimer);

    elements.toastMessage.textContent = message;

    elements.toast.style.display = "block";

    toastTimer = window.setTimeout(() => {
      elements.toast.style.display = "none";
    }, 3200);
  }

  function setButtonLoading(button, isLoading, loadingText) {
    if (!button) {
      return;
    }

    if (!button.dataset.defaultText) {
      button.dataset.defaultText = button.textContent.trim();
    }

    button.disabled = Boolean(isLoading);

    button.textContent = isLoading ? loadingText : button.dataset.defaultText;
  }

  async function requestApi(path, body) {
    let response;

    try {
      response = await fetch(`${API_BASE_URL}${path}`, {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify(body),
      });
    } catch {
      throw new Error("Server-এর সঙ্গে সংযোগ করা যায়নি।");
    }

    let result;

    try {
      result = await response.json();
    } catch {
      throw new Error("Server থেকে সঠিক response পাওয়া যায়নি।");
    }

    if (!response.ok || !result.success) {
      const error = new Error(result.message || "Request failed.");

      error.statusCode = response.status;

      error.data = result.data || null;

      throw error;
    }

    return result;
  }

  function clearOtpTimer() {
    if (otpTimerInterval) {
      window.clearInterval(otpTimerInterval);

      otpTimerInterval = null;
    }
  }

  function formatTime(seconds) {
    const safeSeconds = Math.max(Number(seconds) || 0, 0);

    const minutes = Math.floor(safeSeconds / 60);

    const remainingSeconds = safeSeconds % 60;

    return `${String(minutes).padStart(2, "0")}:${String(
      remainingSeconds,
    ).padStart(2, "0")}`;
  }

  function updateOtpTimer() {
    const now = Date.now();

    const expirySeconds = Math.max(
      Math.ceil((state.otpExpiresAt - now) / 1000),
      0,
    );

    const resendSeconds = Math.max(
      Math.ceil((state.resendAvailableAt - now) / 1000),
      0,
    );

    if (elements.otpTimer) {
      elements.otpTimer.textContent =
        expirySeconds > 0
          ? `OTP expires in ${formatTime(expirySeconds)}`
          : "OTP expired. নতুন OTP নিন।";
    }

    if (elements.resendButton) {
      elements.resendButton.disabled = state.isResending || resendSeconds > 0;

      elements.resendButton.textContent =
        resendSeconds > 0 ? `Resend in ${resendSeconds}s` : "Resend OTP";
    }

    if (expirySeconds === 0 && resendSeconds === 0) {
      clearOtpTimer();
    }
  }

  function startOtpTimer({ expiresInSeconds, resendAfterSeconds }) {
    clearOtpTimer();

    const now = Date.now();

    state.otpExpiresAt = now + Number(expiresInSeconds || 600) * 1000;

    state.resendAvailableAt = now + Number(resendAfterSeconds || 60) * 1000;

    updateOtpTimer();

    otpTimerInterval = window.setInterval(updateOtpTimer, 1000);
  }

  function showResetStep(activeStep) {
    const steps = [elements.requestStep, elements.otpStep, elements.resetStep];

    steps.forEach((step) => {
      if (!step) {
        return;
      }

      const isActive = step === activeStep;

      step.hidden = !isActive;

      step.classList.toggle("is-active", isActive);
    });
  }

  function resetForgotState() {
    clearOtpTimer();

    state.email = "";
    state.requestId = "";
    state.resetToken = "";
    state.otpExpiresAt = 0;
    state.resendAvailableAt = 0;
    state.isResending = false;

    elements.requestForm?.reset();
    elements.otpForm?.reset();
    elements.resetForm?.reset();

    if (elements.maskedEmail) {
      elements.maskedEmail.textContent = "your registered email";
    }

    showResetStep(elements.requestStep);
  }

  function openForgotModal() {
    if (!elements.forgotModal) {
      return;
    }

    resetForgotState();

    const loginIdentity = normalizeEmail(elements.identityInput?.value);

    if (isValidEmail(loginIdentity) && elements.emailInput) {
      elements.emailInput.value = loginIdentity;
    }

    elements.forgotModal.hidden = false;

    elements.forgotModal.setAttribute("aria-hidden", "false");

    document.body.classList.add("password-reset-open");

    window.setTimeout(() => {
      elements.emailInput?.focus();
    }, 50);
  }

  function closeForgotModal() {
    if (!elements.forgotModal) {
      return;
    }

    elements.forgotModal.hidden = true;

    elements.forgotModal.setAttribute("aria-hidden", "true");

    document.body.classList.remove("password-reset-open");

    resetForgotState();

    elements.forgotLink?.focus();
  }

  if (elements.togglePassword && elements.passwordInput) {
    elements.togglePassword.addEventListener("click", () => {
      const isPassword = elements.passwordInput.type === "password";

      elements.passwordInput.type = isPassword ? "text" : "password";

      const icon = elements.togglePassword.querySelector("i");

      if (icon) {
        icon.className = isPassword
          ? "fa-solid fa-eye-slash"
          : "fa-solid fa-eye";
      }
    });
  }

  elements.forgotLink?.addEventListener("click", (event) => {
    event.preventDefault();

    openForgotModal();
  });

  elements.closeForgotModal?.addEventListener("click", closeForgotModal);

  elements.forgotModal
    ?.querySelectorAll("[data-close-password-reset]")
    .forEach((button) => {
      button.addEventListener("click", closeForgotModal);
    });

  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      elements.forgotModal &&
      !elements.forgotModal.hidden
    ) {
      closeForgotModal();
    }
  });

  elements.otpInput?.addEventListener("input", () => {
    elements.otpInput.value = elements.otpInput.value
      .replace(/\D/g, "")
      .slice(0, 6);
  });

  elements.requestForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = normalizeEmail(elements.emailInput?.value);

    if (!isValidEmail(email)) {
      showToast("সঠিক registered email দিন।");

      elements.emailInput?.focus();

      return;
    }

    setButtonLoading(elements.requestButton, true, "SENDING...");

    try {
      const result = await requestApi("/auth/forgot-password/request", {
        email,
      });

      const data = result.data || {};

      if (!data.requestId) {
        throw new Error("Password reset request ID পাওয়া যায়নি।");
      }

      state.email = email;

      state.requestId = data.requestId;

      state.resetToken = "";

      if (elements.maskedEmail) {
        elements.maskedEmail.textContent = data.maskedEmail || email;
      }

      elements.otpInput.value = "";

      showResetStep(elements.otpStep);

      startOtpTimer({
        expiresInSeconds: data.expiresInSeconds,

        resendAfterSeconds: data.resendAfterSeconds,
      });

      showToast(result.message || "OTP পাঠানো হয়েছে।");

      window.setTimeout(() => {
        elements.otpInput?.focus();
      }, 50);
    } catch (error) {
      console.error("Forgot password request error:", error);

      showToast(error.message || "OTP পাঠানো যায়নি।");
    } finally {
      setButtonLoading(elements.requestButton, false, "SENDING...");
    }
  });

  elements.resendButton?.addEventListener("click", async () => {
    if (state.isResending || !state.email) {
      return;
    }

    state.isResending = true;

    updateOtpTimer();

    try {
      const result = await requestApi("/auth/forgot-password/request", {
        email: state.email,
      });

      const data = result.data || {};

      if (!data.requestId) {
        throw new Error("নতুন OTP request ID পাওয়া যায়নি।");
      }

      state.requestId = data.requestId;

      state.resetToken = "";

      elements.otpInput.value = "";

      if (elements.maskedEmail) {
        elements.maskedEmail.textContent = data.maskedEmail || state.email;
      }

      startOtpTimer({
        expiresInSeconds: data.expiresInSeconds,

        resendAfterSeconds: data.resendAfterSeconds,
      });

      showToast("নতুন OTP পাঠানো হয়েছে।");

      elements.otpInput?.focus();
    } catch (error) {
      console.error("OTP resend error:", error);

      showToast(error.message || "OTP resend করা যায়নি।");
    } finally {
      state.isResending = false;

      updateOtpTimer();
    }
  });

  elements.otpForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const otp = String(elements.otpInput?.value || "").trim();

    if (!state.requestId) {
      showToast("আগে OTP request করুন।");

      showResetStep(elements.requestStep);

      return;
    }

    if (!/^\d{6}$/.test(otp)) {
      showToast("৬ সংখ্যার OTP দিন।");

      elements.otpInput?.focus();

      return;
    }

    setButtonLoading(elements.verifyButton, true, "VERIFYING...");

    try {
      const result = await requestApi("/auth/forgot-password/verify", {
        requestId: state.requestId,

        otp,
      });

      const data = result.data || {};

      if (!data.resetToken) {
        throw new Error("Password reset token পাওয়া যায়নি।");
      }

      state.resetToken = data.resetToken;

      clearOtpTimer();

      showResetStep(elements.resetStep);

      showToast("OTP verified successfully.");

      window.setTimeout(() => {
        elements.newPassword?.focus();
      }, 50);
    } catch (error) {
      console.error("OTP verification error:", error);

      showToast(error.message || "OTP verify করা যায়নি।");
    } finally {
      setButtonLoading(elements.verifyButton, false, "VERIFYING...");
    }
  });

  elements.resetForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const newPassword = String(elements.newPassword?.value || "");

    const confirmPassword = String(elements.confirmPassword?.value || "");

    if (newPassword.length < 8) {
      showToast("Password কমপক্ষে ৮ অক্ষরের দিন।");

      elements.newPassword?.focus();

      return;
    }

    if (newPassword.length > 72) {
      showToast("Password সর্বোচ্চ ৭২ অক্ষরের হতে পারবে।");

      elements.newPassword?.focus();

      return;
    }

    if (newPassword !== confirmPassword) {
      showToast("Password দুটি মিলছে না।");

      elements.confirmPassword?.focus();

      return;
    }

    if (!state.requestId || !state.resetToken) {
      showToast("Password reset session পাওয়া যায়নি। নতুন OTP নিন।");

      showResetStep(elements.requestStep);

      return;
    }

    setButtonLoading(elements.resetButton, true, "RESETTING...");

    try {
      const result = await requestApi("/auth/forgot-password/reset", {
        requestId: state.requestId,

        resetToken: state.resetToken,

        newPassword,

        confirmPassword,
      });

      const resetEmail = state.email;

      closeForgotModal();

      if (elements.identityInput) {
        elements.identityInput.value =
          resetEmail || elements.identityInput.value;
      }

      if (elements.passwordInput) {
        elements.passwordInput.value = "";

        elements.passwordInput.focus();
      }

      showToast(result.message || "Password reset successful.");
    } catch (error) {
      console.error("Password reset error:", error);

      showToast(error.message || "Password reset করা যায়নি।");
    } finally {
      setButtonLoading(elements.resetButton, false, "RESETTING...");
    }
  });

  if (!elements.loginForm) {
    console.error("loginForm পাওয়া যায়নি।");

    return;
  }

  elements.loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const identity = elements.identityInput
      ? elements.identityInput.value.trim()
      : "";

    const password = elements.passwordInput ? elements.passwordInput.value : "";

    if (!identity) {
      showToast("Username, phone অথবা email দিন।");

      elements.identityInput?.focus();

      return;
    }

    if (!password) {
      showToast("Password দিন.");

      elements.passwordInput?.focus();

      return;
    }

    showLoader();

    try {
      const result = await requestApi("/auth/login", {
        identity,
        password,
      });

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

      localStorage.setItem("access_token", token);

      localStorage.setItem("current_user", JSON.stringify(user));

      localStorage.setItem("user_id", String(user.id));

      showToast("Login successful.");

      window.setTimeout(() => {
        if (redirectTo) {
          window.location.href = redirectTo;
          return;
        }

        const userRole = String(user.role || "")
          .trim()
          .toLowerCase();

        if (userRole === "admin") {
          window.location.href = "/client/admin/dashboard.html";
        } else if (userRole === "agent") {
          window.location.href = "/client/agent/dashboard.html";
        } else {
          window.location.href = "/lobby";
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
