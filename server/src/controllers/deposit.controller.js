const crypto = require("crypto");

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

async function createGatewayPayment(req, res, next) {
  try {
    const amount = Number(req.body?.amount);

    const payType = String(req.body?.payType || "")
      .trim()
      .toUpperCase();

    const payTypeCodes = {
      BKASH: "2202",
      NAGAD: "2201",
    };

    const gatewayPayType = payTypeCodes[payType];

    if (!gatewayPayType) {
      return res.status(400).json({
        success: false,
        message: "This payment method is not available.",
      });
    }

    if (!Number.isFinite(amount) || amount < 100 || amount > 1000000) {
      return res.status(400).json({
        success: false,
        message: "Deposit amount must be between ৳100 and ৳10,00,000.",
      });
    }

    const appId = String(process.env.PAYMENT_APP_ID || "").trim();
    const secretKey = String(process.env.PAYMENT_SECRET_KEY || "").trim();
    const paymentApiUrl = String(process.env.PAYMENT_API_URL || "").trim();
    const callbackUrl = String(process.env.PAYMENT_CALLBACK_URL || "").trim();

    if (!appId || !secretKey || !paymentApiUrl || !callbackUrl) {
      const error = new Error("Payment gateway configuration is incomplete.");
      error.statusCode = 500;
      throw error;
    }

    const orderNo =
      `PMS${Date.now()}` + crypto.randomBytes(8).toString("hex").toUpperCase();

    await createGatewayDepositRequest({
      userId: req.user.id,
      gatewayOrderId: orderNo,
      amount,
    });

    const now = new Date();

    const pad = (value) => String(value).padStart(2, "0");

    const orderDate =
      `${now.getFullYear()}-` +
      `${pad(now.getMonth() + 1)}-` +
      `${pad(now.getDate())} ` +
      `${pad(now.getHours())}:` +
      `${pad(now.getMinutes())}:` +
      `${pad(now.getSeconds())}`;

    const params = {
      app_id: appId,
      mch_order_no: orderNo,
      trade_amount: String(amount),
      pay_type: gatewayPayType,
      goods_name: payType,
      notify_url: callbackUrl,
      page_url: "https://pms-adda.site/lobby",
      mch_return_msg: orderNo,
      order_date: orderDate,
    };

    const signString =
      Object.keys(params)
        .sort()
        .map((key) => `${key}=${params[key]}`)
        .join("&") + `&key=${secretKey}`;

    const sign = crypto
      .createHash("md5")
      .update(signString, "utf8")
      .digest("hex");

    const form = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      form.append(key, value);
    });

    form.append("sign_type", "MD5");
    form.append("sign", sign);

    console.log("PAYMENT REQUEST DEBUG:", {
  appId:
    appId.length > 6
      ? `${appId.slice(0, 4)}...${appId.slice(-4)}`
      : "***",

  paymentApiUrl,

  mch_order_no: params.mch_order_no,
  trade_amount: params.trade_amount,
  pay_type: params.pay_type,
  goods_name: params.goods_name,
  notify_url: params.notify_url,
  page_url: params.page_url,
  mch_return_msg: params.mch_return_msg,
  order_date: params.order_date,
});

    const gatewayResponse = await fetch(paymentApiUrl, {
      method: "POST",

      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },

      body: form.toString(),
    });

    const gatewayText = await gatewayResponse.text();

    let gatewayData;

    try {
      gatewayData = JSON.parse(gatewayText);
    } catch {
      throw new Error("Invalid payment gateway response.");
    }

    console.log("PAYMENT GATEWAY RESPONSE:", gatewayData);

    if (
      gatewayData.respCode !== "SUCCESS" ||
      !(gatewayData.payUrl || gatewayData.pay_url || gatewayData.payInfo)
    ) {
      const error = new Error(
        gatewayData.tradeMsg || "Payment gateway request failed.",
      );

      error.statusCode = 502;
      throw error;
    }

    const gatewayTradeNo =
      gatewayData.tradeNo ||
      gatewayData.mchOrderNo ||
      gatewayData.orderNo ||
      null;

    if (gatewayTradeNo) {
      await saveGatewayTradeNumber({
        userId: req.user.id,
        gatewayOrderId: orderNo,
        gatewayTradeNo,
      });
    }

    return res.status(200).json({
      success: true,

      message: "Payment created successfully.",

      data: {
        orderNumber: orderNo,

        tradeNumber: gatewayTradeNo,

        paymentUrl:
          gatewayData.payUrl || gatewayData.pay_url || gatewayData.payInfo,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function gatewayCallback(req, res) {
  try {
    const body =
      req.body && typeof req.body === "object"
        ? req.body
        : {};

    console.log("===== PAYMENT CALLBACK =====");
    console.log("tradeResult:", body.tradeResult);
    console.log("mchOrderNo:", body.mchOrderNo);
    console.log("amount:", body.amount);
    console.log("tradeNo:", body.tradeNo);
    console.log("sign:", body.sign ? "YES" : "NO");
    console.log("signType:", body.signType || body.sign_type);
    console.log("body keys:", Object.keys(body));
    console.log("============================");

    /*
     * প্রথম live test-এ wallet auto credit করছি না।
     * Callback format confirm করার পর enable করব।
     */

    return res
      .status(200)
      .type("text/plain")
      .send("success");
  } catch (error) {
    console.error(
      "GATEWAY CALLBACK ERROR:",
      error,
    );

    return res
      .status(200)
      .type("text/plain")
      .send("fail");
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
