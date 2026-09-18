"use strict";

(function initializeSportsPage() {
  const accessToken =
    localStorage.getItem(
      "access_token",
    ) ||
    localStorage.getItem(
      "token",
    );

  if (!accessToken) {
    window.location.replace(
      "/login",
    );

    return;
  }

  const apiBaseUrl =
    window.APP_CONFIG?.API_URL ||
    `${window.location.origin}/api`;

  const DOM = {
    sportsDate:
      document.getElementById(
        "sportsDate",
      ),

    refreshButton:
      document.getElementById(
        "refreshButton",
      ),

    sportsStatus:
      document.getElementById(
        "sportsStatus",
      ),

    sportsEvents:
      document.getElementById(
        "sportsEvents",
      ),

    minimumBetText:
      document.getElementById(
        "minimumBetText",
      ),

    maximumBetText:
      document.getElementById(
        "maximumBetText",
      ),

    maximumPayoutText:
      document.getElementById(
        "maximumPayoutText",
      ),

    betSlip:
      document.getElementById(
        "betSlip",
      ),

    betSlipBackdrop:
      document.getElementById(
        "betSlipBackdrop",
      ),

    closeBetSlip:
      document.getElementById(
        "closeBetSlip",
      ),

    selectedBet:
      document.getElementById(
        "selectedBet",
      ),

    stakeAmount:
      document.getElementById(
        "stakeAmount",
      ),

    potentialPayout:
      document.getElementById(
        "potentialPayout",
      ),

    placeBetButton:
      document.getElementById(
        "placeBetButton",
      ),

    betMessage:
      document.getElementById(
        "betMessage",
      ),

    historyButton:
      document.getElementById(
        "historyButton",
      ),

    historyDialog:
      document.getElementById(
        "historyDialog",
      ),

    closeHistory:
      document.getElementById(
        "closeHistory",
      ),

    historyList:
      document.getElementById(
        "historyList",
      ),
  };

  const state = {
    sportId: 20,
    sportName: "IPL",

    settings: null,

    selectedBet: null,

    eventsLoading: false,

    betSubmitting: false,
  };

  /* =========================
     Helpers
  ========================= */

  function escapeHtml(value) {
    return String(
      value ?? "",
    ).replace(
      /[&<>"']/g,
      (character) => {
        const characters = {
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#039;",
        };

        return characters[
          character
        ];
      },
    );
  }

  function formatMoney(value) {
    const amount =
      Number(value);

    return (
      "৳" +
      (
        Number.isFinite(amount)
          ? amount
          : 0
      ).toFixed(2)
    );
  }

  function getLocalDate() {
    const currentDate =
      new Date();

    currentDate.setMinutes(
      currentDate.getMinutes() -
        currentDate
          .getTimezoneOffset(),
    );

    return currentDate
      .toISOString()
      .slice(0, 10);
  }

  function formatDateTime(value) {
    const date =
      new Date(value);

    if (
      !Number.isFinite(
        date.getTime(),
      )
    ) {
      return "";
    }

    return date.toLocaleString(
      "en-BD",
      {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      },
    );
  }

  function setStatus(message) {
    DOM.sportsStatus
      .textContent =
      message || "";
  }

  function setBetMessage(
    message,
    type = "",
  ) {
    DOM.betMessage.textContent =
      message || "";

    DOM.betMessage.className =
      "bet-message";

    if (type) {
      DOM.betMessage
        .classList.add(type);
    }
  }

  function encodeSelection(
    selection,
  ) {
    return encodeURIComponent(
      JSON.stringify(selection),
    );
  }

  function decodeSelection(
    encodedValue,
  ) {
    return JSON.parse(
      decodeURIComponent(
        encodedValue,
      ),
    );
  }

  /* =========================
     API Request
  ========================= */

  async function apiRequest(
    path,
    options = {},
  ) {
    const response =
      await fetch(
        `${apiBaseUrl}${path}`,
        {
          ...options,

          headers: {
            "Content-Type":
              "application/json",

            Authorization:
              `Bearer ${accessToken}`,

            ...options.headers,
          },
        },
      );

    const result =
      await response
        .json()
        .catch(() => ({}));

    if (
      response.status === 401
    ) {
      localStorage.removeItem(
        "access_token",
      );

      localStorage.removeItem(
        "token",
      );

      window.location.replace(
        "/login",
      );

      throw new Error(
        "Login session expired.",
      );
    }

    if (
      !response.ok ||
      result.success !== true
    ) {
      throw new Error(
        result.message ||
          "Request failed.",
      );
    }

    return result.data || {};
  }

  /* =========================
     Settings
  ========================= */

  async function loadSettings() {
    const data =
      await apiRequest(
        "/sports/settings",
      );

    state.settings =
      data.settings;

    DOM.minimumBetText
      .textContent =
      formatMoney(
        data.settings.minBet,
      );

    DOM.maximumBetText
      .textContent =
      formatMoney(
        data.settings.maxBet,
      );

    DOM.maximumPayoutText
      .textContent =
      formatMoney(
        data.settings.maxPayout,
      );

    DOM.stakeAmount.min =
      String(
        data.settings.minBet,
      );

    DOM.stakeAmount.max =
      String(
        data.settings.maxBet,
      );

    const currentStake =
      Number(
        DOM.stakeAmount.value,
      );

    if (
      currentStake <
      Number(
        data.settings.minBet,
      )
    ) {
      DOM.stakeAmount.value =
        String(
          data.settings.minBet,
        );
    }

    updatePayoutPreview();
  }

  /* =========================
     Event Rendering
  ========================= */

  function renderSelection(
    event,
    market,
    selection,
  ) {
    const selectionData = {
      id:
        Number(selection.id),

      eventName:
        event.eventName,

      marketName:
        market.marketName,

      selectionName:
        selection.name,

      decimalOdds:
        Number(
          selection.decimalOdds,
        ),

      oddsUpdatedAt:
        selection.oddsUpdatedAt,
    };

    const disabled =
      selection.status !== "open" ||
      market.status !== "open" ||
      event.bettingStatus !==
        "open";

    return `
      <button
        type="button"
        class="selection-button"
        data-selection="${encodeSelection(
          selectionData,
        )}"
        ${disabled ? "disabled" : ""}>

        <span>
          ${escapeHtml(
            selection.name,
          )}
        </span>

        <strong>
          ${Number(
            selection.decimalOdds,
          ).toFixed(2)}
        </strong>

      </button>
    `;
  }

  function renderMarket(
    event,
    market,
  ) {
    const selections =
      Array.isArray(
        market.selections,
      )
        ? market.selections
        : [];

    if (
      selections.length === 0
    ) {
      return "";
    }

    const periodText =
      market.periodName
        ? ` · ${escapeHtml(
            market.periodName,
          )}`
        : "";

    return `
      <section class="market-card">

        <h3 class="market-name">

          ${escapeHtml(
            market.marketName,
          )}

          ${periodText}

        </h3>

        <div class="selection-grid">

          ${selections
            .map(
              (selection) =>
                renderSelection(
                  event,
                  market,
                  selection,
                ),
            )
            .join("")}

        </div>

      </section>
    `;
  }

  function renderEvent(event) {
    const markets =
      Array.isArray(
        event.markets,
      )
        ? event.markets
        : [];

    const eventStatus =
      String(
        event.eventStatus ||
          "scheduled",
      ).toLowerCase();

    const isLive =
      eventStatus === "live";

    const marketHtml =
      markets
        .filter(
          (market) =>
            Array.isArray(
              market.selections,
            ) &&
            market.selections
              .length > 0,
        )
        .map(
          (market) =>
            renderMarket(
              event,
              market,
            ),
        )
        .join("");

    return `
      <article class="event-card">

        <header class="event-header">

          <div class="event-title-area">

            <div class="event-status-row">

              <span
                class="event-status ${
                  isLive
                    ? "live"
                    : ""
                }">

                ${
                  isLive
                    ? "LIVE"
                    : escapeHtml(
                        eventStatus,
                      )
                }

              </span>

            </div>

            <h2>
              ${escapeHtml(
                event.eventName,
              )}
            </h2>

          </div>

          <div class="event-time">

            ${formatDateTime(
              event.startsAt,
            )}

            <br>

            ${
              event.homeScore !==
                null &&
              event.homeScore !==
                undefined
                ? `${escapeHtml(
                    event.homeScore,
                  )} - ${escapeHtml(
                    event.awayScore,
                  )}`
                : ""
            }

          </div>

        </header>

        ${
          marketHtml ||
          `
            <div class="no-market-message">
              এই match-এর betting market এখন available নয়।
            </div>
          `
        }

      </article>
    `;
  }

  function renderEvents(events) {
    if (
      !Array.isArray(events) ||
      events.length === 0
    ) {
      DOM.sportsEvents
        .innerHTML = "";

      setStatus(
        "এই তারিখে কোনো match পাওয়া যায়নি।",
      );

      return;
    }

    setStatus("");

    DOM.sportsEvents
      .innerHTML =
      events
        .map(renderEvent)
        .join("");
  }

  /* =========================
     Load Sports Feed
  ========================= */

  async function loadEvents() {
    if (state.eventsLoading) {
      return;
    }

    const selectedDate =
      DOM.sportsDate.value;

    if (!selectedDate) {
      setStatus(
        "একটি date নির্বাচন করুন।",
      );

      return;
    }

    state.eventsLoading = true;

    DOM.refreshButton.disabled =
      true;

    DOM.sportsEvents.innerHTML =
      "";

    setStatus(
      "Match এবং odds load হচ্ছে...",
    );

    try {
      const query =
        new URLSearchParams({
          sport_name:
            state.sportName,
        });

      const data =
        await apiRequest(
          `/sports/${state.sportId}/feed/${selectedDate}?${query.toString()}`,
        );

      renderEvents(
        data.events || [],
      );

      console.log(
        "Sports sync:",
        data.sync,
      );
    } catch (error) {
      console.error(
        "SPORTS FEED ERROR:",
        error,
      );

      setStatus(
        error.message,
      );
    } finally {
      state.eventsLoading =
        false;

      DOM.refreshButton.disabled =
        false;
    }
  }

  /* =========================
     Bet Slip
  ========================= */

  function openBetSlip(
    selection,
  ) {
    state.selectedBet =
      selection;

    DOM.selectedBet.innerHTML =
      `
        <strong>
          ${escapeHtml(
            selection.eventName,
          )}
        </strong>

        <br>

        ${escapeHtml(
          selection.marketName,
        )}

        ·

        ${escapeHtml(
          selection.selectionName,
        )}

        @

        <strong>
          ${Number(
            selection.decimalOdds,
          ).toFixed(2)}
        </strong>
      `;

    setBetMessage("");

    DOM.betSlip
      .classList.add("open");

    DOM.betSlipBackdrop
      .classList.add("open");

    DOM.betSlip.setAttribute(
      "aria-hidden",
      "false",
    );

    updatePayoutPreview();

    window.setTimeout(
      () => {
        DOM.stakeAmount.focus();
      },
      150,
    );
  }

  function closeBetSlip() {
    DOM.betSlip
      .classList.remove("open");

    DOM.betSlipBackdrop
      .classList.remove("open");

    DOM.betSlip.setAttribute(
      "aria-hidden",
      "true",
    );
  }

  function updatePayoutPreview() {
    const stake =
      Number(
        DOM.stakeAmount.value,
      );

    const decimalOdds =
      Number(
        state.selectedBet
          ?.decimalOdds,
      );

    if (
      !Number.isFinite(stake) ||
      !Number.isFinite(
        decimalOdds,
      )
    ) {
      DOM.potentialPayout
        .textContent =
        formatMoney(0);

      return;
    }

    const calculatedPayout =
      stake * decimalOdds;

    const maximumPayout =
      Number(
        state.settings
          ?.maxPayout ||
          calculatedPayout,
      );

    DOM.potentialPayout
      .textContent =
      formatMoney(
        Math.min(
          calculatedPayout,
          maximumPayout,
        ),
      );
  }

  /* =========================
     Place Bet
  ========================= */

  async function submitBet() {
    if (
      state.betSubmitting
    ) {
      return;
    }

    if (
      !state.selectedBet
    ) {
      setBetMessage(
        "একটি betting option নির্বাচন করুন।",
        "error",
      );

      return;
    }

    const stakeAmount =
      Number(
        DOM.stakeAmount.value,
      );

    const minimumBet =
      Number(
        state.settings
          ?.minBet || 0,
      );

    const maximumBet =
      Number(
        state.settings
          ?.maxBet ||
          Number.MAX_SAFE_INTEGER,
      );

    if (
      !Number.isFinite(
        stakeAmount,
      ) ||
      stakeAmount <
        minimumBet ||
      stakeAmount >
        maximumBet
    ) {
      setBetMessage(
        `Bet amount ${formatMoney(
          minimumBet,
        )} থেকে ${formatMoney(
          maximumBet,
        )} হতে হবে।`,
        "error",
      );

      return;
    }

    state.betSubmitting = true;

    DOM.placeBetButton.disabled =
      true;

    setBetMessage(
      "Bet submit হচ্ছে...",
    );

    try {
      const data =
        await apiRequest(
          "/sports/bets",
          {
            method: "POST",

            body:
              JSON.stringify({
                selectionId:
                  state
                    .selectedBet
                    .id,

                stakeAmount,
              }),
          },
        );

      setBetMessage(
        `✓ ${data.bet.betCode} accepted। নতুন balance ${formatMoney(
          data.bet.balanceAfter,
        )}`,
        "success",
      );

      window.setTimeout(
        () => {
          closeBetSlip();
        },
        1800,
      );
    } catch (error) {
      console.error(
        "PLACE SPORTS BET ERROR:",
        error,
      );

      setBetMessage(
        error.message,
        "error",
      );
    } finally {
      state.betSubmitting =
        false;

      DOM.placeBetButton.disabled =
        false;
    }
  }

  /* =========================
     Bet History
  ========================= */

  function renderHistoryItem(
    bet,
  ) {
    const status =
      String(
        bet.status ||
          "pending",
      ).toLowerCase();

    return `
      <article class="history-item">

        <header>

          <strong>
            ${escapeHtml(
              bet.betCode,
            )}
          </strong>

          <span
            class="bet-status ${escapeHtml(
              status,
            )}">

            ${escapeHtml(
              status,
            )}

          </span>

        </header>

        <p>
          ${escapeHtml(
            bet.eventName,
          )}
        </p>

        <p>
          ${escapeHtml(
            bet.marketName,
          )}

          ·

          ${escapeHtml(
            bet.selectionName,
          )}

          @

          ${Number(
            bet.decimalOdds,
          ).toFixed(2)}
        </p>

        <p>
          Stake:
          ${formatMoney(
            bet.stakeAmount,
          )}

          · Potential:
          ${formatMoney(
            bet.potentialPayout,
          )}

          · Paid:
          ${formatMoney(
            bet.payoutAmount,
          )}
        </p>

        <p>
          ${formatDateTime(
            bet.placedAt,
          )}
        </p>

      </article>
    `;
  }

  async function openHistory() {
    DOM.historyDialog
      .showModal();

    DOM.historyList
      .textContent =
      "History load হচ্ছে...";

    try {
      const data =
        await apiRequest(
          "/sports/my-bets?limit=100",
        );

      const bets =
        Array.isArray(data.bets)
          ? data.bets
          : [];

      DOM.historyList.innerHTML =
        bets.length > 0
          ? bets
              .map(
                renderHistoryItem,
              )
              .join("")
          : `
              <div class="no-market-message">
                এখনো কোনো Sports bet নেই।
              </div>
            `;
    } catch (error) {
      DOM.historyList
        .textContent =
        error.message;
    }
  }

  /* =========================
     Events
  ========================= */

  document.addEventListener(
    "click",
    (event) => {
      const sportTab =
        event.target.closest(
          ".sport-tab",
        );

      if (sportTab) {
        document
          .querySelectorAll(
            ".sport-tab",
          )
          .forEach(
            (tab) => {
              tab.classList.remove(
                "active",
              );
            },
          );

        sportTab.classList.add(
          "active",
        );

        state.sportId =
          Number(
            sportTab.dataset
              .sportId,
          );

        state.sportName =
          sportTab.dataset
            .sportName;

        loadEvents();

        return;
      }

      const selectionButton =
        event.target.closest(
          ".selection-button",
        );

      if (
        selectionButton &&
        !selectionButton.disabled
      ) {
        try {
          const selection =
            decodeSelection(
              selectionButton
                .dataset.selection,
            );

          openBetSlip(
            selection,
          );
        } catch (error) {
          console.error(
            "SELECTION PARSE ERROR:",
            error,
          );
        }

        return;
      }

      const quickStake =
        event.target.closest(
          "[data-stake]",
        );

      if (quickStake) {
        DOM.stakeAmount.value =
          quickStake.dataset
            .stake;

        updatePayoutPreview();
      }
    },
  );

  DOM.refreshButton
    .addEventListener(
      "click",
      loadEvents,
    );

  DOM.sportsDate
    .addEventListener(
      "change",
      loadEvents,
    );

  DOM.stakeAmount
    .addEventListener(
      "input",
      updatePayoutPreview,
    );

  DOM.closeBetSlip
    .addEventListener(
      "click",
      closeBetSlip,
    );

  DOM.betSlipBackdrop
    .addEventListener(
      "click",
      closeBetSlip,
    );

  DOM.placeBetButton
    .addEventListener(
      "click",
      submitBet,
    );

  DOM.historyButton
    .addEventListener(
      "click",
      openHistory,
    );

  DOM.closeHistory
    .addEventListener(
      "click",
      () => {
        DOM.historyDialog.close();
      },
    );

  /* =========================
     Initialize
  ========================= */

  DOM.sportsDate.value =
    getLocalDate();

  Promise.all([
    loadSettings(),
    loadEvents(),
  ]).catch((error) => {
    console.error(
      "SPORTS INITIALIZATION ERROR:",
      error,
    );

    setStatus(
      error.message,
    );
  });
})();