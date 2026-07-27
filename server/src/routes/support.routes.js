"use strict";

const express = require("express");

const {
  requireAuth,
  requireAdmin,
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
| Admin Support Ticket routes
|--------------------------------------------------------------------------
*/

// সব Ticket list, search ও filter
router.get(
  "/admin/tickets",
  requireAdmin,
  supportController.getAdminTickets,
);

// নির্দিষ্ট Ticket ও messages
router.get(
  "/admin/tickets/:ticketId",
  requireAdmin,
  supportController.getAdminTicketDetails,
);

// Admin reply
router.post(
  "/admin/tickets/:ticketId/messages",
  requireAdmin,
  supportController.replyToTicketAsAdmin,
);

// Status, priority এবং assignment update
router.patch(
  "/admin/tickets/:ticketId",
  requireAdmin,
  supportController.updateTicketAsAdmin,
);

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