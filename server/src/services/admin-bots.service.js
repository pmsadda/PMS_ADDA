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

/* =========================
   সব Bot দেখাবে
========================= */

async function getBots() {
    const [rows] = await pool.query(`
        SELECT
            id,
            bot_code AS botCode,
            bot_name AS botName,
            avatar_url AS avatarUrl,
            wallet_balance AS walletBalance,
            status,
            difficulty,
            playing_style AS playingStyle,
            created_at AS createdAt,
            updated_at AS updatedAt

        FROM teen_patti_bots

        ORDER BY id DESC
    `);

    return rows.map((bot) => ({
        ...bot,

        id: Number(bot.id),

        walletBalance: Number(
            bot.walletBalance || 0
        ),

        difficulty: String(
            bot.difficulty || "normal"
        )
            .trim()
            .toLowerCase(),

        playingStyle: String(
            bot.playingStyle || "balanced"
        )
            .trim()
            .toLowerCase()
    }));
}

/* =========================
   একটি Bot দেখাবে
========================= */

async function getBotById(botIdValue) {
    const botId = parseBotId(
        botIdValue
    );

    const [rows] = await pool.query(
        `
            SELECT
                id,
                bot_code AS botCode,
                bot_name AS botName,
                avatar_url AS avatarUrl,
                wallet_balance AS walletBalance,
                status,
                difficulty,
                playing_style AS playingStyle,
                created_at AS createdAt,
                updated_at AS updatedAt

            FROM teen_patti_bots

            WHERE id = ?

            LIMIT 1
        `,
        [botId]
    );

    if (rows.length === 0) {
        throw createServiceError(
            "Bot not found.",
            404
        );
    }

    return {
        ...rows[0],

        id: Number(
            rows[0].id
        ),

        walletBalance: Number(
            rows[0].walletBalance || 0
        ),

        difficulty: String(
            rows[0].difficulty || "normal"
        )
            .trim()
            .toLowerCase(),

        playingStyle: String(
            rows[0].playingStyle || "balanced"
        )
            .trim()
            .toLowerCase()
    };
}

/* =========================
   Bot Balance পরিবর্তন
========================= */

async function updateBotBalance(
    botIdValue,
    adminUserId,
    payload = {}
) {
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

                    FROM teen_patti_bots

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
                UPDATE teen_patti_bots

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
                    admin_user_id,
                    action_type,
                    amount,
                    balance_before,
                    balance_after,
                    note
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `,
            [
                botId,
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
    botIdValue,
    statusValue
) {
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

    const [result] = await pool.query(
        `
            UPDATE teen_patti_bots

            SET status = ?

            WHERE id = ?
        `,
        [
            status,
            botId
        ]
    );

    if (result.affectedRows === 0) {
        throw createServiceError(
            "Bot not found.",
            404
        );
    }

    return getBotById(botId);
}

/* =========================
   Bot Difficulty / Style
========================= */

async function updateBotSettings(
    botIdValue,
    payload = {}
) {
    const botId = parseBotId(
        botIdValue
    );

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

    const [result] = await pool.query(
        `
            UPDATE teen_patti_bots

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

    if (result.affectedRows === 0) {
        throw createServiceError(
            "Bot not found.",
            404
        );
    }

    return getBotById(
        botId
    );
}

/* =========================
   Balance History
========================= */

async function getBalanceHistory(
    botIdValue
) {
    const botId = parseBotId(
        botIdValue
    );

    const [rows] = await pool.query(
        `
            SELECT
                h.id,
                h.bot_id AS botId,
                h.admin_user_id AS adminUserId,
                h.action_type AS actionType,
                h.amount,
                h.balance_before AS balanceBefore,
                h.balance_after AS balanceAfter,
                h.note,
                h.created_at AS createdAt,

                u.full_name AS adminName,
                u.username AS adminUsername

            FROM bot_balance_history h

            LEFT JOIN users u
                ON u.id = h.admin_user_id

            WHERE h.bot_id = ?

            ORDER BY h.id DESC

            LIMIT 100
        `,
        [botId]
    );

    return rows.map((item) => ({
        ...item,

        id: Number(item.id),

        botId: Number(item.botId),

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