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

async function trackVisit(
  request,
  response
) {
  try {
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