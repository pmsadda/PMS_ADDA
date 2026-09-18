"use strict";

const crypto = require("crypto");

const {
  pool,
} = require("../config/database");

/* =========================
   Helpers
========================= */

function createSportsError(
  message,
  statusCode = 400,
  code = "SPORTS_ERROR",
) {
  const error = new Error(message);

  error.statusCode = statusCode;
  error.code = code;

  return error;
}

function normalizeMoney(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return 0;
  }

  return Number(amount.toFixed(2));
}

function parsePositiveInteger(
  value,
  fieldName,
) {
  const parsedValue =
    Number.parseInt(value, 10);

  if (
    !Number.isSafeInteger(parsedValue) ||
    parsedValue < 1
  ) {
    throw createSportsError(
      `${fieldName} সঠিক নয়।`,
      400,
      `INVALID_${fieldName.toUpperCase()}`,
    );
  }

  return parsedValue;
}

function createReference(prefix) {
  return (
    `${prefix}-${Date.now()}-` +
    crypto
      .randomBytes(4)
      .toString("hex")
  ).toUpperCase();
}

/* =========================
   Sports Settings
========================= */

async function getSportsSettings(
  executor = pool,
) {
  const [rows] =
    await executor.query(
      `
        SELECT
          id,
          betting_enabled,
          live_betting_enabled,
          min_bet,
          max_bet,
          max_payout,
          betting_close_seconds,
          odds_refresh_seconds,
          max_odds_age_seconds,
          updated_at
        FROM sports_settings
        WHERE id = 1
        LIMIT 1
      `,
    );

  const settings = rows[0];

  if (!settings) {
    throw createSportsError(
      "Sports settings পাওয়া যায়নি।",
      500,
      "SPORTS_SETTINGS_NOT_FOUND",
    );
  }

  return {
    id: Number(settings.id),

    bettingEnabled:
      Boolean(settings.betting_enabled),

    liveBettingEnabled:
      Boolean(
        settings.live_betting_enabled,
      ),

    minBet:
      normalizeMoney(settings.min_bet),

    maxBet:
      normalizeMoney(settings.max_bet),

    maxPayout:
      normalizeMoney(settings.max_payout),

    bettingCloseSeconds:
      Number(
        settings.betting_close_seconds,
      ),

    oddsRefreshSeconds:
      Number(
        settings.odds_refresh_seconds,
      ),

    maxOddsAgeSeconds:
      Number(
        settings.max_odds_age_seconds,
      ),

    updatedAt:
      settings.updated_at,
  };
}

/* =========================
   Events And Markets
========================= */

async function getSportsEvents({
  sportId,
  date,
}) {
  const validSportId =
    parsePositiveInteger(
      sportId,
      "sport_id",
    );

  const normalizedDate =
    String(date || "").trim();

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      normalizedDate,
    )
  ) {
    throw createSportsError(
      "Date YYYY-MM-DD format-এ দিন।",
      400,
      "INVALID_SPORTS_DATE",
    );
  }

  const [eventRows] =
    await pool.query(
      `
        SELECT
          id,
          provider_event_id,
          sport_id,
          sport_name,
          event_name,
          home_team,
          away_team,
          starts_at,
          event_status,
          betting_status,
          home_score,
          away_score,
          last_synced_at
        FROM sports_events
        WHERE sport_id = ?
          AND DATE(starts_at) = ?
        ORDER BY starts_at ASC
      `,
      [
        validSportId,
        normalizedDate,
      ],
    );

  if (eventRows.length === 0) {
    return [];
  }

  const eventIds =
    eventRows.map(
      (event) => Number(event.id),
    );

  const placeholders =
    eventIds
      .map(() => "?")
      .join(",");

  const [marketRows] =
    await pool.query(
      `
        SELECT
          market.id AS market_id,
          market.event_id,
          market.provider_market_id,
          market.market_type,
          market.market_name,
          market.period_name,
          market.market_status,
          market.line_value,

          selection.id AS selection_id,
          selection.provider_selection_id,
          selection.affiliate_id,
          selection.selection_name,
          selection.american_odds,
          selection.decimal_odds,
          selection.odds_updated_at,
          selection.selection_status

        FROM sports_markets AS market

        LEFT JOIN sports_selections
          AS selection
          ON selection.market_id =
            market.id

        WHERE market.event_id IN (
          ${placeholders}
        )

        ORDER BY
          market.event_id ASC,
          market.id ASC,
          selection.id ASC
      `,
      eventIds,
    );

  const eventMap = new Map();

  eventRows.forEach((event) => {
    eventMap.set(
      Number(event.id),
      {
        id:
          Number(event.id),

        providerEventId:
          event.provider_event_id,

        sportId:
          Number(event.sport_id),

        sportName:
          event.sport_name,

        eventName:
          event.event_name,

        homeTeam:
          event.home_team,

        awayTeam:
          event.away_team,

        startsAt:
          event.starts_at,

        eventStatus:
          event.event_status,

        bettingStatus:
          event.betting_status,

        homeScore:
          event.home_score,

        awayScore:
          event.away_score,

        lastSyncedAt:
          event.last_synced_at,

        markets: [],
      },
    );
  });

  const marketMap = new Map();

  marketRows.forEach((row) => {
    const event =
      eventMap.get(
        Number(row.event_id),
      );

    if (!event) {
      return;
    }

    const marketId =
      Number(row.market_id);

    let market =
      marketMap.get(marketId);

    if (!market) {
      market = {
        id: marketId,

        providerMarketId:
          row.provider_market_id,

        marketType:
          row.market_type,

        marketName:
          row.market_name,

        periodName:
          row.period_name,

        status:
          row.market_status,

        lineValue:
          row.line_value === null
            ? null
            : Number(
                row.line_value,
              ),

        selections: [],
      };

      marketMap.set(
        marketId,
        market,
      );

      event.markets.push(market);
    }

    if (!row.selection_id) {
      return;
    }

    market.selections.push({
      id:
        Number(row.selection_id),

      providerSelectionId:
        row.provider_selection_id,

      affiliateId:
        row.affiliate_id,

      name:
        row.selection_name,

      americanOdds:
        row.american_odds === null
          ? null
          : Number(
              row.american_odds,
            ),

      decimalOdds:
        Number(row.decimal_odds),

      oddsUpdatedAt:
        row.odds_updated_at,

      status:
        row.selection_status,
    });
  });

  return Array.from(
    eventMap.values(),
  );
}

/* =========================
   Place Sports Bet
========================= */

async function placeSportsBet({
  userId,
  selectionId,
  stakeAmount,
}) {
  const validUserId =
    parsePositiveInteger(
      userId,
      "user_id",
    );

  const validSelectionId =
    parsePositiveInteger(
      selectionId,
      "selection_id",
    );

  const stake =
    normalizeMoney(stakeAmount);

  if (stake <= 0) {
    throw createSportsError(
      "Bet amount সঠিক নয়।",
      400,
      "INVALID_BET_AMOUNT",
    );
  }

  const connection =
    await pool.getConnection();

  try {
    await connection.beginTransaction();

    const settings =
      await getSportsSettings(
        connection,
      );

    if (!settings.bettingEnabled) {
      throw createSportsError(
        "Sports betting এখন বন্ধ আছে।",
        403,
        "SPORTS_BETTING_DISABLED",
      );
    }

    if (
      stake < settings.minBet ||
      stake > settings.maxBet
    ) {
      throw createSportsError(
        `Bet amount ৳${settings.minBet} থেকে ৳${settings.maxBet} হতে হবে।`,
        400,
        "SPORTS_BET_LIMIT",
      );
    }

    const [selectionRows] =
      await connection.query(
        `
          SELECT
            selection.id,
            selection.selection_name,
            selection.decimal_odds,
            selection.odds_updated_at,
            selection.selection_status,

            market.id AS market_id,
            market.market_name,
            market.market_status,

            event.id AS event_id,
            event.provider_event_id,
            event.event_name,
            event.starts_at,
            event.event_status,
            event.betting_status

          FROM sports_selections
            AS selection

          INNER JOIN sports_markets
            AS market
            ON market.id =
              selection.market_id

          INNER JOIN sports_events
            AS event
            ON event.id =
              market.event_id

          WHERE selection.id = ?

          LIMIT 1

          FOR UPDATE
        `,
        [
          validSelectionId,
        ],
      );

    const selection =
      selectionRows[0];

    if (!selection) {
      throw createSportsError(
        "Selection পাওয়া যায়নি।",
        404,
        "SPORTS_SELECTION_NOT_FOUND",
      );
    }

    if (
      selection.selection_status !==
        "open" ||
      selection.market_status !==
        "open" ||
      selection.betting_status !==
        "open"
    ) {
      throw createSportsError(
        "এই betting option এখন বন্ধ আছে।",
        409,
        "SPORTS_SELECTION_CLOSED",
      );
    }

    const matchStartTime =
      new Date(
        selection.starts_at,
      ).getTime();

    const isLive =
      selection.event_status ===
        "live" ||
      matchStartTime <= Date.now();

    if (
      isLive &&
      !settings.liveBettingEnabled
    ) {
      throw createSportsError(
        "Live betting এখন বন্ধ আছে।",
        409,
        "SPORTS_LIVE_BETTING_DISABLED",
      );
    }

    if (
      !isLive &&
      settings.bettingCloseSeconds > 0
    ) {
      const bettingClosesAt =
        matchStartTime -
        settings
          .bettingCloseSeconds *
          1000;

      if (
        Date.now() >= bettingClosesAt
      ) {
        throw createSportsError(
          "এই match-এর pre-match betting বন্ধ হয়েছে।",
          409,
          "SPORTS_BETTING_CLOSED",
        );
      }
    }

    const oddsUpdatedAt =
      selection.odds_updated_at
        ? new Date(
            selection.odds_updated_at,
          ).getTime()
        : 0;

    const maximumOddsAge =
      settings.maxOddsAgeSeconds *
      1000;

    if (
      !oddsUpdatedAt ||
      Date.now() - oddsUpdatedAt >
        maximumOddsAge
    ) {
      throw createSportsError(
        "Odds পুরোনো হয়েছে। Refresh করে আবার চেষ্টা করুন।",
        409,
        "SPORTS_ODDS_STALE",
      );
    }

    const decimalOdds =
      Number(
        selection.decimal_odds,
      );

    if (
      !Number.isFinite(
        decimalOdds,
      ) ||
      decimalOdds <= 1
    ) {
      throw createSportsError(
        "Odds সঠিক নয়।",
        409,
        "SPORTS_ODDS_INVALID",
      );
    }

    const potentialPayout =
      Math.min(
        normalizeMoney(
          stake * decimalOdds,
        ),
        settings.maxPayout,
      );

    const [userRows] =
      await connection.query(
        `
          SELECT
            id,
            account_status,
            wallet_balance

          FROM users

          WHERE id = ?

          LIMIT 1

          FOR UPDATE
        `,
        [
          validUserId,
        ],
      );

    const user = userRows[0];

    if (
      !user ||
      user.account_status !== "active"
    ) {
      throw createSportsError(
        "Active user পাওয়া যায়নি।",
        403,
        "SPORTS_USER_INACTIVE",
      );
    }

    const balanceBefore =
      normalizeMoney(
        user.wallet_balance,
      );

    if (balanceBefore < stake) {
      throw createSportsError(
        "Wallet balance যথেষ্ট নয়।",
        409,
        "SPORTS_BALANCE_INSUFFICIENT",
      );
    }

    const balanceAfter =
      normalizeMoney(
        balanceBefore - stake,
      );

    const betCode =
      createReference("SPB");

    const transactionId =
      createReference("SPD");

    const [walletResult] =
      await connection.query(
        `
          UPDATE users
          SET
            wallet_balance =
              wallet_balance - ?,

            turnover_amount =
              turnover_amount + ?

          WHERE id = ?
            AND account_status =
              'active'
            AND wallet_balance >= ?
        `,
        [
          stake,
          stake,
          validUserId,
          stake,
        ],
      );

    if (
      walletResult.affectedRows !== 1
    ) {
      throw createSportsError(
        "Wallet debit ব্যর্থ হয়েছে।",
        409,
        "SPORTS_WALLET_DEBIT_FAILED",
      );
    }

    const [betResult] =
      await connection.query(
        `
          INSERT INTO sports_bets (
            bet_code,
            user_id,
            event_id,
            market_id,
            selection_id,
            provider_event_id,

            event_name_snapshot,
            market_name_snapshot,
            selection_name_snapshot,

            decimal_odds_snapshot,
            odds_updated_at_snapshot,

            stake_amount,
            potential_payout,
            payout_amount,

            bet_status,

            balance_before,
            balance_after_bet,

            wallet_transaction_id
          )

          VALUES (
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,

            ?,
            ?,
            ?,

            ?,
            ?,

            ?,
            ?,
            0,

            'pending',

            ?,
            ?,

            ?
          )
        `,
        [
          betCode,
          validUserId,
          selection.event_id,
          selection.market_id,
          validSelectionId,
          selection.provider_event_id,

          selection.event_name,
          selection.market_name,
          selection.selection_name,

          decimalOdds,
          selection.odds_updated_at,

          stake,
          potentialPayout,

          balanceBefore,
          balanceAfter,

          transactionId,
        ],
      );

    await connection.query(
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
          description
        )

        VALUES (
          ?,
          ?,
          'game_loss',
          'debit',
          ?,

          ?,
          ?,

          'completed',
          'sports_bet',
          ?,
          ?
        )
      `,
      [
        transactionId,
        validUserId,
        stake,

        balanceBefore,
        balanceAfter,

        betCode,

        `Sports bet ${betCode}: ${selection.event_name}`,
      ],
    );

    await connection.commit();

    return {
      id:
        Number(
          betResult.insertId,
        ),

      betCode,

      selectionId:
        validSelectionId,

      stakeAmount:
        stake,

      decimalOdds,

      potentialPayout,

      balanceBefore,

      balanceAfter,

      status:
        "pending",
    };
  } catch (error) {
    await connection.rollback();

    throw error;
  } finally {
    connection.release();
  }
}

/* =========================
   User Bet History
========================= */

async function getSportsBetHistory({
  userId,
  limit = 50,
}) {
  const validUserId =
    parsePositiveInteger(
      userId,
      "user_id",
    );

  const safeLimit =
    Math.min(
      Math.max(
        Number.parseInt(
          limit,
          10,
        ) || 50,
        1,
      ),
      100,
    );

  const [rows] =
    await pool.query(
      `
        SELECT
          id,
          bet_code,
          event_name_snapshot,
          market_name_snapshot,
          selection_name_snapshot,
          decimal_odds_snapshot,
          stake_amount,
          potential_payout,
          payout_amount,
          bet_status,
          placed_at,
          settled_at,
          settlement_note

        FROM sports_bets

        WHERE user_id = ?

        ORDER BY id DESC

        LIMIT ?
      `,
      [
        validUserId,
        safeLimit,
      ],
    );

  return rows.map((row) => ({
    id:
      Number(row.id),

    betCode:
      row.bet_code,

    eventName:
      row.event_name_snapshot,

    marketName:
      row.market_name_snapshot,

    selectionName:
      row.selection_name_snapshot,

    decimalOdds:
      Number(
        row.decimal_odds_snapshot,
      ),

    stakeAmount:
      normalizeMoney(
        row.stake_amount,
      ),

    potentialPayout:
      normalizeMoney(
        row.potential_payout,
      ),

    payoutAmount:
      normalizeMoney(
        row.payout_amount,
      ),

    status:
      row.bet_status,

    placedAt:
      row.placed_at,

    settledAt:
      row.settled_at,

    settlementNote:
      row.settlement_note,
  }));
}

module.exports = {
  getSportsSettings,
  getSportsEvents,
  placeSportsBet,
  getSportsBetHistory,
};