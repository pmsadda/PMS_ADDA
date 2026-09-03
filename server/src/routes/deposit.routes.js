const express = require("express");

const {
  submitDepositRequest,
  getMyDepositHistory,
  getPaymentMethods,
  getPaymentAccountQr,
  createGatewayPayment,
  gatewayCallback,
} = require("../controllers/deposit.controller");

const {
  requireAuth,
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
   Gateway Payment
========================== */

router.post(
  "/gateway/create",
  requireAuth,
  createGatewayPayment,
);

router.post(
  "/gateway/callback",
  gatewayCallback,
);


/* ==========================
   Submit Deposit Request
========================== */

router.post(
  "/",
  requireAuth,
  submitDepositRequest,
);


/* ==========================
   My Deposit History
========================== */

router.get(
  "/my-history",
  requireAuth,
  getMyDepositHistory,
);

module.exports = router;