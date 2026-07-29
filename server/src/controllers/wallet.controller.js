"use strict";

const { pool } = require("../config/database");

/* =========================================================
   HELPERS
========================================================= */

function createControllerError(
  message,
  statusCode = 500,
  code = "WALLET_ERROR",
) {
  const error = new Error(message);

  error.statusCode = statusCode;
  error.code = code;

  return error;
}

function parseMoney(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return 0;
  }

  return Number(amount.toFixed(2));
}

function parsePositiveInteger(value) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function parseNonNegativeInteger(value) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function mapTransactionRow(transaction) {
  return {
    id: Number(transaction.id),

    transactionId: transaction.transaction_id,

    transactionType: transaction.transaction_type,

    direction: transaction.direction,

    amount: parseMoney(transaction.amount),

    balanceBefore: parseMoney(transaction.balance_before),

    balanceAfter: parseMoney(transaction.balance_after),

    status: transaction.status,

    referenceType: transaction.reference_type,

    referenceId: transaction.reference_id,

    description: transaction.description,

    createdAt: transaction.created_at,
  };
}

/* =========================================================
   GET WALLET SUMMARY
========================================================= */

async function getWalletSummary(req, res, next) {
  try {
    const userId = parsePositiveInteger(req.user?.id);

    if (!userId) {
      throw createControllerError(
        "Authenticated user ID is required.",
        401,
        "INVALID_AUTHENTICATED_USER",
      );
    }

    const [userResult, summaryResult, transactionResult] = await Promise.all([
      pool.execute(
        `
          SELECT
            id,
            uid,
            full_name,
            username,
            phone,
            email,
            avatar_url,
            account_status,
            wallet_balance,
            turnover_amount,
            total_deposit,
            total_withdraw,
            updated_at
          FROM users
          WHERE id = ?
          LIMIT 1
          `,
        [userId],
      ),

      pool.execute(
        `
          SELECT
            COALESCE(
              SUM(
                CASE
                  WHEN transaction_type = 'game_win'
                    AND direction = 'credit'
                    AND status = 'completed'
                  THEN amount
                  ELSE 0
                END
              ),
              0
            ) AS total_winning,

            COALESCE(
              SUM(
                CASE
                  WHEN transaction_type = 'game_loss'
                    AND direction = 'debit'
                    AND status = 'completed'
                  THEN amount
                  ELSE 0
                END
              ),
              0
            ) AS total_loss,

            COALESCE(
              SUM(
                CASE
                  WHEN transaction_type = 'service_charge'
                    AND status = 'completed'
                  THEN amount
                  ELSE 0
                END
              ),
              0
            ) AS total_service_charge,

            SUM(
              CASE
                WHEN transaction_type = 'game_win'
                  AND direction = 'credit'
                  AND status = 'completed'
                THEN 1
                ELSE 0
              END
            ) AS winning_transactions,

            SUM(
              CASE
                WHEN transaction_type = 'game_loss'
                  AND direction = 'debit'
                  AND status = 'completed'
                THEN 1
                ELSE 0
              END
            ) AS losing_transactions

          FROM wallet_transactions
          WHERE user_id = ?
          `,
        [userId],
      ),

      pool.execute(
        `
          SELECT
            id,
            transaction_id,
            transaction_type,
            direction,
            amount,
            balance_before,
            balance_after,
            status,
            reference_type,
            reference_id,
            description,
            created_at
          FROM wallet_transactions
          WHERE user_id = ?
          ORDER BY id DESC
          LIMIT 10
          `,
        [userId],
      ),
    ]);

    const userRows = userResult[0];
    const summaryRows = summaryResult[0];
    const transactionRows = transactionResult[0];

    if (!userRows.length) {
      throw createControllerError(
        "Wallet user was not found.",
        404,
        "WALLET_USER_NOT_FOUND",
      );
    }

    const user = userRows[0];
    const summary = summaryRows[0] || {};

    const winningTransactions = Number(summary.winning_transactions || 0);

    const losingTransactions = Number(summary.losing_transactions || 0);

    const completedGameResults = winningTransactions + losingTransactions;

    const winRate =
      completedGameResults > 0
        ? Number(
            ((winningTransactions / completedGameResults) * 100).toFixed(2),
          )
        : 0;

    const transactions = transactionRows.map(mapTransactionRow);

    return res.status(200).json({
      success: true,

      message: "Wallet summary loaded successfully.",

      data: {
        user: {
          id: Number(user.id),
          uid: user.uid,
          fullName: user.full_name,
          username: user.username,
          phone: user.phone,
          email: user.email,
          avatarUrl: user.avatar_url || null,
          accountStatus: user.account_status,
        },

        wallet: {
          balance: parseMoney(user.wallet_balance),

          turnoverAmount: parseMoney(user.turnover_amount),

          totalDeposit: parseMoney(user.total_deposit),

          totalWithdraw: parseMoney(user.total_withdraw),

          totalWinning: parseMoney(summary.total_winning),

          totalLoss: parseMoney(summary.total_loss),

          totalServiceCharge: parseMoney(summary.total_service_charge),

          winRate,

          updatedAt: user.updated_at,
        },

        transactions,
      },
    });
  } catch (error) {
    next(error);
  }
}

/* =========================================================
   GET PAGINATED WALLET TRANSACTIONS
========================================================= */

async function getWalletTransactions(req, res, next) {
  try {
    const userId = parsePositiveInteger(req.user?.id);

    if (!userId) {
      throw createControllerError(
        "Authenticated user ID is required.",
        401,
        "INVALID_AUTHENTICATED_USER",
      );
    }

    const requestedPage = parsePositiveInteger(req.query.page) || 1;

    const requestedLimit = parsePositiveInteger(req.query.limit) || 20;

    /*
     * এক request-এ সর্বোচ্চ ৫০টি।
     */
    const limit = Math.min(requestedLimit, 50);

    const requestedOffset = parseNonNegativeInteger(req.query.offset);

    const offset =
      requestedOffset === null ? (requestedPage - 1) * limit : requestedOffset;

    const [countResult, transactionResult] = await Promise.all([
      pool.execute(
        `
          SELECT
            COUNT(*) AS total
          FROM wallet_transactions
          WHERE user_id = ?
        `,
        [userId],
      ),

      pool.execute(
        `
          SELECT
            id,
            transaction_id,
            transaction_type,
            direction,
            amount,
            balance_before,
            balance_after,
            status,
            reference_type,
            reference_id,
            description,
            created_at
          FROM wallet_transactions
          WHERE user_id = ?
          ORDER BY id DESC
        LIMIT ${limit}
OFFSET ${offset}
`,
        [userId],
      ),
    ]);

    const total = Number(countResult[0][0]?.total || 0);

    const transactions = transactionResult[0].map(mapTransactionRow);

    const loadedUntil = offset + transactions.length;

    return res.status(200).json({
      success: true,

      message: "Wallet transactions loaded successfully.",

      data: {
        transactions,

        pagination: {
          page: Math.floor(offset / limit) + 1,

          limit,
          offset,
          total,

          hasMore: loadedUntil < total,

          nextOffset: loadedUntil < total ? loadedUntil : null,
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getWalletSummary,
  getWalletTransactions,
};
