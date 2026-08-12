const fs = require("fs/promises");
const path = require("path");

const { pool } = require("../config/database");
const {
  AVATAR_UPLOAD_DIRECTORY,
} = require("../middleware/avatar-upload.middleware");

const AVATAR_PUBLIC_PATH = "/uploads/avatars";

function detectAvatarMimeType(buffer) {
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
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }

  return null;
}

async function removeTemporaryFile(filePath) {
  if (!filePath) {
    return;
  }

  await fs.unlink(filePath).catch(() => {});
}

async function deleteOldDiskAvatar(avatarUrl) {
  if (
    typeof avatarUrl !== "string" ||
    !avatarUrl.startsWith(
      `${AVATAR_PUBLIC_PATH}/`,
    )
  ) {
    return;
  }

  const filename = path.basename(avatarUrl);

  const filePath = path.join(
    AVATAR_UPLOAD_DIRECTORY,
    filename,
  );

  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error(
        "OLD PROFILE PICTURE DELETE ERROR:",
        error,
      );
    }
  }
}

async function uploadProfileAvatar(
  request,
  response,
  next,
) {
  const uploadedFile = request.file;

  try {
    if (!request.user?.id) {
      await removeTemporaryFile(
        uploadedFile?.path,
      );

      return response.status(401).json({
        success: false,
        message:
          "Authentication is required.",
      });
    }

    if (!uploadedFile) {
      return response.status(400).json({
        success: false,
        message:
          "Please select a JPG, PNG or WEBP profile picture.",
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
      await removeTemporaryFile(
        uploadedFile.path,
      );

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

    const userId =
      Number(request.user.id);

    const [userRows] =
      await pool.query(
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
      await removeTemporaryFile(
        uploadedFile.path,
      );

      return response.status(404).json({
        success: false,
        message:
          "Active user account was not found.",
      });
    }

    const oldAvatarUrl =
      userRows[0].avatar_url;

    const avatarVersion =
      Date.now();

    const avatarUrl =
      `/api/profile/avatar/${userId}` +
      `?v=${avatarVersion}`;

    const originalFileName =
      String(
        uploadedFile.originalname ||
          uploadedFile.filename ||
          "profile-avatar",
      ).slice(0, 255);

    const [updateResult] =
      await pool.query(
        `
          UPDATE users
          SET
            avatar_url = ?,
            avatar_file_name = ?,
            avatar_mime_type = ?,
            avatar_size = ?,
            avatar_data = ?
          WHERE id = ?
            AND account_status = 'active'
        `,
        [
          avatarUrl,
          originalFileName,
          detectedMimeType,
          uploadedBuffer.length,
          uploadedBuffer,
          userId,
        ],
      );

    if (
      updateResult.affectedRows !== 1
    ) {
      await removeTemporaryFile(
        uploadedFile.path,
      );

      return response.status(409).json({
        success: false,
        message:
          "Profile picture could not be updated.",
      });
    }

    await removeTemporaryFile(
      uploadedFile.path,
    );

    await deleteOldDiskAvatar(
      oldAvatarUrl,
    );

    return response.status(200).json({
      success: true,

      message:
        "Profile picture updated successfully.",

      data: {
        avatarUrl,
      },
    });
  } catch (error) {
    await removeTemporaryFile(
      uploadedFile?.path,
    );

    return next(error);
  }
}

async function getProfileAvatar(
  request,
  response,
  next,
) {
  try {
    const userId =
      Number(request.params.userId);

    if (
      !Number.isInteger(userId) ||
      userId <= 0
    ) {
      return response.status(400).json({
        success: false,
        message:
          "Valid avatar user ID is required.",
      });
    }

    const [rows] =
      await pool.query(
        `
          SELECT
            avatar_file_name,
            avatar_mime_type,
            avatar_size,
            avatar_data
          FROM users
          WHERE id = ?
            AND account_status = 'active'
          LIMIT 1
        `,
        [userId],
      );

    const avatar = rows[0];

    if (
      !avatar ||
      !Buffer.isBuffer(
        avatar.avatar_data,
      ) ||
      avatar.avatar_data.length < 1 ||
      !avatar.avatar_mime_type
    ) {
      return response.status(404).json({
        success: false,
        message:
          "Profile picture was not found.",
      });
    }

    response.set({
      "Content-Type":
        avatar.avatar_mime_type,

      "Content-Length":
        String(
          avatar.avatar_size ||
            avatar.avatar_data.length,
        ),

      "Cache-Control":
        "public, max-age=31536000, immutable",

      "X-Content-Type-Options":
        "nosniff",
    });

    return response
      .status(200)
      .send(avatar.avatar_data);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  uploadProfileAvatar,
  getProfileAvatar,
};