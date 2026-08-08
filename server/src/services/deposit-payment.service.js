"use strict";

const {
  pool,
} = require("../config/database");

const PAYMENT_METHODS =
  Object.freeze([
    "bkash",
    "nagad",
    "rocket",
    "binance",
  ]);

const ACCOUNT_TYPES =
  Object.freeze([
    "personal",
    "agent",
    "merchant",
    "pay_id",
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

async function resolveCurrentPaymentAccount(
  method,
  connection,
) {
  const validMethod =
    normalizeOption(method);

  if (
    !PAYMENT_METHODS.includes(
      validMethod,
    )
  ) {
    throw createServiceError(
      "Invalid deposit payment method.",
      400,
      "INVALID_PAYMENT_METHOD",
    );
  }

  /*
   * Rotation row lock:
   * একই সময়ে একাধিক request এলেও
   * account একাধিকবার rotate হবে না।
   */
  const [rotationRows] =
    await connection.query(
      `
        SELECT
          method,
          rotation_mode,
          rotation_interval_minutes,
          current_account_id,
          bdt_per_usdt,
          last_rotated_at,
          next_rotation_at,

          CASE
            WHEN next_rotation_at
                 IS NULL
            THEN 1

            WHEN next_rotation_at
                 <= NOW()
            THEN 1

            ELSE 0
          END AS rotation_due

        FROM deposit_payment_rotation

        WHERE method = ?

        LIMIT 1

        FOR UPDATE
      `,
      [validMethod],
    );

  const rotation =
    rotationRows[0] || null;

  if (!rotation) {
    throw createServiceError(
      `${validMethod} rotation setting was not found.`,
      500,
      "ROTATION_SETTING_NOT_FOUND",
    );
  }

  /*
   * শুধু active accounts rotation pool-এ
   * অংশ নেবে।
   */
  const [accountRows] =
    await connection.query(
      `
        SELECT
          id,
          method,
          display_name,
          account_identifier,
          account_type,
          qr_file_name,
          qr_mime_type,
          qr_size,
          status,
          sort_order,
          created_at,
          updated_at

        FROM deposit_payment_accounts

        WHERE method = ?
          AND status = 'active'

        ORDER BY
          sort_order ASC,
          id ASC

        FOR UPDATE
      `,
      [validMethod],
    );

  if (accountRows.length === 0) {
    if (
      rotation.current_account_id !==
        null ||
      rotation.next_rotation_at !==
        null
    ) {
      await connection.query(
        `
          UPDATE deposit_payment_rotation
          SET
            current_account_id = NULL,
            next_rotation_at = NULL
          WHERE method = ?
        `,
        [validMethod],
      );
    }

    return null;
  }

  const currentAccountId =
    Number(
      rotation.current_account_id,
    ) || null;

  const currentIndex =
    accountRows.findIndex(
      (account) =>
        Number(account.id) ===
        currentAccountId,
    );

  const isAuto =
    rotation.rotation_mode ===
    "auto";

  const rotationDue =
    Boolean(
      rotation.rotation_due,
    );

  let selectedIndex =
    currentIndex;

  /*
   * Current account disabled/deleted হলে
   * প্রথম active account নেওয়া হবে।
   */
  if (selectedIndex < 0) {
    selectedIndex = 0;
  } else if (
    isAuto &&
    rotationDue
  ) {
    /*
     * Auto mode এবং নির্ধারিত সময় শেষ হলে
     * পরের active account।
     */
    selectedIndex =
      (selectedIndex + 1) %
      accountRows.length;
  }

  const selectedAccount =
    accountRows[selectedIndex];

  const intervalMinutes =
    Math.min(
      1440,
      Math.max(
        1,
        Number(
          rotation
            .rotation_interval_minutes,
        ) || 10,
      ),
    );

  const shouldUpdateRotation =
    currentIndex < 0 ||
    (
      isAuto &&
      rotationDue
    );

  let nextRotationAt =
    rotation.next_rotation_at ||
    null;

  if (shouldUpdateRotation) {
    nextRotationAt =
      isAuto
        ? new Date(
            Date.now() +
              intervalMinutes *
                60 *
                1000,
          )
        : null;

    await connection.query(
      `
        UPDATE deposit_payment_rotation
        SET
          current_account_id = ?,
          last_rotated_at = NOW(),
          next_rotation_at = ?
        WHERE method = ?
      `,
      [
        Number(
          selectedAccount.id,
        ),

        nextRotationAt,

        validMethod,
      ],
    );
  }

  return {
    id:
      Number(selectedAccount.id),

    method:
      selectedAccount.method,

    displayName:
      selectedAccount.display_name,

    accountNumber:
      selectedAccount
        .account_identifier,

    accountIdentifier:
      selectedAccount
        .account_identifier,

    accountType:
      selectedAccount.account_type,

    status:
      selectedAccount.status,

    hasQrCode:
      Boolean(
        selectedAccount.qr_size,
      ),

      hasQrImage:
  Boolean(
    selectedAccount.qr_size,
  ),

qrImageUrl:
  Boolean(
    selectedAccount.qr_size,
  )
    ? `/api/deposits/payment-accounts/${
        Number(selectedAccount.id)
      }/qr`
    : null,

    rotationMode:
      rotation.rotation_mode,

    rotationIntervalMinutes:
      intervalMinutes,

    nextRotationAt,

    paymentAsset:
      validMethod === "binance"
        ? "USDT"
        : "BDT",

    bdtPerUsdt:
      validMethod === "binance"
        ? Number(
            rotation.bdt_per_usdt ||
              0,
          )
        : null,
  };
}

async function getActivePaymentMethods() {
  const connection =
    await pool.getConnection();

  try {
    await connection.beginTransaction();

    const paymentMethods = [];

    /*
     * সবসময় একই order-এ row lock হবে।
     * এতে concurrent deadlock risk কমে।
     */
    for (
      const method of
      PAYMENT_METHODS
    ) {
      const account =
        await resolveCurrentPaymentAccount(
          method,
          connection,
        );

      if (account) {
        paymentMethods.push(
          account,
        );
      }
    }

    await connection.commit();

    return paymentMethods;
  } catch (error) {
    await connection.rollback();

    throw error;
  } finally {
    connection.release();
  }
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

function mapPaymentAccount(row) {
  return {
    id: Number(row.id),

    method: row.method,

    displayName:
      row.display_name,

    accountIdentifier:
      row.account_identifier,

    accountNumber:
      row.account_identifier,

    accountType:
      row.account_type,

    status:
      row.status,

    sortOrder:
      Number(row.sort_order || 0),

    hasQrCode:
  Boolean(row.qr_size),

hasQrImage:
  Boolean(row.qr_size),

qrImageUrl:
  Boolean(row.qr_size)
    ? `/api/deposits/payment-accounts/${
        Number(row.id)
      }/qr`
    : null,

    updatedBy:
      row.updated_by === null
        ? null
        : Number(row.updated_by),

    updatedByName:
      row.updated_by_name || null,

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,
  };
}

async function verifyPaymentAdmin(
  adminId,
  connection,
) {
  const validAdminId =
    parsePositiveInteger(adminId);

  if (!validAdminId) {
    throw createServiceError(
      "Valid admin ID is required.",
      401,
      "INVALID_ADMIN_ID",
    );
  }

  const [rows] =
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
      [validAdminId],
    );

  const admin =
    rows[0] || null;

  if (
    !admin ||
    admin.role !== "admin" ||
    admin.account_status !==
      "active"
  ) {
    throw createServiceError(
      "An active admin account is required.",
      403,
      "ADMIN_ACCESS_DENIED",
    );
  }

  return validAdminId;
}

async function getAdminPaymentManagement() {
  const [rotationRows] =
    await pool.query(
      `
        SELECT
          rotation.method,
          rotation.rotation_mode,
          rotation.rotation_interval_minutes,
          rotation.current_account_id,
          rotation.bdt_per_usdt,
          rotation.last_rotated_at,
          rotation.next_rotation_at,
          rotation.updated_by,
          rotation.created_at,
          rotation.updated_at,

          admin_user.full_name
            AS updated_by_name

        FROM deposit_payment_rotation
          AS rotation

        LEFT JOIN users admin_user
          ON admin_user.id =
             rotation.updated_by

        ORDER BY
          FIELD(
            rotation.method,
            'bkash',
            'nagad',
            'rocket',
            'binance'
          )
      `,
    );

  const [accountRows] =
    await pool.query(
      `
        SELECT
          account.id,
          account.method,
          account.display_name,
          account.account_identifier,
          account.account_type,
          account.qr_size,
          account.status,
          account.sort_order,
          account.updated_by,
          account.created_at,
          account.updated_at,

          admin_user.full_name
            AS updated_by_name

        FROM deposit_payment_accounts
          AS account

        LEFT JOIN users admin_user
          ON admin_user.id =
             account.updated_by

        ORDER BY
          FIELD(
            account.method,
            'bkash',
            'nagad',
            'rocket',
            'binance'
          ),
          account.sort_order ASC,
          account.id ASC
      `,
    );

  const accounts =
    accountRows.map(
      mapPaymentAccount,
    );

  return rotationRows.map(
    (rotation) => {
      const methodAccounts =
        accounts.filter(
          (account) =>
            account.method ===
            rotation.method,
        );

      const currentAccount =
        methodAccounts.find(
          (account) =>
            Number(account.id) ===
            Number(
              rotation
                .current_account_id,
            ),
        ) || null;

      return {
        method:
          rotation.method,

        rotationMode:
          rotation.rotation_mode,

        rotationIntervalMinutes:
          Number(
            rotation
              .rotation_interval_minutes ||
              10,
          ),

        currentAccountId:
          rotation.current_account_id ===
          null
            ? null
            : Number(
                rotation
                  .current_account_id,
              ),

        currentAccount,

        bdtPerUsdt:
          Number(
            rotation.bdt_per_usdt ||
              0,
          ),

        lastRotatedAt:
          rotation.last_rotated_at,

        nextRotationAt:
          rotation.next_rotation_at,

        updatedBy:
          rotation.updated_by ===
          null
            ? null
            : Number(
                rotation.updated_by,
              ),

        updatedByName:
          rotation.updated_by_name ||
          null,

        accounts:
          methodAccounts,
      };
    },
  );
}

async function updatePaymentRotation(
  requestingAdminId,
  {
    method,
    rotationMode,
    rotationIntervalMinutes,
    bdtPerUsdt,
  },
) {
  const validMethod =
    normalizeOption(method);

  const validMode =
    normalizeOption(
      rotationMode,
    );

  const validInterval =
    Number(
      rotationIntervalMinutes,
    );

  const validRate =
    Number(bdtPerUsdt);

  if (
    !PAYMENT_METHODS.includes(
      validMethod,
    )
  ) {
    throw createServiceError(
      "Invalid payment method.",
      400,
      "INVALID_PAYMENT_METHOD",
    );
  }

  if (
    ![
      "auto",
      "manual",
    ].includes(validMode)
  ) {
    throw createServiceError(
      "Rotation mode must be auto or manual.",
      400,
      "INVALID_ROTATION_MODE",
    );
  }

  if (
    !Number.isInteger(
      validInterval,
    ) ||
    validInterval < 1 ||
    validInterval > 1440
  ) {
    throw createServiceError(
      "Rotation time must be between 1 and 1440 minutes.",
      400,
      "INVALID_ROTATION_INTERVAL",
    );
  }

  if (
    validMethod === "binance" &&
    (
      !Number.isFinite(validRate) ||
      validRate <= 0 ||
      validRate > 100000
    )
  ) {
    throw createServiceError(
      "A valid BDT per USDT rate is required.",
      400,
      "INVALID_BINANCE_RATE",
    );
  }

  const connection =
    await pool.getConnection();

  try {
    await connection.beginTransaction();

    const adminId =
      await verifyPaymentAdmin(
        requestingAdminId,
        connection,
      );

    const [rotationRows] =
      await connection.query(
        `
          SELECT
            method,
            current_account_id,
            bdt_per_usdt
          FROM deposit_payment_rotation
          WHERE method = ?
          LIMIT 1
          FOR UPDATE
        `,
        [validMethod],
      );

    const rotation =
      rotationRows[0] || null;

    if (!rotation) {
      throw createServiceError(
        "Payment rotation setting was not found.",
        404,
        "ROTATION_SETTING_NOT_FOUND",
      );
    }

    const nextRotationAt =
      validMode === "auto"
        ? new Date(
            Date.now() +
              validInterval *
                60 *
                1000,
          )
        : null;

    const nextRate =
      validMethod === "binance"
        ? Number(
            validRate.toFixed(4),
          )
        : Number(
            rotation.bdt_per_usdt ||
              120,
          );

    await connection.query(
      `
        UPDATE deposit_payment_rotation
        SET
          rotation_mode = ?,
          rotation_interval_minutes = ?,
          bdt_per_usdt = ?,
          next_rotation_at = ?,
          updated_by = ?
        WHERE method = ?
      `,
      [
        validMode,
        validInterval,
        nextRate,
        nextRotationAt,
        adminId,
        validMethod,
      ],
    );

    /*
     * Current account invalid হলে
     * resolver প্রথম active account
     * নির্বাচন করবে।
     */
    const currentAccount =
      await resolveCurrentPaymentAccount(
        validMethod,
        connection,
      );

    await connection.commit();

    return {
      method:
        validMethod,

      rotationMode:
        validMode,

      rotationIntervalMinutes:
        validInterval,

      bdtPerUsdt:
        nextRate,

      nextRotationAt,

      currentAccount,
    };
  } catch (error) {
    await connection.rollback();

    throw error;
  } finally {
    connection.release();
  }
}

async function rotatePaymentMethodNow(
  requestingAdminId,
  method,
) {
  const validMethod =
    normalizeOption(method);

  if (
    !PAYMENT_METHODS.includes(
      validMethod,
    )
  ) {
    throw createServiceError(
      "Invalid payment method.",
      400,
      "INVALID_PAYMENT_METHOD",
    );
  }

  const connection =
    await pool.getConnection();

  try {
    await connection.beginTransaction();

    const adminId =
      await verifyPaymentAdmin(
        requestingAdminId,
        connection,
      );

    const [rotationRows] =
      await connection.query(
        `
          SELECT
            rotation_mode,
            rotation_interval_minutes,
            current_account_id,
            bdt_per_usdt
          FROM deposit_payment_rotation
          WHERE method = ?
          LIMIT 1
          FOR UPDATE
        `,
        [validMethod],
      );

    const rotation =
      rotationRows[0] || null;

    if (!rotation) {
      throw createServiceError(
        "Payment rotation setting was not found.",
        404,
        "ROTATION_SETTING_NOT_FOUND",
      );
    }

    const [accountRows] =
      await connection.query(
        `
          SELECT
            id,
            method,
            display_name,
            account_identifier,
            account_type,
            qr_size,
            status,
            sort_order,
            updated_by,
            created_at,
            updated_at,

            NULL AS updated_by_name

          FROM deposit_payment_accounts

          WHERE method = ?
            AND status = 'active'

          ORDER BY
            sort_order ASC,
            id ASC

          FOR UPDATE
        `,
        [validMethod],
      );

    if (accountRows.length === 0) {
      throw createServiceError(
        `No active ${validMethod} account is available.`,
        409,
        "NO_ACTIVE_PAYMENT_ACCOUNT",
      );
    }

    const currentIndex =
      accountRows.findIndex(
        (account) =>
          Number(account.id) ===
          Number(
            rotation
              .current_account_id,
          ),
      );

    const nextIndex =
      currentIndex < 0
        ? 0
        : (
            currentIndex + 1
          ) %
          accountRows.length;

    const nextAccount =
      accountRows[nextIndex];

    const intervalMinutes =
      Math.min(
        1440,
        Math.max(
          1,
          Number(
            rotation
              .rotation_interval_minutes,
          ) || 10,
        ),
      );

    const nextRotationAt =
      rotation.rotation_mode ===
      "auto"
        ? new Date(
            Date.now() +
              intervalMinutes *
                60 *
                1000,
          )
        : null;

    await connection.query(
      `
        UPDATE deposit_payment_rotation
        SET
          current_account_id = ?,
          last_rotated_at = NOW(),
          next_rotation_at = ?,
          updated_by = ?
        WHERE method = ?
      `,
      [
        Number(nextAccount.id),
        nextRotationAt,
        adminId,
        validMethod,
      ],
    );

    await connection.commit();

    return {
      method:
        validMethod,

      rotationMode:
        rotation.rotation_mode,

      rotationIntervalMinutes:
        intervalMinutes,

      nextRotationAt,

      currentAccount:
        mapPaymentAccount(
          nextAccount,
        ),
    };
  } catch (error) {
    await connection.rollback();

    throw error;
  } finally {
    connection.release();
  }
}

function validatePaymentAccountInput(
  input,
  existingMethod = null,
) {
  const method =
    existingMethod ||
    normalizeOption(
      input?.method,
    );

  const displayName =
    String(
      input?.displayName || "",
    ).trim();

  const accountIdentifier =
    normalizeAccountNumber(
      input?.accountIdentifier ??
      input?.accountNumber,
    );

  const requestedAccountType =
    normalizeOption(
      input?.accountType,
    );

  const status =
    normalizeOption(
      input?.status || "active",
    );

  const sortOrder =
    Number(
      input?.sortOrder ?? 0,
    );

  if (
    !PAYMENT_METHODS.includes(
      method,
    )
  ) {
    throw createServiceError(
      "Invalid payment method.",
      400,
      "INVALID_PAYMENT_METHOD",
    );
  }

  if (
    displayName.length < 2 ||
    displayName.length > 50
  ) {
    throw createServiceError(
      "Display name must be between 2 and 50 characters.",
      400,
      "INVALID_DISPLAY_NAME",
    );
  }

  if (
    accountIdentifier.length < 4 ||
    accountIdentifier.length > 120
  ) {
    throw createServiceError(
      "A valid payment account identifier is required.",
      400,
      "INVALID_ACCOUNT_IDENTIFIER",
    );
  }

  if (
    method !== "binance" &&
    !isValidAccountNumber(
      accountIdentifier,
    )
  ) {
    throw createServiceError(
      `${method} number must be a valid 11-digit Bangladeshi mobile number.`,
      400,
      "INVALID_PAYMENT_NUMBER",
    );
  }

  if (
    method === "binance" &&
    !/^[A-Za-z0-9_-]{4,120}$/.test(
      accountIdentifier,
    )
  ) {
    throw createServiceError(
      "A valid Binance Pay ID is required.",
      400,
      "INVALID_BINANCE_PAY_ID",
    );
  }

  const accountType =
    method === "binance"
      ? "pay_id"
      : requestedAccountType;

  if (
    !ACCOUNT_TYPES.includes(
      accountType,
    )
  ) {
    throw createServiceError(
      "Invalid payment account type.",
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
      "Invalid payment account status.",
      400,
      "INVALID_PAYMENT_STATUS",
    );
  }

  if (
    !Number.isInteger(sortOrder) ||
    sortOrder < 0 ||
    sortOrder > 9999
  ) {
    throw createServiceError(
      "Sort order must be between 0 and 9999.",
      400,
      "INVALID_SORT_ORDER",
    );
  }

  return {
    method,
    displayName,
    accountIdentifier,
    accountType,
    status,
    sortOrder,
  };
}

async function createPaymentAccount(
  requestingAdminId,
  input,
) {
  const validInput =
    validatePaymentAccountInput(
      input,
    );

  const connection =
    await pool.getConnection();

  try {
    await connection.beginTransaction();

    const adminId =
      await verifyPaymentAdmin(
        requestingAdminId,
        connection,
      );

    const [result] =
      await connection.query(
        `
          INSERT INTO
            deposit_payment_accounts (
              method,
              display_name,
              account_identifier,
              account_type,
              status,
              sort_order,
              updated_by
            )
          VALUES (
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?
          )
        `,
        [
          validInput.method,
          validInput.displayName,
          validInput.accountIdentifier,
          validInput.accountType,
          validInput.status,
          validInput.sortOrder,
          adminId,
        ],
      );

    /*
     * প্রথম active account হলে
     * current account হিসেবে নির্বাচন হবে।
     */
    if (
      validInput.status ===
      "active"
    ) {
      await resolveCurrentPaymentAccount(
        validInput.method,
        connection,
      );
    }

    const [accountRows] =
      await connection.query(
        `
          SELECT
            id,
            method,
            display_name,
            account_identifier,
            account_type,
            qr_size,
            status,
            sort_order,
            updated_by,
            created_at,
            updated_at,

            NULL AS updated_by_name

          FROM deposit_payment_accounts

          WHERE id = ?

          LIMIT 1
        `,
        [Number(result.insertId)],
      );

    await connection.commit();

    return mapPaymentAccount(
      accountRows[0],
    );
  } catch (error) {
    await connection.rollback();

    if (
      error.code ===
      "ER_DUP_ENTRY"
    ) {
      throw createServiceError(
        "This payment account already exists.",
        409,
        "DUPLICATE_PAYMENT_ACCOUNT",
      );
    }

    throw error;
  } finally {
    connection.release();
  }
}

async function updatePaymentAccount(
  requestingAdminId,
  accountId,
  input,
) {
  const validAccountId =
    parsePositiveInteger(
      accountId,
    );

  if (!validAccountId) {
    throw createServiceError(
      "Valid payment account ID is required.",
      400,
      "INVALID_PAYMENT_ACCOUNT_ID",
    );
  }

  const connection =
    await pool.getConnection();

  try {
    await connection.beginTransaction();

    const adminId =
      await verifyPaymentAdmin(
        requestingAdminId,
        connection,
      );

    const [existingRows] =
      await connection.query(
        `
          SELECT
            id,
            method
          FROM deposit_payment_accounts
          WHERE id = ?
          LIMIT 1
          FOR UPDATE
        `,
        [validAccountId],
      );

    const existing =
      existingRows[0] || null;

    if (!existing) {
      throw createServiceError(
        "Payment account was not found.",
        404,
        "PAYMENT_ACCOUNT_NOT_FOUND",
      );
    }

    /*
     * Account method পরিবর্তন করা যাবে না।
     * ভুল method হলে নতুন account তৈরি করতে হবে।
     */
    const validInput =
      validatePaymentAccountInput(
        input,
        existing.method,
      );

    await connection.query(
      `
        UPDATE
          deposit_payment_accounts

        SET
          display_name = ?,
          account_identifier = ?,
          account_type = ?,
          status = ?,
          sort_order = ?,
          updated_by = ?

        WHERE id = ?
      `,
      [
        validInput.displayName,
        validInput.accountIdentifier,
        validInput.accountType,
        validInput.status,
        validInput.sortOrder,
        adminId,
        validAccountId,
      ],
    );

    /*
     * Current account disable হলে resolver
     * পরের active account নির্বাচন করবে।
     */
    await resolveCurrentPaymentAccount(
      existing.method,
      connection,
    );

    const [updatedRows] =
      await connection.query(
        `
          SELECT
            id,
            method,
            display_name,
            account_identifier,
            account_type,
            qr_size,
            status,
            sort_order,
            updated_by,
            created_at,
            updated_at,

            NULL AS updated_by_name

          FROM deposit_payment_accounts

          WHERE id = ?

          LIMIT 1
        `,
        [validAccountId],
      );

    await connection.commit();

    return mapPaymentAccount(
      updatedRows[0],
    );
  } catch (error) {
    await connection.rollback();

    if (
      error.code ===
      "ER_DUP_ENTRY"
    ) {
      throw createServiceError(
        "This payment account already exists.",
        409,
        "DUPLICATE_PAYMENT_ACCOUNT",
      );
    }

    throw error;
  } finally {
    connection.release();
  }
}

async function removePaymentAccount(
  requestingAdminId,
  accountId,
) {
  const validAccountId =
    parsePositiveInteger(
      accountId,
    );

  if (!validAccountId) {
    throw createServiceError(
      "Valid payment account ID is required.",
      400,
      "INVALID_PAYMENT_ACCOUNT_ID",
    );
  }

  const connection =
    await pool.getConnection();

  try {
    await connection.beginTransaction();

    await verifyPaymentAdmin(
      requestingAdminId,
      connection,
    );

    const [accountRows] =
      await connection.query(
        `
          SELECT
            id,
            method,
            display_name,
            account_identifier
          FROM deposit_payment_accounts
          WHERE id = ?
          LIMIT 1
          FOR UPDATE
        `,
        [validAccountId],
      );

    const account =
      accountRows[0] || null;

    if (!account) {
      throw createServiceError(
        "Payment account was not found.",
        404,
        "PAYMENT_ACCOUNT_NOT_FOUND",
      );
    }

    await connection.query(
      `
        DELETE FROM
          deposit_payment_accounts
        WHERE id = ?
      `,
      [validAccountId],
    );

    /*
     * Deleted account current ছিল হলে
     * FK current ID null করবে এবং resolver
     * পরের active account নির্বাচন করবে।
     */
    await resolveCurrentPaymentAccount(
      account.method,
      connection,
    );

    await connection.commit();

    return {
      id:
        validAccountId,

      method:
        account.method,

      displayName:
        account.display_name,

      accountIdentifier:
        account.account_identifier,

      removed:
        true,
    };
  } catch (error) {
    await connection.rollback();

    throw error;
  } finally {
    connection.release();
  }
}

/* ==========================
   Deposit QR Image
========================== */

function isValidDepositQrSignature(
  buffer,
  mimeType,
) {
  if (
    !Buffer.isBuffer(buffer) ||
    buffer.length < 12
  ) {
    return false;
  }

  if (mimeType === "image/png") {
    return (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    );
  }

  if (mimeType === "image/jpeg") {
    return (
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    );
  }

  if (mimeType === "image/webp") {
    return (
      buffer.subarray(0, 4)
        .toString("ascii") === "RIFF" &&
      buffer.subarray(8, 12)
        .toString("ascii") === "WEBP"
    );
  }

  return false;
}

function sanitizeDepositQrFileName(
  fileName,
) {
  const cleanedName =
    String(fileName || "payment-qr")
      .replace(
        /[^a-zA-Z0-9._-]/g,
        "_",
      )
      .slice(0, 180);

  return cleanedName || "payment-qr";
}

async function savePaymentAccountQr({
  adminId,
  accountId,
  file,
}) {
  const validAdminId =
    parsePositiveInteger(adminId);

  const validAccountId =
    parsePositiveInteger(accountId);

  if (!validAdminId) {
    throw createServiceError(
      "A valid admin ID is required.",
      400,
      "INVALID_ADMIN_ID",
    );
  }

  if (!validAccountId) {
    throw createServiceError(
      "A valid payment account ID is required.",
      400,
      "INVALID_PAYMENT_ACCOUNT_ID",
    );
  }

  if (
    !file ||
    !Buffer.isBuffer(file.buffer) ||
    file.buffer.length < 1
  ) {
    throw createServiceError(
      "QR image is required.",
      400,
      "DEPOSIT_QR_REQUIRED",
    );
  }

  const mimeType =
    String(file.mimetype || "")
      .trim()
      .toLowerCase();

  const allowedMimeTypes =
    new Set([
      "image/png",
      "image/jpeg",
      "image/webp",
    ]);

  if (
    !allowedMimeTypes.has(mimeType) ||
    !isValidDepositQrSignature(
      file.buffer,
      mimeType,
    )
  ) {
    throw createServiceError(
      "Invalid QR image file.",
      400,
      "INVALID_DEPOSIT_QR_IMAGE",
    );
  }

  if (
    file.buffer.length >
    2 * 1024 * 1024
  ) {
    throw createServiceError(
      "QR image cannot exceed 2 MB.",
      400,
      "DEPOSIT_QR_TOO_LARGE",
    );
  }

  const connection =
    await pool.getConnection();

  try {
    await connection.beginTransaction();

    await verifyPaymentAdmin(
      validAdminId,
      connection,
    );

    const [accountRows] =
      await connection.query(
        `
          SELECT
            id,
            method

          FROM
            deposit_payment_accounts

          WHERE id = ?
  AND status = 'active'

LIMIT 1

          FOR UPDATE
        `,
        [validAccountId],
      );

    const account =
      accountRows[0] || null;

    if (!account) {
      throw createServiceError(
        "Payment account was not found.",
        404,
        "PAYMENT_ACCOUNT_NOT_FOUND",
      );
    }

    if (account.method !== "binance") {
      throw createServiceError(
        "QR image is only available for Binance Pay accounts.",
        400,
        "QR_ONLY_FOR_BINANCE",
      );
    }

    const safeFileName =
      sanitizeDepositQrFileName(
        file.originalname,
      );

    await connection.query(
      `
        UPDATE
          deposit_payment_accounts

        SET
          qr_file_name = ?,
          qr_mime_type = ?,
          qr_size = ?,
          qr_image = ?,
          updated_by = ?,
          updated_at = CURRENT_TIMESTAMP

        WHERE id = ?
      `,
      [
        safeFileName,
        mimeType,
        file.buffer.length,
        file.buffer,
        validAdminId,
        validAccountId,
      ],
    );

    await connection.commit();

    return {
      id: validAccountId,

      fileName: safeFileName,

      mimeType,

      imageSize:
        file.buffer.length,

      qrImageUrl:
        `/api/deposits/payment-accounts/${validAccountId}/qr`,
    };
  } catch (error) {
    await connection.rollback();

    throw error;
  } finally {
    connection.release();
  }
}

async function getPaymentAccountQr(
  accountId,
) {
  const validAccountId =
    parsePositiveInteger(accountId);

  if (!validAccountId) {
    throw createServiceError(
      "A valid payment account ID is required.",
      400,
      "INVALID_PAYMENT_ACCOUNT_ID",
    );
  }

  const [rows] =
    await pool.query(
      `
        SELECT
          id,
          method,
          qr_file_name,
          qr_mime_type,
          qr_size,
          qr_image,
          updated_at

        FROM
          deposit_payment_accounts

        WHERE id = ?

        LIMIT 1
      `,
      [validAccountId],
    );

  const account =
    rows[0] || null;

  if (
    !account ||
    account.method !== "binance" ||
    !account.qr_image ||
    !account.qr_mime_type
  ) {
    throw createServiceError(
      "Payment QR image was not found.",
      404,
      "PAYMENT_QR_NOT_FOUND",
    );
  }

  return {
    id: Number(account.id),

    fileName:
      account.qr_file_name ||
      "binance-pay-qr",

    mimeType:
      account.qr_mime_type,

    imageSize:
      Number(
        account.qr_size || 0,
      ),

    imageData:
      account.qr_image,

    updatedAt:
      account.updated_at,
  };
}

module.exports = {
  getAdminPaymentSettings,
  getActivePaymentMethods,
  updatePaymentSettings,
  resolveCurrentPaymentAccount,

  getAdminPaymentManagement,
  updatePaymentRotation,
  rotatePaymentMethodNow,

  createPaymentAccount,
  updatePaymentAccount,
  removePaymentAccount,
  savePaymentAccountQr,
  getPaymentAccountQr,

  PAYMENT_METHODS,
  ACCOUNT_TYPES,
  PAYMENT_STATUSES,
};