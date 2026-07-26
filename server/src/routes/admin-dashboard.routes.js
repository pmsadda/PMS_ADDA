const express = require("express");

const adminDashboardController = require(
    "../controllers/admin-dashboard.controller"
);

const router = express.Router();

router.get(
    "/stats",
    adminDashboardController.getDashboardStats
);

module.exports = router;