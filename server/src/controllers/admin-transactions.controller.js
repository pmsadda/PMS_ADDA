const transactionService = require(
  "../services/admin-transactions.service"
);

async function getTransactions(req, res) {
  try {
    const result =
      await transactionService.getTransactions(
        req.query
      );

    return res.status(200).json({
      success: true,
      message:
        "Transactions loaded successfully.",
      data: result
    });
  } catch (error) {
    console.error(
      "Get transactions error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to load transactions.",
      error:
        process.env.NODE_ENV ===
        "development"
          ? error.message
          : undefined
    });
  }
}

async function getTransactionSummary(
  req,
  res
) {
  try {
    const summary =
      await transactionService
        .getTransactionSummary();

    return res.status(200).json({
      success: true,
      message:
        "Transaction summary loaded successfully.",
      data: summary
    });
  } catch (error) {
    console.error(
      "Transaction summary error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to load transaction summary.",
      error:
        process.env.NODE_ENV ===
        "development"
          ? error.message
          : undefined
    });
  }
}

async function getReferralHistory(
  req,
  res,
) {
  try {
    const result =
      await transactionService
        .getReferralHistory(
          req.query,
        );

    return res.status(200).json({
      success: true,

      message:
        "Referral history loaded successfully.",

      data: result,
    });
  } catch (error) {
    console.error(
      "Referral history error:",
      error,
    );

    return res.status(500).json({
      success: false,

      message:
        "Failed to load referral history.",

      error:
        process.env.NODE_ENV ===
        "development"
          ? error.message
          : undefined,
    });
  }
}

async function getBonusHistory(
  req,
  res,
) {
  try {
    const result =
      await transactionService
        .getBonusHistory(
          req.query,
        );

    return res.status(200).json({
      success: true,

      message:
        "Bonus history loaded successfully.",

      data: result,
    });
  } catch (error) {
    console.error(
      "Bonus history error:",
      error,
    );

    return res.status(500).json({
      success: false,

      message:
        "Failed to load bonus history.",

      error:
        process.env.NODE_ENV ===
        "development"
          ? error.message
          : undefined,
    });
  }
}

module.exports = {
  getTransactions,
  getTransactionSummary,
  getReferralHistory,
  getBonusHistory,
};