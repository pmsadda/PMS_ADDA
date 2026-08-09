const fs = require("fs/promises");
const path = require("path");

const { pool } = require("../config/database");
const {
  AVATAR_UPLOAD_DIRECTORY,
} = require("../middleware/avatar-upload.middleware");

const AVATAR_PUBLIC_PATH = "/uploads/avatars";

const detectAvatarMimeType = (
  buffer,
) => {
  if (
    !Buffer.isBuffer(buffer) ||
    buffer.length < 12
  ) {
    return null;
  }

  if (
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return "image/jpeg";
  }

  const pngSignature = [
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
  ];

  if (
    pngSignature.every(
      (byte, index) =>
        buffer[index] === byte,
    )
  ) {
    return "image/png";
  }

  if (
    buffer.toString(
      "ascii",
      0,
      4,
    ) === "RIFF" &&
    buffer.toString(
      "ascii",
      8,
      12,
    ) === "WEBP"
  ) {
    return "image/webp";
  }

  return null;
};

const deleteAvatarFile = async (avatarUrl) => {
  if (
    typeof avatarUrl !== "string" ||
    !avatarUrl.startsWith(`${AVATAR_PUBLIC_PATH}/`)
  ) {
    return;
  }

  const filename = path.basename(avatarUrl);
  const filePath = path.join(AVATAR_UPLOAD_DIRECTORY, filename);

  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("OLD PROFILE PICTURE DELETE ERROR:", error);
    }
  }
};

const uploadProfileAvatar = async (request, response, next) => {
  const uploadedFile = request.file;

  try {
    if (!request.user?.id) {
      if (uploadedFile?.path) {
        await fs.unlink(uploadedFile.path).catch(() => {});
      }

      return response.status(401).json({
        success: false,
        message: "Authentication is required.",
      });
    }

    if (!uploadedFile) {
      return response.status(400).json({
        success: false,
        message: "Please select a JPG, PNG or WEBP profile picture.",
      });
    }

    const uploadedBuffer =
  await fs.readFile(
    uploadedFile.path,
  );

const declaredMimeType =
  String(
    uploadedFile.mimetype || "",
  )
    .trim()
    .toLowerCase();

const detectedMimeType =
  detectAvatarMimeType(
    uploadedBuffer,
  );

if (
  !detectedMimeType ||
  detectedMimeType !==
    declaredMimeType
) {
  await fs
    .unlink(uploadedFile.path)
    .catch(() => {});

  return response
    .status(400)
    .json({
      success: false,

      code:
        "AVATAR_SIGNATURE_MISMATCH",

      message:
        "Profile picture content does not match its image type.",
    });
}

    const userId = Number(request.user.id);
    const avatarUrl = `${AVATAR_PUBLIC_PATH}/${uploadedFile.filename}`;

    const [userRows] = await pool.query(
      `
        SELECT
          id,
          avatar_url
        FROM users
        WHERE id = ?
          AND account_status = 'active'
        LIMIT 1
      `,
      [userId],
    );

    if (!userRows.length) {
      await fs.unlink(uploadedFile.path).catch(() => {});

      return response.status(404).json({
        success: false,
        message: "Active user account was not found.",
      });
    }

    const oldAvatarUrl = userRows[0].avatar_url;

    const [updateResult] = await pool.query(
      `
        UPDATE users
        SET avatar_url = ?
        WHERE id = ?
          AND account_status = 'active'
      `,
      [avatarUrl, userId],
    );

    if (updateResult.affectedRows !== 1) {
      await fs.unlink(uploadedFile.path).catch(() => {});

      return response.status(409).json({
        success: false,
        message: "Profile picture could not be updated.",
      });
    }

    await deleteAvatarFile(oldAvatarUrl);

    return response.status(200).json({
      success: true,
      message: "Profile picture updated successfully.",

      data: {
        avatarUrl,
      },
    });
  } catch (error) {
    if (uploadedFile?.path) {
      await fs.unlink(uploadedFile.path).catch(() => {});
    }

    return next(error);
  }
};

module.exports = {
  uploadProfileAvatar,
};