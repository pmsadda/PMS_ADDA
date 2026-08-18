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
  requireAdmin
} = require(
  "../middleware/auth.middleware"
);

const controller =
  require(
    "../controllers/admin-agent.controller"
  );

const router =
  express.Router();

const agentManagementLimiter =
  rateLimit({
    windowMs:
      60 * 1000,

    limit:
      60,

    standardHeaders:
      "draft-8",

    legacyHeaders:
      false,

    message: {
      success: false,
      code:
        "AGENT_MANAGEMENT_RATE_LIMIT",
      message:
        "Too many Agent management requests."
    }
  });

router.use(
  requireAuth,
  requireAdmin,
  agentManagementLimiter
);

router.get(
  "/",
  controller.listAgents
);

router.post(
  "/",
  controller.addAgent
);

router.patch(
  "/:agentId/status",
  controller.changeAgentStatus
);

module.exports =
  router;