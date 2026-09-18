"use strict";

const sportsApiService =
  require(
    "../services/sports-api.service",
  );

const sportsService =
  require(
    "../services/sports.service",
  );

const sportsSyncService =
  require(
    "../services/sports-sync.service",
  );

/* =========================
   Error Response
========================= */

function sendSportsError(
  response,
  error,
) {
  console.error(
    "SPORTS ERROR:",
    error.code ||
      error.message,
  );

  const requestedStatus =
    Number(error.statusCode);

  const statusCode =
    requestedStatus >= 400 &&
    requestedStatus <= 599
      ? requestedStatus
      : 502;

  return response
    .status(statusCode)
    .json({
      success: false,

      code:
        error.code ||
        "SPORTS_REQUEST_FAILED",

      message:
        statusCode < 500
          ? error.message
          : "Sports data এখন load করা যাচ্ছে না।",
    });
}

/* =========================
   API Sports Catalog
========================= */

async function getSports(
  request,
  response,
) {
  try {
    const result =
      await sportsApiService
        .getSports();

    const sports =
      Array.isArray(result)
        ? result
        : result?.sports || [];

    return response
      .status(200)
      .json({
        success: true,

        data: {
          sports,
        },
      });
  } catch (error) {
    return sendSportsError(
      response,
      error,
    );
  }
}

/* =========================
   API Available Dates
========================= */

async function getDatesBySport(
  request,
  response,
) {
  try {
    const result =
      await sportsApiService
        .getDatesBySport(
          request.params.sportId,
        );

    const dates =
      Array.isArray(result)
        ? result
        : result?.dates || [];

    return response
      .status(200)
      .json({
        success: true,

        data: {
          dates,
        },
      });
  } catch (error) {
    return sendSportsError(
      response,
      error,
    );
  }
}

/* =========================
   Raw Provider Events
========================= */

async function getEventsBySportAndDate(
  request,
  response,
) {
  try {
    const result =
      await sportsApiService
        .getEventsBySportAndDate(
          request.params.sportId,
          request.params.date,
          {
            affiliateIds:
              request.query
                .affiliate_ids,

            marketIds:
              request.query
                .market_ids,

            mainLine:
              request.query
                .main_line !==
              "false",
          },
        );

    return response
      .status(200)
      .json({
        success: true,

        data: result,
      });
  } catch (error) {
    return sendSportsError(
      response,
      error,
    );
  }
}

/* =========================
   Public Sports Settings
========================= */

async function getSportsSettings(
  request,
  response,
) {
  try {
    const settings =
      await sportsService
        .getSportsSettings();

    return response
      .status(200)
      .json({
        success: true,

        data: {
          settings,
        },
      });
  } catch (error) {
    return sendSportsError(
      response,
      error,
    );
  }
}

/* =========================
   Sync And Return Feed
========================= */

async function syncAndGetSportsFeed(
  request,
  response,
) {
  try {
    const sportId =
      request.params.sportId;

    const date =
      request.params.date;

    const numericSportId =
      Number.parseInt(
        sportId,
        10,
      );

    const defaultSportName =
      numericSportId === 20
        ? "IPL"
        : numericSportId === 21
          ? "T20"
          : `Sport ${sportId}`;

    const sportName =
      String(
        request.query
          .sport_name ||
          defaultSportName,
      ).trim();

    let syncResult = null;

    if (
      request.query.sync !==
      "false"
    ) {
      syncResult =
        await sportsSyncService
          .syncSportsEvents({
            sportId,
            sportName,
            date,

            affiliateIds:
              request.query
                .affiliate_ids,

            marketIds:
              request.query
                .market_ids,
          });
    }

    const events =
      await sportsService
        .getSportsEvents({
          sportId,
          date,
        });

    return response
      .status(200)
      .json({
        success: true,

        data: {
          events,

          sync: syncResult
            ? {
                events:
                  syncResult.events,

                markets:
                  syncResult.markets,

                selections:
                  syncResult
                    .selections,
              }
            : null,
        },
      });
  } catch (error) {
    return sendSportsError(
      response,
      error,
    );
  }
}

/* =========================
   Place Bet
========================= */

async function placeSportsBet(
  request,
  response,
) {
  try {
    const bet =
      await sportsService
        .placeSportsBet({
          userId:
            request.user.id,

          selectionId:
            request.body
              ?.selectionId,

          stakeAmount:
            request.body
              ?.stakeAmount,
        });

    return response
      .status(201)
      .json({
        success: true,

        message:
          "Bet সফলভাবে গ্রহণ করা হয়েছে।",

        data: {
          bet,
        },
      });
  } catch (error) {
    return sendSportsError(
      response,
      error,
    );
  }
}

/* =========================
   Current User Bet History
========================= */

async function getMySportsBets(
  request,
  response,
) {
  try {
    const bets =
      await sportsService
        .getSportsBetHistory({
          userId:
            request.user.id,

          limit:
            request.query.limit,
        });

    return response
      .status(200)
      .json({
        success: true,

        data: {
          bets,
        },
      });
  } catch (error) {
    return sendSportsError(
      response,
      error,
    );
  }
}

module.exports = {
  getSports,
  getDatesBySport,
  getEventsBySportAndDate,

  getSportsSettings,
  syncAndGetSportsFeed,
  placeSportsBet,
  getMySportsBets,
};