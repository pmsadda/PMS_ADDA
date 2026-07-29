const adminGamesService = require(
    "../services/admin-games.service"
);

function parseRoomId(value) {
    const roomId = Number.parseInt(
        value,
        10
    );

    if (
        Number.isNaN(roomId) ||
        roomId < 1
    ) {
        return null;
    }

    return roomId;
}

async function getGameSummary(req, res) {
    try {
        const summary =
            await adminGamesService
                .getGameSummary();

        return res.status(200).json({
            success: true,
            message:
                "Game summary loaded successfully.",
            data: summary
        });
    } catch (error) {
        console.error(
            "Get game summary error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to load game summary."
        });
    }
}

async function getPublicGameAvailability(
    req,
    res,
    next
) {
    try {
        const games =
            await adminGamesService
                .getPublicGameAvailability();

        return res.status(200).json({
            success: true,

            message:
                "Game availability loaded successfully.",

            data: {
                games
            }
        });
    } catch (error) {
        next(error);
    }
}

async function getRooms(req, res) {
    try {
        const result =
            await adminGamesService
                .getRooms(req.query);

        return res.status(200).json({
            success: true,
            message:
                "Game rooms loaded successfully.",
            data: result
        });
    } catch (error) {
        console.error(
            "Get game rooms error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to load game rooms."
        });
    }
}

async function getRoomById(req, res) {
    try {
        const roomId = parseRoomId(
            req.params.roomId
        );

        if (!roomId) {
            return res.status(400).json({
                success: false,
                message: "Invalid room ID."
            });
        }

        const room =
            await adminGamesService
                .getRoomById(roomId);

        if (!room) {
            return res.status(404).json({
                success: false,
                message:
                    "Game room not found."
            });
        }

        return res.status(200).json({
            success: true,
            message:
                "Game room loaded successfully.",
            data: {
                room
            }
        });
    } catch (error) {
        console.error(
            "Get game room error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to load game room."
        });
    }
}

async function createRoom(req, res) {
    try {
        const room =
            await adminGamesService
                .createRoom(req.body);

        return res.status(201).json({
            success: true,
            message:
                "Game room created successfully.",
            data: {
                room
            }
        });
    } catch (error) {
        console.error(
            "Create game room error:",
            error
        );

        const statusCode =
            error.statusCode || 500;

        return res.status(statusCode).json({
            success: false,
            message:
                error.message ||
                "Failed to create game room."
        });
    }
}

async function updateRoom(req, res) {
    try {
        const roomId = parseRoomId(
            req.params.roomId
        );

        if (!roomId) {
            return res.status(400).json({
                success: false,
                message: "Invalid room ID."
            });
        }

        const room =
            await adminGamesService
                .updateRoom(
                    roomId,
                    req.body
                );

        return res.status(200).json({
            success: true,
            message:
                "Game room updated successfully.",
            data: {
                room
            }
        });
    } catch (error) {
        console.error(
            "Update game room error:",
            error
        );

        const statusCode =
            error.statusCode || 500;

        return res.status(statusCode).json({
            success: false,
            message:
                error.message ||
                "Failed to update game room."
        });
    }
}

async function updateRoomStatus(req, res) {
    try {
        const roomId = parseRoomId(
            req.params.roomId
        );

        if (!roomId) {
            return res.status(400).json({
                success: false,
                message: "Invalid room ID."
            });
        }

        const status = String(
            req.body.status || ""
        )
            .trim()
            .toLowerCase();

        const room =
            await adminGamesService
                .updateRoomStatus(
                    roomId,
                    status
                );

        return res.status(200).json({
            success: true,
            message:
                "Room status updated successfully.",
            data: {
                room
            }
        });
    } catch (error) {
        console.error(
            "Update room status error:",
            error
        );

        const statusCode =
            error.statusCode || 500;

        return res.status(statusCode).json({
            success: false,
            message:
                error.message ||
                "Failed to update room status."
        });
    }
}

async function deleteRoom(req, res) {
    try {
        const roomId = parseRoomId(
            req.params.roomId
        );

        if (!roomId) {
            return res.status(400).json({
                success: false,
                message: "Invalid room ID."
            });
        }

        await adminGamesService
            .deleteRoom(roomId);

        return res.status(200).json({
            success: true,
            message:
                "Game room deleted successfully."
        });
    } catch (error) {
        console.error(
            "Delete game room error:",
            error
        );

        const statusCode =
            error.statusCode || 500;

        return res.status(statusCode).json({
            success: false,
            message:
                error.message ||
                "Failed to delete game room."
        });
    }
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