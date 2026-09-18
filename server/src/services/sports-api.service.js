"use strict";

const API_KEY = String(
  process.env.THERUNDOWN_API_KEY || ""
).trim();

const BASE_URL = String(
  process.env.THERUNDOWN_API_BASE_URL ||
  "https://therundown.io/api/v2"
).replace(/\/+$/, "");

const TIMEOUT_MS =
  Number(process.env.THERUNDOWN_API_TIMEOUT_MS) ||
  10000;

/*
 * Odds সর্বোচ্চ ৯০ সেকেন্ড পুরোনো গ্রহণ করা হবে।
 * তাই API cache ৩০ সেকেন্ড রাখা হয়েছে।
 */
const CACHE_TTL_MS = Math.max(
  5000,
  Number(
    process.env.THERUNDOWN_CACHE_TTL_MS
  ) || 30000,
);

const responseCache = new Map();

function ensureConfigured() {
  if (!API_KEY) {
    const error = new Error(
      "THERUNDOWN_API_KEY is not configured."
    );

    error.code = "SPORTS_API_NOT_CONFIGURED";

    throw error;
  }
}

function getCachedValue(cacheKey) {
  const cached = responseCache.get(cacheKey);

  if (!cached) {
    return null;
  }

  if (Date.now() >= cached.expiresAt) {
    responseCache.delete(cacheKey);
    return null;
  }

  return cached.value;
}

function saveCachedValue(cacheKey, value) {
  responseCache.set(cacheKey, {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

async function apiRequest(pathname, query = {}) {
  ensureConfigured();

  const url = new URL(
    `${BASE_URL}/${String(pathname).replace(/^\/+/, "")}`
  );

  Object.entries(query).forEach(([key, value]) => {
    if (
      value === undefined ||
      value === null ||
      value === ""
    ) {
      return;
    }

    url.searchParams.set(key, String(value));
  });

  const cacheKey = url.toString();

  const cachedValue = getCachedValue(cacheKey);

  if (cachedValue) {
    return cachedValue;
  }

  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",

      headers: {
        Accept: "application/json",
        "X-Therundown-Key": API_KEY,
      },

      signal: controller.signal,
    });

    const responseText = await response.text();

    let responseData;

    try {
      responseData = responseText
        ? JSON.parse(responseText)
        : null;
    } catch (_error) {
      responseData = {
        message: responseText,
      };
    }

    if (!response.ok) {
      const error = new Error(
        responseData?.message ||
        `Sports API request failed with ${response.status}.`
      );

      error.statusCode = response.status;
      error.code = "SPORTS_API_REQUEST_FAILED";

      throw error;
    }

    saveCachedValue(cacheKey, responseData);

    return responseData;
  } catch (error) {
    if (error.name === "AbortError") {
      const timeoutError = new Error(
        "Sports API request timed out."
      );

      timeoutError.statusCode = 504;
      timeoutError.code = "SPORTS_API_TIMEOUT";

      throw timeoutError;
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function getSports() {
  return apiRequest("/sports");
}

async function getDatesBySport(
  sportId
) {
  const normalizedSportId =
    Number.parseInt(sportId, 10);

  if (
    !Number.isSafeInteger(normalizedSportId) ||
    normalizedSportId <= 0
  ) {
    const error = new Error(
      "A valid sport ID is required."
    );

    error.statusCode = 400;
    error.code = "INVALID_SPORT_ID";

    throw error;
  }

  return apiRequest(
    `/sports/${normalizedSportId}/dates`,
    {
      date_format: "yyyy-MM-dd",
    }
  );
}

async function getEventsBySportAndDate(
  sportId,
  date,
  options = {}
) {
  const normalizedSportId =
    Number.parseInt(sportId, 10);

  if (
    !Number.isSafeInteger(normalizedSportId) ||
    normalizedSportId <= 0
  ) {
    const error = new Error(
      "A valid sport ID is required."
    );

    error.statusCode = 400;
    error.code = "INVALID_SPORT_ID";

    throw error;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
    const error = new Error(
      "Date must use YYYY-MM-DD format."
    );

    error.statusCode = 400;
    error.code = "INVALID_SPORTS_DATE";

    throw error;
  }

  return apiRequest(
    `/sports/${normalizedSportId}/events/${date}`,
    {
      affiliate_ids: options.affiliateIds,
      market_ids: options.marketIds,
      main_line:
        options.mainLine === false
          ? "false"
          : "true",
      hide_closed: "true",
    }
  );
}

function clearSportsCache() {
  responseCache.clear();
}

module.exports = {
  getSports,
  getDatesBySport,
  getEventsBySportAndDate,
  clearSportsCache,
};