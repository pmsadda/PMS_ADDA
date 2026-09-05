/* ==========================================
   PMS ADDA
   Admin Withdraw Service
========================================== */

const { pool } = require("../config/database");

const crypto = require("crypto");

function cleanJayaPayKey(value) {
  return String(value || "")
    .replace(/\\n/g, "")
    .replace(
      /-----BEGIN [^-]+-----/g,
      "",
    )
    .replace(
      /-----END [^-]+-----/g,
      "",
    )
    .replace(/\s+/g, "")
    .trim();
}

function createJayaPayPem(
  value,
  keyType,
) {
  const cleanKey =
    cleanJayaPayKey(value);

  if (!cleanKey) {
    throw new Error(
      `JayaPay ${keyType} is missing.`,
    );
  }

  const lines =
    cleanKey.match(/.{1,64}/g) || [];

  return (
    `-----BEGIN ${keyType}-----\n` +
    `${lines.join("\n")}\n` +
    `-----END ${keyType}-----`
  );
}

function buildJayaPaySigningString(
  parameters,
) {
  return Object.keys(parameters || {})
    .filter((key) => key !== "sign")
    .filter(
      (key) =>
        parameters[key] !== null &&
        parameters[key] !== undefined &&
        String(parameters[key]) !== "",
    )
    .sort()
    .map((key) =>
      String(parameters[key]),
    )
    .join("");
}

function generateJayaPaySign(
  parameters,
  privateKey,
) {
  const privateKeyObject =
    crypto.createPrivateKey({
      key: createJayaPayPem(
        privateKey,
        "PRIVATE KEY",
      ),
      format: "pem",
      type: "pkcs8",
    });

  const keyBytes = Math.ceil(
    privateKeyObject
      .asymmetricKeyDetails
      .modulusLength / 8,
  );

  const maximumBlockSize =
    keyBytes - 11;

  const data = Buffer.from(
    buildJayaPaySigningString(
      parameters,
    ),
    "utf8",
  );

  const encryptedBlocks = [];

  for (
    let offset = 0;
    offset < data.length;
    offset += maximumBlockSize
  ) {
    encryptedBlocks.push(
      crypto.privateEncrypt(
        {
          key: privateKeyObject,
          padding:
            crypto.constants
              .RSA_PKCS1_PADDING,
        },
        data.subarray(
          offset,
          offset + maximumBlockSize,
        ),
      ),
    );
  }

  return Buffer.concat(
    encryptedBlocks,
  ).toString("base64");
}

function verifyJayaPaySign(
  parameters,
  publicKey,
) {
  try {
    const signature = String(
      parameters?.sign || "",
    ).trim();

    if (!signature) {
      return false;
    }

    const publicKeyObject =
      crypto.createPublicKey({
        key: createJayaPayPem(
          publicKey,
          "PUBLIC KEY",
        ),
        format: "pem",
        type: "spki",
      });

    const keyBytes = Math.ceil(
      publicKeyObject
        .asymmetricKeyDetails
        .modulusLength / 8,
    );

    const encryptedData =
      Buffer.from(
        signature,
        "base64",
      );

    if (
      encryptedData.length === 0 ||
      encryptedData.length %
        keyBytes !==
        0
    ) {
      return false;
    }

    const decryptedBlocks = [];

    for (
      let offset = 0;
      offset < encryptedData.length;
      offset += keyBytes
    ) {
      decryptedBlocks.push(
        crypto.publicDecrypt(
          {
            key: publicKeyObject,
            padding:
              crypto.constants
                .RSA_PKCS1_PADDING,
          },
          encryptedData.subarray(
            offset,
            offset + keyBytes,
          ),
        ),
      );
    }

    const decryptedText =
      Buffer.concat(
        decryptedBlocks,
      ).toString("utf8");

    return (
      decryptedText ===
      buildJayaPaySigningString(
        parameters,
      )
    );
  } catch (error) {
    console.error(
      "JayaPay payout signature verification error:",
      error.message,
    );

    return false;
  }
}

function getJayaPayPayoutConfig() {
  const config = {
    merchantNumber: String(
      process.env.JAYAPAY_MERCHANT_NO || "",
    ).trim(),

    privateKey: String(
      process.env.JAYAPAY_PRIVATE_KEY || "",
    ).trim(),

    platformPublicKey: String(
      process.env.JAYAPAY_PLATFORM_PUBLIC_KEY || "",
    ).trim(),

    payoutApiUrl: String(
      process.env.JAYAPAY_PAYOUT_API_URL || "",
    ).trim(),

    payoutNotifyUrl: String(
      process.env.JAYAPAY_PAYOUT_NOTIFY_URL || "",
    ).trim(),
  };

  if (
    !config.merchantNumber ||
    !config.privateKey ||
    !config.platformPublicKey ||
    !config.payoutApiUrl ||
    !config.payoutNotifyUrl
  ) {
    const error = new Error(
      "JayaPay payout configuration is incomplete.",
    );

    error.statusCode = 500;
    throw error;
  }

  return config;
}

async function postJayaPayPayout(url, payload) {
  const response = await fetch(url, {
    method: "POST",

    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },

    body: JSON.stringify(payload),

    signal: AbortSignal.timeout(30000),
  });

  const responseText = await response.text();

  let responseData;

  try {
    responseData = JSON.parse(responseText);
  } catch {
    responseData = {
      success: false,
      code: String(response.status),
      msg: responseText || "Invalid JayaPay response.",
    };
  }

  if (!response.ok) {
    const error = new Error(
      responseData.msg ||
        `JayaPay payout request failed (${response.status}).`,
    );

    error.statusCode = 502;
    error.gatewayResponse = responseData;
    throw error;
  }

  return responseData;
}

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
  auditActor = null,
) {
  const config = getJayaPayPayoutConfig();
  const connection = await pool.getConnection();

  let gatewayOrderNumber = null;

  try {
    await connection.beginTransaction();

    const [withdrawRows] = await connection.execute(
      `
      SELECT
        wr.id,
        wr.withdraw_id,
        wr.user_id,
        wr.method,
        wr.account_number,
        wr.amount,
        wr.status,
        wr.gateway_order_num,
        wr.gateway_status,
        u.username
      FROM withdraw_requests wr
      INNER JOIN users u
        ON u.id = wr.user_id
      WHERE wr.id = ?
      FOR UPDATE
      `,
      [withdrawId],
    );

    if (withdrawRows.length === 0) {
      throw new Error("Withdrawal request not found.");
    }

    const withdraw = withdrawRows[0];

    if (withdraw.status !== "pending") {
      throw new Error(
        `Withdrawal request is already ${withdraw.status}.`,
      );
    }

  const currentGatewayStatus = String(
  withdraw.gateway_status || "",
)
  .trim()
  .toUpperCase();

if (currentGatewayStatus) {
  const error = new Error(
    "This withdrawal was already sent to JayaPay.",
  );

  error.statusCode = 409;
  throw error;
}


    const method = String(withdraw.method || "")
      .trim()
      .toUpperCase();

    if (!["BKASH", "NAGAD"].includes(method)) {
      const error = new Error(
        "JayaPay supports only BKASH or NAGAD withdrawal.",
      );

      error.statusCode = 400;
      throw error;
    }

    const accountNumber = String(
      withdraw.account_number || "",
    ).replace(/\s+/g, "");

    if (!/^01\d{9}$/.test(accountNumber)) {
      const error = new Error(
        "Wallet number must start with 01 and contain 11 digits.",
      );

      error.statusCode = 400;
      throw error;
    }

    const amount = Number(withdraw.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Invalid withdrawal amount.");
    }

    gatewayOrderNumber = String(withdraw.withdraw_id);

    const [claimResult] = await connection.execute(
      `
      UPDATE withdraw_requests
      SET
        gateway_order_num = ?,
        gateway_status = 'CREATING',
        gateway_message = NULL,
        payout_requested_at = NOW(),
        admin_note = ?,
        processed_by = ?
      WHERE id = ?
        AND status = 'pending'
      `,
      [
        gatewayOrderNumber,
        adminNote
          ? String(adminNote).slice(0, 255)
          : "JayaPay payout requested by admin",
        adminId || null,
        withdrawId,
      ],
    );

    if (claimResult.affectedRows !== 1) {
      throw new Error("Withdrawal payout claim failed.");
    }

    await connection.commit();

    const timestamp = String(Date.now());

    const payoutPayload = {
      mchNo: config.merchantNumber,
      orderNum: gatewayOrderNumber,
      amount,
      bankCode: method,
      bankName: method,
      bankCard: accountNumber,
      accountName: String(
        withdraw.username || "PMS ADDA User",
      ).slice(0, 64),
      description: `Withdrawal ${gatewayOrderNumber}`,
      feeType: 1,
      downNotifyUrl: config.payoutNotifyUrl,
      timestamp,
    };

    payoutPayload.sign = generateJayaPaySign(
      payoutPayload,
      config.privateKey,
    );

    const gatewayResponse = await postJayaPayPayout(
      config.payoutApiUrl,
      payoutPayload,
    );

    if (
      gatewayResponse.success !== true ||
      String(gatewayResponse.code) !== "9999"
    ) {
      const gatewayError = new Error(
        gatewayResponse.msg ||
          `[${gatewayResponse.code || "UNKNOWN"}] JayaPay payout failed.`,
      );

      gatewayError.statusCode = 502;
      gatewayError.gatewayResponse = gatewayResponse;
      throw gatewayError;
    }

    const gatewayData = gatewayResponse.data || {};

    const platformOrderNumber = String(
      gatewayData.platOrderNum ||
        gatewayData.platformOrderNum ||
        "",
    ).trim();

    const returnedStatus = String(
      gatewayData.status ?? "SUBMITTED",
    ).trim();

    await pool.execute(
      `
      UPDATE withdraw_requests
      SET
        gateway_platform_order_num = ?,
        gateway_status = ?,
        gateway_message = ?,
        admin_payment_reference = ?
      WHERE id = ?
        AND gateway_order_num = ?
        AND status = 'pending'
      `,
      [
        platformOrderNumber || null,
        returnedStatus || "SUBMITTED",
        String(
          gatewayResponse.msg || "Payout submitted to JayaPay",
        ).slice(0, 255),
        platformOrderNumber || gatewayOrderNumber,
        withdrawId,
        gatewayOrderNumber,
      ],
    );

    return {
      id: Number(withdraw.id),
      withdrawId: withdraw.withdraw_id,
      userId: Number(withdraw.user_id),
      amount,
      status: "pending",
      gatewayStatus: returnedStatus || "SUBMITTED",
      gatewayOrderNumber,
      platformOrderNumber: platformOrderNumber || null,
    };
  } catch (error) {
    try {
      await connection.rollback();
    } catch (_rollbackError) {
      // Transaction may already be committed.
    }

    if (gatewayOrderNumber) {
      const responseMessage =
        error.gatewayResponse?.msg ||
        error.message ||
        "JayaPay payout request failed.";

      await pool.execute(
        `
        UPDATE withdraw_requests
        SET
          gateway_status = 'SUBMISSION_UNCERTAIN',
          gateway_message = ?
        WHERE id = ?
          AND status = 'pending'
          AND gateway_order_num = ?
        `,
        [
          String(responseMessage).slice(0, 255),
          withdrawId,
          gatewayOrderNumber,
        ],
      );
    }

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
status,
gateway_status
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

    const gatewayStatus = String(
  withdraw.gateway_status || "",
)
  .trim()
  .toUpperCase();

const refundableGatewayStatuses = [
  "",
  "3",
  "4",
  "FAIL",
  "FAILED",
  "REFUNDED",
];

if (
  !refundableGatewayStatuses.includes(
    gatewayStatus,
  )
) {
  const error = new Error(
    "This withdrawal is processing in JayaPay and cannot be manually rejected.",
  );

  error.statusCode = 409;
  throw error;
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

function verifyPayoutCallbackSignature(
  payload,
  platformPublicKey,
) {
  if (
    verifyJayaPaySign(
      payload,
      platformPublicKey,
    )
  ) {
    return true;
  }

  const amountValues = new Set([
    String(payload.amount ?? ""),
  ]);

  const feeValues = new Set([
    String(payload.fee ?? ""),
  ]);

  const numericAmount = Number(payload.amount);
  const numericFee = Number(payload.fee);

  if (Number.isFinite(numericAmount)) {
    amountValues.add(numericAmount.toFixed(1));
    amountValues.add(numericAmount.toFixed(2));
  }

  if (Number.isFinite(numericFee)) {
    feeValues.add(numericFee.toFixed(1));
    feeValues.add(numericFee.toFixed(2));
  }

  for (const amount of amountValues) {
    for (const fee of feeValues) {
      const candidate = {
        ...payload,
      };

      if (payload.amount !== undefined) {
        candidate.amount = amount;
      }

      if (payload.fee !== undefined) {
        candidate.fee = fee;
      }

      if (
        verifyJayaPaySign(
          candidate,
          platformPublicKey,
        )
      ) {
        return true;
      }
    }
  }

  return false;
}

async function completeSuccessfulJayaPayout(
  withdrawDatabaseId,
  platformOrderNumber,
) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute(
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
      [withdrawDatabaseId],
    );

    if (rows.length === 0) {
      throw new Error("Withdrawal request not found.");
    }

    const withdraw = rows[0];

    if (withdraw.status === "approved") {
      await connection.commit();

      return {
        duplicate: true,
        status: "approved",
      };
    }

    if (withdraw.status === "rejected") {
      throw new Error(
        "Rejected withdrawal cannot be completed.",
      );
    }

    const [updateResult] = await connection.execute(
      `
      UPDATE withdraw_requests
      SET
        status = 'approved',
        gateway_status = 'SUCCESS',
        gateway_platform_order_num =
          COALESCE(?, gateway_platform_order_num),
        admin_payment_reference =
          COALESCE(?, admin_payment_reference),
        gateway_message = 'JayaPay payout successful',
        payout_completed_at = NOW(),
        processed_at = NOW()
      WHERE id = ?
        AND status = 'pending'
      `,
      [
        platformOrderNumber || null,
        platformOrderNumber || null,
        withdrawDatabaseId,
      ],
    );

    if (updateResult.affectedRows !== 1) {
      throw new Error(
        "Withdrawal completion failed.",
      );
    }

    const [userUpdateResult] =
      await connection.execute(
        `
        UPDATE users
        SET total_withdraw =
          COALESCE(total_withdraw, 0) + ?
        WHERE id = ?
        `,
        [
          Number(withdraw.amount),
          withdraw.user_id,
        ],
      );

    if (userUpdateResult.affectedRows !== 1) {
      throw new Error(
        "User total withdrawal update failed.",
      );
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
        `JayaPay withdrawal completed: ${withdraw.withdraw_id}`,
        withdraw.user_id,
        String(withdraw.withdraw_id),
      ],
    );

    await connection.commit();

    return {
      duplicate: false,
      status: "approved",
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function processJayaPayPayoutCallback(
  callbackPayload,
) {
  const config = getJayaPayPayoutConfig();

  const payload = {
    ...(callbackPayload || {}),
  };

  const signatureIsValid =
    verifyPayoutCallbackSignature(
      payload,
      config.platformPublicKey,
    );

  if (!signatureIsValid) {
    const error = new Error(
      "JayaPay payout callback signature is invalid.",
    );

    error.statusCode = 400;
    throw error;
  }

  const gatewayOrderNumber = String(
    payload.orderNum || "",
  ).trim();

  const platformOrderNumber = String(
    payload.platOrderNum ||
      payload.platformOrderNum ||
      "",
  ).trim();

  const gatewayStatus = String(
    payload.status ?? "",
  )
    .trim()
    .toUpperCase();

  if (!gatewayOrderNumber || !gatewayStatus) {
    const error = new Error(
      "Invalid JayaPay payout callback.",
    );

    error.statusCode = 400;
    throw error;
  }

  const [rows] = await pool.execute(
    `
    SELECT
      id,
      amount,
      status
    FROM withdraw_requests
    WHERE gateway_order_num = ?
    LIMIT 1
    `,
    [gatewayOrderNumber],
  );

  if (rows.length === 0) {
    const error = new Error(
      "JayaPay withdrawal order was not found.",
    );

    error.statusCode = 404;
    throw error;
  }

  const withdraw = rows[0];

  if (
    payload.amount !== undefined &&
    Math.abs(
      Number(payload.amount) -
        Number(withdraw.amount),
    ) > 0.001
  ) {
    const error = new Error(
      "JayaPay payout callback amount mismatch.",
    );

    error.statusCode = 400;
    throw error;
  }

  await pool.execute(
    `
    UPDATE withdraw_requests
    SET
      gateway_platform_order_num =
        COALESCE(?, gateway_platform_order_num),
      gateway_status = ?,
      gateway_message = ?
    WHERE id = ?
    `,
    [
      platformOrderNumber || null,
      gatewayStatus,
      String(
        payload.msg ||
          payload.message ||
          `JayaPay payout status: ${gatewayStatus}`,
      ).slice(0, 255),
      withdraw.id,
    ],
  );

  const successStatuses = [
    "2",
    "SUCCESS",
    "SUCCESSFUL",
  ];

  const failedStatuses = [
    "3",
    "4",
    "FAILED",
    "FAIL",
    "REFUNDED",
  ];

  if (successStatuses.includes(gatewayStatus)) {
    return completeSuccessfulJayaPayout(
      withdraw.id,
      platformOrderNumber,
    );
  }

  if (
    failedStatuses.includes(gatewayStatus) &&
    withdraw.status === "pending"
  ) {
    return rejectWithdraw(
      withdraw.id,
      `JayaPay payout failed: ${gatewayStatus}`,
      null,
      null,
    );
  }

  return {
    status: "processing",
    gatewayStatus,
  };
}

/* ==========================================
   Exports
========================================== */

module.exports = {
  getWithdrawRequests,
  approveWithdraw,
  rejectWithdraw,
  processJayaPayPayoutCallback,
};
