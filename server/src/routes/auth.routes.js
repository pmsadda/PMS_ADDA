const express = require("express");

const { rateLimit, ipKeyGenerator } = require("express-rate-limit");

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

router.post("/register", registrationRateLimiter, registerUser);

/* Login */

router.post("/login", loginRateLimiter, login);
/* Logout */

router.post("/logout", requireAuth, logout);

/*
 * Registration Spam Protection
 *
 * একই IP থেকে এক ঘণ্টায় সর্বোচ্চ
 * ২০টি registration request করা যাবে।
 */
const registrationRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,

  limit: 20,

  standardHeaders: "draft-8",

  legacyHeaders: false,

  skipSuccessfulRequests: false,

  message: {
    success: false,

    code: "REGISTRATION_RATE_LIMITED",

    message:
      "অনেকগুলো registration request করা হয়েছে। এক ঘণ্টা পর আবার চেষ্টা করুন।",
  },
});

/*
 * Forgot Password OTP Protection
 *
 * একই IP ও একই email/phone দিয়ে
 * ১৫ মিনিটে সর্বোচ্চ ৫টি OTP
 * request করা যাবে।
 */
const forgotPasswordRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,

  limit: 5,

  standardHeaders: "draft-8",

  legacyHeaders: false,

  keyGenerator: (request) => {
    const clientIp = ipKeyGenerator(request.ip);

    const identity = String(
      request.body?.identity ||
        request.body?.email ||
        request.body?.phone ||
        "",
    )
      .trim()
      .toLowerCase();

    return `${clientIp}:` + `${identity || "unknown-user"}`;
  },

  message: {
    success: false,

    code: "PASSWORD_RESET_RATE_LIMITED",

    message: "অনেকবার OTP request করা হয়েছে। ১৫ মিনিট পর আবার চেষ্টা করুন।",
  },
});

/* Request Forgot Password OTP */

router.post(
  "/forgot-password/request",
  forgotPasswordRateLimiter,
  requestForgotPasswordOtp,
);

/* Verify Forgot Password OTP */

router.post("/forgot-password/verify", verifyForgotPasswordOtp);

/* Reset Forgotten Password */

router.post("/forgot-password/reset", resetForgottenPassword);

/* Current User */

router.get("/me", requireAuth, me);

/* Referral Summary */

router.get("/referral-summary", requireAuth, referralSummary);

module.exports = router;
