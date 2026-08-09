"use strict";

const lobbyNoticeService = require(
  "../services/lobby-notice.service",
);

function sendError(
  response,
  error,
  fallbackMessage,
) {
  console.error(
    "LOBBY NOTICE CONTROLLER ERROR:",
    error,
  );

  const requestedStatus =
    Number(
      error?.statusCode ||
      error?.status,
    );

  const statusCode =
    requestedStatus >= 400 &&
    requestedStatus < 500
      ? requestedStatus
      : 500;

  return response
    .status(statusCode)
    .json({
      success: false,

      message:
        statusCode === 500
          ? fallbackMessage
          : (
              error?.message ||
              fallbackMessage
            ),

      code:
        statusCode === 500
          ? "LOBBY_NOTICE_INTERNAL_ERROR"
          : (
              error?.code ||
              "LOBBY_NOTICE_ERROR"
            ),
    });
}

async function getPublicNotices(req, res) {
  try {
    const notices =
      await lobbyNoticeService
        .getPublicNotices();

    return res.status(200).json({
      success: true,

      message:
        "Lobby notices loaded successfully.",

      data: {
        notices,
      },
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "Failed to load Lobby notices.",
    );
  }
}

async function getAdminNotices(req, res) {
  try {
    const notices =
      await lobbyNoticeService
        .getAdminNotices(req.query);

    return res.status(200).json({
      success: true,

      message:
        "Admin Lobby notices loaded successfully.",

      data: {
        notices,
      },
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "Failed to load admin Lobby notices.",
    );
  }
}

async function getNoticeById(req, res) {
  try {
    const notice =
      await lobbyNoticeService
        .getNoticeById(
          req.params.noticeId,
        );

    if (!notice) {
      return res.status(404).json({
        success: false,

        message:
          "Lobby notice not found.",

        code: "NOTICE_NOT_FOUND",
      });
    }

    return res.status(200).json({
      success: true,

      message:
        "Lobby notice loaded successfully.",

      data: {
        notice,
      },
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "Failed to load Lobby notice.",
    );
  }
}

async function createNotice(req, res) {
  try {
    const notice =
      await lobbyNoticeService
        .createNotice(
          req.body,
          req.user.id,
        );

    return res.status(201).json({
      success: true,

      message:
        notice.status === "published"
          ? "Lobby notice published successfully."
          : "Lobby notice saved successfully.",

      data: {
        notice,
      },
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "Failed to create Lobby notice.",
    );
  }
}

async function updateNotice(req, res) {
  try {
    const notice =
      await lobbyNoticeService
        .updateNotice(
          req.params.noticeId,
          req.body,
          req.user.id,
        );

    return res.status(200).json({
      success: true,

      message:
        notice.status === "published"
          ? "Lobby notice published successfully."
          : notice.status === "inactive"
            ? "Lobby notice deactivated successfully."
            : "Lobby notice updated successfully.",

      data: {
        notice,
      },
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "Failed to update Lobby notice.",
    );
  }
}

module.exports = {
  getPublicNotices,
  getAdminNotices,
  getNoticeById,
  createNotice,
  updateNotice,
};