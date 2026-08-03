const express = require("express");
const cors = require("cors");
const path = require("path");

const authRoutes = require("./routes/auth.routes");

const profileRoutes = require("./routes/profile.routes");

const depositRoutes = require("./routes/deposit.routes");

const adminDepositRoutes = require("./routes/admin-deposit.routes");

const withdrawRoutes = require("./routes/withdraw.routes");

const adminWithdrawRoutes = require("./routes/admin-withdraw.routes");

const walletRoutes = require("./routes/wallet.routes");

const supportRoutes = require("./routes/support.routes");

const lobbyNoticeRoutes = require("./routes/lobby-notice.routes");

const lobbyBannerRoutes = require("./routes/lobby-banner.routes");

const adminLobbyBannerRoutes = require("./routes/admin-lobby-banner.routes");

const adminDashboardRoutes = require("./routes/admin-dashboard.routes");

const adminTransactionRoutes = require("./routes/admin-transactions.routes");

const adminUsersRoutes = require("./routes/admin-users.routes");

const adminGamesRoutes = require("./routes/admin-games.routes");

const adminGamesController = require("./controllers/admin-games.controller");

const { requireAuth } = require("./middleware/auth.middleware");

const adminBotsRoutes = require("./routes/admin-bots.routes");

const teenPattiRoutes = require("./routes/teenpatti.routes");

const pokerRoutes = require("./routes/poker.routes");

const ludoRoutes = require("./routes/ludo.routes");

const app = express();

/*
 * Render reverse proxy-এর পেছনে আসল client IP শনাক্ত করার জন্য।
 * express-rate-limit সঠিক user-কে limit করতে এটি প্রয়োজন।
 */
app.set("trust proxy", 1);

/*
 * Response header-এ Express ব্যবহারের তথ্য প্রকাশ বন্ধ করে।
 */
app.disable("x-powered-by");

/* ==========================
   Global Middleware
========================== */

app.use(cors());

app.use(express.json());

app.use(
  express.urlencoded({
    extended: true,
  }),
);

app.use("/client", express.static(path.join(__dirname, "../../client")));

app.use(
  "/uploads",
  express.static(path.resolve(__dirname, "../uploads"), {
    index: false,
    fallthrough: true,
    maxAge: "7d",
  }),
);

/* ==========================
   Health Route
========================== */

app.get("/", (req, res) => {
  return res.redirect(302, "/client/pages/login.html");
});

app.get("/api/health", (req, res) => {
  return res.status(200).json({
    success: true,
    message: "PMS ADDA server is online.",
    timestamp: new Date().toISOString(),
  });
});

/* ==========================
   API Routes
========================== */

app.use("/api/auth", authRoutes);

app.use("/api/profile", profileRoutes);

app.use("/api/deposits", depositRoutes);

app.use("/api/admin/deposits", adminDepositRoutes);

app.use("/api/withdraws", withdrawRoutes);

app.use("/api/wallet", walletRoutes);

app.use("/api/lobby-notices", lobbyNoticeRoutes);

app.use("/api/lobby-banner", lobbyBannerRoutes);

app.use("/api/admin/lobby-banner", adminLobbyBannerRoutes);

/*
 * Lobby game availability
 */
app.get(
  "/api/games/availability",
  requireAuth,
  adminGamesController.getPublicGameAvailability,
);

app.use("/api/admin/withdraws", adminWithdrawRoutes);

app.use("/api/admin/dashboard", adminDashboardRoutes);

app.use("/api/admin/transactions", adminTransactionRoutes);

app.use("/api/admin/users", adminUsersRoutes);

app.use("/api/admin/games", adminGamesRoutes);

app.use("/api/admin/bots", adminBotsRoutes);

app.use("/api/teenpatti", teenPattiRoutes);

app.use("/api/poker", pokerRoutes);

app.use("/api/ludo", ludoRoutes);
app.use("/api/support", supportRoutes);

/* ==========================

   404 Handler
========================== */

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "API route not found.",
  });
});

/* ==========================
   Global Error Handler
========================== */

app.use((error, req, res, next) => {
  console.error(error);

  const statusCode = error.statusCode || 500;

  const message = statusCode === 500 ? "Internal server error." : error.message;

  res.status(statusCode).json({
    success: false,
    message,
  });
});

module.exports = app;
