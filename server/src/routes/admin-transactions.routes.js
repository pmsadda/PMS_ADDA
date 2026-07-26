const express = require("express");

const transactionController = require(
  "../controllers/admin-transactions.controller"
);

const router = express.Router();

router.get(
  "/summary",
  transactionController.getTransactionSummary
);

router.get(
  "/",
  transactionController.getTransactions
);

module.exports = router;