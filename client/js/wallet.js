"use strict";

document.addEventListener("DOMContentLoaded", () => {
  /* =========================================================
     CONFIGURATION
  ========================================================= */

  const token =
    localStorage.getItem("access_token") ||
    localStorage.getItem("token") ||
    "";

  const STATE = {
    user: null,
    wallet: null,
    transactions: [],
    loading: false,
    lastLoadedAt: 0,
    toastTimer: null,
  };

  /* =========================================================
     DOM REFERENCES
  ========================================================= */

  const DOM = {
    userAvatar: document.getElementById("userAvatar"),
    userName: document.getElementById("userName"),
    userId: document.getElementById("userId"),

    walletBalance:
      document.getElementById("walletBalance"),
    lastUpdated:
      document.getElementById("lastUpdated"),

    totalDeposit:
      document.getElementById("totalDeposit"),
    totalWithdraw:
      document.getElementById("totalWithdraw"),
    totalWinning:
      document.getElementById("totalWinning"),
    totalLose:
      document.getElementById("totalLose"),
    serviceCharge:
      document.getElementById("serviceCharge"),
    winRate:
      document.getElementById("winRate"),

    transactionList:
      document.getElementById("transactionList"),

    refreshButton:
      document.getElementById("refreshBalance"),

    depositButton:
      document.getElementById("depositBtn"),
    withdrawButton:
      document.getElementById("withdrawBtn"),
    historyButton:
      document.getElementById("historyBtn"),
    bonusButton:
      document.getElementById("bonusBtn"),
    viewAllButton:
      document.getElementById("viewAllBtn"),

    homeButton:
      document.getElementById("walletHomeBtn"),
    walletButton:
      document.getElementById("walletNavBtn"),
    gamesButton:
      document.getElementById("walletGamesBtn"),
    supportButton:
      document.getElementById("walletSupportBtn"),
    profileButton:
      document.getElementById("walletProfileBtn"),

    loader:
      document.getElementById("loaderOverlay"),
    toast:
      document.getElementById("toast"),
  };

  /* =========================================================
     HELPERS
  ========================================================= */

  function formatMoney(value) {
    const amount = Number(value);

    return (Number.isFinite(amount) ? amount : 0).toLocaleString(
      "en-BD",
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      },
    );
  }

  function normalizeString(value) {
    return String(value || "")
      .trim()
      .toLowerCase();
  }

  function formatDate(value) {
    const date = value ? new Date(value) : null;

    if (!date || Number.isNaN(date.getTime())) {
      return "Recently";
    }

    return date.toLocaleString("en-BD", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
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
      DOM.loader.style.display = "flex";
    }

    if (DOM.refreshButton) {
      DOM.refreshButton.disabled = true;
      DOM.refreshButton.setAttribute("aria-busy", "true");
    }
  }

  function hideLoader() {
    STATE.loading = false;

    if (DOM.loader) {
      DOM.loader.style.display = "none";
    }

    if (DOM.refreshButton) {
      DOM.refreshButton.disabled = false;
      DOM.refreshButton.setAttribute("aria-busy", "false");
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

  /* =========================================================
     SECURE API
  ========================================================= */

  async function requestWalletSummary() {
    const response = await fetch(
      window.APP_CONFIG.api("/wallet/summary"),
      {
        method: "GET",

        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },

        cache: "no-store",
      },
    );

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
      const requestError = new Error(
        result?.message ||
          "Wallet summary load করা যায়নি।",
      );

      requestError.statusCode = response.status;
      requestError.code =
        result?.code || "WALLET_SUMMARY_ERROR";

      throw requestError;
    }

    return result?.data || null;
  }

  /* =========================================================
     USER + WALLET RENDER
  ========================================================= */

  function renderUser() {
    const user = STATE.user || {};

    const displayName =
      user.fullName ||
      user.full_name ||
      user.username ||
      "PMS ADDA Player";

    if (DOM.userName) {
      DOM.userName.textContent = displayName;
    }

    if (DOM.userId) {
      DOM.userId.textContent = user.uid || "-";
    }

    if (DOM.userAvatar) {
      const avatar =
        user.avatarUrl ||
        user.avatar_url ||
        "../assets/images/default-avatar.png";

      DOM.userAvatar.src = avatar;
      DOM.userAvatar.alt = `${displayName} avatar`;

      DOM.userAvatar.onerror = () => {
        DOM.userAvatar.onerror = null;
        DOM.userAvatar.src =
          "../assets/images/default-avatar.png";
      };
    }
  }

  function setMoney(element, value) {
    if (element) {
      element.textContent =
        `৳ ${formatMoney(value)}`;
    }
  }

  function renderWallet() {
    const wallet = STATE.wallet || {};

    if (DOM.walletBalance) {
      DOM.walletBalance.textContent =
        formatMoney(wallet.balance);
    }

    setMoney(
      DOM.totalDeposit,
      wallet.totalDeposit,
    );

    setMoney(
      DOM.totalWithdraw,
      wallet.totalWithdraw,
    );

    setMoney(
      DOM.totalWinning,
      wallet.totalWinning,
    );

    setMoney(
      DOM.totalLose,
      wallet.totalLoss,
    );

    setMoney(
      DOM.serviceCharge,
      wallet.totalServiceCharge,
    );

    if (DOM.winRate) {
      const winRate = Number(wallet.winRate);

      DOM.winRate.textContent =
        `${Number.isFinite(winRate) ? winRate : 0}%`;
    }

    if (DOM.lastUpdated) {
      DOM.lastUpdated.textContent =
        formatDate(
          wallet.updatedAt || new Date(),
        );
    }
  }

  /* =========================================================
     TRANSACTION RENDER
  ========================================================= */

  function getTransactionPresentation(transaction) {
    const type = normalizeString(
      transaction.transactionType,
    );

    const presentations = {
      deposit: {
        title: "Deposit",
        icon: "fa-solid fa-circle-plus",
        className: "deposit",
      },

      withdraw: {
        title: "Withdraw",
        icon: "fa-solid fa-money-bill-transfer",
        className: "withdraw",
      },

      game_win: {
        title: "Game Win",
        icon: "fa-solid fa-trophy",
        className: "game_win",
      },

      game_loss: {
        title: "Game Entry",
        icon: "fa-solid fa-gamepad",
        className: "game_loss",
      },

      game_buy_in: {
        title: "Poker Buy-in",
        icon: "fa-solid fa-coins",
        className: "game_buy_in",
      },

      game_cash_out: {
        title: "Poker Cash-out",
        icon: "fa-solid fa-money-bill-wave",
        className: "game_cash_out",
      },

      service_charge: {
        title: "Service Charge",
        icon: "fa-solid fa-percent",
        className: "service_charge",
      },

      admin_add: {
        title: "Admin Credit",
        icon: "fa-solid fa-circle-plus",
        className: "admin_add",
      },

      admin_remove: {
        title: "Admin Debit",
        icon: "fa-solid fa-circle-minus",
        className: "admin_remove",
      },

      withdraw_refund: {
        title: "Withdraw Refund",
        icon: "fa-solid fa-rotate-left",
        className: "withdraw_refund",
      },
    };

    return (
      presentations[type] || {
        title: type
          ? type
              .split("_")
              .map(
                (word) =>
                  word.charAt(0).toUpperCase() +
                  word.slice(1),
              )
              .join(" ")
          : "Wallet Transaction",

        icon: "fa-solid fa-wallet",
        className: "service_charge",
      }
    );
  }

  function getStatusClass(status) {
    const normalizedStatus =
      normalizeString(status);

    if (
      normalizedStatus === "completed" ||
      normalizedStatus === "approved" ||
      normalizedStatus === "success"
    ) {
      return "success";
    }

    if (normalizedStatus === "pending") {
      return "pending";
    }

    return "failed";
  }

  function createTransactionElement(transaction) {
    const presentation =
      getTransactionPresentation(transaction);

    const item = document.createElement("article");

    item.className = "transaction-item";

    const icon = document.createElement("div");

    icon.className =
      `transaction-icon ${presentation.className}`;

    const iconElement =
      document.createElement("i");

    iconElement.className = presentation.icon;

    icon.appendChild(iconElement);

    const details = document.createElement("div");

    details.className = "transaction-details";

    const title = document.createElement("h4");

    title.textContent =
      transaction.description ||
      presentation.title;

    const date = document.createElement("p");

    date.textContent =
      formatDate(transaction.createdAt);

    details.append(title, date);

    const right = document.createElement("div");

    right.className = "transaction-right";

    const amount = document.createElement("h4");

    const direction =
      normalizeString(transaction.direction);

    const isCredit = direction === "credit";

    amount.className =
      `amount ${isCredit ? "plus" : "minus"}`;

    amount.textContent =
      `${isCredit ? "+" : "-"} ৳${formatMoney(
        transaction.amount,
      )}`;

    const status = document.createElement("span");

    status.className =
      `status ${getStatusClass(
        transaction.status,
      )}`;

    status.textContent =
      transaction.status || "completed";

    right.append(amount, status);
    item.append(icon, details, right);

    return item;
  }

  function renderTransactions() {
    if (!DOM.transactionList) {
      return;
    }

    DOM.transactionList.replaceChildren();

    if (STATE.transactions.length === 0) {
      const empty = document.createElement("div");

      empty.className = "transaction-empty";

      const icon = document.createElement("i");

      icon.className =
        "fa-solid fa-receipt";

      const message =
        document.createElement("p");

      message.textContent =
        "No wallet transactions yet.";

      empty.append(icon, message);
      DOM.transactionList.appendChild(empty);

      return;
    }

    const fragment =
      document.createDocumentFragment();

    STATE.transactions.forEach((transaction) => {
      fragment.appendChild(
        createTransactionElement(transaction),
      );
    });

    DOM.transactionList.appendChild(fragment);
  }

  /* =========================================================
     LOAD WALLET
  ========================================================= */

  async function loadWallet(options = {}) {
    if (STATE.loading) {
      return;
    }

    const showFullLoader =
      options.showLoader === true;

    if (showFullLoader) {
      showLoader();
    } else {
      STATE.loading = true;

      if (DOM.refreshButton) {
        DOM.refreshButton.disabled = true;
      }
    }

    try {
      const data = await requestWalletSummary();

      if (!data?.user || !data?.wallet) {
        throw new Error(
          "Invalid Wallet summary received.",
        );
      }

      STATE.user = data.user;
      STATE.wallet = data.wallet;
      STATE.transactions = Array.isArray(
        data.transactions,
      )
        ? data.transactions
        : [];

      renderUser();
      renderWallet();
      renderTransactions();

      localStorage.setItem(
        "current_user",
        JSON.stringify({
          ...STATE.user,
          walletBalance: STATE.wallet.balance,
        }),
      );

      STATE.lastLoadedAt = Date.now();

      if (options.showSuccess === true) {
        showToast(
          "Wallet updated successfully.",
          "success",
        );
      }
    } catch (error) {
      console.error(
        "DYNAMIC WALLET LOAD ERROR:",
        error,
      );

      showToast(
        error.message ||
          "Wallet load করা যায়নি।",
        "error",
      );
    } finally {
      hideLoader();
    }
  }

  /* =========================================================
     ACTIONS
  ========================================================= */

  DOM.refreshButton?.addEventListener(
    "click",
    async () => {
      const icon =
        DOM.refreshButton.querySelector("i");

      icon?.classList.add("fa-spin");

      await loadWallet({
        showSuccess: true,
      });

      icon?.classList.remove("fa-spin");
    },
  );

  DOM.depositButton?.addEventListener(
    "click",
    () => navigateTo("./deposit.html"),
  );

  DOM.withdrawButton?.addEventListener(
    "click",
    () => navigateTo("./withdraw.html"),
  );

  DOM.historyButton?.addEventListener(
    "click",
    () => navigateTo("./history.html"),
  );

  DOM.viewAllButton?.addEventListener(
    "click",
    () => navigateTo("./history.html"),
  );

  DOM.bonusButton?.addEventListener(
    "click",
    () => {
      showToast(
        "Bonus feature coming soon.",
        "info",
      );
    },
  );

  /* =========================================================
     BOTTOM NAVIGATION
  ========================================================= */

  DOM.homeButton?.addEventListener(
    "click",
    () => navigateTo("./lobby.html"),
  );

  DOM.walletButton?.addEventListener(
    "click",
    () => {
      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    },
  );

  DOM.gamesButton?.addEventListener(
    "click",
    () => navigateTo("./lobby.html#games"),
  );

  DOM.supportButton?.addEventListener(
    "click",
    () => navigateTo("./support.html"),
  );

  DOM.profileButton?.addEventListener(
    "click",
    () => navigateTo("./profile.html"),
  );

  /* =========================================================
     AUTOMATIC REFRESH
  ========================================================= */

  document.addEventListener(
    "visibilitychange",
    () => {
      if (
        document.visibilityState === "visible" &&
        Date.now() - STATE.lastLoadedAt > 15000
      ) {
        loadWallet();
      }
    },
  );

  window.addEventListener("focus", () => {
    if (Date.now() - STATE.lastLoadedAt > 15000) {
      loadWallet();
    }
  });

  /* =========================================================
     INITIALIZE
  ========================================================= */

  async function initializeWallet() {
    if (!window.APP_CONFIG) {
      showToast(
        "APP_CONFIG পাওয়া যায়নি।",
        "error",
      );

      return;
    }

    if (!token) {
      redirectToLogin();
      return;
    }

    await loadWallet({
      showLoader: true,
    });

    console.log(
      "✅ PMS ADDA dynamic Wallet loaded",
    );
  }

  initializeWallet();
});