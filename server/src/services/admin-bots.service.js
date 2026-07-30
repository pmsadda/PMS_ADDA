const { pool } = require(
    "../config/database"
);

function createServiceError(
    message,
    statusCode = 400
) {
    const error = new Error(message);

    error.statusCode = statusCode;

    return error;
}

function parseBotId(value) {
    const botId = Number.parseInt(
        value,
        10
    );

    if (
        Number.isNaN(botId) ||
        botId < 1
    ) {
        throw createServiceError(
            "Invalid bot ID."
        );
    }

    return botId;
}

const BOT_GAME_CONFIG = Object.freeze({
    teen_patti: Object.freeze({
        tableName: "teen_patti_bots",

        difficultyColumn:
            "difficulty",

        playingStyleColumn:
            "playing_style",

        levelColumn: null,

        activeStatus: "active",

        disabledStatus:
            "disabled"
    }),

    poker: Object.freeze({
        tableName: "poker_bots",

        difficultyColumn:
            "difficulty",

        playingStyleColumn:
            "playing_style",

        levelColumn: null,

        activeStatus: "active",

        disabledStatus:
            "disabled"
    }),

    ludo: Object.freeze({
        tableName: "ludo_bots",

        difficultyColumn: null,

        playingStyleColumn: null,

        levelColumn: "bot_level",

        activeStatus: "active",

        disabledStatus:
            "inactive"
    })
});

function normalizeGameType(
    value,
    allowAll = false
) {
    const gameType = String(
        value || "teen_patti"
    )
        .trim()
        .toLowerCase();

    if (
        allowAll &&
        gameType === "all"
    ) {
        return "all";
    }

    if (!BOT_GAME_CONFIG[gameType]) {
        throw createServiceError(
            "Bot game type must be teen_patti, poker or ludo."
        );
    }

    return gameType;
}

function getBotGameConfig(value) {
    const gameType =
        normalizeGameType(value);

    return {
        gameType,

        ...BOT_GAME_CONFIG[gameType]
    };
}

function normalizeBotRow(
    row,
    gameType,
    config
) {
    const databaseStatus = String(
        row.status || ""
    )
        .trim()
        .toLowerCase();

    return {
        id: Number(row.id),

        botKey:
            `${gameType}:${Number(
                row.id
            )}`,

        gameType,

        botCode:
            row.bot_code,

        botName:
            row.bot_name,

        avatarUrl:
            row.avatar_url || null,

        walletBalance: Number(
            row.wallet_balance || 0
        ),

        status:
            databaseStatus ===
            config.activeStatus
                ? "active"
                : "disabled",

        difficulty:
            row.difficulty || null,

        playingStyle:
            row.playing_style || null,

        botLevel:
            row.bot_level || null
    };
}

async function queryBotsByGame(
    gameTypeValue,
    botIdValue = null
) {
    const config =
        getBotGameConfig(
            gameTypeValue
        );

    const difficultySelect =
        config.difficultyColumn
            ? `${config.difficultyColumn} AS difficulty`
            : "NULL AS difficulty";

    const styleSelect =
        config.playingStyleColumn
            ? `${config.playingStyleColumn} AS playing_style`
            : "NULL AS playing_style";

    const levelSelect =
        config.levelColumn
            ? `${config.levelColumn} AS bot_level`
            : "NULL AS bot_level";

    const queryParams = [];

    let whereClause = "";

    if (botIdValue !== null) {
        const botId =
            parseBotId(botIdValue);

        whereClause =
            "WHERE id = ?";

        queryParams.push(botId);
    }

    const [rows] = await pool.query(
        `
        SELECT
            id,
            bot_code,
            bot_name,
            avatar_url,
            wallet_balance,
            status,
            ${difficultySelect},
            ${styleSelect},
            ${levelSelect}

        FROM ${config.tableName}

        ${whereClause}

        ORDER BY id DESC
        `,
        queryParams
    );

    return rows.map((row) =>
        normalizeBotRow(
            row,
            config.gameType,
            config
        )
    );
}

/* =========================
   সব Bot দেখাবে
========================= */

async function getBots(
    gameTypeValue =
        "teen_patti"
) {
    const gameType =
        normalizeGameType(
            gameTypeValue,
            true
        );

    if (gameType !== "all") {
        return queryBotsByGame(
            gameType
        );
    }

    const botGroups =
        await Promise.all(
            Object.keys(
                BOT_GAME_CONFIG
            ).map(
                (selectedGameType) =>
                    queryBotsByGame(
                        selectedGameType
                    )
            )
        );

    return botGroups.flat();
}

/* =========================
   একটি Bot দেখাবে
========================= */

async function getBotById(
    gameTypeValue,
    botIdValue
) {
    /*
     * পুরোনো Teen Patti calls যেন
     * frontend update-এর আগে না ভাঙে।
     */
    if (botIdValue === undefined) {
        botIdValue =
            gameTypeValue;

        gameTypeValue =
            "teen_patti";
    }

    const bots =
        await queryBotsByGame(
            gameTypeValue,
            botIdValue
        );

    if (bots.length === 0) {
        throw createServiceError(
            "Bot not found.",
            404
        );
    }

    return bots[0];
}

/* =========================
   Bot Balance পরিবর্তন
========================= */

async function updateBotBalance(
    gameTypeValue,
    botIdValue,
    adminUserId,
    payload = {}
) {
    const config =
        getBotGameConfig(
            gameTypeValue
        );

    const botId = parseBotId(
        botIdValue
    );

    const actionType = String(
        payload.actionType || ""
    )
        .trim()
        .toLowerCase();

    const allowedActions = [
        "add",
        "deduct",
        "set"
    ];

    if (
        !allowedActions.includes(
            actionType
        )
    ) {
        throw createServiceError(
            "Action must be add, deduct or set."
        );
    }

    const amount = Number(
        payload.amount
    );

    if (
        !Number.isFinite(amount) ||
        amount < 0
    ) {
        throw createServiceError(
            "Enter a valid amount."
        );
    }

    if (
        actionType !== "set" &&
        amount <= 0
    ) {
        throw createServiceError(
            "Amount must be greater than zero."
        );
    }

    const note = String(
        payload.note || ""
    )
        .trim()
        .slice(0, 255);

    const connection =
        await pool.getConnection();

    try {
        await connection.beginTransaction();

        const [botRows] =
            await connection.query(
                `
                    SELECT
                        id,
                        wallet_balance

                    FROM ${config.tableName}

                    WHERE id = ?

                    LIMIT 1

                    FOR UPDATE
                `,
                [botId]
            );

        if (botRows.length === 0) {
            throw createServiceError(
                "Bot not found.",
                404
            );
        }

        const balanceBefore = Number(
            botRows[0].wallet_balance || 0
        );

        let balanceAfter =
            balanceBefore;

        if (actionType === "add") {
            balanceAfter =
                balanceBefore + amount;
        }

        if (actionType === "deduct") {
            balanceAfter =
                balanceBefore - amount;
        }

        if (actionType === "set") {
            balanceAfter = amount;
        }

        if (balanceAfter < 0) {
            throw createServiceError(
                "Bot balance cannot be negative."
            );
        }

        await connection.query(
            `
                UPDATE ${config.tableName}

                SET wallet_balance = ?

                WHERE id = ?
            `,
            [
                balanceAfter,
                botId
            ]
        );

        await connection.query(
            `
                INSERT INTO bot_balance_history (
                    bot_id,
                     game_type,
                    admin_user_id,
                    action_type,
                    amount,
                    balance_before,
                    balance_after,
                    note
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [
                botId,
                config.gameType,
                adminUserId,
                actionType,
                amount,
                balanceBefore,
                balanceAfter,
                note || null
            ]
        );

        await connection.commit();

        return {
            botId,
            gameType:
        config.gameType,
            actionType,
            amount,
            balanceBefore,
            balanceAfter,
            note
        };
    } catch (error) {
        await connection.rollback();

        throw error;
    } finally {
        connection.release();
    }
}

/* =========================
   Bot Active / Disabled
========================= */

async function updateBotStatus(
    gameTypeValue,
    botIdValue,
    statusValue
) {
    const config =
        getBotGameConfig(
            gameTypeValue
        );

    const botId = parseBotId(
        botIdValue
    );

    const status = String(
        statusValue || ""
    )
        .trim()
        .toLowerCase();

    if (
        ![
            "active",
            "disabled"
        ].includes(status)
    ) {
        throw createServiceError(
            "Invalid bot status."
        );
    }

    /*
     * Teen Patti/Poker:
     * disabled
     *
     * Ludo:
     * inactive
     */
    const databaseStatus =
        status === "active"
            ? config.activeStatus
            : config.disabledStatus;

    const [result] = await pool.query(
        `
            UPDATE ${config.tableName}

            SET status = ?

            WHERE id = ?
        `,
        [
            databaseStatus,
            botId
        ]
    );

    if (result.affectedRows === 0) {
        throw createServiceError(
            "Bot not found.",
            404
        );
    }

    return getBotById(
        config.gameType,
        botId
    );
}

/* =========================
   Bot Difficulty / Style
========================= */

async function updateBotSettings(
    gameTypeValue,
    botIdValue,
    payload = {}
) {
    const config =
        getBotGameConfig(
            gameTypeValue
        );

    const botId = parseBotId(
        botIdValue
    );

    /*
     * Ludo:
     * normal / smart level
     */
    if (
        config.gameType === "ludo"
    ) {
        const botLevel = String(
            payload.botLevel ||
            payload.bot_level ||
            ""
        )
            .trim()
            .toLowerCase();

        if (
            ![
                "normal",
                "smart"
            ].includes(botLevel)
        ) {
            throw createServiceError(
                "Ludo bot level must be normal or smart."
            );
        }

        const [result] =
            await pool.query(
                `
                UPDATE ${config.tableName}
                SET bot_level = ?
                WHERE id = ?
                `,
                [
                    botLevel,
                    botId
                ]
            );

        if (
            result.affectedRows === 0
        ) {
            throw createServiceError(
                "Bot not found.",
                404
            );
        }

        return getBotById(
            config.gameType,
            botId
        );
    }

    /*
     * Teen Patti / Poker:
     * difficulty + playing style
     */
    const difficulty = String(
        payload.difficulty || ""
    )
        .trim()
        .toLowerCase();

    const playingStyle = String(
        payload.playingStyle ||
        payload.playing_style ||
        ""
    )
        .trim()
        .toLowerCase();

    const allowedDifficulties = [
        "easy",
        "normal",
        "hard"
    ];

    const allowedPlayingStyles = [
        "aggressive",
        "balanced",
        "defensive"
    ];

    if (
        !allowedDifficulties.includes(
            difficulty
        )
    ) {
        throw createServiceError(
            "Difficulty must be easy, normal or hard."
        );
    }

    if (
        !allowedPlayingStyles.includes(
            playingStyle
        )
    ) {
        throw createServiceError(
            "Playing style must be aggressive, balanced or defensive."
        );
    }

    const [result] =
        await pool.query(
            `
            UPDATE ${config.tableName}
            SET
                difficulty = ?,
                playing_style = ?
            WHERE id = ?
            `,
            [
                difficulty,
                playingStyle,
                botId
            ]
        );

    if (
        result.affectedRows === 0
    ) {
        throw createServiceError(
            "Bot not found.",
            404
        );
    }

    return getBotById(
        config.gameType,
        botId
    );
}
/* =========================
   Balance History
========================= */

async function getBalanceHistory(
    gameTypeValue,
    botIdValue
) {
    const gameType =
        normalizeGameType(
            gameTypeValue
        );

    const botId = parseBotId(
        botIdValue
    );

    const [rows] = await pool.query(
        `
        SELECT
            h.id,

            h.bot_id AS botId,

            h.game_type AS gameType,

            h.admin_user_id
                AS adminUserId,

            h.action_type
                AS actionType,

            h.amount,

            h.balance_before
                AS balanceBefore,

            h.balance_after
                AS balanceAfter,

            h.note,

            h.created_at
                AS createdAt,

            u.full_name
                AS adminName,

            u.username
                AS adminUsername

        FROM bot_balance_history h

        LEFT JOIN users u
            ON u.id =
               h.admin_user_id

        WHERE h.game_type = ?
          AND h.bot_id = ?

        ORDER BY h.id DESC

        LIMIT 100
        `,
        [
            gameType,
            botId
        ]
    );

    return rows.map((item) => ({
        ...item,

        id: Number(item.id),

        botId:
            Number(item.botId),

        gameType:
            item.gameType,

        adminUserId: Number(
            item.adminUserId
        ),

        amount: Number(
            item.amount || 0
        ),

        balanceBefore: Number(
            item.balanceBefore || 0
        ),

        balanceAfter: Number(
            item.balanceAfter || 0
        )
    }));
}

module.exports = {
    getBots,
    getBotById,
    updateBotBalance,
    updateBotStatus,
    updateBotSettings,
    getBalanceHistory
};