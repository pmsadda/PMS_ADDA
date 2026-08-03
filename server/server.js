"use strict";

require("dotenv").config();

const http = require("http");
const { Server } = require("socket.io");

const app = require("./src/app");

const { testDatabaseConnection } = require("./src/config/database");

const { initializeTeenPattiSocket } = require("./src/socket/teenpatti.socket");

const { initializeLudoSocket } = require("./src/socket/ludo.socket");

const { initializePokerSocket } = require("./src/socket/poker.socket");

const { initializeSupportSocket } = require("./src/socket/support.socket");

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
   * CORS headers protect browsers.
   * allowRequest also rejects disallowed Socket.IO handshakes.
   */
  allowRequest(request, callback) {
    callback(
      null,
      isCorsOriginAllowed(request.headers.origin),
    );
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
