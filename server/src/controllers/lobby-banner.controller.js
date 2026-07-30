"use strict";

const lobbyBannerService =
  require(
    "../services/lobby-banner.service"
  );

/* ==========================
   Banner Version
========================== */

function getBannerVersion(
  banner
) {
  const updatedTime =
    banner?.updatedAt
      ? new Date(
          banner.updatedAt
        ).getTime()
      : Date.now();

  return Number.isFinite(
    updatedTime
  )
    ? updatedTime
    : Date.now();
}

/* ==========================
   Response Serializers
========================== */

function serializePublicBanner(
  banner
) {
  if (!banner) {
    return null;
  }

  const version =
    getBannerVersion(banner);

  return {
    id: banner.id,

    title:
      banner.title,

    targetUrl:
      banner.targetUrl,

    status:
      banner.status,

    imageUrl:
      `/api/lobby-banner/image?v=${version}`,

    updatedAt:
      banner.updatedAt
  };
}

function serializeAdminBanner(
  banner
) {
  if (!banner) {
    return null;
  }

  const version =
    getBannerVersion(banner);

  return {
    ...banner,

    imageUrl:
      banner.hasImage
        ? `/api/admin/lobby-banner/image?v=${version}`
        : null
  };
}

/* ==========================
   Public Banner Metadata
========================== */

async function getPublicBanner(
  request,
  response,
  next
) {
  try {
    const banner =
      await lobbyBannerService
        .getActiveBanner();

    return response
      .status(200)
      .json({
        success: true,

        message:
          banner
            ? "Lobby banner loaded successfully."
            : "No active lobby banner is available.",

        data: {
          banner:
            serializePublicBanner(
              banner
            )
        }
      });
  } catch (error) {
    next(error);
  }
}

/* ==========================
   Admin Banner Metadata
========================== */

async function getAdminBanner(
  request,
  response,
  next
) {
  try {
    const banner =
      await lobbyBannerService
        .getAdminBanner();

    return response
      .status(200)
      .json({
        success: true,

        message:
          "Lobby banner settings loaded successfully.",

        data: {
          banner:
            serializeAdminBanner(
              banner
            )
        }
      });
  } catch (error) {
    next(error);
  }
}

/* ==========================
   Image Response
========================== */

function sendBannerImage(
  request,
  response,
  image,
  cacheControl =
    "public, max-age=300"
) {
  const updatedTime =
    image.updatedAt
      ? new Date(
          image.updatedAt
        ).getTime()
      : Date.now();

  const safeUpdatedTime =
    Number.isFinite(
      updatedTime
    )
      ? updatedTime
      : Date.now();

  const etag =
    `"lobby-banner-${safeUpdatedTime}-${image.imageSize}"`;

  if (
    request.headers[
      "if-none-match"
    ] === etag
  ) {
    return response
      .status(304)
      .end();
  }

  response.set({
    "Content-Type":
      image.mimeType,

    "Content-Length":
      String(
        image.imageData.length
      ),

    "Cache-Control":
      cacheControl,

    ETag:
      etag,

    "X-Content-Type-Options":
      "nosniff"
  });

  return response
    .status(200)
    .end(
      image.imageData
    );
}

/* ==========================
   Public Banner Image
========================== */

async function getPublicBannerImage(
  request,
  response,
  next
) {
  try {
    const image =
      await lobbyBannerService
        .getBannerImage({
          includeDisabled: false
        });

    return sendBannerImage(
      request,
      response,
      image
    );
  } catch (error) {
    next(error);
  }
}

/* ==========================
   Admin Banner Image
========================== */

async function getAdminBannerImage(
  request,
  response,
  next
) {
  try {
    const image =
      await lobbyBannerService
        .getBannerImage({
          includeDisabled: true
        });

    return sendBannerImage(
      request,
      response,
      image,
      "private, no-store"
    );
  } catch (error) {
    next(error);
  }
}

/* ==========================
   Save Banner
========================== */

async function saveLobbyBanner(
  request,
  response,
  next
) {
  try {
    const banner =
      await lobbyBannerService
        .updateBanner({
          adminId:
            request.user.id,

          title:
            request.body.title,

          targetUrl:
            request.body.targetUrl,

          status:
            request.body.status,

          imageFile:
            request.file || null
        });

    return response
      .status(200)
      .json({
        success: true,

        message:
          "Lobby banner saved successfully.",

        data: {
          banner:
            serializeAdminBanner(
              banner
            )
        }
      });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getPublicBanner,
  getAdminBanner,
  getPublicBannerImage,
  getAdminBannerImage,
  saveLobbyBanner
};