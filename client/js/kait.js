"use strict";

(function initializeKaitGame() {
  /* =======================================================
     DOM
  ======================================================= */

  const DOM = {
    backButton:
      document.getElementById("backBtn"),

    soundButton:
      document.getElementById("soundBtn"),

    walletBalance:
      document.getElementById("walletBalance"),

    connectionBar:
      document.getElementById("connectionBar"),

    connectionText:
      document.getElementById("connectionText"),

    roundCode:
      document.getElementById("roundCode"),

    roundStatus:
      document.getElementById("roundStatus"),

    totalPlayers:
      document.getElementById("totalPlayers"),

    timerValue:
      document.getElementById("timerValue"),

    roundTotalBet:
      document.getElementById("roundTotalBet"),

    kaitTable:
      document.querySelector(".kait-table"),

    frontSide:
      document.getElementById("frontSide"),

    backSide:
      document.getElementById("backSide"),

    frontCards:
      document.getElementById("frontCards"),

    backCards:
      document.getElementById("backCards"),

    dealStatusText:
      document.getElementById("dealStatusText"),

    resolvedRankGrid:
      document.getElementById("resolvedRankGrid"),

    resolvedCounter:
      document.getElementById("resolvedCounter"),

    rankGrid:
      document.getElementById("rankGrid"),

    selectedRankText:
      document.getElementById("selectedRankText"),

    winMultiplier:
      document.getElementById("winMultiplier"),

    serviceCharge:
      document.getElementById("serviceCharge"),

    betLimitText:
      document.getElementById("betLimitText"),

    decreaseBetButton:
      document.getElementById("decreaseBetBtn"),

    increaseBetButton:
      document.getElementById("increaseBetBtn"),

    betAmountInput:
      document.getElementById("betAmountInput"),

    quickBetOptions:
      document.getElementById("quickBetOptions"),

    betPreview:
      document.getElementById("betPreview"),

    possibleWin:
      document.getElementById("possibleWin"),

    placeBetButton:
      document.getElementById("placeBetBtn"),

    placeBetText:
      document.getElementById("placeBetText"),

    bettingMessage:
      document.getElementById("bettingMessage"),

    myBetCard:
      document.getElementById("myBetCard"),

    myBetRank:
      document.getElementById("myBetRank"),

    myBetAmount:
      document.getElementById("myBetAmount"),

    myBetPossibleWin:
      document.getElementById(
        "myBetPossibleWin"
      ),

    myBetStatus:
      document.getElementById("myBetStatus"),

    resultOverlay:
      document.getElementById("resultOverlay"),

    resultCloseButton:
      document.getElementById(
        "resultCloseBtn"
      ),

    continueButton:
      document.getElementById("continueBtn"),

    resultIcon:
      document.getElementById("resultIcon"),

    resultTitle:
      document.getElementById("resultTitle"),

    resultRank:
      document.getElementById("resultRank"),

    resultCardImage:
      document.getElementById(
        "resultCardImage"
      ),

    resultBetAmount:
      document.getElementById(
        "resultBetAmount"
      ),

    resultPayout:
      document.getElementById(
        "resultPayout"
      ),

    userResultMessage:
      document.getElementById(
        "userResultMessage"
      ),

    loadingOverlay:
      document.getElementById(
        "loadingOverlay"
      ),

    loadingText:
      document.getElementById(
        "loadingText"
      ),

    toast:
      document.getElementById("gameToast")
  };


  /* =======================================================
     STATE
  ======================================================= */

  const state = {
    socket: null,

    connected: false,

    gameEnabled: true,

    ranks: [
      "A",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
      "J",
      "Q",
      "K"
    ],

    round: null,

    settings: {
      minimumBet: 10,

      maximumBet: 10000,

      winningMultiplier: 2,

      serviceChargePercent: 5,

      bettingDurationSeconds: 20,

      cardDealIntervalMs: 900,

      resultDisplaySeconds: 5,

      nextRoundDelaySeconds: 3
    },

    selectedRank: null,

    betAmount: 10,

    myBet: null,

    bettingOpen: false,

    placingBet: false,

    countdownTimer: null,

    toastTimer: null,

    sidePulseTimer: null,

    soundEnabled: true,

    renderedCards:
      new Set(),

    shownResultRoundIds:
      new Set()
  };


  /* =======================================================
     AUDIO
  ======================================================= */

  const sounds = {
    deal:
      createAudio(
        "../assets/sounds/card-deal.mp3",
        0.42
      ),

    bet:
      createAudio(
        "../assets/sounds/chip-throw.mp3",
        0.55
      ),

    win:
      createAudio(
        "../assets/sounds/winner.mp3",
        0.6
      )
  };


  function createAudio(
    source,
    volume
  ) {
    try {
      const audio =
        new Audio(source);

      audio.preload =
        "auto";

      audio.volume =
        volume;

      return audio;
    } catch (_error) {
      return null;
    }
  }


  function playSound(name) {
    if (
      !state.soundEnabled
    ) {
      return;
    }

    const audio =
      sounds[name];

    if (!audio) {
      return;
    }

    try {
      audio.currentTime = 0;

      const promise =
        audio.play();

      if (
        promise?.catch
      ) {
        promise.catch(
          () => {}
        );
      }
    } catch (_error) {
      // ignore
    }
  }


  /* =======================================================
     AUTH
  ======================================================= */

  function getAccessToken() {
    return localStorage.getItem(
      "access_token"
    );
  }


  function redirectToLogin() {
    localStorage.removeItem(
      "access_token"
    );

    window.location.replace(
      "./login.html"
    );
  }


  /* =======================================================
     HELPERS
  ======================================================= */

  function parseAmount(value) {
    const amount =
      Number(value);

    if (
      !Number.isFinite(
        amount
      )
    ) {
      return 0;
    }

    return Number(
      amount.toFixed(2)
    );
  }


  function formatMoney(value) {
    return parseAmount(
      value
    ).toLocaleString(
      "en-BD",
      {
        minimumFractionDigits:
          2,

        maximumFractionDigits:
          2
      }
    );
  }


  function formatStatus(value) {
    const status =
      String(
        value || ""
      )
        .trim()
        .replace(
          /_/g,
          " "
        );

    if (!status) {
      return "--";
    }

    return status.replace(
      /\b\w/g,
      (character) =>
        character
          .toUpperCase()
    );
  }


  function getApiUrl(path) {
    return window
      .APP_CONFIG
      .api(path);
  }


  /*
   * Kait backend:
   * AS
   * 10H
   * KD
   *
   * Existing images:
   * SA.png
   * H10.png
   * DK.png
   */

  function getCardAssetCode(
    cardCode
  ) {
    const value =
      String(
        cardCode || ""
      )
        .trim()
        .toUpperCase();

    const backendMatch =
      value.match(
        /^(A|2|3|4|5|6|7|8|9|10|J|Q|K)(S|H|D|C)$/
      );

    if (
      backendMatch
    ) {
      const rank =
        backendMatch[1];

      const suit =
        backendMatch[2];

      return `${suit}${rank}`;
    }

    const assetMatch =
      value.match(
        /^(S|H|D|C)(A|2|3|4|5|6|7|8|9|10|J|Q|K)$/
      );

    if (
      assetMatch
    ) {
      return value;
    }

    return "";
  }


  function getCardImageUrl(
    cardCode
  ) {
    const assetCode =
      getCardAssetCode(
        cardCode
      );

    if (!assetCode) {
      return (
        "../assets/cards/" +
        "card-back.png"
      );
    }

    return (
      "../assets/cards/" +
      `${assetCode}.png`
    );
  }


  function getRoundStatus(
    round = state.round
  ) {
    return String(
      round
        ?.roundStatus ||
      ""
    )
      .trim()
      .toLowerCase();
  }


  function getBetStep() {
    const minimum =
      parseAmount(
        state.settings
          .minimumBet
      );

    if (
      minimum > 0
    ) {
      return minimum;
    }

    return 10;
  }


  /* =======================================================
     MESSAGE
  ======================================================= */

  function setBettingMessage(
    message,
    type = ""
  ) {
    DOM
      .bettingMessage
      .textContent =
        message;

    DOM
      .bettingMessage
      .classList
      .remove(
        "is-error",
        "is-success"
      );

    if (type) {
      DOM
        .bettingMessage
        .classList
        .add(
          `is-${type}`
        );
    }
  }


  function showToast(
    message,
    type = ""
  ) {
    window.clearTimeout(
      state.toastTimer
    );

    DOM.toast.textContent =
      message;

    DOM.toast.classList.remove(
      "is-error",
      "is-success"
    );

    if (type) {
      DOM.toast.classList.add(
        `is-${type}`
      );
    }

    DOM.toast.classList.add(
      "is-visible"
    );

    state.toastTimer =
      window.setTimeout(
        () => {
          DOM
            .toast
            .classList
            .remove(
              "is-visible"
            );
        },
        3500
      );
  }


  function hideLoading() {
    DOM
      .loadingOverlay
      .classList
      .add(
        "is-hidden"
      );
  }


  function renderConnection(
    status,
    message
  ) {
    DOM
      .connectionBar
      .classList
      .remove(
        "is-connected",
        "is-disconnected"
      );

    if (
      status ===
      "connected"
    ) {
      DOM
        .connectionBar
        .classList
        .add(
          "is-connected"
        );
    }

    if (
      status ===
      "disconnected"
    ) {
      DOM
        .connectionBar
        .classList
        .add(
          "is-disconnected"
        );
    }

    DOM
      .connectionText
      .textContent =
        message;
  }


  /* =======================================================
     API
  ======================================================= */

  async function apiRequest(
    path,
    options = {}
  ) {
    const token =
      getAccessToken();

    if (!token) {
      redirectToLogin();

      throw new Error(
        "Login session is required."
      );
    }

    const response =
      await fetch(
        getApiUrl(path),
        {
          ...options,

          headers: {
            "Content-Type":
              "application/json",

            Authorization:
              `Bearer ${token}`,

            ...options.headers
          }
        }
      );

    const result =
      await response
        .json()
        .catch(
          () => ({
            success: false,

            message:
              "Invalid server response."
          })
        );

    if (
      response.status ===
      401
    ) {
      redirectToLogin();

      throw new Error(
        result.message ||
        "Login session expired."
      );
    }

    if (
      !response.ok ||
      !result.success
    ) {
      const error =
        new Error(
          result.message ||
          "Request failed."
        );

      error.code =
        result.code ||
        null;

      error.statusCode =
        response.status;

      throw error;
    }

    return result.data;
  }


  async function loadWallet() {
    const data =
      await apiRequest(
        "/wallet/summary"
      );

    const balance =
      data?.wallet?.balance ??
      data?.user?.walletBalance ??
      data?.walletBalance ??
      0;

    DOM
      .walletBalance
      .textContent =
        formatMoney(
          balance
        );

    return parseAmount(
      balance
    );
  }


  async function loadInitialState() {
    const data =
      await apiRequest(
        "/kait/state"
      );

    await applyGameState(
      data,
      {
        loadUserBet: true
      }
    );

    hideLoading();

    return data;
  }


  async function loadMyBet(
    roundId,
    options = {}
  ) {
    const validRoundId =
      Number(roundId);

    if (
      !Number.isInteger(
        validRoundId
      ) ||
      validRoundId < 1
    ) {
      state.myBet =
        null;

      renderMyBet();

      return null;
    }

    try {
      const bet =
        await apiRequest(
          `/kait/bets/my/${validRoundId}`
        );

      state.myBet =
        bet ||
        null;

      if (bet) {
        state.selectedRank =
          bet.selectedRank ||
          state.selectedRank;

        state.betAmount =
          parseAmount(
            bet.betAmount
          ) ||
          state.betAmount;
      }

      renderSelectedRank();

      renderMyBet();

      renderBetControls();

      if (
        options.showResult ===
          true &&
        bet &&
        [
          "won",
          "lost"
        ].includes(
          String(
            bet.betStatus
          ).toLowerCase()
        )
      ) {
        showBetResult(
          bet
        );
      }

      return bet;

    } catch (error) {
      console.error(
        "Kait my bet load error:",
        error
      );

      if (
        options.silent !==
        true
      ) {
        showToast(
          error.message ||
          "Your Kait bet could not be loaded.",
          "error"
        );
      }

      return null;
    }
  }


  /* =======================================================
     SETTINGS
  ======================================================= */

  function updateSettingsFromRound(
    round
  ) {
    if (!round) {
      return;
    }

    state.settings = {
      minimumBet:
        parseAmount(
          round.minimumBet
        ) ||
        state.settings
          .minimumBet,

      maximumBet:
        parseAmount(
          round.maximumBet
        ) ||
        state.settings
          .maximumBet,

      winningMultiplier:
        Number(
          round.winningMultiplier
        ) ||
        state.settings
          .winningMultiplier,

      serviceChargePercent:
        Number(
          round.serviceChargePercent
        ) ||
        0,

      bettingDurationSeconds:
        Number(
          round
            .bettingDurationSeconds
        ) ||
        state.settings
          .bettingDurationSeconds,

      cardDealIntervalMs:
        Number(
          round
            .cardDealIntervalMs
        ) ||
        state.settings
          .cardDealIntervalMs,

      resultDisplaySeconds:
        Number(
          round
            .resultDisplaySeconds
        ) ||
        state.settings
          .resultDisplaySeconds,

      nextRoundDelaySeconds:
        Number(
          round
            .nextRoundDelaySeconds
        ) ||
        state.settings
          .nextRoundDelaySeconds
    };
  }


  /* =======================================================
     RESET ROUND
  ======================================================= */

  function resetRoundVisuals() {
    state.selectedRank =
      null;

    state.myBet =
      null;

    state.placingBet =
      false;

    state
      .renderedCards
      .clear();


    DOM.frontCards.innerHTML = `
      <span class="empty-card-message">
        Cards will appear here
      </span>
    `;


    DOM.backCards.innerHTML = `
      <span class="empty-card-message">
        Cards will appear here
      </span>
    `;


    DOM
      .frontSide
      .classList
      .remove(
        "is-active"
      );

    DOM
      .backSide
      .classList
      .remove(
        "is-active"
      );

    DOM
      .kaitTable
      .classList
      .remove(
        "is-dealing"
      );


    DOM
      .resolvedRankGrid
      .querySelectorAll(
        ".resolved-rank"
      )
      .forEach(
        (element) => {

          element
            .classList
            .remove(
              "is-front",
              "is-back"
            );

          const resultText =
            element
              .querySelector(
                "span"
              );

          if (
            resultText
          ) {
            resultText
              .textContent =
                "--";
          }
        }
      );


    DOM
      .resolvedCounter
      .textContent =
        "0 / 13";


    DOM
      .rankGrid
      .querySelectorAll(
        ".rank-button"
      )
      .forEach(
        (button) => {

          button
            .classList
            .remove(
              "is-selected",
              "is-resolved",
              "is-winner-rank"
            );
        }
      );


    DOM
      .myBetCard
      .classList
      .add(
        "is-hidden"
      );


    DOM
      .resultOverlay
      .classList
      .add(
        "is-hidden"
      );


    renderSelectedRank();
  }


  /* =======================================================
     GAME STATE
  ======================================================= */

  async function applyGameState(
    data,
    options = {}
  ) {
    if (!data) {
      return;
    }

    state.gameEnabled =
      data.gameEnabled !==
      false;


    if (
      Array.isArray(
        data.ranks
      ) &&
      data.ranks.length > 0
    ) {
      state.ranks =
        data.ranks.map(
          (rank) =>
            String(rank)
              .toUpperCase()
        );
    }


    const incomingRound =
      data.round ||
      null;


    const oldRoundId =
      Number(
        state.round?.id ||
        0
      );


    const newRoundId =
      Number(
        incomingRound?.id ||
        0
      );


    if (
      newRoundId &&
      newRoundId !==
        oldRoundId
    ) {
      resetRoundVisuals();
    }


    state.round =
      incomingRound;


    if (
      incomingRound
    ) {
      updateSettingsFromRound(
        incomingRound
      );


      const roundStatus =
        getRoundStatus(
          incomingRound
        );


      const bettingEndsAt =
        new Date(
          incomingRound
            .bettingEndsAt
        ).getTime();


      state.bettingOpen =
        state.gameEnabled &&
        roundStatus ===
          "betting" &&
        Number.isFinite(
          bettingEndsAt
        ) &&
        bettingEndsAt >
          Date.now();


      if (
        !state.betAmount ||
        newRoundId !==
          oldRoundId
      ) {
        state.betAmount =
          state.settings
            .minimumBet;
      }

    } else {
      state.bettingOpen =
        false;
    }


    renderRound();


    renderResolvedRanks(
      incomingRound
        ?.resolvedRanks ||
      []
    );


    renderRecoveredResolvedCards(
      incomingRound
        ?.resolvedRanks ||
      []
    );


    renderBetAmount();

    renderSelectedRank();

    renderBetControls();

    startCountdown();


    if (
      options
        .loadUserBet ===
        true &&
      incomingRound?.id
    ) {
      await loadMyBet(
        incomingRound.id,
        {
          silent: true
        }
      );
    }
  }


  /* =======================================================
     ROUND UI
  ======================================================= */

  function renderRound() {
    const round =
      state.round;

    if (!round) {
      DOM
        .roundCode
        .textContent =
          "Waiting...";

      DOM
        .roundStatus
        .textContent =
          "Waiting";

      DOM
        .totalPlayers
        .textContent =
          "0";

      DOM
        .roundTotalBet
        .textContent =
          "0.00";

      DOM
        .timerValue
        .textContent =
          "--";

      DOM
        .dealStatusText
        .textContent =
          "Waiting for a Kait round...";

      return;
    }


    DOM
      .roundCode
      .textContent =
        round.roundCode ||
        `#${round.id}`;


    DOM
      .totalPlayers
      .textContent =
        String(
          Number(
            round.totalPlayers ||
            0
          )
        );


    DOM
      .roundTotalBet
      .textContent =
        formatMoney(
          round.totalBetAmount ||
          0
        );


    DOM
      .winMultiplier
      .textContent =
        `${Number(
          state.settings
            .winningMultiplier ||
          0
        ).toFixed(2)}x`;


    DOM
      .serviceCharge
      .textContent =
        String(
          Number(
            state.settings
              .serviceChargePercent ||
            0
          )
        );


    DOM
      .betLimitText
      .textContent =
        `Min ৳${formatMoney(
          state.settings.minimumBet
        )} • Max ৳${formatMoney(
          state.settings.maximumBet
        )}`;


    const status =
      getRoundStatus(
        round
      );


    DOM
      .roundStatus
      .classList
      .remove(
        "is-betting",
        "is-dealing",
        "is-settled"
      );


    if (
      status ===
      "betting"
    ) {
      DOM
        .roundStatus
        .textContent =
          state.bettingOpen
            ? "Betting Open"
            : "Closing";


      DOM
        .roundStatus
        .classList
        .add(
          "is-betting"
        );


      DOM
        .kaitTable
        .classList
        .remove(
          "is-dealing"
        );


      DOM
        .dealStatusText
        .textContent =
          "Choose one rank and place your bet.";

    } else if (
      [
        "dealing",
        "settling"
      ].includes(
        status
      )
    ) {

      DOM
        .roundStatus
        .textContent =
          status ===
          "settling"
            ? "Settling"
            : "Dealing";


      DOM
        .roundStatus
        .classList
        .add(
          "is-dealing"
        );


      DOM
        .kaitTable
        .classList
        .add(
          "is-dealing"
        );


      DOM
        .dealStatusText
        .textContent =
          "Front and Back cards are being dealt live...";

    } else if (
      status ===
      "completed"
    ) {

      DOM
        .roundStatus
        .textContent =
          "Completed";


      DOM
        .roundStatus
        .classList
        .add(
          "is-settled"
        );


      DOM
        .kaitTable
        .classList
        .remove(
          "is-dealing"
        );


      DOM
        .dealStatusText
        .textContent =
          "Round completed. Next round is coming...";

    } else {

      DOM
        .roundStatus
        .textContent =
          formatStatus(
            status ||
            "Waiting"
          );


      DOM
        .dealStatusText
        .textContent =
          "Waiting for game update...";
    }
  }


  /* =======================================================
     TIMER
  ======================================================= */

  function startCountdown() {
    window.clearInterval(
      state.countdownTimer
    );


    function tick() {
      const round =
        state.round;


      const status =
        getRoundStatus(
          round
        );


      if (
        !round ||
        status !==
          "betting"
      ) {
        DOM
          .timerValue
          .textContent =
            status ===
            "completed"
              ? "0"
              : "--";

        return;
      }


      const endTime =
        new Date(
          round.bettingEndsAt
        ).getTime();


      if (
        !Number.isFinite(
          endTime
        )
      ) {
        DOM
          .timerValue
          .textContent =
            "--";

        return;
      }


      const remainingMs =
        endTime -
        Date.now();


      const remainingSeconds =
        Math.max(
          0,
          Math.ceil(
            remainingMs /
            1000
          )
        );


      DOM
        .timerValue
        .textContent =
          String(
            remainingSeconds
          );


      const wasOpen =
        state.bettingOpen;


      state.bettingOpen =
        state.gameEnabled &&
        remainingSeconds > 0 &&
        status ===
          "betting";


      if (
        remainingSeconds <= 0
      ) {
        state.bettingOpen =
          false;


        DOM
          .roundStatus
          .textContent =
            "Betting Closed";


        setBettingMessage(
          "Betting time শেষ। Card deal শুরু হচ্ছে..."
        );
      }


      if (
        wasOpen !==
          state.bettingOpen ||
        remainingSeconds <= 1
      ) {
        renderBetControls();
      }
    }


    tick();


    state.countdownTimer =
      window.setInterval(
        tick,
        250
      );
  }


  /* =======================================================
     CARD
  ======================================================= */

  function removeEmptyCardMessage(
    container
  ) {
    const emptyMessage =
      container
        .querySelector(
          ".empty-card-message"
        );

    if (
      emptyMessage
    ) {
      emptyMessage.remove();
    }
  }


  function appendCard(
    side,
    card,
    options = {}
  ) {
    if (!card) {
      return;
    }


    const cardCode =
      String(
        card.code ||
        card.firstCardCode ||
        ""
      )
        .toUpperCase();


    const deckPosition =
      Number(
        card.deckPosition ||
        card.matchedDeckPosition ||
        0
      );


    if (!cardCode) {
      return;
    }


    const key =
      `${deckPosition || "x"}-${cardCode}`;


    if (
      state
        .renderedCards
        .has(key)
    ) {
      return;
    }


    state
      .renderedCards
      .add(key);


    const container =
      side === "back"
        ? DOM.backCards
        : DOM.frontCards;


    removeEmptyCardMessage(
      container
    );


    const wrapper =
      document
        .createElement(
          "div"
        );


    wrapper.className =
      "kait-dealt-card";


    if (
      options.matching ===
      true
    ) {
      wrapper
        .classList
        .add(
          "is-matching"
        );
    }


    if (
      deckPosition
    ) {
      wrapper.dataset.position =
        String(
          deckPosition
        );
    }


    wrapper.dataset.cardCode =
      cardCode;


    const image =
      document
        .createElement(
          "img"
        );


    image.src =
      getCardImageUrl(
        cardCode
      );


    image.alt =
      cardCode;


    image.loading =
      "eager";


    image.addEventListener(
      "error",
      () => {
        image.src =
          "../assets/cards/card-back.png";
      },
      {
        once: true
      }
    );


    wrapper.appendChild(
      image
    );


    container.appendChild(
      wrapper
    );
  }


  function pulseDealSides() {
    window.clearTimeout(
      state.sidePulseTimer
    );


    DOM
      .frontSide
      .classList
      .add(
        "is-active"
      );


    DOM
      .backSide
      .classList
      .add(
        "is-active"
      );


    state.sidePulseTimer =
      window.setTimeout(
        () => {

          DOM
            .frontSide
            .classList
            .remove(
              "is-active"
            );


          DOM
            .backSide
            .classList
            .remove(
              "is-active"
            );

        },
        320
      );
  }


  function renderRecoveredResolvedCards(
    results
  ) {
    if (
      !Array.isArray(
        results
      ) ||
      results.length ===
        0
    ) {
      return;
    }


    [...results]
      .sort(
        (
          a,
          b
        ) =>
          Number(
            a.deckPosition ||
            0
          ) -
          Number(
            b.deckPosition ||
            0
          )
      )
      .forEach(
        (result) => {

          appendCard(
            result.resultSide,
            {
              code:
                result
                  .firstCardCode,

              deckPosition:
                result
                  .deckPosition
            },
            {
              matching: true
            }
          );

        }
      );
  }


  function markMatchingCards(
    results
  ) {
    const resolvedPositions =
      new Set(
        (
          Array.isArray(
            results
          )
            ? results
            : []
        )
          .map(
            (result) =>
              Number(
                result
                  .deckPosition ||
                0
              )
          )
          .filter(
            (position) =>
              position > 0
          )
      );


    document
      .querySelectorAll(
        ".kait-dealt-card[data-position]"
      )
      .forEach(
        (element) => {

          const position =
            Number(
              element
                .dataset
                .position ||
              0
            );


          element
            .classList
            .toggle(
              "is-matching",
              resolvedPositions
                .has(
                  position
                )
            );

        }
      );
  }


  /* =======================================================
     RANK RESULTS
  ======================================================= */

  function renderResolvedRanks(
    results
  ) {
    const safeResults =
      Array.isArray(
        results
      )
        ? results
        : [];


    const resultMap =
      new Map(
        safeResults.map(
          (result) => [
            String(
              result.rankCode ||
              ""
            )
              .toUpperCase(),

            result
          ]
        )
      );


    DOM
      .resolvedRankGrid
      .querySelectorAll(
        ".resolved-rank"
      )
      .forEach(
        (element) => {

          const rank =
            String(
              element
                .dataset
                .resultRank ||
              ""
            )
              .toUpperCase();


          const result =
            resultMap.get(
              rank
            );


          const label =
            element
              .querySelector(
                "span"
              );


          element
            .classList
            .remove(
              "is-front",
              "is-back"
            );


          if (!result) {
            if (
              label
            ) {
              label
                .textContent =
                  "--";
            }

            return;
          }


          const side =
            String(
              result
                .resultSide ||
              ""
            )
              .toLowerCase();


          if (
            side ===
            "front"
          ) {
            element
              .classList
              .add(
                "is-front"
              );
          }


          if (
            side ===
            "back"
          ) {
            element
              .classList
              .add(
                "is-back"
              );
          }


          if (
            label
          ) {
            label.textContent =
              side ===
              "front"
                ? "FRONT"
                : "BACK";
          }

        }
      );


    DOM
      .resolvedCounter
      .textContent =
        `${safeResults.length} / 13`;


    DOM
      .rankGrid
      .querySelectorAll(
        ".rank-button"
      )
      .forEach(
        (button) => {

          const rank =
            String(
              button
                .dataset
                .rank ||
              ""
            )
              .toUpperCase();


          const result =
            resultMap.get(
              rank
            );


          button
            .classList
            .toggle(
              "is-resolved",
              Boolean(
                result
              )
            );


          button
            .classList
            .toggle(
              "is-winner-rank",
              String(
                result
                  ?.resultSide ||
                ""
              )
                .toLowerCase() ===
                "front"
            );

        }
      );


    markMatchingCards(
      safeResults
    );
  }


  /* =======================================================
     BET AMOUNT
  ======================================================= */

  function clampBetAmount(
    value
  ) {
    const minimum =
      parseAmount(
        state.settings
          .minimumBet
      ) ||
      10;


    const maximum =
      parseAmount(
        state.settings
          .maximumBet
      ) ||
      10000;


    return Math.min(
      maximum,
      Math.max(
        minimum,
        parseAmount(
          value
        )
      )
    );
  }


  function setBetAmount(
    value
  ) {
    state.betAmount =
      clampBetAmount(
        value
      );


    renderBetAmount();

    renderBetControls();
  }


  function renderBetAmount() {
    state.betAmount =
      clampBetAmount(
        state.betAmount ||
        state.settings
          .minimumBet
      );


    DOM
      .betAmountInput
      .value =
        String(
          state.betAmount
        );


    DOM
      .betPreview
      .textContent =
        formatMoney(
          state.betAmount
        );


    const grossPayout =
      parseAmount(
        state.betAmount *
        Number(
          state.settings
            .winningMultiplier ||
          0
        )
      );


    const serviceCharge =
      parseAmount(
        grossPayout *
        (
          Number(
            state.settings
              .serviceChargePercent ||
            0
          ) /
          100
        )
      );


    const netPayout =
      parseAmount(
        grossPayout -
        serviceCharge
      );


    DOM
      .possibleWin
      .textContent =
        formatMoney(
          netPayout
        );


    DOM
      .quickBetOptions
      .querySelectorAll(
        "button[data-amount]"
      )
      .forEach(
        (button) => {

          button
            .classList
            .toggle(
              "is-active",

              parseAmount(
                button
                  .dataset
                  .amount
              ) ===
              state.betAmount
            );

        }
      );
  }


  /* =======================================================
     SELECT RANK
  ======================================================= */

  function selectRank(
    rank
  ) {
    if (
      !state.bettingOpen ||
      state.placingBet ||
      state.myBet
    ) {
      return;
    }


    const normalizedRank =
      String(
        rank ||
        ""
      )
        .trim()
        .toUpperCase();


    if (
      !state.ranks.includes(
        normalizedRank
      )
    ) {
      return;
    }


    state.selectedRank =
      normalizedRank;


    renderSelectedRank();

    renderBetControls();
  }


  function renderSelectedRank() {
    DOM
      .selectedRankText
      .textContent =
        state.selectedRank ||
        "--";


    DOM
      .rankGrid
      .querySelectorAll(
        ".rank-button"
      )
      .forEach(
        (button) => {

          button
            .classList
            .toggle(
              "is-selected",

              String(
                button
                  .dataset
                  .rank ||
                ""
              )
                .toUpperCase() ===
              state.selectedRank
            );

        }
      );
  }


  /* =======================================================
     BET CONTROLS
  ======================================================= */

  function renderBetControls() {
    const hasBet =
      Boolean(
        state.myBet
      );


    const controlsDisabled =
      !state.gameEnabled ||
      !state.connected ||
      !state.bettingOpen ||
      state.placingBet ||
      hasBet;


    DOM
      .rankGrid
      .querySelectorAll(
        ".rank-button"
      )
      .forEach(
        (button) => {
          button.disabled =
            controlsDisabled;
        }
      );


    DOM
      .decreaseBetButton
      .disabled =
        controlsDisabled;


    DOM
      .increaseBetButton
      .disabled =
        controlsDisabled;


    DOM
      .betAmountInput
      .disabled =
        controlsDisabled;


    DOM
      .quickBetOptions
      .querySelectorAll(
        "button"
      )
      .forEach(
        (button) => {

          const quickAmount =
            parseAmount(
              button
                .dataset
                .amount
            );


          button.disabled =
            controlsDisabled ||

            quickAmount <
              state.settings
                .minimumBet ||

            quickAmount >
              state.settings
                .maximumBet;

        }
      );


    DOM
      .placeBetButton
      .disabled =
        controlsDisabled ||
        !state.selectedRank;


    if (
      !state.gameEnabled
    ) {
      DOM
        .placeBetText
        .textContent =
          "Game Disabled";


      setBettingMessage(
        "Kait is currently unavailable."
      );

      return;
    }


    if (
      state.placingBet
    ) {
      DOM
        .placeBetText
        .textContent =
          "Placing Bet...";


      setBettingMessage(
        "Please wait... Bet submit হচ্ছে।"
      );

      return;
    }


    if (
      hasBet
    ) {
      DOM
        .placeBetText
        .textContent =
          "Bet Placed";


      setBettingMessage(
        `এই round-এ ${state.myBet.selectedRank} rank-এ আপনার bet নেওয়া হয়েছে।`,
        "success"
      );

      return;
    }


    if (
      !state.connected
    ) {
      DOM
        .placeBetText
        .textContent =
          "Connecting...";


      setBettingMessage(
        "Live game connection-এর অপেক্ষা করুন।"
      );

      return;
    }


    if (
      !state.bettingOpen
    ) {
      DOM
        .placeBetText
        .textContent =
          "Betting Closed";


      setBettingMessage(
        "এই round-এ betting বন্ধ। Next round-এর অপেক্ষা করুন।"
      );

      return;
    }


    if (
      !state.selectedRank
    ) {
      DOM
        .placeBetText
        .textContent =
          "Select a Rank";


      setBettingMessage(
        "A থেকে K পর্যন্ত একটি rank নির্বাচন করুন।"
      );

      return;
    }


    DOM
      .placeBetText
      .textContent =
        `Bet ৳${formatMoney(
          state.betAmount
        )} on ${state.selectedRank}`;


    setBettingMessage(
      `${state.selectedRank} selected — bet confirm করতে button চাপুন।`
    );
  }


  /* =======================================================
     MY BET
  ======================================================= */

  function renderMyBet() {
    const bet =
      state.myBet;


    DOM
      .myBetStatus
      .classList
      .remove(
        "is-win",
        "is-loss"
      );


    if (!bet) {
      DOM
        .myBetCard
        .classList
        .add(
          "is-hidden"
        );

      return;
    }


    DOM
      .myBetCard
      .classList
      .remove(
        "is-hidden"
      );


    DOM
      .myBetRank
      .textContent =
        bet.selectedRank ||
        "--";


    DOM
      .myBetAmount
      .textContent =
        formatMoney(
          bet.betAmount ||
          0
        );


    DOM
      .myBetPossibleWin
      .textContent =
        formatMoney(
          bet
            .potentialNetPayout ||
          bet.netPayout ||
          0
        );


    const status =
      String(
        bet.betStatus ||
        "accepted"
      )
        .toLowerCase();


    DOM
      .myBetStatus
      .textContent =
        formatStatus(
          status
        );


    if (
      status ===
      "won"
    ) {
      DOM
        .myBetStatus
        .classList
        .add(
          "is-win"
        );
    }


    if (
      status ===
      "lost"
    ) {
      DOM
        .myBetStatus
        .classList
        .add(
          "is-loss"
        );
    }
  }


  /* =======================================================
     PLACE BET
  ======================================================= */

  async function placeBet() {
    if (
      state.placingBet ||
      !state.round?.id ||
      !state.selectedRank ||
      !state.bettingOpen ||
      state.myBet
    ) {
      return;
    }


    const amount =
      clampBetAmount(
        DOM
          .betAmountInput
          .value
      );


    state.betAmount =
      amount;


    renderBetAmount();


    state.placingBet =
      true;


    renderBetControls();


    try {

      const bet =
        await apiRequest(
          "/kait/bets",
          {
            method:
              "POST",

            body:
              JSON.stringify({
                roundId:
                  state.round.id,

                selectedRank:
                  state.selectedRank,

                betAmount:
                  amount
              })
          }
        );


      state.myBet = {
        ...bet,

        betStatus:
          bet?.betStatus ||
          "accepted"
      };


      if (
        bet
          ?.balanceAfterBet !==
        undefined
      ) {
        DOM
          .walletBalance
          .textContent =
            formatMoney(
              bet.balanceAfterBet
            );
      }


      /*
       * Current backend bet API
       * total event emit করে না।
       *
       * তাই নিজের screen
       * instantly update হবে।
       */

      if (
        state.round
      ) {
        state.round
          .totalBetAmount =
            parseAmount(
              Number(
                state.round
                  .totalBetAmount ||
                0
              ) +
              amount
            );


        state.round
          .totalPlayers =
            Number(
              state.round
                .totalPlayers ||
              0
            ) +
            1;


        state.round
          .totalBets =
            Number(
              state.round
                .totalBets ||
              0
            ) +
            1;
      }


      playSound(
        "bet"
      );


      renderRound();

      renderMyBet();

      renderBetControls();


      showToast(
        `${state.selectedRank} rank-এ ৳${formatMoney(amount)} bet placed.`,
        "success"
      );

    } catch (error) {

      console.error(
        "Kait bet error:",
        error
      );


      showToast(
        error.message ||
        "Kait bet could not be placed.",
        "error"
      );


      setBettingMessage(
        error.message ||
        "Bet failed.",
        "error"
      );


      if (
        [
          "KAIT_USER_ALREADY_BET",

          "KAIT_BETTING_CLOSED",

          "KAIT_BETTING_TIME_ENDED"

        ].includes(
          error.code
        )
      ) {
        await loadMyBet(
          state.round.id,
          {
            silent:
              true
          }
        );
      }

    } finally {

      state.placingBet =
        false;


      renderBetControls();
    }
  }


  /* =======================================================
     RESULT
  ======================================================= */

  function showBetResult(
    bet
  ) {
    const roundId =
      Number(
        bet?.roundId ||
        state.round?.id ||
        0
      );


    if (
      !roundId ||
      state
        .shownResultRoundIds
        .has(
          roundId
        )
    ) {
      return;
    }


    const status =
      String(
        bet?.betStatus ||
        ""
      )
        .toLowerCase();


    if (
      ![
        "won",
        "lost"
      ].includes(
        status
      )
    ) {
      return;
    }


    state
      .shownResultRoundIds
      .add(
        roundId
      );


    const modal =
      DOM
        .resultOverlay
        .querySelector(
          ".result-modal"
        );


    modal
      ?.classList
      .remove(
        "is-win",
        "is-loss"
      );


    const isWin =
      status ===
      "won";


    modal
      ?.classList
      .add(
        isWin
          ? "is-win"
          : "is-loss"
      );


    DOM
      .resultIcon
      .innerHTML =
        isWin
          ? '<i class="fa-solid fa-crown"></i>'
          : '<i class="fa-solid fa-xmark"></i>';


    DOM
      .resultTitle
      .textContent =
        isWin
          ? "WIN"
          : "LOSE";


    DOM
      .resultRank
      .textContent =
        bet.selectedRank ||
        "--";


    DOM
      .resultCardImage
      .src =
        getCardImageUrl(
          bet
            .matchedCardCode
        );


    DOM
      .resultCardImage
      .alt =
        bet
          .matchedCardCode ||
        "Matching card";


    DOM
      .resultBetAmount
      .textContent =
        formatMoney(
          bet.betAmount ||
          0
        );


    DOM
      .resultPayout
      .textContent =
        formatMoney(
          bet.netPayout ||
          0
        );


    DOM
      .userResultMessage
      .textContent =
        isWin

          ? `আপনার ${bet.selectedRank} rank Front side-এ প্রথম এসেছে। আপনি ৳${formatMoney(
              bet.netPayout ||
              0
            )} পেয়েছেন।`

          : `আপনার ${bet.selectedRank} rank Back side-এ প্রথম এসেছে। এই round-এ আপনি জিতেননি।`;


    DOM
      .resultOverlay
      .classList
      .remove(
        "is-hidden"
      );


    if (
      isWin
    ) {
      playSound(
        "win"
      );
    }
  }


  function closeResult() {
    DOM
      .resultOverlay
      .classList
      .add(
        "is-hidden"
      );
  }


  /* =======================================================
     SOCKET STATE
  ======================================================= */

  async function handleSocketState(
    payload
  ) {
    const data =
      payload?.data ||
      payload;


    if (
      !data?.round
    ) {
      return;
    }


    await applyGameState(
      data,
      {
        loadUserBet:
          true
      }
    );


    hideLoading();
  }


  /* =======================================================
     NEW BETTING ROUND
  ======================================================= */

  async function handleBettingOpen(
    payload
  ) {
    const round =
      payload?.round;


    if (!round) {
      return;
    }


    await applyGameState(
      {
        gameEnabled:
          true,

        ranks:
          state.ranks,

        round
      },
      {
        loadUserBet:
          true
      }
    );


    showToast(
      "New Kait betting round started.",
      "success"
    );


    hideLoading();
  }


  /* =======================================================
     DEAL START
  ======================================================= */

  function handleDealingStarted(
    payload
  ) {
    if (
      Number(
        payload?.roundId ||
        0
      ) !==
      Number(
        state.round?.id ||
        0
      )
    ) {
      return;
    }


    state.bettingOpen =
      false;


    if (
      state.round
    ) {
      state.round
        .roundStatus =
          "dealing";
    }


    DOM
      .timerValue
      .textContent =
        "0";


    renderRound();

    renderBetControls();


    setBettingMessage(
      "Betting closed. Live card deal শুরু হয়েছে।"
    );
  }


  /* =======================================================
     LIVE PAIR
  ======================================================= */

  function handlePairDealt(
    payload
  ) {
    if (
      Number(
        payload?.roundId ||
        0
      ) !==
      Number(
        state.round?.id ||
        0
      )
    ) {
      return;
    }


    state.bettingOpen =
      false;


    if (
      state.round
    ) {
      state.round
        .roundStatus =
          "dealing";


      state.round
        .lastDealtPosition =
          Number(
            payload
              .lastDealtPosition ||
            0
          );


      state.round
        .resolvedRanks =
          Array.isArray(
            payload.resolvedRanks
          )
            ? payload
                .resolvedRanks
            : state.round
                .resolvedRanks;
    }


    appendCard(
      "front",
      payload.front
    );


    appendCard(
      "back",
      payload.back
    );


    renderResolvedRanks(
      payload
        .resolvedRanks ||
      []
    );


    pulseDealSides();


    playSound(
      "deal"
    );


    DOM
      .dealStatusText
      .textContent =
        `Pair ${Number(
          payload.pairNumber ||
          0
        )} dealt • ${
          Array.isArray(
            payload.resolvedRanks
          )
            ? payload
                .resolvedRanks
                .length
            : 0
        }/13 ranks resolved`;


    renderRound();

    renderBetControls();
  }


  /* =======================================================
     ROUND COMPLETE
  ======================================================= */

  async function handleRoundCompleted(
    payload
  ) {
    const roundId =
      Number(
        payload?.roundId ||
        state.round?.id ||
        0
      );


    if (
      !roundId ||
      roundId !==
        Number(
          state.round?.id ||
          0
        )
    ) {
      return;
    }


    state.bettingOpen =
      false;


    if (
      state.round
    ) {
      state.round
        .roundStatus =
          "completed";
    }


    renderRound();

    renderBetControls();


    DOM
      .timerValue
      .textContent =
        "0";


    DOM
      .dealStatusText
      .textContent =
        "Round completed. Result settled.";


    /*
     * এখানে /kait/state
     * call করছি না।
     *
     * Server delay শেষে
     * নতুন state পাঠাবে।
     */

    await Promise.allSettled([
      loadMyBet(
        roundId,
        {
          showResult:
            true,

          silent:
            true
        }
      ),

      loadWallet()
    ]);
  }


  /* =======================================================
     SOCKET
  ======================================================= */

  function initializeSocket() {
    if (
      typeof window.io !==
      "function"
    ) {
      renderConnection(
        "disconnected",
        "Socket.IO client unavailable"
      );


      DOM
        .loadingText
        .textContent =
          "Game connection unavailable.";

      return;
    }


    const token =
      getAccessToken();


    if (!token) {
      redirectToLogin();

      return;
    }


    const socket =
      window.io(
        `${window.APP_CONFIG.SERVER_URL}/kait`,
        {
          auth: {
            token
          },


          transports: [
            "websocket",
            "polling"
          ],


          reconnection:
            true,


          reconnectionAttempts:
            Infinity,


          reconnectionDelay:
            1000,


          reconnectionDelayMax:
            5000,


          timeout:
            15000
        }
      );


    state.socket =
      socket;


    socket.on(
      "connect",
      () => {

        state.connected =
          true;


        renderConnection(
          "connected",
          "Live Kait connected"
        );


        renderBetControls();

      }
    );


    socket.on(
      "disconnect",
      () => {

        state.connected =
          false;


        renderConnection(
          "disconnected",
          "Connection lost — reconnecting..."
        );


        renderBetControls();

      }
    );


    socket.on(
      "connect_error",
      (error) => {

        state.connected =
          false;


        renderConnection(
          "disconnected",
          error?.message ||
          "Kait connection failed"
        );


        renderBetControls();


        if (
          [
            "AUTH_TOKEN_REQUIRED",
            "AUTH_TOKEN_INVALID"
          ].includes(
            error?.message
          )
        ) {
          redirectToLogin();
        }

      }
    );


    socket.on(
      "kait:state",
      (payload) => {

        handleSocketState(
          payload
        ).catch(
          (error) => {

            console.error(
              "Kait state socket error:",
              error
            );

          }
        );

      }
    );


    socket.on(
      "kait:betting-open",
      (payload) => {

        handleBettingOpen(
          payload
        ).catch(
          (error) => {

            console.error(
              "Kait betting open error:",
              error
            );

          }
        );

      }
    );


    socket.on(
      "kait:dealing-started",
      (payload) => {

        handleDealingStarted(
          payload
        );

      }
    );


    socket.on(
      "kait:pair-dealt",
      (payload) => {

        handlePairDealt(
          payload
        );

      }
    );


    socket.on(
      "kait:round-completed",
      (payload) => {

        handleRoundCompleted(
          payload
        ).catch(
          (error) => {

            console.error(
              "Kait settlement UI error:",
              error
            );

          }
        );

      }
    );


    socket.on(
      "kait:error",
      (payload) => {

        const message =
          payload?.message ||
          "Kait game error.";


        showToast(
          message,
          "error"
        );

      }
    );
  }


  /* =======================================================
     EVENTS
  ======================================================= */

  function bindEvents() {
    DOM
      .backButton
      .addEventListener(
        "click",
        () => {

          window.location.href =
            "./lobby.html";

        }
      );


    DOM
      .soundButton
      .addEventListener(
        "click",
        () => {

          state.soundEnabled =
            !state.soundEnabled;


          DOM
            .soundButton
            .innerHTML =
              state.soundEnabled

                ? '<i class="fa-solid fa-volume-high"></i>'

                : '<i class="fa-solid fa-volume-xmark"></i>';


          showToast(
            state.soundEnabled
              ? "Game sound on."
              : "Game sound off."
          );

        }
      );


    DOM
      .rankGrid
      .querySelectorAll(
        ".rank-button[data-rank]"
      )
      .forEach(
        (button) => {

          button.addEventListener(
            "click",
            () => {

              selectRank(
                button
                  .dataset
                  .rank
              );

            }
          );

        }
      );


    DOM
      .decreaseBetButton
      .addEventListener(
        "click",
        () => {

          setBetAmount(
            state.betAmount -
            getBetStep()
          );

        }
      );


    DOM
      .increaseBetButton
      .addEventListener(
        "click",
        () => {

          setBetAmount(
            state.betAmount +
            getBetStep()
          );

        }
      );


    DOM
      .betAmountInput
      .addEventListener(
        "input",
        () => {

          const value =
            parseAmount(
              DOM
                .betAmountInput
                .value
            );


          if (
            value > 0
          ) {

            state.betAmount =
              value;


            const grossPayout =
              parseAmount(
                state.betAmount *
                Number(
                  state.settings
                    .winningMultiplier ||
                  0
                )
              );


            const charge =
              parseAmount(
                grossPayout *
                (
                  Number(
                    state.settings
                      .serviceChargePercent ||
                    0
                  ) /
                  100
                )
              );


            DOM
              .betPreview
              .textContent =
                formatMoney(
                  state.betAmount
                );


            DOM
              .possibleWin
              .textContent =
                formatMoney(
                  grossPayout -
                  charge
                );
          }

        }
      );


    DOM
      .betAmountInput
      .addEventListener(
        "change",
        () => {

          setBetAmount(
            DOM
              .betAmountInput
              .value
          );

        }
      );


    DOM
      .quickBetOptions
      .querySelectorAll(
        "button[data-amount]"
      )
      .forEach(
        (button) => {

          button.addEventListener(
            "click",
            () => {

              setBetAmount(
                button
                  .dataset
                  .amount
              );

            }
          );

        }
      );


    DOM
      .placeBetButton
      .addEventListener(
        "click",
        () => {

          placeBet()
            .catch(
              (error) => {

                console.error(
                  "Kait place bet error:",
                  error
                );

              }
            );

        }
      );


    DOM
      .resultCloseButton
      .addEventListener(
        "click",
        closeResult
      );


    DOM
      .continueButton
      .addEventListener(
        "click",
        closeResult
      );


    DOM
      .resultOverlay
      .addEventListener(
        "click",
        (event) => {

          if (
            event.target ===
            DOM.resultOverlay
          ) {
            closeResult();
          }

        }
      );


    window.addEventListener(
      "beforeunload",
      () => {

        window.clearInterval(
          state.countdownTimer
        );


        state.socket
          ?.disconnect();

      }
    );
  }


  /* =======================================================
     INITIALIZE
  ======================================================= */

  async function initialize() {
    if (
      !getAccessToken()
    ) {
      redirectToLogin();

      return;
    }


    bindEvents();


    state.betAmount =
      state.settings
        .minimumBet;


    renderBetAmount();

    renderSelectedRank();

    renderBetControls();


    initializeSocket();


    try {

      await Promise.all([
        loadWallet(),

        loadInitialState()
      ]);

    } catch (error) {

      console.error(
        "Kait initialization error:",
        error
      );


      DOM
        .loadingText
        .textContent =
          error.message ||
          "Kait could not be loaded.";


      showToast(
        error.message ||
        "Kait could not be loaded.",
        "error"
      );
    }
  }


  void initialize();

})();