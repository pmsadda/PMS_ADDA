const { pool } = require(
  "../config/database"
);

async function getDashboardStats() {
  const connection =
    await pool.getConnection();

  try {
    /* =========================
       USER STATISTICS
    ========================= */

    const [userRows] =
      await connection.query(`
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

    const [depositRows] =
      await connection.query(`
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

    const [withdrawRows] =
      await connection.query(`
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
       REVENUE STATISTICS
    ========================= */

    const [revenueRows] =
      await connection.query(`
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

    /* =========================
       ROOM STATISTICS
    ========================= */

    const [roomRows] =
      await connection.query(`
        SELECT
          COUNT(*) AS total_tables,

          COALESCE(
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
            ),
            0
          ) AS active_tables

        FROM game_tables gt

        INNER JOIN game_rooms gr
          ON gr.id = gt.room_id
      `);

    /* =========================
       BOT STATISTICS
    ========================= */

    const [botRows] =
      await connection.query(`
        SELECT
          COUNT(*) AS total_bots,

          COALESCE(
            SUM(
              CASE
                WHEN status = 'active'
                THEN 1
                ELSE 0
              END
            ),
            0
          ) AS enabled_bots,

          COALESCE(
            SUM(wallet_balance),
            0
          ) AS total_bot_balance

        FROM teen_patti_bots
      `);

    const [activeBotRows] =
      await connection.query(`
        SELECT
          COALESCE(
            SUM(
              CASE
                WHEN is_active = 1
                THEN 1
                ELSE 0
              END
            ),
            0
          ) AS active_bots,

          COALESCE(
            SUM(total_win),
            0
          ) AS total_bot_win

        FROM table_bots
      `);

    /* =========================
       SERVICE CHARGE
    ========================= */

    const [chargeRows] =
      await connection.query(`
        SELECT
          COALESCE(
            AVG(
              CASE
                WHEN game_type = 'teen_patti'
                THEN service_charge
                ELSE NULL
              END
            ),
            5
          ) AS teen_patti_charge,

          COALESCE(
            AVG(
              CASE
                WHEN game_type = 'poker'
                THEN service_charge
                ELSE NULL
              END
            ),
            5
          ) AS poker_charge,

          COALESCE(
            AVG(
              CASE
                WHEN game_type = 'ludo'
                THEN service_charge
                ELSE NULL
              END
            ),
            5
          ) AS ludo_charge

        FROM game_rooms

        WHERE status != 'disabled'
      `);

    const userStats =
      userRows[0] || {};

    const depositStats =
      depositRows[0] || {};

    const withdrawStats =
      withdrawRows[0] || {};

    const revenueStats =
      revenueRows[0] || {};

    const roomStats =
      roomRows[0] || {};

    const botStats =
      botRows[0] || {};

    const activeBotStats =
      activeBotRows[0] || {};

    const chargeStats =
      chargeRows[0] || {};

    return {
      users: {
        total: Number(
          userStats.total || 0
        ),

        active: Number(
          userStats.active || 0
        ),

        blocked: Number(
          userStats.blocked || 0
        ),

        online: Number(
          userStats.online || 0
        ),

        totalWalletBalance: Number(
          userStats.total_wallet_balance || 0
        ),

        totalDeposit: Number(
          userStats.users_total_deposit || 0
        ),

        totalWithdraw: Number(
          userStats.users_total_withdraw || 0
        )
      },

      deposits: {
        totalCount: Number(
          depositStats.total_count || 0
        ),

        totalAmount: Number(
          depositStats.total_amount || 0
        ),

        todayAmount: Number(
          depositStats.today_amount || 0
        ),

        pending: {
          count: Number(
            depositStats.pending_count || 0
          ),

          amount: Number(
            depositStats.pending_amount || 0
          )
        },

        approved: {
          count: Number(
            depositStats.approved_count || 0
          ),

          amount: Number(
            depositStats.approved_amount || 0
          )
        },

        rejected: {
          count: Number(
            depositStats.rejected_count || 0
          ),

          amount: Number(
            depositStats.rejected_amount || 0
          )
        }
      },

      withdrawals: {
        totalCount: Number(
          withdrawStats.total_count || 0
        ),

        totalAmount: Number(
          withdrawStats.total_amount || 0
        ),

        todayAmount: Number(
          withdrawStats.today_amount || 0
        ),

        pending: {
          count: Number(
            withdrawStats.pending_count || 0
          ),

          amount: Number(
            withdrawStats.pending_amount || 0
          )
        },

        approved: {
          count: Number(
            withdrawStats.approved_count || 0
          ),

          amount: Number(
            withdrawStats.approved_amount || 0
          )
        },

        rejected: {
          count: Number(
            withdrawStats.rejected_count || 0
          ),

          amount: Number(
            withdrawStats.rejected_amount || 0
          )
        }
      },

      revenue: {
        totalAmount: Number(
          revenueStats.total_revenue || 0
        ),

        todayAmount: Number(
          revenueStats.today_revenue || 0
        ),

        totalRounds: Number(
          revenueStats.total_rounds || 0
        ),

        realPlayerRevenue: Number(
          revenueStats.real_player_revenue || 0
        ),

        botRevenue: Number(
          revenueStats.bot_revenue || 0
        )
      },

      games: {
        teenPatti: {
          revenue: Number(
            revenueStats.total_revenue || 0
          ),

          roundsPlayed: Number(
            revenueStats.total_rounds || 0
          )
        },

        poker: {
          revenue: 0,
          roundsPlayed: 0
        },

        ludo: {
          revenue: 0,
          roundsPlayed: 0
        }
      },

      rooms: {
        total: Number(
          roomStats.total_tables || 0
        ),

        active: Number(
          roomStats.active_tables || 0
        )
      },

      bots: {
        total: Number(
          botStats.total_bots || 0
        ),

        enabled: Number(
          botStats.enabled_bots || 0
        ),

        active: Number(
          activeBotStats.active_bots || 0
        ),

        totalBalance: Number(
          botStats.total_bot_balance || 0
        ),

        gamesPlayed: Number(
          revenueStats.total_rounds || 0
        ),

        winRounds: Number(
          revenueStats.bot_win_rounds || 0
        ),

        revenue: Number(
          revenueStats.bot_revenue || 0
        ),

        totalWin: Number(
          activeBotStats.total_bot_win || 0
        ),

        loss: 0,

        netResult: Number(
          activeBotStats.total_bot_win || 0
        )
      },

      serviceCharges: {
        teenPatti: Number(
          chargeStats.teen_patti_charge || 5
        ),

        poker: Number(
          chargeStats.poker_charge || 5
        ),

        ludo: Number(
          chargeStats.ludo_charge || 5
        )
      },

      recentDeposits: [],

      recentWithdrawals: []
    };
  } finally {
    connection.release();
  }
}

module.exports = {
  getDashboardStats
};