const { pool } = require("../config/database");

const { insertAgentActionLog } = require("./agent-audit.service");

/* ==========================
   Get All Deposit Requests
========================== */

async function getAllDepositRequests({
  status = "all",
  method = "all",
  search = "",
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
      searchValue,
    );
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const [rows] = await pool.execute(
    `
        SELECT
            d.id,
           d.deposit_id,
d.user_id,
d.method,

d.assigned_payment_account_id,
d.receiver_display_name,
d.receiver_account_identifier,
d.receiver_account_type,

d.sender_number,
d.transaction_number,

d.gateway_order_id,
d.gateway_trade_no,
d.gateway_status,

d.amount,

d.payment_asset,
d.payment_asset_amount,
d.exchange_rate,

d.bonus_amount,
            d.credited_amount,
            d.is_first_deposit_bonus,
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
    values,
  );

  return rows.map((row) => ({
    id: row.id,
    depositId: row.deposit_id,
    userId: row.user_id,
    userUid: row.uid,
    fullName: row.full_name,
    userPhone: row.phone,
    email: row.email,
    currentWalletBalance: Number(row.wallet_balance),
    method: row.method,

    paymentAccountId:
      row.assigned_payment_account_id === null
        ? null
        : Number(row.assigned_payment_account_id),

    receiverDisplayName: row.receiver_display_name || null,

    receiverAccountIdentifier: row.receiver_account_identifier || null,

    receiverAccountType: row.receiver_account_type || null,

    senderNumber: row.sender_number,

   transactionNumber:
  row.transaction_number,

gatewayOrderId:
  row.gateway_order_id ||
  null,

gatewayTradeNumber:
  row.gateway_trade_no ||
  null,

gatewayStatus:
  row.gateway_status ||
  null,

amount: Number(row.amount),

    paymentAsset: row.payment_asset || "BDT",

    paymentAssetAmount: Number(row.payment_asset_amount || row.amount || 0),

    exchangeRate: row.exchange_rate === null ? null : Number(row.exchange_rate),

    bonusAmount: Number(row.bonus_amount || 0),

    creditedAmount: Number(row.credited_amount || 0),

    isFirstDepositBonus: Boolean(row.is_first_deposit_bonus),

    status: row.status,
    adminNote: row.admin_note,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    createdAt: row.created_at,
  }));
}

/* ==========================
   Generate Wallet Transaction ID
========================== */

function generateWalletTransactionId() {
  const timestamp = Date.now();

  const random = Math.floor(1000 + Math.random() * 9000);

  return `WTX${timestamp}${random}`;
}

function roundDepositMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

async function getFirstDepositBonusSettings(connection) {
  const [rows] = await connection.execute(
    `
      SELECT
        is_enabled,
        bonus_percent,
        maximum_bonus,
        minimum_deposit
      FROM first_deposit_bonus_settings
      WHERE id = 1
      LIMIT 1
      FOR UPDATE
      `,
  );

  const row = rows[0] || null;

  if (!row) {
    const error = new Error("First deposit bonus settings were not found.");

    error.statusCode = 500;
    throw error;
  }

  const settings = {
    isEnabled: Boolean(row.is_enabled),

    bonusPercent: roundDepositMoney(row.bonus_percent),

    maximumBonus: roundDepositMoney(row.maximum_bonus),

    minimumDeposit: roundDepositMoney(row.minimum_deposit),
  };

  if (
    !Number.isFinite(settings.bonusPercent) ||
    settings.bonusPercent < 0 ||
    settings.bonusPercent > 100 ||
    !Number.isFinite(settings.maximumBonus) ||
    settings.maximumBonus < 0 ||
    !Number.isFinite(settings.minimumDeposit) ||
    settings.minimumDeposit < 0
  ) {
    const error = new Error("First deposit bonus settings are invalid.");

    error.statusCode = 500;
    throw error;
  }

  return settings;
}

function calculateFirstDepositBonus(depositAmount, settings) {
  const validAmount = roundDepositMoney(depositAmount);

  if (
    validAmount <= 0 ||
    !settings?.isEnabled ||
    validAmount < settings.minimumDeposit ||
    settings.bonusPercent <= 0 ||
    settings.maximumBonus <= 0
  ) {
    return 0;
  }

  const percentageBonus = roundDepositMoney(
    validAmount * (settings.bonusPercent / 100),
  );

  return roundDepositMoney(Math.min(percentageBonus, settings.maximumBonus));
}

async function getReferralRewardContext({
  referredUserId,
  depositRequestId,
  depositAmount,
  connection,
}) {
  const [relationRows] = await connection.execute(
    `
      SELECT
        id,
        referrer_user_id,
        referred_user_id,
        status
      FROM user_referrals
      WHERE referred_user_id = ?
        AND status = 'pending'
      LIMIT 1
      FOR UPDATE
      `,
    [referredUserId],
  );

  const relation = relationRows[0] || null;

  if (!relation) {
    return null;
  }

  const [settingRows] = await connection.execute(
    `
      SELECT
        is_enabled,
        referrer_bonus,
        referred_user_bonus,
        minimum_first_deposit
      FROM referral_settings
      WHERE id = 1
      LIMIT 1
      FOR UPDATE
      `,
  );

  const settings = settingRows[0] || null;

  if (!settings) {
    const error = new Error("Referral settings were not found.");

    error.statusCode = 500;
    throw error;
  }

  const isEnabled = Boolean(settings.is_enabled);

  const minimumDeposit = roundDepositMoney(settings.minimum_first_deposit);

  if (!isEnabled || depositAmount < minimumDeposit) {
    await connection.execute(
      `
      UPDATE user_referrals
      SET
        status = 'cancelled',
        updated_at = NOW()
      WHERE id = ?
        AND status = 'pending'
      `,
      [relation.id],
    );

    return null;
  }

  const [referrerRows] = await connection.execute(
    `
      SELECT
        id,
        wallet_balance,
        turnover_required,
        role,
        account_status
      FROM users
      WHERE id = ?
      LIMIT 1
      FOR UPDATE
      `,
    [relation.referrer_user_id],
  );

  const referrer = referrerRows[0] || null;

  if (
    !referrer ||
    referrer.role !== "user" ||
    referrer.account_status !== "active"
  ) {
    await connection.execute(
      `
      UPDATE user_referrals
      SET
        status = 'cancelled',
        updated_at = NOW()
      WHERE id = ?
        AND status = 'pending'
      `,
      [relation.id],
    );

    return null;
  }

  return {
    relationId: Number(relation.id),

    depositRequestId: Number(depositRequestId),

    referrerUserId: Number(referrer.id),

    referrerWalletBalance: roundDepositMoney(referrer.wallet_balance),

    referrerTurnoverRequired: roundDepositMoney(referrer.turnover_required),

    referrerBonusAmount: roundDepositMoney(settings.referrer_bonus),

    referredBonusAmount: roundDepositMoney(settings.referred_user_bonus),
  };
}

async function insertReferralBonusTransaction({
  userId,
  bonusAmount,
  balanceBefore,
  balanceAfter,
  referralId,
  description,
  adminId,
  connection,
}) {
  if (bonusAmount <= 0) {
    return null;
  }

  const transactionId = generateWalletTransactionId();

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
      'referral_bonus',
      'credit',
      ?,
      ?,
      ?,
      'completed',
      'user_referral',
      ?,
      ?,
      ?
    )
    `,
    [
      transactionId,
      userId,
      bonusAmount,
      balanceBefore,
      balanceAfter,
      String(referralId),
      description,
      adminId,
    ],
  );

  return transactionId;
}

/* ==========================
   Approve Deposit
========================== */
async function approveDepositRequest({
  depositId,
  adminId,
  auditActor = null,
}) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [depositRows] = await connection.execute(
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
      [depositId],
    );

    const deposit = depositRows[0] || null;

    if (!deposit) {
      const error = new Error("Deposit request not found.");

      error.statusCode = 404;
      throw error;
    }

    if (deposit.status !== "pending") {
      const error = new Error(
        "This deposit request has already been processed.",
      );

      error.statusCode = 409;
      throw error;
    }

    const [userRows] = await connection.execute(
      `
        SELECT
          id,
          wallet_balance,
          total_deposit,
          turnover_required
        FROM users
        WHERE id = ?
        LIMIT 1
        FOR UPDATE
        `,
      [deposit.user_id],
    );

    const user = userRows[0] || null;

    if (!user) {
      const error = new Error("Deposit user not found.");

      error.statusCode = 404;
      throw error;
    }

    const [previousDepositRows] = await connection.execute(
      `
        SELECT id
        FROM deposit_requests
        WHERE user_id = ?
          AND status = 'approved'
          AND id != ?
        ORDER BY id ASC
        LIMIT 1
        FOR UPDATE
        `,
      [deposit.user_id, deposit.id],
    );

    const isFirstDeposit = previousDepositRows.length === 0;

    const amount = roundDepositMoney(deposit.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      const error = new Error("Invalid deposit amount.");

      error.statusCode = 400;
      throw error;
    }

    const firstDepositBonusSettings = isFirstDeposit
      ? await getFirstDepositBonusSettings(connection)
      : null;

    const firstDepositBonus = isFirstDeposit
      ? calculateFirstDepositBonus(amount, firstDepositBonusSettings)
      : 0;

    const referralReward = isFirstDeposit
      ? await getReferralRewardContext({
          referredUserId: Number(deposit.user_id),

          depositRequestId: Number(deposit.id),

          depositAmount: amount,

          connection,
        })
      : null;

    const referredReferralBonus = roundDepositMoney(
      referralReward?.referredBonusAmount || 0,
    );

    /*
     * Deposit transaction-এর credit:
     * actual deposit + 50% first bonus।
     */
    const depositCreditAmount = roundDepositMoney(amount + firstDepositBonus);

    /*
     * Deposit request-এর credited amount:
     * user wallet-এ মোট যত credit হলো।
     */
    const creditedAmount = roundDepositMoney(
      depositCreditAmount + referredReferralBonus,
    );

    const balanceBefore = roundDepositMoney(user.wallet_balance);

    const depositBalanceAfter = roundDepositMoney(
      balanceBefore + depositCreditAmount,
    );

    const balanceAfter = roundDepositMoney(
      depositBalanceAfter + referredReferralBonus,
    );

    const totalDepositAfter = roundDepositMoney(
      Number(user.total_deposit || 0) + amount,
    );

    /*
     * New user-এর turnover:
     * deposit + first bonus +
     * referral bonus।
     */
    const turnoverRequiredAfter = roundDepositMoney(
      Number(user.turnover_required || 0) + creditedAmount,
    );

    await connection.execute(
      `
      UPDATE users
      SET
        wallet_balance = ?,
        total_deposit = ?,
        turnover_required = ?
      WHERE id = ?
      `,
      [balanceAfter, totalDepositAfter, turnoverRequiredAfter, deposit.user_id],
    );

    await connection.execute(
      `
      UPDATE deposit_requests
      SET
        status = 'approved',
               bonus_amount = ?,
        credited_amount = ?,
        is_first_deposit_bonus = ?,

        first_bonus_enabled = ?,
        first_bonus_percent = ?,
        first_bonus_cap = ?,
        first_bonus_minimum_deposit = ?,

        approved_by = ?,
        approved_at = NOW(),
        admin_note = NULL
      WHERE id = ?
      `,
      [
        firstDepositBonus,
        creditedAmount,

        isFirstDeposit && firstDepositBonus > 0 ? 1 : 0,

        firstDepositBonusSettings?.isEnabled ? 1 : 0,

        firstDepositBonusSettings?.bonusPercent || 0,

        firstDepositBonusSettings?.maximumBonus || 0,

        firstDepositBonusSettings?.minimumDeposit || 0,

        adminId,
        deposit.id,
      ],
    );

    /*
     * Deposit wallet transaction।
     */
    const walletTransactionId = generateWalletTransactionId();

    const depositDescription =
      firstDepositBonus > 0
        ? `First deposit approved: ` +
          `${deposit.deposit_id}; ` +
          `deposit ৳${amount.toFixed(2)}, bonus ৳${firstDepositBonus.toFixed(
            2,
          )}`
        : `Deposit approved: ` + deposit.deposit_id;

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
        depositCreditAmount,
        balanceBefore,
        depositBalanceAfter,
        deposit.deposit_id,
        depositDescription,
        adminId,
      ],
    );

    let referredBonusTransactionId = null;

    let referrerBonusTransactionId = null;

    if (referralReward) {
      /*
       * Referred/new user ৳100।
       */
      referredBonusTransactionId = await insertReferralBonusTransaction({
        userId: Number(deposit.user_id),

        bonusAmount: referredReferralBonus,

        balanceBefore: depositBalanceAfter,

        balanceAfter,

        referralId: referralReward.relationId,

        description: "Referral bonus received after first deposit.",

        adminId,

        connection,
      });

      /*
       * Referrer ৳200 এবং তার required
       * turnover-এও ৳200 যোগ হবে।
       */
      const referrerBalanceBefore = referralReward.referrerWalletBalance;

      const referrerBalanceAfter = roundDepositMoney(
        referrerBalanceBefore + referralReward.referrerBonusAmount,
      );

      const referrerTurnoverAfter = roundDepositMoney(
        referralReward.referrerTurnoverRequired +
          referralReward.referrerBonusAmount,
      );

      await connection.execute(
        `
        UPDATE users
        SET
          wallet_balance = ?,
          turnover_required = ?
        WHERE id = ?
        `,
        [
          referrerBalanceAfter,
          referrerTurnoverAfter,
          referralReward.referrerUserId,
        ],
      );

      referrerBonusTransactionId = await insertReferralBonusTransaction({
        userId: referralReward.referrerUserId,

        bonusAmount: referralReward.referrerBonusAmount,

        balanceBefore: referrerBalanceBefore,

        balanceAfter: referrerBalanceAfter,

        referralId: referralReward.relationId,

        description:
          "Referral reward received after referred user's first deposit.",

        adminId,

        connection,
      });

      /*
       * Reward audit final করা হচ্ছে।
       * status condition duplicate payout
       * বন্ধ রাখবে।
       */
      const [rewardUpdateResult] = await connection.execute(
        `
          UPDATE user_referrals
          SET
            status = 'rewarded',
            qualifying_deposit_id = ?,
            referrer_bonus_amount = ?,
            referred_bonus_amount = ?,
            rewarded_at = NOW(),
            updated_at = NOW()
          WHERE id = ?
            AND status = 'pending'
          `,
        [
          deposit.id,
          referralReward.referrerBonusAmount,
          referredReferralBonus,
          referralReward.relationId,
        ],
      );

      if (Number(rewardUpdateResult.affectedRows) !== 1) {
        const error = new Error("Referral reward was already processed.");

        error.statusCode = 409;
        throw error;
      }
    }

    if (auditActor) {
      await insertAgentActionLog({
        connection,

        agentId: auditActor.agentId,

        actionType: "deposit_approved",

        referenceId: deposit.deposit_id,

        customerId: deposit.user_id,

        amount,

        reason: auditActor.reason || "Deposit approved",

        ipAddress: auditActor.ipAddress,

        userAgent: auditActor.userAgent,
      });
    }

    await connection.commit();

    return {
      depositId: deposit.deposit_id,

      status: "approved",

      amount,

      bonusAmount: firstDepositBonus,

      firstDepositBonusSettings: firstDepositBonusSettings
        ? {
            isEnabled: firstDepositBonusSettings.isEnabled,

            bonusPercent: firstDepositBonusSettings.bonusPercent,

            maximumBonus: firstDepositBonusSettings.maximumBonus,

            minimumDeposit: firstDepositBonusSettings.minimumDeposit,
          }
        : null,

      referralBonusAmount: referredReferralBonus,

      creditedAmount,

      isFirstDepositBonus: isFirstDeposit && firstDepositBonus > 0,

      referralRewarded: Boolean(referralReward),

      referrerBonusAmount: referralReward?.referrerBonusAmount || 0,

      balanceBefore,

      balanceAfter,

      totalDepositAfter,

      turnoverRequiredAfter,

      walletTransactionId,

      referredBonusTransactionId,

      referrerBonusTransactionId,
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
  note,
  auditActor = null,
}) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute(
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
      [depositId],
    );

    const deposit = rows[0];

    if (!deposit) {
      const error = new Error("Deposit request not found.");

      error.statusCode = 404;

      throw error;
    }

    if (deposit.status !== "pending") {
      const error = new Error(
        "This deposit request has already been processed.",
      );

      error.statusCode = 409;

      throw error;
    }

    const adminNote = note ? `${reason}: ${note}` : reason;

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
      [adminId, adminNote, deposit.id],
    );

       if (auditActor) {
      await insertAgentActionLog({
        connection,

        agentId:
          auditActor.agentId,

        actionType:
          "deposit_rejected",

        referenceId:
          deposit.deposit_id,

        customerId:
          deposit.user_id,

        amount:
          Number(deposit.amount),

        reason:
          note
            ? `${reason}: ${note}`
            : reason,

        ipAddress:
          auditActor.ipAddress,

        userAgent:
          auditActor.userAgent
      });
    }

    await connection.commit();

    return {
      depositId: deposit.deposit_id,
      status: "rejected",
      reason,
      note: note || null,
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
  rejectDepositRequest,
};
