const express = require("express");

const {
  getWithdraws,
  approve,
  reject
} = require("../controllers/admin-withdraw.controller");

const {
  requireAuth,
  requireAdmin
} = require("../middleware/auth.middleware");

const router = express.Router();


/* Get withdraw requests */

router.get(
  "/",
  requireAuth,
  requireAdmin,
  getWithdraws
);


/* Approve withdraw */

router.patch(
  "/:id/approve",
  requireAuth,
  requireAdmin,
  approve
);


/* Reject withdraw */

router.patch(
  "/:id/reject",
  requireAuth,
  requireAdmin,
  reject
);


module.exports = router;