const { pool } = require("../config/database");

/* ==========================
   Create Withdraw Request
========================== */

async function createWithdrawRequest(userId, data) {
  const {
    method,
    accountNumber,
    amount,
    lastFourDigits
  } = data;

  const withdrawAmount = Number(amount);

  const allowedMethods = [
    "bkash",
    "nagad",
    "rocket"
  ];

  if (!allowedMethods.includes(method)) {
    const error = new Error(
      "Invalid payment method."
    );

    error.statusCode = 400;
    throw error;
  }

  if (
    !accountNumber ||
    accountNumber.length < 10
  ) {
    const error = new Error(
      "Valid account number is required."
    );

    error.statusCode = 400;
    throw error;
  }

  if (
    !lastFourDigits ||
    !/^\d{4}$/.test(lastFourDigits)
  ) {
    const error = new Error(
      "Last four digits must be exactly 4 numbers."
    );

    error.statusCode = 400;
    throw error;
  }

  if (
    !withdrawAmount ||
    withdrawAmount < 100
  ) {
    const error = new Error(
      "Minimum withdrawal amount is 100."
    );

    error.statusCode = 400;
    throw error;
  }

  const connection =
    await pool.getConnection();

  try {
    await connection.beginTransaction();

    /* User wallet lock */

    const [users] =
      await connection.execute(
        `
        SELECT
          id,
          wallet_balance,
          account_status
        FROM users
        WHERE id = ?
        LIMIT 1
        FOR UPDATE
        `,
        [userId]
      );

    if (!users.length) {
      const error = new Error(
        "User not found."
      );

      error.statusCode = 404;
      throw error;
    }

    const user = users[0];

    if (user.account_status !== "active") {
      const error = new Error(
        "Your account is not active."
      );

      error.statusCode = 403;
      throw error;
    }

    const currentBalance =
      Number(user.wallet_balance);

    if (withdrawAmount > currentBalance) {
      const error = new Error(
        "Insufficient wallet balance."
      );

      error.statusCode = 400;
      throw error;
    }

    /* Check existing pending request */

    const [pendingRequests] =
      await connection.execute(
        `
        SELECT id
        FROM withdraw_requests
        WHERE user_id = ?
          AND status = 'pending'
        LIMIT 1
        `,
        [userId]
      );

    if (pendingRequests.length) {
      const error = new Error(
        "You already have a pending withdrawal request."
      );

      error.statusCode = 400;
      throw error;
    }

    /* Deduct balance */

    await connection.execute(
      `
      UPDATE users
      SET wallet_balance =
        wallet_balance - ?
      WHERE id = ?
      `,
      [
        withdrawAmount,
        userId
      ]
    );

    /* Create unique withdraw ID */

    const withdrawId =
      `WDR-${Date.now()}-${Math.floor(
        100000 + Math.random() * 900000
      )}`;

    /* Create withdrawal request */

    const [withdrawResult] =
      await connection.execute(
        `
        INSERT INTO withdraw_requests (
          withdraw_id,
          user_id,
          method,
          account_number,
          amount,
          last_four_digits,
          total_deposit_at_request,
          turnover_at_request,
          status
        )
        VALUES (
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          0,
          0,
          'pending'
        )
        `,
        [
          withdrawId,
          userId,
          method,
          accountNumber,
          withdrawAmount,
          lastFourDigits
        ]
      );

    await connection.commit();

    return {
      id: withdrawResult.insertId,
      withdrawId,
      method,
      accountNumber,
      amount: withdrawAmount,
      lastFourDigits,
      status: "pending",
      remainingBalance:
        currentBalance - withdrawAmount
    };

  } catch (error) {
    await connection.rollback();
    throw error;

  } finally {
    connection.release();
  }
}

/* ==========================
   Get My Withdraw History
========================== */

async function getMyWithdrawHistory(userId) {
  const [rows] =
    await pool.execute(
      `
      SELECT
        id,
        withdraw_id,
        method,
        account_number,
        amount,
        last_four_digits,
        status,
        admin_note,
        created_at,
        updated_at
      FROM withdraw_requests
      WHERE user_id = ?
      ORDER BY id DESC
      `,
      [userId]
    );

  return rows.map((item) => ({
    id: item.id,

    withdrawId:
      item.withdraw_id,

    method:
      item.method,

    accountNumber:
      item.account_number,

    amount:
      Number(item.amount),

    lastFourDigits:
      item.last_four_digits,

    status:
      item.status,

    adminNote:
      item.admin_note,

    createdAt:
      item.created_at,

    updatedAt:
      item.updated_at
  }));
}

module.exports = {
  createWithdrawRequest,
  getMyWithdrawHistory
};