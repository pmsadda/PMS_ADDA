"use strict";

const lobbyBannerService =
  require(
    "../services/lobby-banner.service"
  );

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

function serializePublicBanner(
  banner
) {
  const version =
    getBannerVersion(
      banner
    );

  return {
    id:
      banner.id,

    displayOrder:
      banner.displayOrder,

    title:
      banner.title,

    targetUrl:
      banner.targetUrl,

    status:
      banner.status,

    imageUrl:
      `/api/lobby-banner/${banner.id}/image?v=${version}`,

    updatedAt:
      banner.updatedAt
  };
}

function serializeAdminBanner(
  banner
) {
  const version =
    getBannerVersion(
      banner
    );

  return {
    ...banner,

    imageUrl:
      banner.hasImage
        ? `/api/admin/lobby-banner/${banner.id}/image?v=${version}`
        : null
  };
}

/* ==========================
   Public Banner List
========================== */

async function getPublicBanners(
  request,
  response,
  next
) {
  try {
    const banners =
      await lobbyBannerService
        .getActiveBanners();

    return response
      .status(200)
      .json({
        success: true,

        message:
          banners.length > 0
            ? "Lobby banners loaded successfully."
            : "No active lobby banner is available.",

        data: {
          banners:
            banners.map(
              serializePublicBanner
            )
        }
      });
  } catch (error) {
    next(error);
  }
}

/* ==========================
   Admin Banner List
========================== */

async function getAdminBanners(
  request,
  response,
  next
) {
  try {
    const banners =
      await lobbyBannerService
        .getAdminBanners();

    return response
      .status(200)
      .json({
        success: true,

        message:
          "Lobby banners loaded successfully.",

        data: {
          banners:
            banners.map(
              serializeAdminBanner
            ),

          maximumBanners:
            lobbyBannerService
              .MAX_BANNERS
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
    `"lobby-banner-${image.id}-${safeUpdatedTime}-${image.imageSize}"`;

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
          bannerId:
            request.params
              .bannerId,

          includeDisabled:
            false
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
          bannerId:
            request.params
              .bannerId,

          includeDisabled:
            true
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
   Create Banner
========================== */

async function createLobbyBanner(
  request,
  response,
  next
) {
  try {
    const banner =
      await lobbyBannerService
        .createBanner({
          adminId:
            request.user.id,

          title:
            request.body.title,

          targetUrl:
            request.body
              .targetUrl,

          status:
            request.body.status,

          imageFile:
            request.file ||
            null
        });

    return response
      .status(201)
      .json({
        success: true,

        message:
          "Lobby banner created successfully.",

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
   Update Banner
========================== */

async function updateLobbyBanner(
  request,
  response,
  next
) {
  try {
    const banner =
      await lobbyBannerService
        .updateBanner({
          bannerId:
            request.params
              .bannerId,

          adminId:
            request.user.id,

          title:
            request.body.title,

          targetUrl:
            request.body
              .targetUrl,

          status:
            request.body.status,

          imageFile:
            request.file ||
            null
        });

    return response
      .status(200)
      .json({
        success: true,

        message:
          "Lobby banner updated successfully.",

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
   Delete Banner
========================== */

async function deleteLobbyBanner(
  request,
  response,
  next
) {
  try {
    const deletedBanner =
      await lobbyBannerService
        .deleteBanner({
          bannerId:
            request.params
              .bannerId,

          adminId:
            request.user.id
        });

    return response
      .status(200)
      .json({
        success: true,

        message:
          "Lobby banner deleted successfully.",

        data: {
          deletedBanner
        }
      });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getPublicBanners,
  getAdminBanners,
  getPublicBannerImage,
  getAdminBannerImage,
  createLobbyBanner,
  updateLobbyBanner,
  deleteLobbyBanner
};