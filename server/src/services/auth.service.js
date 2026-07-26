const bcrypt = require("bcrypt");
const { pool } = require("../config/database");

/* ==========================
   Generate User UID
========================== */

async function generateUserUid() {
    const [rows] = await pool.execute(
        `
        SELECT id
        FROM users
        ORDER BY id DESC
        LIMIT 1
        `
    );

    const lastId = rows.length > 0
        ? Number(rows[0].id)
        : 0;

    const nextNumber = 100001 + lastId;

    return `PMS${nextNumber}`;
}

/* ==========================
   Check Existing User
========================== */

async function findExistingUser({
    username,
    phone,
    email
}) {
    const [rows] = await pool.execute(
        `
        SELECT id, username, phone, email
        FROM users
        WHERE username = ?
           OR phone = ?
           OR email = ?
        LIMIT 1
        `,
        [username, phone, email]
    );

    return rows[0] || null;
}

/* ==========================
   Create User
========================== */

async function createUser({
    fullName,
    username,
    phone,
    email,
    password
}) {
    const existingUser = await findExistingUser({
        username,
        phone,
        email
    });

    if (existingUser) {
        const error = new Error(
            "Username, phone or email already exists."
        );

        error.statusCode = 409;

        throw error;
    }

    const uid = await generateUserUid();

    const passwordHash = await bcrypt.hash(
        password,
        12
    );

    const [result] = await pool.execute(
        `
        INSERT INTO users (
            uid,
            full_name,
            username,
            phone,
            email,
            password_hash,
            role,
            account_status,
            wallet_balance
        )
        VALUES (?, ?, ?, ?, ?, ?, 'user', 'active', 0.00)
        `,
        [
            uid,
            fullName,
            username,
            phone,
            email,
            passwordHash
        ]
    );

    return {
        id: result.insertId,
        uid,
        fullName,
        username,
        phone,
        email,
        role: "user",
        accountStatus: "active",
        walletBalance: 0
    };
}

/* ==========================
   Find User for Login
========================== */

async function findUserForLogin(identity) {
    const [rows] = await pool.execute(
        `
        SELECT
            id,
            uid,
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
        [identity, identity, identity]
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
    const user = await findUserForLogin(identity);

    if (!user) {
        const error = new Error(
            "Username, phone, email or password is incorrect."
        );

        error.statusCode = 401;

        throw error;
    }

    if (user.account_status === "banned") {
        const error = new Error(
            "Your account has been banned."
        );

        error.statusCode = 403;

        throw error;
    }

    const passwordMatched = await bcrypt.compare(
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
        fullName: user.full_name,
        username: user.username,
        phone: user.phone,
        email: user.email,
        role: user.role,
        accountStatus: user.account_status,
        walletBalance: Number(
            user.wallet_balance
        )
    };
}

module.exports = {
    createUser,
    loginUser
};