"use strict";

const express =
  require("express");

const controller =
  require(
    "../controllers/lottery.controller",
  );

const {
  requireAuth,
} = require(
  "../middleware/auth.middleware",
);

const router =
  express.Router();

/* ==========================================
   PMS ADDA Lottery Routes
========================================== */

/*
 * Current user ticket history
 */
router.get(
  "/my-tickets",
  requireAuth,
  controller.getMyTickets,
);

/*
 * Recent completed draw winners
 */
router.get(
  "/winners/recent",
  requireAuth,
  controller.getRecentWinners,
);

/*
 * Current user Lottery winner notifications
 */
router.get(
  "/notifications",
  requireAuth,
  controller.getMyNotifications,
);

/*
 * Mark a winner notification as read
 */
router.patch(
  "/notifications/:drawId/read",
  requireAuth,
  controller.markNotificationRead,
);

/*
 * Available and recent draws
 */
router.get(
  "/draws",
  requireAuth,
  controller.getPublicDraws,
);

/*
 * Single draw details
 */
router.get(
  "/draws/:drawId",
  requireAuth,
  controller.getDrawDetails,
);

/* Purchase Lottery Tickets */

router.post(
  "/draws/:drawId/tickets",
  requireAuth,
  controller.purchaseTickets,
);

/* Cancel Lottery Ticket */

router.post(
  "/tickets/:ticketId/cancel",
  requireAuth,
  controller.cancelTicket,
);

module.exports =
  router;