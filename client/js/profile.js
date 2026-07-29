"use strict";

document.addEventListener("DOMContentLoaded", () => {
  /* =========================================================
     CONFIGURATION
  ========================================================= */

  const token =
    localStorage.getItem("access_token") || localStorage.getItem("token") || "";

  const STATE = {
    user: null,
    loading: false,
    avatarUploading: false,
    avatarPreviewUrl: null,
    toastTimer: null,
  };

  /* =========================================================
     DOM
  ========================================================= */

  const DOM = {
    backButton: document.getElementById("profileBackButton"),

    refreshButton: document.getElementById("profileRefreshButton"),

    avatar: document.getElementById("profileAvatar"),

    avatarEditor: document.querySelector(".profile-avatar-editor"),

    avatarButton: document.getElementById("profileAvatarButton"),

    avatarInput: document.getElementById("profileAvatarInput"),

    avatarProgress: document.getElementById("profileAvatarProgress"),

    name: document.getElementById("profileName"),

    uid: document.getElementById("profileUid"),

    status: document.getElementById("profileStatus"),

    walletBalance: document.getElementById("profileWalletBalance"),

    username: document.getElementById("profileUsername"),

    phone: document.getElementById("profilePhone"),

    email: document.getElementById("profileEmail"),

    role: document.getElementById("profileRole"),

    walletAction: document.getElementById("profileWalletButton"),

    historyAction: document.getElementById("profileHistoryButton"),

    supportAction: document.getElementById("profileSupportButton"),

    logoutAction: document.getElementById("profileLogoutButton"),

    homeNav: document.getElementById("profileHomeNav"),

    walletNav: document.getElementById("profileWalletNav"),

    gamesNav: document.getElementById("profileGamesNav"),

    supportNav: document.getElementById("profileSupportNav"),

    logoutModal: document.getElementById("profileLogoutModal"),

    cancelLogout: document.getElementById("profileCancelLogout"),

    confirmLogout: document.getElementById("profileConfirmLogout"),

    loader: document.getElementById("profileLoader"),

    toast: document.getElementById("profileToast"),
  };

  /* =========================================================
     HELPERS
  ========================================================= */

  function formatMoney(value) {
    const amount = Number(value);

    return `৳${(Number.isFinite(amount) ? amount : 0).toLocaleString("en-BD", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  function normalizeString(value) {
    return String(value || "")
      .trim()
      .toLowerCase();
  }

  function navigateTo(path) {
    window.location.href = path;
  }

  function clearAuthentication() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("token");
    localStorage.removeItem("current_user");
  }

  function redirectToLogin() {
    clearAuthentication();
    window.location.replace("./login.html");
  }

  function showLoader() {
    STATE.loading = true;

    if (DOM.loader) {
      DOM.loader.style.display = "grid";
    }

    if (DOM.refreshButton) {
      DOM.refreshButton.disabled = true;
    }
  }

  function hideLoader() {
    STATE.loading = false;

    if (DOM.loader) {
      DOM.loader.style.display = "none";
    }

    if (DOM.refreshButton) {
      DOM.refreshButton.disabled = false;
    }
  }

  function showToast(message, type = "info") {
    if (!DOM.toast) {
      console.log(message);
      return;
    }

    window.clearTimeout(STATE.toastTimer);

    DOM.toast.textContent = String(message);
    DOM.toast.dataset.type = type;
    DOM.toast.style.display = "block";

    STATE.toastTimer = window.setTimeout(() => {
      DOM.toast.style.display = "none";
    }, 2600);
  }

  function openLogoutModal() {
    DOM.logoutModal?.classList.add("show");

    document.body.style.overflow = "hidden";
  }

  function closeLogoutModal() {
    DOM.logoutModal?.classList.remove("show");

    document.body.style.overflow = "";
  }

  /* =========================================================
     API
  ========================================================= */

  async function loadProfileFromServer() {
    const response = await fetch(window.APP_CONFIG.api("/auth/me"), {
      method: "GET",

      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },

      cache: "no-store",
    });

    let result = null;

    try {
      result = await response.json();
    } catch (error) {
      result = null;
    }

    if (response.status === 401) {
      redirectToLogin();

      throw new Error("Your login session has expired.");
    }

    if (!response.ok) {
      throw new Error(result?.message || "Profile load করা যায়নি।");
    }

    return result?.data?.user || result?.user || null;
  }

  /* =========================================================
     PROFILE RENDER
  ========================================================= */

  function getDisplayName(user) {
    return (
      user?.fullName || user?.full_name || user?.username || "PMS ADDA Player"
    );
  }

  function renderAvatar(user) {
    if (!DOM.avatar) {
      return;
    }

    DOM.avatar.replaceChildren();

    const avatarUrl =
      user?.avatarUrl ||
      user?.avatar_url ||
      user?.profileImage ||
      user?.profile_image ||
      null;

    const displayName = getDisplayName(user);

    if (avatarUrl) {
      const image = document.createElement("img");

      image.src = window.APP_CONFIG.server(avatarUrl);
      image.alt = `${displayName} avatar`;

      image.onerror = () => {
        DOM.avatar.replaceChildren();

        DOM.avatar.textContent = displayName.charAt(0).toUpperCase() || "P";
      };

      DOM.avatar.appendChild(image);

      return;
    }

    DOM.avatar.textContent = displayName.charAt(0).toUpperCase() || "P";
  }

  function renderProfile() {
    const user = STATE.user || {};

    const displayName = getDisplayName(user);

    const accountStatus = normalizeString(
      user.accountStatus || user.account_status || "active",
    );

    const walletBalance = user.walletBalance ?? user.wallet_balance ?? 0;

    if (DOM.name) {
      DOM.name.textContent = displayName;
    }

    if (DOM.uid) {
      DOM.uid.textContent = user.uid || "-";
    }

    if (DOM.username) {
      DOM.username.textContent = user.username || "-";
    }

    if (DOM.phone) {
      DOM.phone.textContent = user.phone || "-";
    }

    if (DOM.email) {
      DOM.email.textContent = user.email || "-";
    }

    if (DOM.role) {
      const role = normalizeString(user.role) || "user";

      DOM.role.textContent = role.charAt(0).toUpperCase() + role.slice(1);
    }

    if (DOM.walletBalance) {
      DOM.walletBalance.textContent = formatMoney(walletBalance);
    }

    if (DOM.status) {
      DOM.status.textContent = accountStatus === "banned" ? "Banned" : "Active";

      DOM.status.classList.toggle("active", accountStatus !== "banned");

      DOM.status.classList.toggle("banned", accountStatus === "banned");
    }

    renderAvatar(user);

    localStorage.setItem("current_user", JSON.stringify(user));
  }

  /* =========================================================
   PROFILE PICTURE UPLOAD
========================================================= */

  function validateAvatarFile(file) {
    const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

    const maximumSize = 2 * 1024 * 1024;

    if (!file) {
      throw new Error("Please select a profile picture.");
    }

    if (!allowedTypes.has(file.type)) {
      throw new Error("Only JPG, PNG or WEBP pictures are allowed.");
    }

    if (file.size > maximumSize) {
      throw new Error("Profile picture must not exceed 2MB.");
    }
  }

  function showAvatarPreview(file) {
    if (!DOM.avatar) {
      return;
    }

    if (STATE.avatarPreviewUrl) {
      URL.revokeObjectURL(STATE.avatarPreviewUrl);
    }

    STATE.avatarPreviewUrl = URL.createObjectURL(file);

    const image = document.createElement("img");

    image.src = STATE.avatarPreviewUrl;
    image.alt = "Selected profile picture";

    DOM.avatar.replaceChildren(image);
  }

  function setAvatarUploading(uploading) {
    STATE.avatarUploading = uploading;

    DOM.avatarEditor?.classList.toggle("uploading", uploading);

    if (DOM.avatarButton) {
      DOM.avatarButton.disabled = uploading;
    }

    if (DOM.avatarInput) {
      DOM.avatarInput.disabled = uploading;
    }
  }

  async function uploadProfileAvatar(file) {
    if (STATE.avatarUploading) {
      return;
    }

    validateAvatarFile(file);
    showAvatarPreview(file);
    setAvatarUploading(true);

    try {
      const formData = new FormData();

      formData.append("avatar", file);

      const response = await fetch(window.APP_CONFIG.api("/profile/avatar"), {
        method: "POST",

        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },

        body: formData,
      });

      let result = null;

      try {
        result = await response.json();
      } catch (error) {
        result = null;
      }

      if (response.status === 401) {
        redirectToLogin();

        throw new Error("Your login session has expired.");
      }

      if (!response.ok) {
        throw new Error(result?.message || "Profile picture upload failed.");
      }

      const avatarUrl = result?.data?.avatarUrl || result?.data?.avatar_url;

      if (!avatarUrl) {
        throw new Error("Uploaded profile picture URL was not received.");
      }

      STATE.user = {
        ...(STATE.user || {}),
        avatarUrl,
        avatar_url: avatarUrl,
      };

      renderProfile();

      showToast("Profile picture updated successfully.", "success");
    } catch (error) {
      console.error("PROFILE PICTURE UPLOAD ERROR:", error);

      renderAvatar(STATE.user || {});

      showToast(error.message || "Profile picture upload failed.", "error");
    } finally {
      if (STATE.avatarPreviewUrl) {
        URL.revokeObjectURL(STATE.avatarPreviewUrl);

        STATE.avatarPreviewUrl = null;
      }

      if (DOM.avatarInput) {
        DOM.avatarInput.value = "";
      }

      setAvatarUploading(false);
    }
  }

  /* =========================================================
     LOAD PROFILE
  ========================================================= */

  async function loadProfile(options = {}) {
    if (STATE.loading) {
      return;
    }

    showLoader();

    try {
      const user = await loadProfileFromServer();

      if (!user) {
        throw new Error("Profile information পাওয়া যায়নি।");
      }

      STATE.user = user;

      renderProfile();

      if (options.showSuccess === true) {
        showToast("Profile updated successfully.", "success");
      }
    } catch (error) {
      console.error("DYNAMIC PROFILE LOAD ERROR:", error);

      showToast(error.message || "Profile load করা যায়নি।", "error");
    } finally {
      hideLoader();
    }
  }

  /* =========================================================
     EVENTS
  ========================================================= */

  DOM.avatarButton?.addEventListener("click", () => {
    if (!STATE.avatarUploading) {
      DOM.avatarInput?.click();
    }
  });

  DOM.avatarInput?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      await uploadProfileAvatar(file);
    } catch (error) {
      showToast(error.message || "Profile picture upload failed.", "error");

      event.target.value = "";
    }
  });

  DOM.backButton?.addEventListener("click", () => navigateTo("./lobby.html"));

  DOM.refreshButton?.addEventListener("click", async () => {
    const icon = DOM.refreshButton.querySelector("i");

    icon?.classList.add("fa-spin");

    await loadProfile({
      showSuccess: true,
    });

    icon?.classList.remove("fa-spin");
  });

  DOM.walletAction?.addEventListener("click", () =>
    navigateTo("./wallet.html"),
  );

  DOM.historyAction?.addEventListener("click", () =>
    navigateTo("./wallet.html#transactionHistory"),
  );

  DOM.supportAction?.addEventListener("click", () =>
    navigateTo("./support.html"),
  );

  DOM.logoutAction?.addEventListener("click", openLogoutModal);

  DOM.cancelLogout?.addEventListener("click", closeLogoutModal);

  DOM.confirmLogout?.addEventListener("click", () => {
    clearAuthentication();
    window.location.replace("./login.html");
  });

  DOM.logoutModal?.addEventListener("click", (event) => {
    if (event.target === DOM.logoutModal) {
      closeLogoutModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeLogoutModal();
    }
  });

  /* Bottom navigation */

  DOM.homeNav?.addEventListener("click", () => navigateTo("./lobby.html"));

  DOM.walletNav?.addEventListener("click", () => navigateTo("./wallet.html"));

  DOM.gamesNav?.addEventListener("click", () =>
    navigateTo("./lobby.html#games"),
  );

  DOM.supportNav?.addEventListener("click", () => navigateTo("./support.html"));

  /* =========================================================
     INITIALIZE
  ========================================================= */

  async function initializeProfile() {
    if (!window.APP_CONFIG) {
      showToast("APP_CONFIG পাওয়া যায়নি।", "error");

      return;
    }

    if (!token) {
      redirectToLogin();
      return;
    }

    /*
     * Cached data আগে render হবে,
     * তারপর server data দিয়ে refresh হবে।
     */
    try {
      const cachedUser = JSON.parse(
        localStorage.getItem("current_user") || "null",
      );

      if (cachedUser) {
        STATE.user = cachedUser;
        renderProfile();
      }
    } catch (error) {
      localStorage.removeItem("current_user");
    }

    await loadProfile();

    console.log("✅ PMS ADDA dynamic Profile loaded");
  }

  initializeProfile();
});
