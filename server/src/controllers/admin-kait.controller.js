"use strict";

const {
  getAdminDashboard,
  updateSettings
} = require(
  "../services/admin-kait.service"
);


/* =========================================================
   GET ADMIN KAIT DASHBOARD
========================================================= */

async function getKaitAdminDashboard(
  request,
  response,
  next
) {
  try {
    const data =
      await getAdminDashboard();

    return response
      .status(200)
      .json({
        success: true,
        data
      });

  } catch (error) {
    return next(error);
  }
}


/* =========================================================
   UPDATE KAIT SETTINGS
========================================================= */

async function updateKaitSettings(
  request,
  response,
  next
) {
  try {
    const data =
      await updateSettings(
        request.body
      );

    return response
      .status(200)
      .json({
        success: true,

        message:
          "Kait settings updated successfully.",

        data
      });

  } catch (error) {
    return next(error);
  }
}


/* =========================================================
   EXPORT
========================================================= */

module.exports = {
  getKaitAdminDashboard,
  updateKaitSettings
};