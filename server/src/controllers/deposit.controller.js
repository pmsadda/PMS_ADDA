const crypto = require("crypto");

const {
  pool,
} = require("../config/database");

/* ==========================
   JayaPay RSA Helpers
========================== */

function cleanBase64Key(value) {
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

function makePemKey(
  value,
  keyType,
) {
  const cleanKey =
    cleanBase64Key(value);

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

function buildJayaPaySignString(
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

function createJayaPaySignature(
  parameters,
  privateKey,
) {
  const pemPrivateKey = makePemKey(
    privateKey,
    "PRIVATE KEY",
  );

  const privateKeyObject =
    crypto.createPrivateKey({
      key: pemPrivateKey,
      format: "pem",
      type: "pkcs8",
    });

  const keyBits =
    privateKeyObject
      .asymmetricKeyDetails
      .modulusLength;

  const keyBytes =
    Math.ceil(keyBits / 8);

  const maximumBlockSize =
    keyBytes - 11;

  const input = Buffer.from(
    buildJayaPaySignString(
      parameters,
    ),
    "utf8",
  );

  const encryptedBlocks = [];

  for (
    let offset = 0;
    offset < input.length;
    offset += maximumBlockSize
  ) {
    const block = input.subarray(
      offset,
      offset +
        maximumBlockSize,
    );

    const encryptedBlock =
      crypto.privateEncrypt(
        {
          key: privateKeyObject,

          padding:
            crypto.constants
              .RSA_PKCS1_PADDING,
        },
        block,
      );

    encryptedBlocks.push(
      encryptedBlock,
    );
  }

  return Buffer.concat(
    encryptedBlocks,
  ).toString("base64");
}

function verifyJayaPaySignature(
  parameters,
  platformPublicKey,
) {
  try {
    const signature = String(
      parameters?.sign || "",
    ).trim();

    if (!signature) {
      return false;
    }

    const pemPublicKey = makePemKey(
      platformPublicKey,
      "PUBLIC KEY",
    );

    const publicKeyObject =
      crypto.createPublicKey({
        key: pemPublicKey,
        format: "pem",
        type: "spki",
      });

    const keyBits =
      publicKeyObject
        .asymmetricKeyDetails
        .modulusLength;

    const keyBytes =
      Math.ceil(keyBits / 8);

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
      offset <
      encryptedData.length;
      offset += keyBytes
    ) {
      const block =
        encryptedData.subarray(
          offset,
          offset + keyBytes,
        );

      const decryptedBlock =
        crypto.publicDecrypt(
          {
            key: publicKeyObject,

            padding:
              crypto.constants
                .RSA_PKCS1_PADDING,
          },
          block,
        );

      decryptedBlocks.push(
        decryptedBlock,
      );
    }

   const receivedString =
  Buffer.concat(
    decryptedBlocks,
  ).toString("utf8");

/*
 * JSON.parse numeric value-এর trailing
 * zero সরিয়ে দেয়। JayaPay callback
 * amount/fee বিভিন্ন decimal format-এ
 * sign করতে পারে।
 */
const signatureCandidates =
  new Set();

const amountValue =
  Number(parameters.amount);

const feeValue =
  Number(parameters.fee);

const amountFormats =
  Number.isFinite(amountValue)
    ? [
        String(amountValue),
        amountValue.toFixed(1),
        amountValue.toFixed(2),
      ]
    : [parameters.amount];

const feeFormats =
  Number.isFinite(feeValue)
    ? [
        String(feeValue),
        feeValue.toFixed(1),
        feeValue.toFixed(2),
      ]
    : [parameters.fee];

for (
  const amountFormat of
  amountFormats
) {
  for (
    const feeFormat of
    feeFormats
  ) {
    const candidateParameters = {
      ...parameters,

      amount:
        amountFormat,

      fee:
        feeFormat,
    };

    signatureCandidates.add(
      buildJayaPaySignString(
        candidateParameters,
      ),
    );
  }
}

for (
  const expectedString of
  signatureCandidates
) {
  const receivedBuffer =
    Buffer.from(
      receivedString,
      "utf8",
    );

  const expectedBuffer =
    Buffer.from(
      expectedString,
      "utf8",
    );

  if (
    receivedBuffer.length ===
      expectedBuffer.length &&
    crypto.timingSafeEqual(
      receivedBuffer,
      expectedBuffer,
    )
  ) {
    return true;
  }
}

console.error(
  "JayaPay callback signature content mismatch.",
  {
    callbackFields:
      Object.keys(
        parameters,
      ).sort(),
  },
);

return false;
  } catch (error) {
    console.error(
      "JayaPay signature verification failed:",
      error.message,
    );

    return false;
  }
}

function getJayaPayConfig() {
  const config = {
    merchantNumber: String(
      process.env
        .JAYAPAY_MERCHANT_NO ||
        "",
    ).trim(),

    privateKey: String(
      process.env
        .JAYAPAY_PRIVATE_KEY ||
        "",
    ).trim(),

    platformPublicKey: String(
      process.env
        .JAYAPAY_PLATFORM_PUBLIC_KEY ||
        "",
    ).trim(),

    apiUrl: String(
      process.env
        .JAYAPAY_API_URL ||
        "",
    ).trim(),

    notifyUrl: String(
      process.env
        .JAYAPAY_NOTIFY_URL ||
        "",
    ).trim(),

    redirectUrl: String(
      process.env
        .JAYAPAY_REDIRECT_URL ||
        "",
    ).trim(),
  };

  if (
    !config.merchantNumber ||
    !config.privateKey ||
    !config.platformPublicKey ||
    !config.apiUrl ||
    !config.notifyUrl ||
    !config.redirectUrl
  ) {
    const error = new Error(
      "JayaPay configuration is incomplete.",
    );

    error.statusCode = 500;

    throw error;
  }

  return config;
}

async function getJayaPayCustomer(
  userId,
) {
  const [rows] =
    await pool.execute(
      `
        SELECT
          id,
          full_name,
          email,
          phone
        FROM users
        WHERE id = ?
          AND account_status =
              'active'
        LIMIT 1
      `,
      [Number(userId)],
    );

  const user = rows[0] || null;

  if (!user) {
    const error = new Error(
      "Payment user was not found.",
    );

    error.statusCode = 404;

    throw error;
  }

  return {
    fullName: String(
      user.full_name ||
        "TPL22 User",
    )
      .trim()
      .slice(0, 64),

    email: String(
      user.email || "",
    )
      .trim()
      .toLowerCase()
      .slice(0, 64),

    phone: String(
      user.phone || "",
    )
      .replace(/\s+/g, "")
      .trim(),
  };
}

const {
  createDepositRequest,
  createGatewayDepositRequest,
  saveGatewayTradeNumber,
  findGatewayDeposit,
  updateGatewayDepositStatus,
  getUserDepositRequests,
} = require("../services/deposit.service");

const { approveDepositRequest } = require("../services/admin-deposit.service");

const {
  getActivePaymentMethods,
  getPaymentAccountQr: getPaymentAccountQrFile,
} = require("../services/deposit-payment.service");

/* ==========================
   Active Payment Methods
========================== */

async function getPaymentMethods(req, res, next) {
  try {
    const paymentMethods = await getActivePaymentMethods();

    return res.status(200).json({
      success: true,

      message: "Deposit payment methods loaded successfully.",

      data: {
        paymentMethods,
      },
    });
  } catch (error) {
    next(error);
  }
}

/* ==========================
   Create Deposit Request
========================== */

async function submitDepositRequest(req, res, next) {
  try {
    const {
      method,
      paymentAccountId,
      senderNumber,
      transactionNumber,
      amount,
    } = req.body || {};

    if (
      !method ||
      !senderNumber ||
      !transactionNumber ||
      amount === undefined
    ) {
      return res.status(400).json({
        success: false,

        message: "সব Deposit তথ্য সঠিকভাবে দিন।",
      });
    }

    const cleanedMethod = String(method).trim().toLowerCase();

    const cleanedSenderNumber = String(senderNumber).replace(/\s+/g, "").trim();

    /*
     * Transaction/Order ID-এর original
     * value অক্ষত রাখা হচ্ছে।
     */
    const cleanedTransactionNumber = String(transactionNumber).trim();

    const cleanedAmount = Number(amount);

    const cleanedAccountId =
      paymentAccountId === undefined ||
      paymentAccountId === null ||
      paymentAccountId === ""
        ? null
        : Number(paymentAccountId);

    const allowedMethods = ["bkash", "nagad", "rocket", "binance"];

    if (!allowedMethods.includes(cleanedMethod)) {
      return res.status(400).json({
        success: false,

        message: "সঠিক Payment Method নির্বাচন করুন।",
      });
    }

    if (
      cleanedAccountId !== null &&
      (!Number.isInteger(cleanedAccountId) || cleanedAccountId < 1)
    ) {
      return res.status(400).json({
        success: false,

        message: "Invalid receiving account selection.",
      });
    }

    /*
     * Mobile banking sender number।
     */
    if (
      cleanedMethod !== "binance" &&
      !/^01[3-9]\d{8}$/.test(cleanedSenderNumber)
    ) {
      return res.status(400).json({
        success: false,

        message: "সঠিক ১১ ডিজিটের Sender Number দিন।",
      });
    }

    /*
     * Binance Pay sender Pay ID।
     */
    if (
      cleanedMethod === "binance" &&
      !/^[A-Za-z0-9_-]{4,120}$/.test(cleanedSenderNumber)
    ) {
      return res.status(400).json({
        success: false,

        message: "সঠিক Binance Sender Pay ID দিন।",
      });
    }

    if (
      cleanedTransactionNumber.length < 6 ||
      cleanedTransactionNumber.length > 100
    ) {
      return res.status(400).json({
        success: false,

        message:
          cleanedMethod === "binance"
            ? "সঠিক Binance Order ID দিন।"
            : "সঠিক Transaction ID দিন।",
      });
    }

    if (
      !Number.isFinite(cleanedAmount) ||
      cleanedAmount < 100 ||
      cleanedAmount > 1000000
    ) {
      return res.status(400).json({
        success: false,

        message: "Deposit amount must be between ৳100 and ৳10,00,000.",
      });
    }

    const deposit = await createDepositRequest({
      userId: req.user.id,

      method: cleanedMethod,

      paymentAccountId: cleanedAccountId,

      senderNumber: cleanedSenderNumber,

      transactionNumber: cleanedTransactionNumber,

      amount: cleanedAmount,
    });

    return res.status(201).json({
      success: true,

      message: "Deposit request submitted successfully.",

      data: {
        deposit,
      },
    });
  } catch (error) {
    next(error);
  }
}

/* ==========================
   Get My Deposit History
========================== */

async function getMyDepositHistory(req, res, next) {
  try {
    const deposits = await getUserDepositRequests(req.user.id);

    return res.status(200).json({
      success: true,
      message: "Deposit history loaded successfully.",

      data: {
        deposits,
      },
    });
  } catch (error) {
    next(error);
  }
}

/* ==========================
   Get Payment Account QR
========================== */

async function getPaymentAccountQr(req, res, next) {
  try {
    const qrImage = await getPaymentAccountQrFile(req.params.accountId);

    res.setHeader("Content-Type", qrImage.mimeType);

    res.setHeader("Content-Length", String(qrImage.imageSize));

    res.setHeader("Cache-Control", "private, max-age=300");

    res.setHeader(
      "Content-Disposition",
      `inline; filename="${String(qrImage.fileName || "binance-pay-qr").replace(
        /[^a-zA-Z0-9._-]/g,
        "_",
      )}"`,
    );

    return res.status(200).send(qrImage.imageData);
  } catch (error) {
    next(error);
  }
}

async function createGatewayPayment(
  req,
  res,
  next,
) {
  let createdDeposit = null;

  try {
    const amount = Number(
      req.body?.amount,
    );

    const payType = String(
      req.body?.payType || "",
    )
      .trim()
      .toUpperCase();

    /*
     * JayaPay Bangladesh-এ শুধু
     * bKash এবং Nagad নেওয়া হবে।
     */
    if (
      ![
        "BKASH",
        "NAGAD",
      ].includes(payType)
    ) {
      return res
        .status(400)
        .json({
          success: false,

          message:
            "This payment method is not available.",
        });
    }

    /*
     * JayaPay Bangladesh Pay-in
     * decimal amount গ্রহণ করে না।
     */
    if (
      !Number.isInteger(amount) ||
      amount < 100 ||
      amount > 1000000
    ) {
      return res
        .status(400)
        .json({
          success: false,

          message:
            "Deposit amount must be a whole number between ৳100 and ৳10,00,000.",
        });
    }

    const config =
      getJayaPayConfig();

    const customer =
      await getJayaPayCustomer(
        req.user.id,
      );

    /*
     * সর্বোচ্চ 64 characters-এর
     * unique merchant order number।
     */
    const orderNumber =
      `PMS${Date.now()}` +
      crypto
        .randomBytes(6)
        .toString("hex")
        .toUpperCase();

    /*
     * Gateway call করার আগেই pending
     * deposit database-এ রাখা হবে।
     */
    createdDeposit =
      await createGatewayDepositRequest({
        userId: req.user.id,

        gatewayOrderId:
          orderNumber,

        amount,
      });

    const paymentParameters = {
      mchNo:
        config.merchantNumber,

      orderNum:
        orderNumber,

      amount,

      productDetail:
        "TPL22 wallet deposit",

      method:
        payType,

      timestamp:
        String(Date.now()),

      customerName:
        customer.fullName,

      customerEmail:
        customer.email,

      downNotifyUrl:
        config.notifyUrl,

      redirectUrl:
        config.redirectUrl,

    };

    /*
     * সঠিক Bangladesh wallet number
     * থাকলেই optional phone পাঠানো হবে।
     */
    if (
      /^01[3-9]\d{8}$/.test(
        customer.phone,
      )
    ) {
      paymentParameters
        .customerPhone =
        customer.phone;
    }

    /*
     * sign ছাড়া parameters সাজিয়ে
     * Merchant Private Key দিয়ে
     * RSA signature তৈরি হবে।
     */
    paymentParameters.sign =
      createJayaPaySignature(
        paymentParameters,
        config.privateKey,
      );

    const gatewayResponse =
      await fetch(
        config.apiUrl,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            Accept:
              "application/json",
          },

          body: JSON.stringify(
            paymentParameters,
          ),

          signal:
            AbortSignal.timeout(
              15000,
            ),
        },
      );

    const gatewayText =
      await gatewayResponse.text();

    let gatewayData;

    try {
      gatewayData =
        JSON.parse(
          gatewayText,
        );
    } catch {
      const error = new Error(
        "Invalid response received from JayaPay.",
      );

      error.statusCode = 502;

      throw error;
    }

    const paymentUrl =
      String(
        gatewayData
          ?.data
          ?.cashierUrl ||
          "",
      ).trim();

    const platformOrderNumber =
      String(
        gatewayData
          ?.data
          ?.platOrderNum ||
          "",
      ).trim();

    /*
     * JayaPay order-create success:
     * success = true
     * code = 9999
     * cashierUrl থাকতে হবে।
     */
    if (
      !gatewayResponse.ok ||
      gatewayData.success !==
        true ||
      String(
        gatewayData.code,
      ) !== "9999" ||
      !paymentUrl
    ) {
      const error = new Error(
        gatewayData.msg ||
          "JayaPay payment request failed.",
      );

      error.statusCode = 502;

      throw error;
    }

    /*
     * JayaPay platform order number
     * database-এ রাখা হবে।
     */
    if (platformOrderNumber) {
      await saveGatewayTradeNumber({
        userId: req.user.id,

        gatewayOrderId:
          orderNumber,

        gatewayTradeNo:
          platformOrderNumber,
      });
    }

    return res
      .status(200)
      .json({
        success: true,

        message:
          "Payment created successfully.",

        data: {
          orderNumber,

          tradeNumber:
            platformOrderNumber ||
            null,

          paymentUrl,
        },
      });
  } catch (error) {
    /*
     * Order-create ব্যর্থ হলে pending
     * request-এর gateway status update।
     */
    if (
      createdDeposit?.depositId
    ) {
      try {
        await updateGatewayDepositStatus({
          depositId:
            createdDeposit.depositId,

          gatewayStatus:
            "create_failed",
        });
      } catch (
        statusUpdateError
      ) {
        console.error(
          "JayaPay failed status update error:",
          statusUpdateError,
        );
      }
    }

    console.error(
      "JayaPay create payment error:",
      {
        message:
          error.message,

        code:
          error.code || null,
      },
    );

    next(error);
  }
}

async function gatewayCallback(
  req,
  res,
) {
  try {
    const callbackData =
      req.body &&
      typeof req.body ===
        "object"
        ? req.body
        : {};

    const config =
      getJayaPayConfig();

    /*
     * Platform Public Key দিয়ে
     * callback-এর RSA signature
     * যাচাই করা হবে।
     */
    const signatureIsValid =
      verifyJayaPaySignature(
        callbackData,
        config.platformPublicKey,
      );

    if (!signatureIsValid) {
      console.error(
        "JayaPay callback rejected: invalid signature.",
      );

      return res
        .status(401)
        .type("text/plain")
        .send("FAIL");
    }

    const orderNumber =
      String(
        callbackData.orderNum ||
          "",
      ).trim();

    const platformOrderNumber =
      String(
        callbackData
          .platOrderNum ||
          "",
      ).trim();

    const paymentStatus =
      String(
        callbackData.status ||
          "",
      )
        .trim()
        .toUpperCase();

    const paidAmount =
      Number(
        callbackData.amount,
      );

    /*
     * প্রয়োজনীয় callback তথ্য
     * না থাকলে গ্রহণ করা হবে না।
     */
    if (
      !orderNumber ||
      !platformOrderNumber ||
      !paymentStatus ||
      !Number.isInteger(
        paidAmount,
      ) ||
      paidAmount <= 0
    ) {
      console.error(
        "JayaPay callback rejected: invalid callback data.",
      );

      return res
        .status(400)
        .type("text/plain")
        .send("FAIL");

    }

    /*
     * Merchant order number দিয়ে
     * নিজের database-এর deposit খোঁজা।
     */
    let deposit =
      await findGatewayDeposit({
        gatewayOrderId:
          orderNumber,
      });

    if (!deposit) {
      console.error(
        "JayaPay callback rejected: deposit not found.",
      );

      return res
        .status(404)
        .type("text/plain")
        .send("FAIL");
    }

    /*
     * Callback amount এবং database
     * amount অবশ্যই একই হতে হবে।
     */
    if (
      Number(deposit.amount) !==
      paidAmount
    ) {
      console.error(
        "JayaPay callback rejected: amount mismatch.",
        {
          orderNumber,
        },
      );

      return res
        .status(400)
        .type("text/plain")
        .send("FAIL");
    }

    /*
     * Platform order number আগে save
     * এবং gateway status update।
     */
    await updateGatewayDepositStatus({
      depositId:
        deposit.deposit_id,

      gatewayStatus:
        paymentStatus
          .toLowerCase(),

      gatewayTradeNo:
        platformOrderNumber,
    });

    /*
     * শুধু SUCCESS status-এ
     * user wallet credit হবে।
     */
    if (
      paymentStatus ===
      "SUCCESS"
    ) {
      /*
       * Deposit আগে approved থাকলে
       * পুনরায় wallet credit হবে না।
       */
      if (
        deposit.status !==
        "approved"
      ) {
        try {
          await approveDepositRequest({
            depositId:
              deposit.deposit_id,

            /*
             * Gateway automatic approval।
             * কোনো admin approve করেনি।
             */
            adminId: null,
          });
        } catch (approvalError) {
          /*
           * একই callback একাধিকবার এলে
           * concurrent request-এর একটি
           * 409 পেতে পারে। Database আবার
           * দেখে নিশ্চিত হওয়া হবে।
           */
          if (
            approvalError
              .statusCode !==
            409
          ) {
            throw approvalError;
          }

          deposit =
            await findGatewayDeposit({
              gatewayOrderId:
                orderNumber,
            });

          if (
            deposit?.status !==
            "approved"
          ) {
            throw approvalError;
          }
        }
      }
    }

    /*
     * JayaPay-কে exact uppercase
     * SUCCESS response দিতে হবে।
     */
    return res
      .status(200)
      .type("text/plain")
      .send("SUCCESS");
  } catch (error) {
    console.error(
      "JayaPay callback processing error:",
      {
        message:
          error.message,

        code:
          error.code || null,
      },
    );

    /*
     * FAIL পেলে JayaPay callback
     * আবার পাঠাতে পারবে।
     */
    return res
      .status(500)
      .type("text/plain")
      .send("FAIL");
  }
}
module.exports = {
  getPaymentMethods,
  submitDepositRequest,
  getMyDepositHistory,
  getPaymentAccountQr,
  createGatewayPayment,
  gatewayCallback,
};
