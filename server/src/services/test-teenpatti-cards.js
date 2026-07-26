"use strict";

const {
    createDeck,
    shuffleDeck,
    dealCards,
    evaluateHand,
    compareHands
} = require(
    "./src/services/teenpatti.cards"
);

try {
    const deck = createDeck();

    console.log(
        "Deck cards:",
        deck.length
    );

    const shuffledDeck =
        shuffleDeck(deck);

    const players = [
        {
            playerType: "real",
            playerId: 1,
            seatNo: 1
        },
        {
            playerType: "bot",
            playerId: 2,
            seatNo: 2
        }
    ];

    const result = dealCards(
        shuffledDeck,
        players
    );

    console.log(
        "Player 1 cards:",
        result.players[0].cards
    );

    console.log(
        "Player 2 cards:",
        result.players[1].cards
    );

    console.log(
        "Player 1 hand:",
        evaluateHand(
            result.players[0].cards
        )
    );

    console.log(
        "Player 2 hand:",
        evaluateHand(
            result.players[1].cards
        )
    );

    console.log(
        "Comparison:",
        compareHands(
            result.players[0].cards,
            result.players[1].cards
        )
    );

    console.log(
        "✅ Teen Patti card engine test passed."
    );
} catch (error) {
    console.error(
        "❌ Card engine test failed:",
        error
    );

    process.exitCode = 1;
}