"use strict";

const express =
  require("express");

const adminUsersController =
  require(
    "../controllers/admin-users.controller"
  );

const {
  requireAuth,
  requireAdmin
} = require(
  "../middleware/auth.middleware"
);

const router =
  express.Router();

/*
 * এই router-এর সব endpoint
 * authenticated Admin-only।
 */

router.use(
  requireAuth,
  requireAdmin
);

router.get(
  "/summary",
  adminUsersController
    .getUserSummary
);

router.get(
  "/",
  adminUsersController
    .getUsers
);

router.get(
  "/:userId",
  adminUsersController
    .getUserById
);

router.patch(
  "/:userId/status",
  adminUsersController
    .updateUserStatus
);

module.exports = router;