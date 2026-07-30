"use strict";

const express =
  require("express");

const {
  requireAuth
} = require(
  "../middleware/auth.middleware"
);

const {
  getPublicBanner,
  getPublicBannerImage
} = require(
  "../controllers/lobby-banner.controller"
);

const router =
  express.Router();

/*
 * Active banner metadata
 * Logged-in Lobby user only
 */

router.get(
  "/",
  requireAuth,
  getPublicBanner
);

/*
 * Active banner image
 *
 * Image URL সরাসরি <img src="">-এ
 * ব্যবহৃত হবে, তাই এখানে Bearer
 * header প্রয়োজন রাখা হচ্ছে না।
 */

router.get(
  "/image",
  getPublicBannerImage
);

module.exports = router;