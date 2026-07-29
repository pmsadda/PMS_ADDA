const { pool } = require("../config/database");

function parsePositiveInteger(value, fallback) {
    const parsedValue = Number.parseInt(value, 10);

    if (
        Number.isNaN(parsedValue) ||
        parsedValue < 1
    ) {
        return fallback;
    }

    return parsedValue;
}

function normalizeGameType(value) {
    const gameType = String(
        value || ""
    )
        .trim()
        .toLowerCase();

    const allowedGameTypes = [
        "teen_patti",
        "poker",
        "ludo"
    ];

    return allowedGameTypes.includes(gameType)
        ? gameType
        : null;
}

function normalizeStatus(value) {
    const status = String(
        value || ""
    )
        .trim()
        .toLowerCase();

    const allowedStatuses = [
        "waiting",
        "running",
        "finished",
        "disabled"
    ];

    return allowedStatuses.includes(status)
        ? status
        : null;
}

function generateRoomCode(gameType) {
    const prefixes = {
        teen_patti: "TP",
        poker: "PK",
        ludo: "LD"
    };

    const prefix =
        prefixes[gameType] || "RM";

    const randomNumber =
        Math.floor(
            100000 +
            Math.random() * 900000
        );

    return `${prefix}${randomNumber}`;
}

async function createUniqueRoomCode(
    gameType
) {
    for (
        let attempt = 1;
        attempt <= 10;
        attempt += 1
    ) {
        const roomCode =
            generateRoomCode(gameType);

        const [rows] = await pool.query(
            `
                SELECT id
                FROM game_rooms
                WHERE room_code = ?
                LIMIT 1
            `,
            [roomCode]
        );

        if (rows.length === 0) {
            return roomCode;
        }
    }

    throw new Error(
        "Could not generate unique room code."
    );
}

async function getGameSummary() {
    const [rows] = await pool.query(`
        SELECT
            COUNT(*) AS total_rooms,

            COALESCE(
                SUM(
                    CASE
                        WHEN status = 'waiting'
                        THEN 1
                        ELSE 0
                    END
                ),
                0
            ) AS waiting_rooms,

            COALESCE(
                SUM(
                    CASE
                        WHEN status = 'running'
                        THEN 1
                        ELSE 0
                    END
                ),
                0
            ) AS running_rooms,

            COALESCE(
                SUM(
                    CASE
                        WHEN status = 'disabled'
                        THEN 1
                        ELSE 0
                    END
                ),
                0
            ) AS disabled_rooms,

            COALESCE(
                SUM(current_players),
                0
            ) AS active_players,

            COALESCE(
                SUM(
                    CASE
                        WHEN game_type = 'teen_patti'
                        THEN 1
                        ELSE 0
                    END
                ),
                0
            ) AS teen_patti_rooms,

            COALESCE(
                SUM(
                    CASE
                        WHEN game_type = 'poker'
                        THEN 1
                        ELSE 0
                    END
                ),
                0
            ) AS poker_rooms,

            COALESCE(
                SUM(
                    CASE
                        WHEN game_type = 'ludo'
                        THEN 1
                        ELSE 0
                    END
                ),
                0
            ) AS ludo_rooms

        FROM game_rooms
    `);

    const summary = rows[0] || {};

    return {
        totalRooms: Number(
            summary.total_rooms || 0
        ),

        waitingRooms: Number(
            summary.waiting_rooms || 0
        ),

        runningRooms: Number(
            summary.running_rooms || 0
        ),

        disabledRooms: Number(
            summary.disabled_rooms || 0
        ),

        activePlayers: Number(
            summary.active_players || 0
        ),

        teenPattiRooms: Number(
            summary.teen_patti_rooms || 0
        ),

        pokerRooms: Number(
            summary.poker_rooms || 0
        ),

        ludoRooms: Number(
            summary.ludo_rooms || 0
        )
    };
}

async function getPublicGameAvailability() {
    const gameTypes = [
        "teen_patti",
        "poker",
        "ludo"
    ];

    const [rows] = await pool.query(`
        SELECT
            game_type,

            COUNT(*) AS total_rooms,

            COALESCE(
                SUM(
                    CASE
                        WHEN status IN (
                            'waiting',
                            'running'
                        )
                        THEN 1
                        ELSE 0
                    END
                ),
                0
            ) AS available_rooms,

            COALESCE(
                SUM(current_players),
                0
            ) AS active_players

        FROM game_rooms

        WHERE game_type IN (
            'teen_patti',
            'poker',
            'ludo'
        )

        GROUP BY game_type
    `);

    const games = {};

    gameTypes.forEach((gameType) => {
        const row =
            rows.find(
                (item) =>
                    String(item.game_type) ===
                    gameType
            ) || null;

        const totalRooms = Number(
            row?.total_rooms || 0
        );

        const availableRooms = Number(
            row?.available_rooms || 0
        );

        games[gameType] = {
            gameType,

            /*
             * কোনো game_rooms record না থাকলে
             * game-এর নিজস্ব room module চলবে।
             *
             * Record থাকলে অন্তত একটি waiting
             * অথবা running room থাকতে হবে।
             */
            available:
                totalRooms === 0 ||
                availableRooms > 0,

            totalRooms,
            availableRooms,

            activePlayers: Number(
                row?.active_players || 0
            )
        };
    });

    return games;
}

async function getRooms(queryParams = {}) {
    const page = parsePositiveInteger(
        queryParams.page,
        1
    );

    const requestedLimit =
        parsePositiveInteger(
            queryParams.limit,
            10
        );

    const limit = Math.min(
        requestedLimit,
        100
    );

    const offset =
        (page - 1) * limit;

    const search = String(
        queryParams.search || ""
    ).trim();

    const gameType =
        queryParams.game_type === "all"
            ? null
            : normalizeGameType(
                queryParams.game_type
            );

    const status =
        queryParams.status === "all"
            ? null
            : normalizeStatus(
                queryParams.status
            );

    const conditions = [];
    const parameters = [];

    if (search) {
        const searchValue =
            `%${search}%`;

        conditions.push(`
            (
                room_code LIKE ?
                OR room_name LIKE ?
            )
        `);

        parameters.push(
            searchValue,
            searchValue
        );
    }

    if (gameType) {
        conditions.push(
            "game_type = ?"
        );

        parameters.push(gameType);
    }

    if (status) {
        conditions.push(
            "status = ?"
        );

        parameters.push(status);
    }

    const whereClause =
        conditions.length > 0
            ? `WHERE ${conditions.join(
                " AND "
            )}`
            : "";

    const [countRows] =
        await pool.query(
            `
                SELECT COUNT(*) AS total
                FROM game_rooms
                ${whereClause}
            `,
            parameters
        );

    const [roomRows] =
        await pool.query(
            `
                SELECT
                    id,
                    room_code,
                    game_type,
                    room_name,
                    max_players,
                    current_players,
                    boot_amount,
                    service_charge,
                    status,
                    created_at,
                    updated_at

                FROM game_rooms

                ${whereClause}

                ORDER BY created_at DESC

                LIMIT ?
                OFFSET ?
            `,
            [
                ...parameters,
                limit,
                offset
            ]
        );

    const total = Number(
        countRows[0]?.total || 0
    );

    const totalPages =
        total === 0
            ? 1
            : Math.ceil(total / limit);

    const rooms = roomRows.map(room => ({
        ...room,

        id: Number(room.id),

        max_players: Number(
            room.max_players || 0
        ),

        current_players: Number(
            room.current_players || 0
        ),

        boot_amount: Number(
            room.boot_amount || 0
        ),

        service_charge: Number(
            room.service_charge || 0
        )
    }));

    return {
        rooms,

        pagination: {
            page,
            limit,
            total,
            totalPages,
            hasPreviousPage:
                page > 1,
            hasNextPage:
                page < totalPages
        }
    };
}

async function getRoomById(roomId) {
    const [rows] = await pool.query(
        `
            SELECT
                id,
                room_code,
                game_type,
                room_name,
                max_players,
                current_players,
                boot_amount,
                service_charge,
                status,
                created_at,
                updated_at

            FROM game_rooms

            WHERE id = ?

            LIMIT 1
        `,
        [roomId]
    );

    if (rows.length === 0) {
        return null;
    }

    const room = rows[0];

    return {
        ...room,

        id: Number(room.id),

        max_players: Number(
            room.max_players || 0
        ),

        current_players: Number(
            room.current_players || 0
        ),

        boot_amount: Number(
            room.boot_amount || 0
        ),

        service_charge: Number(
            room.service_charge || 0
        )
    };
}

async function createRoom(roomData) {
    const gameType =
        normalizeGameType(
            roomData.game_type
        );

    if (!gameType) {
        const error = new Error(
            "Invalid game type."
        );

        error.statusCode = 400;
        throw error;
    }

    const roomName = String(
        roomData.room_name || ""
    ).trim();

    if (!roomName) {
        const error = new Error(
            "Room name is required."
        );

        error.statusCode = 400;
        throw error;
    }

    const maxPlayers = Number.parseInt(
        roomData.max_players,
        10
    );

    if (
        Number.isNaN(maxPlayers) ||
        maxPlayers < 2 ||
        maxPlayers > 10
    ) {
        const error = new Error(
            "Maximum players must be between 2 and 10."
        );

        error.statusCode = 400;
        throw error;
    }

    const bootAmount = Number(
        roomData.boot_amount
    );

    if (
        Number.isNaN(bootAmount) ||
        bootAmount < 0
    ) {
        const error = new Error(
            "Boot amount cannot be negative."
        );

        error.statusCode = 400;
        throw error;
    }

    const serviceCharge = Number(
        roomData.service_charge ?? 5
    );

    if (
        Number.isNaN(serviceCharge) ||
        serviceCharge < 0 ||
        serviceCharge > 100
    ) {
        const error = new Error(
            "Service charge must be between 0 and 100."
        );

        error.statusCode = 400;
        throw error;
    }

    const roomCode =
        await createUniqueRoomCode(
            gameType
        );

    const [result] = await pool.query(
        `
            INSERT INTO game_rooms (
                room_code,
                game_type,
                room_name,
                max_players,
                current_players,
                boot_amount,
                service_charge,
                status
            )
            VALUES (?, ?, ?, ?, 0, ?, ?, 'waiting')
        `,
        [
            roomCode,
            gameType,
            roomName,
            maxPlayers,
            bootAmount,
            serviceCharge
        ]
    );

    return getRoomById(
        result.insertId
    );
}

async function updateRoom(
    roomId,
    roomData
) {
    const existingRoom =
        await getRoomById(roomId);

    if (!existingRoom) {
        const error = new Error(
            "Game room not found."
        );

        error.statusCode = 404;
        throw error;
    }

    if (
        existingRoom.status ===
        "running"
    ) {
        const error = new Error(
            "Running room cannot be edited."
        );

        error.statusCode = 400;
        throw error;
    }

    const gameType =
        normalizeGameType(
            roomData.game_type ||
            existingRoom.game_type
        );

    const roomName = String(
        roomData.room_name ||
        existingRoom.room_name
    ).trim();

    const maxPlayers = Number.parseInt(
        roomData.max_players ??
        existingRoom.max_players,
        10
    );

    const bootAmount = Number(
        roomData.boot_amount ??
        existingRoom.boot_amount
    );

    const serviceCharge = Number(
        roomData.service_charge ??
        existingRoom.service_charge
    );

    if (!gameType) {
        const error = new Error(
            "Invalid game type."
        );

        error.statusCode = 400;
        throw error;
    }

    if (!roomName) {
        const error = new Error(
            "Room name is required."
        );

        error.statusCode = 400;
        throw error;
    }

    if (
        Number.isNaN(maxPlayers) ||
        maxPlayers < 2 ||
        maxPlayers > 10
    ) {
        const error = new Error(
            "Maximum players must be between 2 and 10."
        );

        error.statusCode = 400;
        throw error;
    }

    if (
        maxPlayers <
        existingRoom.current_players
    ) {
        const error = new Error(
            "Maximum players cannot be less than current players."
        );

        error.statusCode = 400;
        throw error;
    }

    if (
        Number.isNaN(bootAmount) ||
        bootAmount < 0
    ) {
        const error = new Error(
            "Boot amount cannot be negative."
        );

        error.statusCode = 400;
        throw error;
    }

    if (
        Number.isNaN(serviceCharge) ||
        serviceCharge < 0 ||
        serviceCharge > 100
    ) {
        const error = new Error(
            "Service charge must be between 0 and 100."
        );

        error.statusCode = 400;
        throw error;
    }

    await pool.query(
        `
            UPDATE game_rooms

            SET
                game_type = ?,
                room_name = ?,
                max_players = ?,
                boot_amount = ?,
                service_charge = ?

            WHERE id = ?
        `,
        [
            gameType,
            roomName,
            maxPlayers,
            bootAmount,
            serviceCharge,
            roomId
        ]
    );

    return getRoomById(roomId);
}

async function updateRoomStatus(
    roomId,
    status
) {
    const normalizedStatus =
        normalizeStatus(status);

    if (!normalizedStatus) {
        const error = new Error(
            "Invalid room status."
        );

        error.statusCode = 400;
        throw error;
    }

    const existingRoom =
        await getRoomById(roomId);

    if (!existingRoom) {
        const error = new Error(
            "Game room not found."
        );

        error.statusCode = 404;
        throw error;
    }

    if (
        normalizedStatus ===
            "disabled" &&
        existingRoom.current_players > 0
    ) {
        const error = new Error(
            "Room with active players cannot be disabled."
        );

        error.statusCode = 400;
        throw error;
    }

    await pool.query(
        `
            UPDATE game_rooms

            SET status = ?

            WHERE id = ?
        `,
        [
            normalizedStatus,
            roomId
        ]
    );

    return getRoomById(roomId);
}

async function deleteRoom(roomId) {
    const existingRoom =
        await getRoomById(roomId);

    if (!existingRoom) {
        const error = new Error(
            "Game room not found."
        );

        error.statusCode = 404;
        throw error;
    }

    if (
        existingRoom.status ===
            "running" ||
        existingRoom.current_players > 0
    ) {
        const error = new Error(
            "Running room or room with active players cannot be deleted."
        );

        error.statusCode = 400;
        throw error;
    }

    await pool.query(
        `
            DELETE FROM game_rooms
            WHERE id = ?
        `,
        [roomId]
    );

    return true;
}

module.exports = {
    getGameSummary,
    getPublicGameAvailability,
    getRooms,
    getRoomById,
    createRoom,
    updateRoom,
    updateRoomStatus,
    deleteRoom
};