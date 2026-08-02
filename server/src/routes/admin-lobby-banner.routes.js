"use strict";

const express =
  require("express");

const multer =
  require("multer");

const {
  requireAuth,
  requireAdmin
} = require(
  "../middleware/auth.middleware"
);

const {
  uploadLobbyBannerImage
} = require(
  "../middleware/lobby-banner-upload.middleware"
);

const {
  getAdminBanners,
  getAdminBannerImage,
  createLobbyBanner,
  updateLobbyBanner,
  deleteLobbyBanner
} = require(
  "../controllers/lobby-banner.controller"
);

const router =
  express.Router();

router.use(
  requireAuth,
  requireAdmin
);

function handleBannerUpload(
  request,
  response,
  next
) {
  uploadLobbyBannerImage(
    request,
    response,
    (error) => {
      if (!error) {
        next();
        return;
      }

      if (
        error instanceof
        multer.MulterError
      ) {
        if (
          error.code ===
          "LIMIT_FILE_SIZE"
        ) {
          return response
            .status(400)
            .json({
              success: false,

              message:
                "Banner image cannot exceed 3 MB."
            });
        }

        return response
          .status(400)
          .json({
            success: false,

            message:
              error.message ||
              "Banner image upload failed."
          });
      }

      return response
        .status(
          error.statusCode ||
          400
        )
        .json({
          success: false,

          message:
            error.message ||
            "Banner image upload failed."
        });
    }
  );
}

router.get(
  "/",
  getAdminBanners
);

router.get(
  "/:bannerId/image",
  getAdminBannerImage
);

router.post(
  "/",
  handleBannerUpload,
  createLobbyBanner
);

router.patch(
  "/:bannerId",
  handleBannerUpload,
  updateLobbyBanner
);

router.delete(
  "/:bannerId",
  deleteLobbyBanner
);

module.exports = router;