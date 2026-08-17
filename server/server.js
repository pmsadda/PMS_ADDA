"use strict";

require("dotenv").config();

/*
 * Server কখনো missing অথবা দুর্বল JWT secret
 * নিয়ে চালু হবে না।
 *
 * Secret-এর value log করা হবে না।
 */
const jwtSecret = String(process.env.JWT_SECRET || "");

if (jwtSecret.length < 64) {
  throw new Error("JWT_SECRET must contain at least 64 characters.");
}

const http = require("http");
const { Server } = require("socket.io");

const app = require("./src/app");

const { pool, testDatabaseConnection } = require("./src/config/database");

const { initializeTeenPattiSocket } = require("./src/socket/teenpatti.socket");

const { initializeLudoSocket } = require("./src/socket/ludo.socket");

const { initializePokerSocket } = require("./src/socket/poker.socket");

const { initializeSupportSocket } = require("./src/socket/support.socket");

const { initializeCarromSocket } = require("./src/socket/carrom.socket");

const { initializeLotterySocket } = require("./src/socket/lottery.socket");

const {
  initializeAndarBaharSocket,
} = require("./src/socket/andar-bahar.socket");

const {
  initializeBanglaWheelSocket,
} = require("./src/socket/bangla-wheel.socket");

const {
  initializeBanglaDiceSocket,
} = require("./src/socket/bangla-dice.socket");

const PORT = Number(process.env.PORT) || 5000;

const HOST = process.env.HOST || "0.0.0.0";

const corsOptions = app.get("corsOptions");

const isCorsOriginAllowed = app.get("isCorsOriginAllowed");

if (!corsOptions || typeof isCorsOriginAllowed !== "function") {
  throw new Error("Shared CORS configuration is unavailable.");
}

/*
 * Express app-এর জন্য HTTP server।
 *
 * Socket.IO সরাসরি app.listen() নয়,
 * এই HTTP server-এর সঙ্গে যুক্ত হবে।
 */
const httpServer = http.createServer(app);

/*
 * Socket.IO server configuration।
 */
const io = new Server(httpServer, {
  cors: corsOptions,

  /*
   * Game এবং chat socket দিয়ে অস্বাভাবিক বড়
   * payload পাঠিয়ে server memory ব্যবহার ঠেকায়।
   */
  maxHttpBufferSize: 100 * 1024,

  /*
   * ছোট realtime payload-এর জন্য compression
   * overhead ও compression-based attack surface কমায়।
   */
  perMessageDeflate: false,

  /*
   * CORS headers protect browsers.
   * allowRequest also rejects disallowed Socket.IO handshakes.
   */
  allowRequest(request, callback) {
    callback(null, isCorsOriginAllowed(request.headers.origin));
  },
});

app.set("io", io);

/*
 * Teen Patti socket events চালু করা।
 */
initializeTeenPattiSocket(io);
initializeLudoSocket(io);
initializePokerSocket(io);
initializeSupportSocket(io);

/*
 * Carrom এখন development hold-এ আছে।
 *
 * CARROM_ENABLED=true না দিলে Socket namespace,
 * recovery timer এবং database processing চালু হবে না।
 */
const carromEnabled = process.env.CARROM_ENABLED === "true";

let carromSocket = null;

if (carromEnabled) {
  carromSocket = initializeCarromSocket(io);
} else {
  console.log("⏸️ Carrom Socket.IO disabled");
}

app.set("carromSocket", carromSocket);

initializeLotterySocket(io);

initializeAndarBaharSocket(io);

initializeBanglaWheelSocket(io);

initializeBanglaDiceSocket(io);

/*
 * Server start।
 */
async function startServer() {
  try {
    await testDatabaseConnection();

    httpServer.listen(PORT, HOST, () => {
      console.log(`🚀 PMS ADDA Server Running at http://${HOST}:${PORT}`);
      console.log(`🔌 Socket.IO Running on Port ${PORT}`);
    });
  } catch (error) {
    console.error("❌ SERVER START ERROR:", error);

    process.exit(1);
  }
}

startServer();

/*
 * Render deploy/restart এবং VPS shutdown-এর সময়
 * নতুন connection বন্ধ করে Socket.IO ও database
 * pool cleanভাবে release করবে।
 */
let shutdownStarted = false;

async function shutdownServer(signal) {
  if (shutdownStarted) {
    return;
  }

  shutdownStarted = true;

  console.log(`SERVER SHUTDOWN STARTED: ${signal}`);

  /*
   * কোনো shutdown operation আটকে গেলে
   * 15 সেকেন্ড পরে process forcefully বন্ধ হবে।
   */
  const forceExitTimer = setTimeout(() => {
    console.error("SERVER SHUTDOWN TIMEOUT");

    process.exit(1);
  }, 15000);

  forceExitTimer.unref();

  try {
    /*
     * নতুন Socket connection বন্ধ করে
     * connected clients cleanভাবে disconnect করে।
     */
    await new Promise((resolve) => {
      io.close(() => {
        resolve();
      });
    });

    /*
     * চলমান database query শেষ হওয়ার পর
     * connection pool বন্ধ করে।
     */
    await pool.end();

    clearTimeout(forceExitTimer);

    console.log("SERVER SHUTDOWN COMPLETED");

    process.exit(0);
  } catch (error) {
    clearTimeout(forceExitTimer);

    console.error("SERVER SHUTDOWN ERROR:", {
      message: error.message,
      code: error.code,
    });

    process.exit(1);
  }
}

process.once("SIGTERM", () => {
  void shutdownServer("SIGTERM");
});

process.once("SIGINT", () => {
  void shutdownServer("SIGINT");
});
