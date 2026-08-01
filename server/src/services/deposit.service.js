const { pool } = require("../config/database");

/* ==========================
   Generate Deposit ID
========================== */

function generateDepositId() {
  const time = Date.now();

  const random = Math.floor(1000 + Math.random() * 9000);

  return `DEP${time}${random}`;
}

/* ==========================
   Create Deposit Request
========================== */

async function createDepositRequest({
  userId,
  method,
  senderNumber,
  transactionNumber,
  amount,
}) {
  const [duplicateRows] = await pool.execute(
    `
        SELECT id
        FROM deposit_requests
        WHERE transaction_number = ?
        LIMIT 1
        `,
    [transactionNumber],
  );

  if (duplicateRows.length > 0) {
    const error = new Error("This transaction ID has already been used.");

    error.statusCode = 409;

    throw error;
  }

  const depositId = generateDepositId();

  const [result] = await pool.execute(
    `
        INSERT INTO deposit_requests (
            deposit_id,
            user_id,
            method,
            sender_number,
            transaction_number,
            amount,
            status
        )
        VALUES (?, ?, ?, ?, ?, ?, 'pending')
        `,
    [depositId, userId, method, senderNumber, transactionNumber, amount],
  );

  return {
    id: result.insertId,
    depositId,
    userId,
    method,
    senderNumber,
    transactionNumber,
    amount: Number(amount),
    status: "pending",
  };
}

/* ==========================
   Get User Deposits
========================== */

async function getUserDepositRequests(userId) {
  const [rows] = await pool.execute(
    `
        SELECT
            deposit_id,
            method,
            sender_number,
            transaction_number,
            amount,
            bonus_amount,
            credited_amount,
        is_first_deposit_bonus,
            status,
            admin_note,
            approved_at,
            created_at
        FROM deposit_requests
        WHERE user_id = ?
        ORDER BY id DESC
        `,
    [userId],
  );

  return rows.map((row) => ({
    depositId: row.deposit_id,
    method: row.method,
    senderNumber: row.sender_number,
    transactionNumber: row.transaction_number,
    amount: Number(row.amount),

    bonusAmount: Number(row.bonus_amount || 0),

    creditedAmount: Number(row.credited_amount || 0),

    isFirstDepositBonus: Boolean(row.is_first_deposit_bonus),

    status: row.status,
    adminNote: row.admin_note,
    approvedAt: row.approved_at,
    createdAt: row.created_at,
  }));
}

module.exports = {
  createDepositRequest,
  getUserDepositRequests,
};
