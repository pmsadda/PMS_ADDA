"use strict";

const lotteryService =
  require(
    "../services/lottery.service",
  );

  const {
  emitLotteryDrawStarted,
  emitLotteryDrawCompleted,
  emitLotteryDrawFailed,
  emitLotteryWinnerNotification,
} = require(
  "../socket/lottery.socket",
);

function sendAdminLotteryError(
  response,
  error,
  fallbackMessage,
) {
  const statusCode =
    Number(
      error.statusCode ||
        error.status ||
        500,
    );

  return response
    .status(statusCode)
    .json({
      success: false,

      message:
        error.message ||
        fallbackMessage,

      code:
        error.code ||
        "ADMIN_LOTTERY_REQUEST_FAILED",
    });
}

/* ==========================================
   Get Admin Lottery Draws
========================================== */

async function getDraws(
  request,
  response,
) {
  try {
    const data =
      await lotteryService
        .getAdminLotteryDraws(
          request.query,
        );

    return response
      .status(200)
      .json({
        success: true,

        message:
          "Admin lottery draws loaded successfully.",

        data,
      });
  } catch (error) {
    console.error(
      "GET ADMIN LOTTERY DRAWS ERROR:",
      error,
    );

    return sendAdminLotteryError(
      response,
      error,
      "Unable to load admin lottery draws.",
    );
  }
}

/* ==========================================
   Get Admin Lottery Draw Details
========================================== */

async function getDrawDetails(
  request,
  response,
) {
  try {
    const data =
      await lotteryService
        .getAdminLotteryDrawDetails(
          request.params.drawId,
          request.query,
        );

    return response
      .status(200)
      .json({
        success: true,

        message:
          "Admin lottery draw details loaded successfully.",

        data,
      });
  } catch (error) {
    console.error(
      "GET ADMIN LOTTERY DRAW DETAILS ERROR:",
      error,
    );

    return sendAdminLotteryError(
      response,
      error,
      "Unable to load lottery draw details.",
    );
  }
}

/* ==========================================
   Create Draft Draw
========================================== */

async function createDraw(
  request,
  response,
) {
  try {
    const draw =
      await lotteryService
        .createAdminDraw(
          request.user.id,
          request.body,
        );

    return response
      .status(201)
      .json({
        success: true,

        message:
          "Lottery draft created successfully.",

        data: {
          draw,
        },
      });
  } catch (error) {
    console.error(
      "CREATE LOTTERY DRAW ERROR:",
      error,
    );

    return sendAdminLotteryError(
      response,
      error,
      "Unable to create lottery draw.",
    );
  }
}

/* ==========================================
   Open Draft Draw for Ticket Sales
========================================== */

async function openDraw(
  request,
  response,
) {
  try {
    const draw =
      await lotteryService
        .openAdminDraw(
          request.user.id,
          request.params.drawId,
        );

    return response
      .status(200)
      .json({
        success: true,

        message:
          "Lottery ticket sales opened successfully.",

        data: {
          draw,
        },
      });
  } catch (error) {
    console.error(
      "OPEN LOTTERY DRAW ERROR:",
      error,
    );

    return sendAdminLotteryError(
      response,
      error,
      "Unable to open lottery draw.",
    );
  }
}

/* ==========================================
   Cancel Lottery Draw
========================================== */

async function cancelAdminDraw(
  request,
  response,
) {
  try {
    const data =
      await lotteryService
        .cancelAdminDraw(
          request.user.id,
          request.params.drawId,
          request.body?.reason,
        );

    return response
      .status(200)
      .json({
        success: true,

        message:
          data.alreadyCancelled
            ? "Lottery draw was already cancelled."
            : "Lottery draw cancelled and all eligible tickets refunded successfully.",

        data,
      });
  } catch (error) {
    console.error(
      "ADMIN LOTTERY DRAW CANCEL ERROR:",
      error,
    );

    return response
      .status(
        error.statusCode ||
          error.status ||
          500,
      )
      .json({
        success: false,

        code:
          error.code ||
          "ADMIN_LOTTERY_CANCEL_ERROR",

        message:
          error.message ||
          "Lottery draw cancellation failed.",
      });
  }
}

/* ==========================================
   Execute Cryptographic Fair Draw
========================================== */

async function executeFairDraw(
  request,
  response,
) {
  const io =
    request.app.get(
      "io",
    );

  const requestedDrawId =
    Number.parseInt(
      request.params.drawId,
      10,
    );

  let drawStarted =
    false;

  try {
    const data =
      await lotteryService
        .executeAdminFairDraw(
          request.user.id,
          request.params.drawId,
          {
            onDrawingStarted:
              async (
                startPayload,
              ) => {
                drawStarted =
                  true;

                if (io) {
                  emitLotteryDrawStarted(
                    io,
                    startPayload,
                  );
                }
              },
          },
        );

    if (
      io &&
      !data.alreadyCompleted
    ) {
      const publicWinners =
        Array.isArray(
          data.winners,
        )
          ? data.winners.map(
              (winner) => ({
                drawId:
                  winner.drawId,

                drawCode:
                  winner.drawCode,

                drawTitle:
                  winner.drawTitle,

                prizeRank:
                  winner.prizeRank,

                ticketCode:
                  winner.ticketCode,

                winnerUid:
                  winner.winnerUid,

                winnerName:
                  winner.winnerName,

                prizePercent:
                  winner.prizePercent,

                prizeAmount:
                  winner.prizeAmount,

                winnerMessage:
                  winner.winnerMessage,
              }),
            )
          : [];

      emitLotteryDrawCompleted(
        io,
        {
          drawId:
            data.drawId,

          drawCode:
            data.drawCode,

          status:
            data.status,

          winners:
            publicWinners,

          ticketSetHash:
            data.ticketSetHash,

          shuffleProofHash:
            data
              .shuffleProofHash,

          revealedSeed:
            data.revealedSeed,

          drawnAt:
            data.drawnAt,
        },
      );

      for (
        const winner of
        data.winners || []
      ) {
        const winnerUserId =
          Number(
            winner
              .winnerUserId,
          );

        if (
          !Number.isInteger(
            winnerUserId,
          ) ||
          winnerUserId < 1
        ) {
          continue;
        }

        emitLotteryWinnerNotification(
          io,
          winnerUserId,
          {
            drawId:
              winner.drawId,

            drawCode:
              winner.drawCode,

            drawTitle:
              winner.drawTitle,

            prizeRank:
              winner.prizeRank,

            ticketCode:
              winner.ticketCode,

            winnerUid:
              winner.winnerUid,

            winnerName:
              winner.winnerName,

            prizeAmount:
              winner.prizeAmount,

            winnerMessage:
              winner
                .winnerMessage,
          },
        );
      }
    }

    return response
      .status(200)
      .json({
        success: true,

        message:
          data.alreadyCompleted
            ? "Lottery draw was already completed."
            : "Fair lottery draw completed and prizes paid successfully.",

        data,
      });
  } catch (error) {
    if (
      io &&
      drawStarted
    ) {
      emitLotteryDrawFailed(
        io,
        {
          drawId:
            Number.isInteger(
              requestedDrawId,
            )
              ? requestedDrawId
              : null,

          code:
            error.code ||
            "LOTTERY_DRAW_FAILED",

          message:
            error.message ||
            "Lottery draw failed.",
        },
      );
    }

    console.error(
      "EXECUTE FAIR LOTTERY DRAW ERROR:",
      error,
    );

    return sendAdminLotteryError(
      response,
      error,
      "Unable to execute fair lottery draw.",
    );
  }
}

module.exports = {
  getDraws,
  getDrawDetails,
  createDraw,
  openDraw,
  cancelAdminDraw,
  executeFairDraw,
};