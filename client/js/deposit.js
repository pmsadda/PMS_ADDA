document.addEventListener("DOMContentLoaded", () => {
    "use strict";

    /* ==========================
       Elements
    ========================== */

    const backBtn =
        document.getElementById("backBtn");

    const balance =
        document.getElementById("balance");

    const amountInput =
        document.getElementById("amount");

    const senderNumberInput =
        document.getElementById("senderNumber");

    const transactionIdInput =
        document.getElementById("transactionId");

    const paymentCards =
        document.querySelectorAll(".payment-card");

    const copyNumberBtn =
        document.getElementById("copyNumberBtn");

    const merchantNumber =
        document.getElementById("merchantNumber");

    const submitBtn =
        document.getElementById("submitDeposit");

    const loader =
        document.getElementById("loaderOverlay");

    const toast =
        document.getElementById("toast");

    const toastMessage =
        document.getElementById("toastMessage");

    const successModal =
        document.getElementById("successModal");

    const successOkBtn =
        document.getElementById("successOkBtn");

    /* ==========================
       Configuration
    ========================== */

  const API_BASE_URL =
    APP_CONFIG.API_URL;
    
    let selectedMethod = "bkash";
    let toastTimer;

    /* ==========================
       Login Data
    ========================== */

    const token =
        localStorage.getItem("access_token");

    const storedUser =
        localStorage.getItem("current_user");

    let currentUser = null;

    try {
        currentUser = storedUser
            ? JSON.parse(storedUser)
            : null;
    } catch (error) {
        currentUser = null;
    }

    if (!token || !currentUser) {
        window.location.replace("login.html");
        return;
    }

    if (balance) {
        balance.textContent =
            Number(
                currentUser.walletBalance || 0
            ).toFixed(2);
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
            submitBtn.disabled = false;
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
            paymentCards.forEach((item) => {
                item.classList.remove("active");
            });

            card.classList.add("active");

            selectedMethod =
                card.dataset.method || "bkash";
        });
    });

    /* ==========================
       Copy Merchant Number
    ========================== */

    copyNumberBtn?.addEventListener(
        "click",
        async () => {
            const number =
                merchantNumber?.textContent.trim();

            if (!number) {
                showToast(
                    "Merchant number পাওয়া যায়নি।"
                );
                return;
            }

            try {
                await navigator.clipboard.writeText(
                    number
                );

                showToast(
                    "Merchant number copied."
                );
            } catch (error) {
                console.error(
                    "Copy failed:",
                    error
                );

                showToast(
                    "Merchant number copy করা যায়নি।"
                );
            }
        }
    );

    /* ==========================
       Submit Deposit
    ========================== */

    submitBtn?.addEventListener(
        "click",
        async () => {
            const amount =
                Number(amountInput.value);

            const senderNumber =
                senderNumberInput.value.trim();

            const transactionNumber =
                transactionIdInput.value
                    .trim()
                    .toUpperCase();

            if (
                !Number.isFinite(amount) ||
                amount < 100
            ) {
                showToast(
                    "Minimum deposit amount ৳100।"
                );

                amountInput.focus();
                return;
            }

            if (
                !/^01[3-9]\d{8}$/.test(
                    senderNumber
                )
            ) {
                showToast(
                    "সঠিক ১১ ডিজিটের Sender Number দিন।"
                );

                senderNumberInput.focus();
                return;
            }

            if (
                transactionNumber.length < 6
            ) {
                showToast(
                    "সঠিক Transaction ID দিন।"
                );

                transactionIdInput.focus();
                return;
            }

            showLoader();

            try {
                const response = await fetch(
                    `${API_BASE_URL}/deposits`,
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json",

                            Authorization:
                                `Bearer ${token}`
                        },

                        body: JSON.stringify({
                            method: selectedMethod,
                            senderNumber,
                            transactionNumber,
                            amount
                        })
                    }
                );

                const result =
                    await response.json();

                if (
                    response.status === 401
                ) {
                    localStorage.removeItem(
                        "access_token"
                    );

                    localStorage.removeItem(
                        "current_user"
                    );

                    window.location.replace(
                        "login.html"
                    );

                    return;
                }

                if (
                    !response.ok ||
                    !result.success
                ) {
                    throw new Error(
                        result.message ||
                        "Deposit request failed."
                    );
                }

                resetForm();

                if (successModal) {
                    successModal.style.display =
                        "flex";
                }
            } catch (error) {
                console.error(
                    "Deposit error:",
                    error
                );

                showToast(
                    error.message ||
                    "Server-এর সঙ্গে সংযোগ করা যায়নি।"
                );
            } finally {
                hideLoader();
            }
        }
    );

    /* ==========================
       Success Modal
    ========================== */

    successOkBtn?.addEventListener(
        "click",
        () => {
            closeSuccessModal();

            showToast(
                "Deposit request pending approval."
            );
        }
    );

    window.addEventListener(
        "click",
        (event) => {
            if (
                event.target === successModal
            ) {
                closeSuccessModal();
            }
        }
    );

    document.addEventListener(
        "keydown",
        (event) => {
            if (event.key === "Escape") {
                closeSuccessModal();
            }
        }
    );
});