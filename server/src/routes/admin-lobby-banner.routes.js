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
  getAdminBanner,
  getAdminBannerImage,
  saveLobbyBanner
} = require(
  "../controllers/lobby-banner.controller"
);

const router =
  express.Router();

/* ==========================
   Admin Authorization
========================== */

router.use(
  requireAuth,
  requireAdmin
);

/* ==========================
   Upload Error Handler
========================== */

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

/* ==========================
   Admin Banner Settings
========================== */

router.get(
  "/",
  getAdminBanner
);

router.get(
  "/image",
  getAdminBannerImage
);

router.patch(
  "/",
  handleBannerUpload,
  saveLobbyBanner
);

module.exports = router;