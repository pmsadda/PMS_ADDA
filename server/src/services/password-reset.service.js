const crypto = require("crypto");
const bcrypt = require("bcrypt");

const {
  pool,
} = require("../config/database");

const OTP_EXPIRY_MINUTES = 10;
const RESET_TOKEN_EXPIRY_MINUTES = 10;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_OTP_ATTEMPTS = 5;
const MAX_REQUESTS_PER_HOUR = 5;
const PASSWORD_HASH_ROUNDS = 12;

function createServiceError(
  message,
  statusCode = 400,
  extra = {},
) {
  const error = new Error(message);

  error.statusCode = statusCode;

  Object.assign(error, extra);

  return error;
}

function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    email,
  );
}

function getOtpPepper() {
  const pepper = String(
    process.env.PASSWORD_RESET_OTP_PEPPER ||
      "",
  ).trim();

  if (pepper.length < 32) {
    throw createServiceError(
      "Password reset security configuration is missing.",
      500,
    );
  }

  return pepper;
}

function hashSecret(value) {
  return crypto
    .createHmac(
      "sha256",
      getOtpPepper(),
    )
    .update(String(value))
    .digest("hex");
}

function compareSecretHash(
  calculatedHash,
  storedHash,
) {
  const calculatedBuffer = Buffer.from(
    String(calculatedHash || ""),
    "hex",
  );

  const storedBuffer = Buffer.from(
    String(storedHash || ""),
    "hex",
  );

  if (
    calculatedBuffer.length === 0 ||
    calculatedBuffer.length !==
      storedBuffer.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    calculatedBuffer,
    storedBuffer,
  );
}

function generateRequestId() {
  return crypto
    .randomBytes(32)
    .toString("hex");
}

function generateResetToken() {
  return crypto
    .randomBytes(32)
    .toString("hex");
}

function generateOtp() {
  return String(
    crypto.randomInt(
      0,
      1000000,
    ),
  ).padStart(6, "0");
}

function maskEmail(email) {
  const [
    localPart = "",
    domain = "",
  ] = String(email).split("@");

  if (!domain) {
    return "your registered email";
  }

  const visibleStart =
    localPart.slice(0, 2);

  const hiddenLength = Math.max(
    localPart.length - 2,
    3,
  );

  return `${visibleStart}${"*".repeat(
    hiddenLength,
  )}@${domain}`;
}

function validateRequestId(value) {
  const requestId = String(
    value || "",
  ).trim();

  if (!/^[a-f0-9]{64}$/i.test(requestId)) {
    throw createServiceError(
      "Invalid password reset request.",
      400,
    );
  }

  return requestId.toLowerCase();
}

function validateOtp(value) {
  const otp = String(
    value || "",
  ).trim();

  if (!/^\d{6}$/.test(otp)) {
    throw createServiceError(
      "৬ সংখ্যার OTP দিন।",
      400,
    );
  }

  return otp;
}

function validateResetToken(value) {
  const resetToken = String(
    value || "",
  ).trim();

  if (!/^[a-f0-9]{64}$/i.test(resetToken)) {
    throw createServiceError(
      "Invalid or expired reset token.",
      400,
    );
  }

  return resetToken.toLowerCase();
}

function validateNewPassword(value) {
  const password = String(
    value || "",
  );

  if (password.length < 8) {
    throw createServiceError(
      "নতুন password কমপক্ষে ৮ অক্ষরের হতে হবে।",
      400,
    );
  }

  if (password.length > 72) {
    throw createServiceError(
      "Password সর্বোচ্চ ৭২ অক্ষরের হতে পারবে।",
      400,
    );
  }

  return password;
}

async function sendPasswordResetEmail({
  recipientEmail,
  otp,
}) {
  const apiKey = String(
    process.env.BREVO_API_KEY || "",
  ).trim();

  const senderEmail = normalizeEmail(
    process.env.BREVO_SENDER_EMAIL,
  );

  const senderName =
    String(
      process.env.BREVO_SENDER_NAME ||
        "PMS ADDA",
    ).trim() || "PMS ADDA";

  if (
    !apiKey ||
    !validateEmail(senderEmail)
  ) {
    throw createServiceError(
      "Email service configuration is missing.",
      500,
    );
  }

  let response;

  try {
    response = await fetch(
      "https://api.brevo.com/v3/smtp/email",
      {
        method: "POST",

        headers: {
          Accept: "application/json",

          "Content-Type":
            "application/json",

          "api-key": apiKey,
        },

        body: JSON.stringify({
          sender: {
            name: senderName,
            email: senderEmail,
          },

          to: [
            {
              email: recipientEmail,
            },
          ],

          subject:
            "PMS ADDA Password Reset OTP",

          textContent:
            `Your PMS ADDA password reset OTP is ${otp}. ` +
            `This OTP will expire in ${OTP_EXPIRY_MINUTES} minutes. ` +
            "Do not share this OTP with anyone.",

          htmlContent: `
            <div style="
              max-width:520px;
              margin:0 auto;
              padding:28px;
              font-family:Arial,sans-serif;
              color:#ffffff;
              background:#101713;
              border:1px solid #d7ae32;
              border-radius:18px;
            ">
              <h1 style="
                margin:0 0 10px;
                color:#ffd447;
                text-align:center;
              ">
                PMS ADDA
              </h1>

              <h2 style="
                margin:0 0 18px;
                text-align:center;
              ">
                Password Reset
              </h2>

              <p style="
                color:#d6ddd9;
                line-height:1.6;
              ">
                আপনার password reset OTP:
              </p>

              <div style="
                margin:22px 0;
                padding:18px;
                color:#111111;
                background:#ffd447;
                border-radius:12px;
                font-size:32px;
                font-weight:800;
                letter-spacing:8px;
                text-align:center;
              ">
                ${otp}
              </div>

              <p style="
                color:#d6ddd9;
                line-height:1.6;
              ">
                OTP-টি ${OTP_EXPIRY_MINUTES} মিনিটের
                মধ্যে ব্যবহার করুন।
              </p>

              <p style="
                margin-bottom:0;
                color:#ff8f8f;
                font-size:13px;
                line-height:1.5;
              ">
                আপনি password reset request না করলে
                emailটি উপেক্ষা করুন। OTP কারও সঙ্গে
                শেয়ার করবেন না।
              </p>
            </div>
          `,
        }),
      },
    );
  } catch {
    throw createServiceError(
      "Password reset email পাঠানো যায়নি। আবার চেষ্টা করুন।",
      502,
    );
  }

  const result =
    await response
      .json()
      .catch(() => ({}));

  if (!response.ok) {
    console.error(
      "BREVO PASSWORD RESET ERROR:",
      {
        status: response.status,

        code:
          result.code ||
          null,

        message:
          result.message ||
          "Unknown Brevo error",
      },
    );

    throw createServiceError(
      "Password reset email পাঠানো যায়নি। আবার চেষ্টা করুন।",
      502,
    );
  }

  return {
    messageId:
      result.messageId || null,
  };
}

async function requestPasswordResetOtp(
  emailValue,
) {
  const email =
    normalizeEmail(emailValue);

  if (!validateEmail(email)) {
    throw createServiceError(
      "সঠিক registered email address দিন।",
      400,
    );
  }

  const connection =
    await pool.getConnection();

  let resetRowId = null;

  const requestId =
    generateRequestId();

  const otp = generateOtp();

  try {
    await connection.beginTransaction();

    const [userRows] =
      await connection.execute(
        `
        SELECT
          id,
          email,
          account_status
        FROM users
        WHERE email = ?
        LIMIT 1
        FOR UPDATE
        `,
        [email],
      );

    const user =
      userRows[0] || null;

    /*
     * Account enumeration বন্ধ রাখতে
     * unknown email-তেও generic success।
     */
    if (
      !user ||
      user.account_status === "banned"
    ) {
      await connection.commit();

      return {
        requestId,
        maskedEmail:
          maskEmail(email),
        expiresInSeconds:
          OTP_EXPIRY_MINUTES * 60,
        resendAfterSeconds:
          RESEND_COOLDOWN_SECONDS,
      };
    }

    const [latestRows] =
      await connection.execute(
        `
        SELECT
          id,

          TIMESTAMPDIFF(
            SECOND,
            last_sent_at,
            NOW()
          ) AS elapsed_seconds

        FROM password_reset_otps
        WHERE user_id = ?
        ORDER BY id DESC
        LIMIT 1
        `,
        [user.id],
      );

    const latest =
      latestRows[0] || null;

    const elapsedSeconds =
      Number(
        latest?.elapsed_seconds ??
          RESEND_COOLDOWN_SECONDS,
      );

    if (
      latest &&
      elapsedSeconds <
        RESEND_COOLDOWN_SECONDS
    ) {
      const retryAfterSeconds =
        Math.max(
          RESEND_COOLDOWN_SECONDS -
            elapsedSeconds,
          1,
        );

      throw createServiceError(
        `নতুন OTP পেতে ${retryAfterSeconds} সেকেন্ড অপেক্ষা করুন।`,
        429,
        {
          retryAfterSeconds,
        },
      );
    }

    const [hourlyRows] =
      await connection.execute(
        `
        SELECT
          COUNT(*) AS total
        FROM password_reset_otps
        WHERE user_id = ?
          AND created_at >=
            DATE_SUB(
              NOW(),
              INTERVAL 1 HOUR
            )
        `,
        [user.id],
      );

    const hourlyRequests =
      Number(
        hourlyRows[0]?.total || 0,
      );

    if (
      hourlyRequests >=
      MAX_REQUESTS_PER_HOUR
    ) {
      throw createServiceError(
        "অনেকবার OTP request করা হয়েছে। এক ঘণ্টা পরে চেষ্টা করুন।",
        429,
      );
    }

    /*
     * আগের active request বাতিল।
     */
    await connection.execute(
      `
      UPDATE password_reset_otps
      SET consumed_at = NOW()
      WHERE user_id = ?
        AND consumed_at IS NULL
      `,
      [user.id],
    );

    const otpHash =
      hashSecret(
        `${requestId}:${otp}`,
      );

    const [insertResult] =
      await connection.execute(
        `
        INSERT INTO password_reset_otps (
          user_id,
          email,
          request_id,
          otp_hash,
          attempt_count,
          expires_at,
          last_sent_at
        )
        VALUES (
          ?,
          ?,
          ?,
          ?,
          0,
          DATE_ADD(
            NOW(),
            INTERVAL ${OTP_EXPIRY_MINUTES} MINUTE
          ),
          NOW()
        )
        `,
        [
          user.id,
          user.email,
          requestId,
          otpHash,
        ],
      );

    resetRowId =
      Number(insertResult.insertId);

    await connection.commit();

    try {
      await sendPasswordResetEmail({
        recipientEmail:
          user.email,

        otp,
      });
    } catch (error) {
      await pool.execute(
        `
        DELETE FROM password_reset_otps
        WHERE id = ?
          AND request_id = ?
        `,
        [
          resetRowId,
          requestId,
        ],
      );

      throw error;
    }

    return {
      requestId,

      maskedEmail:
        maskEmail(user.email),

      expiresInSeconds:
        OTP_EXPIRY_MINUTES * 60,

      resendAfterSeconds:
        RESEND_COOLDOWN_SECONDS,
    };
  } catch (error) {
    if (
      connection.connection
        ?._closing !== true
    ) {
      try {
        await connection.rollback();
      } catch {
        // Transaction already completed.
      }
    }

    throw error;
  } finally {
    connection.release();
  }
}

async function verifyPasswordResetOtp({
  requestId: requestIdValue,
  otp: otpValue,
}) {
  const requestId =
    validateRequestId(
      requestIdValue,
    );

  const otp =
    validateOtp(otpValue);

  const connection =
    await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] =
      await connection.execute(
        `
        SELECT
          pro.id,
          pro.user_id,
          pro.otp_hash,
          pro.attempt_count,
          pro.expires_at,
          pro.verified_at,
          pro.consumed_at,
          u.account_status

        FROM password_reset_otps pro

        INNER JOIN users u
          ON u.id = pro.user_id

        WHERE pro.request_id = ?
        LIMIT 1
        FOR UPDATE
        `,
        [requestId],
      );

    const resetRequest =
      rows[0] || null;

    if (
      !resetRequest ||
      resetRequest.consumed_at ||
      resetRequest.account_status ===
        "banned"
    ) {
      throw createServiceError(
        "OTP invalid অথবা expired।",
        400,
      );
    }

    if (resetRequest.verified_at) {
      throw createServiceError(
        "এই OTP ইতোমধ্যে verify হয়েছে।",
        409,
      );
    }

    if (
      Number(
        resetRequest.attempt_count,
      ) >= MAX_OTP_ATTEMPTS
    ) {
      await connection.execute(
        `
        UPDATE password_reset_otps
        SET consumed_at = NOW()
        WHERE id = ?
        `,
        [resetRequest.id],
      );

      await connection.commit();

      throw createServiceError(
        "OTP attempt limit শেষ হয়েছে। নতুন OTP নিন।",
        429,
      );
    }

    const [expiryRows] =
      await connection.execute(
        `
        SELECT
          CASE
            WHEN ? <= NOW()
            THEN 1
            ELSE 0
          END AS is_expired
        `,
        [
          resetRequest.expires_at,
        ],
      );

    if (
      Boolean(
        expiryRows[0]?.is_expired,
      )
    ) {
      await connection.execute(
        `
        UPDATE password_reset_otps
        SET consumed_at = NOW()
        WHERE id = ?
        `,
        [resetRequest.id],
      );

      await connection.commit();

      throw createServiceError(
        "OTP expired হয়েছে। নতুন OTP নিন।",
        400,
      );
    }

    const calculatedOtpHash =
      hashSecret(
        `${requestId}:${otp}`,
      );

    const otpMatched =
      compareSecretHash(
        calculatedOtpHash,
        resetRequest.otp_hash,
      );

    if (!otpMatched) {
      await connection.execute(
        `
        UPDATE password_reset_otps
        SET
          attempt_count =
            attempt_count + 1,

          consumed_at =
            CASE
              WHEN attempt_count + 1 >= ?
              THEN NOW()
              ELSE consumed_at
            END
        WHERE id = ?
        `,
        [
          MAX_OTP_ATTEMPTS,
          resetRequest.id,
        ],
      );

      await connection.commit();

      throw createServiceError(
        "OTP সঠিক নয়।",
        400,
      );
    }

    const resetToken =
      generateResetToken();

    const resetTokenHash =
      hashSecret(
        `${requestId}:${resetToken}`,
      );

    await connection.execute(
      `
      UPDATE password_reset_otps
      SET
        verified_at = NOW(),

        reset_token_hash = ?,

        reset_token_expires_at =
          DATE_ADD(
            NOW(),
            INTERVAL ${RESET_TOKEN_EXPIRY_MINUTES} MINUTE
          )

      WHERE id = ?
      `,
      [
        resetTokenHash,
        resetRequest.id,
      ],
    );

    await connection.commit();

    return {
      requestId,
      resetToken,

      expiresInSeconds:
        RESET_TOKEN_EXPIRY_MINUTES *
        60,
    };
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // Transaction already completed.
    }

    throw error;
  } finally {
    connection.release();
  }
}

async function resetPasswordWithToken({
  requestId: requestIdValue,
  resetToken: resetTokenValue,
  newPassword: newPasswordValue,
}) {
  const requestId =
    validateRequestId(
      requestIdValue,
    );

  const resetToken =
    validateResetToken(
      resetTokenValue,
    );

  const newPassword =
    validateNewPassword(
      newPasswordValue,
    );

  const passwordHash =
    await bcrypt.hash(
      newPassword,
      PASSWORD_HASH_ROUNDS,
    );

  const connection =
    await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] =
      await connection.execute(
        `
        SELECT
          pro.id,
          pro.user_id,
          pro.reset_token_hash,
          pro.reset_token_expires_at,
          pro.verified_at,
          pro.consumed_at,
          u.account_status

        FROM password_reset_otps pro

        INNER JOIN users u
          ON u.id = pro.user_id

        WHERE pro.request_id = ?
        LIMIT 1
        FOR UPDATE
        `,
        [requestId],
      );

    const resetRequest =
      rows[0] || null;

    if (
      !resetRequest ||
      !resetRequest.verified_at ||
      !resetRequest.reset_token_hash ||
      resetRequest.consumed_at ||
      resetRequest.account_status ===
        "banned"
    ) {
      throw createServiceError(
        "Password reset session invalid অথবা expired।",
        400,
      );
    }

    const [expiryRows] =
      await connection.execute(
        `
        SELECT
          CASE
            WHEN ? <= NOW()
            THEN 1
            ELSE 0
          END AS is_expired
        `,
        [
          resetRequest
            .reset_token_expires_at,
        ],
      );

    if (
      Boolean(
        expiryRows[0]?.is_expired,
      )
    ) {
      await connection.execute(
        `
        UPDATE password_reset_otps
        SET consumed_at = NOW()
        WHERE id = ?
        `,
        [resetRequest.id],
      );

      await connection.commit();

      throw createServiceError(
        "Password reset session expired। নতুন OTP নিন।",
        400,
      );
    }

    const calculatedTokenHash =
      hashSecret(
        `${requestId}:${resetToken}`,
      );

    const tokenMatched =
      compareSecretHash(
        calculatedTokenHash,
        resetRequest.reset_token_hash,
      );

    if (!tokenMatched) {
      throw createServiceError(
        "Password reset token সঠিক নয়।",
        400,
      );
    }

    await connection.execute(
      `
      UPDATE users
      SET
        password_hash = ?,
        is_online = 0
      WHERE id = ?
      `,
      [
        passwordHash,
        resetRequest.user_id,
      ],
    );

    await connection.execute(
      `
      UPDATE password_reset_otps
      SET
        consumed_at = NOW(),
        otp_hash = '',
        reset_token_hash = NULL
      WHERE id = ?
      `,
      [resetRequest.id],
    );

    await connection.commit();

    return {
      success: true,
    };
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // Transaction already completed.
    }

    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  requestPasswordResetOtp,
  verifyPasswordResetOtp,
  resetPasswordWithToken,
};