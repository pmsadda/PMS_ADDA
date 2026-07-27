"use strict";

const express = require("express");
const multer = require("multer");

const {
  requireAuth,
  requireAdmin,
} = require("../middleware/auth.middleware");

const supportController = require(
  "../controllers/support.controller"
);

const router = express.Router();

const MAX_ATTACHMENT_SIZE = 3 * 1024 * 1024;

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const supportUpload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: MAX_ATTACHMENT_SIZE,
    files: 3,
  },

  fileFilter(request, file, callback) {
    const mimeType = String(file.mimetype || "")
      .trim()
      .toLowerCase();

    if (!allowedMimeTypes.has(mimeType)) {
      const error = new Error(
        "Only JPG, PNG and WEBP screenshots are allowed.",
      );

      error.statusCode = 400;
      error.code = "INVALID_SUPPORT_ATTACHMENT_TYPE";

      return callback(error);
    }

    return callback(null, true);
  },
});

function uploadSupportAttachments(request, response, next) {
  supportUpload.array("attachments", 3)(
    request,
    response,
    (error) => {
      if (!error) {
        return next();
      }

      let message =
        error.message || "Unable to upload the screenshot.";

      let code =
        error.code || "SUPPORT_ATTACHMENT_UPLOAD_FAILED";

      if (error.code === "LIMIT_FILE_SIZE") {
        message = "Each screenshot must be smaller than 3 MB.";
        code = "SUPPORT_ATTACHMENT_TOO_LARGE";
      }

      if (error.code === "LIMIT_FILE_COUNT") {
        message = "Maximum 3 screenshots are allowed.";
        code = "TOO_MANY_SUPPORT_ATTACHMENTS";
      }

      return response
        .status(Number(error.statusCode) || 400)
        .json({
          success: false,
          message,
          code,
        });
    },
  );
}

/*
|--------------------------------------------------------------------------
| All support routes require authentication
|--------------------------------------------------------------------------
*/

router.use(requireAuth);

/*
|--------------------------------------------------------------------------
| Admin support routes
|--------------------------------------------------------------------------
*/

router.get(
  "/admin/tickets",
  requireAdmin,
  supportController.getAdminTickets,
);

router.get(
  "/admin/tickets/:ticketId",
  requireAdmin,
  supportController.getAdminTicketDetails,
);

router.post(
  "/admin/tickets/:ticketId/messages",
  requireAdmin,
  uploadSupportAttachments,
  supportController.replyToTicketAsAdmin,
);

router.get(
  "/admin/attachments/:attachmentId",
  requireAdmin,
  supportController.getAdminAttachment,
);

router.patch(
  "/admin/tickets/:ticketId",
  requireAdmin,
  supportController.updateTicketAsAdmin,
);

/*
|--------------------------------------------------------------------------
| User support routes
|--------------------------------------------------------------------------
*/

router.post(
  "/tickets",
  uploadSupportAttachments,
  supportController.createTicket,
);

router.get(
  "/tickets",
  supportController.getMyTickets,
);

router.get(
  "/tickets/:ticketId",
  supportController.getMyTicketDetails,
);

router.post(
  "/tickets/:ticketId/messages",
  uploadSupportAttachments,
  supportController.replyToMyTicket,
);

router.patch(
  "/tickets/:ticketId/close",
  supportController.closeMyTicket,
);

router.get(
  "/attachments/:attachmentId",
  supportController.getMyAttachment,
);

module.exports = router;