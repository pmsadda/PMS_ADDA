"use strict";

const {
  pool
} = require(
  "../config/database"
);

function cleanText(
  value,
  maximumLength,
  fallback = null
) {
  const cleaned =
    String(
      value || ""
    )
      .trim()
      .slice(
        0,
        maximumLength
      );

  return cleaned ||
    fallback;
}

function cleanTrackingId(
  value
) {
  const cleaned =
    String(
      value || ""
    ).trim();

  if (
    !/^[a-zA-Z0-9_-]{16,64}$/.test(
      cleaned
    )
  ) {
    return null;
  }

  return cleaned;
}

function normalizeSource(
  value
) {
  return (
    cleanText(
      value,
      100,
      "direct"
    )
      .toLowerCase()
      .replace(
        /[^a-z0-9._-]/g,
        "_"
      )
  );
}

async function recordTrafficVisit(
  input = {}
) {
  const visitorId =
    cleanTrackingId(
      input.visitorId
    );

  const sessionId =
    cleanTrackingId(
      input.sessionId
    );

  if (
    !visitorId ||
    !sessionId
  ) {
    const error =
      new Error(
        "Invalid visitor tracking identity."
      );

    error.statusCode = 400;
    error.code =
      "INVALID_TRAFFIC_ID";

    throw error;
  }

  const trafficSource =
    normalizeSource(
      input.trafficSource
    );

  const trafficMedium =
    cleanText(
      input.trafficMedium,
      100
    );

  const campaign =
    cleanText(
      input.campaign,
      150
    );

  const contentName =
    cleanText(
      input.contentName,
      150
    );

  const termName =
    cleanText(
      input.termName,
      150
    );

  const landingUrl =
    cleanText(
      input.landingUrl,
      1000
    );

  const referrerUrl =
    cleanText(
      input.referrerUrl,
      1000
    );

  const ipAddress =
    cleanText(
      input.ipAddress,
      45
    );

  const userAgent =
    cleanText(
      input.userAgent,
      2000
    );

  await pool.query(
    `
      INSERT INTO marketing_traffic_visits (
        visitor_id,
        session_id,
        traffic_source,
        traffic_medium,
        campaign,
        content_name,
        term_name,
        landing_url,
        referrer_url,
        ip_address,
        user_agent,
        visit_count,
        first_visited_at,
        last_visited_at
      )
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        1,
        NOW(3),
        NOW(3)
      )
      ON DUPLICATE KEY UPDATE
        last_visited_at =
          NOW(3),
        visit_count =
          visit_count + 1,
        ip_address =
          VALUES(ip_address),
        user_agent =
          VALUES(user_agent)
    `,
    [
      visitorId,
      sessionId,
      trafficSource,
      trafficMedium,
      campaign,
      contentName,
      termName,
      landingUrl,
      referrerUrl,
      ipAddress,
      userAgent
    ]
  );

  return {
    visitorId,
    sessionId,
    trafficSource
  };
}

async function associateTrafficUser(
  visitorIdValue,
  userIdValue
) {
  const visitorId =
    cleanTrackingId(
      visitorIdValue
    );

  const userId =
    Number.parseInt(
      userIdValue,
      10
    );

  if (
    !visitorId ||
    !Number.isInteger(userId) ||
    userId < 1
  ) {
    return false;
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
            uid,
            username,
            created_at
          FROM users
          WHERE id = ?
          LIMIT 1
        `,
        [
          userId
        ]
      );

    const user =
      userRows[0] ||
      null;

    if (!user) {
      await connection.rollback();
      return false;
    }

    const [visitRows] =
      await connection.query(
        `
          SELECT
            id,
            first_visited_at
          FROM marketing_traffic_visits
          WHERE visitor_id = ?
          ORDER BY last_visited_at DESC
          LIMIT 1
          FOR UPDATE
        `,
        [
          visitorId
        ]
      );

    const visit =
      visitRows[0] ||
      null;

    if (!visit) {
      await connection.rollback();
      return false;
    }

    const userCreatedAt =
      new Date(
        user.created_at
      ).getTime();

    const firstVisitedAt =
      new Date(
        visit.first_visited_at
      ).getTime();

    const signupCompleted =
      Number.isFinite(
        userCreatedAt
      ) &&
      Number.isFinite(
        firstVisitedAt
      ) &&
      userCreatedAt >=
        firstVisitedAt &&
      userCreatedAt <=
        firstVisitedAt +
          24 * 60 * 60 * 1000;

    await connection.query(
      `
        UPDATE marketing_traffic_visits
        SET
          user_id = ?,
          user_uid = ?,
          username = ?,
          signup_completed = ?,
          signup_completed_at =
            CASE
              WHEN ? = 1
              THEN COALESCE(
                signup_completed_at,
                ?
              )
              ELSE signup_completed_at
            END
        WHERE id = ?
      `,
      [
        Number(user.id),
        user.uid ||
          null,
        user.username ||
          null,
        signupCompleted
          ? 1
          : 0,
        signupCompleted
          ? 1
          : 0,
        signupCompleted
          ? user.created_at
          : null,
        Number(visit.id)
      ]
    );

    await connection.commit();

    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function recordTrafficDownload(
  visitorIdValue
) {
  const visitorId =
    cleanTrackingId(
      visitorIdValue
    );

  if (!visitorId) {
    return false;
  }

  const [visitRows] =
    await pool.query(
      `
        SELECT id
        FROM marketing_traffic_visits
        WHERE visitor_id = ?
        ORDER BY last_visited_at DESC
        LIMIT 1
      `,
      [
        visitorId
      ]
    );

  const visitId =
    Number(
      visitRows[0]?.id ||
      0
    );

  if (visitId < 1) {
    return false;
  }

  await pool.query(
    `
      UPDATE marketing_traffic_visits
      SET
        app_download_count =
          app_download_count + 1,
        last_app_downloaded_at =
          NOW(3)
      WHERE id = ?
    `,
    [
      visitId
    ]
  );

  return true;
}

async function getAdminTrafficHistory(
  options = {}
) {
  const requestedPage =
    Number.parseInt(
      options.page,
      10
    );

  const requestedLimit =
    Number.parseInt(
      options.limit,
      10
    );

  const page =
    Number.isInteger(
      requestedPage
    ) &&
    requestedPage > 0
      ? requestedPage
      : 1;

  const limit =
    Number.isInteger(
      requestedLimit
    )
      ? Math.min(
          Math.max(
            requestedLimit,
            10
          ),
          100
        )
      : 25;

  const offset =
    (page - 1) *
    limit;

  const search =
    cleanText(
      options.search,
      100,
      ""
    );

  const source =
    cleanText(
      options.source,
      100,
      ""
    );

  const conditions = [];
  const values = [];

  if (source) {
    conditions.push(
      "traffic_source = ?"
    );

    values.push(
      normalizeSource(
        source
      )
    );
  }

  if (search) {
    const searchValue =
      `%${search}%`;

    conditions.push(`
      (
        visitor_id LIKE ?
        OR username LIKE ?
        OR user_uid LIKE ?
        OR ip_address LIKE ?
        OR campaign LIKE ?
      )
    `);

    values.push(
      searchValue,
      searchValue,
      searchValue,
      searchValue,
      searchValue
    );
  }

  const whereClause =
    conditions.length
      ? `WHERE ${conditions.join(
          " AND "
        )}`
      : "";

  const [summaryRows] =
    await pool.query(`
      SELECT
        COUNT(*) AS total_sessions,
        COUNT(
          DISTINCT visitor_id
        ) AS unique_visitors,
        COALESCE(
          SUM(visit_count),
          0
        ) AS total_visits,
        COALESCE(
          SUM(signup_completed),
          0
        ) AS total_signups,
        COALESCE(
          SUM(app_download_count),
          0
        ) AS total_downloads
      FROM marketing_traffic_visits
    `);

  const [sourceRows] =
    await pool.query(`
      SELECT
        traffic_source,
        COUNT(
          DISTINCT visitor_id
        ) AS unique_visitors,
        COALESCE(
          SUM(visit_count),
          0
        ) AS total_visits,
        COALESCE(
          SUM(signup_completed),
          0
        ) AS total_signups,
        COALESCE(
          SUM(app_download_count),
          0
        ) AS total_downloads
      FROM marketing_traffic_visits
      GROUP BY traffic_source
      ORDER BY total_visits DESC
    `);

  const [countRows] =
    await pool.query(
      `
        SELECT
          COUNT(*) AS total
        FROM marketing_traffic_visits
        ${whereClause}
      `,
      values
    );

  const [rows] =
    await pool.query(
      `
        SELECT
          id,
          visitor_id,
          session_id,
          user_id,
          user_uid,
          username,
          traffic_source,
          traffic_medium,
          campaign,
          content_name,
          term_name,
          landing_url,
          referrer_url,
          ip_address,
          user_agent,
          visit_count,
          signup_completed,
          signup_completed_at,
          app_download_count,
          last_app_downloaded_at,
          first_visited_at,
          last_visited_at
        FROM marketing_traffic_visits
        ${whereClause}
        ORDER BY last_visited_at DESC
        LIMIT ?
        OFFSET ?
      `,
      [
        ...values,
        limit,
        offset
      ]
    );

  const total =
    Number(
      countRows[0]?.total ||
      0
    );

  const summary =
    summaryRows[0] ||
    {};

  return {
    summary: {
      totalSessions:
        Number(
          summary.total_sessions ||
          0
        ),

      uniqueVisitors:
        Number(
          summary.unique_visitors ||
          0
        ),

      totalVisits:
        Number(
          summary.total_visits ||
          0
        ),

      totalSignups:
        Number(
          summary.total_signups ||
          0
        ),

      totalDownloads:
        Number(
          summary.total_downloads ||
          0
        )
    },

    sources:
      sourceRows.map(
        (row) => ({
          source:
            row.traffic_source,

          uniqueVisitors:
            Number(
              row.unique_visitors ||
              0
            ),

          totalVisits:
            Number(
              row.total_visits ||
              0
            ),

          totalSignups:
            Number(
              row.total_signups ||
              0
            ),

          totalDownloads:
            Number(
              row.total_downloads ||
              0
            )
        })
      ),

    visits:
      rows.map(
        (row) => ({
          id:
            Number(row.id),

          visitorId:
            row.visitor_id,

          sessionId:
            row.session_id,

          userId:
            row.user_id
              ? Number(
                  row.user_id
                )
              : null,

          userUid:
            row.user_uid ||
            null,

          username:
            row.username ||
            "Guest",

          trafficSource:
            row.traffic_source,

          trafficMedium:
            row.traffic_medium ||
            null,

          campaign:
            row.campaign ||
            null,

          contentName:
            row.content_name ||
            null,

          termName:
            row.term_name ||
            null,

          landingUrl:
            row.landing_url ||
            null,

          referrerUrl:
            row.referrer_url ||
            null,

          ipAddress:
            row.ip_address ||
            null,

          userAgent:
            row.user_agent ||
            null,

          visitCount:
            Number(
              row.visit_count ||
              0
            ),

          signupCompleted:
            Number(
              row.signup_completed
            ) === 1,

          signupCompletedAt:
            row.signup_completed_at,

          appDownloadCount:
            Number(
              row.app_download_count ||
              0
            ),

          lastAppDownloadedAt:
            row.last_app_downloaded_at,

          firstVisitedAt:
            row.first_visited_at,

          lastVisitedAt:
            row.last_visited_at
        })
      ),

    pagination: {
      page,
      limit,
      total,

      totalPages:
        Math.max(
          1,
          Math.ceil(
            total / limit
          )
        )
    }
  };
}

module.exports = {
  cleanTrackingId,
  recordTrafficVisit,
  associateTrafficUser,
  recordTrafficDownload,
  getAdminTrafficHistory
};