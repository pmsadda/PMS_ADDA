"use strict";

/*====================================================

PMS ADDA

DECK ENGINE

Version : 1.0

====================================================*/

const cardDealSound = new Audio("../assets/sounds/card-deal.mp3");

cardDealSound.preload = "auto";
cardDealSound.volume = 0.65;

class DeckEngine {
  constructor() {
    this.suits = [
      "C", // Clubs
      "D", // Diamonds
      "H", // Hearts
      "S", // Spades
    ];

    this.ranks = [
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
      "K",
      "A",
    ];
  }

  /*=====================================

        CREATE NEW 52 CARD DECK

    =====================================*/

  createDeck() {
    GAME.deck = [];

    this.suits.forEach((suit) => {
      this.ranks.forEach((rank) => {
        GAME.deck.push(suit + rank);
      });
    });

    console.log(
      "Deck Created :",

      GAME.deck.length,

      "Cards",
    );
  }

  getPlayerContainer(playerId) {
    const uiSlot = UI.getPlayerUISlot(playerId);

    if (uiSlot === "current") {
      return "#currentPlayerCards img";
    }

    if (!uiSlot) {
      return "";
    }

    return `#player${uiSlot}Cards img`;
  }

  /*=====================================

            SHUFFLE

    Fisher Yates Shuffle

    =====================================*/

  shuffle() {
    for (let i = GAME.deck.length - 1; i > 0; i--) {
      let j = Math.floor(Math.random() * (i + 1));

      [GAME.deck[i], GAME.deck[j]] = [GAME.deck[j], GAME.deck[i]];
    }

    console.log("Deck Shuffled");
  }

  /*=====================================

        DRAW ONE CARD

    =====================================*/

  drawCard() {
    if (GAME.deck.length == 0) {
      console.warn("Deck Empty");

      return null;
    }

    return GAME.deck.pop();
  }

  /*=====================================

        REMAINING CARD

    =====================================*/

  remainingCards() {
    return GAME.deck.length;
  }

  /*=====================================

        RESET DECK

    =====================================*/

  reset() {
    GAME.deck = [];

    this.createDeck();

    this.shuffle();
  }

  /*=====================================

        PRINT DECK

    =====================================*/

  printDeck() {
    console.table(GAME.deck);
  }

  /*=====================================

        DEAL 3 CARDS TO PLAYERS

=====================================*/

  dealCards() {
    // Deck-এ পর্যাপ্ত Card আছে কি না
    const requiredCards = GAME.players.length * CONFIG.CARD_PER_PLAYER;

    if (GAME.deck.length < requiredCards) {
      console.error("Not enough cards in deck.");

      return false;
    }

    // আগের Round-এর Card Clear
    GAME.players.forEach((player) => {
      player.cards = [];
    });

    // Round Robin Deal
    for (let cardIndex = 0; cardIndex < CONFIG.CARD_PER_PLAYER; cardIndex++) {
      GAME.players.forEach((player) => {
        const card = this.drawCard();

        player.cards.push(card);
      });
    }

    console.log("Cards Dealt Successfully");

    return true;
  }

  /*=====================================

        GET PLAYER CARDS

=====================================*/

  getPlayerCards(playerId) {
    const targetPlayerId = Number(playerId);

    const player = GAME.players.find(
      (item) => Number(item.id) === targetPlayerId,
    );

    if (!player) {
      return [];
    }

    return player.cards;
  }

  /*=====================================

        CHECK DUPLICATE CARD

=====================================*/

  validateCards() {
    const allCards = [];

    GAME.players.forEach((player) => {
      player.cards.forEach((card) => {
        allCards.push(card);
      });
    });

    const uniqueCards = new Set(allCards);

    if (uniqueCards.size !== allCards.length) {
      console.error("Duplicate Card Found");

      return false;
    }

    console.log("Card Validation Passed");

    return true;
  }

  /*=====================================

        PRINT PLAYER CARDS

=====================================*/

  printPlayersCards() {
    GAME.players.forEach((player) => {
      console.log(
        player.name,

        player.cards,
      );
    });
  }

  /*=====================================

        START NEW ROUND DECK

=====================================*/

  prepareRound() {
    this.reset();

    const dealt = this.dealCards();

    if (!dealt) {
      console.error("Round preparation failed");

      return false;
    }

    const valid = this.validateCards();

    if (!valid) {
      console.error("Card validation failed");

      return false;
    }

    return true;
  }

  /*=====================================

        CARD IMAGE PATH

=====================================*/

  getCardImage(card) {
    if (!card) {
      return "../assets/cards/card-back.png";
    }

    return `../assets/cards/${card}.png`;
  }

  /*=====================================

        SHOW PLAYER CARDS

=====================================*/

  showPlayerCards(playerId) {
    const targetPlayerId = Number(playerId);

    const localPlayer = GAME.players.find(
      (player) => player.isLocalPlayer === true,
    );

    /*
     * শুধু নিজের card নিজে দেখতে পারবে।
     */
    if (!localPlayer || targetPlayerId !== Number(localPlayer.id)) {
      return false;
    }

    const player = GAME.players.find(
      (item) => Number(item.id) === targetPlayerId,
    );

    if (!player) {
      console.warn("Player not found:", playerId);

      return false;
    }

    if (
      !Array.isArray(player.cards) ||
      player.cards.length !== CONFIG.CARD_PER_PLAYER
    ) {
      console.warn("Player cards are incomplete:", playerId);

      return false;
    }

    const containerSelector = this.getPlayerContainer(player.id);

    if (!containerSelector) {
      console.warn("Player card container not found:", playerId);

      return false;
    }

    const cardElements = document.querySelectorAll(containerSelector);

    if (cardElements.length !== CONFIG.CARD_PER_PLAYER) {
      console.warn("Card elements not found:", playerId);

      return false;
    }

    player.cards.forEach((card, index) => {
      cardElements[index].src = this.getCardImage(card);
    });

    return true;
  }

  /*=====================================

        HIDE PLAYER CARDS

=====================================*/

  hidePlayerCards(playerId) {
    const cardElements = document.querySelectorAll(
      this.getPlayerContainer(playerId),
    );

    cardElements.forEach((img) => {
      img.src = "../assets/cards/card-back.png";
    });
  }

  /*=====================================

        SHOW ALL CARDS

=====================================*/

  showAllCards() {
    GAME.players.forEach((player) => {
      this.showPlayerCards(player.id);
    });
  }

  /*=====================================

        HIDE ALL CARDS

=====================================*/

  hideAllCards() {
    GAME.players.forEach((player) => {
      this.hidePlayerCards(player.id);
    });
  }

  /*=====================================

        PLAYER SEE CARD

=====================================*/

  seeCards(playerId) {
    const targetPlayerId = Number(playerId);

    const player = GAME.players.find(
      (item) => Number(item.id) === targetPlayerId,
    );

    if (!player) {
      console.warn("Player not found:", playerId);

      return false;
    }

    if (player.isLocalPlayer !== true) {
      console.warn("Only local player can see cards:", playerId);

      return false;
    }

    if (player.packed) {
      console.warn("Packed player cannot see cards");

      return false;
    }

    if (player.seen) {
      return true;
    }

    player.seen = true;

    GAME.setPlayerStatus(player.id, "SEEN");

    const shown = this.showPlayerCards(player.id);

    if (!shown) {
      player.seen = false;

      GAME.setPlayerStatus(player.id, "BLIND");

      return false;
    }

    return true;
  }

  /*=====================================

        UPDATE SINGLE CARD

=====================================*/

  updateCard(playerId, index) {
    const targetPlayerId = Number(playerId);
    const cardIndex = Number(index);

    const player = GAME.players.find(
      (item) => Number(item.id) === targetPlayerId,
    );

    if (!player) {
      console.warn("Card update failed. Player not found:", playerId);

      return false;
    }

    if (
      !Number.isInteger(cardIndex) ||
      cardIndex < 0 ||
      cardIndex >= CONFIG.CARD_PER_PLAYER
    ) {
      console.warn("Invalid card index:", index);

      return false;
    }

    const cardElements = document.querySelectorAll(
      this.getPlayerContainer(player.id),
    );

    const targetCard = cardElements[cardIndex];

    if (!targetCard) {
      console.warn("Card element not found:", {
        playerId: player.id,
        cardIndex,
      });

      return false;
    }

    targetCard.src = this.getCardImage(player.cards[cardIndex]);

    return true;
  }

  /*=====================================

        RENDER ROUND

=====================================*/

  renderRound() {
    GAME.players.forEach((player) => {
      if (player.seen) {
        this.showPlayerCards(player.id);
      } else {
        this.hidePlayerCards(player.id);
      }
    });
  }

  /*=====================================

        DEAL ANIMATION

=====================================*/
  async dealAnimation() {
    const deckImage = document.querySelector("#deck img");

    if (!deckImage) {
      console.warn("Deck image not found");
      return;
    }

    // সব player-এর card শুরুতে hidden
    for (const player of GAME.players) {
      const cardElements = document.querySelectorAll(
        this.getPlayerContainer(player.id),
      );

      cardElements.forEach((card) => {
        card.src = "../assets/cards/card-back.png";
        card.style.opacity = "0";
      });
    }

    // প্রথমে প্রত্যেক player-এর ১ম card
    // তারপর প্রত্যেক player-এর ২য় card
    // তারপর প্রত্যেক player-এর ৩য় card
    for (let cardIndex = 0; cardIndex < CONFIG.CARD_PER_PLAYER; cardIndex++) {
      for (const player of GAME.players) {
        const playerCards = document.querySelectorAll(
          this.getPlayerContainer(player.id),
        );

        const targetCard = playerCards[cardIndex];

        if (!targetCard) {
          console.warn(
            "Card target পাওয়া যায়নি:",
            player.name,
            player.id,
            cardIndex,
          );
          continue;
        }

        playCardDealSound();

        await ANIMATION.flyCard(deckImage, targetCard);
      }
    }

    console.log("One-by-one card dealing completed");

    this.renderRound();
  }
  /*=====================================

        SINGLE CARD ANIMATION

=====================================*/

  animateSingleCard(playerId, cardIndex) {
    return new Promise((resolve) => {
      const deck = document.querySelector("#deck img");

      const targetCards = document.querySelectorAll(
        this.getPlayerContainer(playerId),
      );

      const target = targetCards[cardIndex];

      if (!deck || !target) {
        resolve();

        return;
      }

      // Deck Position
      const deckRect = deck.getBoundingClientRect();

      // Target Position
      const targetRect = target.getBoundingClientRect();

      // Flying Card
      const fly = document.createElement("img");

      fly.src = "../assets/cards/card-back.png";

      fly.className = "flying-card";

      fly.style.position = "fixed";

      fly.style.left = deckRect.left + "px";

      fly.style.top = deckRect.top + "px";

      fly.style.width = deckRect.width + "px";

      fly.style.height = deckRect.height + "px";

      fly.style.zIndex = "9999";

      fly.style.pointerEvents = "none";

      fly.style.transition = "all .35s ease";

      document.body.appendChild(fly);

      requestAnimationFrame(() => {
        fly.style.left = targetRect.left + "px";

        fly.style.top = targetRect.top + "px";
      });

      setTimeout(() => {
        target.style.opacity = "1";

        document.body.removeChild(fly);

        resolve();
      }, 350);
    });
  }

  /*=====================================

        START ROUND

   =====================================*/

  async startRound() {
    this.prepareRound();

    await this.dealAnimation();
  }

  revealPlayerCardsForShow(playerId) {
    const targetPlayerId = Number(playerId);

    const player = GAME.players.find(
      (item) => Number(item.id) === targetPlayerId,
    );

    if (!player) {
      console.warn("Show reveal failed. Player not found:", playerId);

      return false;
    }

    if (
      !Array.isArray(player.cards) ||
      player.cards.length !== CONFIG.CARD_PER_PLAYER
    ) {
      console.warn("Show reveal failed. Cards incomplete:", playerId);

      return false;
    }

    const containerSelector = this.getPlayerContainer(player.id);

    if (!containerSelector) {
      return false;
    }

    const cardElements = document.querySelectorAll(containerSelector);

    if (cardElements.length !== CONFIG.CARD_PER_PLAYER) {
      console.warn("Show card elements not found:", playerId);

      return false;
    }

    player.cards.forEach((card, index) => {
      cardElements[index].src = this.getCardImage(card);
    });

    return true;
  }
}
function playCardDealSound() {
  try {
    const sound = cardDealSound.cloneNode(true);

    sound.volume = 0.65;
    sound.currentTime = 0;

    sound.play().catch(() => {});
  } catch (e) {}
}
/*=====================================

    GLOBAL OBJECT

=====================================*/

const DECK = new DeckEngine();
