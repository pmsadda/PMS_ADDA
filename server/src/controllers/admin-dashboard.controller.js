const adminDashboardService = require("../services/admin-dashboard.service");

async function getDashboardStats(req, res) {
  try {
    const stats = await adminDashboardService.getDashboardStats();

    return res.status(200).json({
      success: true,
      message: "Dashboard statistics loaded successfully.",
      data: stats,
    });
  } catch (error) {
    console.error("Admin dashboard statistics error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load dashboard statistics.",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
}

async function updateServiceCharges(req, res, next) {
  try {
    const serviceCharges = await adminDashboardService.updateServiceCharges(
      req.body,
      req.user?.id || null,
    );

    return res.status(200).json({
      success: true,

      message: "Service charges updated successfully.",

      data: {
        serviceCharges,
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getDashboardStats,
  updateServiceCharges,
};
