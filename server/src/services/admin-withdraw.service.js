/* ==========================================
   PMS ADDA
   Admin Withdraw Service
========================================== */

const { pool } = require("../config/database");

const { insertAgentActionLog } = require("./agent-audit.service");

/* ==========================================
   Helper: Generate Transaction ID
========================================== */

function generateTransactionId(prefix = "WTX") {
  const timestamp = Date.now();

  const randomNumber = Math.floor(100000 + Math.random() * 900000);

  return `${prefix}-${timestamp}-${randomNumber}`;
}

/* ==========================================
   Helper: Validate Withdraw Status
========================================== */

function validateStatus(status) {
  const allowedStatuses = ["all", "pending", "approved", "rejected"];

  if (!allowedStatuses.includes(status)) {
    return "all";
  }

  return status;
}

/* ==========================================
   Get Withdraw Requests
========================================== */

async function getWithdrawRequests(status = "all") {
  const selectedStatus = validateStatus(status);

  const queryParams = [];

  let whereClause = "";

  if (selectedStatus !== "all") {
    whereClause = "WHERE wr.status = ?";

    queryParams.push(selectedStatus);
  }

  /*
    শুধু নিশ্চিত column ব্যবহার করা হয়েছে।

    users table থেকে:
    - id
    - username
    - wallet_balance

    যদি users table-এ username না থাকে,
    তখন শুধু u.username line মুছে দিতে হবে।
  */

  const [rows] = await pool.execute(
    `
    SELECT
      wr.id,
      wr.withdraw_id AS withdrawId,
      wr.user_id AS userId,

      wr.method,
      wr.account_number AS accountNumber,
      wr.last_four_digits AS lastFourDigits,

      wr.amount,

      wr.total_deposit_at_request
        AS totalDepositAtRequest,

      wr.turnover_at_request
  AS turnoverAtRequest,

wr.turnover_required_at_request
  AS turnoverRequiredAtRequest,

wr.status,

      wr.admin_payment_reference
        AS adminPaymentReference,

      wr.reject_reason AS rejectReason,
      wr.admin_note AS adminNote,

      wr.processed_by AS processedBy,
      wr.processed_at AS processedAt,

      wr.created_at AS createdAt,
      wr.updated_at AS updatedAt,

      u.username,
      u.wallet_balance AS walletBalance

    FROM withdraw_requests wr

    INNER JOIN users u
      ON u.id = wr.user_id

    ${whereClause}

    ORDER BY
      CASE
        WHEN wr.status = 'pending' THEN 1
        WHEN wr.status = 'approved' THEN 2
        WHEN wr.status = 'rejected' THEN 3
        ELSE 4
      END,

      wr.created_at DESC
    `,
    queryParams,
  );

  return rows;
}

/* ==========================================
   Approve Withdraw
========================================== */

async function approveWithdraw(
  withdrawId,
  adminNote = null,
  adminId = null,
  auditActor = null
) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    /* Lock withdraw request */

    const [withdrawRows] = await connection.execute(
      `
        SELECT
          id,
          withdraw_id,
          user_id,
          method,
          account_number,
          last_four_digits,
          amount,
          status
        FROM withdraw_requests
        WHERE id = ?
        FOR UPDATE
        `,
      [withdrawId],
    );

    if (withdrawRows.length === 0) {
      throw new Error("Withdrawal request not found.");
    }

    const withdraw = withdrawRows[0];

    if (withdraw.status !== "pending") {
      throw new Error(`Withdrawal request is already ${withdraw.status}.`);
    }

    /*
      Frontend বর্তমানে adminNote-এর মধ্যে
      payment reference পাঠাচ্ছে।

      তাই একই value payment reference এবং
      admin note হিসেবে save করা হচ্ছে।
    */

    const paymentReference = adminNote ? String(adminNote).slice(0, 100) : null;

    const safeAdminNote = adminNote
      ? String(adminNote).slice(0, 255)
      : "Withdrawal approved by admin";

    /* Update withdraw request */

    const [updateResult] = await connection.execute(
      `
        UPDATE withdraw_requests
        SET
          status = 'approved',

          admin_payment_reference = ?,

          admin_note = ?,

          processed_by = ?,

          processed_at = NOW()

        WHERE
          id = ?
          AND status = 'pending'
        `,
      [paymentReference, safeAdminNote, adminId || null, withdrawId],
    );

    if (updateResult.affectedRows !== 1) {
      throw new Error("Withdrawal approval failed.");
    }

    /*
      Withdraw request তৈরির সময় user balance
      আগে থেকেই deduct করা হয়েছে।

      তাই approve করার সময় balance আবার
      deduct করা হবে না।
    */

    const [userUpdateResult] = await connection.execute(
      `
    UPDATE users
    SET total_withdraw =
      COALESCE(total_withdraw, 0) + ?
    WHERE id = ?
    `,
      [Number(withdraw.amount), withdraw.user_id],
    );

    if (userUpdateResult.affectedRows !== 1) {
      throw new Error("User total withdrawal update failed.");
    }

    await connection.execute(
      `
  UPDATE wallet_transactions
  SET
    status = 'completed',
    description = ?
  WHERE user_id = ?
    AND transaction_type = 'withdraw'
    AND direction = 'debit'
    AND reference_type = 'withdraw_request'
    AND reference_id = ?
    AND status = 'pending'
  `,
      [
        `Withdrawal approved: ${withdraw.withdraw_id}`,
        withdraw.user_id,
        String(withdraw.withdraw_id),
      ],
    );

       if (auditActor) {
      await insertAgentActionLog({
        connection,

        agentId:
          auditActor.agentId,

        actionType:
          "withdrawal_approved",

        referenceId:
          withdraw.withdraw_id ||
          withdraw.id,

        customerId:
          withdraw.user_id,

        amount:
          Number(withdraw.amount),

        reason:
          adminNote ||
          "Withdrawal approved",

        ipAddress:
          auditActor.ipAddress,

        userAgent:
          auditActor.userAgent
      });
    }

    await connection.commit();

    return {
      id: Number(withdraw.id),

      withdrawId: withdraw.withdraw_id,

      userId: Number(withdraw.user_id),

      amount: Number(withdraw.amount),

      status: "approved",

      adminPaymentReference: paymentReference,
    };
  } catch (error) {
    await connection.rollback();

    throw error;
  } finally {
    connection.release();
  }
}

/* ==========================================
   Reject Withdraw and Refund Balance
========================================== */

async function rejectWithdraw(
  withdrawId,
  adminNote = null,
  adminId = null,
  auditActor = null
) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    /* Lock withdraw request */

    const [withdrawRows] = await connection.execute(
      `
        SELECT
          id,
          withdraw_id,
          user_id,
          amount,
          status
        FROM withdraw_requests
        WHERE id = ?
        FOR UPDATE
        `,
      [withdrawId],
    );

    if (withdrawRows.length === 0) {
      throw new Error("Withdrawal request not found.");
    }

    const withdraw = withdrawRows[0];

    /*
      এটি duplicate refund বন্ধ করবে।

      একবার rejected বা approved হলে
      দ্বিতীয়বার wallet refund হবে না।
    */

    if (withdraw.status !== "pending") {
      throw new Error(`Withdrawal request is already ${withdraw.status}.`);
    }

    /* Lock user wallet */

    const [userRows] = await connection.execute(
      `
        SELECT
          id,
          wallet_balance
        FROM users
        WHERE id = ?
        FOR UPDATE
        `,
      [withdraw.user_id],
    );

    if (userRows.length === 0) {
      throw new Error("Withdrawal user not found.");
    }

    const user = userRows[0];

    const refundAmount = Number(withdraw.amount);

    const balanceBefore = Number(user.wallet_balance);

    const balanceAfter = balanceBefore + refundAmount;

    if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
      throw new Error("Invalid withdrawal refund amount.");
    }

    if (!Number.isFinite(balanceBefore)) {
      throw new Error("Invalid current wallet balance.");
    }

    /* Refund wallet */

    const [walletUpdateResult] = await connection.execute(
      `
        UPDATE users
        SET wallet_balance = ?
        WHERE id = ?
        `,
      [balanceAfter, withdraw.user_id],
    );

    if (walletUpdateResult.affectedRows !== 1) {
      throw new Error("Wallet refund failed.");
    }

    const safeRejectReason = adminNote
      ? String(adminNote).slice(0, 100)
      : "Rejected by admin";

    const safeAdminNote = adminNote
      ? String(adminNote).slice(0, 255)
      : "Withdrawal rejected and balance refunded";

    /* Mark request rejected */

    const [withdrawUpdateResult] = await connection.execute(
      `
        UPDATE withdraw_requests
        SET
          status = 'rejected',

          reject_reason = ?,

          admin_note = ?,

          processed_by = ?,

          processed_at = NOW()

        WHERE
          id = ?
          AND status = 'pending'
        `,
      [safeRejectReason, safeAdminNote, adminId || null, withdrawId],
    );

    if (withdrawUpdateResult.affectedRows !== 1) {
      throw new Error("Withdrawal rejection failed.");
    }

    await connection.execute(
      `
  UPDATE wallet_transactions
  SET
    status = 'failed',
    description = ?
  WHERE user_id = ?
    AND transaction_type = 'withdraw'
    AND direction = 'debit'
    AND reference_type = 'withdraw_request'
    AND reference_id = ?
    AND status = 'pending'
  `,
      [
        `Withdrawal rejected: ${String(withdraw.withdraw_id || withdraw.id)}`,
        withdraw.user_id,
        String(withdraw.withdraw_id || withdraw.id),
      ],
    );

    /* Generate wallet transaction ID */

    const transactionId = generateTransactionId("WRF");

    /*
      transaction_type = withdraw
      direction = credit

      অর্থাৎ এটি withdrawal refund transaction।

      withdraw_refund ENUM না থাকলেও
      এই query কাজ করবে, কারণ withdraw
      আগে থেকেই ENUM-এ আছে।
    */

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
          'credit',
          ?,
          ?,
          ?,
          'completed',
          'withdraw_request',
          ?,
          ?,
          ?
        )
        `,
      [
        transactionId,

        withdraw.user_id,

        refundAmount,

        balanceBefore,

        balanceAfter,

        String(withdraw.withdraw_id || withdraw.id),

        safeAdminNote,

        adminId || null,
      ],
    );

    if (transactionResult.affectedRows !== 1) {
      throw new Error("Refund transaction creation failed.");
    }

        if (auditActor) {
      await insertAgentActionLog({
        connection,

        agentId:
          auditActor.agentId,

        actionType:
          "withdrawal_rejected",

        referenceId:
          withdraw.withdraw_id ||
          withdraw.id,

        customerId:
          withdraw.user_id,

        amount:
          Number(withdraw.amount),

        reason:
          safeAdminNote,

        ipAddress:
          auditActor.ipAddress,

        userAgent:
          auditActor.userAgent
      });
    }

    await connection.commit();

    return {
      id: Number(withdraw.id),

      withdrawId: withdraw.withdraw_id,

      userId: Number(withdraw.user_id),

      status: "rejected",

      refundedAmount: refundAmount,

      balanceBefore,

      balanceAfter,

      transactionId,
    };
  } catch (error) {
    await connection.rollback();

    throw error;
  } finally {
    connection.release();
  }
}

/* ==========================================
   Exports
========================================== */

module.exports = {
  getWithdrawRequests,
  approveWithdraw,
  rejectWithdraw,
};
