const express = require("express");

const {
  getPaymentSettings,
  savePaymentSettings,

  getPaymentManagement,
  savePaymentRotation,
  rotatePaymentNow,

  addPaymentAccount,
  editPaymentAccount,
  deletePaymentAccount,

  getDepositRequests,
  approveDeposit,
  rejectDeposit,
} = require(
  "../controllers/admin-deposit.controller",
);

const {
    requireAuth,
    requireAdmin
} = require("../middleware/auth.middleware");

const {
  uploadDepositQrImage,
} = require(
  "../middleware/deposit-qr-upload.middleware",
);

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
   Payment Account Management
========================== */

router.get(
  "/payment-management",
  requireAuth,
  requireAdmin,
  getPaymentManagement,
);

router.get(
  "/payment-accounts/:accountId/qr",
  getPaymentAccountQr,
);

router.patch(
  "/payment-management/:method/rotation",
  requireAuth,
  requireAdmin,
  savePaymentRotation,
);

router.post(
  "/payment-management/:method/rotate",
  requireAuth,
  requireAdmin,
  rotatePaymentNow,
);

router.post(
  "/payment-accounts",
  requireAuth,
  requireAdmin,
  addPaymentAccount,
);

router.patch(
  "/payment-accounts/:accountId",
  requireAuth,
  requireAdmin,
  editPaymentAccount,
);

router.delete(
  "/payment-accounts/:accountId",
  requireAuth,
  requireAdmin,
  deletePaymentAccount,
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