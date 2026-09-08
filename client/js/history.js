/* ==========================================
   TPL22
   Transaction History JS
   Part 1/3
========================================== */

document.addEventListener("DOMContentLoaded", () => {

    /* ==========================
       Elements
    ========================== */

    const backBtn =
        document.getElementById("backBtn");

    const walletBalance =
        document.getElementById("walletBalance");

    const filterButtons =
        document.querySelectorAll(".filter-btn");

    const searchInput =
        document.getElementById("searchInput");

    const transactionList =
        document.getElementById("transactionList");

    const transactionCards =
        Array.from(
            document.querySelectorAll(".transaction-card")
        );

    const transactionModal =
        document.getElementById("transactionModal");

    const closeModal =
        document.getElementById("closeModal");

    const emptyState =
        document.getElementById("emptyState");

    const loaderOverlay =
        document.getElementById("loaderOverlay");

    const toast =
        document.getElementById("toast");

    const toastMessage =
        document.getElementById("toastMessage");

    const fromDate =
        document.getElementById("fromDate");

    const toDate =
        document.getElementById("toDate");

    const applyDateFilter =
        document.getElementById("applyDateFilter");

    const refreshHistory =
        document.getElementById("refreshHistory");

    /* Modal Detail Fields */

    const detailType =
        document.getElementById("detailType");

    const detailId =
        document.getElementById("detailId");

    const detailAmount =
        document.getElementById("detailAmount");

    const detailStatus =
        document.getElementById("detailStatus");

    const detailDate =
        document.getElementById("detailDate");

    /* ==========================
       State
    ========================== */

    let activeFilter = "all";

    const user = {
        balance: 0
    };

    walletBalance.textContent =
        user.balance.toFixed(2);

    /* ==========================
       Helper Functions
    ========================== */

    function showLoader() {

        loaderOverlay.style.display = "flex";

    }

    function hideLoader() {

        loaderOverlay.style.display = "none";

    }

    function showToast(message) {

        toastMessage.textContent = message;

        toast.style.display = "block";

        window.setTimeout(() => {

            toast.style.display = "none";

        }, 2500);

    }

    function normalizeText(value) {

        return value
            .toLowerCase()
            .replace(/\s+/g, " ")
            .trim();

    }

    /* ==========================
       Back Button
    ========================== */

    backBtn.addEventListener("click", () => {

        window.history.back();

    });
        /* ==========================
       Filter + Search Logic
    ========================== */

    function updateTransactionVisibility() {

        const searchValue =
            normalizeText(searchInput.value);

        let visibleCount = 0;

        transactionCards.forEach((card) => {

            const cardType =
                card.dataset.type || "";

            const cardText =
                normalizeText(card.textContent);

            const matchesFilter =
                activeFilter === "all" ||
                cardType === activeFilter;

            const matchesSearch =
                searchValue === "" ||
                cardText.includes(searchValue);

            const shouldShow =
                matchesFilter && matchesSearch;

            card.style.display =
                shouldShow ? "flex" : "none";

            if (shouldShow) {
                visibleCount += 1;
            }

        });

        emptyState.style.display =
            visibleCount === 0 ? "block" : "none";

        transactionList.style.display =
            visibleCount === 0 ? "none" : "";

    }

    /* ==========================
       Filter Buttons
    ========================== */

    filterButtons.forEach((button) => {

        button.addEventListener("click", () => {

            filterButtons.forEach((item) => {

                item.classList.remove("active");

            });

            button.classList.add("active");

            activeFilter =
                button.dataset.filter || "all";

            updateTransactionVisibility();

        });

    });

    /* ==========================
       Search Input
    ========================== */

    searchInput.addEventListener(
        "input",
        updateTransactionVisibility
    );

    /* ==========================
       Transaction Modal
    ========================== */

    transactionCards.forEach((card) => {

        card.addEventListener("click", () => {

            const type =
                card.querySelector(
                    ".transaction-info h3"
                )?.textContent.trim() || "Transaction";

            const transactionId =
                card.querySelector(
                    ".transaction-info p"
                )?.textContent.trim() || "N/A";

            const date =
                card.querySelector(
                    ".transaction-info small"
                )?.textContent.trim() || "N/A";

            const amount =
                card.querySelector(
                    ".transaction-right h4"
                )?.textContent.trim() || "৳0";

            const status =
                card.querySelector(
                    ".status"
                )?.textContent.trim() || "Unknown";

            detailType.textContent = type;

            detailId.textContent = transactionId;

            detailDate.textContent = date;

            detailAmount.textContent = amount;

            detailStatus.textContent = status;

            transactionModal.style.display =
                "flex";

        });

    });

    closeModal.addEventListener("click", () => {

        transactionModal.style.display =
            "none";

    });

        /* ==========================
       Date Filter
    ========================== */

    applyDateFilter.addEventListener("click", () => {

        const startDate = fromDate.value;
        const endDate = toDate.value;

        if (!startDate || !endDate) {

            showToast("Please select both dates.");

            return;
        }

        if (startDate > endDate) {

            showToast("From date cannot be after To date.");

            return;
        }

        /*
        এখন Transaction Card-এ আসল ISO Date নেই,
        তাই UI Validation পর্যন্ত কাজ করবে।

        Backend যুক্ত হলে প্রতিটি transaction object-এ
        createdAt date থাকবে এবং এখানে আসল filter হবে।
        */

        showLoader();

        window.setTimeout(() => {

            hideLoader();

            showToast("Date filter applied.");

        }, 800);

    });

    /* ==========================
       Refresh History
    ========================== */

    refreshHistory.addEventListener("click", () => {

        showLoader();

        window.setTimeout(() => {

            hideLoader();

            searchInput.value = "";

            fromDate.value = "";

            toDate.value = "";

            activeFilter = "all";

            filterButtons.forEach((button) => {

                button.classList.toggle(
                    "active",
                    button.dataset.filter === "all"
                );

            });

            updateTransactionVisibility();

            showToast("Transaction history refreshed.");

        }, 1000);

    });

    /* ==========================
       Modal Outside Click
    ========================== */

    window.addEventListener("click", (event) => {

        if (event.target === transactionModal) {

            transactionModal.style.display = "none";

        }

    });

    /* ==========================
       ESC Key Close
    ========================== */

    document.addEventListener("keydown", (event) => {

        if (event.key === "Escape") {

            transactionModal.style.display = "none";

        }

    });

    /* ==========================
       Initial Render
    ========================== */

    updateTransactionVisibility();

    /* ==========================
       Future Backend Integration
    ========================== */

    /*
        GET /api/transactions

        Example Response:

        {
            success: true,
            walletBalance: 4500,
            summary: {
                totalDeposit: 25000,
                totalWithdraw: 8500,
                totalWin: 13450,
                totalLoss: 7300
            },
            transactions: [
                {
                    id: "DEP784512369",
                    type: "deposit",
                    title: "Deposit",
                    amount: 2000,
                    status: "success",
                    createdAt: "2026-07-16T10:45:00Z"
                }
            ]
        }

        Backend Responsibilities:
        - User authentication check
        - Pagination
        - Type filtering
        - Date filtering
        - Search by transaction/game ID
        - Summary calculation
    */

    console.log(
        "TPL22 Transaction History Loaded Successfully"
    );

});