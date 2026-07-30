"use strict";

const multer =
  require("multer");

const {
  MAX_BANNER_SIZE,
  ALLOWED_IMAGE_TYPES
} = require(
  "../services/lobby-banner.service"
);

const lobbyBannerUpload =
  multer({
    storage:
      multer.memoryStorage(),

    limits: {
      files: 1,

      fileSize:
        MAX_BANNER_SIZE
    },

    fileFilter(
      request,
      file,
      callback
    ) {
      if (
        !ALLOWED_IMAGE_TYPES.has(
          file.mimetype
        )
      ) {
        const error =
          new Error(
            "Only JPG, PNG and WebP banner images are allowed."
          );

        error.statusCode = 400;
        error.code =
          "INVALID_BANNER_IMAGE_TYPE";

        callback(error);

        return;
      }

      callback(null, true);
    }
  });

const uploadLobbyBannerImage =
  lobbyBannerUpload.single(
    "bannerImage"
  );

module.exports = {
  uploadLobbyBannerImage
};