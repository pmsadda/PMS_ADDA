"use strict";

const express =
  require("express");

const {
  requireAuth
} = require(
  "../middleware/auth.middleware"
);

const {
  getPublicBanners,
  getPublicBannerImage
} = require(
  "../controllers/lobby-banner.controller"
);

const router =
  express.Router();

router.get(
  "/",
  requireAuth,
  getPublicBanners
);

router.get(
  "/:bannerId/image",
  getPublicBannerImage
);

module.exports = router;