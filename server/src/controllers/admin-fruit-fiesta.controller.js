"use strict";

const {
  getFruitFiestaSettings,
  updateFruitFiestaSettings,
  getAdminFruitFiestaDashboard,
} = require(
  "../services/fruit-fiesta.service",
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
      await getFruitFiestaSettings();

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
      await updateFruitFiestaSettings({
        adminId:
          req.user.id,

        settings:
          req.body || {},
      });

    return res.json({
      success: true,

      message:
        "FruitFiesta settings updated successfully.",

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
      await getAdminFruitFiestaDashboard({
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