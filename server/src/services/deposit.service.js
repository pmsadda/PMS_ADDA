const {
  pool,
} = require("../config/database");

const {
  resolveCurrentPaymentAccount,
} = require(
  "./deposit-payment.service",
);

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
  paymentAccountId,
  senderNumber,
  transactionNumber,
  amount,
}) {
  const validUserId =
    Number(userId);

  const validMethod =
    String(method || "")
      .trim()
      .toLowerCase();

  const validAccountId =
    Number(paymentAccountId);

  const validAmount =
    Number(amount);

  const connection =
    await pool.getConnection();

  try {
    await connection.beginTransaction();

    /*
     * একই transaction ID concurrent
     * request-এও দ্বিতীয়বার ব্যবহার হবে না।
     */
    const [duplicateRows] =
      await connection.execute(
        `
          SELECT id
          FROM deposit_requests
          WHERE transaction_number = ?
          LIMIT 1
          FOR UPDATE
        `,
        [transactionNumber],
      );

    if (
      duplicateRows.length > 0
    ) {
      const error = new Error(
        "This transaction ID has already been used.",
      );

      error.statusCode = 409;

      throw error;
    }

    let assignedAccount = null;

    /*
     * Frontend যে account দেখিয়েছে তার ID
     * পাঠালে exact account snapshot হবে।
     *
     * Rotation হয়ে গেলেও account active
     * থাকলে request গ্রহণ করা যাবে।
     */
    if (
      Number.isInteger(
        validAccountId,
      ) &&
      validAccountId > 0
    ) {
      const [accountRows] =
        await connection.query(
          `
            SELECT
              account.id,
              account.method,
              account.display_name,
              account.account_identifier,
              account.account_type,
              account.status,

              rotation.bdt_per_usdt

            FROM deposit_payment_accounts
              AS account

            INNER JOIN
              deposit_payment_rotation
              AS rotation
              ON rotation.method =
                 account.method

            WHERE account.id = ?
              AND account.method = ?
              AND account.status =
                  'active'

            LIMIT 1

            FOR UPDATE
          `,
          [
            validAccountId,
            validMethod,
          ],
        );

      const account =
        accountRows[0] || null;

      if (!account) {
        const error = new Error(
          "Selected receiving account is no longer available. Refresh and try again.",
        );

        error.statusCode = 409;

        throw error;
      }

      assignedAccount = {
        id:
          Number(account.id),

        method:
          account.method,

        displayName:
          account.display_name,

        accountIdentifier:
          account
            .account_identifier,

        accountType:
          account.account_type,

        bdtPerUsdt:
          Number(
            account.bdt_per_usdt ||
              0,
          ),
      };
    } else {
      /*
       * পুরোনো frontend compatibility:
       * account ID না এলে current rotated
       * account server resolve করবে।
       */
      assignedAccount =
        await resolveCurrentPaymentAccount(
          validMethod,
          connection,
        );
    }

    if (!assignedAccount) {
      const error = new Error(
        "Selected payment method is currently unavailable.",
      );

      error.statusCode = 409;

      throw error;
    }

    const isBinance =
      validMethod === "binance";

    const exchangeRate =
      isBinance
        ? Number(
            assignedAccount
              .bdtPerUsdt || 0,
          )
        : null;

    if (
      isBinance &&
      (
        !Number.isFinite(
          exchangeRate,
        ) ||
        exchangeRate <= 0
      )
    ) {
      const error = new Error(
        "Binance exchange rate is not configured correctly.",
      );

      error.statusCode = 409;

      throw error;
    }

    const paymentAsset =
      isBinance
        ? "USDT"
        : "BDT";

    const paymentAssetAmount =
      isBinance
        ? Number(
            (
              validAmount /
              exchangeRate
            ).toFixed(8),
          )
        : Number(
            validAmount.toFixed(2),
          );

    const depositId =
      generateDepositId();

    const [result] =
      await connection.execute(
        `
          INSERT INTO deposit_requests (
            deposit_id,
            user_id,
            method,

            assigned_payment_account_id,
            receiver_display_name,
            receiver_account_identifier,
            receiver_account_type,

            sender_number,
            transaction_number,

            amount,
            payment_asset,
            payment_asset_amount,
            exchange_rate,

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

            ?,
            ?,
            ?,
            ?,

            'pending'
          )
        `,
        [
          depositId,
          validUserId,
          validMethod,

          Number(
            assignedAccount.id,
          ),

          assignedAccount
            .displayName,

          assignedAccount
            .accountIdentifier,

          assignedAccount
            .accountType,

          senderNumber,
          transactionNumber,

          validAmount,
          paymentAsset,
          paymentAssetAmount,
          exchangeRate,
        ],
      );

    await connection.commit();

    return {
      id:
        Number(result.insertId),

      depositId,
      userId:
        validUserId,

      method:
        validMethod,

      paymentAccountId:
        Number(
          assignedAccount.id,
        ),

      receiverDisplayName:
        assignedAccount
          .displayName,

      receiverAccountIdentifier:
        assignedAccount
          .accountIdentifier,

      receiverAccountType:
        assignedAccount
          .accountType,

      senderNumber,
      transactionNumber,

      amount:
        validAmount,

      paymentAsset,

      paymentAssetAmount,

      exchangeRate,

      status:
        "pending",
    };
   } catch (error) {
    await connection.rollback();

    /*
     * Database UNIQUE constraint একই
     * transaction ID দ্বিতীয়বার নিলে
     * পরিষ্কার 409 response দেওয়া হবে।
     */
    if (
      error?.code === "ER_DUP_ENTRY"
    ) {
      const duplicateError =
        new Error(
          "This transaction ID has already been used.",
        );

      duplicateError.statusCode = 409;

      duplicateError.code =
        "DUPLICATE_DEPOSIT_TRANSACTION";

      throw duplicateError;
    }

    throw error;
  } finally {
    connection.release();
  }
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

assigned_payment_account_id,
receiver_display_name,
receiver_account_identifier,
receiver_account_type,

sender_number,
            transaction_number,
            amount,
payment_asset,
payment_asset_amount,
exchange_rate,

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
    method:
  row.method,

paymentAccountId:
  row.assigned_payment_account_id ===
  null
    ? null
    : Number(
        row
          .assigned_payment_account_id,
      ),

receiverDisplayName:
  row.receiver_display_name ||
  null,

receiverAccountIdentifier:
  row
    .receiver_account_identifier ||
  null,

receiverAccountType:
  row.receiver_account_type ||
  null,

senderNumber:
  row.sender_number,
    transactionNumber: row.transaction_number,
    amount:
  Number(row.amount),

paymentAsset:
  row.payment_asset || "BDT",

paymentAssetAmount:
  Number(
    row.payment_asset_amount ||
      row.amount ||
      0,
  ),

exchangeRate:
  row.exchange_rate === null
    ? null
    : Number(
        row.exchange_rate,
      ),

    bonusAmount: Number(row.bonus_amount || 0),

    creditedAmount: Number(row.credited_amount || 0),

    isFirstDepositBonus: Boolean(row.is_first_deposit_bonus),

    status: row.status,
    adminNote: row.admin_note,
    approvedAt: row.approved_at,
    createdAt: row.created_at,
  }));
}

/* ==========================
   Create Gateway Deposit
========================== */

async function createGatewayDepositRequest({
  userId,
  gatewayOrderId,
  amount,
}) {
  const validUserId = Number(userId);
  const validAmount = Number(amount);

  if (
    !Number.isInteger(validUserId) ||
    validUserId <= 0
  ) {
    throw new Error("Invalid user ID.");
  }

  if (
    !Number.isFinite(validAmount) ||
    validAmount <= 0
  ) {
    throw new Error("Invalid deposit amount.");
  }

  const depositId = generateDepositId();

  await pool.execute(
    `
      INSERT INTO deposit_requests (
        deposit_id,
        gateway_order_id,
        user_id,
        method,
        sender_number,
        transaction_number,
        amount,
        gateway_status,
        status
      )
      VALUES (?, ?, ?, 'gateway', NULL, NULL, ?, 'pending', 'pending')
    `,
    [
      depositId,
      gatewayOrderId,
      validUserId,
      validAmount,
    ],
  );

  return {
    depositId,
    gatewayOrderId,
    amount: validAmount,
  };
}

/* ==========================
   Save Gateway Trade Number
========================== */

async function saveGatewayTradeNumber({
  userId,
  gatewayOrderId,
  gatewayTradeNo,
}) {
  await pool.execute(
    `
      UPDATE deposit_requests
      SET
        gateway_trade_no = ?,
        gateway_status = 'pending'
      WHERE gateway_order_id = ?
        AND user_id = ?
        AND status = 'pending'
      LIMIT 1
    `,
    [
      gatewayTradeNo,
      gatewayOrderId,
      Number(userId),
    ],
  );
}

/* ==========================
   Find Gateway Deposit
========================== */

async function findGatewayDeposit({
  gatewayOrderId = null,
  gatewayTradeNo = null,
}) {
  const orderId = String(gatewayOrderId || "").trim();
  const tradeNo = String(gatewayTradeNo || "").trim();

  if (!orderId && !tradeNo) {
    return null;
  }

  const conditions = [];
  const values = [];

  if (orderId) {
    conditions.push("gateway_order_id = ?");
    values.push(orderId);
  }

  if (tradeNo) {
    conditions.push("gateway_trade_no = ?");
    values.push(tradeNo);
  }

  const [rows] = await pool.execute(
    `
      SELECT
        id,
        deposit_id,
        user_id,
        amount,
        status,
        gateway_order_id,
        gateway_trade_no,
        gateway_status
      FROM deposit_requests
      WHERE method = 'gateway'
        AND (${conditions.join(" OR ")})
      LIMIT 1
    `,
    values,
  );

  return rows[0] || null;
}


/* ==========================
   Update Gateway Status
========================== */

async function updateGatewayDepositStatus({
  depositId,
  gatewayStatus,
  gatewayTradeNo = null,
}) {
  await pool.execute(
    `
      UPDATE deposit_requests
      SET
        gateway_status = ?,
        gateway_trade_no = COALESCE(?, gateway_trade_no)
      WHERE deposit_id = ?
      LIMIT 1
    `,
    [
      String(gatewayStatus || "").trim(),
      gatewayTradeNo
        ? String(gatewayTradeNo).trim()
        : null,
      depositId,
    ],
  );
}

module.exports = {
  createDepositRequest,
  createGatewayDepositRequest,
  saveGatewayTradeNumber,
  findGatewayDeposit,
  updateGatewayDepositStatus,
  getUserDepositRequests,
};
