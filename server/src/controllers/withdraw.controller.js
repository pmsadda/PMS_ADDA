const {
  createWithdrawRequest,
  getMyWithdrawHistory
} = require("../services/withdraw.service");


/* ==========================
   Create Withdraw
========================== */

async function createWithdraw(req, res, next) {
  try {
    const userId = req.user.id;

    const result = await createWithdrawRequest(
      userId,
      req.body
    );

    return res.status(201).json({
      success: true,
      message: "Withdraw request submitted successfully.",
      data: {
        withdraw: result
      }
    });

  } catch (error) {
    next(error);
  }
}


/* ==========================
   My Withdraw History
========================== */

async function myWithdrawHistory(req, res, next) {
  try {
    const userId = req.user.id;

    const history =
      await getMyWithdrawHistory(userId);

    return res.json({
      success: true,
      data: {
        withdrawals: history
      }
    });

  } catch (error) {
    next(error);
  }
}


module.exports = {
  createWithdraw,
  myWithdrawHistory
};