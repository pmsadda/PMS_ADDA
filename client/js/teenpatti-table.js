"use strict";

/* =========================================================
   PMS ADDA - TEEN PATTI GAME ENGINE

   PART 1
   ---------------------------------------------------------
   1. Game State
   2. Player State
   3. 52 Card Deck
   4. Shuffle System
   5. Card Assignment
   6. Card Distribution Animation
   7. Dynamic Pot
   8. Basic UI Update
========================================================= */


/* =========================================================
   CARD IMAGE CONFIGURATION
========================================================= */

/*
    তোমার card path:

    ../assets/cards/C10.png
    ../assets/cards/HA.png
    ../assets/cards/DK.png
*/

const CARD_IMAGE_PATH = "../assets/cards/";

/*
    Card back image path
*/

const CARD_BACK_IMAGE =
    "../assets/cards/card-back.png";


/* =========================================================
   PLAYER HTML SELECTORS
========================================================= */

/*
    GAME.players এর index এবং HTML player class
    একই order-এ থাকতে হবে।
*/

const PLAYER_SELECTORS = [
    ".player1", // Player index 0
    ".player2", // Player index 1
    ".player3", // Player index 2
    ".player4", // Player index 3
    ".you"      // Player index 4
];


/*
    প্রতিটি player-এর card container ID
*/

const PLAYER_CARD_BOX_IDS = [
    "player1Cards",
    "player2Cards",
    "player3Cards",
    "player4Cards",
    "currentPlayerCards"
];


/* =========================================================
   MAIN GAME STATE
========================================================= */

const GAME = {

    /*
        বর্তমান round number
    */

    round: 1,


    /*
        Dealer player index
    */

    dealer: 0,


    /*
        Current turn player index
    */

    turn: 1,


    /*
        Table-এর বর্তমান মোট pot
    */

    pot: 0,


    /*
        বর্তমান minimum blind amount
    */

    currentBet: 10,


    /*
        Round শুরু হয়েছে কিনা
    */

    roundRunning: false,


    /*
        Round শেষ হয়েছে কিনা
    */

    roundFinished: false,


    /*
        বর্তমানে ব্যবহৃত shuffled deck
    */

    deck: [],


    /*
        Timer পরের Part-এ পুরোপুরি যুক্ত হবে
    */

    timer: 15,

    timerInterval: null,


    /*
        Game players
    */

    players: [

        {
            id: 0,
            name: "Rakib",
            balance: 1850,

            /*
                Player-এর তিনটি card এখানে থাকবে
            */

            cards: [],

            seen: false,
            packed: false,

            /*
                এই round-এ কত টাকা bet করেছে
            */

            roundBet: 0
        },

        {
            id: 1,
            name: "Siam",
            balance: 2200,
            cards: [],
            seen: false,
            packed: false,
            roundBet: 0
        },

        {
            id: 2,
            name: "Fahim",
            balance: 3100,
            cards: [],
            seen: false,
            packed: false,
            roundBet: 0
        },

        {
            id: 3,
            name: "Nahid",
            balance: 950,
            cards: [],
            seen: false,
            packed: false,
            roundBet: 0
        },

        {
            id: 4,
            name: "YOU",
            balance: 2450,
            cards: [],
            seen: false,
            packed: false,
            roundBet: 0,

            /*
                Human player চেনার জন্য
            */

            isHuman: true
        }
    ]
};


/* =========================================================
   CREATE 52-CARD DECK
========================================================= */

function createDeck() {

    /*
        Suit:

        C = Clubs
        D = Diamonds
        H = Hearts
        S = Spades
    */

    const suits = [
        "C",
        "D",
        "H",
        "S"
    ];


    /*
        Card ranks
    */

    const ranks = [
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
        "A"
    ];


    const deck = [];


    /*
        4 suit × 13 rank = 52 cards
    */

    suits.forEach((suit) => {

        ranks.forEach((rank) => {

            deck.push(
                suit + rank
            );

        });

    });


    return deck;
}


/* =========================================================
   SHUFFLE DECK
========================================================= */

function shuffleDeck(deck) {

    /*
        Original deck পরিবর্তন না করে copy করা হচ্ছে
    */

    const shuffledDeck = [
        ...deck
    ];


    /*
        Fisher-Yates Shuffle Algorithm
    */

    for (
        let i = shuffledDeck.length - 1;
        i > 0;
        i--
    ) {

        const randomIndex =
            Math.floor(
                Math.random() * (i + 1)
            );


        /*
            দুইটি card position swap
        */

        [
            shuffledDeck[i],
            shuffledDeck[randomIndex]
        ] = [
            shuffledDeck[randomIndex],
            shuffledDeck[i]
        ];

    }


    return shuffledDeck;
}


/* =========================================================
   ASSIGN 3 CARDS TO EVERY PLAYER
========================================================= */

function assignCardsToPlayers() {

    /*
        প্রথমে fresh 52-card deck বানানো হচ্ছে
    */

    const freshDeck =
        createDeck();


    /*
        Deck shuffle করা হচ্ছে
    */

    GAME.deck =
        shuffleDeck(freshDeck);


    /*
        প্রত্যেক player-কে ৩টি card দেওয়া হচ্ছে
    */

    GAME.players.forEach((player) => {

        player.cards = [
            GAME.deck.pop(),
            GAME.deck.pop(),
            GAME.deck.pop()
        ];

    });


    /*
        Testing-এর জন্য console-এ cards দেখা যাবে
    */

    console.table(

        GAME.players.map((player) => {

            return {

                Player: player.name,

                Card1: player.cards[0],

                Card2: player.cards[1],

                Card3: player.cards[2]

            };

        })

    );
}


/* =========================================================
   WAIT HELPER
========================================================= */

function wait(milliseconds) {

    return new Promise((resolve) => {

        setTimeout(
            resolve,
            milliseconds
        );

    });
}


/* =========================================================
   GET PLAYER CARD IMAGES
========================================================= */

function getPlayerCardImages(playerIndex) {

    const cardBoxId =
        PLAYER_CARD_BOX_IDS[playerIndex];


    const cardBox =
        document.getElementById(cardBoxId);


    if (!cardBox) {

        console.warn(
            "Card box পাওয়া যায়নি:",
            cardBoxId
        );

        return [];
    }


    return Array.from(
        cardBox.querySelectorAll("img")
    );
}


/* =========================================================
   RESET CARD IMAGES
========================================================= */

function resetCardImages() {

    GAME.players.forEach((player, playerIndex) => {

        const cardImages =
            getPlayerCardImages(playerIndex);


        cardImages.forEach((cardImage) => {

            /*
                সব card আবার back image হবে
            */

            cardImage.src =
                CARD_BACK_IMAGE;


            /*
                Animation শুরুর আগে hide
            */

            cardImage.style.opacity =
                "0";

        });

    });
}


/* =========================================================
   SINGLE CARD FLY ANIMATION
========================================================= */

async function animateSingleCard(targetCard) {

    /*
        Deck image খোঁজা হচ্ছে
    */

    const deckImage =
        document.querySelector("#deck img");


    if (!deckImage) {

        console.warn(
            "#deck img পাওয়া যায়নি"
        );

        return;
    }


    if (!targetCard) {

        return;
    }


    /*
        Deck এবং target card position
    */

    const deckPosition =
        deckImage.getBoundingClientRect();


    const targetPosition =
        targetCard.getBoundingClientRect();


    /*
        Flying card element বানানো হচ্ছে
    */

    const flyingCard =
        document.createElement("img");


    flyingCard.src =
        CARD_BACK_IMAGE;


    flyingCard.className =
        "fly-card";


    /*
        প্রথমে deck-এর position-এ রাখা হচ্ছে
    */

    flyingCard.style.left =
        deckPosition.left + "px";


    flyingCard.style.top =
        deckPosition.top + "px";


    flyingCard.style.width =
        deckPosition.width + "px";


    flyingCard.style.height =
        deckPosition.height + "px";


    document.body.appendChild(
        flyingCard
    );


    /*
        Browser-কে element render করার সময় দেওয়া
    */

    await wait(30);


    /*
        Deck থেকে player-এর দিকে animation
    */

    const animation =
        flyingCard.animate(

            [
                {
                    left:
                        deckPosition.left + "px",

                    top:
                        deckPosition.top + "px",

                    transform:
                        "scale(1) rotate(-12deg)"
                },

                {
                    left:
                        targetPosition.left + "px",

                    top:
                        targetPosition.top + "px",

                    transform:
                        "scale(1) rotate(0deg)"
                }
            ],

            {
                duration: 420,

                easing:
                    "ease-out",

                fill:
                    "forwards"
            }

        );


    /*
        Animation শেষ হওয়া পর্যন্ত অপেক্ষা
    */

    await animation.finished;


    /*
        আসল target card দেখানো
    */

    targetCard.style.opacity =
        "1";


    /*
        Flying card remove
    */

    flyingCard.remove();
}


/* =========================================================
   DISTRIBUTE CARDS
========================================================= */

async function distributeCards() {

    console.log(
        "Card distribution started"
    );


    /*
        প্রথমে card back এবং hide করা হচ্ছে
    */

    resetCardImages();


    /*
        Teen Patti style:

        প্রথম round:
        প্রত্যেক player-কে ১টি করে card

        দ্বিতীয় round:
        প্রত্যেক player-কে দ্বিতীয় card

        তৃতীয় round:
        প্রত্যেক player-কে তৃতীয় card
    */

    for (
        let cardRound = 0;
        cardRound < 3;
        cardRound++
    ) {

        for (
            let playerIndex = 0;
            playerIndex < GAME.players.length;
            playerIndex++
        ) {

            const cardImages =
                getPlayerCardImages(playerIndex);


            const targetCard =
                cardImages[cardRound];


            if (!targetCard) {

                continue;
            }


            await animateSingleCard(
                targetCard
            );


            /*
                দুই card-এর মাঝখানে সামান্য delay
            */

            await wait(90);

        }

    }


    console.log(
        "Card distribution completed"
    );
}


/* =========================================================
   REVEAL PLAYER CARDS
========================================================= */

function revealPlayerCards(playerIndex) {

    const player =
        GAME.players[playerIndex];


    if (!player) {

        return;
    }


    const cardImages =
        getPlayerCardImages(playerIndex);


    player.cards.forEach((card, cardIndex) => {

        if (!cardImages[cardIndex]) {

            return;
        }


        /*
            Example:

            ../assets/cards/C10.png
            ../assets/cards/HA.png
        */

        cardImages[cardIndex].src =
            CARD_IMAGE_PATH +
            card +
            ".png";


        cardImages[cardIndex].style.opacity =
            "1";

    });
}


/* =========================================================
   HIDE PLAYER CARDS
========================================================= */

function hidePlayerCards(playerIndex) {

    const cardImages =
        getPlayerCardImages(playerIndex);


    cardImages.forEach((cardImage) => {

        cardImage.src =
            CARD_BACK_IMAGE;

    });
}


/* =========================================================
   UPDATE DYNAMIC POT
========================================================= */

function updatePot() {

    const potAmount =
        document.getElementById(
            "potAmount"
        );


    if (!potAmount) {

        console.warn(
            "#potAmount পাওয়া যায়নি"
        );

        return;
    }


    /*
        Pot-এর বর্তমান amount HTML-এ দেখানো
    */

    potAmount.textContent =
        "৳" + GAME.pot;
}


/* =========================================================
   ADD MONEY TO POT
========================================================= */

function addToPot(playerIndex, amount) {

    const player =
        GAME.players[playerIndex];


    if (!player) {

        console.error(
            "Player পাওয়া যায়নি:",
            playerIndex
        );

        return false;
    }


    /*
        Invalid amount block
    */

    if (
        !Number.isFinite(amount) ||
        amount <= 0
    ) {

        console.error(
            "Invalid bet amount:",
            amount
        );

        return false;
    }


    /*
        Balance কম থাকলে bet করা যাবে না
    */

    if (player.balance < amount) {

        console.log(
            player.name,
            "এর balance কম"
        );

        return false;
    }


    /*
        Player balance থেকে টাকা কমানো
    */

    player.balance -= amount;


    /*
        Player-এর round bet update
    */

    player.roundBet += amount;


    /*
        Pot বাড়ানো
    */

    GAME.pot += amount;


    /*
        Pot UI update
    */

    updatePot();


    console.log(
        player.name,
        "bet করেছে ৳" + amount,
        "| Pot: ৳" + GAME.pot
    );


    return true;
}


/* =========================================================
   RESET PLAYER ROUND STATE
========================================================= */

function resetPlayersForNewRound() {

    GAME.players.forEach((player) => {

        player.cards = [];

        player.seen = false;

        player.packed = false;

        player.roundBet = 0;

    });
}


/* =========================================================
   UPDATE PLAYER STATUS
========================================================= */

function updatePlayerStatuses() {

    const statusElements =
        document.querySelectorAll(
            ".status"
        );


    GAME.players.forEach(
        (player, playerIndex) => {

            const statusElement =
                statusElements[playerIndex];


            if (!statusElement) {

                return;
            }


            if (player.packed) {

                statusElement.textContent =
                    "Packed";


                statusElement.className =
                    "status packed";

            } else if (player.seen) {

                statusElement.textContent =
                    "Seen";


                statusElement.className =
                    "status seen";

            } else {

                statusElement.textContent =
                    "Blind";


                statusElement.className =
                    "status blind";

            }

        }
    );
}


/* =========================================================
   UPDATE DEALER
========================================================= */

function updateDealerUI() {

    const dealerChips =
        document.querySelectorAll(
            ".dealer-chip"
        );


    dealerChips.forEach((dealerChip) => {

        dealerChip.style.display =
            "none";

    });


    if (dealerChips[GAME.dealer]) {

        dealerChips[GAME.dealer]
            .style.display = "flex";

    }
}


/* =========================================================
   UPDATE CURRENT TURN UI
========================================================= */

function updateCurrentTurnUI() {

    document.querySelectorAll(
        ".player"
    ).forEach((playerElement) => {

        playerElement.classList.remove(
            "current-turn"
        );

    });


    const currentPlayerElement =
        document.querySelector(
            PLAYER_SELECTORS[GAME.turn]
        );


    if (currentPlayerElement) {

        currentPlayerElement.classList.add(
            "current-turn"
        );

    }
}


/* =========================================================
   RESET ACTION BUTTONS
========================================================= */

function resetActionButtons() {

    const blindButton =
        document.querySelector(
            ".blind-button"
        );


    if (blindButton) {

        blindButton.textContent =
            "Blind";

    }


    const showButton =
        document.querySelector(
            ".show-button"
        );


    if (showButton) {

        showButton.disabled =
            true;


        showButton.style.opacity =
            "0.5";

    }
}


/* =========================================================
   START NEW ROUND
========================================================= */

async function startRound() {

    /*
        একই সময়ে দুইবার round শুরু block
    */

    if (GAME.roundRunning) {

        return;
    }


    GAME.roundRunning =
        true;


    GAME.roundFinished =
        false;


    console.log(
        "Round " +
        GAME.round +
        " started"
    );


    /*
        পুরনো timer বন্ধ
    */

    clearInterval(
        GAME.timerInterval
    );


    /*
        Pot নতুন round-এ 0
    */

    GAME.pot =
        0;


    /*
        Minimum blind আবার 10
    */

    GAME.currentBet =
        10;


    /*
        Player state reset
    */

    resetPlayersForNewRound();


    /*
        Button reset
    */

    resetActionButtons();


    /*
        Player cards assign
    */

    assignCardsToPlayers();


    /*
        Dealer-এর পরের player প্রথম turn
    */

    GAME.turn =
        (
            GAME.dealer + 1
        ) %
        GAME.players.length;


    /*
        UI update
    */

    updatePot();

    updateDealerUI();

    updatePlayerStatuses();

    updateCurrentTurnUI();


    /*
        Card distribution animation
    */

    await distributeCards();


    /*
        Part 2 থেকে এখানে timer শুরু হবে
    */

    console.log(
        "Round ready. First turn:",
        GAME.players[GAME.turn].name
    );


    GAME.roundRunning =
        false;
}


/* =========================================================
   TEMPORARY TEST FUNCTIONS
========================================================= */

/*
    Browser console থেকে লিখতে পারো:

    testAddPot(4, 10)

    এতে YOU-এর balance থেকে 10 কমবে
    এবং pot 10 হবে।
*/

function testAddPot(playerIndex, amount) {

    addToPot(
        playerIndex,
        amount
    );
}


/*
    Console থেকে লিখতে পারো:

    testRevealCards(4)

    এতে YOU-এর card open হবে।
*/

function testRevealCards(playerIndex) {

    revealPlayerCards(
        playerIndex
    );
}


/*
    Console থেকে লিখতে পারো:

    testHideCards(4)

    এতে YOU-এর card আবার hide হবে।
*/

function testHideCards(playerIndex) {

    hidePlayerCards(
        playerIndex
    );
}


/* =========================================================
   START GAME AFTER PAGE LOAD
========================================================= */

window.addEventListener(
    "load",
    () => {

        startRound();

    }
);