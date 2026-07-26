/* ==========================================
   PMS ADDA
   Withdraw JS
   Backend Connected
========================================== */

document.addEventListener("DOMContentLoaded", () => {

    const API_BASE_URL =
    APP_CONFIG.API_URL;

    const backBtn = document.getElementById("backBtn");
    const balance = document.getElementById("balance");

    const paymentCards =
        document.querySelectorAll(".payment-card");

    const accountNumber =
        document.getElementById("accountNumber");

    const withdrawAmount =
        document.getElementById("withdrawAmount");

    const lastFourDigit =
        document.getElementById("lastFourDigit");

    const submitWithdraw =
        document.getElementById("submitWithdraw");

    const confirmModal =
        document.getElementById("confirmModal");

    const cancelWithdraw =
        document.getElementById("cancelWithdraw");

    const confirmWithdraw =
        document.getElementById("confirmWithdraw");

    const loader =
        document.getElementById("loaderOverlay");

    const successModal =
        document.getElementById("successModal");

    const failedModal =
        document.getElementById("failedModal");

    const successOkBtn =
        document.getElementById("successOkBtn");

    const failedOkBtn =
        document.getElementById("failedOkBtn");

    const toast =
        document.getElementById("toast");

    const toastMessage =
        document.getElementById("toastMessage");

    const failedMessage =
        document.getElementById("failedMessage");

    const token =
        localStorage.getItem("access_token");

    let selectedMethod = "bkash";

    let currentBalance = 0;

    let pendingWithdrawData = null;


    /* ==========================
       Login Check
    ========================== */

    if (!token) {
        window.location.replace("login.html");
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

    async function loadCurrentUser() {
        try {
            const response = await fetch(
                `${API_URL}/auth/me`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
            );

            const result = await response.json();

            if (response.status === 401) {
                localStorage.removeItem("access_token");
                localStorage.removeItem("current_user");

                window.location.replace("login.html");
                return;
            }

            if (!response.ok || !result.success) {
                throw new Error(
                    result.message || "User data load failed."
                );
            }

            const user = result.data.user;

            currentBalance =
                Number(user.walletBalance || 0);

            balance.textContent =
                currentBalance.toFixed(2);

            localStorage.setItem(
                "current_user",
                JSON.stringify(user)
            );

        } catch (error) {
            console.error(error);

            showToast(
                error.message || "Balance load failed."
            );
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

            selectedMethod =
                card.dataset.method;
        });

    });


    /* ==========================
       Submit Withdraw
    ========================== */

    submitWithdraw.addEventListener("click", () => {

        const account =
            accountNumber.value.trim();

        const amount =
            Number(withdrawAmount.value);

        const last4 =
            lastFourDigit.value.trim();

        if (!/^01\d{9}$/.test(account)) {
            showToast(
                "সঠিক ১১ সংখ্যার মোবাইল নম্বর দিন।"
            );

            accountNumber.focus();
            return;
        }

        if (!amount || amount < 100) {
            showToast(
                "Minimum withdraw ৳100."
            );

            withdrawAmount.focus();
            return;
        }

        if (amount > currentBalance) {
            showToast(
                "Wallet balance পর্যাপ্ত নয়।"
            );

            withdrawAmount.focus();
            return;
        }

        if (!/^\d{4}$/.test(last4)) {
            showToast(
                "শেষ ৪টি সংখ্যা সঠিকভাবে দিন।"
            );

            lastFourDigit.focus();
            return;
        }

        pendingWithdrawData = {
            method: selectedMethod,
            accountNumber: account,
            amount: amount,
            lastFourDigits: last4
        };

        document.getElementById(
            "confirmMethod"
        ).textContent =
            selectedMethod.toUpperCase();

        document.getElementById(
            "confirmAccount"
        ).textContent =
            account;

        document.getElementById(
            "confirmAmount"
        ).textContent =
            amount.toFixed(2);

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

    confirmWithdraw.addEventListener(
        "click",
        async () => {

            if (!pendingWithdrawData) {
                return;
            }

            confirmModal.style.display = "none";

            showLoader();

            confirmWithdraw.disabled = true;

            try {
                const response = await fetch(
                    `${API_URL}/withdraws`,
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json",

                            Authorization:
                                `Bearer ${token}`
                        },

                        body: JSON.stringify(
                            pendingWithdrawData
                        )
                    }
                );

                const result =
                    await response.json();

                if (response.status === 401) {
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

                if (!response.ok || !result.success) {
                    throw new Error(
                        result.message ||
                        "Withdraw request failed."
                    );
                }

                const withdraw =
                    result.data.withdraw;

                currentBalance =
                    Number(
                        withdraw.remainingBalance
                    );

                balance.textContent =
                    currentBalance.toFixed(2);

                successModal.style.display =
                    "flex";

                pendingWithdrawData = null;

            } catch (error) {
                console.error(error);

                showFailed(
                    error.message ||
                    "Withdraw request failed."
                );

            } finally {
                hideLoader();

                confirmWithdraw.disabled =
                    false;
            }
        }
    );


    /* ==========================
       Success Button
    ========================== */

    successOkBtn.addEventListener(
        "click",
        () => {

            successModal.style.display =
                "none";

            accountNumber.value = "";
            withdrawAmount.value = "";
            lastFourDigit.value = "";

            showToast(
                "Withdrawal request submitted."
            );

            loadCurrentUser();
        }
    );


    /* ==========================
       Failed Button
    ========================== */

    failedOkBtn.addEventListener(
        "click",
        () => {

            failedModal.style.display =
                "none";
        }
    );


    /* ==========================
       Close Modals
    ========================== */

    window.addEventListener(
        "click",
        (event) => {

            if (event.target === confirmModal) {
                confirmModal.style.display =
                    "none";
            }

            if (event.target === successModal) {
                successModal.style.display =
                    "none";
            }

            if (event.target === failedModal) {
                failedModal.style.display =
                    "none";
            }
        }
    );


    /* ==========================
       ESC Key
    ========================== */

    document.addEventListener(
        "keydown",
        (event) => {

            if (event.key === "Escape") {
                confirmModal.style.display =
                    "none";

                successModal.style.display =
                    "none";

                failedModal.style.display =
                    "none";
            }
        }
    );


    /* ==========================
       Start Page
    ========================== */

    loadCurrentUser();

    console.log(
        "Withdraw API Connected Successfully"
    );

});