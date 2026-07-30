"use strict";

const express =
  require("express");

const transactionController =
  require(
    "../controllers/admin-transactions.controller"
  );

const {
  requireAuth,
  requireAdmin
} = require(
  "../middleware/auth.middleware"
);

const router =
  express.Router();

/*
 * Financial summary এবং transaction
 * list authenticated Admin-only।
 */

router.use(
  requireAuth,
  requireAdmin
);

router.get(
  "/summary",
  transactionController
    .getTransactionSummary
);

router.get(
  "/",
  transactionController
    .getTransactions
);

module.exports = router;