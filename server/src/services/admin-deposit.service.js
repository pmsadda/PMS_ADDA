const { pool } = require("../config/database");

/* ==========================
   Get All Deposit Requests
========================== */

async function getAllDepositRequests({
  status = "all",
  method = "all",
  search = "",
}) {
  const conditions = [];
  const values = [];

  if (status !== "all") {
    conditions.push("d.status = ?");
    values.push(status);
  }

  if (method !== "all") {
    conditions.push("d.method = ?");
    values.push(method);
  }

  if (search) {
    conditions.push(`
            (
                u.full_name LIKE ?
                OR u.uid LIKE ?
                OR u.phone LIKE ?
                OR d.deposit_id LIKE ?
                OR d.transaction_number LIKE ?
            )
        `);

    const searchValue = `%${search}%`;

    values.push(
      searchValue,
      searchValue,
      searchValue,
      searchValue,
      searchValue,
    );
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const [rows] = await pool.execute(
    `
        SELECT
            d.id,
            d.deposit_id,
            d.user_id,
            d.method,
            d.sender_number,
            d.transaction_number,
            d.amount,
            d.bonus_amount,
            d.credited_amount,
            d.is_first_deposit_bonus,
            d.status,
            d.admin_note,
            d.approved_by,
            d.approved_at,
            d.created_at,

            u.uid,
            u.full_name,
            u.phone,
            u.email,
            u.wallet_balance
        FROM deposit_requests AS d
        INNER JOIN users AS u
            ON u.id = d.user_id

        ${whereClause}

        ORDER BY
            CASE
                WHEN d.status = 'pending' THEN 0
                ELSE 1
            END,
            d.id DESC
        `,
    values,
  );

  return rows.map((row) => ({
    id: row.id,
    depositId: row.deposit_id,
    userId: row.user_id,
    userUid: row.uid,
    fullName: row.full_name,
    userPhone: row.phone,
    email: row.email,
    currentWalletBalance: Number(row.wallet_balance),
    method: row.method,
    senderNumber: row.sender_number,
    transactionNumber: row.transaction_number,
    amount: Number(row.amount),

    bonusAmount: Number(row.bonus_amount || 0),

    creditedAmount: Number(row.credited_amount || 0),

    isFirstDepositBonus: Boolean(row.is_first_deposit_bonus),

    status: row.status,
    adminNote: row.admin_note,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    createdAt: row.created_at,
  }));
}

/* ==========================
   Generate Wallet Transaction ID
========================== */

function generateWalletTransactionId() {
  const timestamp = Date.now();

  const random = Math.floor(1000 + Math.random() * 9000);

  return `WTX${timestamp}${random}`;
}

const FIRST_DEPOSIT_BONUS_RATE = 0.5;
const FIRST_DEPOSIT_BONUS_CAP = 2000;

function roundDepositMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function calculateFirstDepositBonus(depositAmount) {
  const validAmount = roundDepositMoney(depositAmount);

  if (validAmount <= 0) {
    return 0;
  }

  return roundDepositMoney(
    Math.min(validAmount * FIRST_DEPOSIT_BONUS_RATE, FIRST_DEPOSIT_BONUS_CAP),
  );
}

/* ==========================
   Approve Deposit
========================== */

async function approveDepositRequest({ depositId, adminId }) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    /*
     * Deposit request lock:
     * একই request দুইবার approve হবে না।
     */
    const [depositRows] = await connection.execute(
      `
                SELECT
                    id,
                    deposit_id,
                    user_id,
                    amount,
                    status
                FROM deposit_requests
                WHERE deposit_id = ?
                LIMIT 1
                FOR UPDATE
                `,
      [depositId],
    );

    const deposit = depositRows[0];

    if (!deposit) {
      const error = new Error("Deposit request not found.");

      error.statusCode = 404;
      throw error;
    }

    if (deposit.status !== "pending") {
      const error = new Error(
        "This deposit request has already been processed.",
      );

      error.statusCode = 409;
      throw error;
    }

    /*
     * User row lock:
     * একই user-এর দুইটি pending deposit
     * একসঙ্গে approve হলেও শুধু প্রথমটি
     * bonus পাবে।
     */
    const [userRows] = await connection.execute(
      `
                SELECT
                    id,
                    wallet_balance,
                    total_deposit,
                    turnover_required
                FROM users
                WHERE id = ?
                LIMIT 1
                FOR UPDATE
                `,
      [deposit.user_id],
    );

    const user = userRows[0];

    if (!user) {
      const error = new Error("Deposit user not found.");

      error.statusCode = 404;
      throw error;
    }

    /*
     * Locking read ব্যবহার করা হচ্ছে।
     * আগে কোনো approved deposit থাকলে
     * এটি first deposit নয়।
     */
    const [previousDepositRows] = await connection.execute(
      `
                SELECT id
                FROM deposit_requests
                WHERE user_id = ?
                  AND status = 'approved'
                  AND id != ?
                ORDER BY id ASC
                LIMIT 1
                FOR UPDATE
                `,
      [deposit.user_id, deposit.id],
    );

    const isFirstDeposit = previousDepositRows.length === 0;

    const amount = roundDepositMoney(deposit.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      const error = new Error("Invalid deposit amount.");

      error.statusCode = 400;
      throw error;
    }

    const bonusAmount = isFirstDeposit ? calculateFirstDepositBonus(amount) : 0;

    const creditedAmount = roundDepositMoney(amount + bonusAmount);

    const balanceBefore = roundDepositMoney(user.wallet_balance);

    const balanceAfter = roundDepositMoney(balanceBefore + creditedAmount);

    /*
     * total_deposit:
     * শুধু real deposited money।
     *
     * turnover_required:
     * deposit + applicable bonus।
     */
    const totalDepositAfter = roundDepositMoney(
      Number(user.total_deposit || 0) + amount,
    );

    const turnoverRequiredAfter = roundDepositMoney(
      Number(user.turnover_required || 0) + creditedAmount,
    );

    await connection.execute(
      `
            UPDATE users
            SET
                wallet_balance = ?,
                total_deposit = ?,
                turnover_required = ?
            WHERE id = ?
            `,
      [balanceAfter, totalDepositAfter, turnoverRequiredAfter, deposit.user_id],
    );

    /*
     * Deposit audit:
     * actual amount, bonus এবং মোট credit
     * আলাদাভাবে সংরক্ষণ হবে।
     */
    await connection.execute(
      `
            UPDATE deposit_requests
            SET
                status = 'approved',
                bonus_amount = ?,
                credited_amount = ?,
                is_first_deposit_bonus = ?,
                approved_by = ?,
                approved_at = NOW(),
                admin_note = NULL
            WHERE id = ?
            `,
      [
        bonusAmount,
        creditedAmount,
        isFirstDeposit ? 1 : 0,
        adminId,
        deposit.id,
      ],
    );

    /*
     * একটি wallet transaction রাখা হচ্ছে।
     * Transaction amount wallet balance-এর
     * আসল credit-এর সমান থাকবে।
     */
    const walletTransactionId = generateWalletTransactionId();

    const description =
      bonusAmount > 0
        ? `First deposit approved: ` +
          `${deposit.deposit_id}; ` +
          `deposit ৳${amount.toFixed(2)}, ` +
          `bonus ৳${bonusAmount.toFixed(2)}`
        : `Deposit approved: ` + deposit.deposit_id;

    await connection.execute(
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
                'deposit',
                'credit',
                ?,
                ?,
                ?,
                'completed',
                'deposit_request',
                ?,
                ?,
                ?
            )
            `,
      [
        walletTransactionId,
        deposit.user_id,
        creditedAmount,
        balanceBefore,
        balanceAfter,
        deposit.deposit_id,
        description,
        adminId,
      ],
    );

    await connection.commit();

    return {
      depositId: deposit.deposit_id,

      status: "approved",

      amount,

      bonusAmount,

      creditedAmount,

      isFirstDepositBonus: isFirstDeposit && bonusAmount > 0,

      balanceBefore,

      balanceAfter,

      totalDepositAfter,

      turnoverRequiredAfter,

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
   Reject Deposit
========================== */

async function rejectDepositRequest({ depositId, adminId, reason, note }) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute(
      `
                SELECT
                    id,
                    deposit_id,
                    status
                FROM deposit_requests
                WHERE deposit_id = ?
                LIMIT 1
                FOR UPDATE
                `,
      [depositId],
    );

    const deposit = rows[0];

    if (!deposit) {
      const error = new Error("Deposit request not found.");

      error.statusCode = 404;

      throw error;
    }

    if (deposit.status !== "pending") {
      const error = new Error(
        "This deposit request has already been processed.",
      );

      error.statusCode = 409;

      throw error;
    }

    const adminNote = note ? `${reason}: ${note}` : reason;

    await connection.execute(
      `
            UPDATE deposit_requests
            SET
                status = 'rejected',
                approved_by = ?,
                approved_at = NOW(),
                admin_note = ?
            WHERE id = ?
            `,
      [adminId, adminNote, deposit.id],
    );

    await connection.commit();

    return {
      depositId: deposit.deposit_id,
      status: "rejected",
      reason,
      note: note || null,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  getAllDepositRequests,
  approveDepositRequest,
  rejectDepositRequest,
};
