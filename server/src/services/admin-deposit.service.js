const { pool } = require("../config/database");

/* ==========================
   Get All Deposit Requests
========================== */

async function getAllDepositRequests({
    status = "all",
    method = "all",
    search = ""
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
            searchValue
        );
    }

    const whereClause =
        conditions.length > 0
            ? `WHERE ${conditions.join(" AND ")}`
            : "";

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
        values
    );

    return rows.map((row) => ({
        id: row.id,
        depositId: row.deposit_id,
        userId: row.user_id,
        userUid: row.uid,
        fullName: row.full_name,
        userPhone: row.phone,
        email: row.email,
        currentWalletBalance: Number(
            row.wallet_balance
        ),
        method: row.method,
        senderNumber: row.sender_number,
        transactionNumber:
            row.transaction_number,
        amount: Number(row.amount),
        status: row.status,
        adminNote: row.admin_note,
        approvedBy: row.approved_by,
        approvedAt: row.approved_at,
        createdAt: row.created_at
    }));
}

/* ==========================
   Generate Wallet Transaction ID
========================== */

function generateWalletTransactionId() {
    const timestamp = Date.now();

    const random = Math.floor(
        1000 + Math.random() * 9000
    );

    return `WTX${timestamp}${random}`;
}

/* ==========================
   Approve Deposit
========================== */

async function approveDepositRequest({
    depositId,
    adminId
}) {
    const connection =
        await pool.getConnection();

    try {
        await connection.beginTransaction();

        /*
        Deposit row lock করা হচ্ছে,
        যাতে একই request দুই admin একসাথে
        approve করতে না পারে।
        */

        const [depositRows] =
            await connection.execute(
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
                [depositId]
            );

        const deposit = depositRows[0];

        if (!deposit) {
            const error = new Error(
                "Deposit request not found."
            );

            error.statusCode = 404;

            throw error;
        }

        if (deposit.status !== "pending") {
            const error = new Error(
                "This deposit request has already been processed."
            );

            error.statusCode = 409;

            throw error;
        }

        /* User wallet row lock */

        const [userRows] =
            await connection.execute(
                `
                SELECT
                    id,
                    wallet_balance,
                    total_deposit
                FROM users
                WHERE id = ?
                LIMIT 1
                FOR UPDATE
                `,
                [deposit.user_id]
            );

        const user = userRows[0];

        if (!user) {
            const error = new Error(
                "Deposit user not found."
            );

            error.statusCode = 404;

            throw error;
        }

        const amount =
            Number(deposit.amount);

        const balanceBefore =
            Number(user.wallet_balance);

        const balanceAfter =
            balanceBefore + amount;

        const totalDepositAfter =
            Number(user.total_deposit) + amount;

        /* Update user wallet */

        await connection.execute(
            `
            UPDATE users
            SET
                wallet_balance = ?,
                total_deposit = ?
            WHERE id = ?
            `,
            [
                balanceAfter,
                totalDepositAfter,
                deposit.user_id
            ]
        );

        /* Mark deposit approved */

        await connection.execute(
            `
            UPDATE deposit_requests
            SET
                status = 'approved',
                approved_by = ?,
                approved_at = NOW(),
                admin_note = NULL
            WHERE id = ?
            `,
            [
                adminId,
                deposit.id
            ]
        );

        /* Wallet transaction entry */

        const walletTransactionId =
            generateWalletTransactionId();

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
                amount,
                balanceBefore,
                balanceAfter,
                deposit.deposit_id,
                `Deposit approved: ${deposit.deposit_id}`,
                adminId
            ]
        );

        await connection.commit();

        return {
            depositId: deposit.deposit_id,
            status: "approved",
            amount,
            balanceBefore,
            balanceAfter,
            totalDepositAfter,
            walletTransactionId
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

async function rejectDepositRequest({
    depositId,
    adminId,
    reason,
    note
}) {
    const connection =
        await pool.getConnection();

    try {
        await connection.beginTransaction();

        const [rows] =
            await connection.execute(
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
                [depositId]
            );

        const deposit = rows[0];

        if (!deposit) {
            const error = new Error(
                "Deposit request not found."
            );

            error.statusCode = 404;

            throw error;
        }

        if (deposit.status !== "pending") {
            const error = new Error(
                "This deposit request has already been processed."
            );

            error.statusCode = 409;

            throw error;
        }

        const adminNote = note
            ? `${reason}: ${note}`
            : reason;

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
            [
                adminId,
                adminNote,
                deposit.id
            ]
        );

        await connection.commit();

        return {
            depositId: deposit.deposit_id,
            status: "rejected",
            reason,
            note: note || null
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
    rejectDepositRequest
};