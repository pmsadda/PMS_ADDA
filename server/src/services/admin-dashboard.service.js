const { pool } = require("../config/database");

async function getDashboardStats() {
  const connection = await pool.getConnection();

  try {
    /* =========================
       USER STATISTICS
    ========================= */

    const [userRows] = await connection.query(`
        SELECT
          COUNT(*) AS total,

          COALESCE(
            SUM(
              CASE
                WHEN account_status = 'active'
                THEN 1
                ELSE 0
              END
            ),
            0
          ) AS active,

          COALESCE(
            SUM(
              CASE
                WHEN account_status = 'banned'
                THEN 1
                ELSE 0
              END
            ),
            0
          ) AS blocked,

          COALESCE(
            SUM(
              CASE
                WHEN is_online = 1
                THEN 1
                ELSE 0
              END
            ),
            0
          ) AS online,

          COALESCE(
            SUM(wallet_balance),
            0
          ) AS total_wallet_balance,

          COALESCE(
            SUM(total_deposit),
            0
          ) AS users_total_deposit,

          COALESCE(
            SUM(total_withdraw),
            0
          ) AS users_total_withdraw

        FROM users
      `);

    /* =========================
       DEPOSIT STATISTICS
    ========================= */

    const [depositRows] = await connection.query(`
        SELECT
          COUNT(*) AS total_count,

          COALESCE(
            SUM(amount),
            0
          ) AS total_amount,

          COALESCE(
            SUM(
              CASE
                WHEN status = 'pending'
                THEN 1
                ELSE 0
              END
            ),
            0
          ) AS pending_count,

          COALESCE(
            SUM(
              CASE
                WHEN status = 'pending'
                THEN amount
                ELSE 0
              END
            ),
            0
          ) AS pending_amount,

          COALESCE(
            SUM(
              CASE
                WHEN status = 'approved'
                THEN 1
                ELSE 0
              END
            ),
            0
          ) AS approved_count,

          COALESCE(
            SUM(
              CASE
                WHEN status = 'approved'
                THEN amount
                ELSE 0
              END
            ),
            0
          ) AS approved_amount,

          COALESCE(
            SUM(
              CASE
                WHEN status = 'rejected'
                THEN 1
                ELSE 0
              END
            ),
            0
          ) AS rejected_count,

          COALESCE(
            SUM(
              CASE
                WHEN status = 'rejected'
                THEN amount
                ELSE 0
              END
            ),
            0
          ) AS rejected_amount,

          COALESCE(
            SUM(
              CASE
                WHEN status = 'approved'
                  AND DATE(approved_at) =
                      CURRENT_DATE()
                THEN amount
                ELSE 0
              END
            ),
            0
          ) AS today_amount

        FROM deposit_requests
      `);

    /* =========================
       WITHDRAW STATISTICS
    ========================= */

    const [withdrawRows] = await connection.query(`
        SELECT
          COUNT(*) AS total_count,

          COALESCE(
            SUM(amount),
            0
          ) AS total_amount,

          COALESCE(
            SUM(
              CASE
                WHEN status = 'pending'
                THEN 1
                ELSE 0
              END
            ),
            0
          ) AS pending_count,

          COALESCE(
            SUM(
              CASE
                WHEN status = 'pending'
                THEN amount
                ELSE 0
              END
            ),
            0
          ) AS pending_amount,

          COALESCE(
            SUM(
              CASE
                WHEN status = 'approved'
                THEN 1
                ELSE 0
              END
            ),
            0
          ) AS approved_count,

          COALESCE(
            SUM(
              CASE
                WHEN status = 'approved'
                THEN amount
                ELSE 0
              END
            ),
            0
          ) AS approved_amount,

          COALESCE(
            SUM(
              CASE
                WHEN status = 'rejected'
                THEN 1
                ELSE 0
              END
            ),
            0
          ) AS rejected_count,

          COALESCE(
            SUM(
              CASE
                WHEN status = 'rejected'
                THEN amount
                ELSE 0
              END
            ),
            0
          ) AS rejected_amount,

          COALESCE(
            SUM(
              CASE
                WHEN status = 'approved'
                  AND DATE(processed_at) =
                      CURRENT_DATE()
                THEN amount
                ELSE 0
              END
            ),
            0
          ) AS today_amount

        FROM withdraw_requests
      `);

    /* =========================
   RECENT REQUESTS
========================= */

    const [recentDepositRows] = await connection.query(`
    SELECT
      dr.id,
      dr.deposit_id AS requestId,
      dr.method,
      dr.amount,
      dr.status,
      dr.created_at AS createdAt,

      COALESCE(
        NULLIF(u.full_name, ''),
        u.username,
        'Unknown User'
      ) AS userName

    FROM deposit_requests dr

    INNER JOIN users u
      ON u.id = dr.user_id

    ORDER BY dr.id DESC

    LIMIT 5
  `);

    const [recentWithdrawRows] = await connection.query(`
    SELECT
      wr.id,
      wr.withdraw_id AS requestId,
      wr.method,
      wr.amount,
      wr.status,
      wr.created_at AS createdAt,

      COALESCE(
        NULLIF(u.full_name, ''),
        u.username,
        'Unknown User'
      ) AS userName

    FROM withdraw_requests wr

    INNER JOIN users u
      ON u.id = wr.user_id

    ORDER BY wr.id DESC

    LIMIT 5
  `);

    /* =========================
       REVENUE STATISTICS
    ========================= */

    const [revenueRows] = await connection.query(`
        SELECT
          COUNT(*) AS total_rounds,

          COALESCE(
            SUM(service_charge_amount),
            0
          ) AS total_revenue,

          COALESCE(
            SUM(
              CASE
                WHEN DATE(created_at) =
                     CURRENT_DATE()
                THEN service_charge_amount
                ELSE 0
              END
            ),
            0
          ) AS today_revenue,

          COALESCE(
            SUM(
              CASE
                WHEN winner_type = 'real'
                THEN service_charge_amount
                ELSE 0
              END
            ),
            0
          ) AS real_player_revenue,

          COALESCE(
            SUM(
              CASE
                WHEN winner_type = 'bot'
                THEN service_charge_amount
                ELSE 0
              END
            ),
            0
          ) AS bot_revenue,

          COALESCE(
            SUM(
              CASE
                WHEN winner_type = 'bot'
                THEN 1
                ELSE 0
              END
            ),
            0
          ) AS bot_win_rounds

        FROM teen_patti_revenue_history
      `);

    const [pokerRevenueRows] = await connection.query(`
    SELECT
      COUNT(*) AS total_rounds,

      COALESCE(
        SUM(service_charge_amount),
        0
      ) AS total_revenue,

      COALESCE(
        SUM(
          CASE
            WHEN DATE(completed_at) =
                 CURRENT_DATE()
            THEN service_charge_amount
            ELSE 0
          END
        ),
        0
      ) AS today_revenue

    FROM poker_hands

    WHERE hand_status = 'completed'
      AND settlement_completed = 1
  `);

    const [ludoRevenueRows] = await connection.query(`
    SELECT
      COUNT(*) AS total_rounds,

      COALESCE(
        SUM(service_charge_amount),
        0
      ) AS total_revenue,

      COALESCE(
        SUM(
          CASE
            WHEN DATE(completed_at) =
                 CURRENT_DATE()
            THEN service_charge_amount
            ELSE 0
          END
        ),
        0
      ) AS today_revenue

    FROM ludo_matches

    WHERE match_status = 'completed'
      AND settlement_completed = 1
  `);

    /* =========================
       ROOM STATISTICS
    ========================= */

    const [roomRows] = await connection.query(`
    SELECT
      COALESCE(
        SUM(room_group.total_tables),
        0
      ) AS total_tables,

      COALESCE(
        SUM(room_group.active_tables),
        0
      ) AS active_tables

    FROM (

      SELECT
        COUNT(*) AS total_tables,

        SUM(
          CASE
            WHEN gt.game_status IN (
              'waiting',
              'playing'
            )
            AND gr.status != 'disabled'
            THEN 1
            ELSE 0
          END
        ) AS active_tables

      FROM game_tables gt

      INNER JOIN game_rooms gr
        ON gr.id = gt.room_id

      WHERE gr.game_type =
            'teen_patti'

      UNION ALL

      SELECT
        COUNT(*) AS total_tables,

        SUM(
          CASE
            WHEN pt.table_status IN (
              'waiting',
              'starting',
              'playing',
              'paused'
            )
            AND gr.status != 'disabled'
            THEN 1
            ELSE 0
          END
        ) AS active_tables

      FROM poker_tables pt

      INNER JOIN game_rooms gr
        ON gr.id = pt.room_id

      WHERE gr.game_type = 'poker'

      UNION ALL

      SELECT
        COUNT(*) AS total_tables,

        SUM(
          CASE
            WHEN lm.match_status IN (
              'waiting',
              'starting',
              'playing'
            )
            THEN 1
            ELSE 0
          END
        ) AS active_tables

      FROM ludo_matches lm

    ) AS room_group
  `);

    /* =========================
       BOT STATISTICS
    ========================= */

    const [botRows] = await connection.query(`
    SELECT
      COALESCE(
        SUM(bot_group.total_bots),
        0
      ) AS total_bots,

      COALESCE(
        SUM(bot_group.enabled_bots),
        0
      ) AS enabled_bots,

      COALESCE(
        SUM(bot_group.total_balance),
        0
      ) AS total_bot_balance

    FROM (
      SELECT
        COUNT(*) AS total_bots,

        SUM(
          CASE
            WHEN status = 'active'
            THEN 1
            ELSE 0
          END
        ) AS enabled_bots,

        SUM(
          wallet_balance
        ) AS total_balance

      FROM teen_patti_bots

      UNION ALL

      SELECT
        COUNT(*) AS total_bots,

        SUM(
          CASE
            WHEN status = 'active'
            THEN 1
            ELSE 0
          END
        ) AS enabled_bots,

        SUM(
          wallet_balance
        ) AS total_balance

      FROM poker_bots

      UNION ALL

      SELECT
        COUNT(*) AS total_bots,

        SUM(
          CASE
            WHEN status = 'active'
            THEN 1
            ELSE 0
          END
        ) AS enabled_bots,

        SUM(
          wallet_balance
        ) AS total_balance

      FROM ludo_bots

    ) AS bot_group
  `);

    const [botActivityRows] = await connection.query(`
    SELECT
      COALESCE(
        SUM(activity.bot_games),
        0
      ) AS bot_games,

      COALESCE(
        SUM(activity.bot_wins),
        0
      ) AS bot_wins,

      COALESCE(
        SUM(activity.bot_revenue),
        0
      ) AS bot_revenue,

      COALESCE(
        SUM(activity.bot_loss),
        0
      ) AS bot_loss

    FROM (

      SELECT
        COUNT(
          DISTINCT thp.hand_id
        ) AS bot_games,

        SUM(
          CASE
            WHEN thp.player_status =
                 'winner'
            THEN 1
            ELSE 0
          END
        ) AS bot_wins,

        SUM(
          thp.prize_amount
        ) AS bot_revenue,

        SUM(
          thp.total_contribution
        ) AS bot_loss

      FROM teen_patti_hand_players thp

      INNER JOIN teen_patti_hands th
        ON th.id = thp.hand_id

      WHERE thp.player_type = 'bot'
        AND th.hand_status = 'completed'
        AND th.settlement_completed = 1

      UNION ALL

      SELECT
        COUNT(
          DISTINCT php.hand_id
        ) AS bot_games,

        SUM(
          CASE
            WHEN php.prize_amount > 0
            THEN 1
            ELSE 0
          END
        ) AS bot_wins,

        SUM(
          php.prize_amount
        ) AS bot_revenue,

        SUM(
          php.total_contribution
        ) AS bot_loss

      FROM poker_hand_players php

      INNER JOIN poker_hands ph
        ON ph.id = php.hand_id

      INNER JOIN poker_table_players ptp
        ON ptp.id =
           php.table_player_id

      WHERE ptp.is_bot = 1
        AND ph.hand_status = 'completed'
        AND ph.settlement_completed = 1

      UNION ALL

      SELECT
        COUNT(
          DISTINCT lmp.match_id
        ) AS bot_games,

        SUM(
          CASE
            WHEN lmp.finish_position = 1
            THEN 1
            ELSE 0
          END
        ) AS bot_wins,

        SUM(
          lmp.prize_amount
        ) AS bot_revenue,

        SUM(
          CASE
            WHEN lmp.entry_debited = 1
            THEN lmp.entry_amount
            ELSE 0
          END
        ) AS bot_loss

      FROM ludo_match_players lmp

      INNER JOIN ludo_matches lm
        ON lm.id = lmp.match_id

      WHERE lmp.is_bot = 1
        AND lm.match_status = 'completed'
        AND lm.settlement_completed = 1

    ) AS activity
  `);

    /* =========================
       SERVICE CHARGE
    ========================= */

    const [chargeRows] = await connection.query(`
    SELECT
      COALESCE(
        MAX(
          CASE
            WHEN game_type = 'teen_patti'
            THEN service_charge
          END
        ),
        5
      ) AS teen_patti_charge,

      COALESCE(
        MAX(
          CASE
            WHEN game_type = 'poker'
            THEN service_charge
          END
        ),
        5
      ) AS poker_charge,

      COALESCE(
        MAX(
          CASE
            WHEN game_type = 'ludo'
            THEN service_charge
          END
        ),
        10
      ) AS ludo_charge

    FROM game_settings
  `);

    const [firstDepositBonusSettingRows] = await connection.query(
      `
      SELECT
        is_enabled,
        bonus_percent,
        maximum_bonus,
        minimum_deposit,
        updated_at
      FROM first_deposit_bonus_settings
      WHERE id = 1
      LIMIT 1
      `,
    );

        const [signupBonusSettingRows] = await connection.query(
      `
      SELECT
        is_enabled,
        bonus_amount,
        updated_at
      FROM signup_bonus_settings
      WHERE id = 1
      LIMIT 1
      `,
    );

        const [withdrawSettingRows] = await connection.query(
      `
      SELECT
        minimum_withdraw_amount,
        updated_at
      FROM withdraw_settings
      WHERE id = 1
      LIMIT 1
      `,
    );

    const [referralSettingRows] = await connection.query(
      `
    SELECT
      is_enabled,
      referrer_bonus,
      referred_user_bonus,
      minimum_first_deposit,
      updated_at
    FROM referral_settings
    WHERE id = 1
    LIMIT 1
    `,
    );

    const [referralStatsRows] = await connection.query(
      `
    SELECT
      COUNT(*) AS total_referrals,

      COALESCE(
        SUM(
          CASE
            WHEN status = 'pending'
            THEN 1
            ELSE 0
          END
        ),
        0
      ) AS pending_referrals,

      COALESCE(
        SUM(
          CASE
            WHEN status = 'rewarded'
            THEN 1
            ELSE 0
          END
        ),
        0
      ) AS rewarded_referrals,

      COALESCE(
        SUM(
          CASE
            WHEN status = 'cancelled'
            THEN 1
            ELSE 0
          END
        ),
        0
      ) AS cancelled_referrals,

      COALESCE(
        SUM(referrer_bonus_amount),
        0
      ) AS total_referrer_bonus,

      COALESCE(
        SUM(referred_bonus_amount),
        0
      ) AS total_referred_bonus

    FROM user_referrals
    `,
    );

    const userStats = userRows[0] || {};

    const depositStats = depositRows[0] || {};

    const withdrawStats = withdrawRows[0] || {};

    const revenueStats = revenueRows[0] || {};

    const pokerRevenueStats = pokerRevenueRows[0] || {};

    const ludoRevenueStats = ludoRevenueRows[0] || {};

    const totalRevenue =
      Number(revenueStats.total_revenue || 0) +
      Number(pokerRevenueStats.total_revenue || 0) +
      Number(ludoRevenueStats.total_revenue || 0);

    const todayRevenue =
      Number(revenueStats.today_revenue || 0) +
      Number(pokerRevenueStats.today_revenue || 0) +
      Number(ludoRevenueStats.today_revenue || 0);

    const totalRounds =
      Number(revenueStats.total_rounds || 0) +
      Number(pokerRevenueStats.total_rounds || 0) +
      Number(ludoRevenueStats.total_rounds || 0);

    const roomStats = roomRows[0] || {};

    const botStats = botRows[0] || {};

    const botActivityStats = botActivityRows[0] || {};

    const chargeStats = chargeRows[0] || {};

    const firstDepositBonusSettings = firstDepositBonusSettingRows[0] || {};

        const signupBonusSettings = signupBonusSettingRows[0] || {};

            const withdrawSettings = withdrawSettingRows[0] || {};

    const referralSettings = referralSettingRows[0] || {};

    const referralStats = referralStatsRows[0] || {};

    return {
      users: {
        total: Number(userStats.total || 0),

        active: Number(userStats.active || 0),

        blocked: Number(userStats.blocked || 0),

        online: Number(userStats.online || 0),

        totalWalletBalance: Number(userStats.total_wallet_balance || 0),

        totalDeposit: Number(userStats.users_total_deposit || 0),

        totalWithdraw: Number(userStats.users_total_withdraw || 0),
      },

      deposits: {
        totalCount: Number(depositStats.total_count || 0),

        totalAmount: Number(depositStats.total_amount || 0),

        todayAmount: Number(depositStats.today_amount || 0),

        pending: {
          count: Number(depositStats.pending_count || 0),

          amount: Number(depositStats.pending_amount || 0),
        },

        approved: {
          count: Number(depositStats.approved_count || 0),

          amount: Number(depositStats.approved_amount || 0),
        },

        rejected: {
          count: Number(depositStats.rejected_count || 0),

          amount: Number(depositStats.rejected_amount || 0),
        },
      },

      withdrawals: {
        totalCount: Number(withdrawStats.total_count || 0),

        totalAmount: Number(withdrawStats.total_amount || 0),

        todayAmount: Number(withdrawStats.today_amount || 0),

        pending: {
          count: Number(withdrawStats.pending_count || 0),

          amount: Number(withdrawStats.pending_amount || 0),
        },

        approved: {
          count: Number(withdrawStats.approved_count || 0),

          amount: Number(withdrawStats.approved_amount || 0),
        },

        rejected: {
          count: Number(withdrawStats.rejected_count || 0),

          amount: Number(withdrawStats.rejected_amount || 0),
        },
      },

      revenue: {
        totalAmount: totalRevenue,

        todayAmount: todayRevenue,

        totalRounds,

        realPlayerRevenue: Number(revenueStats.real_player_revenue || 0),

        botRevenue: Number(revenueStats.bot_revenue || 0),
      },

      games: {
        teenPatti: {
          revenue: Number(revenueStats.total_revenue || 0),

          roundsPlayed: Number(revenueStats.total_rounds || 0),
        },

        poker: {
          revenue: Number(pokerRevenueStats.total_revenue || 0),

          roundsPlayed: Number(pokerRevenueStats.total_rounds || 0),
        },

        ludo: {
          revenue: Number(ludoRevenueStats.total_revenue || 0),

          roundsPlayed: Number(ludoRevenueStats.total_rounds || 0),
        },
      },

      rooms: {
        total: Number(roomStats.total_tables || 0),

        active: Number(roomStats.active_tables || 0),
      },

      bots: {
        total: Number(botStats.total_bots || 0),

        enabled: Number(botStats.enabled_bots || 0),

        active: Number(botStats.enabled_bots || 0),

        totalBalance: Number(botStats.total_bot_balance || 0),

        gamesPlayed: Number(botActivityStats.bot_games || 0),

        winRounds: Number(botActivityStats.bot_wins || 0),

        revenue: Number(botActivityStats.bot_revenue || 0),

        totalWin: Number(botActivityStats.bot_revenue || 0),

        loss: Number(botActivityStats.bot_loss || 0),

        netResult:
          Number(botActivityStats.bot_revenue || 0) -
          Number(botActivityStats.bot_loss || 0),
      },

      serviceCharges: {
        teenPatti: Number(chargeStats.teen_patti_charge || 5),

        poker: Number(chargeStats.poker_charge || 5),

        ludo: Number(chargeStats.ludo_charge || 10),
      },

            signupBonusSettings: {
        isEnabled: Boolean(signupBonusSettings.is_enabled),

        bonusAmount: Number(signupBonusSettings.bonus_amount || 0),

        updatedAt: signupBonusSettings.updated_at || null,
      },

            withdrawSettings: {
        minimumWithdrawAmount: Number(
          withdrawSettings.minimum_withdraw_amount || 100,
        ),

        updatedAt: withdrawSettings.updated_at || null,
      },

      firstDepositBonusSettings: {
        isEnabled: Boolean(firstDepositBonusSettings.is_enabled),

        bonusPercent: Number(firstDepositBonusSettings.bonus_percent || 0),

        maximumBonus: Number(firstDepositBonusSettings.maximum_bonus || 0),

        minimumDeposit: Number(firstDepositBonusSettings.minimum_deposit || 0),

        updatedAt: firstDepositBonusSettings.updated_at || null,
      },

      referralSettings: {
        isEnabled: Boolean(referralSettings.is_enabled),

        referrerBonus: Number(referralSettings.referrer_bonus || 0),

        referredUserBonus: Number(referralSettings.referred_user_bonus || 0),

        minimumFirstDeposit: Number(
          referralSettings.minimum_first_deposit || 0,
        ),

        updatedAt: referralSettings.updated_at || null,
      },

      referrals: {
        total: Number(referralStats.total_referrals || 0),

        pending: Number(referralStats.pending_referrals || 0),

        rewarded: Number(referralStats.rewarded_referrals || 0),

        cancelled: Number(referralStats.cancelled_referrals || 0),

        totalReferrerBonus: Number(referralStats.total_referrer_bonus || 0),

        totalReferredBonus: Number(referralStats.total_referred_bonus || 0),
      },

      recentDeposits: recentDepositRows.map((request) => ({
        id: Number(request.id),

        requestId: request.requestId,

        userName: request.userName,

        method: request.method,

        amount: Number(request.amount || 0),

        status: request.status,

        createdAt: request.createdAt,
      })),

      recentWithdrawals: recentWithdrawRows.map((request) => ({
        id: Number(request.id),

        requestId: request.requestId,

        userName: request.userName,

        method: request.method,

        amount: Number(request.amount || 0),

        status: request.status,

        createdAt: request.createdAt,
      })),
    };
  } finally {
    connection.release();
  }
}

function validateServiceCharge(value) {
  const charge = Number(value);

  if (!Number.isFinite(charge) || charge < 0 || charge > 20) {
    const error = new Error("Service charge must be between 0 and 20.");

    error.statusCode = 400;
    throw error;
  }

  return Number(charge.toFixed(2));
}

async function updateServiceCharges(serviceCharges, adminId = null) {
  const charges = {
    teenPatti: validateServiceCharge(serviceCharges?.teenPatti),

    poker: validateServiceCharge(serviceCharges?.poker),

    ludo: validateServiceCharge(serviceCharges?.ludo),
  };

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const chargeUpdates = [
      ["teen_patti", charges.teenPatti],

      ["poker", charges.poker],

      ["ludo", charges.ludo],
    ];

    for (const [gameType, serviceCharge] of chargeUpdates) {
      await connection.query(
        `
  INSERT INTO game_settings (
    game_type,
    service_charge,
    updated_by
  )
  VALUES (
    ?,
    ?,
    ?
  )
  ON DUPLICATE KEY UPDATE
    service_charge =
      VALUES(service_charge),
    updated_by =
      VALUES(updated_by)
  `,
        [gameType, serviceCharge, adminId],
      );
      await connection.query(
        `
        UPDATE game_rooms
        SET service_charge = ?
        WHERE game_type = ?
        `,
        [serviceCharge, gameType],
      );
    }

    await connection.commit();

    return charges;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

function validateReferralMoney(value, fieldName) {
  const amount = Number(value);

  if (!Number.isFinite(amount) || amount < 0 || amount > 1000000) {
    const error = new Error(`${fieldName} must be between 0 and 1000000.`);

    error.statusCode = 400;
    throw error;
  }

  return Number(amount.toFixed(2));
}

function normalizeReferralEnabled(value) {
  return (
    value === true ||
    value === 1 ||
    value === "1" ||
    String(value).toLowerCase() === "true"
  );
}

function validateFirstDepositBonusPercent(value) {
  const percent = Number(value);

  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    const error = new Error(
      "First deposit bonus percent must be between 0 and 100.",
    );

    error.statusCode = 400;
    throw error;
  }

  return Number(percent.toFixed(2));
}

async function updateFirstDepositBonusSettings(settings, adminId = null) {
  const values = {
    isEnabled: normalizeReferralEnabled(settings?.isEnabled),

    bonusPercent: validateFirstDepositBonusPercent(settings?.bonusPercent),

    maximumBonus: validateReferralMoney(
      settings?.maximumBonus,
      "Maximum first deposit bonus",
    ),

    minimumDeposit: validateReferralMoney(
      settings?.minimumDeposit,
      "Minimum first deposit",
    ),
  };

  await pool.query(
    `
    INSERT INTO first_deposit_bonus_settings (
      id,
      is_enabled,
      bonus_percent,
      maximum_bonus,
      minimum_deposit,
      updated_by
    )
    VALUES (
      1,
      ?,
      ?,
      ?,
      ?,
      ?
    )
    ON DUPLICATE KEY UPDATE
      is_enabled =
        VALUES(is_enabled),

      bonus_percent =
        VALUES(bonus_percent),

      maximum_bonus =
        VALUES(maximum_bonus),

      minimum_deposit =
        VALUES(minimum_deposit),

      updated_by =
        VALUES(updated_by)
    `,
    [
      values.isEnabled ? 1 : 0,
      values.bonusPercent,
      values.maximumBonus,
      values.minimumDeposit,
      adminId,
    ],
  );

  return values;
}

async function updateSignupBonusSettings(settings, adminId = null) {
  const values = {
    isEnabled: normalizeReferralEnabled(settings?.isEnabled),

    bonusAmount: validateReferralMoney(
      settings?.bonusAmount,
      "Signup bonus amount",
    ),
  };

  await pool.query(
    `
    INSERT INTO signup_bonus_settings (
      id,
      is_enabled,
      bonus_amount,
      updated_by
    )
    VALUES (
      1,
      ?,
      ?,
      ?
    )
    ON DUPLICATE KEY UPDATE
      is_enabled = VALUES(is_enabled),
      bonus_amount = VALUES(bonus_amount),
      updated_by = VALUES(updated_by)
    `,
    [
      values.isEnabled ? 1 : 0,
      values.bonusAmount,
      adminId,
    ],
  );

  return values;
}

async function updateWithdrawSettings(settings, adminId = null) {
  const minimumWithdrawAmount = Number(
    settings?.minimumWithdrawAmount,
  );

  if (
    !Number.isFinite(minimumWithdrawAmount) ||
    minimumWithdrawAmount < 1 ||
    minimumWithdrawAmount > 1000000
  ) {
    const error = new Error(
      "Minimum withdrawal amount must be between 1 and 1000000.",
    );

    error.statusCode = 400;
    throw error;
  }

  const values = {
    minimumWithdrawAmount: Number(
      minimumWithdrawAmount.toFixed(2),
    ),
  };

  await pool.query(
    `
    INSERT INTO withdraw_settings (
      id,
      minimum_withdraw_amount,
      updated_by
    )
    VALUES (
      1,
      ?,
      ?
    )
    ON DUPLICATE KEY UPDATE
      minimum_withdraw_amount =
        VALUES(minimum_withdraw_amount),

      updated_by =
        VALUES(updated_by)
    `,
    [
      values.minimumWithdrawAmount,
      adminId,
    ],
  );

  return values;
}

async function updateReferralSettings(settings, adminId = null) {
  const values = {
    isEnabled: normalizeReferralEnabled(settings?.isEnabled),

    referrerBonus: validateReferralMoney(
      settings?.referrerBonus,
      "Referrer bonus",
    ),

    referredUserBonus: validateReferralMoney(
      settings?.referredUserBonus,
      "Referred user bonus",
    ),

    minimumFirstDeposit: validateReferralMoney(
      settings?.minimumFirstDeposit,
      "Minimum first deposit",
    ),
  };

  await pool.query(
    `
    INSERT INTO referral_settings (
      id,
      is_enabled,
      referrer_bonus,
      referred_user_bonus,
      minimum_first_deposit,
      updated_by
    )
    VALUES (
      1,
      ?,
      ?,
      ?,
      ?,
      ?
    )
    ON DUPLICATE KEY UPDATE
      is_enabled =
        VALUES(is_enabled),

      referrer_bonus =
        VALUES(referrer_bonus),

      referred_user_bonus =
        VALUES(referred_user_bonus),

      minimum_first_deposit =
        VALUES(
          minimum_first_deposit
        ),

      updated_by =
        VALUES(updated_by)
    `,
    [
      values.isEnabled ? 1 : 0,
      values.referrerBonus,
      values.referredUserBonus,
      values.minimumFirstDeposit,
      adminId,
    ],
  );

  return values;
}

module.exports = {
  getDashboardStats,
  updateServiceCharges,
  updateSignupBonusSettings,
  updateWithdrawSettings,
  updateFirstDepositBonusSettings,
  updateReferralSettings,
};