"use strict";

const {
  pool,
} = require("../config/database");

const sportsApiService =
  require("./sports-api.service");

/* =========================
   Helpers
========================= */

function toArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function firstValue(...values) {
  return values.find(
    (value) =>
      value !== undefined &&
      value !== null &&
      value !== "",
  );
}

function normalizeText(
  value,
  fallback = "",
) {
  return String(
    value ?? fallback,
  ).trim();
}

function americanToDecimal(value) {
  const americanOdds =
    Number(value);

  if (
    !Number.isFinite(
      americanOdds,
    ) ||
    americanOdds === 0
  ) {
    return null;
  }

  if (americanOdds > 0) {
    return (
      1 +
      americanOdds / 100
    );
  }

  return (
    1 +
    100 /
      Math.abs(americanOdds)
  );
}

function normalizeEventStatus(
  value,
) {
  const status =
    normalizeText(value)
      .toLowerCase();

  if (
    status.includes("cancel") ||
    status.includes("abandon")
  ) {
    return "cancelled";
  }

  if (
    status.includes("postpon")
  ) {
    return "postponed";
  }

  if (
    status.includes("final") ||
    status.includes("complete") ||
    status.includes("ended") ||
    status.includes("full_time")
  ) {
    return "completed";
  }

  if (
    status.includes("live") ||
    status.includes("progress") ||
    status.includes("quarter") ||
    status.includes("half") ||
    status.includes("inning") ||
    status.includes("period")
  ) {
    return "live";
  }

  return "scheduled";
}

function extractEvents(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  return toArray(
    firstValue(
      payload?.events,
      payload?.data?.events,
      payload?.data,
    ),
  );
}

function extractTeams(event) {
  const teams =
    toArray(
      firstValue(
        event.teams_normalized,
        event.teams,
        event.participants,
      ),
    );

  const homeTeam =
    teams.find(
      (team) =>
        team.is_home === true ||
        normalizeText(
          team.qualifier,
        ).toLowerCase() ===
          "home",
    );

  const awayTeam =
    teams.find(
      (team) =>
        team.is_home === false ||
        normalizeText(
          team.qualifier,
        ).toLowerCase() ===
          "away",
    );

  return {
    home:
      normalizeText(
        firstValue(
          event.home_team,
          event.home?.name,
          homeTeam?.name,
          teams[0]?.name,
        ),
      ),

    away:
      normalizeText(
        firstValue(
          event.away_team,
          event.away?.name,
          awayTeam?.name,
          teams[1]?.name,
        ),
      ),
  };
}

/* =========================
   Extract Market Selections
========================= */
function extractSelections(
  market,
) {
  const selections = [];

  const participants =
    toArray(
      market.participants,
    );

  participants.forEach(
    (participant) => {
      const participantId =
        normalizeText(
          participant.id,
        );

      const participantName =
        normalizeText(
          participant.name,
          `Selection ${participantId}`,
        );

      const lines =
        toArray(
          participant.lines,
        );

      lines.forEach((line) => {
        const lineId =
          normalizeText(
            line.id,
          );

        if (
          !participantId ||
          !lineId
        ) {
          return;
        }

        const pricesObject =
          line.prices &&
          typeof line.prices ===
            "object" &&
          !Array.isArray(
            line.prices,
          )
            ? line.prices
            : {};

        const availablePrices =
          Object.entries(
            pricesObject,
          )
            .map(
              ([
                affiliateId,
                priceObject,
              ]) => {
                const americanOdds =
                  Number(
                    priceObject
                      ?.price,
                  );

                if (
                  !Number.isFinite(
                    americanOdds,
                  ) ||
                  americanOdds ===
                    0.0001 ||
                  americanOdds === 0
                ) {
                  return null;
                }

                const decimalOdds =
                  americanToDecimal(
                    americanOdds,
                  );

                if (
                  !Number.isFinite(
                    decimalOdds,
                  ) ||
                  decimalOdds <= 1
                ) {
                  return null;
                }

                return {
                  affiliateId:
                    String(
                      affiliateId,
                    ),

                  americanOdds:
                    Math.trunc(
                      americanOdds,
                    ),

                  decimalOdds:
                    Number(
                      decimalOdds
                        .toFixed(4),
                    ),

                  updatedAt:
                    priceObject
                      ?.updated_at ||
                    null,
                };
              },
            )
            .filter(Boolean);

        if (
          availablePrices.length ===
          0
        ) {
          return;
        }

        /*
         * একই selection-এর জন্য একাধিক
         * sportsbook থাকলে user-কে সবচেয়ে
         * ভালো decimal odds দেওয়া হবে।
         */
        availablePrices.sort(
          (firstPrice, secondPrice) =>
            secondPrice
              .decimalOdds -
            firstPrice
              .decimalOdds,
        );

        const selectedPrice =
          availablePrices[0];

        const lineValue =
          normalizeText(
            line.value,
          );

        const selectionName =
          lineValue
            ? `${participantName} ${lineValue}`
            : participantName;

        selections.push({
          id:
            `${participantId}:${lineId}`
              .slice(0, 100),

          name:
            selectionName,

          affiliateId:
            selectedPrice
              .affiliateId,

          americanOdds:
            selectedPrice
              .americanOdds,

          decimalOdds:
            selectedPrice
              .decimalOdds,

          updatedAt:
            selectedPrice
              .updatedAt,

          status:
            "open",
        });
      });
    },
  );

  return selections;
}


/* =========================
   Sync Events
========================= */

async function syncSportsEvents({
  sportId,
  sportName,
  date,
  affiliateIds,
  marketIds,
}) {
  const apiResult =
    await sportsApiService
      .getEventsBySportAndDate(
        sportId,
        date,
        {
          affiliateIds,
          marketIds,

          mainLine: true,
        },
      );

  const events =
    extractEvents(apiResult);

  const connection =
    await pool.getConnection();

  let syncedEvents = 0;
  let syncedMarkets = 0;
  let syncedSelections = 0;

  try {
    await connection.beginTransaction();

    for (
      const event of events
    ) {
      const providerEventId =
        normalizeText(
          firstValue(
            event.event_id,
            event.id,
          ),
        );

      if (!providerEventId) {
        continue;
      }

      const teams =
        extractTeams(event);

      const generatedEventName =
        teams.home &&
        teams.away
          ? `${teams.home} vs ${teams.away}`
          : providerEventId;

     const eventName =
  normalizeText(
    firstValue(
      event.schedule
        ?.event_name,
      event.event_name,
      event.name,
      generatedEventName,
    ),
  );

      const startsAtValue =
        firstValue(
          event.event_date,
          event.starts_at,
          event.start_time,
          event.scheduled,
        );

      const startsAt =
        new Date(
          startsAtValue,
        );

      if (
        !Number.isFinite(
          startsAt.getTime(),
        )
      ) {
        continue;
      }

      const eventStatus =
  normalizeEventStatus(
    firstValue(
      event.score?.event_status,
      event.score
        ?.event_status_detail,
      event.event_status,
      event.status,
      event.status_detail,
    ),
  );

      const bettingStatus =
        [
          "completed",
          "cancelled",
          "postponed",
        ].includes(eventStatus)
          ? "closed"
          : "open";

      const rawPayload =
        JSON.stringify(event);

      await connection.query(
        `
          INSERT INTO sports_events (
            provider,
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

            raw_payload,
            last_synced_at
          )

          VALUES (
            'therundown',
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
            NOW(3)
          )

          ON DUPLICATE KEY UPDATE
            sport_name =
              VALUES(sport_name),

            event_name =
              VALUES(event_name),

            home_team =
              VALUES(home_team),

            away_team =
              VALUES(away_team),

            starts_at =
              VALUES(starts_at),

            event_status =
              VALUES(event_status),

            betting_status =
              IF(
                betting_status IN (
                  'settled',
                  'refunded'
                ),

                betting_status,

                VALUES(
                  betting_status
                )
              ),

            home_score =
              VALUES(home_score),

            away_score =
              VALUES(away_score),

            raw_payload =
              VALUES(raw_payload),

            last_synced_at =
              NOW(3)
        `,
        [
          providerEventId,
          Number(sportId),

          normalizeText(
            sportName,
            `Sport ${sportId}`,
          ),

          eventName,

          teams.home || null,
          teams.away || null,
          startsAt,

          eventStatus,
          bettingStatus,

         firstValue(
  event.score
    ?.score_home,
  event.home_score,
  event.score?.home,
  null,
),

firstValue(
  event.score
    ?.score_away,
  event.away_score,
  event.score?.away,
  null,
),

          rawPayload,
        ],
      );

      const [eventRows] =
        await connection.query(
          `
            SELECT id

            FROM sports_events

            WHERE provider =
              'therundown'
              AND provider_event_id = ?

            LIMIT 1
          `,
          [
            providerEventId,
          ],
        );

      const localEvent =
        eventRows[0];

      if (!localEvent) {
        continue;
      }

      const localEventId =
        Number(localEvent.id);

      syncedEvents += 1;

      const markets =
        toArray(
          firstValue(
            event.markets,
            event.lines,
          ),
        );

      for (
        const market of markets
      ) {
       const providerMarketId =
  normalizeText(
    firstValue(
      market.id,
      market.market_id,
      market.type_id,
    ),
  );

        if (!providerMarketId) {
          continue;
        }

        const marketName =
          normalizeText(
            firstValue(
              market.name,
              market.market_name,
              market.type,
              `Market ${providerMarketId}`,
            ),
          );

        const marketType =
  normalizeText(
    firstValue(
      market.market_id,
      market.market_type,
      market.type,
      "unknown",
    ),
  );

        const rawMarketStatus =
          normalizeText(
            market.status,
          ).toLowerCase();

        const marketStatus =
          rawMarketStatus.includes(
            "closed",
          ) ||
          rawMarketStatus.includes(
            "suspend",
          )
            ? "suspended"
            : "open";

        await connection.query(
          `
            INSERT INTO sports_markets (
              event_id,
              provider_market_id,
              market_type,
              market_name,
              period_name,
              market_status,
              line_value
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

            ON DUPLICATE KEY UPDATE
              market_type =
                VALUES(market_type),

              market_name =
                VALUES(market_name),

              period_name =
                VALUES(period_name),

              market_status =
                VALUES(market_status),

              line_value =
                VALUES(line_value)
          `,
          [
            localEventId,
            providerMarketId,

            marketType.slice(
              0,
              80,
            ),

            marketName.slice(
              0,
              180,
            ),

            normalizeText(
              firstValue(
                market.period_name,
                market.period,
              ),
            ) || null,

            marketStatus,

            firstValue(
              market.line_value,
              market.line,
              null,
            ),
          ],
        );

        const [marketRows] =
          await connection.query(
            `
              SELECT id

              FROM sports_markets

              WHERE event_id = ?
                AND provider_market_id = ?

              LIMIT 1
            `,
            [
              localEventId,
              providerMarketId,
            ],
          );

        const localMarket =
          marketRows[0];

        if (!localMarket) {
          continue;
        }

        const localMarketId =
          Number(localMarket.id);

        syncedMarkets += 1;

        const selections =
          extractSelections(
            market,
          );

        for (
          const selection
          of selections
        ) {
          const rawSelectionStatus =
            normalizeText(
              selection.status,
            ).toLowerCase();

          const selectionStatus =
            rawSelectionStatus.includes(
              "closed",
            ) ||
            rawSelectionStatus.includes(
              "suspend",
            )
              ? "suspended"
              : "open";

          const providerUpdatedAt =
            selection.updatedAt
              ? new Date(
                  selection.updatedAt,
                )
              : null;

          const oddsUpdatedAt =
            providerUpdatedAt &&
            Number.isFinite(
              providerUpdatedAt
                .getTime(),
            )
              ? providerUpdatedAt
              : new Date();

          await connection.query(
            `
              INSERT INTO sports_selections (
                market_id,
                provider_selection_id,
                affiliate_id,
                selection_name,

                american_odds,
                decimal_odds,
                odds_updated_at,

                selection_status,
                last_synced_at
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
                NOW(3)
              )

              ON DUPLICATE KEY UPDATE
                affiliate_id =
                  VALUES(affiliate_id),

                selection_name =
                  VALUES(selection_name),

                american_odds =
                  VALUES(american_odds),

                decimal_odds =
                  VALUES(decimal_odds),

                odds_updated_at =
                  VALUES(
                    odds_updated_at
                  ),

                selection_status =
                  VALUES(
                    selection_status
                  ),

                last_synced_at =
                  NOW(3)
            `,
            [
              localMarketId,

              selection.id.slice(
                0,
                100,
              ),

              selection.affiliateId,

              selection.name.slice(
                0,
                180,
              ),

              selection.americanOdds,
              selection.decimalOdds,
              oddsUpdatedAt,
              selectionStatus,
            ],
          );

          syncedSelections += 1;
        }
      }
    }

    await connection.commit();

    return {
      events:
        syncedEvents,

      markets:
        syncedMarkets,

      selections:
        syncedSelections,
    };
  } catch (error) {
    await connection.rollback();

    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  syncSportsEvents,
};