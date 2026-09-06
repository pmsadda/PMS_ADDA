"use strict";

const crypto = require("crypto");

const {
  pool,
} = require("../config/database");

/* ==========================
   Slot Constants
========================== */

const SLOT_ROWS = 3;
const SLOT_COLUMNS = 5;

const SLOT_SYMBOLS = [
  "CHERRY",
  "LEMON",
  "ORANGE",
  "GRAPE",
  "BELL",
  "SEVEN",
  "WILD",
  "SCATTER",
];

/*
 * মোট 20টি winning line।
 * প্রতিটি array-এর number হলো row:
 * 0 = top, 1 = middle, 2 = bottom
 */
const SLOT_PAYLINES = [
  [0, 0, 0, 0, 0],
  [1, 1, 1, 1, 1],
  [2, 2, 2, 2, 2],

  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],

  [0, 0, 1, 0, 0],
  [2, 2, 1, 2, 2],

  [1, 0, 0, 0, 1],
  [1, 2, 2, 2, 1],

  [0, 1, 1, 1, 0],
  [2, 1, 1, 1, 2],

  [0, 1, 0, 1, 0],
  [2, 1, 2, 1, 2],

  [1, 0, 1, 0, 1],
  [1, 2, 1, 2, 1],

  [0, 2, 0, 2, 0],
  [2, 0, 2, 0, 2],

  [0, 2, 2, 2, 0],
  [2, 0, 0, 0, 2],

  [1, 1, 0, 1, 1],
];

/*
 * 3, 4 এবং 5টি matching symbol-এর
 * multiplier।
 */
const SLOT_PAYTABLE = {
  CHERRY: {
    3: 2,
    4: 5,
    5: 10,
  },

  LEMON: {
    3: 3,
    4: 7,
    5: 15,
  },

  ORANGE: {
    3: 4,
    4: 10,
    5: 25,
  },

  GRAPE: {
    3: 5,
    4: 15,
    5: 40,
  },

  BELL: {
    3: 8,
    4: 25,
    5: 75,
  },

  SEVEN: {
    3: 12,
    4: 50,
    5: 150,
  },

  WILD: {
    3: 15,
    4: 75,
    5: 250,
  },
};

/*
 * Low    = frequent small wins
 * Medium = balanced
 * High   = fewer but potentially bigger wins
 */
const SYMBOL_WEIGHTS = {
  low: {
    CHERRY: 24,
    LEMON: 22,
    ORANGE: 18,
    GRAPE: 14,
    BELL: 9,
    SEVEN: 5,
    WILD: 6,
    SCATTER: 2,
  },

  medium: {
    CHERRY: 27,
    LEMON: 23,
    ORANGE: 18,
    GRAPE: 12,
    BELL: 8,
    SEVEN: 4,
    WILD: 6,
    SCATTER: 2,
  },

  high: {
    CHERRY: 31,
    LEMON: 25,
    ORANGE: 18,
    GRAPE: 10,
    BELL: 6,
    SEVEN: 3,
    WILD: 4,
    SCATTER: 3,
  },
};

/* ==========================
   Helpers
========================== */

function createSlotError(
  message,
  statusCode = 400,
  code = "SLOT_ERROR",
) {
  const error = new Error(message);

  error.statusCode = statusCode;
  error.code = code;

  return error;
}

function parseMoney(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return 0;
  }

  return Number(amount.toFixed(2));
}

function createSpinCode() {
  return (
    `SLT-${Date.now()}-` +
    crypto
      .randomBytes(6)
      .toString("hex")
      .toUpperCase()
  );
}

function deterministicRandom(
  serverSeed,
  position,
) {
  const hash = crypto
    .createHash("sha256")
    .update(
      `${serverSeed}:${position}`,
    )
    .digest("hex");

  return (
    Number.parseInt(
      hash.slice(0, 13),
      16,
    ) / 0x10000000000000
  );
}

function selectWeightedSymbol(
  weights,
  randomValue,
) {
  const entries =
    Object.entries(weights);

  const totalWeight =
    entries.reduce(
      (total, [, weight]) =>
        total + Number(weight),
      0,
    );

  let target =
    randomValue * totalWeight;

  for (const [symbol, weight] of entries) {
    target -= Number(weight);

    if (target < 0) {
      return symbol;
    }
  }

  return "CHERRY";
}

/* ==========================
   Get Slot Settings
========================== */

async function getSlotSettings(
  executor = pool,
) {
  const [rows] =
    await executor.execute(
      `
      SELECT
        id,
        is_enabled,
        maintenance_mode,
        min_bet,
        max_bet,
        max_payout_per_spin,
        max_win_multiplier,
        rtp_percent,
        house_edge_percent,
        volatility_profile,
        wild_enabled,
        scatter_enabled,
        free_spins_enabled,
        free_spins_award,
        free_spins_multiplier,
        daily_payout_limit,
        daily_admin_loss_limit
      FROM slot_settings
      WHERE id = 1
      LIMIT 1
      `,
    );

  const row = rows[0] || null;

  if (!row) {
    throw createSlotError(
      "Slot settings were not found.",
      500,
      "SLOT_SETTINGS_NOT_FOUND",
    );
  }

  const volatilityProfile = [
    "low",
    "medium",
    "high",
  ].includes(
    String(
      row.volatility_profile,
    ).toLowerCase(),
  )
    ? String(
        row.volatility_profile,
      ).toLowerCase()
    : "medium";

  return {
    id: Number(row.id),

    isEnabled:
      Boolean(row.is_enabled),

    maintenanceMode:
      Boolean(
        row.maintenance_mode,
      ),

    minBet:
      parseMoney(row.min_bet),

    maxBet:
      parseMoney(row.max_bet),

    maxPayoutPerSpin:
      parseMoney(
        row.max_payout_per_spin,
      ),

    maxWinMultiplier:
      Number(
        row.max_win_multiplier,
      ),

    rtpPercent:
      Number(row.rtp_percent),

    houseEdgePercent:
      Number(
        row.house_edge_percent,
      ),

    volatilityProfile,

    wildEnabled:
      Boolean(row.wild_enabled),

    scatterEnabled:
      Boolean(row.scatter_enabled),

    freeSpinsEnabled:
      Boolean(
        row.free_spins_enabled,
      ),

    freeSpinsAward:
      Math.max(
        0,
        Number(
          row.free_spins_award,
        ) || 0,
      ),

    freeSpinsMultiplier:
      Math.max(
        1,
        Number(
          row.free_spins_multiplier,
        ) || 1,
      ),

    dailyPayoutLimit:
      parseMoney(
        row.daily_payout_limit,
      ),

    dailyAdminLossLimit:
      parseMoney(
        row.daily_admin_loss_limit,
      ),
  };
}

/* ==========================
   Generate Reel Grid
========================== */

function generateSlotGrid(
  settings,
  serverSeed,
) {
  const mode =
    settings.volatilityProfile ||
    "medium";

  const weights = {
    ...(
      SYMBOL_WEIGHTS[mode] ||
      SYMBOL_WEIGHTS.medium
    ),
  };

  if (!settings.wildEnabled) {
    weights.WILD = 0;
  }

  if (!settings.scatterEnabled) {
    weights.SCATTER = 0;
  }

  const grid = Array.from(
    {
      length: SLOT_ROWS,
    },
    () =>
      Array(
        SLOT_COLUMNS,
      ).fill("CHERRY"),
  );

  let position = 0;

  for (
    let column = 0;
    column < SLOT_COLUMNS;
    column += 1
  ) {
    for (
      let row = 0;
      row < SLOT_ROWS;
      row += 1
    ) {
      const randomValue =
        deterministicRandom(
          serverSeed,
          position,
        );

      grid[row][column] =
        selectWeightedSymbol(
          weights,
          randomValue,
        );

      position += 1;
    }
  }

  return grid;
}

/* ==========================
   Evaluate One Payline
========================== */

function evaluatePayline(
  grid,
  payline,
  lineNumber,
) {
  const symbols =
    payline.map(
      (row, column) =>
        grid[row][column],
    );

  if (
    symbols[0] === "SCATTER"
  ) {
    return null;
  }

  const payingSymbol =
    symbols.find(
      (symbol) =>
        symbol !== "WILD" &&
        symbol !== "SCATTER",
    ) || "WILD";

  let matchingCount = 0;

  for (const symbol of symbols) {
    if (
      symbol === payingSymbol ||
      symbol === "WILD"
    ) {
      matchingCount += 1;
    } else {
      break;
    }
  }

  if (
    matchingCount < 3 ||
    !SLOT_PAYTABLE[
      payingSymbol
    ]?.[matchingCount]
  ) {
    return null;
  }

  return {
    lineNumber:
      Number(lineNumber),

    rows: [...payline],

    symbol: payingSymbol,

    matchingCount,

    lineMultiplier:
      Number(
        SLOT_PAYTABLE[
          payingSymbol
        ][matchingCount],
      ),
  };
}

/* ==========================
   Calculate Spin Result
========================== */

function calculateSlotResult({
  grid,
  totalBet,
  settings,
  isFreeSpin = false,
}) {
  const safeTotalBet =
    parseMoney(totalBet);

  const betPerLine =
    safeTotalBet /
    SLOT_PAYLINES.length;

  const winningLines = [];

  let linePayout = 0;

  SLOT_PAYLINES.forEach(
    (payline, index) => {
      const result =
        evaluatePayline(
          grid,
          payline,
          index + 1,
        );

      if (!result) {
        return;
      }

      const payout =
        betPerLine *
        result.lineMultiplier;

      result.payout =
        parseMoney(payout);

      winningLines.push(result);

      linePayout += payout;
    },
  );

  const scatterCount =
    grid
      .flat()
      .filter(
        (symbol) =>
          symbol === "SCATTER",
      )
      .length;

  let scatterMultiplier = 0;

  if (
    settings.scatterEnabled
  ) {
    if (scatterCount >= 5) {
      scatterMultiplier = 50;
    } else if (
      scatterCount === 4
    ) {
      scatterMultiplier = 10;
    } else if (
      scatterCount === 3
    ) {
      scatterMultiplier = 2;
    }
  }

  const scatterPayout =
    safeTotalBet *
    scatterMultiplier;

  let totalPayout =
    linePayout +
    scatterPayout;

  /*
   * RTP 95 হলো base payout scale।
   * Admin RTP বাড়ালে payout scale বাড়বে,
   * কমালে payout scale কমবে।
   */
  const rtpScale =
    Math.max(
      0.5,
      Math.min(
        1.1,
        Number(
          settings.rtpPercent,
        ) / 95,
      ),
    );

  totalPayout *= rtpScale;

  if (isFreeSpin) {
    totalPayout *=
      settings.freeSpinsMultiplier;
  }

  const calculatedMultiplier =
    safeTotalBet > 0
      ? totalPayout /
        safeTotalBet
      : 0;

  const finalMultiplier =
    Math.min(
      calculatedMultiplier,
      Number(
        settings.maxWinMultiplier,
      ),
    );

  totalPayout =
    safeTotalBet *
    finalMultiplier;

  totalPayout =
    Math.min(
      totalPayout,
      settings.maxPayoutPerSpin,
    );

  totalPayout =
    parseMoney(totalPayout);

  const finalWinMultiplier =
    safeTotalBet > 0
      ? Number(
          (
            totalPayout /
            safeTotalBet
          ).toFixed(2),
        )
      : 0;

  const freeSpinsWon =
    settings.freeSpinsEnabled &&
    scatterCount >= 3
      ? settings.freeSpinsAward
      : 0;

  return {
    winningLines,
    scatterCount,
    scatterMultiplier,
    payoutAmount:
      totalPayout,
    winMultiplier:
      finalWinMultiplier,
    freeSpinsWon,
  };
}

/* ==========================
   Generate Wallet Transaction ID
========================== */

function createSlotTransactionId(
  prefix,
) {
  return (
    `${prefix}-${Date.now()}-` +
    crypto
      .randomBytes(5)
      .toString("hex")
      .toUpperCase()
  );
}

/* ==========================
   Execute Slot Spin
========================== */

async function spinSlot({
  userId,
  betAmount,
}) {
  const validUserId =
    Number(userId);

  if (
    !Number.isInteger(
      validUserId,
    ) ||
    validUserId < 1
  ) {
    throw createSlotError(
      "Valid authenticated user is required.",
      401,
      "SLOT_INVALID_USER",
    );
  }

  const connection =
    await pool.getConnection();

  try {
    await connection.beginTransaction();

    const settings =
      await getSlotSettings(
        connection,
      );

    if (!settings.isEnabled) {
      throw createSlotError(
        "Slot game is disabled.",
        409,
        "SLOT_DISABLED",
      );
    }

    if (
      settings.maintenanceMode
    ) {
      throw createSlotError(
        "Slot game is under maintenance.",
        409,
        "SLOT_MAINTENANCE",
      );
    }

    /* ==========================
       Lock User
    ========================== */

    const [userRows] =
      await connection.execute(
        `
        SELECT
          id,
          wallet_balance,
          account_status
        FROM users
        WHERE id = ?
        LIMIT 1
        FOR UPDATE
        `,
        [validUserId],
      );

    const user =
      userRows[0] || null;

    if (!user) {
      throw createSlotError(
        "User was not found.",
        404,
        "SLOT_USER_NOT_FOUND",
      );
    }

    if (
      String(
        user.account_status || "",
      ).toLowerCase() !==
      "active"
    ) {
      throw createSlotError(
        "User account is not active.",
        403,
        "SLOT_USER_INACTIVE",
      );
    }

    /* ==========================
       Create/Lock Player State
    ========================== */

    await connection.execute(
      `
      INSERT INTO slot_player_state (
        user_id
      )
      VALUES (?)
      ON DUPLICATE KEY UPDATE
        user_id = user_id
      `,
      [validUserId],
    );

    const [stateRows] =
      await connection.execute(
        `
        SELECT
          user_id,
          free_spins_balance,
          free_spin_bet_amount,
          total_spins,
          total_bet,
          total_payout
        FROM slot_player_state
        WHERE user_id = ?
        LIMIT 1
        FOR UPDATE
        `,
        [validUserId],
      );

    const playerState =
      stateRows[0];

    const freeSpinsBefore =
      Math.max(
        0,
        Number(
          playerState
            .free_spins_balance,
        ) || 0,
      );

    const isFreeSpin =
      freeSpinsBefore > 0;

    let spinBet;

    if (isFreeSpin) {
      spinBet =
        parseMoney(
          playerState
            .free_spin_bet_amount,
        );

      if (spinBet <= 0) {
        spinBet =
          settings.minBet;
      }
    } else {
      spinBet =
        parseMoney(betAmount);

      if (
        spinBet <
        settings.minBet
      ) {
        throw createSlotError(
          `Minimum bet is ৳${settings.minBet.toFixed(2)}.`,
          400,
          "SLOT_BET_BELOW_MINIMUM",
        );
      }

      if (
        spinBet >
        settings.maxBet
      ) {
        throw createSlotError(
          `Maximum bet is ৳${settings.maxBet.toFixed(2)}.`,
          400,
          "SLOT_BET_ABOVE_MAXIMUM",
        );
      }
    }

    const balanceBefore =
      parseMoney(
        user.wallet_balance,
      );

    if (
      !isFreeSpin &&
      balanceBefore < spinBet
    ) {
      throw createSlotError(
        "Insufficient wallet balance.",
        409,
        "SLOT_INSUFFICIENT_BALANCE",
      );
    }

    /* ==========================
       Lock Daily Statistics
    ========================== */

    await connection.execute(
      `
      INSERT INTO slot_daily_stats (
        stat_date
      )
      VALUES (CURRENT_DATE())
      ON DUPLICATE KEY UPDATE
        stat_date = stat_date
      `,
    );

    const [dailyRows] =
      await connection.execute(
        `
        SELECT
          stat_date,
          total_spins,
          total_bet,
          total_payout,
          net_admin_result
        FROM slot_daily_stats
        WHERE stat_date =
          CURRENT_DATE()
        LIMIT 1
        FOR UPDATE
        `,
      );

    const daily =
      dailyRows[0];

    const dailyBetBefore =
      parseMoney(
        daily.total_bet,
      );

    const dailyPayoutBefore =
      parseMoney(
        daily.total_payout,
      );

    const currentAdminLoss =
      parseMoney(
        dailyPayoutBefore -
        dailyBetBefore,
      );

    if (
      dailyPayoutBefore >=
      settings.dailyPayoutLimit
    ) {
      throw createSlotError(
        "Daily Slot payout limit has been reached.",
        409,
        "SLOT_DAILY_PAYOUT_LIMIT",
      );
    }

    if (
      currentAdminLoss >=
      settings.dailyAdminLossLimit
    ) {
      throw createSlotError(
        "Daily Slot risk limit has been reached.",
        409,
        "SLOT_DAILY_LOSS_LIMIT",
      );
    }

    /* ==========================
       Generate Secure Result
    ========================== */

    const spinCode =
      createSpinCode();

    const serverSeed =
      crypto
        .randomBytes(32)
        .toString("hex");

    const serverSeedHash =
      crypto
        .createHash("sha256")
        .update(serverSeed)
        .digest("hex");

    const grid =
      generateSlotGrid(
        settings,
        serverSeed,
      );

    const result =
      calculateSlotResult({
        grid,
        totalBet: spinBet,
        settings,
        isFreeSpin,
      });

    /*
     * Daily payout এবং loss limit
     * অতিক্রম করতে দেওয়া হবে না।
     */
    const paidBetForDaily =
      isFreeSpin
        ? 0
        : spinBet;

    const remainingDailyPayout =
      Math.max(
        0,
        settings.dailyPayoutLimit -
        dailyPayoutBefore,
      );

    const maximumPayoutByLoss =
      Math.max(
        0,
        settings.dailyAdminLossLimit +
        dailyBetBefore +
        paidBetForDaily -
        dailyPayoutBefore,
      );

    result.payoutAmount =
      parseMoney(
        Math.min(
          result.payoutAmount,
          remainingDailyPayout,
          maximumPayoutByLoss,
        ),
      );

    result.winMultiplier =
      spinBet > 0
        ? Number(
            (
              result.payoutAmount /
              spinBet
            ).toFixed(2),
          )
        : 0;

    /* ==========================
       Wallet Calculation
    ========================== */

    const debitAmount =
      isFreeSpin
        ? 0
        : spinBet;

    const balanceAfterDebit =
      parseMoney(
        balanceBefore -
        debitAmount,
      );

    const balanceAfter =
      parseMoney(
        balanceAfterDebit +
        result.payoutAmount,
      );

    const [walletResult] =
      await connection.execute(
        `
        UPDATE users
        SET wallet_balance = ?
        WHERE id = ?
        `,
        [
          balanceAfter,
          validUserId,
        ],
      );

    if (
      walletResult.affectedRows !==
      1
    ) {
      throw createSlotError(
        "Slot wallet update failed.",
        500,
        "SLOT_WALLET_UPDATE_FAILED",
      );
    }

    /* ==========================
       Free Spin Balance
    ========================== */

    const freeSpinsAfter =
      Math.max(
        0,
        freeSpinsBefore -
        (isFreeSpin ? 1 : 0) +
        result.freeSpinsWon,
      );

    let nextFreeSpinBet =
      parseMoney(
        playerState
          .free_spin_bet_amount,
      );

    if (
      result.freeSpinsWon > 0
    ) {
      nextFreeSpinBet =
        spinBet;
    } else if (
      freeSpinsAfter === 0
    ) {
      nextFreeSpinBet = 0;
    }

    await connection.execute(
      `
      UPDATE slot_player_state
      SET
        free_spins_balance = ?,
        free_spin_bet_amount = ?,
        total_spins =
          total_spins + 1,
        total_bet =
          ROUND(
            total_bet + ?,
            2
          ),
        total_payout =
          ROUND(
            total_payout + ?,
            2
          ),
        updated_at =
          CURRENT_TIMESTAMP(3)
      WHERE user_id = ?
      `,
      [
        freeSpinsAfter,
        nextFreeSpinBet,
        paidBetForDaily,
        result.payoutAmount,
        validUserId,
      ],
    );

    /* ==========================
       Save Spin History
    ========================== */

    const [spinResult] =
      await connection.execute(
        `
        INSERT INTO slot_spins (
          spin_code,
          user_id,
          bet_amount,
          is_free_spin,
          volatility_profile,
          rtp_percent,
          max_win_multiplier,
          reel_result,
          winning_lines,
          win_multiplier,
          payout_amount,
          balance_before,
          balance_after,
          free_spins_won,
          status,
          server_seed_hash,
          server_seed
        )
        VALUES (
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          'completed',
          ?,
          ?
        )
        `,
        [
          spinCode,
          validUserId,
          spinBet,
          isFreeSpin ? 1 : 0,
          settings.volatilityProfile,
          settings.rtpPercent,
          settings.maxWinMultiplier,
          JSON.stringify(grid),
          JSON.stringify(
            result.winningLines,
          ),
          result.winMultiplier,
          result.payoutAmount,
          balanceBefore,
          balanceAfter,
          result.freeSpinsWon,
          serverSeedHash,
          serverSeed,
        ],
      );

    const spinId =
      Number(
        spinResult.insertId,
      );

    /* ==========================
       Wallet Debit History
    ========================== */

    if (!isFreeSpin) {
      await connection.execute(
        `
        INSERT INTO wallet_transactions (
          transaction_id,
          user_id,
          transaction_type,
          direction,
          amount,
          balance_before,
          balance_after,
          status,
          reference_type,
          reference_id,
          description,
          created_by
        )
        VALUES (
          ?,
          ?,
          'game_buy_in',
          'debit',
          ?,
          ?,
          ?,
          'completed',
          'slot_spin',
          ?,
          ?,
          NULL
        )
        `,
        [
          createSlotTransactionId(
            "SLB",
          ),
          validUserId,
          spinBet,
          balanceBefore,
          balanceAfterDebit,
          String(spinId),
          `Slot spin bet ${spinCode}`,
        ],
      );
    }

    /* ==========================
       Wallet Win History
    ========================== */

    if (
      result.payoutAmount > 0
    ) {
      await connection.execute(
        `
        INSERT INTO wallet_transactions (
          transaction_id,
          user_id,
          transaction_type,
          direction,
          amount,
          balance_before,
          balance_after,
          status,
          reference_type,
          reference_id,
          description,
          created_by
        )
        VALUES (
          ?,
          ?,
          'game_cash_out',
          'credit',
          ?,
          ?,
          ?,
          'completed',
          'slot_spin',
          ?,
          ?,
          NULL
        )
        `,
        [
          createSlotTransactionId(
            "SLW",
          ),
          validUserId,
          result.payoutAmount,
          balanceAfterDebit,
          balanceAfter,
          String(spinId),
          `Slot win ${result.winMultiplier.toFixed(2)}x ${spinCode}`,
        ],
      );
    }

    /* ==========================
       Update Daily Statistics
    ========================== */

    const dailyBetAfter =
      parseMoney(
        dailyBetBefore +
        paidBetForDaily,
      );

    const dailyPayoutAfter =
      parseMoney(
        dailyPayoutBefore +
        result.payoutAmount,
      );

    await connection.execute(
      `
      UPDATE slot_daily_stats
      SET
        total_spins =
          total_spins + 1,
        total_bet = ?,
        total_payout = ?,
        net_admin_result = ?
      WHERE stat_date =
        CURRENT_DATE()
      `,
      [
        dailyBetAfter,
        dailyPayoutAfter,
        parseMoney(
          dailyBetAfter -
          dailyPayoutAfter,
        ),
      ],
    );

    await connection.commit();

    return {
      spinId,
      spinCode,

      grid,

      winningLines:
        result.winningLines,

      betAmount: spinBet,

      isFreeSpin,

      payoutAmount:
        result.payoutAmount,

      winMultiplier:
        result.winMultiplier,

      scatterCount:
        result.scatterCount,

      freeSpinsWon:
        result.freeSpinsWon,

      freeSpinsBalance:
        freeSpinsAfter,

      walletBalance:
        balanceAfter,

      volatilityProfile:
        settings.volatilityProfile,

      serverSeedHash,
      serverSeed,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/* ==========================
   Get Player Slot State
========================== */

async function getSlotPlayerState({
  userId,
}) {
  const validUserId =
    Number(userId);

  if (
    !Number.isInteger(
      validUserId,
    ) ||
    validUserId < 1
  ) {
    throw createSlotError(
      "Valid authenticated user is required.",
      401,
      "SLOT_INVALID_USER",
    );
  }

  const [
    settings,
    userResult,
    stateResult,
  ] = await Promise.all([
    getSlotSettings(),

    pool.execute(
      `
      SELECT
        id,
        wallet_balance,
        account_status
      FROM users
      WHERE id = ?
      LIMIT 1
      `,
      [validUserId],
    ),

    pool.execute(
      `
      SELECT
        free_spins_balance,
        free_spin_bet_amount,
        total_spins,
        total_bet,
        total_payout
      FROM slot_player_state
      WHERE user_id = ?
      LIMIT 1
      `,
      [validUserId],
    ),
  ]);

  const user =
    userResult[0][0] || null;

  if (!user) {
    throw createSlotError(
      "User was not found.",
      404,
      "SLOT_USER_NOT_FOUND",
    );
  }

  if (
    String(
      user.account_status || "",
    ).toLowerCase() !==
    "active"
  ) {
    throw createSlotError(
      "User account is not active.",
      403,
      "SLOT_USER_INACTIVE",
    );
  }

  const state =
    stateResult[0][0] || {};

  return {
    walletBalance:
      parseMoney(
        user.wallet_balance,
      ),

    freeSpinsBalance:
      Math.max(
        0,
        Number(
          state.free_spins_balance,
        ) || 0,
      ),

    freeSpinBetAmount:
      parseMoney(
        state.free_spin_bet_amount,
      ),

    totalSpins:
      Number(
        state.total_spins,
      ) || 0,

    totalBet:
      parseMoney(
        state.total_bet,
      ),

    totalPayout:
      parseMoney(
        state.total_payout,
      ),

    settings: {
      isEnabled:
        settings.isEnabled,

      maintenanceMode:
        settings.maintenanceMode,

      minBet:
        settings.minBet,

      maxBet:
        settings.maxBet,

      maxPayoutPerSpin:
        settings.maxPayoutPerSpin,

      maxWinMultiplier:
        settings.maxWinMultiplier,

      rtpPercent:
        settings.rtpPercent,

      volatilityProfile:
        settings.volatilityProfile,

      wildEnabled:
        settings.wildEnabled,

      scatterEnabled:
        settings.scatterEnabled,

      freeSpinsEnabled:
        settings.freeSpinsEnabled,

      freeSpinsAward:
        settings.freeSpinsAward,

      freeSpinsMultiplier:
        settings.freeSpinsMultiplier,
    },
  };
}

/* ==========================
   My Slot Spin History
========================== */

async function getMySlotHistory({
  userId,
  limit = 20,
}) {
  const validUserId =
    Number(userId);

  if (
    !Number.isInteger(
      validUserId,
    ) ||
    validUserId < 1
  ) {
    throw createSlotError(
      "Valid authenticated user is required.",
      401,
      "SLOT_INVALID_USER",
    );
  }

  const safeLimit =
    Math.min(
      50,
      Math.max(
        1,
        Number(limit) || 20,
      ),
    );

  const [rows] =
    await pool.query(
      `
      SELECT
        id,
        spin_code,
        bet_amount,
        is_free_spin,
        volatility_profile,
        reel_result,
        winning_lines,
        win_multiplier,
        payout_amount,
        free_spins_won,
        server_seed_hash,
        server_seed,
        created_at
      FROM slot_spins
      WHERE user_id = ?
      ORDER BY id DESC
      LIMIT ?
      `,
      [
        validUserId,
        safeLimit,
      ],
    );

  return rows.map((row) => {
    let grid = [];
    let winningLines = [];

    try {
      grid = JSON.parse(
        row.reel_result || "[]",
      );
    } catch {
      grid = [];
    }

    try {
      winningLines =
        JSON.parse(
          row.winning_lines ||
            "[]",
        );
    } catch {
      winningLines = [];
    }

    return {
      id: Number(row.id),

      spinCode:
        String(row.spin_code),

      betAmount:
        parseMoney(
          row.bet_amount,
        ),

      isFreeSpin:
        Boolean(
          row.is_free_spin,
        ),

      volatilityProfile:
        String(
          row.volatility_profile,
        ),

      grid,
      winningLines,

      winMultiplier:
        Number(
          row.win_multiplier,
        ),

      payoutAmount:
        parseMoney(
          row.payout_amount,
        ),

      freeSpinsWon:
        Number(
          row.free_spins_won,
        ) || 0,

      serverSeedHash:
        String(
          row.server_seed_hash,
        ),

      serverSeed:
        String(
          row.server_seed,
        ),

      createdAt:
        row.created_at,
    };
  });
}

/* ==========================
   Update Slot Settings
========================== */

async function updateSlotSettings({
  adminId,
  settings: input = {},
}) {
  const validAdminId =
    Number(adminId);

  if (
    !Number.isInteger(
      validAdminId,
    ) ||
    validAdminId < 1
  ) {
    throw createSlotError(
      "Valid admin is required.",
      401,
      "SLOT_INVALID_ADMIN",
    );
  }

  const connection =
    await pool.getConnection();

  try {
    await connection.beginTransaction();

    const current =
      await getSlotSettings(
        connection,
      );

    function resolveBoolean(
      value,
      fallback,
      fieldName,
    ) {
      if (
        value === undefined ||
        value === null
      ) {
        return Boolean(fallback);
      }

      if (
        typeof value ===
        "boolean"
      ) {
        return value;
      }

      if (
        value === 1 ||
        value === 0
      ) {
        return Boolean(value);
      }

      throw createSlotError(
        `${fieldName} must be true or false.`,
        400,
        "SLOT_INVALID_SETTING",
      );
    }

    function resolveNumber(
      value,
      fallback,
      fieldName,
    ) {
      if (
        value === undefined ||
        value === null ||
        value === ""
      ) {
        return Number(fallback);
      }

      const number =
        Number(value);

      if (
        !Number.isFinite(number)
      ) {
        throw createSlotError(
          `${fieldName} must be a valid number.`,
          400,
          "SLOT_INVALID_SETTING",
        );
      }

      return number;
    }

    const nextIsEnabled =
      resolveBoolean(
        input.isEnabled,
        current.isEnabled,
        "isEnabled",
      );

    const nextMaintenanceMode =
      resolveBoolean(
        input.maintenanceMode,
        current.maintenanceMode,
        "maintenanceMode",
      );

    const nextMinBet =
      resolveNumber(
        input.minBet,
        current.minBet,
        "minBet",
      );

    const nextMaxBet =
      resolveNumber(
        input.maxBet,
        current.maxBet,
        "maxBet",
      );

    const nextMaxPayout =
      resolveNumber(
        input.maxPayoutPerSpin,
        current.maxPayoutPerSpin,
        "maxPayoutPerSpin",
      );

    const nextMaxMultiplier =
      resolveNumber(
        input.maxWinMultiplier,
        current.maxWinMultiplier,
        "maxWinMultiplier",
      );

    const nextRtp =
      resolveNumber(
        input.rtpPercent,
        current.rtpPercent,
        "rtpPercent",
      );

    const nextHouseEdge =
      Number(
        (
          100 - nextRtp
        ).toFixed(2),
      );

    const nextMode =
      String(
        input.volatilityProfile ??
          current.volatilityProfile,
      )
        .trim()
        .toLowerCase();

    const nextWildEnabled =
      resolveBoolean(
        input.wildEnabled,
        current.wildEnabled,
        "wildEnabled",
      );

    const nextScatterEnabled =
      resolveBoolean(
        input.scatterEnabled,
        current.scatterEnabled,
        "scatterEnabled",
      );

    const nextFreeSpinsEnabled =
      resolveBoolean(
        input.freeSpinsEnabled,
        current.freeSpinsEnabled,
        "freeSpinsEnabled",
      );

    const nextFreeSpinsAward =
      resolveNumber(
        input.freeSpinsAward,
        current.freeSpinsAward,
        "freeSpinsAward",
      );

    const nextFreeSpinMultiplier =
      resolveNumber(
        input.freeSpinsMultiplier,
        current.freeSpinsMultiplier,
        "freeSpinsMultiplier",
      );

    const nextDailyPayoutLimit =
      resolveNumber(
        input.dailyPayoutLimit,
        current.dailyPayoutLimit,
        "dailyPayoutLimit",
      );

    const nextDailyLossLimit =
      resolveNumber(
        input.dailyAdminLossLimit,
        current.dailyAdminLossLimit,
        "dailyAdminLossLimit",
      );

    if (
      nextMinBet < 1 ||
      nextMinBet > 1000000
    ) {
      throw createSlotError(
        "Minimum bet must be between 1 and 1000000.",
        400,
        "SLOT_INVALID_MIN_BET",
      );
    }

    if (
      nextMaxBet <
        nextMinBet ||
      nextMaxBet > 1000000
    ) {
      throw createSlotError(
        "Maximum bet must be greater than or equal to minimum bet.",
        400,
        "SLOT_INVALID_MAX_BET",
      );
    }

    if (
      nextMaxPayout < 1 ||
      nextMaxPayout >
        100000000
    ) {
      throw createSlotError(
        "Maximum payout is invalid.",
        400,
        "SLOT_INVALID_MAX_PAYOUT",
      );
    }

    if (
      nextMaxMultiplier < 1 ||
      nextMaxMultiplier > 1000
    ) {
      throw createSlotError(
        "Maximum multiplier must be between 1x and 1000x.",
        400,
        "SLOT_INVALID_MAX_MULTIPLIER",
      );
    }

    if (
      nextRtp < 50 ||
      nextRtp > 99
    ) {
      throw createSlotError(
        "RTP must be between 50% and 99%.",
        400,
        "SLOT_INVALID_RTP",
      );
    }

    if (
      ![
        "low",
        "medium",
        "high",
      ].includes(nextMode)
    ) {
      throw createSlotError(
        "Mode must be low, medium or high.",
        400,
        "SLOT_INVALID_MODE",
      );
    }

    if (
      !Number.isInteger(
        nextFreeSpinsAward,
      ) ||
      nextFreeSpinsAward < 0 ||
      nextFreeSpinsAward > 100
    ) {
      throw createSlotError(
        "Free spins award must be between 0 and 100.",
        400,
        "SLOT_INVALID_FREE_SPINS",
      );
    }

    if (
      nextFreeSpinMultiplier < 1 ||
      nextFreeSpinMultiplier > 20
    ) {
      throw createSlotError(
        "Free-spin multiplier must be between 1x and 20x.",
        400,
        "SLOT_INVALID_FREE_SPIN_MULTIPLIER",
      );
    }

    if (
      nextDailyPayoutLimit < 1 ||
      nextDailyLossLimit < 1
    ) {
      throw createSlotError(
        "Daily limits must be greater than zero.",
        400,
        "SLOT_INVALID_DAILY_LIMIT",
      );
    }

    await connection.execute(
      `
      UPDATE slot_settings
      SET
        is_enabled = ?,
        maintenance_mode = ?,
        min_bet = ?,
        max_bet = ?,
        max_payout_per_spin = ?,
        max_win_multiplier = ?,
        rtp_percent = ?,
        house_edge_percent = ?,
        volatility_profile = ?,
        wild_enabled = ?,
        scatter_enabled = ?,
        free_spins_enabled = ?,
        free_spins_award = ?,
        free_spins_multiplier = ?,
        daily_payout_limit = ?,
        daily_admin_loss_limit = ?,
        updated_by = ?
      WHERE id = 1
      `,
      [
        nextIsEnabled ? 1 : 0,
        nextMaintenanceMode
          ? 1
          : 0,
        parseMoney(nextMinBet),
        parseMoney(nextMaxBet),
        parseMoney(
          nextMaxPayout,
        ),
        Number(
          nextMaxMultiplier.toFixed(
            2,
          ),
        ),
        Number(
          nextRtp.toFixed(2),
        ),
        nextHouseEdge,
        nextMode,
        nextWildEnabled ? 1 : 0,
        nextScatterEnabled
          ? 1
          : 0,
        nextFreeSpinsEnabled
          ? 1
          : 0,
        nextFreeSpinsAward,
        Number(
          nextFreeSpinMultiplier.toFixed(
            2,
          ),
        ),
        parseMoney(
          nextDailyPayoutLimit,
        ),
        parseMoney(
          nextDailyLossLimit,
        ),
        validAdminId,
      ],
    );

    await connection.commit();

    return await getSlotSettings();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/* ==========================
   Admin Slot Dashboard Data
========================== */

async function getAdminSlotDashboard({
  limit = 100,
} = {}) {
  const safeLimit =
    Math.min(
      500,
      Math.max(
        1,
        Number(limit) || 100,
      ),
    );

  const [
    settings,
    spinResult,
    dailyResult,
  ] = await Promise.all([
    getSlotSettings(),

    pool.query(
      `
      SELECT
        ss.id,
        ss.spin_code,
        ss.user_id,
        u.uid,
        u.username,
        ss.bet_amount,
        ss.is_free_spin,
        ss.volatility_profile,
        ss.win_multiplier,
        ss.payout_amount,
        ss.free_spins_won,
        ss.status,
        ss.created_at
      FROM slot_spins ss
      INNER JOIN users u
        ON u.id = ss.user_id
      ORDER BY ss.id DESC
      LIMIT ?
      `,
      [safeLimit],
    ),

    pool.query(
      `
      SELECT
        stat_date,
        total_spins,
        total_bet,
        total_payout,
        net_admin_result
      FROM slot_daily_stats
      ORDER BY stat_date DESC
      LIMIT 30
      `,
    ),
  ]);

  const spins =
    spinResult[0].map(
      (row) => ({
        id:
          Number(row.id),

        spinCode:
          String(
            row.spin_code,
          ),

        userId:
          Number(row.user_id),

        uid:
          row.uid || null,

        username:
          row.username ||
          "Unknown",

        betAmount:
          parseMoney(
            row.bet_amount,
          ),

        isFreeSpin:
          Boolean(
            row.is_free_spin,
          ),

        volatilityProfile:
          String(
            row.volatility_profile,
          ),

        winMultiplier:
          Number(
            row.win_multiplier,
          ),

        payoutAmount:
          parseMoney(
            row.payout_amount,
          ),

        freeSpinsWon:
          Number(
            row.free_spins_won,
          ) || 0,

        status:
          String(row.status),

        createdAt:
          row.created_at,
      }),
    );

  const dailyStats =
    dailyResult[0].map(
      (row) => ({
        statDate:
          row.stat_date,

        totalSpins:
          Number(
            row.total_spins,
          ) || 0,

        totalBet:
          parseMoney(
            row.total_bet,
          ),

        totalPayout:
          parseMoney(
            row.total_payout,
          ),

        netAdminResult:
          parseMoney(
            row.net_admin_result,
          ),
      }),
    );

  const today =
    dailyStats[0] || {
      totalSpins: 0,
      totalBet: 0,
      totalPayout: 0,
      netAdminResult: 0,
    };

  return {
    settings,
    today,
    spins,
    dailyStats,
  };
}

/* ==========================
   Exports
========================== */

module.exports = {
  SLOT_ROWS,
  SLOT_COLUMNS,
  SLOT_SYMBOLS,
  SLOT_PAYLINES,
  SLOT_PAYTABLE,
  SYMBOL_WEIGHTS,

  createSlotError,
  parseMoney,
  createSpinCode,
  deterministicRandom,
  selectWeightedSymbol,

  getSlotSettings,
  generateSlotGrid,
  evaluatePayline,
  calculateSlotResult,

  createSlotTransactionId,
  spinSlot,
  getSlotPlayerState,
getMySlotHistory,
updateSlotSettings,
getAdminSlotDashboard,

  pool,
};