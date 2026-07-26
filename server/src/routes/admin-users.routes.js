const express = require("express");

const adminUsersController = require(
  "../controllers/admin-users.controller"
);

const router = express.Router();

/*
 * তোমার project-এ admin authentication middleware
 * থাকলে এখানে import করবে।
 *
 * উদাহরণ:
 *
 * const {
 *   authenticateToken,
 *   requireAdmin
 * } = require("../middlewares/auth.middleware");
 *
 * router.use(
 *   authenticateToken,
 *   requireAdmin
 * );
 */

router.get(
  "/summary",
  adminUsersController.getUserSummary
);

router.get(
  "/",
  adminUsersController.getUsers
);

router.get(
  "/:userId",
  adminUsersController.getUserById
);

router.patch(
  "/:userId/status",
  adminUsersController.updateUserStatus
);

module.exports = router;