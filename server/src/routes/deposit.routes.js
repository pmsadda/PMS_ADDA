const express = require("express");

const {
    submitDepositRequest,
    getMyDepositHistory,
    getPaymentMethods,
    getPaymentAccountQr,
} = require(
    "../controllers/deposit.controller"
);

const {
    requireAuth
} = require("../middleware/auth.middleware");

const router = express.Router();


/* ==========================
   Active Payment Methods
========================== */

router.get(
  "/payment-methods",
  requireAuth,
  getPaymentMethods,
);

router.get(
  "/payment-accounts/:accountId/qr",
  requireAuth,
  getPaymentAccountQr,
);

/* ==========================
   Submit Deposit Request
========================== */

router.post(
    "/",
    requireAuth,
    submitDepositRequest
);

/* ==========================
   My Deposit History
========================== */

router.get(
    "/my-history",
    requireAuth,
    getMyDepositHistory
);

module.exports = router;