const express = require("express");

const {
  rateLimit,
  ipKeyGenerator,
} = require("express-rate-limit");

const {
  registerUser,
  login,
  logout,
  me,
  referralSummary,
  requestForgotPasswordOtp,
  verifyForgotPasswordOtp,
  resetForgottenPassword,
} = require("../controllers/auth.controller");

const { requireAuth } = require("../middleware/auth.middleware");

const router = express.Router();

/*
 * Login Brute-force Protection
 *
 * একই IP এবং একই email/mobile দিয়ে ১৫ মিনিটের মধ্যে
 * সর্বোচ্চ ১০টি ব্যর্থ login চেষ্টা করা যাবে।
 *
 * সফল login এবং server-side error limit হিসেবে গণনা হবে না।
 */
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,

  limit: 10,

  standardHeaders: "draft-8",

  legacyHeaders: false,

  skipSuccessfulRequests: true,

  requestWasSuccessful: (_request, response) =>
    response.statusCode < 400 || response.statusCode >= 500,

  keyGenerator: (request) => {
    const clientIp = ipKeyGenerator(request.ip);

    const identity = String(request.body?.identity || "")
      .trim()
      .toLowerCase();

    return `${clientIp}:${identity || "unknown-user"}`;
  },

  message: {
    success: false,
    message:
      "অনেকবার ভুল লগইন চেষ্টা করা হয়েছে। নিরাপত্তার জন্য ১৫ মিনিট পর আবার চেষ্টা করুন।",
  },
});

/* Register */

router.post("/register", registerUser);

/* Login */

router.post("/login", loginRateLimiter, login);
/* Logout */

router.post(
  "/logout",
  requireAuth,
  logout,
);

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
