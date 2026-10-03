"use strict";

const {
  spinGemFortune,
  getGemFortunePlayerState,
  getMyGemFortuneHistory,
} = require(
  "../services/gem-fortune.service",
);

/* ==========================
   Get GemFortune State
========================== */

async function getState(
  req,
  res,
  next,
) {
  try {
    const state =
      await getGemFortunePlayerState({
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
      await spinGemFortune({
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
      await getMyGemFortuneHistory({
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