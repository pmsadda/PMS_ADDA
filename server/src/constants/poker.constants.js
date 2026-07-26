"use strict";

const MATCHMAKING_WAIT_SECONDS = 10;
const ACTION_TIMEOUT_SECONDS = 15;
const DISCONNECT_GRACE_SECONDS = 10;

const MAX_PLAYERS = 5;
const MIN_PLAYERS = 2;

const MINIMUM_BUY_IN_MULTIPLIER = 20;
const MAXIMUM_BUY_IN_MULTIPLIER = 100;

const ALLOWED_BIG_BLINDS =
  Object.freeze([
    5,
    10,
    20,
    30,
    50,
    100,
    200,
    500,
    1000,
  ]);

const TABLE_STATUS =
  Object.freeze({
    WAITING: "waiting",
    STARTING: "starting",
    PLAYING: "playing",
    PAUSED: "paused",
    CLOSED: "closed",
  });

const PLAYER_STATUS =
  Object.freeze({
    WAITING: "waiting",
    ACTIVE: "active",
    SITTING_OUT: "sitting_out",
    DISCONNECTED: "disconnected",
    LEFT: "left",
  });

const HAND_STATUS =
  Object.freeze({
    STARTING: "starting",
    PREFLOP: "preflop",
    FLOP: "flop",
    TURN: "turn",
    RIVER: "river",
    SHOWDOWN: "showdown",
    COMPLETED: "completed",
    CANCELLED: "cancelled",
  });

const PLAYER_ACTIONS =
  Object.freeze([
    "check",
    "call",
    "bet",
    "raise",
    "all_in",
    "fold",
  ]);

function getSmallBlind(
  bigBlind,
) {
  return Number(
    (
      Number(bigBlind) / 2
    ).toFixed(2),
  );
}

function getMinimumBuyIn(
  bigBlind,
) {
  return Number(
    (
      Number(bigBlind) *
      MINIMUM_BUY_IN_MULTIPLIER
    ).toFixed(2),
  );
}

function getMaximumBuyIn(
  bigBlind,
) {
  return Number(
    (
      Number(bigBlind) *
      MAXIMUM_BUY_IN_MULTIPLIER
    ).toFixed(2),
  );
}

module.exports = {
  MATCHMAKING_WAIT_SECONDS,
  ACTION_TIMEOUT_SECONDS,
  DISCONNECT_GRACE_SECONDS,

  MAX_PLAYERS,
  MIN_PLAYERS,

  MINIMUM_BUY_IN_MULTIPLIER,
  MAXIMUM_BUY_IN_MULTIPLIER,

  ALLOWED_BIG_BLINDS,

  TABLE_STATUS,
  PLAYER_STATUS,
  HAND_STATUS,
  PLAYER_ACTIONS,

  getSmallBlind,
  getMinimumBuyIn,
  getMaximumBuyIn,
};