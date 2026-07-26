const express = require("express");

const {
    submitDepositRequest,
    getMyDepositHistory
} = require("../controllers/deposit.controller");

const {
    requireAuth
} = require("../middleware/auth.middleware");

const router = express.Router();

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