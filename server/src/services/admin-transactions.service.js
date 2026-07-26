const { pool } = require("../config/database");

function normalizeFilter(value, allowedValues) {
  if (!value || value === "all") {
    return null;
  }

  return allowedValues.includes(value)
    ? value
    : null;
}

async function getTransactions(queryParams = {}) {
  const page = Math.max(
    Number.parseInt(queryParams.page, 10) || 1,
    1
  );

  const limit = Math.min(
    Math.max(
      Number.parseInt(queryParams.limit, 10) || 10,
      1
    ),
    100
  );

  const offset = (page - 1) * limit;

  const type = normalizeFilter(
    queryParams.type,
    ["deposit", "withdraw"]
  );

  const status = normalizeFilter(
    queryParams.status,
    ["pending", "approved", "rejected"]
  );

  const method = normalizeFilter(
    queryParams.method,
    ["bkash", "nagad", "rocket"]
  );

  const search = String(
    queryParams.search || ""
  ).trim();

  const conditions = [];
  const parameters = [];

  if (type) {
    conditions.push("transactions.type = ?");
    parameters.push(type);
  }

  if (status) {
    conditions.push("transactions.status = ?");
    parameters.push(status);
  }

  if (method) {
    conditions.push("transactions.method = ?");
    parameters.push(method);
  }

  if (search) {
    conditions.push(`
      (
        transactions.transaction_id LIKE ?
        OR transactions.uid LIKE ?
        OR transactions.full_name LIKE ?
        OR transactions.username LIKE ?
        OR transactions.phone LIKE ?
        OR transactions.account_number LIKE ?
        OR transactions.reference_number LIKE ?
      )
    `);

    const searchValue = `%${search}%`;

    parameters.push(
      searchValue,
      searchValue,
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

  const transactionQuery = `
    SELECT *
    FROM
    (
      SELECT
        deposit.id AS source_id,
        deposit.deposit_id AS transaction_id,
        'deposit' AS type,

        deposit.user_id,
        users.uid,
        users.full_name,
        users.username,
        users.phone,

        deposit.method,
        deposit.sender_number AS account_number,
        deposit.transaction_number AS reference_number,

        deposit.amount,
        deposit.status,
        deposit.admin_note,

        NULL AS reject_reason,

        deposit.approved_at AS processed_at,
        deposit.created_at

      FROM deposit_requests AS deposit

      INNER JOIN users
        ON users.id = deposit.user_id

      UNION ALL

      SELECT
        withdraw.id AS source_id,
        withdraw.withdraw_id AS transaction_id,
        'withdraw' AS type,

        withdraw.user_id,
        users.uid,
        users.full_name,
        users.username,
        users.phone,

        withdraw.method,
        withdraw.account_number,
        withdraw.admin_payment_reference
          AS reference_number,

        withdraw.amount,
        withdraw.status,
        withdraw.admin_note,
        withdraw.reject_reason,
        withdraw.processed_at,
        withdraw.created_at

      FROM withdraw_requests AS withdraw

      INNER JOIN users
        ON users.id = withdraw.user_id
    ) AS transactions

    ${whereClause}
  `;

  const countSql = `
    SELECT COUNT(*) AS total
    FROM (
      ${transactionQuery}
    ) AS filtered_transactions
  `;

  const dataSql = `
    ${transactionQuery}

    ORDER BY transactions.created_at DESC

    LIMIT ?
    OFFSET ?
  `;

  const [countRows] = await pool.query(
    countSql,
    parameters
  );

  const dataParameters = [
    ...parameters,
    limit,
    offset
  ];

  const [transactionRows] = await pool.query(
    dataSql,
    dataParameters
  );

  const total = Number(
    countRows[0]?.total || 0
  );

  return {
    transactions: transactionRows.map(
      transaction => ({
        ...transaction,
        source_id: Number(
          transaction.source_id
        ),

        user_id: Number(
          transaction.user_id
        ),

        amount: Number(
          transaction.amount || 0
        )
      })
    ),

    pagination: {
      page,
      limit,
      total,
      totalPages:
        total === 0
          ? 1
          : Math.ceil(total / limit)
    }
  };
}

async function getTransactionSummary() {
  const [rows] = await pool.query(`
    SELECT
      COALESCE(SUM(
        CASE
          WHEN type = 'deposit'
            AND status = 'approved'
          THEN amount
          ELSE 0
        END
      ), 0) AS approved_deposit,

      COALESCE(SUM(
        CASE
          WHEN type = 'withdraw'
            AND status = 'approved'
          THEN amount
          ELSE 0
        END
      ), 0) AS approved_withdraw,

      COALESCE(SUM(
        CASE
          WHEN status = 'pending'
          THEN 1
          ELSE 0
        END
      ), 0) AS pending_count,

      COUNT(*) AS total_count

    FROM
    (
      SELECT
        'deposit' AS type,
        amount,
        status
      FROM deposit_requests

      UNION ALL

      SELECT
        'withdraw' AS type,
        amount,
        status
      FROM withdraw_requests
    ) AS transaction_summary
  `);

  const summary = rows[0] || {};

  const approvedDeposit = Number(
    summary.approved_deposit || 0
  );

  const approvedWithdraw = Number(
    summary.approved_withdraw || 0
  );

  return {
    totalCount: Number(
      summary.total_count || 0
    ),

    pendingCount: Number(
      summary.pending_count || 0
    ),

    approvedDeposit,
    approvedWithdraw,

    netCashFlow:
      approvedDeposit - approvedWithdraw
  };
}

module.exports = {
  getTransactions,
  getTransactionSummary
};