const express = require("express");

const {
    getDepositRequests,
    approveDeposit,
    rejectDeposit
} = require(
    "../controllers/admin-deposit.controller"
);

const {
    requireAuth,
    requireAdmin
} = require("../middleware/auth.middleware");

const router = express.Router();

/* ==========================
   সব Deposit Request
========================== */

router.get(
    "/",
    requireAuth,
    requireAdmin,
    getDepositRequests
);

/* ==========================
   Approve Deposit
========================== */

router.patch(
    "/:depositId/approve",
    requireAuth,
    requireAdmin,
    approveDeposit
);

/* ==========================
   Reject Deposit
========================== */

router.patch(
    "/:depositId/reject",
    requireAuth,
    requireAdmin,
    rejectDeposit
);

module.exports = router;