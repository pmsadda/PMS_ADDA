const express = require("express");

const adminDashboardController = require("../controllers/admin-dashboard.controller");

const { requireAuth, requireAdmin } = require("../middleware/auth.middleware");

const router = express.Router();

router.use(
    requireAuth,
    requireAdmin
);

router.get("/stats", adminDashboardController.getDashboardStats);

router.patch(
    "/service-charges",
    adminDashboardController
        .updateServiceCharges
);

module.exports = router;
