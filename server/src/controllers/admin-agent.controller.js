"use strict";

const {
  getAgents,
  createAgent,
  updateAgentStatus
} = require(
  "../services/admin-agent.service"
);

async function listAgents(
  request,
  response,
  next
) {
  try {
    const agents =
      await getAgents();

    return response.json({
      success: true,

      data: {
        agents
      }
    });
  } catch (error) {
    return next(error);
  }
}

async function addAgent(
  request,
  response,
  next
) {
  try {
    const agent =
      await createAgent({
        fullName:
          request.body
            ?.fullName,

        username:
          request.body
            ?.username,

        phone:
          request.body
            ?.phone,

        email:
          request.body
            ?.email,

        password:
          request.body
            ?.password
      });

    return response
      .status(201)
      .json({
        success: true,

        message:
          "Agent account created successfully.",

        data: {
          agent
        }
      });
  } catch (error) {
    return next(error);
  }
}

async function changeAgentStatus(
  request,
  response,
  next
) {
  try {
    const agent =
      await updateAgentStatus({
        agentId:
          request.params
            .agentId,

        status:
          request.body
            ?.status
      });

    return response.json({
      success: true,

      message:
        agent.accountStatus ===
        "active"
          ? "Agent account activated."
          : "Agent account disabled.",

      data: {
        agent
      }
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listAgents,
  addAgent,
  changeAgentStatus
};