"use strict";

const supportService = require("../services/support.service");

/*
|--------------------------------------------------------------------------
| Common response helpers
|--------------------------------------------------------------------------
*/

function sendSuccess(
  response,
  statusCode,
  message,
  data = null,
) {
  return response.status(statusCode).json({
    success: true,
    message,
    data,
  });
}

function sendError(response, error, fallbackMessage) {
  const statusCode = Number(error.statusCode) || 500;

  const payload = {
    success: false,
    message:
      statusCode >= 500
        ? fallbackMessage
        : error.message || fallbackMessage,
  };

  if (error.code) {
    payload.code = error.code;
  }

  if (process.env.NODE_ENV !== "production" && statusCode >= 500) {
    payload.error = error.message;
  }

  return response.status(statusCode).json(payload);
}

function getAuthenticatedUserId(request) {
  return (
    request.user?.id ||
    request.user?.userId ||
    request.auth?.id ||
    request.auth?.userId ||
    null
  );
}

/*
|--------------------------------------------------------------------------
| Create support ticket
|--------------------------------------------------------------------------
*/

async function createTicket(request, response) {
  try {
    const userId = getAuthenticatedUserId(request);

    const result = await supportService.createTicket(
      userId,
      request.body || {},
    );

    return sendSuccess(
      response,
      201,
      result.message || "Support ticket created successfully.",
      result.data || result.ticket || result,
    );
  } catch (error) {
    console.error("CREATE SUPPORT TICKET ERROR:", error);

    return sendError(
      response,
      error,
      "Unable to create the support ticket.",
    );
  }
}

/*
|--------------------------------------------------------------------------
| Get authenticated user's tickets
|--------------------------------------------------------------------------
*/

async function getMyTickets(request, response) {
  try {
    const userId = getAuthenticatedUserId(request);

    const result = await supportService.getUserTickets(
      userId,
      request.query || {},
    );

    return sendSuccess(
      response,
      200,
      result.message || "Support tickets loaded successfully.",
      result.data || result.tickets || result,
    );
  } catch (error) {
    console.error("GET MY SUPPORT TICKETS ERROR:", error);

    return sendError(
      response,
      error,
      "Unable to load your support tickets.",
    );
  }
}

/*
|--------------------------------------------------------------------------
| Get one ticket with its messages
|--------------------------------------------------------------------------
*/

async function getMyTicketDetails(request, response) {
  try {
    const userId = getAuthenticatedUserId(request);
    const ticketId = request.params.ticketId;

    const result = await supportService.getUserTicketDetails(
      userId,
      ticketId,
    );

    return sendSuccess(
      response,
      200,
      result.message || "Support ticket loaded successfully.",
      result.data || result,
    );
  } catch (error) {
    console.error("GET SUPPORT TICKET DETAILS ERROR:", error);

    return sendError(
      response,
      error,
      "Unable to load the support ticket.",
    );
  }
}

/*
|--------------------------------------------------------------------------
| Send a message to a ticket
|--------------------------------------------------------------------------
*/

async function replyToMyTicket(request, response) {
  try {
    const userId = getAuthenticatedUserId(request);
    const ticketId = request.params.ticketId;

    const result = await supportService.replyToUserTicket(
      userId,
      ticketId,
      request.body || {},
    );

    return sendSuccess(
      response,
      201,
      result.message || "Support message sent successfully.",
      result.data || result.messageData || result,
    );
  } catch (error) {
    console.error("REPLY TO SUPPORT TICKET ERROR:", error);

    return sendError(
      response,
      error,
      "Unable to send the support message.",
    );
  }
}

/*
|--------------------------------------------------------------------------
| Close authenticated user's ticket
|--------------------------------------------------------------------------
*/

async function closeMyTicket(request, response) {
  try {
    const userId = getAuthenticatedUserId(request);
    const ticketId = request.params.ticketId;

    const result = await supportService.closeUserTicket(
      userId,
      ticketId,
    );

    return sendSuccess(
      response,
      200,
      result.message || "Support ticket closed successfully.",
      result.data || result.ticket || result,
    );
  } catch (error) {
    console.error("CLOSE SUPPORT TICKET ERROR:", error);

    return sendError(
      response,
      error,
      "Unable to close the support ticket.",
    );
  }
}

module.exports = {
  createTicket,
  getMyTickets,
  getMyTicketDetails,
  replyToMyTicket,
  closeMyTicket,
};