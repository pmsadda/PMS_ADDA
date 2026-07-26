const jwt = require("jsonwebtoken");

/* ==========================
   Verify Access Token
========================== */

function requireAuth(req, res, next) {
    try {
        const authorization =
            req.headers.authorization || "";

        const [scheme, token] =
            authorization.split(" ");

        if (
            scheme !== "Bearer" ||
            !token
        ) {
            return res.status(401).json({
                success: false,
                message:
                    "Authentication token is required."
            });
        }

        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET
        );

        req.user = {
            id: decoded.id,
            uid: decoded.uid,
            role: decoded.role
        };

        next();
    } catch (error) {
        if (
            error.name === "TokenExpiredError"
        ) {
            return res.status(401).json({
                success: false,
                message:
                    "Your login session has expired."
            });
        }

        return res.status(401).json({
            success: false,
            message:
                "Invalid authentication token."
        });
    }
}

/* ==========================
   Admin Role Check
========================== */

function requireAdmin(req, res, next) {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message:
                "Authentication is required."
        });
    }

    if (req.user.role !== "admin") {
        return res.status(403).json({
            success: false,
            message:
                "Admin access is required."
        });
    }

    next();
}

module.exports = {
    requireAuth,
    requireAdmin
};