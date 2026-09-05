document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  /* ==========================
     Elements
  ========================== */

  const backBtn = document.getElementById("backBtn");
  const balance = document.getElementById("balance");
  const amountInput = document.getElementById("amount");

  const paymentCards = document.querySelectorAll(
    ".payment-card",
  );

  const paymentMethodMessage = document.getElementById(
    "paymentMethodMessage",
  );

  const submitBtn = document.getElementById(
    "submitDeposit",
  );

  const loader = document.getElementById(
    "loaderOverlay",
  );

  const toast = document.getElementById("toast");

  const toastMessage = document.getElementById(
    "toastMessage",
  );

  /* ==========================
     Login
  ========================== */

  const token =
    localStorage.getItem("access_token") ||
    localStorage.getItem("token") ||
    "";

  let currentUser = null;

  try {
    currentUser = JSON.parse(
      localStorage.getItem("current_user") || "null",
    );
  } catch {
    currentUser = null;
  }

  if (!token) {
    window.location.replace("/login");
    return;
  }

  if (balance) {
    balance.textContent = Number(
      currentUser?.walletBalance || 0,
    ).toFixed(2);
  }

  /* ==========================
     State
  ========================== */

  let selectedMethod = null;
  let isSubmitting = false;
  let toastTimer = null;

const allowedMethods = [
  "BKASH",
  "NAGAD",
];

  /* ==========================
     Toast
  ========================== */

  function showToast(message) {
    if (!toast || !toastMessage) {
      window.alert(message);
      return;
    }

    toastMessage.textContent = message;

    toast.classList.add("show");

    clearTimeout(toastTimer);

    toastTimer = window.setTimeout(() => {
      toast.classList.remove("show");
    }, 3000);
  }

  /* ==========================
     Loader
  ========================== */

  function showLoader() {
    isSubmitting = true;

    if (loader) {
      loader.style.display = "flex";
    }

    if (submitBtn) {
      submitBtn.disabled = true;
    }
  }

  function hideLoader() {
    isSubmitting = false;

    if (loader) {
      loader.style.display = "none";
    }

    updateSubmitButton();
  }

  /* ==========================
     Form State
  ========================== */

  function getAmount() {
    return Number(amountInput?.value || 0);
  }

  function isValidAmount() {
    const amount = getAmount();

    return (
      Number.isFinite(amount) &&
      amount >= 100 &&
      amount <= 1000000
    );
  }

  function updateSubmitButton() {
    if (!submitBtn) {
      return;
    }

    submitBtn.disabled =
      isSubmitting ||
      !selectedMethod ||
      !isValidAmount();
  }

  /* ==========================
     Payment Method
  ========================== */

  function selectPaymentMethod(method) {
    const normalizedMethod = String(
      method || "",
    )
      .trim()
      .toUpperCase();

    if (
      !allowedMethods.includes(normalizedMethod)
    ) {
      return;
    }

    selectedMethod = normalizedMethod;

    paymentCards.forEach((card) => {
      const cardMethod = String(
        card.dataset.method || "",
      )
        .trim()
        .toUpperCase();

      const isSelected =
        cardMethod === selectedMethod;

      card.classList.toggle(
        "active",
        isSelected,
      );

      card.setAttribute(
        "aria-pressed",
        isSelected ? "true" : "false",
      );
    });

    if (paymentMethodMessage) {
     const methodNames = {
  BKASH: "bKash",
  NAGAD: "Nagad",
};

      paymentMethodMessage.textContent =
        `${methodNames[selectedMethod]} selected`;
    }

    updateSubmitButton();
  }

  paymentCards.forEach((card) => {
    card.disabled = false;

    card.addEventListener("click", () => {
      selectPaymentMethod(
        card.dataset.method,
      );
    });
  });

  /* ==========================
     Amount
  ========================== */

  amountInput?.addEventListener(
    "input",
    updateSubmitButton,
  );

  /* ==========================
     Back
  ========================== */

  backBtn?.addEventListener("click", () => {
    window.location.href = "/lobby";
  });

  /* ==========================
     Gateway Deposit
  ========================== */

  submitBtn?.addEventListener(
    "click",
    async () => {
      if (isSubmitting) {
        return;
      }

      if (!selectedMethod) {
        showToast(
          "Please select bKash or Nagad.",
        );

        return;
      }

      const amount = getAmount();

      if (
        !Number.isFinite(amount) ||
        amount < 100 ||
        amount > 1000000
      ) {
        showToast(
          "Deposit amount must be between ৳100 and ৳10,00,000.",
        );

        amountInput?.focus();

        return;
      }

      showLoader();

      try {
        const response = await fetch(
          "/api/deposits/gateway/create",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",

              Authorization:
                `Bearer ${token}`,
            },

            body: JSON.stringify({
              amount,
              payType: selectedMethod,
            }),
          },
        );

        const result =
          await response
            .json()
            .catch(() => ({
              success: false,
              message:
                "Invalid server response.",
            }));

        if (response.status === 401) {
          localStorage.removeItem(
            "access_token",
          );

          localStorage.removeItem("token");

          localStorage.removeItem(
            "current_user",
          );

          window.location.replace(
            "/login",
          );

          return;
        }

        if (
          !response.ok ||
          !result.success
        ) {
          throw new Error(
            result.message ||
              "Payment gateway could not be opened.",
          );
        }

        const paymentUrl =
          result?.data?.paymentUrl;

        if (!paymentUrl) {
          throw new Error(
            "Payment URL was not received.",
          );
        }

        window.location.href =
          paymentUrl;
      } catch (error) {
        console.error(
          "Gateway deposit error:",
          error,
        );

        showToast(
          error.message ||
            "Could not connect to payment gateway.",
        );

        hideLoader();
      }
    },
  );

  /* ==========================
     Initial State
  ========================== */

  if (loader) {
    loader.style.display = "none";
  }

  updateSubmitButton();
});