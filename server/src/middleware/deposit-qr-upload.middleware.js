"use strict";

const multer =
  require("multer");

const MAX_DEPOSIT_QR_SIZE =
  2 * 1024 * 1024;

const ALLOWED_DEPOSIT_QR_TYPES =
  new Set([
    "image/png",
    "image/jpeg",
    "image/webp",
  ]);

const depositQrUpload =
  multer({
    storage:
      multer.memoryStorage(),

    limits: {
      files: 1,

      fileSize:
        MAX_DEPOSIT_QR_SIZE,
    },

    fileFilter(
      request,
      file,
      callback,
    ) {
      if (
        !ALLOWED_DEPOSIT_QR_TYPES.has(
          file.mimetype,
        )
      ) {
        const error =
          new Error(
            "Only PNG, JPG and WebP QR images are allowed.",
          );

        error.statusCode = 400;

        error.code =
          "INVALID_DEPOSIT_QR_TYPE";

        callback(error);

        return;
      }

      callback(null, true);
    },
  });

const uploadDepositQrImage =
  depositQrUpload.single(
    "qrImage",
  );

module.exports = {
  uploadDepositQrImage,

  MAX_DEPOSIT_QR_SIZE,

  ALLOWED_DEPOSIT_QR_TYPES,
};