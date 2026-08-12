const express = require("express");
const multer = require("multer");

const {
  requireAuth,
} = require("../middleware/auth.middleware");

const {
  uploadSingleAvatar,
  MAX_AVATAR_SIZE,
} = require("../middleware/avatar-upload.middleware");

const {
  uploadProfileAvatar,
  getProfileAvatar,
} = require("../controllers/profile-avatar.controller");

const router = express.Router();

const handleAvatarUpload = (request, response, next) => {
  uploadSingleAvatar(request, response, (error) => {
    if (!error) {
      return next();
    }

    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        return response.status(413).json({
          success: false,
          message: `Profile picture must not exceed ${
            MAX_AVATAR_SIZE / 1024 / 1024
          }MB.`,
        });
      }

      return response.status(400).json({
        success: false,
        message:
          error.field ||
          "Only one JPG, PNG or WEBP profile picture is allowed.",
      });
    }

    return response.status(400).json({
      success: false,
      message:
        error.message ||
        "Profile picture upload failed.",
    });
  });
};

router.get(
  "/avatar/:userId",
  getProfileAvatar,
);

router.post(
  "/avatar",
  requireAuth,
  handleAvatarUpload,
  uploadProfileAvatar,
);

module.exports = router;