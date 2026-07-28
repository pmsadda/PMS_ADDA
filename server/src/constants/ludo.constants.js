"use strict";

/* ==========================================
   PMS ADDA LUDO
   Authoritative Backend Board Constants
========================================== */

/**
 * Board-এর 52টি main movement cell।
 *
 * এই order সরাসরি বর্তমান ludo-board.js-এর
 * mainPath definition অনুসরণ করছে।
 */
const MAIN_PATH = Object.freeze([
  "6-0",
  "6-1",
  "6-2",
  "6-3",
  "6-4",
  "6-5",

  "5-6",
  "4-6",
  "3-6",
  "2-6",
  "1-6",
  "0-6",

  "0-7",

  "0-8",
  "1-8",
  "2-8",
  "3-8",
  "4-8",
  "5-8",

  "6-9",
  "6-10",
  "6-11",
  "6-12",
  "6-13",
  "6-14",

  "7-14",

  "8-14",
  "8-13",
  "8-12",
  "8-11",
  "8-10",
  "8-9",

  "9-8",
  "10-8",
  "11-8",
  "12-8",
  "13-8",
  "14-8",

  "14-7",

  "14-6",
  "13-6",
  "12-6",
  "11-6",
  "10-6",
  "9-6",

  "8-5",
  "8-4",
  "8-3",
  "8-2",
  "8-1",
  "8-0",

  "7-0",
]);

/**
 * প্রত্যেক color-এর নিজস্ব start cell-এর
 * MAIN_PATH index।
 *
 * red    = 6-1
 * green  = 1-8
 * yellow = 8-13
 * blue   = 13-6
 */
const START_INDEX_BY_COLOR = Object.freeze({
  red: 1,
  green: 14,
  yellow: 27,
  blue: 40,
});

/**
 * প্রত্যেক color-এর শেষ home path।
 *
 * Main path-এর complete round শেষ করার পরে
 * pawn এই path-এ প্রবেশ করবে।
 */
const HOME_PATH_BY_COLOR = Object.freeze({
  red: Object.freeze(["7-1", "7-2", "7-3", "7-4", "7-5"]),

  green: Object.freeze(["1-7", "2-7", "3-7", "4-7", "5-7"]),

  yellow: Object.freeze(["7-13", "7-12", "7-11", "7-10", "7-9"]),

  blue: Object.freeze(["13-7", "12-7", "11-7", "10-7", "9-7"]),
});

/**
 * Safe cell-এ opponent pawn capture হবে না।
 */
const SAFE_CELLS = Object.freeze([
  "6-1",
  "8-2",
  "1-8",
  "2-6",
  "6-12",
  "8-13",
  "12-8",
  "13-6",
]);

const SAFE_CELL_SET = new Set(SAFE_CELLS);

const PLAYER_COLORS = Object.freeze(["red", "green", "yellow", "blue"]);

/**
 * Pawn progress rules:
 *
 * yard:
 *   total_steps = 0
 *   path_position = -1
 *
 * start cell:
 *   total_steps = 0
 *
 * main path:
 *   total_steps = 0 থেকে 50
 *
 * home path:
 *   total_steps = 51 থেকে 55
 *
 * finished:
 *   total_steps = 56
 */

const MAIN_PATH_LENGTH = MAIN_PATH.length;

/*
 * Start cell থেকে home-entry cell পর্যন্ত
 * 51টি relative main-path position।
 */
const MAIN_ROUTE_LENGTH = MAIN_PATH_LENGTH - 1;

const HOME_PATH_LENGTH = 5;

const LAST_MAIN_STEP = MAIN_ROUTE_LENGTH - 1;

const FIRST_HOME_STEP = MAIN_ROUTE_LENGTH;

const LAST_HOME_STEP = FIRST_HOME_STEP + HOME_PATH_LENGTH - 1;

const FINISHED_STEP = FIRST_HOME_STEP + HOME_PATH_LENGTH;
/* ==========================================
   Validation
========================================== */

function normalizePlayerColor(color) {
  const normalizedColor = String(color || "")
    .trim()
    .toLowerCase();

  if (!PLAYER_COLORS.includes(normalizedColor)) {
    return null;
  }

  return normalizedColor;
}

function isSafeCoordinate(coordinate) {
  return SAFE_CELL_SET.has(String(coordinate || ""));
}

/* ==========================================
   Coordinate Helpers
========================================== */

/**
 * Player-এর relative main-path step থেকে
 * actual board coordinate বের করবে।
 *
 * Example:
 *
 * Red totalSteps 0
 * → MAIN_PATH index 1
 * → 6-1
 *
 * Green totalSteps 0
 * → MAIN_PATH index 14
 * → 1-8
 */
function getMainPathCoordinate(color, totalSteps) {
  const normalizedColor = normalizePlayerColor(color);

  const validSteps = Number(totalSteps);

  if (
    !normalizedColor ||
    !Number.isInteger(validSteps) ||
    validSteps < 0 ||
    validSteps > LAST_MAIN_STEP
  ) {
    return null;
  }

  const startIndex = START_INDEX_BY_COLOR[normalizedColor];

  const globalPathIndex = (startIndex + validSteps) % MAIN_PATH_LENGTH;

  return {
    coordinate: MAIN_PATH[globalPathIndex],

    globalPathIndex,

    relativePathPosition: validSteps,

    isSafe: isSafeCoordinate(MAIN_PATH[globalPathIndex]),
  };
}

/**
 * Home-path progress থেকে coordinate বের করবে।
 *
 * totalSteps 52 → home path index 0
 * totalSteps 56 → home path index 4
 */
function getHomePathCoordinate(color, totalSteps) {
  const normalizedColor = normalizePlayerColor(color);

  const validSteps = Number(totalSteps);

  if (
    !normalizedColor ||
    !Number.isInteger(validSteps) ||
    validSteps < FIRST_HOME_STEP ||
    validSteps > LAST_HOME_STEP
  ) {
    return null;
  }

  const homePath = HOME_PATH_BY_COLOR[normalizedColor];

  const homePathIndex = validSteps - FIRST_HOME_STEP;

  return {
    coordinate: homePath[homePathIndex],

    homePathIndex,

    relativePathPosition: validSteps,

    isSafe: true,
  };
}

/**
 * Pawn-এর total_steps অনুযায়ী complete
 * destination information দেবে।
 */
function getPawnPosition(color, totalSteps) {
  const validSteps = Number(totalSteps);

  if (
    !Number.isInteger(validSteps) ||
    validSteps < 0 ||
    validSteps > FINISHED_STEP
  ) {
    return null;
  }

  if (validSteps <= LAST_MAIN_STEP) {
    return {
      status: "active",
      totalSteps: validSteps,
      ...getMainPathCoordinate(color, validSteps),
    };
  }

  if (validSteps <= LAST_HOME_STEP) {
    return {
      status: "home",
      totalSteps: validSteps,
      ...getHomePathCoordinate(color, validSteps),
    };
  }

  return {
    status: "finished",
    totalSteps: FINISHED_STEP,
    coordinate: null,
    globalPathIndex: null,
    homePathIndex: null,
    relativePathPosition: FINISHED_STEP,
    isSafe: true,
  };
}

/**
 * Dice value অনুযায়ী destination calculate করবে।
 *
 * Exact roll ছাড়া pawn finish করতে পারবে না।
 */
function calculatePawnDestination(color, currentTotalSteps, diceValue) {
  const normalizedColor = normalizePlayerColor(color);

  const validCurrentSteps = Number(currentTotalSteps);

  const validDiceValue = Number(diceValue);

  if (!normalizedColor) {
    return null;
  }

  if (
    !Number.isInteger(validCurrentSteps) ||
    validCurrentSteps < 0 ||
    validCurrentSteps >= FINISHED_STEP
  ) {
    return null;
  }

  if (
    !Number.isInteger(validDiceValue) ||
    validDiceValue < 1 ||
    validDiceValue > 6
  ) {
    return null;
  }

  const destinationSteps = validCurrentSteps + validDiceValue;

  /*
   * Finish-এর প্রয়োজনের চেয়ে বেশি roll হলে
   * move invalid।
   */
  if (destinationSteps > FINISHED_STEP) {
    return null;
  }

  return getPawnPosition(normalizedColor, destinationSteps);
}

module.exports = {
  MAIN_PATH,
  HOME_PATH_BY_COLOR,
  SAFE_CELLS,
  START_INDEX_BY_COLOR,
  PLAYER_COLORS,

  MAIN_PATH_LENGTH,
  MAIN_ROUTE_LENGTH,
  HOME_PATH_LENGTH,
  LAST_MAIN_STEP,
  FIRST_HOME_STEP,
  LAST_HOME_STEP,
  FINISHED_STEP,

  normalizePlayerColor,
  isSafeCoordinate,
  getMainPathCoordinate,
  getHomePathCoordinate,
  getPawnPosition,
  calculatePawnDestination,
};
