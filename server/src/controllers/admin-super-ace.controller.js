"use strict";

const {
  getSuperAceSettings,
  updateSuperAceSettings,
  getAdminSuperAceDashboard,
} = require("../services/super-ace.service");

async function getSettings(req, res, next) {
  try {
    const settings =
      await getSuperAceSettings();

    return res.status(200).json({
      success: true,
      data: {
        settings,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function updateSettings(req, res, next) {
  try {
    const settings =
      await updateSuperAceSettings({
        adminId: req.user.id,
        settings: req.body || {},
      });

    return res.status(200).json({
      success: true,
      message: "Super Ace settings updated.",
      data: {
        settings,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function getDashboard(req, res, next) {
  try {
    const dashboard =
      await getAdminSuperAceDashboard({
        limit: req.query?.limit,
      });

    return res.status(200).json({
      success: true,
      data: {
        dashboard,
      },
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getSettings,
  updateSettings,
  getDashboard,
};