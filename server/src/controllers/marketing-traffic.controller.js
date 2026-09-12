"use strict";

const {
  recordTrafficVisit,
  getAdminTrafficHistory
} = require(
  "../services/marketing-traffic.service"
);

function getRequestIp(
  request
) {
  const forwardedFor =
    String(
      request.headers[
        "x-forwarded-for"
      ] || ""
    )
      .split(",")[0]
      .trim();

  return (
    String(
      request.headers[
        "cf-connecting-ip"
      ] ||
      forwardedFor ||
      request.ip ||
      request.socket
        ?.remoteAddress ||
      ""
    )
      .replace(
        /^::ffff:/,
        ""
      )
      .trim()
      .slice(0, 45) ||
    null
  );
}

function handleTrafficError(
  response,
  error
) {
  console.error(
    "MARKETING TRAFFIC ERROR:",
    error
  );

  return response
    .status(
      Number(
        error.statusCode ||
        500
      )
    )
    .json({
      success: false,

      code:
        error.code ||
        "MARKETING_TRAFFIC_ERROR",

      message:
        error.message ||
        "Traffic tracking failed."
    });
}

function isValidMarketingLanding(
  landingUrlValue
) {
  try {
    const landingUrl =
      new URL(
        String(
          landingUrlValue ||
          ""
        )
      );

    const hostname =
      landingUrl.hostname
        .toLowerCase();

    if (
      hostname !== "tpl22.site" &&
      hostname !== "www.tpl22.site"
    ) {
      return false;
    }

    const query =
      landingUrl.searchParams;

    const isFreeplayVisitor =
      query.get("source") ===
      "tpl22_freeplay";

    const hasUtmTracking =
      Boolean(
        query.get("utm_source") ||
        query.get("utm_medium") ||
        query.get("utm_campaign") ||
        query.get("utm_content") ||
        query.get("utm_term")
      );

    return (
      isFreeplayVisitor ||
      hasUtmTracking
    );
  } catch (error) {
    return false;
  }
}

async function trackVisit(
  request,
  response
) {
  try {
        const landingUrl =
      request.body
        ?.landingUrl;

    if (
      !isValidMarketingLanding(
        landingUrl
      )
    ) {
      response.setHeader(
        "Cache-Control",
        "no-store"
      );

      return response
        .status(200)
        .json({
          success: true,

          data: {
            tracked: false,
            reason:
              "DIRECT_VISIT_IGNORED"
          }
        });
    }
    const result =
      await recordTrafficVisit({
        visitorId:
          request.body
            ?.visitorId,

        sessionId:
          request.body
            ?.sessionId,

        trafficSource:
          request.body
            ?.trafficSource,

        trafficMedium:
          request.body
            ?.trafficMedium,

        campaign:
          request.body
            ?.campaign,

        contentName:
          request.body
            ?.contentName,

        termName:
          request.body
            ?.termName,

        landingUrl:
          request.body
            ?.landingUrl,

        referrerUrl:
          request.body
            ?.referrerUrl,

        ipAddress:
          getRequestIp(
            request
          ),

        userAgent:
          String(
            request.headers[
              "user-agent"
            ] || ""
          )
            .trim()
            .slice(0, 2000)
      });

    response.setHeader(
      "Cache-Control",
      "no-store"
    );

    return response
      .status(200)
      .json({
        success: true,

        data: result
      });
  } catch (error) {
    return handleTrafficError(
      response,
      error
    );
  }
}

async function getTrafficHistory(
  request,
  response
) {
  try {
    const result =
      await getAdminTrafficHistory({
        page:
          request.query?.page,

        limit:
          request.query?.limit,

        search:
          request.query?.search,

        source:
          request.query?.source
      });

    response.setHeader(
      "Cache-Control",
      "no-store"
    );

    return response.json({
      success: true,

      data: result
    });
  } catch (error) {
    return handleTrafficError(
      response,
      error
    );
  }
}

module.exports = {
  trackVisit,
  getTrafficHistory
};