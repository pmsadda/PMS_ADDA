const express = require("express");

const {
    registerUser,
    login,
    me,
    referralSummary
} = require(
    "../controllers/auth.controller"
);

const {
    requireAuth
} = require(
    "../middleware/auth.middleware"
);

const router = express.Router();

/* Register */

router.post(
    "/register",
    registerUser
);

/* Login */

router.post(
    "/login",
    login
);

/* Current User */

router.get(
    "/me",
    requireAuth,
    me
);

/* Referral Summary */

router.get(
    "/referral-summary",
    requireAuth,
    referralSummary
);

module.exports = router;