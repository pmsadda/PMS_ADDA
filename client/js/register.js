document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  const registerForm = document.getElementById("registerForm");

  const fullNameInput = document.getElementById("fullName");

  const usernameInput = document.getElementById("username");

  const referralCodeInput = document.getElementById("referralCode");

  const referralHint = document.getElementById("referralHint");

  const phoneInput = document.getElementById("phone");

  const emailInput = document.getElementById("email");

  const passwordInput = document.getElementById("password");

  const confirmPasswordInput = document.getElementById("confirmPassword");

  const agreeTerms = document.getElementById("agreeTerms");

  const registerBtn = document.getElementById("registerBtn");

  const togglePassword = document.getElementById("togglePassword");

  const toggleConfirmPassword = document.getElementById(
    "toggleConfirmPassword",
  );

  const choosePhoto = document.getElementById("choosePhoto");

  const profileImage = document.getElementById("profileImage");

  const profilePreview = document.getElementById("profilePreview");

  const strengthBar = document.getElementById("strengthBar");

  const strengthText = document.getElementById("strengthText");

  const loaderOverlay = document.getElementById("loaderOverlay");

  const toast = document.getElementById("toast");

  const toastMessage = document.getElementById("toastMessage");

  const errorBox = document.getElementById("errorBox");

  const API_BASE_URL = APP_CONFIG.API_URL;

  let toastTimer;

  function normalizeReferralCode(value) {
    return String(value || "")
      .trim()
      .toUpperCase();
  }

  function initializeReferralCode() {
    if (!referralCodeInput) {
      return;
    }

    const params = new URLSearchParams(window.location.search);

    const referralFromUrl = normalizeReferralCode(params.get("ref"));

    if (!referralFromUrl) {
      return;
    }

    referralCodeInput.value = referralFromUrl;

    if (referralHint) {
      referralHint.textContent =
        "Referral link detected. প্রথম deposit approve হলে referral bonus পাবেন।";
    }
  }

  referralCodeInput?.addEventListener("input", () => {
    referralCodeInput.value = normalizeReferralCode(referralCodeInput.value);
  });

  initializeReferralCode();

  function showLoader() {
    if (loaderOverlay) {
      loaderOverlay.style.display = "flex";
    }

    if (registerBtn) {
      registerBtn.disabled = true;
    }
  }

  function hideLoader() {
    if (loaderOverlay) {
      loaderOverlay.style.display = "none";
    }

    if (registerBtn) {
      registerBtn.disabled = false;
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

  function showError(message) {
    if (!errorBox) {
      showToast(message);
      return;
    }

    errorBox.textContent = message;
    errorBox.style.display = "block";
  }

  function clearError() {
    if (!errorBox) {
      return;
    }

    errorBox.textContent = "";
    errorBox.style.display = "none";
  }

  function togglePasswordField(input, button) {
    const showPassword = input.type === "password";

    input.type = showPassword ? "text" : "password";

    const icon = button.querySelector("i");

    if (icon) {
      icon.className = showPassword
        ? "fa-solid fa-eye-slash"
        : "fa-solid fa-eye";
    }
  }

  togglePassword?.addEventListener("click", () => {
    togglePasswordField(passwordInput, togglePassword);
  });

  toggleConfirmPassword?.addEventListener("click", () => {
    togglePasswordField(confirmPasswordInput, toggleConfirmPassword);
  });

  choosePhoto?.addEventListener("click", () => {
    profileImage?.click();
  });

  profileImage?.addEventListener("change", () => {
    const file = profileImage.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      showToast("শুধু image file নির্বাচন করুন।");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      showToast("ছবির size সর্বোচ্চ 2MB হতে পারবে।");
      return;
    }

    profilePreview.src = URL.createObjectURL(file);
  });

  function updatePasswordStrength() {
    const password = passwordInput.value;

    let score = 0;

    if (password.length >= 8) {
      score += 1;
    }

    if (/[A-Z]/.test(password)) {
      score += 1;
    }

    if (/[a-z]/.test(password)) {
      score += 1;
    }

    if (/\d/.test(password)) {
      score += 1;
    }

    if (/[^A-Za-z0-9]/.test(password)) {
      score += 1;
    }

    const levels = [
      {
        width: "0%",
        text: "Password Strength",
      },
      {
        width: "20%",
        text: "Very Weak",
      },
      {
        width: "40%",
        text: "Weak",
      },
      {
        width: "60%",
        text: "Medium",
      },
      {
        width: "80%",
        text: "Strong",
      },
      {
        width: "100%",
        text: "Very Strong",
      },
    ];

    if (strengthBar) {
      strengthBar.style.width = levels[score].width;
    }

    if (strengthText) {
      strengthText.textContent = levels[score].text;
    }
  }

  passwordInput?.addEventListener("input", updatePasswordStrength);

  registerForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    clearError();

    const fullName = fullNameInput.value.trim();

    const username = usernameInput.value.trim().toLowerCase();

    const phone = phoneInput.value.trim();

    const email = emailInput.value.trim().toLowerCase();

    const referralCode = normalizeReferralCode(referralCodeInput?.value);

    const password = passwordInput.value;

    const confirmPassword = confirmPasswordInput.value;

    if (fullName.length < 3) {
      showError("Full name কমপক্ষে ৩ অক্ষরের হতে হবে।");

      fullNameInput.focus();
      return;
    }

    if (!/^[a-z0-9_]{4,30}$/.test(username)) {
      showError(
        "Username ৪–৩০ অক্ষরের হতে হবে। শুধু ছোট হাতের ইংরেজি অক্ষর, সংখ্যা ও underscore ব্যবহার করুন।",
      );

      usernameInput.focus();
      return;
    }

    if (!/^01[3-9]\d{8}$/.test(phone)) {
      showError("সঠিক ১১ ডিজিটের বাংলাদেশি মোবাইল নম্বর দিন।");

      phoneInput.focus();
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showError("সঠিক Email Address দিন।");

      emailInput.focus();
      return;
    }

    if (password.length < 8) {
      showError("Password কমপক্ষে ৮ অক্ষরের হতে হবে।");

      passwordInput.focus();
      return;
    }

    if (password !== confirmPassword) {
      showError("Password এবং Confirm Password মিলছে না।");

      confirmPasswordInput.focus();
      return;
    }

    if (referralCode && !/^PMS[A-Z0-9]{6,17}$/.test(referralCode)) {
      showError("Referral code সঠিক নয়।");

      referralCodeInput?.focus();
      return;
    }

    if (!agreeTerms.checked) {
      showError("Terms & Conditions গ্রহণ করুন।");

      agreeTerms.focus();
      return;
    }

    showLoader();

    try {
      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          fullName,
          username,
          phone,
          email,
          password,
          referralCode,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Registration failed.");
      }

      const { token, user } = result.data;

      localStorage.setItem("access_token", token);

      localStorage.setItem("current_user", JSON.stringify(user));

      /*
       * কেবল সফল নতুন registration-এর পরে Meta event পাঠানো হবে।
       * Username, phone, email বা password Meta-তে পাঠানো হচ্ছে না।
       */
      if (typeof window.fbq === "function") {
        const registrationEventKey = `tpl22_meta_registration_${user.id || user.uid || username}`;

        if (!sessionStorage.getItem(registrationEventKey)) {
          window.fbq("track", "CompleteRegistration", {
            content_name: "TPL22 Registration",
            status: "completed",
          });

          sessionStorage.setItem(registrationEventKey, "1");
        }
      }

      showToast(
        user.referralApplied
          ? "Registration successful. Referral code applied."
          : "Registration successful.",
      );

      window.setTimeout(() => {
        window.location.href = "/lobby";
      }, 700);
    } catch (error) {
      console.error("Registration error:", error);

      showError(error.message || "Server-এর সঙ্গে সংযোগ করা যায়নি।");
    } finally {
      hideLoader();
    }
  });
});
