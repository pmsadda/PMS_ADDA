const { pool } = require("../config/database");

function generateWalletTransactionId() {
  const timestamp = Date.now();

  const randomNumber = Math.floor(100000 + Math.random() * 900000);

  return `WDR-TX-${timestamp}-${randomNumber}`;
}

/* ==========================
   Create Withdraw Request
========================== */

async function createWithdrawRequest(userId, data) {
  const method = String(data?.method || "")
    .trim()
    .toLowerCase();

  const accountNumber = String(data?.accountNumber || "").trim();

  const lastFourDigits = String(data?.lastFourDigits || "").trim();

  const numericAmount = Number(data?.amount);

  const withdrawAmount = Number.isFinite(numericAmount)
    ? Number(numericAmount.toFixed(2))
    : 0;

  const allowedMethods = ["bkash", "nagad", "rocket"];

  if (!allowedMethods.includes(method)) {
    const error = new Error("Invalid payment method.");

    error.statusCode = 400;
    throw error;
  }

  if (!/^01\d{9}$/.test(accountNumber)) {
    const error = new Error("A valid 11-digit account number is required.");

    error.statusCode = 400;
    throw error;
  }

  if (!/^\d{4}$/.test(lastFourDigits)) {
    const error = new Error("Last four digits must be exactly 4 numbers.");

    error.statusCode = 400;
    throw error;
  }

  if (accountNumber.slice(-4) !== lastFourDigits) {
    const error = new Error(
      "Last four digits do not match the account number.",
    );

    error.statusCode = 400;
    throw error;
  }


  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

        /*
     * Admin-controlled minimum withdrawal amount।
     */
    const [withdrawSettingRows] = await connection.execute(
      `
      SELECT minimum_withdraw_amount
      FROM withdraw_settings
      WHERE id = 1
      LIMIT 1
      FOR UPDATE
      `,
    );

    const withdrawSetting = withdrawSettingRows[0] || null;

    if (!withdrawSetting) {
      const error = new Error(
        "Withdrawal settings were not found.",
      );

      error.statusCode = 500;
      throw error;
    }

    const minimumWithdrawAmount = Number(
      withdrawSetting.minimum_withdraw_amount,
    );

    if (
      !Number.isFinite(minimumWithdrawAmount) ||
      minimumWithdrawAmount < 1 ||
      minimumWithdrawAmount > 1000000
    ) {
      const error = new Error(
        "Minimum withdrawal setting is invalid.",
      );

      error.statusCode = 500;
      throw error;
    }

    if (withdrawAmount < minimumWithdrawAmount) {
      const error = new Error(
        `Minimum withdrawal amount is ৳${minimumWithdrawAmount.toFixed(2)}.`,
      );

      error.statusCode = 400;
      error.code = "WITHDRAW_BELOW_MINIMUM";
      error.minimumWithdrawAmount = minimumWithdrawAmount;

      throw error;
    }

    const [users] = await connection.execute(
      `
        SELECT
          id,
          wallet_balance,
                    total_deposit,
          turnover_amount,
          turnover_required,
          signup_bonus_active,
          account_status
        FROM users
        WHERE id = ?
        LIMIT 1
        FOR UPDATE
        `,
      [userId],
    );

    if (!users.length) {
      const error = new Error("User not found.");

      error.statusCode = 404;
      throw error;
    }

    const user = users[0];

    if (user.account_status !== "active") {
      const error = new Error("Your account is not active.");

      error.statusCode = 403;
      throw error;
    }

    const currentBalance = Number(user.wallet_balance);

    const totalDeposit = Number(user.total_deposit || 0);

    const turnoverAmount = Number(user.turnover_amount || 0);

    const turnoverRequired = Number(user.turnover_required || 0);

        const signupBonusActive = Boolean(user.signup_bonus_active);

    if (
      !Number.isFinite(currentBalance) ||
      !Number.isFinite(totalDeposit) ||
      !Number.isFinite(turnoverAmount) ||
      !Number.isFinite(turnoverRequired)
    ) {
      const error = new Error("Invalid wallet account values.");

      error.statusCode = 500;
      throw error;
    }

        /*
     * Signup bonus এবং সেটি দিয়ে অর্জিত টাকা
     * deposit করার আগে withdraw করা যাবে না।
     */
    if (signupBonusActive) {
      const error = new Error(
        "Signup bonus withdraw করা যাবে না। Withdraw করতে প্রথমে deposit করুন।",
      );

      error.statusCode = 400;
      error.code = "SIGNUP_BONUS_WITHDRAW_BLOCKED";

      throw error;
    }

    if (turnoverAmount < turnoverRequired) {
      const remainingTurnover = Math.max(0, turnoverRequired - turnoverAmount);

      const error = new Error(
        `Complete ৳${remainingTurnover.toFixed(
          2,
        )} more turnover before withdrawing.`,
      );

      error.statusCode = 400;
      error.code = "WITHDRAW_TURNOVER_INCOMPLETE";

      error.turnover = {
        completed: turnoverAmount,

        required: turnoverRequired,

        remaining: remainingTurnover,
      };

      throw error;
    }

    if (withdrawAmount > currentBalance) {
      const error = new Error("Insufficient wallet balance.");

      error.statusCode = 400;
      throw error;
    }

    const [pendingRequests] = await connection.execute(
      `
        SELECT id
        FROM withdraw_requests
        WHERE user_id = ?
          AND status = 'pending'
        LIMIT 1
        `,
      [userId],
    );

    if (pendingRequests.length) {
      const error = new Error("You already have a pending withdrawal request.");

      error.statusCode = 400;
      throw error;
    }

    const remainingBalance = currentBalance - withdrawAmount;

    await connection.execute(
      `
      UPDATE users
      SET wallet_balance = ?
      WHERE id = ?
      `,
      [remainingBalance, userId],
    );

    const withdrawId = `WDR-${Date.now()}-${Math.floor(
      100000 + Math.random() * 900000,
    )}`;

    const [withdrawResult] = await connection.execute(
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
          turnover_required_at_request,
          status
        )
        VALUES (
  ?,
  ?,
  ?,
  ?,
  ?,
  ?,
  ?,
  ?,
  ?,
  'pending'
)
`,
      [
        withdrawId,
        userId,
        method,
        accountNumber,
        withdrawAmount,
        lastFourDigits,
        totalDeposit,
        turnoverAmount,
        turnoverRequired,
      ],
    );

    const walletTransactionId = generateWalletTransactionId();

    const [transactionResult] = await connection.execute(
      `
        INSERT INTO wallet_transactions (
          transaction_id,
          user_id,
          transaction_type,
          direction,
          amount,
          balance_before,
          balance_after,
          status,
          reference_type,
          reference_id,
          description,
          created_by
        )
        VALUES (
          ?,
          ?,
          'withdraw',
          'debit',
          ?,
          ?,
          ?,
          'pending',
          'withdraw_request',
          ?,
          ?,
          NULL
        )
        `,
      [
        walletTransactionId,
        userId,
        withdrawAmount,
        currentBalance,
        remainingBalance,
        withdrawId,
        `Withdrawal requested: ${withdrawId}`,
      ],
    );

    if (transactionResult.affectedRows !== 1) {
      throw new Error("Wallet transaction creation failed.");
    }

    await connection.commit();

    return {
      id: withdrawResult.insertId,
      withdrawId,
      method,
      accountNumber,
      amount: withdrawAmount,
      lastFourDigits,
      status: "pending",
      totalDepositAtRequest: totalDeposit,
      turnoverAtRequest: turnoverAmount,

      turnoverRequiredAtRequest: turnoverRequired,

      remainingTurnover: Math.max(0, turnoverRequired - turnoverAmount),

      remainingBalance,
      walletTransactionId,
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
  const [rows] = await pool.execute(
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
    [userId],
  );

  return rows.map((item) => ({
    id: item.id,

    withdrawId: item.withdraw_id,

    method: item.method,

    accountNumber: item.account_number,

    amount: Number(item.amount),

    lastFourDigits: item.last_four_digits,

    status: item.status,

    adminNote: item.admin_note,

    createdAt: item.created_at,

    updatedAt: item.updated_at,
  }));
}

module.exports = {
  createWithdrawRequest,
  getMyWithdrawHistory,
};
