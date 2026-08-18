"use strict";

const ALLOWED_ACTIONS =
  new Set([
    "deposit_approved",
    "deposit_rejected",
    "withdrawal_approved",
    "withdrawal_rejected"
  ]);

function createAuditError(
  message,
  code
) {
  const error =
    new Error(message);

  error.statusCode = 500;
  error.code = code;

  return error;
}

async function insertAgentActionLog({
  connection,
  agentId,
  actionType,
  referenceId,
  customerId,
  amount,
  reason = null,
  ipAddress = null,
  userAgent = null
}) {
  if (
    !connection ||
    typeof connection.execute !==
      "function"
  ) {
    throw createAuditError(
      "Audit database connection is required.",
      "AUDIT_CONNECTION_REQUIRED"
    );
  }

  const safeAgentId =
    Number(agentId);

  const safeCustomerId =
    Number(customerId);

  if (
    !Number.isInteger(safeAgentId) ||
    safeAgentId <= 0
  ) {
    throw createAuditError(
      "Valid Agent ID is required.",
      "AUDIT_AGENT_REQUIRED"
    );
  }

  if (
    !Number.isInteger(safeCustomerId) ||
    safeCustomerId <= 0
  ) {
    throw createAuditError(
      "Valid customer ID is required.",
      "AUDIT_CUSTOMER_REQUIRED"
    );
  }

  if (
    !ALLOWED_ACTIONS.has(
      String(actionType)
    )
  ) {
    throw createAuditError(
      "Invalid Agent action type.",
      "AUDIT_ACTION_INVALID"
    );
  }

  const safeAmount =
    Number(amount);

  if (
    !Number.isFinite(safeAmount) ||
    safeAmount < 0
  ) {
    throw createAuditError(
      "Invalid audit amount.",
      "AUDIT_AMOUNT_INVALID"
    );
  }

  const [agentRows] =
    await connection.execute(
      `
        SELECT
          id,
          uid,
          username,
          role,
          account_status
        FROM users
        WHERE id = ?
        LIMIT 1
      `,
      [
        safeAgentId
      ]
    );

  const agent =
    agentRows[0] || null;

  if (
    !agent ||
    String(
      agent.role || ""
    ).toLowerCase() !==
      "agent" ||
    String(
      agent.account_status || ""
    ).toLowerCase() !==
      "active"
  ) {
    throw createAuditError(
      "Active Agent account was not found.",
      "AUDIT_AGENT_INVALID"
    );
  }

  const [customerRows] =
    await connection.execute(
      `
        SELECT
          id,
          uid,
          username
        FROM users
        WHERE id = ?
        LIMIT 1
      `,
      [
        safeCustomerId
      ]
    );

  const customer =
    customerRows[0] || null;

  if (!customer) {
    throw createAuditError(
      "Audit customer was not found.",
      "AUDIT_CUSTOMER_NOT_FOUND"
    );
  }

  const safeReferenceId =
    String(
      referenceId || ""
    )
      .trim()
      .slice(0, 100);

  if (!safeReferenceId) {
    throw createAuditError(
      "Audit reference ID is required.",
      "AUDIT_REFERENCE_REQUIRED"
    );
  }

  const safeReason =
    reason
      ? String(reason)
          .trim()
          .slice(0, 2000)
      : null;

  const safeIpAddress =
    ipAddress
      ? String(ipAddress)
          .trim()
          .slice(0, 45)
      : null;

  const safeUserAgent =
    userAgent
      ? String(userAgent)
          .trim()
          .slice(0, 500)
      : null;

  const [insertResult] =
    await connection.execute(
      `
        INSERT INTO agent_action_logs (
          agent_id,
          agent_uid,
          agent_username,
          action_type,
          reference_id,
          customer_id,
          customer_uid,
          customer_username,
          amount,
          reason,
          ip_address,
          user_agent,
          created_at
        )
        VALUES (
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          CURRENT_TIMESTAMP(3)
        )
      `,
      [
        safeAgentId,
        agent.uid || null,
        String(agent.username),
        String(actionType),
        safeReferenceId,
        safeCustomerId,
        customer.uid || null,
        String(customer.username),
        Number(
          safeAmount.toFixed(2)
        ),
        safeReason,
        safeIpAddress,
        safeUserAgent
      ]
    );

  if (
    Number(
      insertResult.affectedRows
    ) !== 1
  ) {
    throw createAuditError(
      "Agent audit log could not be created.",
      "AUDIT_INSERT_FAILED"
    );
  }

  return {
    id:
      Number(
        insertResult.insertId
      ),

    actionType:
      String(actionType),

    referenceId:
      safeReferenceId
  };
}

module.exports = {
  insertAgentActionLog
};