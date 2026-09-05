const {
  getWithdrawRequests,
  approveWithdraw,
  rejectWithdraw
} = require("../services/admin-withdraw.service");


/* ==========================
   Get Withdraw Requests
========================== */

async function getWithdraws(req, res, next) {
  try {

    const status =
      req.query.status || "pending";

    const withdrawals =
      await getWithdrawRequests(status);

    return res.json({
      success: true,
      data: {
        withdrawals
      }
    });

  } catch (error) {

    next(error);

  }
}


/* ==========================
   Approve Withdraw
========================== */

async function approve(req, res, next) {
  try {
    const withdrawId = Number(req.params.id);

    const adminNote =
      req.body.adminNote || null;

    if (
      !Number.isInteger(withdrawId) ||
      withdrawId < 1
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid withdraw ID.",
      });
    }

    const result = await approveWithdraw(
      withdrawId,
      adminNote,
      req.user.id,
    );

    return res.json({
      success: true,

      message:
        "Withdrawal sent to JayaPay. Waiting for final confirmation.",

      data: {
        withdraw: result,
      },
    });
  } catch (error) {
    next(error);
  }
}


/* ==========================
   Reject Withdraw
========================== */

async function reject(req, res, next) {
  try {

    const withdrawId =
      Number(req.params.id);

    const adminNote =
      req.body.adminNote || null;

    if (!withdrawId) {

      return res.status(400).json({
        success: false,
        message: "Invalid withdraw ID."
      });

    }

    const result =
      await rejectWithdraw(
        withdrawId,
        adminNote
      );

    return res.json({
      success: true,
      message:
        "Withdraw rejected and balance refunded.",
      data: {
        withdraw: result
      }
    });

  } catch (error) {

    next(error);

  }
}


module.exports = {
  getWithdraws,
  approve,
  reject
};