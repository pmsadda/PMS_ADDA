"use strict";

const {
  getDepositRequests
} = require(
  "./admin-deposit.controller"
);

const {
  getWithdraws
} = require(
  "./admin-withdraw.controller"
);

const {
  approveDepositRequest,
  rejectDepositRequest
} = require(
  "../services/admin-deposit.service"
);

const {
  approveWithdraw,
  rejectWithdraw
} = require(
  "../services/admin-withdraw.service"
);

function getRequestIp(request) {
  const forwarded =
    request.headers[
      "x-forwarded-for"
    ];

  if (
    typeof forwarded ===
      "string" &&
    forwarded.trim()
  ) {
    return forwarded
      .split(",")[0]
      .trim()
      .slice(0, 45);
  }

  return String(
    request.ip ||
    request.socket
      ?.remoteAddress ||
    ""
  ).slice(0, 45);
}

function getAuditActor(
  request,
  reason = null
) {
  return {
    agentId:
      Number(request.user.id),

    reason:
      reason
        ? String(reason)
            .trim()
            .slice(0, 2000)
        : null,

    ipAddress:
      getRequestIp(request),

    userAgent:
      String(
        request.headers[
          "user-agent"
        ] ||
        ""
      ).slice(0, 500)
  };
}

/* ==========================
   Deposit List
========================== */

async function listDeposits(
  request,
  response,
  next
) {
  return getDepositRequests(
    request,
    response,
    next
  );
}

/* ==========================
   Approve Deposit
========================== */

async function approveDeposit(
  request,
  response,
  next
) {
  try {
    const depositId =
      String(
        request.params
          .depositId ||
        ""
      )
        .trim()
        .toUpperCase();

    if (!depositId) {
      return response
        .status(400)
        .json({
          success: false,
          message:
            "Deposit ID is required."
        });
    }

    const result =
      await approveDepositRequest({
        depositId,

        adminId:
          request.user.id,

        auditActor:
          getAuditActor(
            request,
            "Deposit approved"
          )
      });

    return response.json({
      success: true,

      message:
        "Deposit approved successfully.",

      data: {
        deposit: result
      }
    });
  } catch (error) {
    return next(error);
  }
}

/* ==========================
   Reject Deposit
========================== */

async function rejectDeposit(
  request,
  response,
  next
) {
  try {
    const depositId =
      String(
        request.params
          .depositId ||
        ""
      )
        .trim()
        .toUpperCase();

    const reason =
      String(
        request.body
          ?.reason ||
        ""
      )
        .trim()
        .toLowerCase();

    const note =
      String(
        request.body
          ?.note ||
        ""
      ).trim();

    const allowedReasons =
      [
        "transaction_not_found",
        "wrong_amount",
        "duplicate_transaction",
        "wrong_sender",
        "other"
      ];

    if (!depositId) {
      return response
        .status(400)
        .json({
          success: false,
          message:
            "Deposit ID is required."
        });
    }

    if (
      !allowedReasons.includes(
        reason
      )
    ) {
      return response
        .status(400)
        .json({
          success: false,
          message:
            "Please select a valid reject reason."
        });
    }

    if (note.length > 255) {
      return response
        .status(400)
        .json({
          success: false,
          message:
            "Agent note cannot exceed 255 characters."
        });
    }

    const result =
      await rejectDepositRequest({
        depositId,

        adminId:
          request.user.id,

        reason,

        note,

        auditActor:
          getAuditActor(
            request,
            note
              ? `${reason}: ${note}`
              : reason
          )
      });

    return response.json({
      success: true,

      message:
        "Deposit rejected successfully.",

      data: {
        deposit: result
      }
    });
  } catch (error) {
    return next(error);
  }
}

/* ==========================
   Withdrawal List
========================== */

async function listWithdrawals(
  request,
  response,
  next
) {
  return getWithdraws(
    request,
    response,
    next
  );
}

/* ==========================
   Approve Withdrawal
========================== */

async function approveWithdrawal(
  request,
  response,
  next
) {
  try {
    const withdrawalId =
      Number(
        request.params.id
      );

    const agentNote =
      String(
        request.body
          ?.adminNote ||
        ""
      )
        .trim()
        .slice(0, 255) ||
      null;

    if (
      !Number.isInteger(
        withdrawalId
      ) ||
      withdrawalId <= 0
    ) {
      return response
        .status(400)
        .json({
          success: false,
          message:
            "Invalid withdrawal ID."
        });
    }

    const result =
      await approveWithdraw(
        withdrawalId,
        agentNote,
        request.user.id,
        getAuditActor(
          request,
          agentNote ||
          "Withdrawal approved"
        )
      );

    return response.json({
      success: true,

      message:
        "Withdrawal approved successfully.",

      data: {
        withdrawal: result
      }
    });
  } catch (error) {
    return next(error);
  }
}

/* ==========================
   Reject Withdrawal
========================== */

async function rejectWithdrawal(
  request,
  response,
  next
) {
  try {
    const withdrawalId =
      Number(
        request.params.id
      );

    const agentNote =
      String(
        request.body
          ?.adminNote ||
        ""
      )
        .trim()
        .slice(0, 255);

    if (
      !Number.isInteger(
        withdrawalId
      ) ||
      withdrawalId <= 0
    ) {
      return response
        .status(400)
        .json({
          success: false,
          message:
            "Invalid withdrawal ID."
        });
    }

    if (!agentNote) {
      return response
        .status(400)
        .json({
          success: false,
          message:
            "A rejection reason is required."
        });
    }

    const result =
      await rejectWithdraw(
        withdrawalId,
        agentNote,
        request.user.id,
        getAuditActor(
          request,
          agentNote
        )
      );

    return response.json({
      success: true,

      message:
        "Withdrawal rejected and balance refunded.",

      data: {
        withdrawal: result
      }
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listDeposits,
  approveDeposit,
  rejectDeposit,
  listWithdrawals,
  approveWithdrawal,
  rejectWithdrawal
};