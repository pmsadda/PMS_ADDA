"use strict";

/*====================================================

    PMS ADDA
    TEEN PATTI MULTIPLAYER SOCKET CLIENT

====================================================*/

const MULTIPLAYER = {
  socket: null,

  tableId: null,

  connected: false,

  updateConnectionStatus(status, message) {
    const dot = document.getElementById("teenPattiConnectionDot");
    const text = document.getElementById("teenPattiConnectionText");

    const statusConfig = {
      connecting: {
        message: "Connecting...",
        connected: false,
      },

      connected: {
        message: "Connected",
        connected: true,
      },

      joined: {
        message: "Table Joined",
        connected: true,
      },

      disconnected: {
        message: "Disconnected",
        connected: false,
      },

      error: {
        message: "Connection Error",
        connected: false,
      },
    };

    const config = statusConfig[status] || statusConfig.disconnected;

    if (text) {
      text.textContent = message || config.message;
    }

    if (dot) {
      dot.classList.toggle("is-connected", config.connected);
    }
  },

  /*================================================
      INITIALIZE
  ================================================*/

  initialize() {
    this.updateConnectionStatus("connecting");

    const token = localStorage.getItem("access_token");

    const urlParams = new URLSearchParams(window.location.search);

    const tableId = Number(urlParams.get("tableId"));

    if (!token) {
      console.error("❌ Multiplayer token পাওয়া যায়নি।");

      alert("Login session পাওয়া যায়নি। আবার login করুন।");

      window.location.replace("login.html");

      return;
    }

    if (!Number.isInteger(tableId) || tableId <= 0) {
      console.error("❌ Valid table ID পাওয়া যায়নি।");

      alert("Table ID পাওয়া যায়নি।");

      window.location.replace("lobby.html");

      return;
    }

    this.tableId = tableId;

    this.connect(token);
  },

  /*================================================
      SOCKET CONNECTION
  ================================================*/

  connect(token) {
    if (typeof io === "undefined") {
      console.error("❌ Socket.IO client library load হয়নি।");

      return;
    }

    this.socket = io(APP_CONFIG.TEEN_PATTI_SOCKET_URL, {
      auth: {
        token,
      },

      transports: ["websocket", "polling"],

      reconnection: true,

      reconnectionAttempts: 10,

      reconnectionDelay: 1000,

      timeout: 10000,
    });

    this.registerEvents();
  },

  /*================================================
      REGISTER SOCKET EVENTS
  ================================================*/

  registerEvents() {
    if (!this.socket) {
      return;
    }

    /*
     * Server-এর সঙ্গে connection সফল হলে।
     */
    this.socket.on("connect", () => {
      this.connected = true;

      this.updateConnectionStatus("connected");

      console.log("✅ Teen Patti socket connected.");
      console.log("SOCKET ID:", this.socket.id);

      this.joinTable();
    });

    /*
     * Authentication অথবা connection error।
     */
    this.socket.on("connect_error", (error) => {
      this.connected = false;

      const message = String(error?.message || "Teen Patti connection failed.");

      this.updateConnectionStatus("error");

      console.error("❌ Teen Patti socket connection error:", message);

      const authenticationFailed =
        message.toLowerCase().includes("authentication") ||
        Number(error?.data?.statusCode) === 401;

      if (authenticationFailed) {
        localStorage.removeItem("access_token");
        localStorage.removeItem("current_user");

        alert("Login session শেষ হয়েছে। আবার login করুন।");

        window.location.replace("login.html");
      }
    });

    /*
     * Server থেকে complete table state আসবে।
     */
    this.socket.on("table:state", (tableState) => {
      console.log("📥 REALTIME TABLE STATE:", tableState);

      /*
       * Round settlement সফল হলে
       * server-এর updated balance apply হবে।
       */

      /*
       * Active game.js যেন server state
       * ব্যবহার করতে পারে।
       */
      window.SERVER_TABLE_STATE = tableState;

      this.applyTableState(tableState);

      window.dispatchEvent(
        new CustomEvent("teenpatti:table-state", {
          detail: tableState,
        }),
      );
    });

    /*
     * Round settlement listener একবারই register হবে।
     * এটি table:state listener-এর ভেতরে রাখা যাবে না।
     */
    this.socket.off("round:settled");

    this.socket.on("round:settled", (data) => {
      console.log("🏆 TEEN PATTI ROUND SETTLED:", data);

      const settlement = data?.settlement;

      const tableState = data?.tableState;

      if (tableState) {
        this.applyTableState(tableState);

        window.SERVER_TABLE_STATE = tableState;

        window.dispatchEvent(
          new CustomEvent("teenpatti:round-settled", {
            detail: {
              settlement,
              tableState,
            },
          }),
        );
      }

      const localPlayer =
        typeof GAME !== "undefined"
          ? GAME.players.find((player) => player.isLocalPlayer === true)
          : null;

      const headerWallet = document.getElementById("headerWallet");

      if (localPlayer && headerWallet) {
        headerWallet.textContent = `৳${Number(
          localPlayer.balance || 0,
        ).toLocaleString("en-US")}`;
      }
    });

    /* =================================================
   SERVER HAND STARTED
================================================= */

    this.socket.off("hand:started");

    this.socket.on("hand:started", (data) => {
      console.log("🃏 TEEN PATTI HAND STARTED:", data);

      window.dispatchEvent(
        new CustomEvent("teenpatti:hand-started", {
          detail: data,
        }),
      );
    });

    /* =================================================
   PRIVATE HAND STATE
================================================= */

    this.socket.off("hand:state");

    this.socket.on("hand:state", (handState) => {
      console.log("🃏 PRIVATE TEEN PATTI HAND STATE:", handState);

      window.SERVER_HAND_STATE = handState;

      window.dispatchEvent(
        new CustomEvent("teenpatti:hand-state", {
          detail: handState,
        }),
      );
    });

    /*
     * নতুন player table room-এ connect করলে।
     */
    this.socket.on("table:player-joined", (data) => {
      console.log("👤 Player connected to table:", data);

      this.requestTableState();
    });

    /*
     * Player table room থেকে চলে গেলে।
     */
    this.socket.on("table:player-left", (data) => {
      console.log("👋 Player left table:", data);

      this.requestTableState();
    });

    /*
     * Player internet disconnect হলে।
     */
    this.socket.on("table:player-disconnected", (data) => {
      console.log("🔌 Player disconnected:", data);
    });

    /*
     * Server থেকে gameplay error এলে।
     */
    this.socket.on("table:error", (error) => {
      console.error("❌ TABLE SOCKET ERROR:", error);

      if (error?.message) {
        alert(error.message);
      }
    });

    /*
     * Socket disconnect হলে।
     */
    this.socket.on("disconnect", (reason) => {
      this.connected = false;

      this.updateConnectionStatus("disconnected", "Reconnecting...");

      console.warn("⚠️ Teen Patti socket disconnected:", reason);
    });

    /* =================================================
   PUBLIC SERVER HAND ACTION
================================================= */

    this.socket.off("hand:action");

    this.socket.on("hand:action", (actionData) => {
      console.log("🎴 TEEN PATTI HAND ACTION:", actionData);

      window.dispatchEvent(
        new CustomEvent("teenpatti:hand-action", {
          detail: actionData,
        }),
      );
    });
  },

  /*================================================
      JOIN TABLE ROOM
  ================================================*/

  joinTable() {
    if (!this.socket || !this.socket.connected) {
      console.warn("Socket connected নয়। Table join করা যায়নি।");

      return;
    }

    this.socket.emit(
      "table:join",
      {
        tableId: this.tableId,
      },
      (response) => {
        if (!response?.success) {
          this.updateConnectionStatus("error", "Table Join Failed");

          console.error("❌ Socket table join failed:", response);

          alert(response?.message || "Table connection failed.");

          return;
        }

        this.updateConnectionStatus("joined");

        console.log("✅ Socket table joined successfully.");

        console.log("JOIN RESPONSE:", response.data);
      },
    );
  },

  /*================================================
      REQUEST LATEST TABLE STATE
  ================================================*/

  requestTableState() {
    if (!this.socket || !this.socket.connected) {
      return;
    }

    this.socket.emit(
      "table:get-state",
      {
        tableId: this.tableId,
      },
      (response) => {
        if (!response?.success) {
          console.error("Table state request failed:", response?.message);
        }
      },
    );
  },

  /*================================================
    START SERVER TEEN PATTI HAND
================================================*/

  startHand() {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) {
        reject(new Error("Teen Patti socket is not connected."));

        return;
      }

      if (
        !Number.isInteger(Number(this.tableId)) ||
        Number(this.tableId) <= 0
      ) {
        reject(new Error("Valid Teen Patti table ID is missing."));

        return;
      }

      this.socket.emit(
        "hand:start",
        {
          tableId: Number(this.tableId),
        },
        (response) => {
          if (!response?.success) {
            reject(
              new Error(
                response?.message || "Teen Patti hand could not start.",
              ),
            );

            return;
          }

          const handState = response?.data?.handState;

          if (handState) {
            window.SERVER_HAND_STATE = handState;
          }

          console.log("✅ SERVER TEEN PATTI HAND:", response.data);

          resolve(response.data);
        },
      );
    });
  },

  /*================================================
    REQUEST PRIVATE HAND STATE
================================================*/

  requestHandState() {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) {
        reject(new Error("Teen Patti socket is not connected."));

        return;
      }

      this.socket.emit(
        "hand:get-state",
        {
          tableId: Number(this.tableId),
        },
        (response) => {
          if (!response?.success) {
            reject(
              new Error(
                response?.message || "Teen Patti hand state could not load.",
              ),
            );

            return;
          }

          const handState = response.data;

          window.SERVER_HAND_STATE = handState;

          resolve(handState);
        },
      );
    });
  },

  /*================================================
      SETTLE FINISHED ROUND
  ================================================*/

  settleRound(winner, payout, roundNumber) {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) {
        reject(new Error("Socket connected নয়।"));

        return;
      }

      if (!winner || !payout) {
        reject(new Error("Winner settlement data missing."));

        return;
      }

      this.socket.emit(
        "round:settle",
        {
          tableId: this.tableId,

          /*
           * winner.id হচ্ছে
           * table_players.id অথবা
           * table_bots.id।
           */
          winnerId: Number(winner.id),

          winnerType: winner.isBot ? "bot" : "real",

          grossAmount: Number(payout.grossAmount),

          expectedRound: Number(roundNumber),
        },
        (response) => {
          if (!response?.success) {
            /*
             * একাধিক real client একই
             * settlement পাঠালে দ্বিতীয়টি
             * 409 পাবে। সেটি duplicate।
             */
            if (Number(response?.statusCode) === 409) {
              console.warn("Round already settled.");

              resolve(null);

              return;
            }

            reject(new Error(response?.message || "Round settlement failed."));

            return;
          }

          console.log("✅ ROUND SETTLEMENT:", response.data);

          resolve(response.data);
        },
      );
    });
  },

  /*================================================
      APPLY SERVER TABLE STATE
  ================================================*/

  applyTableState(tableState) {
    if (!tableState || !Array.isArray(tableState.players)) {
      return false;
    }

    window.SERVER_TABLE_STATE = tableState;

    if (typeof GAME === "undefined" || !Array.isArray(GAME.players)) {
      return true;
    }

    tableState.players.forEach((serverPlayer) => {
      const localPlayer = GAME.players.find(
        (player) => Number(player.id) === Number(serverPlayer.id),
      );

      if (!localPlayer) {
        return;
      }

      localPlayer.balance = Number(serverPlayer.wallet_balance || 0);

      localPlayer.totalWin = Number(serverPlayer.total_win || 0);

      if (
        typeof UI !== "undefined" &&
        typeof UI.updatePlayerBalance === "function"
      ) {
        UI.updatePlayerBalance(localPlayer.id);
      }
    });

    const localHuman = GAME.players.find(
      (player) => player.isLocalPlayer === true,
    );

    const headerWallet = document.getElementById("headerWallet");

    if (localHuman && headerWallet) {
      headerWallet.textContent = `৳${Number(localHuman.balance).toLocaleString(
        "en-US",
      )}`;
    }

    return true;
  },

  /*================================================
      LEAVE SOCKET ROOM
  ================================================*/

  leaveTable() {
    if (!this.socket || !this.socket.connected) {
      return;
    }

    this.socket.emit(
      "table:leave",
      {
        tableId: this.tableId,
      },
      (response) => {
        if (response?.success) {
          console.log("✅ Socket table left.");
        }
      },
    );
  },
};

/*
 * অন্য JavaScript file থেকেও ব্যবহার করা যাবে।
 */
window.MULTIPLAYER = MULTIPLAYER;
