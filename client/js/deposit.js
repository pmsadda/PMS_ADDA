document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  /* ==========================
       Elements
    ========================== */

  const backBtn = document.getElementById("backBtn");

  const balance = document.getElementById("balance");

  const amountInput = document.getElementById("amount");

  const senderNumberInput = document.getElementById("senderNumber");

  const transactionIdInput = document.getElementById("transactionId");

  const paymentCards = document.querySelectorAll(".payment-card");

  const copyNumberBtn = document.getElementById("copyNumberBtn");

  const merchantNumber = document.getElementById("merchantNumber");

  const paymentMethodGrid = document.getElementById("paymentMethodGrid");

  const paymentMethodMessage = document.getElementById("paymentMethodMessage");

  const paymentMethodTitle = document.getElementById("paymentMethodTitle");

  const merchantAccountType = document.getElementById("merchantAccountType");

  const officialNumberCard = document.getElementById("officialNumberCard");

  const submitBtn = document.getElementById("submitDeposit");

  const loader = document.getElementById("loaderOverlay");

  const toast = document.getElementById("toast");

  const toastMessage = document.getElementById("toastMessage");

  const successModal = document.getElementById("successModal");

  const successOkBtn = document.getElementById("successOkBtn");

  /* ==========================
       Configuration
    ========================== */

  const API_BASE_URL = APP_CONFIG.API_URL;

  let activePaymentMethods = [];

  let selectedMethod = null;

  let isPaymentMethodsReady = false;

  let toastTimer;

  /* ==========================
       Login Data
    ========================== */

  const token = localStorage.getItem("access_token");

  const storedUser = localStorage.getItem("current_user");

  let currentUser = null;

  try {
    currentUser = storedUser ? JSON.parse(storedUser) : null;
  } catch (error) {
    currentUser = null;
  }

  if (!token || !currentUser) {
    window.location.replace("login.html");
    return;
  }

  if (balance) {
    balance.textContent = Number(currentUser.walletBalance || 0).toFixed(2);
  }

  /* ==========================
       Helper Functions
    ========================== */

  function showLoader() {
    if (loader) {
      loader.style.display = "flex";
    }

    if (submitBtn) {
      submitBtn.disabled = true;
    }
  }

  function hideLoader() {
    if (loader) {
      loader.style.display = "none";
    }

    if (submitBtn) {
      submitBtn.disabled = !isPaymentMethodsReady || !selectedMethod;
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

  function closeSuccessModal() {
    if (successModal) {
      successModal.style.display = "none";
    }
  }

  function resetForm() {
    amountInput.value = "";
    senderNumberInput.value = "";
    transactionIdInput.value = "";
  }

  /* ==========================
   Dynamic Payment Methods
========================== */

  function formatAccountType(accountType) {
    const normalizedType = String(accountType || "personal").toLowerCase();

    const labels = {
      personal: "Personal Account",
      agent: "Agent Account",
      merchant: "Merchant Account",
    };

    return labels[normalizedType] || "Official Account";
  }

  function getActivePaymentMethod(method) {
    return (
      activePaymentMethods.find(
        (paymentMethod) => paymentMethod.method === method,
      ) || null
    );
  }

  function showPaymentUnavailable(message) {
    selectedMethod = null;
    isPaymentMethodsReady = false;

    paymentCards.forEach((card) => {
      card.classList.remove("active");

      card.setAttribute("aria-pressed", "false");

      card.disabled = true;
      card.hidden = true;
    });

    if (paymentMethodMessage) {
      paymentMethodMessage.textContent = message;

      paymentMethodMessage.classList.remove("is-success");

      paymentMethodMessage.classList.add("is-error");
    }

    if (paymentMethodTitle) {
      paymentMethodTitle.textContent = "Payment Method Unavailable";
    }

    if (merchantAccountType) {
      merchantAccountType.textContent = "Unavailable";
    }

    if (merchantNumber) {
      merchantNumber.textContent = "—";
    }

    officialNumberCard?.classList.remove("is-loading");

    officialNumberCard?.classList.add("is-unavailable");

    if (copyNumberBtn) {
      copyNumberBtn.disabled = true;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
    }
  }

  function selectPaymentMethod(method) {
    const paymentMethod = getActivePaymentMethod(method);

    if (!paymentMethod) {
      return;
    }

    selectedMethod = paymentMethod.method;

    paymentCards.forEach((card) => {
      const isSelected = card.dataset.method === selectedMethod;

      card.classList.toggle("active", isSelected);

      card.setAttribute("aria-pressed", String(isSelected));
    });

    if (paymentMethodTitle) {
      paymentMethodTitle.textContent = `Official ${
        paymentMethod.displayName
      } Number`;
    }

    if (merchantAccountType) {
      merchantAccountType.textContent = formatAccountType(
        paymentMethod.accountType,
      );
    }

    if (merchantNumber) {
      merchantNumber.textContent = paymentMethod.accountNumber;
    }

    officialNumberCard?.classList.remove("is-loading", "is-unavailable");

    if (copyNumberBtn) {
      copyNumberBtn.disabled = false;
    }

    if (submitBtn) {
      submitBtn.disabled = false;
    }
  }

  function renderPaymentMethods(paymentMethods) {
    activePaymentMethods = paymentMethods
      .map((paymentMethod) => ({
        method: String(paymentMethod.method || "").toLowerCase(),

        displayName: String(
          paymentMethod.displayName || paymentMethod.method || "",
        ),

        accountNumber: String(paymentMethod.accountNumber || ""),

        accountType: String(
          paymentMethod.accountType || "personal",
        ).toLowerCase(),
      }))
      .filter(
        (paymentMethod) =>
          ["bkash", "nagad", "rocket"].includes(paymentMethod.method) &&
          /^01\d{9}$/.test(paymentMethod.accountNumber),
      );

    paymentCards.forEach((card) => {
      const paymentMethod = getActivePaymentMethod(card.dataset.method);

      card.hidden = !paymentMethod;
      card.disabled = !paymentMethod;

      card.classList.remove("active");

      card.setAttribute("aria-pressed", "false");
    });

    if (activePaymentMethods.length === 0) {
      showPaymentUnavailable("Deposit payment method এখন পাওয়া যাচ্ছে না।");

      return;
    }

    isPaymentMethodsReady = true;

    if (paymentMethodMessage) {
      paymentMethodMessage.textContent =
        "Admin-approved payment method নির্বাচন করুন।";

      paymentMethodMessage.classList.remove("is-error");

      paymentMethodMessage.classList.add("is-success");
    }

    selectPaymentMethod(activePaymentMethods[0].method);
  }

  async function loadPaymentMethods() {
    isPaymentMethodsReady = false;
    selectedMethod = null;

    officialNumberCard?.classList.add("is-loading");

    if (submitBtn) {
      submitBtn.disabled = true;
    }

    if (copyNumberBtn) {
      copyNumberBtn.disabled = true;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/deposits/payment-methods`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const result = await response.json().catch(() => ({
        success: false,
        message: "Invalid server response.",
      }));

      if (response.status === 401) {
        localStorage.removeItem("access_token");

        localStorage.removeItem("current_user");

        window.location.replace("login.html");

        return;
      }

      if (!response.ok || !result.success) {
        throw new Error(
          result.message || "Payment methods could not be loaded.",
        );
      }

      const paymentMethods =
        result.data?.paymentMethods || result.data?.paymentSettings || [];

      renderPaymentMethods(paymentMethods);
    } catch (error) {
      console.error("Load payment methods error:", error);

      showPaymentUnavailable(
        "Payment methods load করা যায়নি। আবার চেষ্টা করুন।",
      );

      showToast(error.message || "Payment methods load করা যায়নি।");
    } finally {
      officialNumberCard?.classList.remove("is-loading");
    }
  }

  /* ==========================
       Back Button
    ========================== */

  backBtn?.addEventListener("click", () => {
    window.history.back();
  });

  /* ==========================
       Payment Method
    ========================== */

  paymentCards.forEach((card) => {
    card.addEventListener("click", () => {
      if (card.disabled || card.hidden) {
        return;
      }

      selectPaymentMethod(card.dataset.method);
    });
  });

  /* ==========================
       Copy Merchant Number
    ========================== */

  copyNumberBtn?.addEventListener("click", async () => {
    const number = merchantNumber?.textContent.trim();

    if (!selectedMethod || !/^01\d{9}$/.test(number)) {
      showToast("Merchant number পাওয়া যায়নি।");
      return;
    }

    try {
      await navigator.clipboard.writeText(number);

      showToast("Merchant number copied.");
    } catch (error) {
      console.error("Copy failed:", error);

      showToast("Merchant number copy করা যায়নি।");
    }
  });

  /* ==========================
       Submit Deposit
    ========================== */

  submitBtn?.addEventListener("click", async () => {
    const activePaymentMethod = getActivePaymentMethod(selectedMethod);

    if (!isPaymentMethodsReady || !activePaymentMethod) {
      showToast("একটি active payment method নির্বাচন করুন।");

      return;
    }

    const amount = Number(amountInput.value);

    const senderNumber = senderNumberInput.value.trim();

    const transactionNumber = transactionIdInput.value.trim().toUpperCase();

    if (!Number.isFinite(amount) || amount < 100) {
      showToast("Minimum deposit amount ৳100।");

      amountInput.focus();
      return;
    }

    if (!/^01[3-9]\d{8}$/.test(senderNumber)) {
      showToast("সঠিক ১১ ডিজিটের Sender Number দিন।");

      senderNumberInput.focus();
      return;
    }

    if (transactionNumber.length < 6) {
      showToast("সঠিক Transaction ID দিন।");

      transactionIdInput.focus();
      return;
    }

    showLoader();

    try {
      const response = await fetch(`${API_BASE_URL}/deposits`, {
        method: "POST",

        headers: {
          "Content-Type": "application/json",

          Authorization: `Bearer ${token}`,
        },

        body: JSON.stringify({
          method: selectedMethod,
          senderNumber,
          transactionNumber,
          amount,
        }),
      });

      const result = await response.json();

      if (response.status === 401) {
        localStorage.removeItem("access_token");

        localStorage.removeItem("current_user");

        window.location.replace("login.html");

        return;
      }

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Deposit request failed.");
      }

      resetForm();

      if (successModal) {
        successModal.style.display = "flex";
      }
    } catch (error) {
      console.error("Deposit error:", error);

      showToast(error.message || "Server-এর সঙ্গে সংযোগ করা যায়নি।");
    } finally {
      hideLoader();
    }
  });

  /* ==========================
   Initial Payment Load
========================== */

loadPaymentMethods();

  /* ==========================
       Success Modal
    ========================== */

  successOkBtn?.addEventListener("click", () => {
    closeSuccessModal();

    showToast("Deposit request pending approval.");
  });

  window.addEventListener("click", (event) => {
    if (event.target === successModal) {
      closeSuccessModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeSuccessModal();
    }
  });
});
