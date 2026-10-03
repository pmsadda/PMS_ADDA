"use strict";

const {
  getGemFortuneSettings,
  updateGemFortuneSettings,
  getAdminGemFortuneDashboard,
} = require(
  "../services/gem-fortune.service",
);

/* ==========================
   Get Settings
========================== */

async function getSettings(
  req,
  res,
  next,
) {
  try {
    const settings =
      await getGemFortuneSettings();

    return res.json({
      success: true,

      data: {
        settings,
      },
    });
  } catch (error) {
    next(error);
  }
}

/* ==========================
   Update Settings
========================== */

async function updateSettings(
  req,
  res,
  next,
) {
  try {
    const settings =
      await updateGemFortuneSettings({
        adminId:
          req.user.id,

        settings:
          req.body || {},
      });

    return res.json({
      success: true,

      message:
        "GemFortune settings updated successfully.",

      data: {
        settings,
      },
    });
  } catch (error) {
    next(error);
  }
}

/* ==========================
   Dashboard / History
========================== */

async function getDashboard(
  req,
  res,
  next,
) {
  try {
    const dashboard =
      await getAdminGemFortuneDashboard({
        limit:
          req.query?.limit,
      });

    return res.json({
      success: true,

      data: {
        dashboard,
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getSettings,
  updateSettings,
  getDashboard,
};