const express = require("express");

const {
  createWithdraw,
  myWithdrawHistory
} = require("../controllers/withdraw.controller");

const {
  requireAuth
} = require("../middleware/auth.middleware");

const router = express.Router();


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