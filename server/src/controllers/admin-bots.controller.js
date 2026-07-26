const adminBotsService = require(
    "../services/admin-bots.service"
);

/* =========================
   সব Bot দেখাবে
========================= */

async function getBots(
    req,
    res,
    next
) {
    try {
        const bots =
            await adminBotsService.getBots();

        return res.status(200).json({
            success: true,
            data: bots
        });
    } catch (error) {
        next(error);
    }
}

/* =========================
   একটি Bot দেখাবে
========================= */

async function getBotById(
    req,
    res,
    next
) {
    try {
        const bot =
            await adminBotsService.getBotById(
                req.params.botId
            );

        return res.status(200).json({
            success: true,
            data: bot
        });
    } catch (error) {
        next(error);
    }
}

/* =========================
   Bot Balance পরিবর্তন
========================= */

async function updateBotBalance(
    req,
    res,
    next
) {
    try {
        const adminUserId =
            Number(req.user.id);

        const result =
            await adminBotsService
                .updateBotBalance(
                    req.params.botId,
                    adminUserId,
                    req.body
                );

        return res.status(200).json({
            success: true,
            message:
                "Bot balance updated successfully.",
            data: result
        });
    } catch (error) {
        next(error);
    }
}

/* =========================
   Bot Status পরিবর্তন
========================= */

async function updateBotStatus(
    req,
    res,
    next
) {
    try {
        const bot =
            await adminBotsService
                .updateBotStatus(
                    req.params.botId,
                    req.body.status
                );

        return res.status(200).json({
            success: true,
            message:
                "Bot status updated successfully.",
            data: bot
        });
    } catch (error) {
        next(error);
    }
}

/* =========================
   Bot Settings পরিবর্তন
========================= */

async function updateBotSettings(
    req,
    res,
    next
) {
    try {

        const bot =
            await adminBotsService
                .updateBotSettings(
                    req.params.botId,
                    req.body
                );

        return res.status(200).json({
            success: true,
            message:
                "Bot settings updated successfully.",
            data: bot
        });

    } catch (error) {

        next(error);

    }
}

/* =========================
   Balance History
========================= */

async function getBalanceHistory(
    req,
    res,
    next
) {
    try {
        const history =
            await adminBotsService
                .getBalanceHistory(
                    req.params.botId
                );

        return res.status(200).json({
            success: true,
            data: history
        });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    getBots,
    getBotById,
    updateBotBalance,
    updateBotStatus,
    updateBotSettings,
    getBalanceHistory
};