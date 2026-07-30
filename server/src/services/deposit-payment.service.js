"use strict";

const {
  pool,
} = require("../config/database");

const PAYMENT_METHODS =
  Object.freeze([
    "bkash",
    "nagad",
    "rocket",
  ]);

const ACCOUNT_TYPES =
  Object.freeze([
    "personal",
    "agent",
    "merchant",
  ]);

const PAYMENT_STATUSES =
  Object.freeze([
    "active",
    "disabled",
  ]);

function createServiceError(
  message,
  statusCode = 500,
  code = "DEPOSIT_PAYMENT_ERROR",
) {
  const error = new Error(message);

  error.statusCode = statusCode;
  error.code = code;

  return error;
}

function parsePositiveInteger(value) {
  const number = Number(value);

  if (
    !Number.isInteger(number) ||
    number < 1
  ) {
    return null;
  }

  return number;
}

function normalizeOption(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeAccountNumber(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .trim();
}

function isValidAccountNumber(value) {
  return /^01[3-9]\d{8}$/.test(
    String(value || ""),
  );
}

function mapPaymentSetting(row) {
  return {
    id: Number(row.id),

    method: row.method,

    displayName: row.display_name,

    accountNumber:
      row.account_number || "",

    accountType: row.account_type,

    status: row.status,

    updatedBy:
      row.updated_by === null
        ? null
        : Number(row.updated_by),

    updatedByName:
      row.updated_by_name || null,

    createdAt: row.created_at,

    updatedAt: row.updated_at,
  };
}

async function getAdminPaymentSettings() {
  const [rows] = await pool.query(
    `
      SELECT
        dps.id,
        dps.method,
        dps.display_name,
        dps.account_number,
        dps.account_type,
        dps.status,
        dps.updated_by,
        dps.created_at,
        dps.updated_at,

        admin_user.full_name
          AS updated_by_name

      FROM deposit_payment_settings dps

      LEFT JOIN users admin_user
        ON admin_user.id =
           dps.updated_by

      ORDER BY
        FIELD(
          dps.method,
          'bkash',
          'nagad',
          'rocket'
        )
    `,
  );

  return rows.map(
    mapPaymentSetting,
  );
}

async function getActivePaymentMethods() {
  const [rows] = await pool.query(
    `
      SELECT
        id,
        method,
        display_name,
        account_number,
        account_type,
        status,
        updated_by,
        created_at,
        updated_at,

        NULL AS updated_by_name

      FROM deposit_payment_settings

      WHERE status = 'active'

      ORDER BY
        FIELD(
          method,
          'bkash',
          'nagad',
          'rocket'
        )
    `,
  );

  return rows
    .map(mapPaymentSetting)
    .filter((setting) =>
      isValidAccountNumber(
        setting.accountNumber,
      ),
    )
    .map((setting) => ({
      method: setting.method,

      displayName:
        setting.displayName,

      accountNumber:
        setting.accountNumber,

      accountType:
        setting.accountType,

      status:
        setting.status,
    }));
}

function validatePaymentUpdates(
  paymentMethods,
) {
  if (
    !Array.isArray(paymentMethods) ||
    paymentMethods.length < 1
  ) {
    throw createServiceError(
      "At least one payment method is required.",
      400,
      "EMPTY_PAYMENT_SETTINGS",
    );
  }

  const seenMethods = new Set();

  return paymentMethods.map(
    (paymentMethod) => {
      const method =
        normalizeOption(
          paymentMethod?.method,
        );

      const accountNumber =
        normalizeAccountNumber(
          paymentMethod?.accountNumber,
        );

      const accountType =
        normalizeOption(
          paymentMethod?.accountType,
        );

      const status =
        normalizeOption(
          paymentMethod?.status,
        );

      if (
        !PAYMENT_METHODS.includes(method)
      ) {
        throw createServiceError(
          "Invalid deposit payment method.",
          400,
          "INVALID_PAYMENT_METHOD",
        );
      }

      if (seenMethods.has(method)) {
        throw createServiceError(
          `Duplicate ${method} payment setting.`,
          400,
          "DUPLICATE_PAYMENT_METHOD",
        );
      }

      seenMethods.add(method);

      if (
        !ACCOUNT_TYPES.includes(
          accountType,
        )
      ) {
        throw createServiceError(
          `Invalid account type for ${method}.`,
          400,
          "INVALID_ACCOUNT_TYPE",
        );
      }

      if (
        !PAYMENT_STATUSES.includes(
          status,
        )
      ) {
        throw createServiceError(
          `Invalid status for ${method}.`,
          400,
          "INVALID_PAYMENT_STATUS",
        );
      }

      if (
        accountNumber &&
        !isValidAccountNumber(
          accountNumber,
        )
      ) {
        throw createServiceError(
          `${method} number must be a valid 11-digit Bangladeshi mobile number.`,
          400,
          "INVALID_PAYMENT_NUMBER",
        );
      }

      if (
        status === "active" &&
        !isValidAccountNumber(
          accountNumber,
        )
      ) {
        throw createServiceError(
          `A valid ${method} number is required before activation.`,
          400,
          "ACTIVE_PAYMENT_NUMBER_REQUIRED",
        );
      }

      return {
        method,
        accountNumber:
          accountNumber || null,
        accountType,
        status,
      };
    },
  );
}

async function updatePaymentSettings(
  requestingAdminId,
  paymentMethods,
) {
  const adminId =
    parsePositiveInteger(
      requestingAdminId,
    );

  if (!adminId) {
    throw createServiceError(
      "Valid admin ID is required.",
      401,
      "INVALID_ADMIN_ID",
    );
  }

  const updates =
    validatePaymentUpdates(
      paymentMethods,
    );

  const connection =
    await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [adminRows] =
      await connection.query(
        `
          SELECT
            id,
            role,
            account_status

          FROM users

          WHERE id = ?

          LIMIT 1

          FOR UPDATE
        `,
        [adminId],
      );

    const admin =
      adminRows[0] || null;

    if (
      !admin ||
      admin.role !== "admin" ||
      admin.account_status !== "active"
    ) {
      throw createServiceError(
        "An active admin account is required.",
        403,
        "ADMIN_ACCESS_DENIED",
      );
    }

    for (const update of updates) {
      const [result] =
        await connection.query(
          `
            UPDATE
              deposit_payment_settings

            SET
              account_number = ?,
              account_type = ?,
              status = ?,
              updated_by = ?

            WHERE method = ?
          `,
          [
            update.accountNumber,
            update.accountType,
            update.status,
            adminId,
            update.method,
          ],
        );

      if (
        Number(result.affectedRows) !== 1
      ) {
        throw createServiceError(
          `${update.method} payment setting was not found.`,
          404,
          "PAYMENT_SETTING_NOT_FOUND",
        );
      }
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();

    throw error;
  } finally {
    connection.release();
  }

  return getAdminPaymentSettings();
}

module.exports = {
  getAdminPaymentSettings,
  getActivePaymentMethods,
  updatePaymentSettings,

  PAYMENT_METHODS,
  ACCOUNT_TYPES,
  PAYMENT_STATUSES,
};