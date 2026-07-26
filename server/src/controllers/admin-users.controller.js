const adminUsersService = require(
  "../services/admin-users.service"
);

function parseUserId(value) {
  const userId = Number.parseInt(
    value,
    10
  );

  if (
    Number.isNaN(userId) ||
    userId < 1
  ) {
    return null;
  }

  return userId;
}

async function getUserSummary(req, res) {
  try {
    const summary =
      await adminUsersService
        .getUserSummary();

    return res.status(200).json({
      success: true,

      message:
        "User summary loaded successfully.",

      data: summary
    });
  } catch (error) {
    console.error(
      "Get user summary error:",
      error
    );

    return res.status(500).json({
      success: false,

      message:
        "Failed to load user summary.",

      error:
        process.env.NODE_ENV ===
        "development"
          ? error.message
          : undefined
    });
  }
}

async function getUsers(req, res) {
  try {
    const result =
      await adminUsersService.getUsers(
        req.query
      );

    return res.status(200).json({
      success: true,

      message:
        "Users loaded successfully.",

      data: result
    });
  } catch (error) {
    console.error(
      "Get users error:",
      error
    );

    return res.status(500).json({
      success: false,

      message:
        "Failed to load users.",

      error:
        process.env.NODE_ENV ===
        "development"
          ? error.message
          : undefined
    });
  }
}

async function getUserById(req, res) {
  try {
    const userId = parseUserId(
      req.params.userId
    );

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID."
      });
    }

    const user =
      await adminUsersService
        .getUserById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found."
      });
    }

    return res.status(200).json({
      success: true,

      message:
        "User details loaded successfully.",

      data: {
        user
      }
    });
  } catch (error) {
    console.error(
      "Get user details error:",
      error
    );

    return res.status(500).json({
      success: false,

      message:
        "Failed to load user details.",

      error:
        process.env.NODE_ENV ===
        "development"
          ? error.message
          : undefined
    });
  }
}

async function updateUserStatus(req, res) {
  try {
    const userId = parseUserId(
      req.params.userId
    );

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID."
      });
    }

    const accountStatus = String(
      req.body.account_status || ""
    )
      .trim()
      .toLowerCase();

    if (
      !["active", "banned"].includes(
        accountStatus
      )
    ) {
      return res.status(400).json({
        success: false,

        message:
          "Account status must be active or banned."
      });
    }

    const updatedUser =
      await adminUsersService
        .updateUserStatus(
          userId,
          accountStatus
        );

    return res.status(200).json({
      success: true,

      message:
        accountStatus === "banned"
          ? "User banned successfully."
          : "User activated successfully.",

      data: {
        user: updatedUser
      }
    });
  } catch (error) {
    console.error(
      "Update user status error:",
      error
    );

    const statusCode =
      error.statusCode || 500;

    return res.status(statusCode).json({
      success: false,

      message:
        error.message ||
        "Failed to update user status.",

      error:
        process.env.NODE_ENV ===
        "development"
          ? error.message
          : undefined
    });
  }
}

module.exports = {
  getUserSummary,
  getUsers,
  getUserById,
  updateUserStatus
};