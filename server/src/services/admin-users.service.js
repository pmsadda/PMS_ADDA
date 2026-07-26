const { pool } = require("../config/database");

function parsePositiveInteger(value, fallback) {
  const parsedValue = Number.parseInt(value, 10);

  if (
    Number.isNaN(parsedValue) ||
    parsedValue < 1
  ) {
    return fallback;
  }

  return parsedValue;
}

function normalizeEnum(value, allowedValues) {
  if (!value || value === "all") {
    return null;
  }

  const normalizedValue = String(value)
    .trim()
    .toLowerCase();

  return allowedValues.includes(normalizedValue)
    ? normalizedValue
    : null;
}

function normalizeOnlineFilter(value) {
  if (
    value === undefined ||
    value === null ||
    value === "" ||
    value === "all"
  ) {
    return null;
  }

  if (
    value === "online" ||
    value === "1" ||
    value === 1 ||
    value === true
  ) {
    return 1;
  }

  if (
    value === "offline" ||
    value === "0" ||
    value === 0 ||
    value === false
  ) {
    return 0;
  }

  return null;
}

async function getUserSummary() {
  const [rows] = await pool.query(`
    SELECT
      COUNT(*) AS total_users,

      COALESCE(
        SUM(
          CASE
            WHEN account_status = 'active'
            THEN 1
            ELSE 0
          END
        ),
        0
      ) AS active_users,

      COALESCE(
        SUM(
          CASE
            WHEN account_status = 'banned'
            THEN 1
            ELSE 0
          END
        ),
        0
      ) AS banned_users,

      COALESCE(
        SUM(
          CASE
            WHEN is_online = 1
            THEN 1
            ELSE 0
          END
        ),
        0
      ) AS online_users,

      COALESCE(
        SUM(wallet_balance),
        0
      ) AS total_wallet_balance,

      COALESCE(
        SUM(turnover_amount),
        0
      ) AS total_turnover,

      COALESCE(
        SUM(total_deposit),
        0
      ) AS total_deposit,

      COALESCE(
        SUM(total_withdraw),
        0
      ) AS total_withdraw

    FROM users

    WHERE role = 'user'
  `);

  const summary = rows[0] || {};

  return {
    totalUsers: Number(
      summary.total_users || 0
    ),

    activeUsers: Number(
      summary.active_users || 0
    ),

    bannedUsers: Number(
      summary.banned_users || 0
    ),

    onlineUsers: Number(
      summary.online_users || 0
    ),

    totalWalletBalance: Number(
      summary.total_wallet_balance || 0
    ),

    totalTurnover: Number(
      summary.total_turnover || 0
    ),

    totalDeposit: Number(
      summary.total_deposit || 0
    ),

    totalWithdraw: Number(
      summary.total_withdraw || 0
    )
  };
}

async function getUsers(queryParams = {}) {
  const page = parsePositiveInteger(
    queryParams.page,
    1
  );

  const requestedLimit = parsePositiveInteger(
    queryParams.limit,
    10
  );

  const limit = Math.min(
    requestedLimit,
    100
  );

  const offset = (page - 1) * limit;

  const search = String(
    queryParams.search || ""
  ).trim();

  const status = normalizeEnum(
    queryParams.status,
    ["active", "banned"]
  );

  const role = normalizeEnum(
    queryParams.role,
    ["user", "admin"]
  );

  const online = normalizeOnlineFilter(
    queryParams.online
  );

  const conditions = [];
  const parameters = [];

  /*
   * Defaultভাবে শুধু normal users দেখাবে।
   * role=admin দিলে admin account-ও দেখা যাবে।
   */
  if (role) {
    conditions.push("role = ?");
    parameters.push(role);
  } else {
    conditions.push("role = 'user'");
  }

  if (status) {
    conditions.push("account_status = ?");
    parameters.push(status);
  }

  if (online !== null) {
    conditions.push("is_online = ?");
    parameters.push(online);
  }

  if (search) {
    const searchValue = `%${search}%`;

    conditions.push(`
      (
        uid LIKE ?
        OR full_name LIKE ?
        OR username LIKE ?
        OR phone LIKE ?
        OR email LIKE ?
      )
    `);

    parameters.push(
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

  const countSql = `
    SELECT COUNT(*) AS total
    FROM users
    ${whereClause}
  `;

  const dataSql = `
    SELECT
      id,
      uid,
      full_name,
      username,
      phone,
      email,
      role,
      account_status,
      wallet_balance,
      turnover_amount,
      total_deposit,
      total_withdraw,
      is_online,
      last_login_at,
      created_at,
      updated_at

    FROM users

    ${whereClause}

    ORDER BY created_at DESC

    LIMIT ?
    OFFSET ?
  `;

  const [countRows] = await pool.query(
    countSql,
    parameters
  );

  const [userRows] = await pool.query(
    dataSql,
    [
      ...parameters,
      limit,
      offset
    ]
  );

  const total = Number(
    countRows[0]?.total || 0
  );

  const users = userRows.map(user => ({
    ...user,

    id: Number(user.id),

    wallet_balance: Number(
      user.wallet_balance || 0
    ),

    turnover_amount: Number(
      user.turnover_amount || 0
    ),

    total_deposit: Number(
      user.total_deposit || 0
    ),

    total_withdraw: Number(
      user.total_withdraw || 0
    ),

    is_online:
      Number(user.is_online) === 1
  }));

  return {
    users,

    pagination: {
      page,
      limit,
      total,

      totalPages:
        total === 0
          ? 1
          : Math.ceil(total / limit),

      hasPreviousPage: page > 1,

      hasNextPage:
        page <
        Math.ceil(total / limit)
    }
  };
}

async function getUserById(userId) {
  const [rows] = await pool.query(
    `
      SELECT
        id,
        uid,
        full_name,
        username,
        phone,
        email,
        role,
        account_status,
        wallet_balance,
        turnover_amount,
        total_deposit,
        total_withdraw,
        is_online,
        last_login_at,
        created_at,
        updated_at

      FROM users

      WHERE id = ?

      LIMIT 1
    `,
    [userId]
  );

  if (rows.length === 0) {
    return null;
  }

  const user = rows[0];

  return {
    ...user,

    id: Number(user.id),

    wallet_balance: Number(
      user.wallet_balance || 0
    ),

    turnover_amount: Number(
      user.turnover_amount || 0
    ),

    total_deposit: Number(
      user.total_deposit || 0
    ),

    total_withdraw: Number(
      user.total_withdraw || 0
    ),

    is_online:
      Number(user.is_online) === 1
  };
}

async function updateUserStatus(
  userId,
  accountStatus
) {
  if (
    !["active", "banned"].includes(
      accountStatus
    )
  ) {
    const error = new Error(
      "Invalid account status."
    );

    error.statusCode = 400;

    throw error;
  }

  const connection =
    await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [userRows] =
      await connection.query(
        `
          SELECT
            id,
            role,
            account_status

          FROM users

          WHERE id = ?

          FOR UPDATE
        `,
        [userId]
      );

    if (userRows.length === 0) {
      const error = new Error(
        "User not found."
      );

      error.statusCode = 404;

      throw error;
    }

    const existingUser = userRows[0];

    /*
     * Admin account accidental ban হওয়া বন্ধ করবে।
     */
    if (existingUser.role === "admin") {
      const error = new Error(
        "Admin account status cannot be changed from this section."
      );

      error.statusCode = 403;

      throw error;
    }

    await connection.query(
      `
        UPDATE users

        SET
          account_status = ?,
          is_online =
            CASE
              WHEN ? = 'banned'
              THEN 0
              ELSE is_online
            END

        WHERE id = ?
      `,
      [
        accountStatus,
        accountStatus,
        userId
      ]
    );

    await connection.commit();

    return getUserById(userId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  getUserSummary,
  getUsers,
  getUserById,
  updateUserStatus
};