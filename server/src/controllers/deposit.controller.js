const {
    createDepositRequest,
    getUserDepositRequests
} = require("../services/deposit.service");

/* ==========================
   Create Deposit Request
========================== */

async function submitDepositRequest(
    req,
    res,
    next
) {
    try {
        const {
            method,
            senderNumber,
            transactionNumber,
            amount
        } = req.body;

        /* Required Fields */

        if (
            !method ||
            !senderNumber ||
            !transactionNumber ||
            amount === undefined
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "সব Deposit তথ্য সঠিকভাবে দিন।"
            });
        }

        /* Clean Data */

        const cleanedMethod =
            String(method)
                .trim()
                .toLowerCase();

        const cleanedSenderNumber =
            String(senderNumber).trim();

        const cleanedTransactionNumber =
            String(transactionNumber)
                .trim()
                .toUpperCase();

        const cleanedAmount =
            Number(amount);

        /* Method Validation */

        const allowedMethods = [
            "bkash",
            "nagad",
            "rocket"
        ];

        if (
            !allowedMethods.includes(
                cleanedMethod
            )
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "সঠিক Payment Method নির্বাচন করুন।"
            });
        }

        /* Sender Number Validation */

        if (
            !/^01[3-9]\d{8}$/.test(
                cleanedSenderNumber
            )
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "সঠিক ১১ ডিজিটের Sender Number দিন।"
            });
        }

        /* Transaction ID Validation */

        if (
            cleanedTransactionNumber.length < 6 ||
            cleanedTransactionNumber.length > 100
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "সঠিক Transaction ID দিন।"
            });
        }

        /* Amount Validation */

        if (
            !Number.isFinite(cleanedAmount) ||
            cleanedAmount < 100
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Minimum deposit amount ৳100।"
            });
        }

        const deposit =
            await createDepositRequest({
                userId: req.user.id,
                method: cleanedMethod,
                senderNumber:
                    cleanedSenderNumber,
                transactionNumber:
                    cleanedTransactionNumber,
                amount: cleanedAmount
            });

        return res.status(201).json({
            success: true,
            message:
                "Deposit request submitted successfully.",

            data: {
                deposit
            }
        });
    } catch (error) {
        next(error);
    }
}

/* ==========================
   Get My Deposit History
========================== */

async function getMyDepositHistory(
    req,
    res,
    next
) {
    try {
        const deposits =
            await getUserDepositRequests(
                req.user.id
            );

        return res.status(200).json({
            success: true,
            message:
                "Deposit history loaded successfully.",

            data: {
                deposits
            }
        });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    submitDepositRequest,
    getMyDepositHistory
};