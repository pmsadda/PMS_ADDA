"use strict";

const express = require("express");
const multer = require("multer");
const { rateLimit } = require("express-rate-limit");

const {
  requireAuth,
  requireAdmin,
} = require("../middleware/auth.middleware");

const {
  getAdminAppSettings,
  getAppInfo,
  uploadApk,
  updateAppSettings,
  downloadApk,
} = require("../controllers/app-download.controller");

const router = express.Router();


/* =========================================================
   MULTER — APK UPLOAD
========================================================= */

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 100 * 1024 * 1024,
    files: 1,
  },

  fileFilter(req, file, callback) {
    const fileName =
      String(
        file.originalname || "",
      ).toLowerCase();

    if (!fileName.endsWith(".apk")) {
      return callback(
        new Error(
          "Only APK files are allowed.",
        ),
      );
    }

    callback(null, true);
  },
});


/* =========================================================
   RATE LIMIT
========================================================= */

const publicLimiter =
  rateLimit({
    windowMs:
      60 * 1000,

    limit: 120,

    standardHeaders: true,

    legacyHeaders: false,
  });


const adminLimiter =
  rateLimit({
    windowMs:
      60 * 1000,

    limit: 60,

    standardHeaders: true,

    legacyHeaders: false,
  });


/* =========================================================
   PUBLIC
========================================================= */

router.get(
  "/info",
  publicLimiter,
  getAppInfo,
);


router.get(
  "/download",
  publicLimiter,
  downloadApk,
);


/* =========================================================
   ADMIN
========================================================= */

router.get(
  "/admin/settings",
  requireAuth,
  requireAdmin,
  adminLimiter,
  getAdminAppSettings,
);


router.put(
  "/admin/settings",
  requireAuth,
  requireAdmin,
  adminLimiter,
  express.json(),
  updateAppSettings,
);


router.post(
  "/admin/upload",
  requireAuth,
  requireAdmin,
  adminLimiter,
  upload.single("apk"),
  uploadApk,
);


/* =========================================================
   MULTER ERROR
========================================================= */

router.use(
  (
    error,
    req,
    res,
    next,
  ) => {
    if (
      error instanceof
      multer.MulterError
    ) {
      return res
        .status(400)
        .json({
          success: false,

          code:
            "APK_UPLOAD_ERROR",

          message:
            error.code ===
            "LIMIT_FILE_SIZE"
              ? "APK cannot exceed 100 MB."
              : error.message,
        });
    }

    if (
      error?.message ===
      "Only APK files are allowed."
    ) {
      return res
        .status(400)
        .json({
          success: false,

          code:
            "INVALID_APK_FILE",

          message:
            error.message,
        });
    }

    next(error);
  },
);


module.exports = router;