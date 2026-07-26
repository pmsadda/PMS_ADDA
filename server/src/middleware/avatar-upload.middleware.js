const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");

const AVATAR_UPLOAD_DIRECTORY = path.resolve(
  __dirname,
  "../../uploads/avatars",
);

const MAX_AVATAR_SIZE = 2 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
]);

fs.mkdirSync(AVATAR_UPLOAD_DIRECTORY, {
  recursive: true,
});

const storage = multer.diskStorage({
  destination(request, file, callback) {
    callback(null, AVATAR_UPLOAD_DIRECTORY);
  },

  filename(request, file, callback) {
    const extension = ALLOWED_MIME_TYPES.get(file.mimetype);

    if (!extension) {
      return callback(
        new Error("Only JPG, PNG and WEBP profile pictures are allowed."),
      );
    }

    const uniqueName = `${Date.now()}-${crypto.randomUUID()}${extension}`;

    return callback(null, uniqueName);
  },
});

const fileFilter = (request, file, callback) => {
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    return callback(
      new multer.MulterError(
        "LIMIT_UNEXPECTED_FILE",
        "Profile picture must be JPG, PNG or WEBP.",
      ),
    );
  }

  return callback(null, true);
};

const avatarUpload = multer({
  storage,
  fileFilter,

  limits: {
    files: 1,
    fileSize: MAX_AVATAR_SIZE,
  },
});

const uploadSingleAvatar = avatarUpload.single("avatar");

module.exports = {
  uploadSingleAvatar,
  AVATAR_UPLOAD_DIRECTORY,
  MAX_AVATAR_SIZE,
};