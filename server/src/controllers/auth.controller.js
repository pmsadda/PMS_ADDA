const jwt = require("jsonwebtoken");

const {
  createUser,
  loginUser,
  getUserReferralSummary,
  markUserActive,
  markUserOffline,
} = require("../services/auth.service");

const {
  requestPasswordResetOtp,
  verifyPasswordResetOtp,
  resetPasswordWithToken,
} = require("../services/password-reset.service");

/* ==========================
   Create JWT Token
========================== */

function createAccessToken(user) {
  return jwt.sign(
    {
      id: user.id,
      uid: user.uid,
      role: user.role,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "30d",
    },
  );
}

/* ==========================
   Register User
========================== */

async function registerUser(req, res, next) {
  try {
    const { fullName, username, phone, email, password, referralCode } =
      req.body;

    if (!fullName || !username || !phone || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "সব তথ্য সঠিকভাবে পূরণ করুন।",
      });
    }

    const cleanedData = {
      fullName: String(fullName).trim(),

      username: String(username).trim().toLowerCase(),

      phone: String(phone).trim(),

      email: String(email).trim().toLowerCase(),

      password: String(password),

      referralCode: String(referralCode || "")
        .trim()
        .toUpperCase(),
    };

    if (cleanedData.fullName.length < 3) {
      return res.status(400).json({
        success: false,
        message: "নাম কমপক্ষে ৩ অক্ষরের হতে হবে।",
      });
    }

    if (!/^[a-z0-9_]{4,30}$/.test(cleanedData.username)) {
      return res.status(400).json({
        success: false,
        message:
          "Username ৪–৩০ অক্ষরের হতে হবে এবং শুধু ছোট হাতের ইংরেজি অক্ষর, সংখ্যা ও underscore ব্যবহার করা যাবে।",
      });
    }

    if (!/^01[3-9]\d{8}$/.test(cleanedData.phone)) {
      return res.status(400).json({
        success: false,
        message: "সঠিক ১১ ডিজিটের বাংলাদেশি মোবাইল নম্বর দিন।",
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanedData.email)) {
      return res.status(400).json({
        success: false,
        message: "সঠিক Email Address দিন।",
      });
    }

    if (cleanedData.password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password কমপক্ষে ৮ অক্ষরের হতে হবে।",
      });
    }

    if (
      cleanedData.referralCode &&
      !/^PMS[A-Z0-9]{6,17}$/.test(cleanedData.referralCode)
    ) {
      return res.status(400).json({
        success: false,
        message: "Referral code সঠিক নয়।",
      });
    }

    const user = await createUser(cleanedData);

    const token = createAccessToken(user);

    return res.status(201).json({
      success: true,
      message: user.referralApplied
        ? "Registration completed with referral code."
        : "Registration completed successfully.",

      data: {
        token,
        user,
      },
    });
  } catch (error) {
    next(error);
  }
}

/* ==========================
   Login User
========================== */

async function login(req, res, next) {
  try {
    const { identity, password } = req.body;

    if (!identity || !password) {
      return res.status(400).json({
        success: false,
        message: "Username, phone বা email এবং password দিন।",
      });
    }

    const cleanedData = {
      identity: String(identity).trim().toLowerCase(),

      password: String(password),
    };

    const user = await loginUser(cleanedData);

    const token = createAccessToken(user);

    let redirectTo = "/lobby";

    if (user.role === "admin") {
      redirectTo = "/client/admin/dashboard.html";
    } else if (user.role === "agent") {
      redirectTo = "/client/agent/dashboard.html";
    }

    return res.status(200).json({
      success: true,
      message: "Login successful.",

      data: {
        token,
        user,
        redirectTo,
      },
    });
  } catch (error) {
    next(error);
  }
}

/* ==========================
   Current User
========================== */

async function me(req, res, next) {
  try {
    const { pool } = require("../config/database");

    const [rows] = await pool.execute(
      `
                SELECT
                    id,
                    uid,
                    referral_code,
                    full_name,
                    username,
                    phone,
                    email,
                    avatar_url,
                    role,
                    account_status,
                    wallet_balance,
                    total_deposit
                FROM users
                WHERE id = ?
                LIMIT 1
                `,
      [req.user.id],
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    const user = rows[0];

    return res.json({
      success: true,

      data: {
        user: {
          id: user.id,
          uid: user.uid,
          referralCode: user.referral_code,
          fullName: user.full_name,
          username: user.username,
          phone: user.phone,
          email: user.email,
          avatarUrl: user.avatar_url || null,
          role: user.role,
          accountStatus: user.account_status,

          walletBalance: Number(user.wallet_balance),

          totalDeposit: Number(user.total_deposit),
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

async function referralSummary(req, res, next) {
  try {
    const summary = await getUserReferralSummary(req.user.id);

    return res.status(200).json({
      success: true,

      message: "Referral summary loaded successfully.",

      data: {
        referral: summary,
      },
    });
  } catch (error) {
    next(error);
  }
}

/* ==========================
   Request Password Reset OTP
========================== */

async function requestForgotPasswordOtp(req, res, next) {
  try {
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();

    const result = await requestPasswordResetOtp(email);

    res.setHeader("Cache-Control", "no-store");

    return res.status(200).json({
      success: true,

      message: "Emailটি registered হলে password reset OTP পাঠানো হয়েছে।",

      data: {
        requestId: result.requestId,

        maskedEmail: result.maskedEmail,

        expiresInSeconds: result.expiresInSeconds,

        resendAfterSeconds: result.resendAfterSeconds,
      },
    });
  } catch (error) {
    next(error);
  }
}

/* ==========================
   Verify Password Reset OTP
========================== */

async function verifyForgotPasswordOtp(req, res, next) {
  try {
    const result = await verifyPasswordResetOtp({
      requestId: req.body.requestId,

      otp: req.body.otp,
    });

    res.setHeader("Cache-Control", "no-store");

    return res.status(200).json({
      success: true,

      message: "OTP verified successfully.",

      data: {
        requestId: result.requestId,

        resetToken: result.resetToken,

        expiresInSeconds: result.expiresInSeconds,
      },
    });
  } catch (error) {
    next(error);
  }
}

/* ==========================
   Reset Password
========================== */

async function resetForgottenPassword(req, res, next) {
  try {
    const newPassword = String(req.body.newPassword || "");

    const confirmPassword = String(req.body.confirmPassword || "");

    if (!newPassword || !confirmPassword) {
      return res.status(400).json({
        success: false,

        message: "নতুন password এবং confirm password দিন।",
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,

        message: "নতুন password দুটি মিলছে না।",
      });
    }

    await resetPasswordWithToken({
      requestId: req.body.requestId,

      resetToken: req.body.resetToken,

      newPassword,
    });

    res.setHeader("Cache-Control", "no-store");

    return res.status(200).json({
      success: true,

      message: "Password reset successful. নতুন password দিয়ে login করুন।",
    });
  } catch (error) {
    next(error);
  }
}

/* ==========================
   User Activity Heartbeat
========================== */

async function heartbeat(
  req,
  res,
  next
) {
  try {
    await markUserActive(
      req.user.id
    );

    res.setHeader(
      "Cache-Control",
      "no-store"
    );

    return res
      .status(200)
      .json({
        success: true,

        data: {
          online: true,

          activeAt:
            new Date()
              .toISOString()
        }
      });
  } catch (error) {
    next(error);
  }
}

/* ==========================
   Logout User
========================== */

async function logout(req, res, next) {
  try {
    await markUserOffline(req.user.id);

    return res.status(200).json({
      success: true,

      message: "Logout successful.",
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  registerUser,
  login,
  heartbeat,
  logout,
  me,
  referralSummary,
  requestForgotPasswordOtp,
  verifyForgotPasswordOtp,
  resetForgottenPassword,
};
