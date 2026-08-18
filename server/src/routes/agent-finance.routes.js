"use strict";

const express =
  require("express");

const {
  rateLimit
} = require(
  "express-rate-limit"
);

const {
  requireAuth,
  requireAgent
} = require(
  "../middleware/auth.middleware"
);

const controller =
  require(
    "../controllers/agent-finance.controller"
  );

const router =
  express.Router();

const agentFinanceLimiter =
  rateLimit({
    windowMs:
      60 * 1000,

    limit:
      120,

    standardHeaders:
      "draft-8",

    legacyHeaders:
      false,

    message: {
      success: false,
      code:
        "AGENT_FINANCE_RATE_LIMIT",
      message:
        "Too many Agent finance requests."
    }
  });

router.use(
  requireAuth,
  requireAgent,
  agentFinanceLimiter
);

/* Deposit */

router.get(
  "/deposits",
  controller.listDeposits
);

router.patch(
  "/deposits/:depositId/approve",
  controller.approveDeposit
);

router.patch(
  "/deposits/:depositId/reject",
  controller.rejectDeposit
);

/* Withdrawal */

router.get(
  "/withdrawals",
  controller.listWithdrawals
);

router.patch(
  "/withdrawals/:id/approve",
  controller.approveWithdrawal
);

router.patch(
  "/withdrawals/:id/reject",
  controller.rejectWithdrawal
);

module.exports =
  router;