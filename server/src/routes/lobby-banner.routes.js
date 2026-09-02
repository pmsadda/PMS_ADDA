"use strict";

const express =
  require("express");

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
  getPublicBanners
);

router.get(
  "/:bannerId/image",
  getPublicBannerImage
);

module.exports = router;