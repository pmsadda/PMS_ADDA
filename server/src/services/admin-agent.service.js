"use strict";

const crypto =
  require("crypto");

const bcrypt =
  require("bcrypt");

const {
  pool
} = require(
  "../config/database"
);

function createServiceError(
  message,
  statusCode,
  code
) {
  const error =
    new Error(message);

  error.statusCode =
    statusCode;

  error.code =
    code;

  return error;
}

function mapAgent(row) {
  return {
    id:
      Number(row.id),

    uid:
      row.uid,

    fullName:
      row.full_name,

    username:
      row.username,

    phone:
      row.phone,

    email:
      row.email,

    role:
      row.role,

    accountStatus:
      row.account_status,

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at
  };
}

async function generateUniqueValue({
  connection,
  column,
  prefix,
  bytes = 6
}) {
  const allowedColumns =
    new Set([
      "uid",
      "referral_code"
    ]);

  if (
    !allowedColumns.has(column)
  ) {
    throw createServiceError(
      "Invalid unique value column.",
      500,
      "AGENT_UNIQUE_COLUMN_INVALID"
    );
  }

  for (
    let attempt = 0;
    attempt < 12;
    attempt += 1
  ) {
    const value =
      prefix +
      crypto
        .randomBytes(bytes)
        .toString("hex")
        .toUpperCase();

    const [rows] =
      await connection.execute(
        `
          SELECT id
          FROM users
          WHERE ${column} = ?
          LIMIT 1
        `,
        [
          value
        ]
      );

    if (!rows.length) {
      return value;
    }
  }

  throw createServiceError(
    "Unable to generate a unique Agent identifier.",
    500,
    "AGENT_IDENTIFIER_FAILED"
  );
}

function validateAgentInput(input) {
  const fullName =
    String(
      input.fullName || ""
    ).trim();

  const username =
    String(
      input.username || ""
    )
      .trim()
      .toLowerCase();

  const phone =
    String(
      input.phone || ""
    )
      .trim()
      .replace(
        /[\s-]/g,
        ""
      );

  const email =
    String(
      input.email || ""
    )
      .trim()
      .toLowerCase();

  const password =
    String(
      input.password || ""
    );

  if (
    fullName.length < 2 ||
    fullName.length > 100
  ) {
    throw createServiceError(
      "Agent full name must be 2 to 100 characters.",
      400,
      "AGENT_NAME_INVALID"
    );
  }

  if (
    !/^[a-z0-9_]{4,30}$/
      .test(username)
  ) {
    throw createServiceError(
      "Username must contain 4 to 30 lowercase letters, numbers or underscore.",
      400,
      "AGENT_USERNAME_INVALID"
    );
  }

  if (
    !/^\+?[0-9]{10,15}$/
      .test(phone)
  ) {
    throw createServiceError(
      "Enter a valid Agent phone number.",
      400,
      "AGENT_PHONE_INVALID"
    );
  }

  if (
    email.length > 150 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/
      .test(email)
  ) {
    throw createServiceError(
      "Enter a valid Agent email address.",
      400,
      "AGENT_EMAIL_INVALID"
    );
  }

  if (
    password.length < 8 ||
    password.length > 72
  ) {
    throw createServiceError(
      "Password must be 8 to 72 characters.",
      400,
      "AGENT_PASSWORD_INVALID"
    );
  }

  return {
    fullName,
    username,
    phone,
    email,
    password
  };
}

async function getAgents() {
  const [rows] =
    await pool.execute(
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
          created_at,
          updated_at
        FROM users
        WHERE role = 'agent'
        ORDER BY id DESC
      `
    );

  return rows.map(
    mapAgent
  );
}

async function createAgent(input) {
  const data =
    validateAgentInput(
      input
    );

  const passwordHash =
    await bcrypt.hash(
      data.password,
      12
    );

  const connection =
    await pool.getConnection();

  try {
    await connection
      .beginTransaction();

    const [duplicateRows] =
      await connection.execute(
        `
          SELECT
            id,
            username,
            phone,
            email
          FROM users
          WHERE username = ?
             OR phone = ?
             OR email = ?
          LIMIT 1
          FOR UPDATE
        `,
        [
          data.username,
          data.phone,
          data.email
        ]
      );

    if (
      duplicateRows.length
    ) {
      throw createServiceError(
        "Username, phone or email already exists.",
        409,
        "AGENT_ACCOUNT_EXISTS"
      );
    }

    const uid =
      await generateUniqueValue({
        connection,
        column: "uid",
        prefix: "AGT",
        bytes: 6
      });

    const referralCode =
      await generateUniqueValue({
        connection,
        column:
          "referral_code",
        prefix: "AG",
        bytes: 6
      });

    const [insertResult] =
      await connection.execute(
        `
          INSERT INTO users (
            uid,
            referral_code,
            full_name,
            username,
            phone,
            email,
            password_hash,
            role,
            account_status,
            wallet_balance
          )
          VALUES (
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            'agent',
            'active',
            0.00
          )
        `,
        [
          uid,
          referralCode,
          data.fullName,
          data.username,
          data.phone,
          data.email,
          passwordHash
        ]
      );

    const agentId =
      Number(
        insertResult.insertId
      );

    const [agentRows] =
      await connection.execute(
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
            created_at,
            updated_at
          FROM users
          WHERE id = ?
          LIMIT 1
        `,
        [
          agentId
        ]
      );

    await connection.commit();

    return mapAgent(
      agentRows[0]
    );
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateAgentStatus({
  agentId,
  status
}) {
  const safeAgentId =
    Number(agentId);

  const safeStatus =
    String(
      status || ""
    )
      .trim()
      .toLowerCase();

  if (
    !Number.isInteger(
      safeAgentId
    ) ||
    safeAgentId <= 0
  ) {
    throw createServiceError(
      "Invalid Agent ID.",
      400,
      "AGENT_ID_INVALID"
    );
  }

  if (
    ![
      "active",
      "banned"
    ].includes(
      safeStatus
    )
  ) {
    throw createServiceError(
      "Invalid Agent account status.",
      400,
      "AGENT_STATUS_INVALID"
    );
  }

  const [updateResult] =
    await pool.execute(
      `
        UPDATE users
        SET
          account_status = ?,
          updated_at =
            CURRENT_TIMESTAMP
        WHERE id = ?
          AND role = 'agent'
      `,
      [
        safeStatus,
        safeAgentId
      ]
    );

  if (
    Number(
      updateResult.affectedRows
    ) !== 1
  ) {
    throw createServiceError(
      "Agent account was not found.",
      404,
      "AGENT_NOT_FOUND"
    );
  }

  const [rows] =
    await pool.execute(
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
          created_at,
          updated_at
        FROM users
        WHERE id = ?
          AND role = 'agent'
        LIMIT 1
      `,
      [
        safeAgentId
      ]
    );

  return mapAgent(
    rows[0]
  );
}

module.exports = {
  getAgents,
  createAgent,
  updateAgentStatus
};