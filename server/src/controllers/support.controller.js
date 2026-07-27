"use strict";

const supportService = require("../services/support.service");

/*
|--------------------------------------------------------------------------
| Common response helpers
|--------------------------------------------------------------------------
*/

function sendSuccess(response, statusCode, message, data = null) {
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
      statusCode >= 500 ? fallbackMessage : error.message || fallbackMessage,
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
      request.files || [],
    );

    return sendSuccess(
      response,
      201,
      result.message || "Support ticket created successfully.",
      result.data || result.ticket || result,
    );
  } catch (error) {
    console.error("CREATE SUPPORT TICKET ERROR:", error);

    return sendError(response, error, "Unable to create the support ticket.");
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

    return sendError(response, error, "Unable to load your support tickets.");
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

    const result = await supportService.getUserTicketDetails(userId, ticketId);

    return sendSuccess(
      response,
      200,
      result.message || "Support ticket loaded successfully.",
      result.data || result,
    );
  } catch (error) {
    console.error("GET SUPPORT TICKET DETAILS ERROR:", error);

    return sendError(response, error, "Unable to load the support ticket.");
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
      request.files || [],
    );

    return sendSuccess(
      response,
      201,
      result.message || "Support message sent successfully.",
      result.data || result.messageData || result,
    );
  } catch (error) {
    console.error("REPLY TO SUPPORT TICKET ERROR:", error);

    return sendError(response, error, "Unable to send the support message.");
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

    const result = await supportService.closeUserTicket(userId, ticketId);

    return sendSuccess(
      response,
      200,
      result.message || "Support ticket closed successfully.",
      result.data || result.ticket || result,
    );
  } catch (error) {
    console.error("CLOSE SUPPORT TICKET ERROR:", error);

    return sendError(response, error, "Unable to close the support ticket.");
  }
}

/*
|--------------------------------------------------------------------------
| Admin: Get all support tickets
|--------------------------------------------------------------------------
*/

async function getAdminTickets(request, response) {
  try {
    const adminId = getAuthenticatedUserId(request);

    const result = await supportService.getAdminTickets(
      adminId,
      request.query || {},
    );

    return sendSuccess(
      response,
      200,
      "Admin support tickets loaded successfully.",
      result,
    );
  } catch (error) {
    console.error("GET ADMIN SUPPORT TICKETS ERROR:", error);

    return sendError(response, error, "Unable to load support tickets.");
  }
}

/*
|--------------------------------------------------------------------------
| Admin: Get ticket details and messages
|--------------------------------------------------------------------------
*/

async function getAdminTicketDetails(request, response) {
  try {
    const adminId = getAuthenticatedUserId(request);

    const ticketId = request.params.ticketId;

    const result = await supportService.getAdminTicketDetails(
      adminId,
      ticketId,
    );

    return sendSuccess(
      response,
      200,
      "Admin support ticket loaded successfully.",
      result,
    );
  } catch (error) {
    console.error("GET ADMIN TICKET DETAILS ERROR:", error);

    return sendError(response, error, "Unable to load the support ticket.");
  }
}

/*
|--------------------------------------------------------------------------
| Admin: Reply to ticket
|--------------------------------------------------------------------------
*/

async function replyToTicketAsAdmin(request, response) {
  try {
    const adminId = getAuthenticatedUserId(request);

    const ticketId = request.params.ticketId;

    const result = await supportService.replyToTicketAsAdmin(
      adminId,
      ticketId,
      request.body || {},
      request.files || [],
    );

    return sendSuccess(
      response,
      201,
      "Admin support reply sent successfully.",
      result,
    );
  } catch (error) {
    console.error("ADMIN SUPPORT REPLY ERROR:", error);

    return sendError(response, error, "Unable to send the admin reply.");
  }
}

/*
|--------------------------------------------------------------------------
| Admin: Update status, priority or assignment
|--------------------------------------------------------------------------
*/

async function updateTicketAsAdmin(request, response) {
  try {
    const adminId = getAuthenticatedUserId(request);

    const ticketId = request.params.ticketId;

    const result = await supportService.updateTicketAsAdmin(
      adminId,
      ticketId,
      request.body || {},
    );

    return sendSuccess(
      response,
      200,
      "Support ticket updated successfully.",
      result,
    );
  } catch (error) {
    console.error("ADMIN SUPPORT TICKET UPDATE ERROR:", error);

    return sendError(response, error, "Unable to update the support ticket.");
  }
}

function sendAttachmentFile(response, attachment) {
  const safeFileName = String(attachment.originalName || "support-screenshot")
    .replace(/[\r\n"]/g, "_")
    .slice(0, 255);

  response.set({
    "Content-Type": attachment.mimeType || "application/octet-stream",

    "Content-Length": String(attachment.fileData.length),

    "Content-Disposition": `inline; filename="${safeFileName}"`,

    "Cache-Control": "private, max-age=300",

    "X-Content-Type-Options": "nosniff",
  });

  return response.status(200).send(attachment.fileData);
}

async function getMyAttachment(request, response) {
  try {
    const userId = getAuthenticatedUserId(request);

    const attachmentId = request.params.attachmentId;

    const attachment = await supportService.getSupportAttachment(
      userId,
      attachmentId,
      {
        adminAccess: false,
      },
    );

    return sendAttachmentFile(response, attachment);
  } catch (error) {
    console.error("GET USER SUPPORT ATTACHMENT ERROR:", error);

    return sendError(response, error, "Unable to load the support screenshot.");
  }
}

async function getAdminAttachment(request, response) {
  try {
    const adminId = getAuthenticatedUserId(request);

    const attachmentId = request.params.attachmentId;

    const attachment = await supportService.getSupportAttachment(
      adminId,
      attachmentId,
      {
        adminAccess: true,
      },
    );

    return sendAttachmentFile(response, attachment);
  } catch (error) {
    console.error("GET ADMIN SUPPORT ATTACHMENT ERROR:", error);

    return sendError(response, error, "Unable to load the support screenshot.");
  }
}

module.exports = {
  createTicket,
  getMyTickets,
  getMyTicketDetails,
  replyToMyTicket,
  closeMyTicket,

  getAdminTickets,
  getAdminTicketDetails,
  replyToTicketAsAdmin,
  updateTicketAsAdmin,
  getMyAttachment,
  getAdminAttachment,
};
