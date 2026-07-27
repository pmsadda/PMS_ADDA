"use strict";

const express = require("express");

const lobbyNoticeController = require(
  "../controllers/lobby-notice.controller",
);

const {
  requireAuth,
  requireAdmin,
} = require("../middleware/auth.middleware");

const router = express.Router();

/*
 * User Lobby-এর জন্য active published notices।
 */
router.get(
  "/public",
  requireAuth,
  lobbyNoticeController.getPublicNotices,
);

/*
 * নিচের সব route শুধু admin ব্যবহার করতে পারবে।
 */
router.use(
  "/admin",
  requireAuth,
  requireAdmin,
);

router.get(
  "/admin",
  lobbyNoticeController.getAdminNotices,
);

router.get(
  "/admin/:noticeId",
  lobbyNoticeController.getNoticeById,
);

router.post(
  "/admin",
  lobbyNoticeController.createNotice,
);

router.patch(
  "/admin/:noticeId",
  lobbyNoticeController.updateNotice,
);

module.exports = router;