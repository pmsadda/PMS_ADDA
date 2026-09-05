const express = require("express");

const {
  createWithdraw,
  myWithdrawHistory,
  jayaPayPayoutCallback,
} = require("../controllers/withdraw.controller");

const {
  requireAuth
} = require("../middleware/auth.middleware");

const router = express.Router();

router.post(
  "/gateway/callback",
  express.json({
    type: "application/json",
  }),
  jayaPayPayoutCallback,
);


/* Create withdraw request */

router.post(
  "/",
  requireAuth,
  createWithdraw
);


/* Get my withdraw history */

router.get(
  "/my-history",
  requireAuth,
  myWithdrawHistory
);


module.exports = router;