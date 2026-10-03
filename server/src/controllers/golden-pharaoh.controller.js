"use strict";

const {
  spinGoldenPharaoh,
  getGoldenPharaohPlayerState,
  getMyGoldenPharaohHistory,
} = require(
  "../services/golden-pharaoh.service",
);

/* ==========================
   Get GoldenPharaoh State
========================== */

async function getState(
  req,
  res,
  next,
) {
  try {
    const state =
      await getGoldenPharaohPlayerState({
        userId: req.user.id,
      });

    return res.json({
      success: true,

      data: {
        state,
      },
    });
  } catch (error) {
    next(error);
  }
}

/* ==========================
   Spin
========================== */

async function spin(
  req,
  res,
  next,
) {
  try {
    const result =
      await spinGoldenPharaoh({
        userId:
          req.user.id,

        betAmount:
          req.body?.betAmount,
      });

    return res
      .status(201)
      .json({
        success: true,

        message:
          result.payoutAmount > 0
            ? `You won ৳${Number(
                result.payoutAmount,
              ).toFixed(2)}!`
            : "Spin completed.",

        data: {
          spin: result,
        },
      });
  } catch (error) {
    next(error);
  }
}

/* ==========================
   My History
========================== */

async function getHistory(
  req,
  res,
  next,
) {
  try {
    const history =
      await getMyGoldenPharaohHistory({
        userId:
          req.user.id,

        limit:
          req.query?.limit,
      });

    return res.json({
      success: true,

      data: {
        history,
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getState,
  spin,
  getHistory,
};