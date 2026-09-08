/* ==========================================
   TPL22
   Real Admin Deposit Management
   Part 1/3
========================================== */

document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  const API_BASE_URL = APP_CONFIG.API_URL;

  /* ==========================
       Authentication
    ========================== */

  const token = localStorage.getItem("access_token");

  const storedUser = localStorage.getItem("current_user");

  let currentUser = null;

  try {
    currentUser = storedUser ? JSON.parse(storedUser) : null;
  } catch (error) {
    currentUser = null;
  }

  if (!token || !currentUser || currentUser.role !== "admin") {
    window.location.replace("../pages/login.html");

    return;
  }

  /* ==========================
       Main Elements
    ========================== */

  const adminSidebar = document.getElementById("adminSidebar");

  const sidebarToggle = document.getElementById("sidebarToggle");

  const sidebarOverlay = document.getElementById("sidebarOverlay");

  const adminLogoutBtn = document.getElementById("adminLogoutBtn");

  const refreshDeposits = document.getElementById("refreshDeposits");

  const depositSearch = document.getElementById("depositSearch");

  const statusFilter = document.getElementById("statusFilter");

  const methodFilter = document.getElementById("methodFilter");

  const clearFilters = document.getElementById("clearFilters");

  const depositTableBody = document.getElementById("depositTableBody");

  const emptyState = document.getElementById("emptyState");

  /* ==========================
   Payment Rotation Elements
========================== */

  const paymentRotationPanel = document.getElementById("paymentRotationPanel");

  const refreshPaymentManagement = document.getElementById(
    "refreshPaymentManagement",
  );

  const paymentMethodTabs = document.getElementById("paymentMethodTabs");

  const paymentMethodTabButtons = Array.from(
    document.querySelectorAll("[data-deposit-method]"),
  );

  const paymentRotationMode = document.getElementById("paymentRotationMode");

  const paymentRotationInterval = document.getElementById(
    "paymentRotationInterval",
  );

  const binanceRateField = document.getElementById("binanceRateField");

  const paymentBdtPerUsdt = document.getElementById("paymentBdtPerUsdt");

  const currentPaymentAccount = document.getElementById(
    "currentPaymentAccount",
  );

  const nextRotationText = document.getElementById("nextRotationText");

  const savePaymentRotation = document.getElementById("savePaymentRotation");

  const rotatePaymentNow = document.getElementById("rotatePaymentNow");

  const openPaymentAccountForm = document.getElementById(
    "openPaymentAccountForm",
  );

  const paymentAccountForm = document.getElementById("paymentAccountForm");

  const closePaymentAccountForm = document.getElementById(
    "closePaymentAccountForm",
  );

  const cancelPaymentAccount = document.getElementById("cancelPaymentAccount");

  const paymentAccountFormTitle = document.getElementById(
    "paymentAccountFormTitle",
  );

  const paymentAccountId = document.getElementById("paymentAccountId");

  const paymentAccountMethod = document.getElementById("paymentAccountMethod");

  const paymentAccountDisplayName = document.getElementById(
    "paymentAccountDisplayName",
  );

  const paymentAccountIdentifierLabel = document.getElementById(
    "paymentAccountIdentifierLabel",
  );

  const paymentAccountIdentifier = document.getElementById(
    "paymentAccountIdentifier",
  );

  const paymentAccountType = document.getElementById("paymentAccountType");

  const paymentAccountStatus = document.getElementById("paymentAccountStatus");

  const paymentAccountSortOrder = document.getElementById(
    "paymentAccountSortOrder",
  );

  const paymentQrUploadField = document.getElementById("paymentQrUploadField");

  const paymentQrImageInput = document.getElementById("paymentQrImageInput");

  const paymentQrPreview = document.getElementById("paymentQrPreview");

  const paymentQrPreviewImage = document.getElementById(
    "paymentQrPreviewImage",
  );

  const savePaymentAccount = document.getElementById("savePaymentAccount");

  const paymentAccountListTitle = document.getElementById(
    "paymentAccountListTitle",
  );

  const paymentAccountCount = document.getElementById("paymentAccountCount");

  const paymentAccountList = document.getElementById("paymentAccountList");

  const paymentManagementStatus = document.getElementById(
    "paymentManagementStatus",
  );

  /* ==========================
       Summary Elements
    ========================== */

  const pendingDepositCount = document.getElementById("pendingDepositCount");

  const approvedTodayCount = document.getElementById("approvedTodayCount");

  const rejectedTodayCount = document.getElementById("rejectedTodayCount");

  const approvedAmountToday = document.getElementById("approvedAmountToday");

  const pendingDepositMenuCount = document.getElementById(
    "pendingDepositMenuCount",
  );

  /* ==========================
       Details Modal
    ========================== */

  const detailsModal = document.getElementById("detailsModal");

  const closeDetailsModal = document.getElementById("closeDetailsModal");

  const detailUser = document.getElementById("detailUser");

  const detailUserId = document.getElementById("detailUserId");

  const detailMethod = document.getElementById("detailMethod");

  const detailSender = document.getElementById("detailSender");

  const detailTransactionId = document.getElementById("detailTransactionId");

  const detailAmount = document.getElementById("detailAmount");

  const detailDate = document.getElementById("detailDate");

  const detailStatus = document.getElementById("detailStatus");

  /* ==========================
       Approve Modal
    ========================== */

  const approveModal = document.getElementById("approveModal");

  const closeApproveModal = document.getElementById("closeApproveModal");

  const cancelApprove = document.getElementById("cancelApprove");

  const confirmApprove = document.getElementById("confirmApprove");

  const approveRequestId = document.getElementById("approveRequestId");

  /* ==========================
       Reject Modal
    ========================== */

  const rejectModal = document.getElementById("rejectModal");

  const closeRejectModal = document.getElementById("closeRejectModal");

  const cancelReject = document.getElementById("cancelReject");

  const confirmReject = document.getElementById("confirmReject");

  const rejectRequestId = document.getElementById("rejectRequestId");

  const rejectReason = document.getElementById("rejectReason");

  const rejectNote = document.getElementById("rejectNote");

  /* ==========================
       Loader and Toast
    ========================== */

  const loaderOverlay = document.getElementById("loaderOverlay");

  const toast = document.getElementById("toast");

  const toastMessage = document.getElementById("toastMessage");

  /* ==========================
       State
    ========================== */

  let deposits = [];

  let selectedDepositId = null;

  let paymentManagement = {
    accounts: [],
    rotations: [],
  };

  let selectedPaymentMethod = "bkash";

  let editingPaymentAccountId = null;

  let isPaymentManagementBusy = false;

  let paymentQrPreviewUrl = null;

  let toastTimer = null;

  let searchTimer = null;

  /* ==========================
       Helper Functions
    ========================== */

  function showLoader() {
    if (loaderOverlay) {
      loaderOverlay.style.display = "flex";

      loaderOverlay.setAttribute("aria-hidden", "false");
    }
  }

  function hideLoader() {
    if (loaderOverlay) {
      loaderOverlay.style.display = "none";

      loaderOverlay.setAttribute("aria-hidden", "true");
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
    }, 2800);
  }

  function openModal(modal) {
    if (!modal) {
      return;
    }

    modal.style.display = "flex";

    modal.setAttribute("aria-hidden", "false");
  }

  function closeModal(modal) {
    if (!modal) {
      return;
    }

    modal.style.display = "none";

    modal.setAttribute("aria-hidden", "true");
  }

  function formatMoney(value) {
    return Number(value || 0).toLocaleString("en-BD", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function formatDate(value) {
    if (!value) {
      return "-";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "-";
    }

    return date.toLocaleString("en-BD", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function getInitials(name) {
    return String(name || "User")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase();
  }

  async function apiRequest(endpoint, options = {}) {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,

      headers: {
        "Content-Type": "application/json",

        Authorization: `Bearer ${token}`,

        ...(options.headers || {}),
      },
    });

    const result = await response.json().catch(() => ({
      success: false,
      message: "Invalid server response.",
    }));

    if (response.status === 401) {
      localStorage.removeItem("access_token");

      localStorage.removeItem("current_user");

      window.location.replace("../pages/login.html");

      throw new Error("Login session expired.");
    }

    if (response.status === 403) {
      throw new Error("Admin access is required.");
    }

    if (!response.ok || !result.success) {
      throw new Error(result.message || "Request failed.");
    }

    return result;
  }

  /* ==========================
   Payment Account Management
========================== */

  const PAYMENT_METHOD_NAMES = Object.freeze({
    bkash: "bKash",
    nagad: "Nagad",
    rocket: "Rocket",
    binance: "Binance Pay",
  });

  function formatPaymentMethodName(method) {
    return (
      PAYMENT_METHOD_NAMES[String(method || "").toLowerCase()] ||
      String(method || "")
    );
  }

  function normalizePaymentAccount(account, fallbackMethod = "") {
    return {
      id: Number(
        account?.id || account?.accountId || account?.paymentAccountId || 0,
      ),

      method: String(account?.method || fallbackMethod || "").toLowerCase(),

      displayName: String(account?.displayName || account?.name || ""),

      accountIdentifier: String(
        account?.accountIdentifier ||
          account?.accountNumber ||
          account?.identifier ||
          "",
      ),

      accountType: String(account?.accountType || "personal").toLowerCase(),

      status: String(account?.status || "disabled").toLowerCase(),

      sortOrder: Number(account?.sortOrder || 0),

      qrImageUrl: String(account?.qrImageUrl || account?.qrUrl || ""),

      isCurrent: Boolean(account?.isCurrent),

      updatedAt: account?.updatedAt || null,
    };
  }

  function normalizePaymentRotation(rotation, fallbackMethod = "") {
    return {
      method: String(rotation?.method || fallbackMethod || "").toLowerCase(),

      rotationMode: String(
        rotation?.rotationMode || rotation?.mode || "auto",
      ).toLowerCase(),

      rotationIntervalMinutes: Number(
        rotation?.rotationIntervalMinutes || rotation?.intervalMinutes || 10,
      ),

      currentAccountId: Number(rotation?.currentAccountId || 0),

      bdtPerUsdt: Number(rotation?.bdtPerUsdt || rotation?.exchangeRate || 0),

      lastRotatedAt: rotation?.lastRotatedAt || null,

      nextRotationAt: rotation?.nextRotationAt || null,

      updatedAt: rotation?.updatedAt || null,
    };
  }

  function normalizePaymentManagement(result) {
    const data =
      result?.data?.management ||
      result?.data?.paymentManagement ||
      result?.data ||
      {};

    let accounts = data.accounts || data.paymentAccounts || [];

    let rotations =
      data.rotations || data.paymentRotations || data.rotationSettings || [];

    const methodGroups = Array.isArray(data.methods)
      ? data.methods
      : Array.isArray(data.paymentMethods)
        ? data.paymentMethods
        : [];

    if (!Array.isArray(accounts) || accounts.length === 0) {
      accounts = methodGroups.flatMap((methodGroup) => {
        const method = String(methodGroup?.method || "").toLowerCase();

        return (
          methodGroup?.accounts ||
          methodGroup?.paymentAccounts ||
          []
        ).map((account) => ({
          ...account,
          method: account?.method || method,
        }));
      });
    }

    if (!Array.isArray(rotations) || rotations.length === 0) {
      rotations = methodGroups
        .map((methodGroup) => {
          const method = String(methodGroup?.method || "").toLowerCase();

          const nestedRotation =
            methodGroup?.rotation || methodGroup?.paymentRotation;

          const rotation =
            nestedRotation || (methodGroup?.rotationMode ? methodGroup : null);

          if (!rotation) {
            return null;
          }

          return {
            ...rotation,

            method: rotation?.method || method,
          };
        })
        .filter(Boolean);
    }

    return {
      accounts: Array.isArray(accounts)
        ? accounts
            .map((account) => normalizePaymentAccount(account))
            .filter(
              (account) =>
                account.id > 0 &&
                Object.hasOwn(PAYMENT_METHOD_NAMES, account.method),
            )
        : [],

      rotations: Array.isArray(rotations)
        ? rotations.map((rotation) => normalizePaymentRotation(rotation))
        : [],
    };
  }

  function getSelectedPaymentAccounts() {
    return paymentManagement.accounts
      .filter((account) => account.method === selectedPaymentMethod)
      .sort(
        (firstAccount, secondAccount) =>
          firstAccount.sortOrder - secondAccount.sortOrder ||
          firstAccount.id - secondAccount.id,
      );
  }

  function getSelectedPaymentRotation() {
    return (
      paymentManagement.rotations.find(
        (rotation) => rotation.method === selectedPaymentMethod,
      ) ||
      normalizePaymentRotation(
        {
          method: selectedPaymentMethod,
        },
        selectedPaymentMethod,
      )
    );
  }

  function setPaymentManagementBusy(isBusy) {
    isPaymentManagementBusy = isBusy;

    paymentRotationPanel?.classList.toggle("is-busy", isBusy);

    paymentRotationPanel
      ?.querySelectorAll("button, input, select")
      .forEach((element) => {
        element.disabled = isBusy;
      });

    if (refreshPaymentManagement) {
      refreshPaymentManagement.innerHTML = isBusy
        ? `
            <i class="fa-solid fa-spinner fa-spin"></i>
            Working...
          `
        : `
            <i class="fa-solid fa-rotate"></i>
            Refresh
          `;
    }
  }

  function clearPaymentQrPreview() {
    if (paymentQrPreviewUrl) {
      URL.revokeObjectURL(paymentQrPreviewUrl);

      paymentQrPreviewUrl = null;
    }

    if (paymentQrPreview) {
      paymentQrPreview.hidden = true;
    }

    if (paymentQrPreviewImage) {
      paymentQrPreviewImage.removeAttribute("src");
    }

    if (paymentQrImageInput) {
      paymentQrImageInput.value = "";
    }
  }

  function showPaymentQrPreview(source) {
    if (!paymentQrPreview || !paymentQrPreviewImage || !source) {
      clearPaymentQrPreview();

      return;
    }

    paymentQrPreviewImage.src = source;

    paymentQrPreview.hidden = false;
  }

  function closePaymentAccountEditor() {
    editingPaymentAccountId = null;

    paymentAccountForm?.reset();

    if (paymentAccountId) {
      paymentAccountId.value = "";
    }

    if (paymentAccountMethod) {
      paymentAccountMethod.value = selectedPaymentMethod;
    }

    clearPaymentQrPreview();

    if (paymentAccountForm) {
      paymentAccountForm.hidden = true;
    }
  }

  function configurePaymentAccountForm(account = null) {
    const method = account?.method || selectedPaymentMethod;

    const isBinance = method === "binance";

    editingPaymentAccountId = account?.id || null;

    if (paymentAccountForm) {
      paymentAccountForm.hidden = false;
    }

    if (paymentAccountFormTitle) {
      paymentAccountFormTitle.textContent = account
        ? "Edit Receiving Account"
        : "Add New Account";
    }

    if (paymentAccountId) {
      paymentAccountId.value = account?.id || "";
    }

    if (paymentAccountMethod) {
      paymentAccountMethod.value = method;
    }

    if (paymentAccountDisplayName) {
      paymentAccountDisplayName.value =
        account?.displayName || `${formatPaymentMethodName(method)} Account`;
    }

    if (paymentAccountIdentifierLabel) {
      paymentAccountIdentifierLabel.textContent = isBinance
        ? "Binance Pay ID"
        : "Account Number";
    }

    if (paymentAccountIdentifier) {
      paymentAccountIdentifier.value = account?.accountIdentifier || "";

      paymentAccountIdentifier.placeholder = isBinance
        ? "Enter Binance Pay ID"
        : "01XXXXXXXXX";

      paymentAccountIdentifier.maxLength = isBinance ? 120 : 11;

      paymentAccountIdentifier.inputMode = isBinance ? "text" : "numeric";
    }

    if (paymentAccountType) {
      paymentAccountType.value = isBinance
        ? "pay_id"
        : account?.accountType || "personal";

      paymentAccountType.disabled = isBinance;
    }

    if (paymentAccountStatus) {
      paymentAccountStatus.value = account?.status || "active";
    }

    if (paymentAccountSortOrder) {
      paymentAccountSortOrder.value = Number(account?.sortOrder || 0);
    }

    if (paymentQrUploadField) {
      paymentQrUploadField.hidden = !isBinance;
    }

    clearPaymentQrPreview();

    if (isBinance && account?.qrImageUrl) {
      showPaymentQrPreview(account.qrImageUrl);
    }

    paymentAccountForm?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });

    paymentAccountDisplayName?.focus();
  }

  function renderPaymentAccountList() {
    const accounts = getSelectedPaymentAccounts();

    const rotation = getSelectedPaymentRotation();

    const currentAccount =
      accounts.find(
        (account) =>
          account.id === rotation.currentAccountId || account.isCurrent,
      ) || null;

    if (paymentAccountListTitle) {
      paymentAccountListTitle.textContent = `${formatPaymentMethodName(
        selectedPaymentMethod,
      )} Accounts`;
    }

    if (paymentAccountCount) {
      paymentAccountCount.textContent = `${accounts.length} ${
        accounts.length === 1 ? "Account" : "Accounts"
      }`;
    }

    if (currentPaymentAccount) {
      currentPaymentAccount.textContent = currentAccount
        ? `${currentAccount.displayName} — ${currentAccount.accountIdentifier}`
        : "No active account selected";
    }

    if (paymentRotationMode) {
      paymentRotationMode.value =
        rotation.rotationMode === "manual" ? "manual" : "auto";
    }

    if (paymentRotationInterval) {
      paymentRotationInterval.value = Math.max(
        1,
        Number(rotation.rotationIntervalMinutes || 10),
      );

      paymentRotationInterval.disabled = rotation.rotationMode === "manual";
    }

    const isBinance = selectedPaymentMethod === "binance";

    if (binanceRateField) {
      binanceRateField.hidden = !isBinance;
    }

    if (paymentBdtPerUsdt) {
      paymentBdtPerUsdt.value =
        isBinance && rotation.bdtPerUsdt > 0 ? rotation.bdtPerUsdt : "";
    }

    if (nextRotationText) {
      if (rotation.rotationMode === "manual") {
        nextRotationText.textContent =
          "Manual mode: account শুধু Rotate Now চাপলে বদলাবে।";
      } else if (rotation.nextRotationAt) {
        nextRotationText.textContent = `Next rotation: ${formatDate(
          rotation.nextRotationAt,
        )}`;
      } else {
        nextRotationText.textContent = "Auto rotation will start after saving.";
      }
    }

    const activeAccountCount = accounts.filter(
      (account) => account.status === "active",
    ).length;

    if (rotatePaymentNow) {
      rotatePaymentNow.disabled =
        isPaymentManagementBusy || activeAccountCount < 2;
    }

    if (!paymentAccountList) {
      return;
    }

    if (accounts.length === 0) {
      paymentAccountList.innerHTML = `
      <div class="payment-account-empty">
        <i class="fa-solid fa-wallet"></i>

        <p>
          এই method-এর কোনো receiving account নেই।
        </p>
      </div>
    `;

      return;
    }

    paymentAccountList.innerHTML = accounts
      .map((account) => {
        const isCurrent =
          account.id === rotation.currentAccountId || account.isCurrent;

        return `
          <article
            class="
              payment-account-card
              ${isCurrent ? "is-current" : ""}
              ${account.status === "disabled" ? "is-disabled" : ""}
            "
          >
            <div class="payment-account-card-header">

              <div>
                <strong>
                  ${escapeHtml(account.displayName)}
                </strong>

                <span>
                  ${escapeHtml(formatPaymentMethodName(account.method))}
                </span>
              </div>

              <span
                class="
                  payment-account-status
                  ${account.status === "disabled" ? "disabled" : ""}
                "
              >
                ${escapeHtml(account.status)}
              </span>

            </div>

            <div class="payment-account-identifier">
              ${escapeHtml(account.accountIdentifier)}
            </div>

            <div class="payment-account-meta">
              <span>
                ${escapeHtml(account.accountType)}
              </span>

              <span>
                Order:
                ${Number(account.sortOrder)}
              </span>
            </div>

            ${
              isCurrent
                ? `
                  <span class="current-account-badge">
                    <i class="fa-solid fa-circle-check"></i>
                    Current Account
                  </span>
                `
                : ""
            }

            <div class="payment-account-actions">

              <button
                type="button"
                class="edit-payment-account"
                data-payment-action="edit"
                data-account-id="${account.id}"
              >
                <i class="fa-solid fa-pen"></i>
                Edit
              </button>

              <button
                type="button"
                class="delete-payment-account"
                data-payment-action="delete"
                data-account-id="${account.id}"
              >
                <i class="fa-solid fa-trash"></i>
                Delete
              </button>

            </div>
          </article>
        `;
      })
      .join("");
  }

  function renderPaymentManagement() {
    paymentMethodTabButtons.forEach((button) => {
      const isActive = button.dataset.depositMethod === selectedPaymentMethod;

      button.classList.toggle("is-active", isActive);

      button.setAttribute("aria-selected", String(isActive));
    });

    renderPaymentAccountList();

    if (paymentManagementStatus) {
      const latestUpdate = [
        ...paymentManagement.accounts.map((account) => account.updatedAt),

        ...paymentManagement.rotations.map((rotation) => rotation.updatedAt),
      ]
        .filter(Boolean)
        .sort()
        .at(-1);

      paymentManagementStatus.textContent = latestUpdate
        ? `Last updated: ${formatDate(latestUpdate)}`
        : "Payment management loaded.";
    }
  }

  async function loadPaymentManagement(showSuccessMessage = false) {
    if (isPaymentManagementBusy) {
      return;
    }

    setPaymentManagementBusy(true);

    try {
      const result = await apiRequest("/admin/deposits/payment-management");

      paymentManagement = normalizePaymentManagement(result);

      renderPaymentManagement();

      if (showSuccessMessage) {
        showToast("Payment management refreshed.");
      }
    } catch (error) {
      console.error("Load payment management error:", error);

      showToast(error.message);

      if (paymentManagementStatus) {
        paymentManagementStatus.textContent =
          "Payment management load করা যায়নি।";
      }
    } finally {
      setPaymentManagementBusy(false);

      renderPaymentManagement();
    }
  }

  async function saveSelectedPaymentRotation() {
    const rotationMode = paymentRotationMode?.value;

    const rotationIntervalMinutes = Number(paymentRotationInterval?.value);

    const bdtPerUsdt = Number(paymentBdtPerUsdt?.value || 0);

    if (!["auto", "manual"].includes(rotationMode)) {
      showToast("সঠিক rotation mode নির্বাচন করুন।");

      return;
    }

    if (
      !Number.isInteger(rotationIntervalMinutes) ||
      rotationIntervalMinutes < 1 ||
      rotationIntervalMinutes > 1440
    ) {
      showToast("Rotation time 1 থেকে 1440 মিনিটের মধ্যে দিন।");

      paymentRotationInterval?.focus();

      return;
    }

    if (
      selectedPaymentMethod === "binance" &&
      (!Number.isFinite(bdtPerUsdt) || bdtPerUsdt <= 0)
    ) {
      showToast("সঠিক BDT Per USDT rate দিন।");

      paymentBdtPerUsdt?.focus();

      return;
    }

    setPaymentManagementBusy(true);

    try {
      await apiRequest(
        `/admin/deposits/payment-management/${encodeURIComponent(
          selectedPaymentMethod,
        )}/rotation`,
        {
          method: "PATCH",

          body: JSON.stringify({
            rotationMode,

            rotationIntervalMinutes,

            bdtPerUsdt: selectedPaymentMethod === "binance" ? bdtPerUsdt : null,
          }),
        },
      );

      showToast("Rotation settings saved.");
    } catch (error) {
      console.error("Save rotation error:", error);

      showToast(error.message);
    } finally {
      setPaymentManagementBusy(false);

      await loadPaymentManagement();
    }
  }

  async function rotateSelectedPaymentMethod() {
    const activeAccounts = getSelectedPaymentAccounts().filter(
      (account) => account.status === "active",
    );

    if (activeAccounts.length < 2) {
      showToast("Rotate করতে কমপক্ষে ২টি active account প্রয়োজন।");

      return;
    }

    const shouldRotate = window.confirm(
      `${formatPaymentMethodName(
        selectedPaymentMethod,
      )} receiving account এখনই পরিবর্তন করবেন?`,
    );

    if (!shouldRotate) {
      return;
    }

    setPaymentManagementBusy(true);

    try {
      await apiRequest(
        `/admin/deposits/payment-management/${encodeURIComponent(
          selectedPaymentMethod,
        )}/rotate`,
        {
          method: "POST",
        },
      );

      showToast("Receiving account rotated successfully.");
    } catch (error) {
      console.error("Rotate account error:", error);

      showToast(error.message);
    } finally {
      setPaymentManagementBusy(false);

      await loadPaymentManagement();
    }
  }

  function collectPaymentAccountPayload() {
    const method = String(
      paymentAccountMethod?.value || selectedPaymentMethod,
    ).toLowerCase();

    const displayName = String(paymentAccountDisplayName?.value || "").trim();

    const accountIdentifier = String(
      paymentAccountIdentifier?.value || "",
    ).trim();

    const accountType =
      method === "binance"
        ? "pay_id"
        : String(paymentAccountType?.value || "personal").toLowerCase();

    const status = String(
      paymentAccountStatus?.value || "active",
    ).toLowerCase();

    const sortOrder = Number(paymentAccountSortOrder?.value || 0);

    if (!Object.hasOwn(PAYMENT_METHOD_NAMES, method)) {
      throw new Error("Invalid payment method.");
    }

    if (displayName.length < 2 || displayName.length > 30) {
      throw new Error("Display name 2 থেকে 30 characters-এর মধ্যে দিন।");
    }

    if (method === "binance") {
      if (accountIdentifier.length < 3 || accountIdentifier.length > 120) {
        throw new Error("সঠিক Binance Pay ID দিন।");
      }
    } else if (!/^01\d{9}$/.test(accountIdentifier)) {
      throw new Error("সঠিক ১১ ডিজিটের account number দিন।");
    }

    if (!["personal", "agent", "merchant", "pay_id"].includes(accountType)) {
      throw new Error("Invalid account type.");
    }

    if (!["active", "disabled"].includes(status)) {
      throw new Error("Invalid account status.");
    }

    if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 9999) {
      throw new Error("Display order 0 থেকে 9999-এর মধ্যে দিন।");
    }

    return {
      method,
      displayName,
      accountIdentifier,
      accountType,
      status,
      sortOrder,
    };
  }

  async function uploadPaymentAccountQr(accountId, file) {
    if (!file) {
      return;
    }

    const formData = new FormData();

    formData.append("qrImage", file);

    const response = await fetch(
      `${API_BASE_URL}/admin/deposits/payment-accounts/${encodeURIComponent(
        accountId,
      )}/qr`,
      {
        method: "POST",

        headers: {
          Authorization: `Bearer ${token}`,
        },

        body: formData,
      },
    );

    const result = await response.json().catch(() => ({
      success: false,
      message: "Invalid QR upload response.",
    }));

    if (response.status === 401) {
      localStorage.removeItem("access_token");

      localStorage.removeItem("current_user");

      window.location.replace("../pages/login.html");

      throw new Error("Login session expired.");
    }

    if (!response.ok || !result.success) {
      throw new Error(result.message || "QR image upload failed.");
    }
  }

  async function savePaymentAccountRecord() {
    let payload;

    try {
      payload = collectPaymentAccountPayload();
    } catch (error) {
      showToast(error.message);

      return;
    }

    const accountId = Number(
      editingPaymentAccountId || paymentAccountId?.value || 0,
    );

    const qrFile = paymentQrImageInput?.files?.[0] || null;

    if (qrFile && qrFile.size > 2 * 1024 * 1024) {
      showToast("QR image maximum 2 MB হতে পারবে।");

      return;
    }

    setPaymentManagementBusy(true);

    try {
      const endpoint =
        accountId > 0
          ? `/admin/deposits/payment-accounts/${accountId}`
          : "/admin/deposits/payment-accounts";

      const result = await apiRequest(endpoint, {
        method: accountId > 0 ? "PATCH" : "POST",

        body: JSON.stringify(payload),
      });

      const savedAccount =
        result.data?.account || result.data?.paymentAccount || result.data;

      const savedAccountId = Number(
        savedAccount?.id || savedAccount?.accountId || accountId || 0,
      );

      if (qrFile && savedAccountId > 0) {
        await uploadPaymentAccountQr(savedAccountId, qrFile);
      }

      closePaymentAccountEditor();

      showToast(
        accountId > 0 ? "Payment account updated." : "Payment account added.",
      );
    } catch (error) {
      console.error("Save payment account error:", error);

      showToast(error.message);
    } finally {
      setPaymentManagementBusy(false);

      await loadPaymentManagement();
    }
  }

  async function deletePaymentAccountRecord(accountId) {
    const account = paymentManagement.accounts.find(
      (item) => item.id === accountId,
    );

    if (!account) {
      showToast("Payment account পাওয়া যায়নি।");

      return;
    }

    const shouldDelete = window.confirm(
      `${account.displayName} (${account.accountIdentifier}) delete করবেন?`,
    );

    if (!shouldDelete) {
      return;
    }

    setPaymentManagementBusy(true);

    try {
      await apiRequest(`/admin/deposits/payment-accounts/${accountId}`, {
        method: "DELETE",
      });

      showToast("Payment account deleted.");
    } catch (error) {
      console.error("Delete payment account error:", error);

      showToast(error.message);
    } finally {
      setPaymentManagementBusy(false);

      await loadPaymentManagement();
    }
  }

  /* ==========================
       Summary Render
    ========================== */

  function renderSummary(summary) {
    if (pendingDepositCount) {
      pendingDepositCount.textContent = summary.pending || 0;
    }

    if (approvedTodayCount) {
      approvedTodayCount.textContent = summary.approved || 0;
    }

    if (rejectedTodayCount) {
      rejectedTodayCount.textContent = summary.rejected || 0;
    }

    if (approvedAmountToday) {
      approvedAmountToday.textContent = formatMoney(summary.approvedAmount);
    }

    if (pendingDepositMenuCount) {
      pendingDepositMenuCount.textContent = summary.pending || 0;
    }
  }

  /* ==========================
       Deposit Table Render
    ========================== */

  function renderDepositTable() {
    if (!depositTableBody) {
      return;
    }

    if (deposits.length === 0) {
      depositTableBody.innerHTML = "";

      const tableWrapper = depositTableBody.closest(".table-wrapper");

      if (tableWrapper) {
        tableWrapper.style.display = "none";
      }

      if (emptyState) {
        emptyState.style.display = "block";
      }

      return;
    }

    const tableWrapper = depositTableBody.closest(".table-wrapper");

    if (tableWrapper) {
      tableWrapper.style.display = "block";
    }

    if (emptyState) {
      emptyState.style.display = "none";
    }

    depositTableBody.innerHTML = deposits
      .map((deposit) => {
        const canProcess = deposit.status === "pending";

        return `
                    <tr class="deposit-row">

                        <td>
                            <div class="user-cell">

                                <div class="user-avatar">
                                    ${escapeHtml(getInitials(deposit.fullName))}
                                </div>

                                <div>
                                    <strong>
                                        ${escapeHtml(deposit.fullName)}
                                    </strong>

                                    <span>
                                        UID:
                                        ${escapeHtml(deposit.userUid)}
                                    </span>
                                </div>

                            </div>
                        </td>

                        <td>
                            <span
                                class="method-badge
                                ${escapeHtml(deposit.method)}"
                            >
                                ${escapeHtml(deposit.method.toUpperCase())}
                            </span>
                        </td>

                        <td>
                            ${escapeHtml(deposit.senderNumber)}
                        </td>

                        <td>
                            <button
    type="button"
    class="copy-value-btn"
    data-copy="${escapeHtml(
      deposit.gatewayOrderId || deposit.transactionNumber || deposit.depositId,
    )}"
>
    ${escapeHtml(
      deposit.gatewayOrderId || deposit.transactionNumber || deposit.depositId,
    )}

    <i class="fa-regular fa-copy"></i>
</button>
                        </td>

                        <td>
                            <strong class="amount-value">
                                ৳${formatMoney(deposit.amount)}
                            </strong>
                        </td>

                        <td>
                            ${escapeHtml(formatDate(deposit.createdAt))}
                        </td>

                        <td>
                            <span
                                class="status-badge
                                ${escapeHtml(deposit.status)}"
                            >
                                ${escapeHtml(
                                  deposit.status.charAt(0).toUpperCase() +
                                    deposit.status.slice(1),
                                )}
                            </span>
                        </td>

                        <td>
                            <div class="action-buttons">

                                <button
                                    type="button"
                                    class="view-btn"
                                    data-action="view"
                                    data-id="${escapeHtml(deposit.depositId)}"
                                    title="View details"
                                >
                                    <i class="fa-solid fa-eye"></i>
                                </button>

                                ${
                                  canProcess
                                    ? `
                                        <button
                                            type="button"
                                            class="approve-btn"
                                            data-action="approve"
                                            data-id="${escapeHtml(
                                              deposit.depositId,
                                            )}"
                                            title="Approve deposit"
                                        >
                                            <i class="fa-solid fa-check"></i>
                                        </button>

                                        <button
                                            type="button"
                                            class="reject-btn"
                                            data-action="reject"
                                            data-id="${escapeHtml(
                                              deposit.depositId,
                                            )}"
                                            title="Reject deposit"
                                        >
                                            <i class="fa-solid fa-xmark"></i>
                                        </button>
                                        `
                                    : ""
                                }

                            </div>
                        </td>

                    </tr>
                `;
      })
      .join("");
  }

  /* ==========================
       Load Deposit Requests
    ========================== */

  async function loadDeposits(showLoading = true) {
    if (showLoading) {
      showLoader();
    }

    try {
      const params = new URLSearchParams();

      params.set("status", statusFilter?.value || "all");

      params.set("method", methodFilter?.value || "all");

      const search = depositSearch?.value.trim();

      if (search) {
        params.set("search", search);
      }

      const result = await apiRequest(`/admin/deposits?${params.toString()}`);

      deposits = result.data.deposits || [];

      renderSummary(result.data.summary || {});

      renderDepositTable();
    } catch (error) {
      console.error("Load deposits error:", error);

      showToast(error.message);

      deposits = [];

      renderDepositTable();
    } finally {
      if (showLoading) {
        hideLoader();
      }
    }
  }

  loadDeposits();
  loadPaymentManagement();
  /* ==========================
       Find Deposit
    ========================== */

  function findDeposit(depositId) {
    return deposits.find((deposit) => deposit.depositId === depositId);
  }

  /* ==========================
       Open Details Modal
    ========================== */

  function openDepositDetails(deposit) {
    if (!deposit) {
      return;
    }

    detailUser.textContent = deposit.fullName || "-";

    detailUserId.textContent = deposit.userUid || "-";

    detailMethod.textContent = String(deposit.method || "-").toUpperCase();

    detailSender.textContent = deposit.senderNumber || "-";

    detailTransactionId.textContent = deposit.transactionNumber || "-";

    detailAmount.textContent = `৳${formatMoney(deposit.amount)}`;

    detailDate.textContent = formatDate(deposit.createdAt);

    detailStatus.textContent =
      String(deposit.status || "-")
        .charAt(0)
        .toUpperCase() + String(deposit.status || "-").slice(1);

    openModal(detailsModal);
  }

  /* ==========================
       Dynamic Table Actions
    ========================== */

  depositTableBody?.addEventListener("click", async (event) => {
    const actionButton = event.target.closest("[data-action]");

    const copyButton = event.target.closest(".copy-value-btn");

    if (copyButton) {
      const value = copyButton.dataset.copy || "";

      if (!value) {
        return;
      }

      try {
        await navigator.clipboard.writeText(value);

        showToast("Transaction ID copied.");
      } catch (error) {
        console.error("Copy failed:", error);

        showToast("Transaction ID copy করা যায়নি।");
      }

      return;
    }

    if (!actionButton) {
      return;
    }

    const action = actionButton.dataset.action;

    const depositId = actionButton.dataset.id;

    const deposit = findDeposit(depositId);

    if (!deposit) {
      showToast("Deposit request পাওয়া যায়নি।");

      return;
    }

    if (action === "view") {
      openDepositDetails(deposit);
      return;
    }

    if (action === "approve") {
      selectedDepositId = deposit.depositId;

      approveRequestId.textContent = deposit.depositId;

      openModal(approveModal);
      return;
    }

    if (action === "reject") {
      selectedDepositId = deposit.depositId;

      rejectRequestId.textContent = deposit.depositId;

      rejectReason.value = "";
      rejectNote.value = "";

      openModal(rejectModal);
    }
  });

  /* ==========================
       Search
    ========================== */

  depositSearch?.addEventListener("input", () => {
    window.clearTimeout(searchTimer);

    searchTimer = window.setTimeout(() => {
      loadDeposits(false);
    }, 450);
  });

  /* ==========================
       Filters
    ========================== */

  statusFilter?.addEventListener("change", () => {
    loadDeposits();
  });

  methodFilter?.addEventListener("change", () => {
    loadDeposits();
  });

  clearFilters?.addEventListener("click", () => {
    if (depositSearch) {
      depositSearch.value = "";
    }

    if (statusFilter) {
      statusFilter.value = "all";
    }

    if (methodFilter) {
      methodFilter.value = "all";
    }

    loadDeposits();

    showToast("Filters cleared.");
  });

  /* ==========================
   Payment Management Events
========================== */

  paymentMethodTabs?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-deposit-method]");

    if (!button || isPaymentManagementBusy) {
      return;
    }

    const method = String(button.dataset.depositMethod || "").toLowerCase();

    if (!Object.hasOwn(PAYMENT_METHOD_NAMES, method)) {
      return;
    }

    selectedPaymentMethod = method;

    closePaymentAccountEditor();

    renderPaymentManagement();
  });

  paymentRotationMode?.addEventListener("change", () => {
    if (paymentRotationInterval) {
      paymentRotationInterval.disabled = paymentRotationMode.value === "manual";
    }

    if (nextRotationText) {
      nextRotationText.textContent =
        paymentRotationMode.value === "manual"
          ? "Manual mode: account শুধু Rotate Now চাপলে বদলাবে।"
          : "Save করলে automatic rotation schedule চালু হবে।";
    }
  });

  refreshPaymentManagement?.addEventListener("click", async () => {
    await loadPaymentManagement(true);
  });

  savePaymentRotation?.addEventListener("click", async () => {
    await saveSelectedPaymentRotation();
  });

  rotatePaymentNow?.addEventListener("click", async () => {
    await rotateSelectedPaymentMethod();
  });

  openPaymentAccountForm?.addEventListener("click", () => {
    configurePaymentAccountForm();
  });

  closePaymentAccountForm?.addEventListener("click", closePaymentAccountEditor);

  cancelPaymentAccount?.addEventListener("click", closePaymentAccountEditor);

  paymentAccountForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    await savePaymentAccountRecord();
  });

  paymentAccountList?.addEventListener("click", async (event) => {
    const actionButton = event.target.closest("[data-payment-action]");

    if (!actionButton || isPaymentManagementBusy) {
      return;
    }

    const accountId = Number(actionButton.dataset.accountId || 0);

    if (!Number.isInteger(accountId) || accountId < 1) {
      showToast("Invalid payment account.");

      return;
    }

    const action = actionButton.dataset.paymentAction;

    if (action === "edit") {
      const account = paymentManagement.accounts.find(
        (item) => item.id === accountId,
      );

      if (!account) {
        showToast("Payment account পাওয়া যায়নি।");

        return;
      }

      configurePaymentAccountForm(account);

      return;
    }

    if (action === "delete") {
      await deletePaymentAccountRecord(accountId);
    }
  });

  paymentQrImageInput?.addEventListener("change", () => {
    const file = paymentQrImageInput.files?.[0] || null;

    clearPaymentQrPreview();

    if (!file) {
      return;
    }

    const allowedTypes = ["image/png", "image/jpeg", "image/webp"];

    if (!allowedTypes.includes(file.type)) {
      showToast("QR image শুধু PNG, JPG অথবা WebP হতে পারবে।");

      paymentQrImageInput.value = "";

      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      showToast("QR image maximum 2 MB হতে পারবে।");

      paymentQrImageInput.value = "";

      return;
    }

    paymentQrPreviewUrl = URL.createObjectURL(file);

    showPaymentQrPreview(paymentQrPreviewUrl);
  });

  /* ==========================
       Refresh
    ========================== */

  refreshDeposits?.addEventListener("click", () => {
    loadDeposits();

    showToast("Deposit requests refreshed.");
  });

  /* ==========================
       Details Modal Close
    ========================== */

  closeDetailsModal?.addEventListener("click", () => {
    closeModal(detailsModal);
  });

  /* ==========================
       Approve Modal Close
    ========================== */

  closeApproveModal?.addEventListener("click", () => {
    closeModal(approveModal);

    selectedDepositId = null;
  });

  cancelApprove?.addEventListener("click", () => {
    closeModal(approveModal);

    selectedDepositId = null;
  });

  /* ==========================
       Reject Modal Close
    ========================== */

  closeRejectModal?.addEventListener("click", () => {
    closeModal(rejectModal);

    selectedDepositId = null;
  });

  cancelReject?.addEventListener("click", () => {
    closeModal(rejectModal);

    selectedDepositId = null;
  });
  /* ==========================
       Approve Deposit
    ========================== */

  confirmApprove?.addEventListener("click", async () => {
    if (!selectedDepositId) {
      return;
    }

    confirmApprove.disabled = true;
    closeModal(approveModal);
    showLoader();

    try {
      await apiRequest(
        `/admin/deposits/${encodeURIComponent(selectedDepositId)}/approve`,
        {
          method: "PATCH",
        },
      );

      showToast("Deposit approved successfully.");

      selectedDepositId = null;

      await loadDeposits(false);
    } catch (error) {
      console.error("Approve deposit error:", error);

      showToast(error.message);
    } finally {
      hideLoader();
      confirmApprove.disabled = false;
    }
  });

  /* ==========================
       Reject Deposit
    ========================== */

  confirmReject?.addEventListener("click", async () => {
    if (!selectedDepositId) {
      return;
    }

    const reason = rejectReason?.value || "";

    const note = rejectNote?.value.trim() || "";

    if (!reason) {
      showToast("Reject reason নির্বাচন করো।");

      rejectReason?.focus();
      return;
    }

    confirmReject.disabled = true;
    closeModal(rejectModal);
    showLoader();

    try {
      await apiRequest(
        `/admin/deposits/${encodeURIComponent(selectedDepositId)}/reject`,
        {
          method: "PATCH",

          body: JSON.stringify({
            reason,
            note,
          }),
        },
      );

      showToast("Deposit rejected successfully.");

      selectedDepositId = null;

      if (rejectReason) {
        rejectReason.value = "";
      }

      if (rejectNote) {
        rejectNote.value = "";
      }

      await loadDeposits(false);
    } catch (error) {
      console.error("Reject deposit error:", error);

      showToast(error.message);
    } finally {
      hideLoader();
      confirmReject.disabled = false;
    }
  });

  /* ==========================
       Logout
    ========================== */

  adminLogoutBtn?.addEventListener("click", () => {
    const shouldLogout = window.confirm("Are you sure you want to logout?");

    if (!shouldLogout) {
      return;
    }

    localStorage.removeItem("access_token");

    localStorage.removeItem("current_user");

    window.location.replace("../pages/login.html");
  });

  /* ==========================
       Sidebar
    ========================== */

  function openSidebar() {
    adminSidebar?.classList.add("open");
    sidebarOverlay?.classList.add("show");
  }

  function closeSidebar() {
    adminSidebar?.classList.remove("open");
    sidebarOverlay?.classList.remove("show");
  }

  sidebarToggle?.addEventListener("click", () => {
    const isOpen = adminSidebar?.classList.contains("open");

    if (isOpen) {
      closeSidebar();
    } else {
      openSidebar();
    }
  });

  sidebarOverlay?.addEventListener("click", closeSidebar);

  /* ==========================
       Outside Click
    ========================== */

  window.addEventListener("click", (event) => {
    if (event.target === detailsModal) {
      closeModal(detailsModal);
    }

    if (event.target === approveModal) {
      closeModal(approveModal);
      selectedDepositId = null;
    }

    if (event.target === rejectModal) {
      closeModal(rejectModal);
      selectedDepositId = null;
    }
  });

  /* ==========================
       ESC Key
    ========================== */

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }

    closeModal(detailsModal);
    closeModal(approveModal);
    closeModal(rejectModal);
    closeSidebar();
    closePaymentAccountEditor();

    selectedDepositId = null;
  });

  /* ==========================
       Resize Cleanup
    ========================== */

  window.addEventListener("resize", () => {
    if (window.innerWidth > 992) {
      closeSidebar();
    }
  });

  console.log("TPL22 Real Admin Deposits Loaded Successfully");
});
