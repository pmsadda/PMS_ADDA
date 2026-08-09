const crypto = require("crypto");
const bcrypt = require("bcrypt");

const {
    pool
} = require("../config/database");

/* ==========================
   Generate User UID
========================== */

async function generateUserUid(
    connection
) {
    const [rows] =
        await connection.execute(
            `
            SELECT id
            FROM users
            ORDER BY id DESC
            LIMIT 1
            FOR UPDATE
            `
        );

    const lastId =
        rows.length > 0
            ? Number(rows[0].id)
            : 0;

    const nextNumber =
        100001 + lastId;

    return `PMS${nextNumber}`;
}

/* ==========================
   Generate Referral Code
========================== */

function createReferralCodeCandidate() {
    const randomPart =
        crypto
            .randomBytes(4)
            .toString("hex")
            .toUpperCase();

    return `PMS${randomPart}`;
}

async function generateUniqueReferralCode(
    connection
) {
    for (
        let attempt = 0;
        attempt < 10;
        attempt += 1
    ) {
        const referralCode =
            createReferralCodeCandidate();

        const [rows] =
            await connection.execute(
                `
                SELECT id
                FROM users
                WHERE referral_code = ?
                LIMIT 1
                `,
                [referralCode]
            );

        if (rows.length === 0) {
            return referralCode;
        }
    }

    const error = new Error(
        "Unable to generate a unique referral code."
    );

    error.statusCode = 500;

    throw error;
}

/* ==========================
   Check Existing User
========================== */

async function findExistingUser(
    {
        username,
        phone,
        email
    },
    executor = pool
) {
    const [rows] =
        await executor.execute(
            `
            SELECT
                id,
                username,
                phone,
                email
            FROM users
            WHERE username = ?
               OR phone = ?
               OR email = ?
            LIMIT 1
            `,
            [
                username,
                phone,
                email
            ]
        );

    return rows[0] || null;
}

/* ==========================
   Normalize Referral Code
========================== */

function normalizeReferralCode(value) {
    return String(value || "")
        .trim()
        .toUpperCase();
}

/* ==========================
   Create User
========================== */

async function createUser({
    fullName,
    username,
    phone,
    email,
    password,
    referralCode = ""
}) {
    const cleanedReferralCode =
        normalizeReferralCode(
            referralCode
        );

    if (
        cleanedReferralCode &&
        !/^PMS[A-Z0-9]{6,17}$/.test(
            cleanedReferralCode
        )
    ) {
        const error = new Error(
            "Invalid referral code."
        );

        error.statusCode = 400;
        throw error;
    }

    /*
     * Password hashing database
     * transaction-এর বাইরে রাখা হয়েছে।
     */
    const passwordHash =
        await bcrypt.hash(
            password,
            12
        );

    const connection =
        await pool.getConnection();

    try {
        await connection.beginTransaction();

        /*
         * Transaction-এর ভিতরে duplicate
         * account আবার যাচাই করা হচ্ছে।
         */
        const existingUser =
            await findExistingUser(
                {
                    username,
                    phone,
                    email
                },
                connection
            );

        if (existingUser) {
            const error = new Error(
                "Username, phone or email already exists."
            );

            error.statusCode = 409;
            throw error;
        }

        let referrer = null;

        if (cleanedReferralCode) {
            const [settingRows] =
                await connection.execute(
                    `
                    SELECT
                        is_enabled
                    FROM referral_settings
                    WHERE id = 1
                    LIMIT 1
                    `
                );

            const referralEnabled =
                Boolean(
                    settingRows[0]
                        ?.is_enabled
                );

            if (!referralEnabled) {
                const error = new Error(
                    "Referral program is currently unavailable."
                );

                error.statusCode = 409;
                throw error;
            }

            /*
             * Referrer lock:
             * শুধু active real user-এর code
             * ব্যবহার করা যাবে।
             */
            const [referrerRows] =
                await connection.execute(
                    `
                    SELECT
                        id,
                        referral_code
                    FROM users
                    WHERE referral_code = ?
                      AND role = 'user'
                      AND account_status =
                          'active'
                    LIMIT 1
                    FOR UPDATE
                    `,
                    [cleanedReferralCode]
                );

            referrer =
                referrerRows[0] || null;

            if (!referrer) {
                const error = new Error(
                    "Referral code was not found."
                );

                error.statusCode = 400;
                throw error;
            }
        }

        const uid =
            await generateUserUid(
                connection
            );

        const ownReferralCode =
            await generateUniqueReferralCode(
                connection
            );

        const [result] =
            await connection.execute(
                `
                INSERT INTO users (
                    uid,
                    referral_code,
                    full_name,
                    username,
                    phone,
                    email,
                    password_hash,
                    role,
                    account_status,
                    wallet_balance
                )
                VALUES (
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    'user',
                    'active',
                    0.00
                )
                `,
                [
                    uid,
                    ownReferralCode,
                    fullName,
                    username,
                    phone,
                    email,
                    passwordHash
                ]
            );

        const userId =
            Number(result.insertId);

        /*
         * Referral relation শুধু একবার
         * registration-এর সময় save হবে।
         */
        if (referrer) {
            await connection.execute(
                `
                INSERT INTO user_referrals (
                    referrer_user_id,
                    referred_user_id,
                    referral_code_used,
                    status
                )
                VALUES (
                    ?,
                    ?,
                    ?,
                    'pending'
                )
                `,
                [
                    Number(referrer.id),
                    userId,
                    cleanedReferralCode
                ]
            );
        }

        await connection.commit();

        return {
            id: userId,
            uid,
            referralCode:
                ownReferralCode,
            referralApplied:
                Boolean(referrer),
            fullName,
            username,
            phone,
            email,
            role: "user",
            accountStatus: "active",
            walletBalance: 0
        };
    } catch (error) {
        await connection.rollback();

        if (
            error.code ===
                "ER_DUP_ENTRY" &&
            !error.statusCode
        ) {
            const duplicateError =
                new Error(
                    "Username, phone, email or referral information already exists."
                );

            duplicateError.statusCode =
                409;

            throw duplicateError;
        }

        throw error;
    } finally {
        connection.release();
    }
}

/* ==========================
   Find User for Login
========================== */

async function findUserForLogin(
    identity
) {
    const [rows] =
        await pool.execute(
            `
            SELECT
                id,
                uid,
                referral_code,
                full_name,
                username,
                phone,
                email,
                password_hash,
                role,
                account_status,
                wallet_balance
            FROM users
            WHERE username = ?
               OR phone = ?
               OR email = ?
            LIMIT 1
            `,
            [
                identity,
                identity,
                identity
            ]
        );

    return rows[0] || null;
}

/* ==========================
   Login User
========================== */

async function loginUser({
    identity,
    password
}) {
    const user =
        await findUserForLogin(
            identity
        );

    if (!user) {
        const error = new Error(
            "Username, phone, email or password is incorrect."
        );

        error.statusCode = 401;
        throw error;
    }

    if (
        user.account_status ===
        "banned"
    ) {
        const error = new Error(
            "Your account has been banned."
        );

        error.statusCode = 403;
        throw error;
    }

    const passwordMatched =
        await bcrypt.compare(
            password,
            user.password_hash
        );

    if (!passwordMatched) {
        const error = new Error(
            "Username, phone, email or password is incorrect."
        );

        error.statusCode = 401;
        throw error;
    }

    await pool.execute(
        `
        UPDATE users
        SET
            is_online = 1,
            last_login_at = NOW()
        WHERE id = ?
        `,
        [user.id]
    );

    return {
        id: user.id,
        uid: user.uid,
        referralCode:
            user.referral_code,
        fullName: user.full_name,
        username: user.username,
        phone: user.phone,
        email: user.email,
        role: user.role,
        accountStatus:
            user.account_status,
        walletBalance:
            Number(
                user.wallet_balance
            )
    };
}

async function getUserReferralSummary(
    userId
) {
    const validUserId =
        Number(userId);

    if (
        !Number.isInteger(validUserId) ||
        validUserId <= 0
    ) {
        const error = new Error(
            "Invalid referral user ID."
        );

        error.statusCode = 400;
        throw error;
    }

    const [
        userResult,
        settingResult,
        statsResult
    ] = await Promise.all([
        pool.execute(
            `
            SELECT
                referral_code
            FROM users
            WHERE id = ?
              AND role = 'user'
            LIMIT 1
            `,
            [validUserId]
        ),

        pool.execute(
            `
            SELECT
                is_enabled,
                referrer_bonus,
                referred_user_bonus,
                minimum_first_deposit
            FROM referral_settings
            WHERE id = 1
            LIMIT 1
            `
        ),

        pool.execute(
            `
            SELECT
                COUNT(*) AS total,

                COALESCE(
                    SUM(
                        CASE
                            WHEN status = 'pending'
                            THEN 1
                            ELSE 0
                        END
                    ),
                    0
                ) AS pending,

                COALESCE(
                    SUM(
                        CASE
                            WHEN status = 'rewarded'
                            THEN 1
                            ELSE 0
                        END
                    ),
                    0
                ) AS rewarded,

                COALESCE(
                    SUM(
                        CASE
                            WHEN status = 'cancelled'
                            THEN 1
                            ELSE 0
                        END
                    ),
                    0
                ) AS cancelled,

                COALESCE(
                    SUM(
                        CASE
                            WHEN status = 'rewarded'
                            THEN referrer_bonus_amount
                            ELSE 0
                        END
                    ),
                    0
                ) AS earned_bonus

            FROM user_referrals
            WHERE referrer_user_id = ?
            `,
            [validUserId]
        )
    ]);

    const user =
        userResult[0][0] || null;

    if (!user) {
        const error = new Error(
            "Referral user was not found."
        );

        error.statusCode = 404;
        throw error;
    }

    const settings =
        settingResult[0][0] || {};

    const stats =
        statsResult[0][0] || {};

    return {
        referralCode:
            user.referral_code,

        settings: {
            isEnabled:
                Boolean(
                    settings.is_enabled
                ),

            referrerBonus:
                Number(
                    settings.referrer_bonus ||
                    0
                ),

            referredUserBonus:
                Number(
                    settings
                        .referred_user_bonus ||
                    0
                ),

            minimumFirstDeposit:
                Number(
                    settings
                        .minimum_first_deposit ||
                    0
                )
        },

        stats: {
            total:
                Number(stats.total || 0),

            pending:
                Number(stats.pending || 0),

            rewarded:
                Number(
                    stats.rewarded || 0
                ),

            cancelled:
                Number(
                    stats.cancelled || 0
                ),

            earnedBonus:
                Number(
                    stats.earned_bonus || 0
                )
        }
    };
}

/* ==========================
   Mark User Offline
========================== */

async function markUserOffline(
    userId
) {
    const validUserId =
        Number(userId);

    if (
        !Number.isInteger(validUserId) ||
        validUserId <= 0
    ) {
        const error = new Error(
            "Invalid user ID."
        );

        error.statusCode = 400;

        throw error;
    }

    await pool.execute(
        `
        UPDATE users
        SET is_online = 0
        WHERE id = ?
        `,
        [validUserId]
    );

    return true;
}

module.exports = {
    createUser,
    loginUser,
    getUserReferralSummary,
    markUserOffline
};