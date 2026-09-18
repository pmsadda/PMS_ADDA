"use strict";

const express =
  require("express");

const sportsController =
  require(
    "../controllers/sports.controller",
  );

const {
  requireAuth,
} = require(
  "../middleware/auth.middleware",
);

const router =
  express.Router();

/*
 * Sports-এর সব route ব্যবহার করতে
 * valid user login প্রয়োজন।
 */
router.use(requireAuth);

/* =========================
   User Betting Routes
========================= */

router.get(
  "/settings",
  sportsController
    .getSportsSettings,
);

router.get(
  "/my-bets",
  sportsController
    .getMySportsBets,
);

router.post(
  "/bets",
  sportsController
    .placeSportsBet,
);

/*
 * Provider API থেকে data sync করে
 * local database-এর event, market
 * ও selection return করবে।
 */
router.get(
  "/:sportId/feed/:date",
  sportsController
    .syncAndGetSportsFeed,
);

/* =========================
   Provider Data Routes
========================= */

router.get(
  "/catalog",
  sportsController.getSports,
);

router.get(
  "/:sportId/dates",
  sportsController
    .getDatesBySport,
);

router.get(
  "/:sportId/events/:date",
  sportsController
    .getEventsBySportAndDate,
);

module.exports = router;