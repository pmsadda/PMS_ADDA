"use strict";

const express = require("express");

const {
  requireAuth,
} = require("../middleware/auth.middleware");

const supportController = require(
  "../controllers/support.controller"
);

const router = express.Router();

/*
|--------------------------------------------------------------------------
| All Support routes require authentication
|--------------------------------------------------------------------------
*/

router.use(requireAuth);

/*
|--------------------------------------------------------------------------
| User Support Ticket routes
|--------------------------------------------------------------------------
*/

// নতুন Support Ticket তৈরি
router.post(
  "/tickets",
  supportController.createTicket,
);

// নিজের সব Ticket দেখা
router.get(
  "/tickets",
  supportController.getMyTickets,
);

// নির্দিষ্ট Ticket ও Messages দেখা
router.get(
  "/tickets/:ticketId",
  supportController.getMyTicketDetails,
);

// Ticket-এ নতুন Message পাঠানো
router.post(
  "/tickets/:ticketId/messages",
  supportController.replyToMyTicket,
);

// নিজের Ticket বন্ধ করা
router.patch(
  "/tickets/:ticketId/close",
  supportController.closeMyTicket,
);

module.exports = router;