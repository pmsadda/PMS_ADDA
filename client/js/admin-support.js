"use strict";

/* =========================================================
   PMS ADDA — ADMIN SUPPORT FRONTEND
========================================================= */

(() => {
  /* =====================================================
       CONFIGURATION
    ===================================================== */

  const SUPPORT_API_BASE = "/support/admin/tickets";

  const state = {
    tickets: [],
    selectedTicketId: null,
    selectedTicket: null,

    currentPage: 1,
    totalPages: 1,
    totalItems: 0,
    pageLimit: 15,

    search: "",
    status: "",
    priority: "",
    category: "",

    isLoading: false,
    isDetailsLoading: false,
    isSubmittingReply: false,
    isUpdatingTicket: false,

    searchTimer: null,
    refreshTimer: null,

    confirmResolver: null,

    attachmentCache: new Map(),

    attachmentLoadingIds: new Set(),

    previewAttachment: null,

    currentAdmin: {
      id: null,
      name: "Administrator",
      avatarUrl: null,
    },
  };

  /* =====================================================
       DOM ELEMENTS
    ===================================================== */

  const elements = {
    adminSidebar: document.getElementById("adminSidebar"),

    sidebarToggle: document.getElementById("sidebarToggle"),

    sidebarOverlay: document.getElementById("sidebarOverlay"),

    adminLogoutBtn: document.getElementById("adminLogoutBtn"),

    refreshSupport: document.getElementById("refreshSupport"),

    adminName: document.getElementById("adminName"),

    adminAvatarFallback: document.getElementById("adminAvatarFallback"),

    openSupportMenuCount: document.getElementById("openSupportMenuCount"),

    totalTicketCount: document.getElementById("totalTicketCount"),

    openTicketCount: document.getElementById("openTicketCount"),

    progressTicketCount: document.getElementById("progressTicketCount"),

    resolvedTicketCount: document.getElementById("resolvedTicketCount"),

    urgentTicketCount: document.getElementById("urgentTicketCount"),

    supportSearchInput: document.getElementById("supportSearchInput"),

    supportStatusFilter: document.getElementById("supportStatusFilter"),

    supportPriorityFilter: document.getElementById("supportPriorityFilter"),

    supportCategoryFilter: document.getElementById("supportCategoryFilter"),

    clearSupportFilters: document.getElementById("clearSupportFilters"),

    supportLoading: document.getElementById("supportLoading"),

    supportResultText: document.getElementById("supportResultText"),

    supportTicketTableBody: document.getElementById("supportTicketTableBody"),

    supportEmptyState: document.getElementById("supportEmptyState"),

    supportPreviousPage: document.getElementById("supportPreviousPage"),

    supportNextPage: document.getElementById("supportNextPage"),

    supportPageNumbers: document.getElementById("supportPageNumbers"),

    ticketPanelOverlay: document.getElementById("ticketPanelOverlay"),

    ticketDetailsPanel: document.getElementById("ticketDetailsPanel"),

    closeTicketPanel: document.getElementById("closeTicketPanel"),

    ticketDetailsLoading: document.getElementById("ticketDetailsLoading"),

    ticketDetailsBody: document.getElementById("ticketDetailsBody"),

    detailsTicketCode: document.getElementById("detailsTicketCode"),

    detailsTicketSubject: document.getElementById("detailsTicketSubject"),

    detailsUserAvatar: document.getElementById("detailsUserAvatar"),

    detailsUserName: document.getElementById("detailsUserName"),

    detailsUserUid: document.getElementById("detailsUserUid"),

    detailsUserPhone: document.getElementById("detailsUserPhone"),

    detailsUserEmail: document.getElementById("detailsUserEmail"),

    detailsStatusSelect: document.getElementById("detailsStatusSelect"),

    detailsPrioritySelect: document.getElementById("detailsPrioritySelect"),

    assignTicketToMe: document.getElementById("assignTicketToMe"),

    saveTicketChanges: document.getElementById("saveTicketChanges"),

    detailsAssignedAdmin: document.getElementById("detailsAssignedAdmin"),

    detailsCategory: document.getElementById("detailsCategory"),

    detailsCreatedAt: document.getElementById("detailsCreatedAt"),

    detailsUpdatedAt: document.getElementById("detailsUpdatedAt"),

    detailsMessageCount: document.getElementById("detailsMessageCount"),

    refreshConversation: document.getElementById("refreshConversation"),

    ticketConversation: document.getElementById("ticketConversation"),

    adminSupportReplyForm: document.getElementById("adminSupportReplyForm"),

    adminReplyMessage: document.getElementById("adminReplyMessage"),

    adminReplyCharacterCount: document.getElementById(
      "adminReplyCharacterCount",
    ),

    sendAdminReply: document.getElementById("sendAdminReply"),

    adminToastContainer: document.getElementById("adminToastContainer"),

    supportConfirmModal: document.getElementById("supportConfirmModal"),

    confirmDialogIcon: document.getElementById("confirmDialogIcon"),

    confirmDialogTitle: document.getElementById("confirmDialogTitle"),

    confirmDialogMessage: document.getElementById("confirmDialogMessage"),

    cancelConfirmAction: document.getElementById("cancelConfirmAction"),

    acceptConfirmAction: document.getElementById("acceptConfirmAction"),

    attachmentPreviewModal: document.getElementById("attachmentPreviewModal"),

    attachmentPreviewTitle: document.getElementById("attachmentPreviewTitle"),

    attachmentPreviewMeta: document.getElementById("attachmentPreviewMeta"),

    attachmentPreviewContent: document.getElementById(
      "attachmentPreviewContent",
    ),

    closeAttachmentPreview: document.getElementById("closeAttachmentPreview"),

    cancelAttachmentPreview: document.getElementById("cancelAttachmentPreview"),

    downloadPreviewAttachment: document.getElementById(
      "downloadPreviewAttachment",
    ),
  };

  /* =====================================================
       BASIC HELPERS
    ===================================================== */

  const firstDefined = (...values) => {
    return values.find((value) => value !== undefined && value !== null);
  };

  const toNumber = (value, fallback = 0) => {
    const numericValue = Number(value);

    return Number.isFinite(numericValue) ? numericValue : fallback;
  };

  const getAccessToken = () => {
    return (
      localStorage.getItem("access_token") ||
      localStorage.getItem("token") ||
      ""
    );
  };

  const buildApiUrl = (path) => {
    if (window.APP_CONFIG && typeof window.APP_CONFIG.api === "function") {
      return window.APP_CONFIG.api(path);
    }

    const serverUrl = window.APP_CONFIG?.SERVER_URL || window.location.origin;

    return String(serverUrl).replace(/\/+$/, "") + "/api" + path;
  };

  const escapeHtml = (value) => {
    const container = document.createElement("div");

    container.textContent = String(value ?? "");

    return container.innerHTML;
  };

  const normalizeText = (value, fallback = "—") => {
    const text = String(value ?? "").trim();

    return text || fallback;
  };

  const normalizeStatus = (value) => {
    return String(value || "open")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_");
  };

  const normalizePriority = (value) => {
    return String(value || "normal")
      .trim()
      .toLowerCase();
  };

  const normalizeCategory = (value) => {
    return String(value || "other")
      .trim()
      .toLowerCase();
  };

  const formatLabel = (value) => {
    return String(value || "")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  };

  const formatDateTime = (value) => {
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
  };

  const formatShortDate = (value) => {
    if (!value) {
      return {
        date: "—",
        time: "",
      };
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return {
        date: "—",
        time: "",
      };
    }

    return {
      date: new Intl.DateTimeFormat("en-BD", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(date),

      time: new Intl.DateTimeFormat("en-BD", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(date),
    };
  };

  const getInitials = (name) => {
    const cleanName = String(name || "User").trim();

    const words = cleanName.split(/\s+/).filter(Boolean);

    if (words.length === 0) {
      return "U";
    }

    if (words.length === 1) {
      return words[0].charAt(0).toUpperCase();
    }

    return (
      words[0].charAt(0) + words[words.length - 1].charAt(0)
    ).toUpperCase();
  };

  const decodeJwtPayload = (token) => {
    try {
      const payloadPart = String(token || "").split(".")[1];

      if (!payloadPart) {
        return {};
      }

      const normalizedPayload = payloadPart
        .replace(/-/g, "+")
        .replace(/_/g, "/");

      const paddedPayload = normalizedPayload.padEnd(
        Math.ceil(normalizedPayload.length / 4) * 4,
        "=",
      );

      return JSON.parse(
        decodeURIComponent(
          Array.from(atob(paddedPayload))
            .map((character) => {
              return (
                "%" + character.charCodeAt(0).toString(16).padStart(2, "0")
              );
            })
            .join(""),
        ),
      );
    } catch (error) {
      console.warn("ADMIN TOKEN PARSE WARNING:", error);

      return {};
    }
  };

  const parseStoredUser = () => {
    const keys = ["current_user", "user", "admin_user"];

    for (const key of keys) {
      try {
        const storedValue = localStorage.getItem(key);

        if (!storedValue) {
          continue;
        }

        const parsedValue = JSON.parse(storedValue);

        if (parsedValue && typeof parsedValue === "object") {
          return parsedValue;
        }
      } catch (error) {
        console.warn(`Unable to parse ${key}.`, error);
      }
    }

    return {};
  };

  /* =====================================================
       CURRENT ADMIN
    ===================================================== */

  const loadCurrentAdmin = () => {
    const tokenPayload = decodeJwtPayload(getAccessToken());

    const storedUser = parseStoredUser();

    state.currentAdmin.id =
      toNumber(
        firstDefined(
          storedUser.id,
          storedUser.userId,
          storedUser.user_id,
          tokenPayload.id,
          tokenPayload.userId,
          tokenPayload.user_id,
        ),
        0,
      ) || null;

    state.currentAdmin.name = normalizeText(
      firstDefined(
        storedUser.fullName,
        storedUser.full_name,
        storedUser.name,
        storedUser.username,
        tokenPayload.fullName,
        tokenPayload.full_name,
        tokenPayload.name,
        tokenPayload.username,
      ),
      "Administrator",
    );

    state.currentAdmin.avatarUrl = firstDefined(
      storedUser.avatarUrl,
      storedUser.avatar_url,
      null,
    );

    if (elements.adminName) {
      elements.adminName.textContent = state.currentAdmin.name;
    }

    if (elements.adminAvatarFallback) {
      elements.adminAvatarFallback.textContent = getInitials(
        state.currentAdmin.name,
      );
    }
  };

  /* =====================================================
       HTTP CLIENT
    ===================================================== */

  const requestApi = async (path, options = {}) => {
    const token = getAccessToken();

    if (!token) {
      throw new Error("Admin login session was not found.");
    }

    const requestOptions = {
      method: options.method || "GET",

      headers: {
        Authorization: `Bearer ${token}`,

        Accept: "application/json",

        ...(options.headers || {}),
      },
    };

    if (options.body !== undefined) {
      requestOptions.headers["Content-Type"] = "application/json";

      requestOptions.body = JSON.stringify(options.body);
    }

    const response = await fetch(buildApiUrl(path), requestOptions);

    let result = null;

    try {
      result = await response.json();
    } catch (error) {
      result = null;
    }

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        if (response.status === 401) {
          clearLoginSession();
        }
      }

      const error = new Error(
        result?.message || `Request failed with status ${response.status}.`,
      );

      error.statusCode = response.status;

      error.code = result?.code || result?.errorCode || null;

      error.response = result;

      throw error;
    }

    return result;
  };

  /* =====================================================
       TOAST
    ===================================================== */

  const showToast = (type, message, title = "") => {
    if (!elements.adminToastContainer) {
      return;
    }

    const safeType = ["success", "error", "warning", "info"].includes(type)
      ? type
      : "info";

    const iconMap = {
      success: "fa-circle-check",

      error: "fa-circle-exclamation",

      warning: "fa-triangle-exclamation",

      info: "fa-circle-info",
    };

    const titleMap = {
      success: "Successful",
      error: "Error",
      warning: "Warning",
      info: "Information",
    };

    const toast = document.createElement("div");

    toast.className = `admin-toast ${safeType}`;

    toast.innerHTML = `
            <i class="fa-solid ${iconMap[safeType]}"></i>

            <div class="admin-toast-content">
                <strong>
                    ${escapeHtml(title || titleMap[safeType])}
                </strong>

                <span>
                    ${escapeHtml(message)}
                </span>
            </div>

            <button
                type="button"
                class="admin-toast-close"
                aria-label="Close notification">

                <i class="fa-solid fa-xmark"></i>
            </button>
        `;

    elements.adminToastContainer.appendChild(toast);

    const removeToast = () => {
      toast.remove();
    };

    toast
      .querySelector(".admin-toast-close")
      ?.addEventListener("click", removeToast);

    window.setTimeout(removeToast, 4500);
  };

  /* =====================================================
       CONFIRMATION MODAL
    ===================================================== */

  const showConfirmation = ({
    title = "Confirm Action",
    message = "Are you sure you want to continue?",
    confirmText = "Confirm",
    danger = false,
  } = {}) => {
    return new Promise((resolve) => {
      if (!elements.supportConfirmModal) {
        resolve(window.confirm(message));

        return;
      }

      if (state.confirmResolver) {
        state.confirmResolver(false);
      }

      state.confirmResolver = resolve;

      elements.confirmDialogTitle.textContent = title;

      elements.confirmDialogMessage.textContent = message;

      elements.acceptConfirmAction.textContent = confirmText;

      elements.confirmDialogIcon.innerHTML = danger
        ? '<i class="fa-solid fa-triangle-exclamation"></i>'
        : '<i class="fa-solid fa-circle-question"></i>';

      elements.acceptConfirmAction.style.background = danger
        ? "var(--red)"
        : "var(--gold)";

      elements.acceptConfirmAction.style.color = danger ? "#ffffff" : "#061419";

      elements.supportConfirmModal.hidden = false;
    });
  };

  const closeConfirmation = (accepted) => {
    if (elements.supportConfirmModal) {
      elements.supportConfirmModal.hidden = true;
    }

    const resolver = state.confirmResolver;

    state.confirmResolver = null;

    if (typeof resolver === "function") {
      resolver(accepted);
    }
  };

  /* =====================================================
       TICKET NORMALIZATION
    ===================================================== */

  const normalizeTicket = (ticket) => {
    const normalizedTicket = {
      id: toNumber(
        firstDefined(ticket?.id, ticket?.ticketId, ticket?.ticket_id),
        0,
      ),

      ticketCode: normalizeText(
        firstDefined(ticket?.ticketCode, ticket?.ticket_code, ticket?.code),
        "—",
      ),

      userId: toNumber(firstDefined(ticket?.userId, ticket?.user_id), 0),

      userName: normalizeText(
        firstDefined(
          ticket?.userName,
          ticket?.user_name,
          ticket?.fullName,
          ticket?.full_name,
          ticket?.username,
        ),
        "Unknown User",
      ),

      userUid: normalizeText(
        firstDefined(ticket?.userUid, ticket?.user_uid, ticket?.uid),
        "—",
      ),

      userPhone: normalizeText(
        firstDefined(ticket?.userPhone, ticket?.user_phone, ticket?.phone),
        "—",
      ),

      userEmail: normalizeText(
        firstDefined(ticket?.userEmail, ticket?.user_email, ticket?.email),
        "—",
      ),

      category: normalizeCategory(
        firstDefined(
          ticket?.category,
          ticket?.ticketCategory,
          ticket?.ticket_category,
        ),
      ),

      subject: normalizeText(ticket?.subject, "No subject"),

      status: normalizeStatus(
        firstDefined(
          ticket?.status,
          ticket?.ticketStatus,
          ticket?.ticket_status,
        ),
      ),

      priority: normalizePriority(
        firstDefined(
          ticket?.priority,
          ticket?.ticketPriority,
          ticket?.ticket_priority,
        ),
      ),

      assignedAdminId:
        toNumber(
          firstDefined(ticket?.assignedAdminId, ticket?.assigned_admin_id),
          0,
        ) || null,

      assignedAdminName: normalizeText(
        firstDefined(
          ticket?.assignedAdminName,
          ticket?.assigned_admin_name,
          ticket?.adminName,
          ticket?.admin_name,
        ),
        "Unassigned",
      ),

      lastMessage: normalizeText(
        firstDefined(ticket?.lastMessage, ticket?.last_message),
        "",
      ),

      unreadMessages: toNumber(
        firstDefined(
          ticket?.unreadMessages,
          ticket?.unread_messages,
          ticket?.unreadCount,
          ticket?.unread_count,
        ),
        0,
      ),

      messageCount: toNumber(
        firstDefined(
          ticket?.messageCount,
          ticket?.message_count,
          ticket?.totalMessages,
          ticket?.total_messages,
        ),
        0,
      ),

      createdAt: firstDefined(ticket?.createdAt, ticket?.created_at, null),

      updatedAt: firstDefined(
        ticket?.updatedAt,
        ticket?.updated_at,
        ticket?.lastMessageAt,
        ticket?.last_message_at,
        null,
      ),

      closedAt: firstDefined(ticket?.closedAt, ticket?.closed_at, null),
    };

    return normalizedTicket;
  };

  const normalizeAttachment = (attachment) => {
    const attachmentId = toNumber(
      firstDefined(
        attachment?.attachmentId,
        attachment?.attachment_id,
        attachment?.id,
      ),
      0,
    );

    return {
      id: attachmentId,

      attachmentId,

      ticketId: toNumber(
        firstDefined(attachment?.ticketId, attachment?.ticket_id),
        0,
      ),

      messageId: toNumber(
        firstDefined(attachment?.messageId, attachment?.message_id),
        0,
      ),

      originalName: normalizeText(
        firstDefined(
          attachment?.originalName,
          attachment?.original_name,
          attachment?.fileName,
          attachment?.file_name,
        ),
        "support-screenshot",
      ),

      mimeType: normalizeText(
        firstDefined(attachment?.mimeType, attachment?.mime_type),
        "application/octet-stream",
      ),

      fileExtension: normalizeText(
        firstDefined(
          attachment?.fileExtension,
          attachment?.file_extension,
          attachment?.extension,
        ),
        "",
      ).toLowerCase(),

      fileSize: Math.max(
        0,
        toNumber(firstDefined(attachment?.fileSize, attachment?.file_size), 0),
      ),

      uploadedByType: normalizeText(
        firstDefined(attachment?.uploadedByType, attachment?.uploaded_by_type),
        "",
      ).toLowerCase(),

      createdAt: firstDefined(
        attachment?.createdAt,
        attachment?.created_at,
        null,
      ),
    };
  };

  const formatAttachmentSize = (bytesValue) => {
    const bytes = Math.max(0, toNumber(bytesValue, 0));

    if (bytes === 0) {
      return "0 KB";
    }

    if (bytes < 1024) {
      return `${bytes} B`;
    }

    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const normalizeMessage = (message, ticket) => {
    const senderType = String(
      firstDefined(
        message?.senderType,
        message?.sender_type,
        message?.messageType,
        message?.message_type,
        "",
      ),
    )
      .trim()
      .toLowerCase();

    const senderRole = String(
      firstDefined(message?.senderRole, message?.sender_role, ""),
    )
      .trim()
      .toLowerCase();

    const isAdmin =
      firstDefined(message?.isAdmin, message?.is_admin, false) === true ||
      senderType === "admin" ||
      senderRole === "admin";

    const defaultSenderName = isAdmin
      ? "Support Admin"
      : ticket?.userName || "User";

    const rawAttachments = firstDefined(
      message?.attachments,
      message?.files,
      [],
    );

    return {
      id: toNumber(
        firstDefined(message?.id, message?.messageId, message?.message_id),
        0,
      ),

      isAdmin,

      senderName: normalizeText(
        firstDefined(
          message?.senderName,
          message?.sender_name,
          message?.adminName,
          message?.admin_name,
          message?.userName,
          message?.user_name,
        ),
        defaultSenderName,
      ),

      messageText: normalizeText(
        firstDefined(
          message?.message,
          message?.messageText,
          message?.message_text,
          message?.body,
          message?.content,
        ),
        "",
      ),

      createdAt: firstDefined(
        message?.createdAt,
        message?.created_at,
        message?.sentAt,
        message?.sent_at,
        null,
      ),

      attachments: Array.isArray(rawAttachments)
        ? rawAttachments
            .map(normalizeAttachment)
            .filter((attachment) => attachment.attachmentId > 0)
        : [],
    };
  };

  /* =====================================================
       SUPPORT ATTACHMENTS
    ===================================================== */

  const fetchAdminAttachment = async (attachmentIdValue) => {
    const attachmentId = toNumber(attachmentIdValue, 0);

    if (attachmentId <= 0) {
      throw new Error("Valid attachment ID was not found.");
    }

    const cachedEntry = state.attachmentCache.get(attachmentId);

    if (cachedEntry?.blob && cachedEntry?.objectUrl) {
      return cachedEntry;
    }

    if (cachedEntry?.promise) {
      return cachedEntry.promise;
    }

    const attachmentPromise = (async () => {
      const token = getAccessToken();

      if (!token) {
        throw new Error("Admin login session was not found.");
      }

      state.attachmentLoadingIds.add(attachmentId);

      try {
        const response = await fetch(
          buildApiUrl(`/support/admin/attachments/${attachmentId}`),
          {
            method: "GET",

            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "image/jpeg,image/png,image/webp",
            },
          },
        );

        if (!response.ok) {
          let errorMessage = `Attachment request failed with status ${response.status}.`;

          try {
            const errorResult = await response.json();

            errorMessage = errorResult?.message || errorMessage;
          } catch (error) {
            // Response JSON না হলেও default error থাকবে।
          }

          throw new Error(errorMessage);
        }

        const blob = await response.blob();

        if (!blob || !String(blob.type || "").startsWith("image/")) {
          throw new Error("The attachment is not a supported image.");
        }

        const objectUrl = URL.createObjectURL(blob);

        const result = {
          attachmentId,
          blob,
          objectUrl,
        };

        state.attachmentCache.set(attachmentId, result);

        return result;
      } catch (error) {
        state.attachmentCache.delete(attachmentId);

        throw error;
      } finally {
        state.attachmentLoadingIds.delete(attachmentId);
      }
    })();

    state.attachmentCache.set(attachmentId, {
      promise: attachmentPromise,
    });

    return attachmentPromise;
  };

  const renderMessageAttachments = (attachments = []) => {
    if (!Array.isArray(attachments) || attachments.length === 0) {
      return "";
    }

    return `
      <div class="message-attachments">

        ${attachments
          .map((attachment) => {
            const attachmentId = toNumber(attachment?.attachmentId, 0);

            const originalName = normalizeText(
              attachment?.originalName,
              "support-screenshot",
            );

            const mimeType = normalizeText(attachment?.mimeType, "image/jpeg");

            const fileSize = Math.max(0, toNumber(attachment?.fileSize, 0));

            return `
              <button
                type="button"
                class="message-attachment-card"
                data-attachment-id="${attachmentId}"
                data-attachment-name="${escapeHtml(originalName)}"
                data-attachment-type="${escapeHtml(mimeType)}"
                data-attachment-size="${fileSize}"
                aria-label="Preview ${escapeHtml(originalName)}">

                <span class="attachment-thumbnail">

                  <span class="attachment-thumbnail-loader">
                    <i class="fa-solid fa-spinner"></i>
                  </span>

                </span>

                <span class="attachment-card-info">

                  <strong class="attachment-card-name">
                    ${escapeHtml(originalName)}
                  </strong>

                  <span class="attachment-card-meta">
                    ${escapeHtml(formatAttachmentSize(fileSize))}
                  </span>

                </span>

                <span class="attachment-open-icon">
                  <i class="fa-solid fa-expand"></i>
                </span>

              </button>
            `;
          })
          .join("")}

      </div>
    `;
  };

  const hydrateAttachmentThumbnails = () => {
    const attachmentCards =
      elements.ticketConversation?.querySelectorAll(
        ".message-attachment-card[data-attachment-id]",
      ) || [];

    attachmentCards.forEach(async (card) => {
      const attachmentId = toNumber(card.dataset.attachmentId, 0);

      const thumbnail = card.querySelector(".attachment-thumbnail");

      if (
        attachmentId <= 0 ||
        !thumbnail ||
        card.dataset.thumbnailLoaded === "true"
      ) {
        return;
      }

      card.dataset.thumbnailLoaded = "loading";

      try {
        const attachmentResult = await fetchAdminAttachment(attachmentId);

        if (!card.isConnected) {
          return;
        }

        const image = document.createElement("img");

        image.src = attachmentResult.objectUrl;

        image.alt = card.dataset.attachmentName || "Support attachment";

        image.loading = "lazy";

        image.addEventListener(
          "error",
          () => {
            thumbnail.innerHTML = `
              <span class="attachment-thumbnail-error">
                <i class="fa-solid fa-image"></i>
                Preview unavailable
              </span>
            `;

            card.dataset.thumbnailLoaded = "error";
          },
          {
            once: true,
          },
        );

        thumbnail.replaceChildren(image);

        card.dataset.thumbnailLoaded = "true";
      } catch (error) {
        console.error("ADMIN ATTACHMENT THUMBNAIL ERROR:", error);

        if (!card.isConnected) {
          return;
        }

        thumbnail.innerHTML = `
          <span class="attachment-thumbnail-error">
            <i class="fa-solid fa-triangle-exclamation"></i>
            ${escapeHtml(error.message)}
          </span>
        `;

        card.dataset.thumbnailLoaded = "error";
      }
    });
  };

  const closeAttachmentPreviewModal = () => {
    if (!elements.attachmentPreviewModal) {
      return;
    }

    elements.attachmentPreviewModal.hidden = true;

    state.previewAttachment = null;

    if (elements.attachmentPreviewContent) {
      elements.attachmentPreviewContent.innerHTML = "";
    }

    if (elements.downloadPreviewAttachment) {
      elements.downloadPreviewAttachment.disabled = true;
    }

    document.body.style.overflow = "";
  };

  const openAttachmentPreview = async (attachment) => {
    const attachmentId = toNumber(attachment?.attachmentId, 0);

    if (
      attachmentId <= 0 ||
      !elements.attachmentPreviewModal ||
      !elements.attachmentPreviewContent
    ) {
      showToast("error", "Attachment preview is unavailable.");

      return;
    }

    state.previewAttachment = {
      attachmentId,

      originalName: normalizeText(
        attachment?.originalName,
        "support-screenshot",
      ),

      mimeType: normalizeText(attachment?.mimeType, "image/jpeg"),

      fileSize: Math.max(0, toNumber(attachment?.fileSize, 0)),
    };

    elements.attachmentPreviewTitle.textContent =
      state.previewAttachment.originalName;

    elements.attachmentPreviewMeta.textContent =
      `${state.previewAttachment.mimeType} • ` +
      formatAttachmentSize(state.previewAttachment.fileSize);

    elements.attachmentPreviewContent.innerHTML = `
      <div class="attachment-preview-loading">

        <i class="fa-solid fa-spinner"></i>

        <span>Loading attachment...</span>

      </div>
    `;

    elements.downloadPreviewAttachment.disabled = true;

    elements.attachmentPreviewModal.hidden = false;

    document.body.style.overflow = "hidden";

    try {
      const attachmentResult = await fetchAdminAttachment(attachmentId);

      if (
        elements.attachmentPreviewModal.hidden ||
        Number(state.previewAttachment?.attachmentId) !== attachmentId
      ) {
        return;
      }

      const image = document.createElement("img");

      image.src = attachmentResult.objectUrl;

      image.alt = state.previewAttachment.originalName;

      image.addEventListener(
        "error",
        () => {
          elements.attachmentPreviewContent.innerHTML = `
            <div class="attachment-preview-error">

              <i class="fa-solid fa-image"></i>

              <strong>Image preview failed</strong>

              <span>
                Download the attachment to view it.
              </span>

            </div>
          `;
        },
        {
          once: true,
        },
      );

      elements.attachmentPreviewContent.replaceChildren(image);

      elements.downloadPreviewAttachment.disabled = false;
    } catch (error) {
      console.error("ADMIN ATTACHMENT PREVIEW ERROR:", error);

      elements.attachmentPreviewContent.innerHTML = `
        <div class="attachment-preview-error">

          <i class="fa-solid fa-triangle-exclamation"></i>

          <strong>Attachment could not be loaded</strong>

          <span>
            ${escapeHtml(error.message)}
          </span>

        </div>
      `;

      showToast("error", error.message, "Attachment Load Failed");
    }
  };

  const downloadPreviewAttachment = async () => {
    const attachment = state.previewAttachment;

    if (!attachment?.attachmentId) {
      showToast("warning", "Select an attachment first.");

      return;
    }

    elements.downloadPreviewAttachment.disabled = true;

    try {
      const attachmentResult = await fetchAdminAttachment(
        attachment.attachmentId,
      );

      const downloadLink = document.createElement("a");

      downloadLink.href = attachmentResult.objectUrl;

      downloadLink.download =
        attachment.originalName ||
        `support-attachment-${attachment.attachmentId}`;

      downloadLink.style.display = "none";

      document.body.appendChild(downloadLink);

      downloadLink.click();

      downloadLink.remove();

      showToast("success", "Attachment download started.");
    } catch (error) {
      console.error("ADMIN ATTACHMENT DOWNLOAD ERROR:", error);

      showToast("error", error.message, "Download Failed");
    } finally {
      elements.downloadPreviewAttachment.disabled = false;
    }
  };

  const handleConversationAttachmentClick = (event) => {
    const attachmentCard = event.target.closest(
      ".message-attachment-card[data-attachment-id]",
    );

    if (
      !attachmentCard ||
      !elements.ticketConversation?.contains(attachmentCard)
    ) {
      return;
    }

    openAttachmentPreview({
      attachmentId: attachmentCard.dataset.attachmentId,

      originalName: attachmentCard.dataset.attachmentName,

      mimeType: attachmentCard.dataset.attachmentType,

      fileSize: attachmentCard.dataset.attachmentSize,
    });
  };

  const releaseAttachmentObjectUrls = () => {
    state.attachmentCache.forEach((entry) => {
      if (entry?.objectUrl) {
        URL.revokeObjectURL(entry.objectUrl);
      }
    });

    state.attachmentCache.clear();
  };

  /* =====================================================
       SUMMARY
    ===================================================== */

  const normalizeSummary = (summary, tickets) => {
    const ticketList = Array.isArray(tickets) ? tickets : [];

    const countByStatus = (status) => {
      return ticketList.filter((ticket) => ticket.status === status).length;
    };

    const countByPriority = (priority) => {
      return ticketList.filter((ticket) => ticket.priority === priority).length;
    };

    return {
      total: toNumber(
        firstDefined(
          summary?.total,
          summary?.totalTickets,
          summary?.total_tickets,
          state.totalItems,
        ),
        ticketList.length,
      ),

      open: toNumber(
        firstDefined(
          summary?.open,
          summary?.openTickets,
          summary?.open_tickets,
        ),
        countByStatus("open"),
      ),

      inProgress: toNumber(
        firstDefined(
          summary?.inProgress,
          summary?.in_progress,
          summary?.inProgressTickets,
          summary?.in_progress_tickets,
        ),
        countByStatus("in_progress"),
      ),

      resolved: toNumber(
        firstDefined(
          summary?.resolved,
          summary?.resolvedTickets,
          summary?.resolved_tickets,
        ),
        countByStatus("resolved"),
      ),

      urgent: toNumber(
        firstDefined(
          summary?.urgent,
          summary?.urgentTickets,
          summary?.urgent_tickets,
        ),
        countByPriority("urgent"),
      ),
    };
  };

  const renderSummary = (summary) => {
    elements.totalTicketCount.textContent = summary.total;

    elements.openTicketCount.textContent = summary.open;

    elements.progressTicketCount.textContent = summary.inProgress;

    elements.resolvedTicketCount.textContent = summary.resolved;

    elements.urgentTicketCount.textContent = summary.urgent;

    elements.openSupportMenuCount.textContent =
      summary.open + summary.inProgress;

    elements.openSupportMenuCount.hidden =
      summary.open + summary.inProgress <= 0;
  };

  /* =====================================================
       TICKET LIST API
    ===================================================== */

  const buildTicketQuery = () => {
    const parameters = new URLSearchParams();

    parameters.set("page", String(state.currentPage));

    parameters.set("limit", String(state.pageLimit));

    if (state.search) {
      parameters.set("search", state.search);
    }

    if (state.status) {
      parameters.set("status", state.status);
    }

    if (state.priority) {
      parameters.set("priority", state.priority);
    }

    if (state.category) {
      parameters.set("category", state.category);
    }

    return parameters.toString();
  };

  const setListLoading = (loading) => {
    state.isLoading = loading;

    if (elements.supportLoading) {
      elements.supportLoading.hidden = !loading;
    }

    if (elements.refreshSupport) {
      elements.refreshSupport.disabled = loading;
    }

    if (loading) {
      elements.refreshSupport?.querySelector("i")?.classList.add("fa-spin");
    } else {
      elements.refreshSupport?.querySelector("i")?.classList.remove("fa-spin");
    }
  };

  const loadTickets = async ({ silent = false } = {}) => {
    if (state.isLoading) {
      return;
    }

    setListLoading(true);

    if (!silent) {
      elements.supportResultText.textContent = "Loading support tickets...";
    }

    try {
      const result = await requestApi(
        `${SUPPORT_API_BASE}?${buildTicketQuery()}`,
      );

      const responseData = result?.data || {};

      const rawTickets = Array.isArray(responseData)
        ? responseData
        : firstDefined(responseData.tickets, result?.tickets, []);

      state.tickets = Array.isArray(rawTickets)
        ? rawTickets.map(normalizeTicket)
        : [];

      const pagination = responseData.pagination || result?.pagination || {};

      state.currentPage = Math.max(
        1,
        toNumber(
          firstDefined(
            pagination.currentPage,
            pagination.current_page,
            pagination.page,
            state.currentPage,
          ),
          1,
        ),
      );

      state.totalPages = Math.max(
        1,
        toNumber(
          firstDefined(
            pagination.totalPages,
            pagination.total_pages,
            pagination.pages,
            1,
          ),
          1,
        ),
      );

      state.totalItems = Math.max(
        0,
        toNumber(
          firstDefined(
            pagination.totalItems,
            pagination.total_items,
            pagination.total,
            responseData.total,
            state.tickets.length,
          ),
          state.tickets.length,
        ),
      );

      const summary = normalizeSummary(
        responseData.summary || result?.summary || {},
        state.tickets,
      );

      renderSummary(summary);
      renderTicketTable();
      renderPagination();

      elements.supportResultText.textContent = `${state.totalItems} support ticket${state.totalItems === 1 ? "" : "s"} found`;
    } catch (error) {
      console.error("ADMIN SUPPORT LIST ERROR:", error);

      state.tickets = [];

      renderTicketTable();
      renderPagination();

      elements.supportResultText.textContent =
        "Unable to load support tickets.";

      showToast("error", error.message, "Ticket Load Failed");
    } finally {
      setListLoading(false);
    }
  };

  /* =====================================================
       TICKET TABLE
    ===================================================== */

  const getStatusClass = (status) => {
    return "status-" + normalizeStatus(status).replace(/_/g, "-");
  };

  const getPriorityClass = (priority) => {
    return "priority-" + normalizePriority(priority);
  };

  const renderTicketTable = () => {
    const ticketBody = elements.supportTicketTableBody;

    if (!ticketBody) {
      return;
    }

    if (state.tickets.length === 0) {
      ticketBody.innerHTML = "";

      elements.supportEmptyState.hidden = false;

      return;
    }

    elements.supportEmptyState.hidden = true;

    ticketBody.innerHTML = state.tickets
      .map((ticket) => {
        const updatedDate = formatShortDate(
          ticket.updatedAt || ticket.createdAt,
        );

        const unreadBadge =
          ticket.unreadMessages > 0
            ? `
                                <span class="unread-ticket-count">
                                    ${ticket.unreadMessages}
                                </span>
                            `
            : "";

        return `
                        <tr data-ticket-id="${ticket.id}">

                            <td>
                                <div class="ticket-code-cell">

                                    <strong>
                                        ${escapeHtml(ticket.ticketCode)}
                                    </strong>

                                    <span title="${escapeHtml(ticket.subject)}">
                                        ${escapeHtml(ticket.subject)}
                                    </span>

                                </div>
                            </td>

                            <td>
                                <div class="ticket-user-cell">

                                    <div class="table-user-avatar">
                                        ${escapeHtml(getInitials(ticket.userName))}
                                    </div>

                                    <div>
                                        <strong>
                                            ${escapeHtml(ticket.userName)}
                                        </strong>

                                        <span>
                                            ${escapeHtml(ticket.userUid)}
                                        </span>
                                    </div>

                                </div>
                            </td>

                            <td>
                                ${escapeHtml(formatLabel(ticket.category))}
                            </td>

                            <td>
                                <span class="support-badge ${getStatusClass(ticket.status)}">
                                    ${escapeHtml(formatLabel(ticket.status))}
                                </span>
                            </td>

                            <td>
                                <span class="support-badge ${getPriorityClass(ticket.priority)}">
                                    ${escapeHtml(formatLabel(ticket.priority))}
                                </span>
                            </td>

                            <td>
                                <span class="ticket-message-count">

                                    <i class="fa-regular fa-message"></i>

                                    ${ticket.messageCount}

                                    ${unreadBadge}

                                </span>
                            </td>

                            <td>
                                <div class="ticket-date-cell">

                                    <strong>
                                        ${escapeHtml(updatedDate.date)}
                                    </strong>

                                    <span>
                                        ${escapeHtml(updatedDate.time)}
                                    </span>

                                </div>
                            </td>

                            <td>
                                <button
                                    type="button"
                                    class="view-ticket-btn"
                                    data-view-ticket="${ticket.id}">

                                    <i class="fa-solid fa-eye"></i>
                                    View

                                </button>
                            </td>

                        </tr>
                    `;
      })
      .join("");
  };

  /* =====================================================
       PAGINATION
    ===================================================== */

  const getVisiblePages = (currentPage, totalPages) => {
    const pages = [];

    const startPage = Math.max(1, currentPage - 2);

    const endPage = Math.min(totalPages, startPage + 4);

    const correctedStart = Math.max(1, endPage - 4);

    for (let page = correctedStart; page <= endPage; page += 1) {
      pages.push(page);
    }

    return pages;
  };

  const renderPagination = () => {
    elements.supportPreviousPage.disabled =
      state.currentPage <= 1 || state.isLoading;

    elements.supportNextPage.disabled =
      state.currentPage >= state.totalPages || state.isLoading;

    const pages = getVisiblePages(state.currentPage, state.totalPages);

    elements.supportPageNumbers.innerHTML = pages
      .map((page) => {
        return `
                        <button
                            type="button"
                            class="page-number-btn ${
                              page === state.currentPage ? "active" : ""
                            }"
                            data-support-page="${page}">

                            ${page}

                        </button>
                    `;
      })
      .join("");
  };

  const goToPage = async (page) => {
    const nextPage = Math.min(Math.max(1, toNumber(page, 1)), state.totalPages);

    if (nextPage === state.currentPage || state.isLoading) {
      return;
    }

    state.currentPage = nextPage;

    await loadTickets();

    document.querySelector(".support-list-card")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  /* =====================================================
       DETAILS PANEL
    ===================================================== */

  const openDetailsPanel = () => {
    elements.ticketPanelOverlay.hidden = false;

    elements.ticketDetailsPanel.setAttribute("aria-hidden", "false");

    document.body.style.overflow = "hidden";

    window.requestAnimationFrame(() => {
      elements.ticketDetailsPanel.classList.add("open");
    });
  };

  const closeDetailsPanel = () => {
    elements.ticketDetailsPanel.classList.remove("open");

    elements.ticketDetailsPanel.setAttribute("aria-hidden", "true");

    document.body.style.overflow = "";

    window.setTimeout(() => {
      elements.ticketPanelOverlay.hidden = true;
    }, 240);
  };

  const setDetailsLoading = (loading) => {
    state.isDetailsLoading = loading;

    elements.ticketDetailsLoading.hidden = !loading;

    if (elements.ticketDetailsBody) {
      elements.ticketDetailsBody.style.opacity = loading ? "0.55" : "1";
    }
  };

  const loadTicketDetails = async (
    ticketId,
    { openPanel = true, silent = false } = {},
  ) => {
    const validTicketId = toNumber(ticketId, 0);

    if (validTicketId <= 0 || state.isDetailsLoading) {
      return;
    }

    state.selectedTicketId = validTicketId;

    if (openPanel) {
      openDetailsPanel();
    }

    setDetailsLoading(true);

    try {
      const result = await requestApi(`${SUPPORT_API_BASE}/${validTicketId}`);

      const responseData = result?.data || {};

      const rawTicket = responseData.ticket || result?.ticket || responseData;

      const rawMessages = firstDefined(
        responseData.messages,
        result?.messages,
        [],
      );

      const ticket = normalizeTicket(rawTicket);

      const messages = Array.isArray(rawMessages)
        ? rawMessages.map((message) => normalizeMessage(message, ticket))
        : [];

      state.selectedTicket = ticket;

      renderTicketDetails(ticket, messages);

      if (!silent) {
        const localTicket = state.tickets.find(
          (item) => item.id === validTicketId,
        );

        if (localTicket) {
          localTicket.unreadMessages = 0;
        }

        renderTicketTable();
      }
    } catch (error) {
      console.error("ADMIN SUPPORT DETAILS ERROR:", error);

      showToast("error", error.message, "Details Load Failed");

      if (openPanel) {
        closeDetailsPanel();
      }
    } finally {
      setDetailsLoading(false);
    }
  };

  const renderTicketDetails = (ticket, messages) => {
    elements.detailsTicketCode.textContent = ticket.ticketCode;

    elements.detailsTicketSubject.textContent = ticket.subject;

    elements.detailsUserAvatar.textContent = getInitials(ticket.userName);

    elements.detailsUserName.textContent = ticket.userName;

    elements.detailsUserUid.textContent = `UID: ${ticket.userUid}`;

    elements.detailsUserPhone.textContent = ticket.userPhone;

    elements.detailsUserEmail.textContent = ticket.userEmail;

    elements.detailsStatusSelect.value = ticket.status;

    elements.detailsPrioritySelect.value = ticket.priority;

    elements.detailsAssignedAdmin.textContent = ticket.assignedAdminName;

    elements.detailsCategory.textContent = formatLabel(ticket.category);

    elements.detailsCreatedAt.textContent = formatDateTime(ticket.createdAt);

    elements.detailsUpdatedAt.textContent = formatDateTime(ticket.updatedAt);

    elements.detailsMessageCount.textContent = String(
      Math.max(ticket.messageCount, messages.length),
    );

    const assignedToCurrentAdmin =
      ticket.assignedAdminId &&
      state.currentAdmin.id &&
      Number(ticket.assignedAdminId) === Number(state.currentAdmin.id);

    elements.assignTicketToMe.disabled = assignedToCurrentAdmin;

    elements.assignTicketToMe.innerHTML = assignedToCurrentAdmin
      ? `
                    <i class="fa-solid fa-circle-check"></i>
                    Assigned to You
                `
      : `
                    <i class="fa-solid fa-user-check"></i>
                    Assign to Me
                `;

    const isClosed = ticket.status === "closed";

    elements.adminReplyMessage.disabled = isClosed;

    elements.sendAdminReply.disabled = isClosed;

    elements.adminReplyMessage.placeholder = isClosed
      ? "This support ticket is closed."
      : "Write your support reply...";

    renderConversation(messages, ticket);
  };

  /* =====================================================
       CONVERSATION
    ===================================================== */

  const renderConversation = (messages, ticket) => {
    if (!Array.isArray(messages)) {
      messages = [];
    }

    if (messages.length === 0) {
      elements.ticketConversation.innerHTML = `
        <div class="conversation-placeholder">
          No conversation message was found.
        </div>
      `;

      return;
    }

    elements.ticketConversation.innerHTML = messages
      .map((message) => {
        const messageTypeClass = message.isAdmin
          ? "admin-message"
          : "user-message";

        const senderInitial = getInitials(message.senderName);

        return `
            <article
              class="conversation-message ${messageTypeClass}">

              <div class="message-avatar">
                ${escapeHtml(senderInitial)}
              </div>

              <div class="message-content">

                <div class="message-bubble">
                  ${escapeHtml(message.messageText)}
                </div>

                ${renderMessageAttachments(message.attachments)}

                <div class="message-meta">

                  <strong>
                    ${escapeHtml(message.senderName)}
                  </strong>

                  <span>
                    ${escapeHtml(formatDateTime(message.createdAt))}
                  </span>

                </div>

              </div>

            </article>
          `;
      })
      .join("");

    hydrateAttachmentThumbnails();

    window.requestAnimationFrame(() => {
      elements.ticketConversation.scrollTop =
        elements.ticketConversation.scrollHeight;
    });
  };

  /* =====================================================
       UPDATE TICKET
    ===================================================== */

  const updateTicket = async (
    payload,
    { successMessage = "Support ticket updated successfully." } = {},
  ) => {
    if (!state.selectedTicketId || state.isUpdatingTicket) {
      return false;
    }

    state.isUpdatingTicket = true;

    elements.saveTicketChanges.disabled = true;

    elements.assignTicketToMe.disabled = true;

    try {
      const result = await requestApi(
        `${SUPPORT_API_BASE}/${state.selectedTicketId}`,
        {
          method: "PATCH",
          body: payload,
        },
      );

      const responseData = result?.data || {};

      const rawTicket = responseData.ticket || result?.ticket || responseData;

      if (rawTicket) {
        const updatedTicket = normalizeTicket(rawTicket);

        state.selectedTicket = updatedTicket;

        const ticketIndex = state.tickets.findIndex(
          (ticket) => ticket.id === updatedTicket.id,
        );

        if (ticketIndex >= 0) {
          state.tickets[ticketIndex] = {
            ...state.tickets[ticketIndex],
            ...updatedTicket,
          };
        }
      }

      showToast("success", successMessage);

      await Promise.all([
        loadTicketDetails(state.selectedTicketId, {
          openPanel: false,
          silent: true,
        }),

        loadTickets({
          silent: true,
        }),
      ]);

      return true;
    } catch (error) {
      console.error("ADMIN SUPPORT UPDATE ERROR:", error);

      showToast("error", error.message, "Update Failed");

      return false;
    } finally {
      state.isUpdatingTicket = false;

      elements.saveTicketChanges.disabled = false;

      const assignedToCurrentAdmin =
        state.selectedTicket?.assignedAdminId &&
        state.currentAdmin.id &&
        Number(state.selectedTicket.assignedAdminId) ===
          Number(state.currentAdmin.id);

      elements.assignTicketToMe.disabled = Boolean(assignedToCurrentAdmin);
    }
  };

  const handleSaveTicket = async () => {
    if (!state.selectedTicket) {
      return;
    }

    const status = normalizeStatus(elements.detailsStatusSelect.value);

    const priority = normalizePriority(elements.detailsPrioritySelect.value);

    if (
      status === state.selectedTicket.status &&
      priority === state.selectedTicket.priority
    ) {
      showToast("info", "No ticket changes were detected.");

      return;
    }

    if (status === "closed") {
      const accepted = await showConfirmation({
        title: "Close Support Ticket",
        message:
          "Closing this ticket will prevent the user and admin from sending new replies. Continue?",
        confirmText: "Close Ticket",
        danger: true,
      });

      if (!accepted) {
        elements.detailsStatusSelect.value = state.selectedTicket.status;

        return;
      }
    }

    await updateTicket(
      {
        status,
        priority,
      },
      {
        successMessage: "Ticket status and priority updated successfully.",
      },
    );
  };

  const handleAssignToMe = async () => {
    if (!state.currentAdmin.id) {
      showToast(
        "error",
        "Current admin ID could not be determined. Please log in again.",
        "Assignment Failed",
      );

      return;
    }

    await updateTicket(
      {
        assignedAdminId: state.currentAdmin.id,
      },
      {
        successMessage: "Support ticket assigned to you successfully.",
      },
    );
  };

  /* =====================================================
       ADMIN REPLY
    ===================================================== */

  const updateReplyCharacterCount = () => {
    const length = elements.adminReplyMessage.value.length;

    elements.adminReplyCharacterCount.textContent = `${length} / 2000`;
  };

  const submitAdminReply = async (event) => {
    event.preventDefault();

    if (!state.selectedTicketId || state.isSubmittingReply) {
      return;
    }

    const message = elements.adminReplyMessage.value.trim();

    if (!message) {
      showToast("warning", "Please write a reply message.");

      elements.adminReplyMessage.focus();

      return;
    }

    if (message.length > 2000) {
      showToast("warning", "Reply message cannot exceed 2000 characters.");

      return;
    }

    state.isSubmittingReply = true;

    elements.sendAdminReply.disabled = true;

    elements.sendAdminReply.innerHTML = `
            <i class="fa-solid fa-spinner fa-spin"></i>
            Sending...
        `;

    try {
      await requestApi(
        `${SUPPORT_API_BASE}/${state.selectedTicketId}/messages`,
        {
          method: "POST",
          body: {
            message,
          },
        },
      );

      elements.adminReplyMessage.value = "";

      updateReplyCharacterCount();

      showToast("success", "Support reply sent successfully.");

      await Promise.all([
        loadTicketDetails(state.selectedTicketId, {
          openPanel: false,
          silent: true,
        }),

        loadTickets({
          silent: true,
        }),
      ]);
    } catch (error) {
      console.error("ADMIN SUPPORT REPLY ERROR:", error);

      showToast("error", error.message, "Reply Failed");
    } finally {
      state.isSubmittingReply = false;

      const isClosed = state.selectedTicket?.status === "closed";

      elements.sendAdminReply.disabled = isClosed;

      elements.sendAdminReply.innerHTML = `
                <i class="fa-solid fa-paper-plane"></i>
                Send Reply
            `;
    }
  };

  /* =====================================================
       FILTER HANDLING
    ===================================================== */

  const applyFilters = async () => {
    state.currentPage = 1;

    state.search = elements.supportSearchInput.value.trim();

    state.status = elements.supportStatusFilter.value;

    state.priority = elements.supportPriorityFilter.value;

    state.category = elements.supportCategoryFilter.value;

    await loadTickets();
  };

  const handleSearchInput = () => {
    window.clearTimeout(state.searchTimer);

    state.searchTimer = window.setTimeout(applyFilters, 450);
  };

  const clearFilters = async () => {
    window.clearTimeout(state.searchTimer);

    elements.supportSearchInput.value = "";

    elements.supportStatusFilter.value = "";

    elements.supportPriorityFilter.value = "";

    elements.supportCategoryFilter.value = "";

    state.search = "";
    state.status = "";
    state.priority = "";
    state.category = "";
    state.currentPage = 1;

    await loadTickets();
  };

  /* =====================================================
       SIDEBAR
    ===================================================== */

  const toggleSidebar = () => {
    document.body.classList.toggle("sidebar-open");
  };

  const closeSidebar = () => {
    document.body.classList.remove("sidebar-open");
  };

  /* =====================================================
       LOGOUT
    ===================================================== */

  const clearLoginSession = () => {
    ["access_token", "token", "current_user", "user", "admin_user"].forEach(
      (key) => {
        localStorage.removeItem(key);
      },
    );

    window.location.href = "../pages/login.html";
  };

  const handleLogout = async () => {
    const accepted = await showConfirmation({
      title: "Admin Logout",
      message: "Are you sure you want to log out of the admin panel?",
      confirmText: "Logout",
      danger: true,
    });

    if (accepted) {
      clearLoginSession();
    }
  };

  /* =====================================================
       DELEGATED EVENTS
    ===================================================== */

  const handleTicketTableClick = (event) => {
    const button = event.target.closest("[data-view-ticket]");

    if (!button) {
      return;
    }

    const ticketId = toNumber(button.dataset.viewTicket, 0);

    if (ticketId > 0) {
      loadTicketDetails(ticketId);
    }
  };

  const handlePageNumberClick = (event) => {
    const button = event.target.closest("[data-support-page]");

    if (!button) {
      return;
    }

    goToPage(button.dataset.supportPage);
  };

  /* =====================================================
       EVENT LISTENERS
    ===================================================== */

  const bindEvents = () => {
    elements.sidebarToggle?.addEventListener("click", toggleSidebar);

    elements.sidebarOverlay?.addEventListener("click", closeSidebar);

    elements.adminLogoutBtn?.addEventListener("click", handleLogout);

    elements.refreshSupport?.addEventListener("click", () => {
      loadTickets();
    });

    elements.supportSearchInput?.addEventListener("input", handleSearchInput);

    elements.supportStatusFilter?.addEventListener("change", applyFilters);

    elements.supportPriorityFilter?.addEventListener("change", applyFilters);

    elements.supportCategoryFilter?.addEventListener("change", applyFilters);

    elements.clearSupportFilters?.addEventListener("click", clearFilters);

    elements.supportTicketTableBody?.addEventListener(
      "click",
      handleTicketTableClick,
    );

    elements.supportPreviousPage?.addEventListener("click", () => {
      goToPage(state.currentPage - 1);
    });

    elements.supportNextPage?.addEventListener("click", () => {
      goToPage(state.currentPage + 1);
    });

    elements.supportPageNumbers?.addEventListener(
      "click",
      handlePageNumberClick,
    );

    elements.closeTicketPanel?.addEventListener("click", closeDetailsPanel);

    elements.ticketPanelOverlay?.addEventListener("click", closeDetailsPanel);

    elements.refreshConversation?.addEventListener("click", () => {
      if (state.selectedTicketId) {
        loadTicketDetails(state.selectedTicketId, {
          openPanel: false,
          silent: true,
        });
      }
    });

    elements.assignTicketToMe?.addEventListener("click", handleAssignToMe);

    elements.saveTicketChanges?.addEventListener("click", handleSaveTicket);

    elements.adminSupportReplyForm?.addEventListener(
      "submit",
      submitAdminReply,
    );

    elements.adminReplyMessage?.addEventListener(
      "input",
      updateReplyCharacterCount,
    );

    elements.ticketConversation?.addEventListener(
      "click",
      handleConversationAttachmentClick,
    );

    elements.closeAttachmentPreview?.addEventListener(
      "click",
      closeAttachmentPreviewModal,
    );

    elements.cancelAttachmentPreview?.addEventListener(
      "click",
      closeAttachmentPreviewModal,
    );

    elements.downloadPreviewAttachment?.addEventListener(
      "click",
      downloadPreviewAttachment,
    );

    elements.attachmentPreviewModal?.addEventListener("click", (event) => {
      if (
        event.target === elements.attachmentPreviewModal ||
        event.target.classList.contains("attachment-preview-backdrop")
      ) {
        closeAttachmentPreviewModal();
      }
    });

    elements.cancelConfirmAction?.addEventListener("click", () => {
      closeConfirmation(false);
    });

    elements.acceptConfirmAction?.addEventListener("click", () => {
      closeConfirmation(true);
    });

    elements.supportConfirmModal?.addEventListener("click", (event) => {
      if (event.target === elements.supportConfirmModal) {
        closeConfirmation(false);
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") {
        return;
      }

      if (
        elements.attachmentPreviewModal &&
        !elements.attachmentPreviewModal.hidden
      ) {
        closeAttachmentPreviewModal();

        return;
      }

      if (!elements.supportConfirmModal?.hidden) {
        closeConfirmation(false);

        return;
      }

      if (elements.ticketDetailsPanel?.classList.contains("open")) {
        closeDetailsPanel();

        return;
      }

      closeSidebar();
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 980) {
        closeSidebar();
      }
    });

    window.addEventListener("beforeunload", releaseAttachmentObjectUrls);
  };

  /* =====================================================
       AUTOMATIC REFRESH
    ===================================================== */

  const startAutomaticRefresh = () => {
    window.clearInterval(state.refreshTimer);

    state.refreshTimer = window.setInterval(() => {
      if (
        document.hidden ||
        state.isLoading ||
        state.isUpdatingTicket ||
        state.isSubmittingReply
      ) {
        return;
      }

      loadTickets({
        silent: true,
      });

      if (
        state.selectedTicketId &&
        elements.ticketDetailsPanel?.classList.contains("open")
      ) {
        loadTicketDetails(state.selectedTicketId, {
          openPanel: false,
          silent: true,
        });
      }
    }, 30000);
  };

  /* =====================================================
       INITIALIZATION
    ===================================================== */

  const initializeAdminSupport = async () => {
    const token = getAccessToken();

    if (!token) {
      clearLoginSession();

      return;
    }

    loadCurrentAdmin();
    bindEvents();

    /*
     * HTML textarea-এর opening/closing tag-এর
     * whitespace সম্পূর্ণ পরিষ্কার করা হচ্ছে।
     */
    if (elements.adminReplyMessage) {
      elements.adminReplyMessage.value = "";
    }

    updateReplyCharacterCount();

    await loadTickets();

    startAutomaticRefresh();

    console.log("✅ PMS ADDA Admin Support frontend loaded", {
      apiUrl: buildApiUrl(SUPPORT_API_BASE),

      adminId: state.currentAdmin.id,

      currentPage: state.currentPage,
    });
  };

  document.addEventListener("DOMContentLoaded", initializeAdminSupport);

  /* =====================================================
       OPTIONAL DEBUG ACCESS
    ===================================================== */

  window.PMS_ADMIN_SUPPORT = {
    state,

    reload: loadTickets,

    openTicket: loadTicketDetails,

    closePanel: closeDetailsPanel,
  };
})();
