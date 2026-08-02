const { pool } = require("../config/database");

function normalizeFilter(value, allowedValues) {
  if (!value || value === "all") {
    return null;
  }

  return allowedValues.includes(value) ? value : null;
}

async function getTransactions(queryParams = {}) {
  const page = Math.max(Number.parseInt(queryParams.page, 10) || 1, 1);

  const limit = Math.min(
    Math.max(Number.parseInt(queryParams.limit, 10) || 10, 1),
    100,
  );

  const offset = (page - 1) * limit;

  const type = normalizeFilter(queryParams.type, ["deposit", "withdraw"]);

  const status = normalizeFilter(queryParams.status, [
    "pending",
    "approved",
    "rejected",
  ]);

  const method = normalizeFilter(queryParams.method, [
    "bkash",
    "nagad",
    "rocket",
  ]);

  const search = String(queryParams.search || "").trim();

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
      searchValue,
    );
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

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

  const [countRows] = await pool.query(countSql, parameters);

  const dataParameters = [...parameters, limit, offset];

  const [transactionRows] = await pool.query(dataSql, dataParameters);

  const total = Number(countRows[0]?.total || 0);

  return {
    transactions: transactionRows.map((transaction) => ({
      ...transaction,
      source_id: Number(transaction.source_id),

      user_id: Number(transaction.user_id),

      amount: Number(transaction.amount || 0),
    })),

    pagination: {
      page,
      limit,
      total,
      totalPages: total === 0 ? 1 : Math.ceil(total / limit),
    },
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

  const approvedDeposit = Number(summary.approved_deposit || 0);

  const approvedWithdraw = Number(summary.approved_withdraw || 0);

  return {
    totalCount: Number(summary.total_count || 0),

    pendingCount: Number(summary.pending_count || 0),

    approvedDeposit,
    approvedWithdraw,

    netCashFlow: approvedDeposit - approvedWithdraw,
  };
}

function normalizeHistoryDate(value) {
  const cleanedValue = String(value || "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanedValue)) {
    return null;
  }

  const parsedDate = new Date(`${cleanedValue}T00:00:00Z`);

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return cleanedValue;
}

async function getReferralHistory(queryParams = {}) {
  const page = Math.max(Number.parseInt(queryParams.page, 10) || 1, 1);

  const limit = Math.min(
    Math.max(Number.parseInt(queryParams.limit, 10) || 20, 1),
    100,
  );

  const offset = (page - 1) * limit;

  const status = normalizeFilter(queryParams.status, [
    "pending",
    "rewarded",
    "cancelled",
  ]);

  const search = String(queryParams.search || "").trim();

  const startDate = normalizeHistoryDate(queryParams.startDate);

  const endDate = normalizeHistoryDate(queryParams.endDate);

  const conditions = [];
  const parameters = [];

  if (status) {
    conditions.push("referral.status = ?");

    parameters.push(status);
  }

  if (startDate) {
    conditions.push("DATE(referral.created_at) >= ?");

    parameters.push(startDate);
  }

  if (endDate) {
    conditions.push("DATE(referral.created_at) <= ?");

    parameters.push(endDate);
  }

  if (search) {
    conditions.push(`
      (
        referral.referral_code_used LIKE ?
        OR referrer.uid LIKE ?
        OR referrer.full_name LIKE ?
        OR referrer.username LIKE ?
        OR referrer.phone LIKE ?
        OR referred.uid LIKE ?
        OR referred.full_name LIKE ?
        OR referred.username LIKE ?
        OR referred.phone LIKE ?
        OR deposit.deposit_id LIKE ?
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
      searchValue,
      searchValue,
      searchValue,
      searchValue,
    );
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const joinSql = `
    FROM user_referrals AS referral

    INNER JOIN users AS referrer
      ON referrer.id =
         referral.referrer_user_id

    INNER JOIN users AS referred
      ON referred.id =
         referral.referred_user_id

    LEFT JOIN deposit_requests AS deposit
      ON deposit.id =
         referral.qualifying_deposit_id

    ${whereClause}
  `;

  const [summaryRows] = await pool.query(
    `
      SELECT
        COUNT(*) AS total,

        COALESCE(
          SUM(
            CASE
              WHEN referral.status =
                'pending'
              THEN 1
              ELSE 0
            END
          ),
          0
        ) AS pending_count,

        COALESCE(
          SUM(
            CASE
              WHEN referral.status =
                'rewarded'
              THEN 1
              ELSE 0
            END
          ),
          0
        ) AS rewarded_count,

        COALESCE(
          SUM(
            CASE
              WHEN referral.status =
                'cancelled'
              THEN 1
              ELSE 0
            END
          ),
          0
        ) AS cancelled_count,

        COALESCE(
          SUM(
            CASE
              WHEN referral.status =
                'rewarded'
              THEN
                referral
                  .referrer_bonus_amount +
                referral
                  .referred_bonus_amount
              ELSE 0
            END
          ),
          0
        ) AS total_bonus_paid

      ${joinSql}
    `,
    parameters,
  );

  /*
   * limit ও offset parsed এবং clamp করা।
   * TiDB-এর prepared LIMIT সমস্যা এড়াতে
   * validated integer সরাসরি SQL-এ বসছে।
   */
  const [rows] = await pool.query(
    `
        SELECT
          referral.id,
          referral.referral_code_used,
          referral.status,

          referral.referrer_bonus_amount,
          referral.referred_bonus_amount,

          referral.created_at,
          referral.rewarded_at,
          referral.updated_at,

          referrer.id AS referrer_user_id,
          referrer.uid AS referrer_uid,
          referrer.full_name
            AS referrer_full_name,
          referrer.username
            AS referrer_username,
          referrer.phone
            AS referrer_phone,

          referred.id AS referred_user_id,
          referred.uid AS referred_uid,
          referred.full_name
            AS referred_full_name,
          referred.username
            AS referred_username,
          referred.phone
            AS referred_phone,

          deposit.id
            AS qualifying_deposit_id,
          deposit.deposit_id
            AS qualifying_deposit_code,
          deposit.amount
            AS qualifying_deposit_amount,
          deposit.status
            AS qualifying_deposit_status

        ${joinSql}

        ORDER BY referral.id DESC

        LIMIT ${limit}
        OFFSET ${offset}
      `,
    parameters,
  );

  const summary = summaryRows[0] || {};

  const total = Number(summary.total || 0);

  return {
    referrals: rows.map((row) => ({
      id: Number(row.id),

      referralCode: row.referral_code_used,

      status: row.status,

      referrerBonusAmount: Number(row.referrer_bonus_amount || 0),

      referredBonusAmount: Number(row.referred_bonus_amount || 0),

      totalBonusAmount:
        Number(row.referrer_bonus_amount || 0) +
        Number(row.referred_bonus_amount || 0),

      referrer: {
        userId: Number(row.referrer_user_id),

        uid: row.referrer_uid,

        fullName: row.referrer_full_name,

        username: row.referrer_username,

        phone: row.referrer_phone,
      },

      referredUser: {
        userId: Number(row.referred_user_id),

        uid: row.referred_uid,

        fullName: row.referred_full_name,

        username: row.referred_username,

        phone: row.referred_phone,
      },

      qualifyingDeposit: row.qualifying_deposit_id
        ? {
            id: Number(row.qualifying_deposit_id),

            depositId: row.qualifying_deposit_code,

            amount: Number(row.qualifying_deposit_amount || 0),

            status: row.qualifying_deposit_status,
          }
        : null,

      createdAt: row.created_at,

      rewardedAt: row.rewarded_at,

      updatedAt: row.updated_at,
    })),

    summary: {
      totalReferrals: total,

      pendingReferrals: Number(summary.pending_count || 0),

      rewardedReferrals: Number(summary.rewarded_count || 0),

      cancelledReferrals: Number(summary.cancelled_count || 0),

      totalBonusPaid: Number(summary.total_bonus_paid || 0),
    },

    pagination: {
      page,
      limit,
      total,

      totalPages: total === 0 ? 1 : Math.ceil(total / limit),
    },
  };
}

async function getBonusHistory(queryParams = {}) {
  const page = Math.max(Number.parseInt(queryParams.page, 10) || 1, 1);

  const limit = Math.min(
    Math.max(Number.parseInt(queryParams.limit, 10) || 20, 1),
    100,
  );

  const offset = (page - 1) * limit;

  const bonusType = normalizeFilter(queryParams.type, [
    "first_deposit",
    "referrer_bonus",
    "referred_user_bonus",
  ]);

  const search = String(queryParams.search || "").trim();

  const startDate = normalizeHistoryDate(queryParams.startDate);

  const endDate = normalizeHistoryDate(queryParams.endDate);

  const conditions = [];
  const parameters = [];

  if (bonusType) {
    conditions.push("bonus_history.bonus_type = ?");

    parameters.push(bonusType);
  }

  if (startDate) {
    conditions.push("DATE(bonus_history.awarded_at) >= ?");

    parameters.push(startDate);
  }

  if (endDate) {
    conditions.push("DATE(bonus_history.awarded_at) <= ?");

    parameters.push(endDate);
  }

  if (search) {
    conditions.push(`
      (
        bonus_history.uid LIKE ?
        OR bonus_history.full_name LIKE ?
        OR bonus_history.username LIKE ?
        OR bonus_history.phone LIKE ?
        OR bonus_history.reference_code LIKE ?
        OR bonus_history.related_uid LIKE ?
        OR bonus_history.related_full_name LIKE ?
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
      searchValue,
    );
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const sourceQuery = `
    SELECT
      CONCAT(
        'FIRST_DEPOSIT_',
        deposit.id
      ) AS history_key,

      deposit.id AS source_id,

      'first_deposit'
        AS bonus_type,

      deposit.user_id,
      bonus_user.uid,
      bonus_user.full_name,
      bonus_user.username,
      bonus_user.phone,

      NULL AS related_user_id,
      NULL AS related_uid,
      NULL AS related_full_name,
      NULL AS related_username,

      deposit.bonus_amount
        AS bonus_amount,

      'deposit'
        AS reference_type,

      deposit.deposit_id
        AS reference_code,

      deposit.amount
        AS qualifying_amount,

      deposit.first_bonus_percent
        AS bonus_percent,

      deposit.first_bonus_cap
        AS maximum_bonus,

      deposit.first_bonus_minimum_deposit
        AS minimum_qualifying_amount,

      COALESCE(
        deposit.approved_at,
        deposit.created_at
      ) AS awarded_at

    FROM deposit_requests AS deposit

    INNER JOIN users AS bonus_user
      ON bonus_user.id =
         deposit.user_id

    WHERE deposit.status = 'approved'
      AND deposit.is_first_deposit_bonus = 1
      AND deposit.bonus_amount > 0

    UNION ALL

    SELECT
      CONCAT(
        'REFERRER_',
        referral.id
      ) AS history_key,

      referral.id AS source_id,

      'referrer_bonus'
        AS bonus_type,

      referral.referrer_user_id
        AS user_id,

      referrer.uid,
      referrer.full_name,
      referrer.username,
      referrer.phone,

      referral.referred_user_id
        AS related_user_id,

      referred.uid
        AS related_uid,

      referred.full_name
        AS related_full_name,

      referred.username
        AS related_username,

      referral.referrer_bonus_amount
        AS bonus_amount,

      'referral'
        AS reference_type,

      referral.referral_code_used
        AS reference_code,

      COALESCE(
        qualifying_deposit.amount,
        0
      ) AS qualifying_amount,

      0 AS bonus_percent,
      0 AS maximum_bonus,
      0 AS minimum_qualifying_amount,

      COALESCE(
        referral.rewarded_at,
        referral.updated_at,
        referral.created_at
      ) AS awarded_at

    FROM user_referrals AS referral

    INNER JOIN users AS referrer
      ON referrer.id =
         referral.referrer_user_id

    INNER JOIN users AS referred
      ON referred.id =
         referral.referred_user_id

    LEFT JOIN deposit_requests
      AS qualifying_deposit
      ON qualifying_deposit.id =
         referral.qualifying_deposit_id

    WHERE referral.status = 'rewarded'
      AND referral.referrer_bonus_amount > 0

    UNION ALL

    SELECT
      CONCAT(
        'REFERRED_USER_',
        referral.id
      ) AS history_key,

      referral.id AS source_id,

      'referred_user_bonus'
        AS bonus_type,

      referral.referred_user_id
        AS user_id,

      referred.uid,
      referred.full_name,
      referred.username,
      referred.phone,

      referral.referrer_user_id
        AS related_user_id,

      referrer.uid
        AS related_uid,

      referrer.full_name
        AS related_full_name,

      referrer.username
        AS related_username,

      referral.referred_bonus_amount
        AS bonus_amount,

      'referral'
        AS reference_type,

      referral.referral_code_used
        AS reference_code,

      COALESCE(
        qualifying_deposit.amount,
        0
      ) AS qualifying_amount,

      0 AS bonus_percent,
      0 AS maximum_bonus,
      0 AS minimum_qualifying_amount,

      COALESCE(
        referral.rewarded_at,
        referral.updated_at,
        referral.created_at
      ) AS awarded_at

    FROM user_referrals AS referral

    INNER JOIN users AS referrer
      ON referrer.id =
         referral.referrer_user_id

    INNER JOIN users AS referred
      ON referred.id =
         referral.referred_user_id

    LEFT JOIN deposit_requests
      AS qualifying_deposit
      ON qualifying_deposit.id =
         referral.qualifying_deposit_id

    WHERE referral.status = 'rewarded'
      AND referral.referred_bonus_amount > 0
  `;

  const filteredQuery = `
    SELECT *
    FROM (
      ${sourceQuery}
    ) AS bonus_history

    ${whereClause}
  `;

  const [summaryRows] = await pool.query(
    `
        SELECT
          COUNT(*) AS total,

          COALESCE(
            SUM(bonus_amount),
            0
          ) AS total_bonus_paid,

          COALESCE(
            SUM(
              CASE
                WHEN bonus_type =
                  'first_deposit'
                THEN bonus_amount
                ELSE 0
              END
            ),
            0
          ) AS first_deposit_bonus_paid,

          COALESCE(
            SUM(
              CASE
                WHEN bonus_type =
                  'referrer_bonus'
                THEN bonus_amount
                ELSE 0
              END
            ),
            0
          ) AS referrer_bonus_paid,

          COALESCE(
            SUM(
              CASE
                WHEN bonus_type =
                  'referred_user_bonus'
                THEN bonus_amount
                ELSE 0
              END
            ),
            0
          ) AS referred_user_bonus_paid

        FROM (
          ${filteredQuery}
        ) AS filtered_bonus_history
      `,
    parameters,
  );

  /*
   * limit ও offset parsed/clamped integer।
   * তাই TiDB prepared LIMIT error ছাড়াই
   * safeভাবে SQL-এ ব্যবহার করা হচ্ছে।
   */
  const [rows] = await pool.query(
    `
        ${filteredQuery}

        ORDER BY
          bonus_history.awarded_at DESC,
          bonus_history.history_key DESC

        LIMIT ${limit}
        OFFSET ${offset}
      `,
    parameters,
  );

  const summary = summaryRows[0] || {};

  const total = Number(summary.total || 0);

  return {
    bonuses: rows.map((row) => ({
      historyKey: row.history_key,

      sourceId: Number(row.source_id),

      bonusType: row.bonus_type,

      user: {
        userId: Number(row.user_id),

        uid: row.uid,

        fullName: row.full_name,

        username: row.username,

        phone: row.phone,
      },

      relatedUser: row.related_user_id
        ? {
            userId: Number(row.related_user_id),

            uid: row.related_uid,

            fullName: row.related_full_name,

            username: row.related_username,
          }
        : null,

      bonusAmount: Number(row.bonus_amount || 0),

      referenceType: row.reference_type,

      referenceCode: row.reference_code,

      qualifyingAmount: Number(row.qualifying_amount || 0),

      settingsSnapshot: {
        bonusPercent: Number(row.bonus_percent || 0),

        maximumBonus: Number(row.maximum_bonus || 0),

        minimumQualifyingAmount: Number(row.minimum_qualifying_amount || 0),
      },

      awardedAt: row.awarded_at,
    })),

    summary: {
      totalRecords: total,

      totalBonusPaid: Number(summary.total_bonus_paid || 0),

      firstDepositBonusPaid: Number(summary.first_deposit_bonus_paid || 0),

      referrerBonusPaid: Number(summary.referrer_bonus_paid || 0),

      referredUserBonusPaid: Number(summary.referred_user_bonus_paid || 0),
    },

    pagination: {
      page,
      limit,
      total,

      totalPages: total === 0 ? 1 : Math.ceil(total / limit),
    },
  };
}

module.exports = {
  getTransactions,
  getTransactionSummary,
  getReferralHistory,
  getBonusHistory,
};
