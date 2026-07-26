const express = require(
    "express"
);

const adminBotsController = require(
    "../controllers/admin-bots.controller"
);

const {
    requireAuth,
    requireAdmin
} = require(
    "../middleware/auth.middleware"
);

const router = express.Router();

/* সব route শুধু Admin ব্যবহার করবে */

router.use(
    requireAuth,
    requireAdmin
);

/* সব Bot দেখাবে */

router.get(
    "/",
    adminBotsController.getBots
);

/* একটি Bot দেখাবে */

router.get(
    "/:botId",
    adminBotsController.getBotById
);

/* Bot balance পরিবর্তন */

router.patch(
    "/:botId/balance",
    adminBotsController.updateBotBalance
);

/* Bot active / disabled */

router.patch(
    "/:botId/status",
    adminBotsController.updateBotStatus
);

/* Bot difficulty / style */

router.patch(
    "/:botId/settings",
    adminBotsController.updateBotSettings
);

/* Bot balance history */

router.get(
    "/:botId/balance-history",
    adminBotsController.getBalanceHistory
);

module.exports = router;