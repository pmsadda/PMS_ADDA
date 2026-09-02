"use strict";

(() => {
  const SUPPORT_STATE = {
    tickets: [],
    selectedTicketId: null,
    selectedTicket: null,
    isLoadingTickets: false,
    isLoadingDetails: false,
    isSubmittingTicket: false,
    isSendingReply: false,
    isClosingTicket: false,
    refreshTimer: null,
    realtimeRefreshTimer: null,
    socket: null,
    toastTimer: null,
    ticketAttachments: [],
    replyAttachments: [],
  };

  const ELEMENTS = {};

  const STATUS_LABELS = Object.freeze({
    open: "Open",
    in_progress: "In Progress",
    waiting_user: "Waiting for You",
    resolved: "Resolved",
    closed: "Closed",
  });

  const CATEGORY_LABELS = Object.freeze({
    deposit: "Deposit",
    withdraw: "Withdraw",
    wallet: "Wallet",
    teen_patti: "Teen Patti",
    poker: "Poker",
    ludo: "Ludo",
    account: "Account",
    technical: "Technical",
    other: "Other",
  });

  const PRIORITY_LABELS = Object.freeze({
    low: "Low",
    normal: "Normal",
    high: "High",
    urgent: "Urgent",
  });

  function cacheElements() {
    ELEMENTS.supportBackButton = document.getElementById("supportBackButton");

    ELEMENTS.openTicketModalButton = document.getElementById(
      "openTicketModalButton",
    );

    ELEMENTS.emptyNewTicketButton = document.getElementById(
      "emptyNewTicketButton",
    );

    ELEMENTS.refreshTicketsButton = document.getElementById(
      "refreshTicketsButton",
    );

    ELEMENTS.ticketStatusFilter = document.getElementById("ticketStatusFilter");

    ELEMENTS.ticketCountText = document.getElementById("ticketCountText");

    ELEMENTS.ticketList = document.getElementById("ticketList");

    ELEMENTS.ticketPanel = document.querySelector(".ticket-panel");

    ELEMENTS.conversationPanel = document.getElementById("conversationPanel");

    ELEMENTS.conversationEmpty = document.getElementById("conversationEmpty");

    ELEMENTS.conversationContent = document.getElementById(
      "conversationContent",
    );

    ELEMENTS.mobileTicketBackButton = document.getElementById(
      "mobileTicketBackButton",
    );

    ELEMENTS.activeTicketCode = document.getElementById("activeTicketCode");

    ELEMENTS.activeTicketStatus = document.getElementById("activeTicketStatus");

    ELEMENTS.activeTicketSubject = document.getElementById(
      "activeTicketSubject",
    );

    ELEMENTS.activeTicketMeta = document.getElementById("activeTicketMeta");

    ELEMENTS.closeTicketButton = document.getElementById("closeTicketButton");

    ELEMENTS.messageList = document.getElementById("messageList");

    ELEMENTS.ticketReplyForm = document.getElementById("ticketReplyForm");

    ELEMENTS.replyMessageInput = document.getElementById("replyMessageInput");

    ELEMENTS.sendReplyButton = document.getElementById("sendReplyButton");

    ELEMENTS.replyCharacterCount = document.getElementById(
      "replyCharacterCount",
    );

    ELEMENTS.replyControls = document.getElementById("replyControls");

    ELEMENTS.closedTicketNote = document.getElementById("closedTicketNote");

    ELEMENTS.ticketModal = document.getElementById("ticketModal");

    ELEMENTS.closeTicketModalButton = document.getElementById(
      "closeTicketModalButton",
    );

    ELEMENTS.cancelTicketButton = document.getElementById("cancelTicketButton");

    ELEMENTS.createTicketForm = document.getElementById("createTicketForm");

    ELEMENTS.ticketCategoryInput = document.getElementById(
      "ticketCategoryInput",
    );

    ELEMENTS.ticketSubjectInput = document.getElementById("ticketSubjectInput");

    ELEMENTS.ticketMessageInput = document.getElementById("ticketMessageInput");

    ELEMENTS.subjectCharacterCount = document.getElementById(
      "subjectCharacterCount",
    );

    ELEMENTS.messageCharacterCount = document.getElementById(
      "messageCharacterCount",
    );

    ELEMENTS.submitTicketButton = document.getElementById("submitTicketButton");

    ELEMENTS.closeConfirmationModal = document.getElementById(
      "closeConfirmationModal",
    );

    ELEMENTS.cancelCloseTicketButton = document.getElementById(
      "cancelCloseTicketButton",
    );

    ELEMENTS.confirmCloseTicketButton = document.getElementById(
      "confirmCloseTicketButton",
    );

    ELEMENTS.supportToast = document.getElementById("supportToast");

    ELEMENTS.supportToastIcon = document.getElementById("supportToastIcon");

    ELEMENTS.supportToastMessage = document.getElementById(
      "supportToastMessage",
    );

    ELEMENTS.ticketAttachmentInput = document.getElementById(
      "ticketAttachmentInput",
    );

    ELEMENTS.ticketAttachmentPreview = document.getElementById(
      "ticketAttachmentPreview",
    );

    ELEMENTS.replyAttachmentInput = document.getElementById(
      "replyAttachmentInput",
    );

    ELEMENTS.replyAttachmentPreview = document.getElementById(
      "replyAttachmentPreview",
    );
  }

  function getAccessToken() {
    return (
      localStorage.getItem("access_token") ||
      localStorage.getItem("token") ||
      ""
    );
  }

  function createApiUrl(path) {
    if (window.APP_CONFIG && typeof window.APP_CONFIG.api === "function") {
      return window.APP_CONFIG.api(path);
    }

    return `/api${path}`;
  }

  async function apiRequest(path, options = {}) {
    const token = getAccessToken();

    if (!token) {
      window.location.replace("/login");

      throw new Error("Authentication token পাওয়া যায়নি।");
    }

    const headers = {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    };

    if (options.body !== undefined && !(options.body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(createApiUrl(path), {
      ...options,
      headers,
    });

    let result = null;

    try {
      result = await response.json();
    } catch {
      result = {
        success: false,
        message: "Server থেকে সঠিক response পাওয়া যায়নি।",
      };
    }

    if (response.status === 401 || response.status === 403) {
      if (response.status === 401) {
        localStorage.removeItem("access_token");

        localStorage.removeItem("token");
      }
    }

    if (!response.ok || result.success === false) {
      const error = new Error(result.message || "Support request failed.");

      error.statusCode = response.status;

      error.code = result.code || null;

      throw error;
    }

    return result;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatStatus(status) {
    return STATUS_LABELS[status] || String(status || "Unknown");
  }

  function formatCategory(category) {
    return CATEGORY_LABELS[category] || String(category || "Other");
  }

  function formatPriority(priority) {
    return PRIORITY_LABELS[priority] || String(priority || "Normal");
  }

  function formatDate(value) {
    if (!value) {
      return "—";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "—";
    }

    return new Intl.DateTimeFormat("en-BD", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  function showToast(message, type = "success") {
    window.clearTimeout(SUPPORT_STATE.toastTimer);

    ELEMENTS.supportToastMessage.textContent = message;

    const isError = type === "error";

    ELEMENTS.supportToast.classList.toggle("is-error", isError);

    ELEMENTS.supportToastIcon.className = isError
      ? "fa-solid fa-circle-exclamation"
      : "fa-solid fa-circle-check";

    ELEMENTS.supportToast.hidden = false;

    SUPPORT_STATE.toastTimer = window.setTimeout(() => {
      ELEMENTS.supportToast.hidden = true;
    }, 3500);
  }

  function setButtonLoading(button, isLoading, loadingText = "Please wait...") {
    if (!button) {
      return;
    }

    if (isLoading) {
      if (!button.dataset.originalHtml) {
        button.dataset.originalHtml = button.innerHTML;
      }

      button.disabled = true;

      button.innerHTML = `
        <i class="fa-solid fa-spinner fa-spin"></i>
        <span>${escapeHtml(loadingText)}</span>
      `;

      return;
    }

    button.disabled = false;

    if (button.dataset.originalHtml) {
      button.innerHTML = button.dataset.originalHtml;
    }
  }

  function renderTicketLoading() {
    ELEMENTS.ticketList.innerHTML = `
      <div class="ticket-loading">
        <span class="loading-spinner"></span>
        <p>Loading support tickets...</p>
      </div>
    `;
  }

  function renderTicketEmpty() {
    ELEMENTS.ticketList.innerHTML = `
      <div class="ticket-empty-state">
        <i class="fa-regular fa-folder-open"></i>
        <strong>No Support Tickets</strong>
        <p>নতুন Ticket তৈরি করে Support Team-এর সাহায্য নিন।</p>
      </div>
    `;
  }

  function renderTickets() {
    const tickets = SUPPORT_STATE.tickets;

    ELEMENTS.ticketCountText.textContent = `${tickets.length} ticket${
      tickets.length === 1 ? "" : "s"
    } found`;

    if (!tickets.length) {
      renderTicketEmpty();
      return;
    }

    ELEMENTS.ticketList.innerHTML = tickets
      .map((ticket) => {
        const ticketId = Number(ticket.id);

        const isActive = ticketId === Number(SUPPORT_STATE.selectedTicketId);

        const unreadMessages = Number(ticket.unreadMessages || 0);

        return `
            <button
              type="button"
              class="ticket-card${isActive ? " is-active" : ""}"
              data-ticket-id="${ticketId}"
            >
              <div class="ticket-card-top">
                <span class="ticket-card-code">
                  ${escapeHtml(ticket.ticketCode)}
                </span>

                <span
                  class="status-badge status-${escapeHtml(ticket.status)}"
                >
                  ${escapeHtml(formatStatus(ticket.status))}
                </span>
              </div>

              <h3>
                ${escapeHtml(ticket.subject)}
              </h3>

              <p class="ticket-card-message">
                ${escapeHtml(ticket.lastMessage || "No message")}
              </p>

              <div class="ticket-card-bottom">
                <span class="ticket-card-category">
                  ${escapeHtml(formatCategory(ticket.category))}
                  ·
                  ${escapeHtml(formatPriority(ticket.priority))}
                </span>

                <span>
                  ${escapeHtml(formatDate(ticket.lastMessageAt))}
                </span>

                ${
                  unreadMessages > 0
                    ? `
                      <span class="unread-badge">
                        ${unreadMessages}
                      </span>
                    `
                    : ""
                }
              </div>
            </button>
          `;
      })
      .join("");

    ELEMENTS.ticketList
      .querySelectorAll("[data-ticket-id]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          openTicket(Number(button.dataset.ticketId));
        });
      });
  }

  async function loadTickets({
    preserveSelection = true,
    silent = false,
  } = {}) {
    if (SUPPORT_STATE.isLoadingTickets) {
      return;
    }

    SUPPORT_STATE.isLoadingTickets = true;

    ELEMENTS.refreshTicketsButton.classList.add("is-loading");

    if (!silent) {
      renderTicketLoading();
    }

    try {
      const selectedStatus = ELEMENTS.ticketStatusFilter.value;

      const query = selectedStatus
        ? `?status=${encodeURIComponent(selectedStatus)}`
        : "";

      const result = await apiRequest(`/support/tickets${query}`);

      SUPPORT_STATE.tickets = Array.isArray(result.data) ? result.data : [];

      if (preserveSelection && SUPPORT_STATE.selectedTicketId) {
        const selectedExists = SUPPORT_STATE.tickets.some(
          (ticket) =>
            Number(ticket.id) === Number(SUPPORT_STATE.selectedTicketId),
        );

        if (!selectedExists) {
          clearConversation();
        }
      }

      renderTickets();
    } catch (error) {
      console.error("LOAD SUPPORT TICKETS ERROR:", error);

      ELEMENTS.ticketList.innerHTML = `
        <div class="ticket-empty-state">
          <i class="fa-solid fa-triangle-exclamation"></i>
          <strong>Tickets load করা যায়নি</strong>
          <p>${escapeHtml(error.message)}</p>
        </div>
      `;

      showToast(error.message, "error");
    } finally {
      SUPPORT_STATE.isLoadingTickets = false;

      ELEMENTS.refreshTicketsButton.classList.remove("is-loading");
    }
  }

  function renderConversationHeader(ticket) {
    ELEMENTS.activeTicketCode.textContent = ticket.ticketCode;

    ELEMENTS.activeTicketSubject.textContent = ticket.subject;

    ELEMENTS.activeTicketMeta.textContent = `${formatCategory(
      ticket.category,
    )} · ${formatPriority(ticket.priority)}`;

    ELEMENTS.activeTicketStatus.textContent = formatStatus(ticket.status);

    ELEMENTS.activeTicketStatus.className = `status-badge status-${ticket.status}`;

    const isClosed = ticket.status === "closed";

    ELEMENTS.closeTicketButton.hidden = isClosed;

    ELEMENTS.replyControls.hidden = isClosed;

    ELEMENTS.replyCharacterCount.hidden = isClosed;

    ELEMENTS.closedTicketNote.hidden = !isClosed;
  }

  function renderMessages(messages) {
    if (!Array.isArray(messages) || !messages.length) {
      ELEMENTS.messageList.innerHTML = `
        <div class="ticket-empty-state">
          <i class="fa-regular fa-message"></i>
          <strong>No Messages</strong>
        </div>
      `;

      return;
    }

    ELEMENTS.messageList.innerHTML = messages
      .map((message) => {
        const senderType = message.senderType === "admin" ? "admin" : "user";

        const senderName =
          senderType === "admin"
            ? message.senderName || "PMS ADDA Support"
            : "You";

        return `
            <div
              class="message-row is-${senderType}"
            >
              <article class="message-bubble">
                <div class="message-sender">
                  ${
                    senderType === "admin"
                      ? '<i class="fa-solid fa-headset"></i>'
                      : '<i class="fa-solid fa-user"></i>'
                  }

                  ${escapeHtml(senderName)}
                </div>

                <p class="message-text">${escapeHtml(message.messageText)}</p>

                <div class="message-time">
                  ${escapeHtml(formatDate(message.createdAt))}
                </div>
              </article>
            </div>
          `;
      })
      .join("");

    window.requestAnimationFrame(() => {
      ELEMENTS.messageList.scrollTop = ELEMENTS.messageList.scrollHeight;
    });
  }

  function showConversation() {
    ELEMENTS.conversationEmpty.hidden = true;

    ELEMENTS.conversationContent.hidden = false;

    if (window.matchMedia("(max-width: 760px)").matches) {
      ELEMENTS.ticketPanel.classList.add("is-hidden-mobile");

      ELEMENTS.conversationPanel.classList.add("is-open-mobile");
    }
  }

  function clearConversation() {
    SUPPORT_STATE.selectedTicketId = null;

    SUPPORT_STATE.selectedTicket = null;

    ELEMENTS.conversationContent.hidden = true;

    ELEMENTS.conversationEmpty.hidden = false;

    ELEMENTS.conversationPanel.classList.remove("is-open-mobile");

    ELEMENTS.ticketPanel.classList.remove("is-hidden-mobile");

    renderTickets();
  }

  async function openTicket(ticketId, { silent = false } = {}) {
    if (SUPPORT_STATE.isLoadingDetails) {
      return;
    }

    SUPPORT_STATE.selectedTicketId = ticketId;

    SUPPORT_STATE.isLoadingDetails = true;

    renderTickets();
    showConversation();

    if (!silent) {
      ELEMENTS.messageList.innerHTML = `
        <div class="message-loading">
          <span class="loading-spinner"></span>
          <p>Loading conversation...</p>
        </div>
      `;
    }

    try {
      const result = await apiRequest(`/support/tickets/${ticketId}`);

      const details = result.data || {};

      const ticket = details.ticket;

      if (!ticket) {
        throw new Error("Support ticket details পাওয়া যায়নি।");
      }

      SUPPORT_STATE.selectedTicket = ticket;

      renderConversationHeader(ticket);

      renderMessages(details.messages || []);

      await loadTickets({
        preserveSelection: true,
        silent: true,
      });
    } catch (error) {
      console.error("OPEN SUPPORT TICKET ERROR:", error);

      showToast(error.message, "error");

      clearConversation();
    } finally {
      SUPPORT_STATE.isLoadingDetails = false;
    }
  }

  function openTicketModal() {
    ELEMENTS.ticketModal.hidden = false;

    document.body.style.overflow = "hidden";

    window.setTimeout(() => {
      ELEMENTS.ticketCategoryInput.focus();
    }, 50);
  }

  function closeTicketModal() {
    if (SUPPORT_STATE.isSubmittingTicket) {
      return;
    }

    ELEMENTS.ticketModal.hidden = true;

    document.body.style.overflow = "";

    ELEMENTS.createTicketForm.reset();

    updateCreateTicketCounters();
  }

  function openCloseConfirmation() {
    if (!SUPPORT_STATE.selectedTicketId) {
      return;
    }

    ELEMENTS.closeConfirmationModal.hidden = false;

    document.body.style.overflow = "hidden";
  }

  function closeCloseConfirmation() {
    if (SUPPORT_STATE.isClosingTicket) {
      return;
    }

    ELEMENTS.closeConfirmationModal.hidden = true;

    document.body.style.overflow = "";
  }

  function updateCreateTicketCounters() {
    ELEMENTS.subjectCharacterCount.textContent = `${
      ELEMENTS.ticketSubjectInput.value.length
    } / 150`;

    ELEMENTS.messageCharacterCount.textContent = `${
      ELEMENTS.ticketMessageInput.value.length
    } / 3000`;
  }

  function updateReplyCounter() {
    ELEMENTS.replyCharacterCount.textContent = `${
      ELEMENTS.replyMessageInput.value.length
    } / 3000`;

    ELEMENTS.replyMessageInput.style.height = "auto";

    ELEMENTS.replyMessageInput.style.height = `${Math.min(
      ELEMENTS.replyMessageInput.scrollHeight,
      120,
    )}px`;
  }

  const SUPPORT_IMAGE_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);

  const MAX_SUPPORT_IMAGE_SIZE = 3 * 1024 * 1024;

  const MAX_SUPPORT_IMAGES = 3;

  function getAttachmentState(type) {
    return type === "reply"
      ? SUPPORT_STATE.replyAttachments
      : SUPPORT_STATE.ticketAttachments;
  }

  function setAttachmentState(type, files) {
    if (type === "reply") {
      SUPPORT_STATE.replyAttachments = files;
    } else {
      SUPPORT_STATE.ticketAttachments = files;
    }
  }

  function getAttachmentPreview(type) {
    return type === "reply"
      ? ELEMENTS.replyAttachmentPreview
      : ELEMENTS.ticketAttachmentPreview;
  }

  function getAttachmentInput(type) {
    return type === "reply"
      ? ELEMENTS.replyAttachmentInput
      : ELEMENTS.ticketAttachmentInput;
  }

  function renderAttachmentPreview(type) {
    const preview = getAttachmentPreview(type);

    const files = getAttachmentState(type);

    if (!preview) {
      return;
    }

    preview.innerHTML = "";

    if (!files.length) {
      preview.hidden = true;
      return;
    }

    preview.hidden = false;

    files.forEach((file, index) => {
      const item = document.createElement("div");

      item.className = "support-attachment-item";

      const image = document.createElement("img");

      const objectUrl = URL.createObjectURL(file);

      image.src = objectUrl;
      image.alt = file.name || "Support screenshot";

      image.addEventListener(
        "load",
        () => {
          URL.revokeObjectURL(objectUrl);
        },
        {
          once: true,
        },
      );

      const removeButton = document.createElement("button");

      removeButton.type = "button";

      removeButton.className = "support-attachment-remove";

      removeButton.setAttribute("aria-label", "Remove screenshot");

      removeButton.innerHTML = `
      <i class="fa-solid fa-xmark"></i>
    `;

      removeButton.addEventListener("click", () => {
        const nextFiles = getAttachmentState(type).filter(
          (unusedFile, fileIndex) => fileIndex !== index,
        );

        setAttachmentState(type, nextFiles);

        const input = getAttachmentInput(type);

        if (input) {
          input.value = "";
        }

        renderAttachmentPreview(type);
      });

      item.append(image, removeButton);

      preview.appendChild(item);
    });
  }

  function handleAttachmentSelection(event, type) {
    const files = Array.from(event.target.files || []);

    if (files.length > MAX_SUPPORT_IMAGES) {
      event.target.value = "";

      showToast("সর্বোচ্চ ৩টি screenshot নির্বাচন করা যাবে।", "error");

      return;
    }

    const invalidType = files.find(
      (file) => !SUPPORT_IMAGE_TYPES.has(String(file.type || "").toLowerCase()),
    );

    if (invalidType) {
      event.target.value = "";

      showToast("শুধু JPG, PNG অথবা WEBP image ব্যবহার করুন।", "error");

      return;
    }

    const oversizedFile = files.find(
      (file) => Number(file.size) > MAX_SUPPORT_IMAGE_SIZE,
    );

    if (oversizedFile) {
      event.target.value = "";

      showToast("প্রতিটি screenshot সর্বোচ্চ ৩ MB হতে পারবে।", "error");

      return;
    }

    setAttachmentState(type, files);

    renderAttachmentPreview(type);
  }

  function clearSupportAttachments(type) {
    setAttachmentState(type, []);

    const input = getAttachmentInput(type);

    if (input) {
      input.value = "";
    }

    renderAttachmentPreview(type);
  }

  async function handleCreateTicket(event) {
    event.preventDefault();

    if (SUPPORT_STATE.isSubmittingTicket) {
      return;
    }

    const category = ELEMENTS.ticketCategoryInput.value;

    const subject = ELEMENTS.ticketSubjectInput.value.trim();

    const message = ELEMENTS.ticketMessageInput.value.trim();

    if (!category) {
      showToast("একটি Support category নির্বাচন করুন।", "error");

      return;
    }

    if (subject.length < 5 || subject.length > 150) {
      showToast("Subject 5 থেকে 150 character হতে হবে।", "error");

      return;
    }

    if (message.length < 10 || message.length > 3000) {
      showToast("Message 10 থেকে 3000 character হতে হবে।", "error");

      return;
    }

    SUPPORT_STATE.isSubmittingTicket = true;

    setButtonLoading(ELEMENTS.submitTicketButton, true, "Submitting...");

    try {
      const formData = new FormData();

      formData.append("category", category);
      formData.append("subject", subject);
      formData.append("message", message);

      SUPPORT_STATE.ticketAttachments.forEach((file) => {
        formData.append("attachments", file, file.name);
      });

      const result = await apiRequest("/support/tickets", {
        method: "POST",
        body: formData,
      });

      const createdTicket = result.data?.ticket || result.data;

      SUPPORT_STATE.isSubmittingTicket = false;

      clearSupportAttachments("ticket");

      closeTicketModal();

      showToast("Support Ticket সফলভাবে তৈরি হয়েছে।");

      await loadTickets({
        preserveSelection: false,
      });

      if (createdTicket?.id) {
        await openTicket(Number(createdTicket.id));
      } else if (SUPPORT_STATE.tickets[0]?.id) {
        await openTicket(Number(SUPPORT_STATE.tickets[0].id));
      }
    } catch (error) {
      console.error("CREATE SUPPORT TICKET ERROR:", error);

      showToast(error.message, "error");
    } finally {
      SUPPORT_STATE.isSubmittingTicket = false;

      setButtonLoading(ELEMENTS.submitTicketButton, false);
    }
  }

  async function handleSendReply(event) {
    event.preventDefault();

    if (SUPPORT_STATE.isSendingReply || !SUPPORT_STATE.selectedTicketId) {
      return;
    }

    const message = ELEMENTS.replyMessageInput.value.trim();

    if (message.length < 1 || message.length > 3000) {
      showToast("Reply message লিখুন।", "error");

      ELEMENTS.replyMessageInput.focus();

      return;
    }

    SUPPORT_STATE.isSendingReply = true;

    ELEMENTS.sendReplyButton.disabled = true;

    ELEMENTS.sendReplyButton.innerHTML = `
    <i class="fa-solid fa-spinner fa-spin"></i>
  `;

    try {
      const formData = new FormData();

      formData.append("message", message);

      SUPPORT_STATE.replyAttachments.forEach((file) => {
        formData.append("attachments", file, file.name);
      });

      await apiRequest(
        `/support/tickets/${SUPPORT_STATE.selectedTicketId}/messages`,
        {
          method: "POST",
          body: formData,
        },
      );

      ELEMENTS.replyMessageInput.value = "";

      clearSupportAttachments("reply");

      updateReplyCounter();

      await openTicket(SUPPORT_STATE.selectedTicketId);

      showToast("Message এবং screenshot সফলভাবে পাঠানো হয়েছে।");
    } catch (error) {
      console.error("SEND SUPPORT REPLY ERROR:", error);

      showToast(error.message, "error");
    } finally {
      SUPPORT_STATE.isSendingReply = false;

      ELEMENTS.sendReplyButton.disabled = false;

      ELEMENTS.sendReplyButton.innerHTML = `
      <i class="fa-solid fa-paper-plane"></i>
    `;
    }
  }

  async function handleCloseTicket() {
    if (SUPPORT_STATE.isClosingTicket || !SUPPORT_STATE.selectedTicketId) {
      return;
    }

    SUPPORT_STATE.isClosingTicket = true;

    setButtonLoading(ELEMENTS.confirmCloseTicketButton, true, "Closing...");

    try {
      await apiRequest(
        `/support/tickets/${SUPPORT_STATE.selectedTicketId}/close`,
        {
          method: "PATCH",
        },
      );

      closeCloseConfirmation();

      await openTicket(SUPPORT_STATE.selectedTicketId);

      showToast("Support Ticket বন্ধ করা হয়েছে।");
    } catch (error) {
      console.error("CLOSE SUPPORT TICKET ERROR:", error);

      showToast(error.message, "error");
    } finally {
      SUPPORT_STATE.isClosingTicket = false;

      setButtonLoading(ELEMENTS.confirmCloseTicketButton, false);
    }
  }

  function bindEvents() {
    ELEMENTS.supportBackButton.addEventListener("click", () => {
      window.location.href = "./lobby";
    });

    ELEMENTS.openTicketModalButton.addEventListener("click", openTicketModal);

    ELEMENTS.emptyNewTicketButton.addEventListener("click", openTicketModal);

    ELEMENTS.closeTicketModalButton.addEventListener("click", closeTicketModal);

    ELEMENTS.cancelTicketButton.addEventListener("click", closeTicketModal);

    document
      .querySelectorAll("[data-close-ticket-modal]")
      .forEach((element) => {
        element.addEventListener("click", closeTicketModal);
      });

    ELEMENTS.createTicketForm.addEventListener("submit", handleCreateTicket);

    ELEMENTS.ticketSubjectInput.addEventListener(
      "input",
      updateCreateTicketCounters,
    );

    ELEMENTS.ticketMessageInput.addEventListener(
      "input",
      updateCreateTicketCounters,
    );

    ELEMENTS.refreshTicketsButton.addEventListener("click", () => {
      loadTickets({
        preserveSelection: true,
      });
    });

    ELEMENTS.ticketStatusFilter.addEventListener("change", () => {
      clearConversation();

      loadTickets({
        preserveSelection: false,
      });
    });

    ELEMENTS.ticketReplyForm.addEventListener("submit", handleSendReply);

    ELEMENTS.replyMessageInput.addEventListener("input", updateReplyCounter);

    ELEMENTS.closeTicketButton.addEventListener("click", openCloseConfirmation);

    ELEMENTS.cancelCloseTicketButton.addEventListener(
      "click",
      closeCloseConfirmation,
    );

    ELEMENTS.confirmCloseTicketButton.addEventListener(
      "click",
      handleCloseTicket,
    );

    document
      .querySelectorAll("[data-close-confirmation-modal]")
      .forEach((element) => {
        element.addEventListener("click", closeCloseConfirmation);
      });

    ELEMENTS.mobileTicketBackButton.addEventListener(
      "click",
      clearConversation,
    );

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") {
        return;
      }

      if (!ELEMENTS.ticketModal.hidden) {
        closeTicketModal();
      }

      if (!ELEMENTS.closeConfirmationModal.hidden) {
        closeCloseConfirmation();
      }
    });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        loadTickets({
          preserveSelection: true,
          silent: true,
        });

        if (SUPPORT_STATE.selectedTicketId) {
          openTicket(SUPPORT_STATE.selectedTicketId, {
            silent: true,
          });
        }
      }
    });

    ELEMENTS.ticketAttachmentInput.addEventListener("change", (event) => {
      handleAttachmentSelection(event, "ticket");
    });

    ELEMENTS.replyAttachmentInput.addEventListener("change", (event) => {
      handleAttachmentSelection(event, "reply");
    });
  }

  function startAutoRefresh() {
    window.clearInterval(SUPPORT_STATE.refreshTimer);

    SUPPORT_STATE.refreshTimer = window.setInterval(() => {
      if (document.visibilityState !== "visible") {
        return;
      }

      loadTickets({
        preserveSelection: true,
        silent: true,
      });

      if (SUPPORT_STATE.selectedTicketId && !SUPPORT_STATE.isSendingReply) {
        openTicket(SUPPORT_STATE.selectedTicketId, {
          silent: true,
        });
      }
    }, 20000);
  }

  function scheduleRealtimeRefresh(update = {}) {
    window.clearTimeout(SUPPORT_STATE.realtimeRefreshTimer);

    SUPPORT_STATE.realtimeRefreshTimer = window.setTimeout(async () => {
      await loadTickets({
        preserveSelection: true,
        silent: true,
      });

      const updatedTicketId = Number(update.ticketId);

      if (
        SUPPORT_STATE.selectedTicketId &&
        Number(SUPPORT_STATE.selectedTicketId) === updatedTicketId &&
        !SUPPORT_STATE.isSendingReply
      ) {
        await openTicket(SUPPORT_STATE.selectedTicketId, {
          silent: true,
        });
      }
    }, 150);
  }

  function connectSupportSocket() {
    /*
     * Socket.IO load ব্যর্থ হলে existing
     * automatic HTTP refresh চালু থাকবে।
     */
    if (typeof window.io !== "function") {
      startAutoRefresh();

      return;
    }

    const token = getAccessToken();

    SUPPORT_STATE.socket = window.io(
      `${window.APP_CONFIG.SERVER_URL}/support`,
      {
        auth: {
          token,
        },

        transports: ["websocket", "polling"],

        reconnection: true,

        reconnectionAttempts: Infinity,

        reconnectionDelay: 700,

        timeout: 10000,
      },
    );

    SUPPORT_STATE.socket.on("connect", () => {
      /*
       * Live socket চালু হলে unnecessary
       * polling বন্ধ হবে।
       */
      window.clearInterval(SUPPORT_STATE.refreshTimer);

      loadTickets({
        preserveSelection: true,
        silent: true,
      });
    });

    SUPPORT_STATE.socket.on("support:update", scheduleRealtimeRefresh);

    SUPPORT_STATE.socket.on("account:blocked", (payload = {}) => {
      window.alert(payload.message || "Your account has been banned.");

      if (typeof window.AUTH_SESSION?.logout === "function") {
        window.AUTH_SESSION.logout();
        return;
      }

      [
        "access_token",
        "token",
        "refresh_token",
        "current_user",
        "user",
        "user_id",
      ].forEach((key) => {
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);
      });

      window.location.replace("/login");
    });

    SUPPORT_STATE.socket.on("disconnect", () => {
      startAutoRefresh();
    });

    SUPPORT_STATE.socket.on("connect_error", (error) => {
      console.warn("SUPPORT SOCKET CONNECTION WARNING:", error.message);

      startAutoRefresh();
    });
  }

  async function initializeSupport() {
    cacheElements();
    bindEvents();

    updateCreateTicketCounters();
    updateReplyCounter();

    await loadTickets({
      preserveSelection: false,
    });

    connectSupportSocket();

    console.log("✅ PMS ADDA Support Center loaded");
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeSupport, {
      once: true,
    });
  } else {
    initializeSupport();
  }
})();
