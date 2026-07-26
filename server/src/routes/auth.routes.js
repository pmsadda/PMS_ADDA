const express = require("express");
const {
    registerUser,
    login,
    me
} = require("../controllers/auth.controller");

const {
    requireAuth
} = require("../middleware/auth.middleware");

const router = express.Router();

/* Register */

router.post(
    "/register",
    registerUser
);

/* Login */

router.post(
    "/login",
    login
);

router.get(
    "/me",
    requireAuth,
    me
);

module.exports = router;