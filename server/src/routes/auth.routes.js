const express = require("express");

const {
  registerUser,
  login,
  me,
  referralSummary,
  requestForgotPasswordOtp,
  verifyForgotPasswordOtp,
  resetForgottenPassword,
} = require("../controllers/auth.controller");

const { requireAuth } = require("../middleware/auth.middleware");

const router = express.Router();

/* Register */

router.post("/register", registerUser);

/* Login */

router.post("/login", login);

/* Request Forgot Password OTP */

router.post("/forgot-password/request", requestForgotPasswordOtp);

/* Verify Forgot Password OTP */

router.post("/forgot-password/verify", verifyForgotPasswordOtp);

/* Reset Forgotten Password */

router.post("/forgot-password/reset", resetForgottenPassword);

/* Current User */

router.get("/me", requireAuth, me);

/* Referral Summary */

router.get("/referral-summary", requireAuth, referralSummary);

module.exports = router;
