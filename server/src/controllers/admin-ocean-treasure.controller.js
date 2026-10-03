"use strict";

const {
  getOceanTreasureSettings,
  updateOceanTreasureSettings,
  getAdminOceanTreasureDashboard,
} = require(
  "../services/ocean-treasure.service",
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
      await getOceanTreasureSettings();

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
      await updateOceanTreasureSettings({
        adminId:
          req.user.id,

        settings:
          req.body || {},
      });

    return res.json({
      success: true,

      message:
        "OceanTreasure settings updated successfully.",

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
      await getAdminOceanTreasureDashboard({
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