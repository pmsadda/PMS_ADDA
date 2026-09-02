/* ==========================================
   PMS ADDA
   Withdraw JS
   Backend Connected
========================================== */

document.addEventListener("DOMContentLoaded", () => {
  const API_BASE_URL = window.APP_CONFIG.API_URL;

  const backBtn = document.getElementById("backBtn");
  const balance = document.getElementById("balance");

  const paymentCards = document.querySelectorAll(".payment-card");

  const accountNumber = document.getElementById("accountNumber");

  const withdrawAmount = document.getElementById("withdrawAmount");

  const lastFourDigit = document.getElementById("lastFourDigit");

  const submitWithdraw = document.getElementById("submitWithdraw");

  const confirmModal = document.getElementById("confirmModal");

  const cancelWithdraw = document.getElementById("cancelWithdraw");

  const confirmWithdraw = document.getElementById("confirmWithdraw");

  const loader = document.getElementById("loaderOverlay");

  const successModal = document.getElementById("successModal");

  const failedModal = document.getElementById("failedModal");

  const successOkBtn = document.getElementById("successOkBtn");

  const failedOkBtn = document.getElementById("failedOkBtn");

  const toast = document.getElementById("toast");

  const toastMessage = document.getElementById("toastMessage");

  const withdrawStatusCard = document.getElementById("withdrawStatusCard");

  const withdrawStatusIcon = document.getElementById("withdrawStatusIcon");

  const withdrawStatusTitle = document.getElementById("withdrawStatusTitle");

  const withdrawStatusMessage = document.getElementById(
    "withdrawStatusMessage",
  );

  const withdrawHistoryList = document.getElementById("withdrawHistoryList");

  const token = localStorage.getItem("access_token");

  let selectedMethod = "bkash";

  let currentBalance = 0;

  let turnoverRequired = 0;

  let turnoverAmount = 0;

  let withdrawHistory = [];

  let currentPendingWithdraw = null;

  let pendingWithdrawData = null;

  /* ==========================
       Login Check
    ========================== */

  if (!token) {
    window.location.replace("/login");
    return;
  }

  /* ==========================
       Helper Functions
    ========================== */

  function showLoader() {
    loader.style.display = "flex";
  }

  function hideLoader() {
    loader.style.display = "none";
  }

  function showToast(message) {
    toastMessage.textContent = message;
    toast.style.display = "block";

    setTimeout(() => {
      toast.style.display = "none";
    }, 2500);
  }

  function showFailed(message) {
    failedMessage.textContent = message;
    failedModal.style.display = "flex";
  }

  /* ==========================
       Load Live Balance
    ========================== */

  function formatMoney(value) {
    const amount = Number(value);

    return (Number.isFinite(amount) ? amount : 0).toLocaleString("en-BD", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
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

  function normalizeStatus(value) {
    return String(value || "pending")
      .trim()
      .toLowerCase();
  }

  async function requestWithdrawAPI(path) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
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
      localStorage.removeItem("access_token");

      localStorage.removeItem("current_user");

     window.location.replace("/login");

      throw new Error("Your login session has expired.");
    }

    if (!response.ok || result?.success === false) {
      throw new Error(result?.message || "Withdraw data load failed.");
    }

    return result;
  }

  function setWithdrawStatus(statusClass, iconClass, title, message) {
    withdrawStatusCard.classList.remove(
      "is-eligible",
      "is-pending",
      "is-blocked",
    );

    withdrawStatusCard.classList.add(statusClass);

    withdrawStatusIcon.innerHTML = "";

    const icon = document.createElement("i");

    icon.className = iconClass;

    withdrawStatusIcon.appendChild(icon);

    withdrawStatusTitle.textContent = title;

    withdrawStatusMessage.textContent = message;
  }

  function renderWithdrawStatus() {
    const remainingTurnover = Math.max(0, turnoverRequired - turnoverAmount);

    if (currentPendingWithdraw) {
      setWithdrawStatus(
        "is-pending",
        "fa-solid fa-hourglass-half",
        "Withdrawal Pending",
        `৳${formatMoney(
          currentPendingWithdraw.amount,
        )} request is waiting for admin verification.`,
      );

      submitWithdraw.disabled = true;
      return;
    }

    if (remainingTurnover > 0) {
      setWithdrawStatus(
        "is-blocked",
        "fa-solid fa-circle-exclamation",
        "Turnover Incomplete",
        `Complete ৳${formatMoney(
          remainingTurnover,
        )} more turnover before withdrawing.`,
      );

      submitWithdraw.disabled = true;
      return;
    }

    if (currentBalance < 500) {
      setWithdrawStatus(
        "is-blocked",
        "fa-solid fa-wallet",
        "Insufficient Balance",
        "Minimum withdraw amount is ৳500.00.",
      );

      submitWithdraw.disabled = true;
      return;
    }

    setWithdrawStatus(
      "is-eligible",
      "fa-solid fa-circle-check",
      "Withdrawal Available",
      "Your balance and turnover requirements are complete.",
    );

    submitWithdraw.disabled = false;
  }

  function getHistoryStatusLabel(status) {
    if (status === "approved") {
      return "Completed";
    }

    if (status === "rejected") {
      return "Rejected";
    }

    return "Pending";
  }

  function createWithdrawHistoryCard(withdrawal) {
    const card = document.createElement("article");

    card.className = "history-card";

    const copy = document.createElement("div");

    copy.className = "history-card-copy";

    const title = document.createElement("h4");

    title.textContent = `${String(
      withdrawal.method || "Withdraw",
    ).toUpperCase()} Withdraw`;

    const date = document.createElement("p");

    date.textContent = formatDate(withdrawal.createdAt);

    copy.append(title, date);

    const statusValue = normalizeStatus(withdrawal.status);

    const status = document.createElement("div");

    status.className = `history-status ${statusValue}`;

    status.textContent = getHistoryStatusLabel(statusValue);

    const amount = document.createElement("div");

    amount.className = "history-amount";

    amount.textContent = `- ৳${formatMoney(withdrawal.amount)}`;

    card.append(copy, status, amount);

    return card;
  }

  function renderWithdrawHistory() {
    withdrawHistoryList.replaceChildren();

    if (withdrawHistory.length === 0) {
      const empty = document.createElement("div");

      empty.className = "history-empty";

      const icon = document.createElement("i");

      icon.className = "fa-solid fa-receipt";

      const text = document.createElement("p");

      text.textContent = "No withdrawal request found.";

      empty.append(icon, text);

      withdrawHistoryList.appendChild(empty);

      return;
    }

    const fragment = document.createDocumentFragment();

    withdrawHistory.slice(0, 10).forEach((withdrawal) => {
      fragment.appendChild(createWithdrawHistoryCard(withdrawal));
    });

    withdrawHistoryList.appendChild(fragment);
  }

  async function loadWithdrawData() {
    try {
      const [summaryResult, historyResult] = await Promise.all([
        requestWithdrawAPI("/wallet/summary"),

        requestWithdrawAPI("/withdraws/my-history"),
      ]);

      const wallet = summaryResult?.data?.wallet || {};

      currentBalance = Number(wallet.balance || 0);

      turnoverRequired = Number(wallet.turnoverRequired || 0);

      turnoverAmount = Number(wallet.turnoverAmount || 0);

      withdrawHistory = historyResult?.data?.withdrawals || [];

      if (!Array.isArray(withdrawHistory)) {
        withdrawHistory = [];
      }

      currentPendingWithdraw =
        withdrawHistory.find(
          (withdrawal) => normalizeStatus(withdrawal.status) === "pending",
        ) || null;

      balance.textContent = formatMoney(currentBalance);

      renderWithdrawHistory();

      renderWithdrawStatus();
    } catch (error) {
      console.error("DYNAMIC WITHDRAW LOAD ERROR:", error);

      showFailed(error.message || "Withdraw data load failed.");
    }
  }

  /* ==========================
       Back Button
    ========================== */

  if (backBtn) {
    backBtn.addEventListener("click", () => {
      history.back();
    });
  }

  /* ==========================
       Payment Method
    ========================== */

  paymentCards.forEach((card) => {
    card.addEventListener("click", () => {
      paymentCards.forEach((item) => {
        item.classList.remove("active");
      });

      card.classList.add("active");

      selectedMethod = card.dataset.method;
    });
  });

  /* ==========================
       Submit Withdraw
    ========================== */

  submitWithdraw.addEventListener("click", () => {
    const account = accountNumber.value.trim();

    const amount = Number(withdrawAmount.value);

    const last4 = lastFourDigit.value.trim();

    if (!/^01\d{9}$/.test(account)) {
      showToast("সঠিক ১১ সংখ্যার মোবাইল নম্বর দিন।");

      accountNumber.focus();
      return;
    }

    if (!Number.isFinite(amount) || amount < 500) {
      showToast("Minimum withdraw ৳500.");

      withdrawAmount.focus();
      return;
    }

    if (amount > currentBalance) {
      showToast("Wallet balance পর্যাপ্ত নয়।");

      withdrawAmount.focus();
      return;
    }

    if (!/^\d{4}$/.test(last4)) {
      showToast("শেষ ৪টি সংখ্যা সঠিকভাবে দিন।");

      lastFourDigit.focus();
      return;
    }

    if (account.slice(-4) !== last4) {
      showToast("Account number-এর শেষ ৪টি সংখ্যার সঙ্গে মিল নেই।");

      lastFourDigit.focus();
      return;
    }

    pendingWithdrawData = {
      method: selectedMethod,
      accountNumber: account,
      amount: amount,
      lastFourDigits: last4,
    };

    document.getElementById("confirmMethod").textContent =
      selectedMethod.toUpperCase();

    document.getElementById("confirmAccount").textContent = account;

    document.getElementById("confirmAmount").textContent = amount.toFixed(2);

    confirmModal.style.display = "flex";
  });

  /* ==========================
       Cancel Withdraw
    ========================== */

  cancelWithdraw.addEventListener("click", () => {
    confirmModal.style.display = "none";
    pendingWithdrawData = null;
  });

  /* ==========================
       Confirm Withdraw API
    ========================== */

  confirmWithdraw.addEventListener("click", async () => {
    if (!pendingWithdrawData) {
      return;
    }

    confirmModal.style.display = "none";

    showLoader();

    confirmWithdraw.disabled = true;

    try {
      const response = await fetch(`${API_BASE_URL}/withdraws`, {
        method: "POST",

        headers: {
          "Content-Type": "application/json",

          Authorization: `Bearer ${token}`,
        },

        body: JSON.stringify(pendingWithdrawData),
      });

      const result = await response.json();

      if (response.status === 401) {
        localStorage.removeItem("access_token");

        localStorage.removeItem("current_user");

        window.location.replace("/login");

        return;
      }

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Withdraw request failed.");
      }

      const withdraw = result.data.withdraw;

      currentBalance = Number(withdraw.remainingBalance);

      balance.textContent = currentBalance.toFixed(2);

      successModal.style.display = "flex";

      pendingWithdrawData = null;
    } catch (error) {
      console.error(error);

      showFailed(error.message || "Withdraw request failed.");
    } finally {
      hideLoader();

      confirmWithdraw.disabled = false;
    }
  });

  /* ==========================
       Success Button
    ========================== */

  successOkBtn.addEventListener("click", () => {
    successModal.style.display = "none";

    accountNumber.value = "";
    withdrawAmount.value = "";
    lastFourDigit.value = "";

    showToast("Withdrawal request submitted.");

    loadWithdrawData();
  });

  /* ==========================
       Failed Button
    ========================== */

  failedOkBtn.addEventListener("click", () => {
    failedModal.style.display = "none";
  });

  /* ==========================
       Close Modals
    ========================== */

  window.addEventListener("click", (event) => {
    if (event.target === confirmModal) {
      confirmModal.style.display = "none";
    }

    if (event.target === successModal) {
      successModal.style.display = "none";
    }

    if (event.target === failedModal) {
      failedModal.style.display = "none";
    }
  });

  /* ==========================
       ESC Key
    ========================== */

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      confirmModal.style.display = "none";

      successModal.style.display = "none";

      failedModal.style.display = "none";
    }
  });

  /* ==========================
       Start Page
    ========================== */

  loadWithdrawData();

  console.log("Withdraw API Connected Successfully");
});
