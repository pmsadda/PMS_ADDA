const {
    getAllDepositRequests,
    approveDepositRequest,
    rejectDepositRequest
} = require("../services/admin-deposit.service");

/* ==========================
   Get All Deposit Requests
========================== */

async function getDepositRequests(
    req,
    res,
    next
) {
    try {
        const status =
            String(
                req.query.status || "all"
            )
                .trim()
                .toLowerCase();

        const method =
            String(
                req.query.method || "all"
            )
                .trim()
                .toLowerCase();

        const search =
            String(
                req.query.search || ""
            ).trim();

        const allowedStatuses = [
            "all",
            "pending",
            "approved",
            "rejected"
        ];

        const allowedMethods = [
            "all",
            "bkash",
            "nagad",
            "rocket"
        ];

        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message:
                    "Invalid deposit status filter."
            });
        }

        if (!allowedMethods.includes(method)) {
            return res.status(400).json({
                success: false,
                message:
                    "Invalid payment method filter."
            });
        }

        const deposits =
            await getAllDepositRequests({
                status,
                method,
                search
            });

        const summary = deposits.reduce(
            (result, deposit) => {
                if (deposit.status === "pending") {
                    result.pending += 1;
                }

                if (deposit.status === "approved") {
                    result.approved += 1;
                    result.approvedAmount +=
                        deposit.amount;
                }

                if (deposit.status === "rejected") {
                    result.rejected += 1;
                }

                return result;
            },
            {
                total: deposits.length,
                pending: 0,
                approved: 0,
                rejected: 0,
                approvedAmount: 0
            }
        );

        return res.status(200).json({
            success: true,
            message:
                "Deposit requests loaded successfully.",

            data: {
                summary,
                deposits
            }
        });
    } catch (error) {
        next(error);
    }
}

/* ==========================
   Approve Deposit Request
========================== */

async function approveDeposit(
    req,
    res,
    next
) {
    try {
        const depositId =
            String(
                req.params.depositId || ""
            )
                .trim()
                .toUpperCase();

        if (!depositId) {
            return res.status(400).json({
                success: false,
                message:
                    "Deposit ID is required."
            });
        }

        const result =
            await approveDepositRequest({
                depositId,
                adminId: req.user.id
            });

        return res.status(200).json({
            success: true,
            message:
                "Deposit approved successfully.",

            data: {
                deposit: result
            }
        });
    } catch (error) {
        next(error);
    }
}

/* ==========================
   Reject Deposit Request
========================== */

async function rejectDeposit(
    req,
    res,
    next
) {
    try {
        const depositId =
            String(
                req.params.depositId || ""
            )
                .trim()
                .toUpperCase();

        const reason =
            String(
                req.body.reason || ""
            )
                .trim()
                .toLowerCase();

        const note =
            String(
                req.body.note || ""
            ).trim();

        const allowedReasons = [
            "transaction_not_found",
            "wrong_amount",
            "duplicate_transaction",
            "wrong_sender",
            "other"
        ];

        if (!depositId) {
            return res.status(400).json({
                success: false,
                message:
                    "Deposit ID is required."
            });
        }

        if (!allowedReasons.includes(reason)) {
            return res.status(400).json({
                success: false,
                message:
                    "Please select a valid reject reason."
            });
        }

        if (note.length > 255) {
            return res.status(400).json({
                success: false,
                message:
                    "Admin note cannot exceed 255 characters."
            });
        }

        const result =
            await rejectDepositRequest({
                depositId,
                adminId: req.user.id,
                reason,
                note
            });

        return res.status(200).json({
            success: true,
            message:
                "Deposit rejected successfully.",

            data: {
                deposit: result
            }
        });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    getDepositRequests,
    approveDeposit,
    rejectDeposit
};