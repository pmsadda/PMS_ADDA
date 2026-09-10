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

async function updateSignupBonusSettings(req, res, next) {
  try {
    const signupBonusSettings =
      await adminDashboardService.updateSignupBonusSettings(
        req.body,
        req.user?.id || null,
      );

    return res.status(200).json({
      success: true,

      message: "Signup bonus settings updated successfully.",

      data: {
        signupBonusSettings,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function updateWithdrawSettings(req, res, next) {
  try {
    const withdrawSettings =
      await adminDashboardService.updateWithdrawSettings(
        req.body,
        req.user?.id || null,
      );

    return res.status(200).json({
      success: true,

      message: "Withdrawal settings updated successfully.",

      data: {
        withdrawSettings,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function updateReferralSettings(req, res, next) {
  try {
    const referralSettings = await adminDashboardService.updateReferralSettings(
      req.body,
      req.user?.id || null,
    );

    return res.status(200).json({
      success: true,

      message: "Referral settings updated successfully.",

      data: {
        referralSettings,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function updateFirstDepositBonusSettings(req, res, next) {
  try {
    const firstDepositBonusSettings =
      await adminDashboardService.updateFirstDepositBonusSettings(
        req.body,
        req.user?.id || null,
      );

    return res.status(200).json({
      success: true,

      message: "First deposit bonus settings updated successfully.",

      data: {
        firstDepositBonusSettings,
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getDashboardStats,
  updateServiceCharges,
  updateSignupBonusSettings,
  updateWithdrawSettings,
  updateReferralSettings,
  updateFirstDepositBonusSettings,
};;
