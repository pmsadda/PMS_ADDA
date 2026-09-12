const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");

const authRoutes = require("./routes/auth.routes");

const profileRoutes = require("./routes/profile.routes");

const depositRoutes = require("./routes/deposit.routes");

const adminDepositRoutes = require("./routes/admin-deposit.routes");

const withdrawRoutes = require("./routes/withdraw.routes");

const adminWithdrawRoutes = require("./routes/admin-withdraw.routes");

const agentFinanceRoutes = require("./routes/agent-finance.routes");

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
const carromRoutes = require("./routes/carrom.routes");

const lotteryRoutes = require("./routes/lottery.routes");

const andarBaharRoutes = require("./routes/andar-bahar.routes");

const banglaWheelRoutes = require("./routes/bangla-wheel.routes");

const slotRoutes = require("./routes/slot.routes");

const adminSlotRoutes = require("./routes/admin-slot.routes");

const superAceRoutes =
  require("./routes/super-ace.routes");

const adminSuperAceRoutes =
  require("./routes/admin-super-ace.routes");

const adminAndarBaharRoutes = require("./routes/admin-andar-bahar.routes");

const adminBanglaWheelRoutes = require("./routes/admin-bangla-wheel.routes");

const adminBanglaDiceRoutes = require("./routes/admin-bangla-dice.routes");

const adminAviatorRoutes = require("./routes/admin-aviator.routes");

const banglaDiceRoutes = require("./routes/bangla-dice.routes");

const kaitRoutes = require("./routes/kait.routes");

const adminKaitRoutes = require("./routes/admin-kait.routes");

const adminLotteryRoutes = require("./routes/admin-lottery.routes");

const adminAgentRoutes = require("./routes/admin-agent.routes");

const appDownloadRoutes = require("./routes/app-download.routes");

const marketingTrafficRoutes =
  require("./routes/marketing-traffic.routes");

const app = express();

/* =========================================================
   OLD DOMAIN → MAIN DOMAIN REDIRECT
========================================================= */

app.use((req, res, next) => {
  const host = String(req.hostname || "").toLowerCase();

  if (host === "pms-adda.live" || host === "www.pms-adda.live") {
    return res.redirect(308, `https://tpl22.site${req.originalUrl}`);
  }

  next();
});

/*
 * Render reverse proxy-এর পেছনে আসল client IP শনাক্ত করার জন্য।
 * express-rate-limit সঠিক user-কে limit করতে এটি প্রয়োজন।
 */
app.set("trust proxy", 1);

/*
 * Response header-এ Express ব্যবহারের তথ্য প্রকাশ বন্ধ করে।
 */
app.disable("x-powered-by");

const isProduction = process.env.NODE_ENV === "production";

const LOCAL_CORS_HOSTS = new Set(["localhost", "127.0.0.1"]);

function normalizeCorsOrigin(origin) {
  return String(origin || "")
    .trim()
    .replace(/\/+$/, "");
}

const configuredCorsOrigins = new Set(
  [
    process.env.RENDER_EXTERNAL_URL,
    process.env.CLIENT_URL,
    ...String(process.env.CORS_ALLOWED_ORIGINS || "").split(","),
  ]
    .map(normalizeCorsOrigin)
    .filter(Boolean),
);

function isCorsOriginAllowed(origin) {
  /*
   * Native apps, curl and server-to-server requests might not send Origin.
   */
  if (!origin) {
    return true;
  }

  const normalizedOrigin = normalizeCorsOrigin(origin);

  if (configuredCorsOrigins.has(normalizedOrigin)) {
    return true;
  }

  /*
   * Allow localhost frontend ports only during local development.
   */
  if (!isProduction) {
    try {
      const parsedOrigin = new URL(normalizedOrigin);

      return (
        ["http:", "https:"].includes(parsedOrigin.protocol) &&
        LOCAL_CORS_HOSTS.has(parsedOrigin.hostname)
      );
    } catch (_error) {
      return false;
    }
  }

  return false;
}

const corsOptions = {
  origin(origin, callback) {
    callback(null, isCorsOriginAllowed(origin));
  },

  methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],

  credentials: true,

  maxAge: 86400,

  optionsSuccessStatus: 204,
};

app.set("isCorsOriginAllowed", isCorsOriginAllowed);
app.set("corsOptions", corsOptions);

/* ==========================
   Global Security Middleware
========================== */

app.use(
  helmet({
    /*
     * Existing pages contain inline scripts.
     * CSP will be configured separately after asset inventory.
     */
    contentSecurityPolicy: false,

    /*
     * Allows uploaded avatars and game assets to load when the frontend
     * is running from a different local port or a future app client.
     */
    crossOriginResourcePolicy: {
      policy: "cross-origin",
    },

    /*
     * Render sets NODE_ENV=production.
     * Local HTTP development must not be forced to HTTPS.
     */
    strictTransportSecurity: isProduction
      ? {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: false,
        }
      : false,

    referrerPolicy: {
      policy: "strict-origin-when-cross-origin",
    },

    xFrameOptions: {
      action: "deny",
    },
  }),
);

/* ==========================
   Global Middleware
========================== */

app.use(cors(corsOptions));

app.use(
  express.json({
    limit: "100kb",
    strict: true,
  }),
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "100kb",
    parameterLimit: 100,
  }),
);

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

/* =========================================================
   CLEAN FRONTEND URLS
========================================================= */

const clientRoot = path.join(__dirname, "../../client");

const clientPages = path.join(clientRoot, "pages");

/* Assets for clean URLs */

app.use("/css", express.static(path.join(clientRoot, "css")));

app.use("/js", express.static(path.join(clientRoot, "js")));

app.use("/assets", express.static(path.join(clientRoot, "assets")));

/* =========================================================
   TPL22 PWA FILES
========================================================= */

app.get("/manifest.webmanifest", (req, res) => {
  res.setHeader(
    "Content-Type",
    "application/manifest+json; charset=utf-8"
  );

  res.setHeader(
    "Cache-Control",
    "no-cache, no-store, must-revalidate"
  );

  return res.sendFile(
    path.join(clientRoot, "manifest.webmanifest")
  );
});

app.get("/service-worker.js", (req, res) => {
  res.setHeader(
    "Content-Type",
    "application/javascript; charset=utf-8"
  );

  res.setHeader(
    "Cache-Control",
    "no-cache, no-store, must-revalidate"
  );

  res.setHeader(
    "Service-Worker-Allowed",
    "/"
  );

  return res.sendFile(
    path.join(clientRoot, "service-worker.js")
  );
});

/* =========================================================
   LOGIN = MAIN DOMAIN
========================================================= */

app.get("/", (req, res) => {
  return res.sendFile(path.join(clientPages, "lobby.html"));
});

/* =========================================================
   OLD URL → CLEAN URL
========================================================= */

app.get("/client/pages/login.html", (req, res) => {
  return res.redirect(301, "/login");
});

app.get("/client/pages/:page.html", (req, res) => {
  const queryIndex = req.originalUrl.indexOf("?");

  const query = queryIndex >= 0 ? req.originalUrl.slice(queryIndex) : "";

  return res.redirect(301, `/${req.params.page}${query}`);
});

/* =========================================================
   /lobby.html → /lobby
========================================================= */

app.get("/pages/:page.html", (req, res) => {
  const queryIndex = req.originalUrl.indexOf("?");

  const query = queryIndex >= 0 ? req.originalUrl.slice(queryIndex) : "";

  return res.redirect(301, `/${req.params.page}${query}`);
});

app.get("/:page.html", (req, res) => {
  const queryIndex = req.originalUrl.indexOf("?");

  const query = queryIndex >= 0 ? req.originalUrl.slice(queryIndex) : "";

  return res.redirect(301, `/${req.params.page}${query}`);
});

app.use(
  "/client",
  express.static(clientRoot, {
    index: false,
  }),
);

/* =========================================================
   CLEAN PAGE ROUTE
   /lobby
   /wallet
   /profile
   etc.
========================================================= */

app.get("/:page", (req, res, next) => {
  const page = String(req.params.page || "").replace(/[^a-zA-Z0-9_-]/g, "");

  if (!page) {
    return next();
  }

  const filePath = path.join(clientPages, `${page}.html`);

  return res.sendFile(filePath, (error) => {
    if (error) {
      next();
    }
  });
});

app.get("/api/health", (req, res) => {
  return res.status(200).json({
    success: true,
    message: "TPL22 server is online.",
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

app.use("/api/slot", slotRoutes);

app.use("/api/admin/slot", adminSlotRoutes);

app.use("/api/wallet", walletRoutes);

app.use("/api/lobby-notices", lobbyNoticeRoutes);

app.use("/api/lobby-banner", lobbyBannerRoutes);

app.use("/api/admin/lobby-banner", adminLobbyBannerRoutes);

app.use("/api/app-download", appDownloadRoutes);

app.use(
  "/api/marketing-traffic",
  marketingTrafficRoutes
);

/*
 * Lobby game availability
 */
app.get(
  "/api/games/availability",
  adminGamesController.getPublicGameAvailability,
);

app.use("/api/admin/withdraws", adminWithdrawRoutes);

app.use("/api/agent", agentFinanceRoutes);

app.use("/api/admin/dashboard", adminDashboardRoutes);

app.use("/api/admin/transactions", adminTransactionRoutes);

app.use("/api/admin/users", adminUsersRoutes);

app.use("/api/admin/games", adminGamesRoutes);

app.use("/api/admin/bots", adminBotsRoutes);

app.use("/api/teenpatti", teenPattiRoutes);

app.use("/api/poker", pokerRoutes);

app.use("/api/ludo", ludoRoutes);

app.use("/api/carrom", carromRoutes);

app.use("/api/lottery", lotteryRoutes);

app.use("/api/andar-bahar", andarBaharRoutes);

app.use("/api/bangla-wheel", banglaWheelRoutes);

app.use("/api/bangla-dice", banglaDiceRoutes);

app.use("/api/kait", kaitRoutes);

app.use("/api/admin/kait", adminKaitRoutes);

app.use("/api/admin/andar-bahar", adminAndarBaharRoutes);

app.use("/api/admin/bangla-wheel", adminBanglaWheelRoutes);

app.use("/api/admin/bangla-dice", adminBanglaDiceRoutes);

app.use("/api/admin/lottery", adminLotteryRoutes);

app.use("/api/support", supportRoutes);

app.use("/api/admin/aviator", adminAviatorRoutes);

app.use(
  "/api/super-ace",
  superAceRoutes,
);

app.use(
  "/api/admin/super-ace",
  adminSuperAceRoutes,
);

/* ==========================
   404 Handler
========================== */

app.use("/api/admin/agents", adminAgentRoutes);

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