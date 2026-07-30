const express = require("express");

const {
  getPaymentSettings,
  savePaymentSettings,
  getDepositRequests,
  approveDeposit,
  rejectDeposit,
} = require(
  "../controllers/admin-deposit.controller"
);

const {
    requireAuth,
    requireAdmin
} = require("../middleware/auth.middleware");

const router = express.Router();

/* ==========================
   Deposit Payment Settings
========================== */

router.get(
  "/payment-settings",
  requireAuth,
  requireAdmin,
  getPaymentSettings,
);

router.patch(
  "/payment-settings",
  requireAuth,
  requireAdmin,
  savePaymentSettings,
);

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