"use strict";

(() => {
  const state = {
    agents: [],
    selectedAgent: null,
    toastTimer: null
  };

  const DOM = {
    totalAgents:
      document.getElementById(
        "totalAgents"
      ),

    activeAgents:
      document.getElementById(
        "activeAgents"
      ),

    disabledAgents:
      document.getElementById(
        "disabledAgents"
      ),

    refreshAgentsBtn:
      document.getElementById(
        "refreshAgentsBtn"
      ),

    createAgentForm:
      document.getElementById(
        "createAgentForm"
      ),

    agentFullName:
      document.getElementById(
        "agentFullName"
      ),

    agentUsernameInput:
      document.getElementById(
        "agentUsernameInput"
      ),

    agentPhone:
      document.getElementById(
        "agentPhone"
      ),

    agentEmail:
      document.getElementById(
        "agentEmail"
      ),

    agentPassword:
      document.getElementById(
        "agentPassword"
      ),

    togglePasswordBtn:
      document.getElementById(
        "togglePasswordBtn"
      ),

    createAgentBtn:
      document.getElementById(
        "createAgentBtn"
      ),

    agentSearchInput:
      document.getElementById(
        "agentSearchInput"
      ),

    agentsTableBody:
      document.getElementById(
        "agentsTableBody"
      ),

    statusModal:
      document.getElementById(
        "statusModal"
      ),

    statusModalTitle:
      document.getElementById(
        "statusModalTitle"
      ),

    statusModalMessage:
      document.getElementById(
        "statusModalMessage"
      ),

    closeStatusModalBtn:
      document.getElementById(
        "closeStatusModalBtn"
      ),

    cancelStatusBtn:
      document.getElementById(
        "cancelStatusBtn"
      ),

    confirmStatusBtn:
      document.getElementById(
        "confirmStatusBtn"
      ),

    agentsLoading:
      document.getElementById(
        "agentsLoading"
      ),

    agentsToast:
      document.getElementById(
        "agentsToast"
      )
  };

  function getToken() {
    return (
      localStorage.getItem(
        "access_token"
      ) ||
      ""
    );
  }

  function getApiUrl(path) {
    if (
      typeof window.APP_CONFIG
        ?.api ===
      "function"
    ) {
      return window.APP_CONFIG
        .api(path);
    }

    const cleanPath =
      String(path)
        .startsWith("/")
        ? String(path)
        : `/${path}`;

    return (
      `${window.location.origin}` +
      `/api${cleanPath}`
    );
  }

  async function apiRequest(
    path,
    options = {}
  ) {
    const response =
      await fetch(
        getApiUrl(path),
        {
          ...options,

          headers: {
            Accept:
              "application/json",

            Authorization:
              `Bearer ${getToken()}`,

            ...(options.body
              ? {
                  "Content-Type":
                    "application/json"
                }
              : {}),

            ...(options.headers ||
              {})
          },

          cache:
            "no-store"
        }
      );

    let result = null;

    try {
      result =
        await response.json();
    } catch (_error) {
      result = null;
    }

    if (!response.ok) {
      throw new Error(
        result?.message ||
        `Request failed (${response.status}).`
      );
    }

    return (
      result?.data ??
      result
    );
  }

  function escapeHtml(value) {
    return String(
      value ?? ""
    )
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatDate(value) {
    if (!value) {
      return "—";
    }

    const date =
      new Date(value);

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return "—";
    }

    return date
      .toLocaleString(
        "en-BD",
        {
          year: "numeric",
          month: "short",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit"
        }
      );
  }

  function showLoading(visible) {
    DOM.agentsLoading
      .classList
      .toggle(
        "is-hidden",
        !visible
      );
  }

  function showToast(
    message,
    type = "success"
  ) {
    clearTimeout(
      state.toastTimer
    );

    DOM.agentsToast
      .textContent =
      message;

    DOM.agentsToast
      .className =
      `agents-toast ${type}`;

    state.toastTimer =
      setTimeout(
        () => {
          DOM.agentsToast
            .classList
            .add(
              "is-hidden"
            );
        },
        3500
      );
  }

  function renderSummary() {
    const active =
      state.agents
        .filter(
          (agent) =>
            agent.accountStatus ===
            "active"
        )
        .length;

    const disabled =
      state.agents
        .filter(
          (agent) =>
            agent.accountStatus ===
            "banned"
        )
        .length;

    DOM.totalAgents
      .textContent =
      String(
        state.agents.length
      );

    DOM.activeAgents
      .textContent =
      String(active);

    DOM.disabledAgents
      .textContent =
      String(disabled);
  }

  function renderAgents() {
    const search =
      String(
        DOM.agentSearchInput
          .value ||
        ""
      )
        .trim()
        .toLowerCase();

    const agents =
      state.agents
        .filter((agent) => {
          if (!search) {
            return true;
          }

          return [
            agent.uid,
            agent.fullName,
            agent.username,
            agent.phone,
            agent.email
          ]
            .some((value) =>
              String(value || "")
                .toLowerCase()
                .includes(search)
            );
        });

    if (!agents.length) {
      DOM.agentsTableBody
        .innerHTML =
        `
          <tr>
            <td
              colspan="7"
              class="empty-table">
              No Agent accounts found.
            </td>
          </tr>
        `;

      return;
    }

    DOM.agentsTableBody
      .innerHTML =
      agents
        .map((agent) => {
          const active =
            agent.accountStatus ===
            "active";

          return `
            <tr>
              <td>
                <div class="agent-name">
                  <strong>
                    ${escapeHtml(
                      agent.fullName
                    )}
                  </strong>

                  <small>
                    ${escapeHtml(
                      agent.uid
                    )}
                  </small>
                </div>
              </td>

              <td>
                ${escapeHtml(
                  agent.username
                )}
              </td>

              <td>
                ${escapeHtml(
                  agent.phone
                )}
              </td>

              <td>
                ${escapeHtml(
                  agent.email
                )}
              </td>

              <td>
                <span
                  class="status-badge status-${escapeHtml(
                    agent.accountStatus
                  )}">
                  ${
                    active
                      ? "Active"
                      : "Disabled"
                  }
                </span>
              </td>

              <td>
                ${formatDate(
                  agent.createdAt
                )}
              </td>

              <td>
                <button
                  class="status-button ${
                    active
                      ? ""
                      : "activate"
                  }"
                  type="button"
                  data-agent-id="${escapeHtml(
                    agent.id
                  )}">
                  ${
                    active
                      ? "Disable"
                      : "Activate"
                  }
                </button>
              </td>
            </tr>
          `;
        })
        .join("");
  }

  async function loadAgents() {
    showLoading(true);

    try {
      const data =
        await apiRequest(
          "/admin/agents"
        );

      state.agents =
        Array.isArray(
          data?.agents
        )
          ? data.agents
          : [];

      renderSummary();
      renderAgents();
    } catch (error) {
      console.error(
        "Agent list error:",
        error
      );

      showToast(
        error.message,
        "error"
      );

      DOM.agentsTableBody
        .innerHTML =
        `
          <tr>
            <td
              colspan="7"
              class="empty-table">
              ${escapeHtml(
                error.message
              )}
            </td>
          </tr>
        `;
    } finally {
      showLoading(false);
    }
  }

  async function createAgent(
    event
  ) {
    event.preventDefault();

    const payload = {
      fullName:
        DOM.agentFullName
          .value
          .trim(),

      username:
        DOM.agentUsernameInput
          .value
          .trim()
          .toLowerCase(),

      phone:
        DOM.agentPhone
          .value
          .trim(),

      email:
        DOM.agentEmail
          .value
          .trim()
          .toLowerCase(),

      password:
        DOM.agentPassword
          .value
    };

    const originalText =
      DOM.createAgentBtn
        .innerHTML;

    DOM.createAgentBtn
      .disabled =
      true;

    DOM.createAgentBtn
      .textContent =
      "Creating...";

    try {
      await apiRequest(
        "/admin/agents",
        {
          method: "POST",

          body:
            JSON.stringify(
              payload
            )
        }
      );

      DOM.createAgentForm
        .reset();

      showToast(
        "Agent account created successfully."
      );

      await loadAgents();
    } catch (error) {
      showToast(
        error.message,
        "error"
      );
    } finally {
      DOM.createAgentBtn
        .disabled =
        false;

      DOM.createAgentBtn
        .innerHTML =
        originalText;
    }
  }

  function openStatusModal(
    agentId
  ) {
    const agent =
      state.agents
        .find(
          (item) =>
            Number(item.id) ===
            Number(agentId)
        );

    if (!agent) {
      showToast(
        "Agent was not found.",
        "error"
      );

      return;
    }

    state.selectedAgent =
      agent;

    const disabling =
      agent.accountStatus ===
      "active";

    DOM.statusModalTitle
      .textContent =
      disabling
        ? "Disable Agent"
        : "Activate Agent";

    DOM.statusModalMessage
      .textContent =
      disabling
        ? (
            `Disable ${agent.username}? ` +
            "The Agent will immediately lose access."
          )
        : (
            `Activate ${agent.username}? ` +
            "The Agent will be able to sign in again."
          );

    DOM.confirmStatusBtn
      .textContent =
      disabling
        ? "Disable Agent"
        : "Activate Agent";

    DOM.confirmStatusBtn
      .classList
      .toggle(
        "is-danger",
        disabling
      );

    DOM.statusModal
      .classList
      .remove(
        "is-hidden"
      );
  }

  function closeStatusModal() {
    state.selectedAgent =
      null;

    DOM.statusModal
      .classList
      .add(
        "is-hidden"
      );
  }

  async function confirmStatus() {
    const agent =
      state.selectedAgent;

    if (!agent) {
      return;
    }

    const status =
      agent.accountStatus ===
      "active"
        ? "banned"
        : "active";

    const originalText =
      DOM.confirmStatusBtn
        .textContent;

    DOM.confirmStatusBtn
      .disabled =
      true;

    DOM.confirmStatusBtn
      .textContent =
      "Updating...";

    try {
      await apiRequest(
        `/admin/agents/${encodeURIComponent(
          agent.id
        )}/status`,
        {
          method: "PATCH",

          body:
            JSON.stringify({
              status
            })
        }
      );

      closeStatusModal();

      showToast(
        status === "active"
          ? "Agent activated."
          : "Agent disabled."
      );

      await loadAgents();
    } catch (error) {
      showToast(
        error.message,
        "error"
      );
    } finally {
      DOM.confirmStatusBtn
        .disabled =
        false;

      DOM.confirmStatusBtn
        .textContent =
        originalText;
    }
  }

  function togglePassword() {
    const showing =
      DOM.agentPassword
        .type ===
      "text";

    DOM.agentPassword
      .type =
      showing
        ? "password"
        : "text";

    DOM.togglePasswordBtn
      .innerHTML =
      showing
        ? '<i class="fa-solid fa-eye"></i>'
        : '<i class="fa-solid fa-eye-slash"></i>';
  }

  function bindEvents() {
    DOM.createAgentForm
      .addEventListener(
        "submit",
        createAgent
      );

    DOM.refreshAgentsBtn
      .addEventListener(
        "click",
        loadAgents
      );

    DOM.agentSearchInput
      .addEventListener(
        "input",
        renderAgents
      );

    DOM.togglePasswordBtn
      .addEventListener(
        "click",
        togglePassword
      );

    DOM.agentsTableBody
      .addEventListener(
        "click",
        (event) => {
          const button =
            event.target
              .closest(
                "[data-agent-id]"
              );

          if (!button) {
            return;
          }

          openStatusModal(
            button.dataset
              .agentId
          );
        }
      );

    DOM.closeStatusModalBtn
      .addEventListener(
        "click",
        closeStatusModal
      );

    DOM.cancelStatusBtn
      .addEventListener(
        "click",
        closeStatusModal
      );

    DOM.confirmStatusBtn
      .addEventListener(
        "click",
        confirmStatus
      );

    DOM.statusModal
      .addEventListener(
        "click",
        (event) => {
          if (
            event.target ===
            DOM.statusModal
          ) {
            closeStatusModal();
          }
        }
      );
  }

  document
    .addEventListener(
      "DOMContentLoaded",
      () => {
        bindEvents();
        loadAgents();
      }
    );
})();