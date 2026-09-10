"use strict";

const express =
  require("express");

const {
  rateLimit,
  ipKeyGenerator,
} = require(
  "express-rate-limit",
);

const {
  registerUser,
  login,
  heartbeat,
  logout,
  me,
  referralSummary,
  requestForgotPasswordOtp,
  verifyForgotPasswordOtp,
  resetForgottenPassword,
} = require(
  "../controllers/auth.controller",
);

const {
  requireAuth,
} = require(
  "../middleware/auth.middleware",
);

const router =
  express.Router();

/* ==========================================
   Login Rate Limiter
========================================== */

const loginRateLimiter =
  rateLimit({
    windowMs:
      15 * 60 * 1000,

    limit: 10,

    standardHeaders:
      "draft-8",

    legacyHeaders:
      false,

    skipSuccessfulRequests:
      true,

    requestWasSuccessful:
      (_request, response) =>
        response.statusCode < 400 ||
        response.statusCode >= 500,

    keyGenerator: (request) => {
      const clientIp =
        ipKeyGenerator(
          request.ip,
        );

      const identity =
        String(
          request.body?.identity ||
          "",
        )
          .trim()
          .toLowerCase();

      return (
        `${clientIp}:` +
        `${identity || "unknown-user"}`
      );
    },

    message: {
      success: false,

      code:
        "LOGIN_RATE_LIMITED",

      message:
        "অনেকবার ভুল লগইন চেষ্টা করা হয়েছে। নিরাপত্তার জন্য ১৫ মিনিট পর আবার চেষ্টা করুন।",
    },
  });

/* ==========================================
   Registration Rate Limiter
========================================== */

const registrationRateLimiter =
  rateLimit({
    windowMs:
      60 * 60 * 1000,

    limit: 20,

    standardHeaders:
      "draft-8",

    legacyHeaders:
      false,

    skipSuccessfulRequests:
      false,

    message: {
      success: false,

      code:
        "REGISTRATION_RATE_LIMITED",

      message:
        "অনেকগুলো registration request করা হয়েছে। এক ঘণ্টা পর আবার চেষ্টা করুন।",
    },
  });

/* ==========================================
   Forgot Password Rate Limiter
========================================== */

const forgotPasswordRateLimiter =
  rateLimit({
    windowMs:
      15 * 60 * 1000,

    limit: 5,

    standardHeaders:
      "draft-8",

    legacyHeaders:
      false,

    keyGenerator: (request) => {
      const clientIp =
        ipKeyGenerator(
          request.ip,
        );

      const identity =
        String(
          request.body?.identity ||
          request.body?.email ||
          request.body?.phone ||
          "",
        )
          .trim()
          .toLowerCase();

      return (
        `${clientIp}:` +
        `${identity || "unknown-user"}`
      );
    },

    message: {
      success: false,

      code:
        "PASSWORD_RESET_RATE_LIMITED",

      message:
        "অনেকবার OTP request করা হয়েছে। ১৫ মিনিট পর আবার চেষ্টা করুন।",
    },
  });

/* ==========================================
   Authentication Routes
========================================== */

router.post(
  "/register",
  registrationRateLimiter,
  registerUser,
);

router.post(
  "/login",
  loginRateLimiter,
  login,
);

router.post(
  "/logout",
  requireAuth,
  logout,
);

router.post(
  "/forgot-password/request",
  forgotPasswordRateLimiter,
  requestForgotPasswordOtp,
);

router.post(
  "/forgot-password/verify",
  verifyForgotPasswordOtp,
);

router.post(
  "/forgot-password/reset",
  resetForgottenPassword,
);

router.post(
  "/heartbeat",
  requireAuth,
  heartbeat,
);

router.get(
  "/me",
  requireAuth,
  me,
);

router.get(
  "/referral-summary",
  requireAuth,
  referralSummary,
);

module.exports =
  router;