"use strict";

/* ==========================================
   PMS ADDA CENTRAL CONFIGURATION
========================================== */

(function initializeAppConfig() {
  const currentLocation = window.location;

  const localHosts = new Set([
    "localhost",
    "127.0.0.1",
  ]);

  const isLocalFrontendServer =
    localHosts.has(currentLocation.hostname) &&
    currentLocation.port !== "5000";

  /*
   * Live Server (5500) দিয়ে local test করলে
   * Node backend port 5000 ব্যবহার হবে।
   *
   * Node server বা live Render URL দিয়ে খুললে
   * current origin ব্যবহার হবে।
   */
  const serverUrl = isLocalFrontendServer
    ? "http://localhost:5000"
    : currentLocation.origin;

  const APP_CONFIG = {
    APP_NAME: "PMS ADDA",

    SERVER_URL: serverUrl.replace(/\/+$/, ""),

    get API_URL() {
      return `${this.SERVER_URL}/api`;
    },

    get SOCKET_URL() {
      return this.SERVER_URL;
    },

    get TEEN_PATTI_SOCKET_URL() {
      return `${this.SERVER_URL}/teenpatti`;
    },

    api(path = "") {
      const cleanPath = String(path).startsWith("/")
        ? String(path)
        : `/${path}`;

      return `${this.API_URL}${cleanPath}`;
    },

    server(path = "") {
      const cleanPath = String(path).startsWith("/")
        ? String(path)
        : `/${path}`;

      return `${this.SERVER_URL}${cleanPath}`;
    },
  };

  Object.freeze(APP_CONFIG);

  window.APP_CONFIG = APP_CONFIG;

  console.log(
    "PMS ADDA server:",
    APP_CONFIG.SERVER_URL,
  );
})();

/* ==========================================
   SECURE LOGIN SESSION MANAGER
========================================== */

(function initializeAuthSession() {
  const ACCESS_TOKEN_KEY = "access_token";

    const LOBBY_SESSION_DURATION_MS =
    30 * 60 * 1000;

  const LOBBY_SESSION_STARTED_KEY =
    "pms_lobby_session_started_at";

  const AUTH_STORAGE_KEYS = [
    "access_token",
    "current_user",
    "user_id",
  ];

  let logoutTimer = null;
  let activeToken = null;
  let logoutStarted = false;

  function isPublicAuthPage() {
    const pathname =
      String(window.location.pathname).toLowerCase();

    return (
      pathname.endsWith("/login.html") ||
      pathname.endsWith("/register.html")
    );
  }

    function isLobbyPage() {
    const pathname =
      String(
        window.location.pathname,
      ).toLowerCase();

    return pathname.endsWith(
      "/lobby.html",
    );
  }

  function clearLobbySession() {
    sessionStorage.removeItem(
      LOBBY_SESSION_STARTED_KEY,
    );
  }

  function getOrCreateLobbyStartedAt() {
    const now = Date.now();

    const storedStartedAt = Number(
      sessionStorage.getItem(
        LOBBY_SESSION_STARTED_KEY,
      ),
    );

    const isValidStoredTime =
      Number.isFinite(storedStartedAt) &&
      storedStartedAt > 0 &&
      storedStartedAt <= now &&
      now - storedStartedAt <
        LOBBY_SESSION_DURATION_MS;

    if (isValidStoredTime) {
      return storedStartedAt;
    }

    sessionStorage.setItem(
      LOBBY_SESSION_STARTED_KEY,
      String(now),
    );

    return now;
  }

  function getLoginPageUrl() {
    const configScript = Array.from(
      document.scripts,
    ).find((script) => {
      const source = String(
        script.getAttribute("src") || "",
      );

      return /(?:^|\/)app-config\.js(?:\?.*)?$/i.test(
        source,
      );
    });

    if (configScript?.src) {
      return new URL(
        "../pages/login.html",
        configScript.src,
      ).href;
    }

    return new URL(
      "./login.html",
      window.location.href,
    ).href;
  }

  function clearAuthStorage() {
    AUTH_STORAGE_KEYS.forEach((key) => {
      localStorage.removeItem(key);
    });
  }

  function decodeJwtPayload(token) {
    try {
      const tokenParts = String(token).split(".");

      if (tokenParts.length !== 3) {
        return null;
      }

      let payload = tokenParts[1]
        .replace(/-/g, "+")
        .replace(/_/g, "/");

      while (payload.length % 4 !== 0) {
        payload += "=";
      }

      return JSON.parse(window.atob(payload));
    } catch (error) {
      console.error(
        "Token decode error:",
        error,
      );

      return null;
    }
  }

  function getTokenExpirationTime(token) {
    const payload = decodeJwtPayload(token);

    const expiresAtSeconds = Number(
      payload?.exp,
    );

    if (
      !Number.isFinite(expiresAtSeconds) ||
      expiresAtSeconds <= 0
    ) {
      return 0;
    }

    return expiresAtSeconds * 1000;
  }

  function redirectToLogin() {
    if (isPublicAuthPage()) {
      return;
    }

    window.location.replace(
      getLoginPageUrl(),
    );
  }

  function logoutSession(
    showMessage = true,
  ) {
    if (logoutStarted) {
      return;
    }

    logoutStarted = true;

    if (logoutTimer) {
      window.clearTimeout(logoutTimer);
      logoutTimer = null;
    }

    activeToken = null;

       clearAuthStorage();
    clearLobbySession();

    if (
      showMessage &&
      !isPublicAuthPage()
    ) {
      window.alert(
        "আপনার login session শেষ হয়েছে। আবার login করুন।",
      );
    }

    redirectToLogin();
  }

    function startSessionTimer() {
    if (logoutTimer) {
      window.clearTimeout(
        logoutTimer,
      );

      logoutTimer = null;
    }

    logoutStarted = false;

    const token =
      localStorage.getItem(
        ACCESS_TOKEN_KEY,
      );

    activeToken = token;

    if (!token) {
      clearLobbySession();

      return;
    }

    /*
     * Game, room, wallet, profile ও admin
     * page-এ ৩০ মিনিটের timer চলবে না।
     */
    if (!isLobbyPage()) {
      clearLobbySession();

      console.log(
        "Lobby auto logout disabled on this page.",
      );

      return;
    }

    const tokenExpirationTime =
      getTokenExpirationTime(token);

    if (
      !tokenExpirationTime ||
      tokenExpirationTime <= Date.now()
    ) {
      logoutSession(false);

      return;
    }

    const lobbyStartedAt =
      getOrCreateLobbyStartedAt();

    const lobbyExpirationTime =
      lobbyStartedAt +
      LOBBY_SESSION_DURATION_MS;

    /*
     * Lobby timer অথবা server token—
     * যেটি আগে শেষ হবে সেটিই কার্যকর।
     */
    const expirationTime = Math.min(
      lobbyExpirationTime,
      tokenExpirationTime,
    );

    const remainingTime =
      expirationTime - Date.now();

    if (remainingTime <= 0) {
      logoutSession(true);

      return;
    }

    logoutTimer =
      window.setTimeout(() => {
        logoutSession(true);
      }, remainingTime);

    console.log(
      "Lobby session remaining:",
      Math.ceil(
        remainingTime / 1000,
      ),
      "seconds",
    );
  }

    function verifyCurrentSession() {
    const token =
      localStorage.getItem(
        ACCESS_TOKEN_KEY,
      );

    if (!token) {
      if (activeToken) {
        logoutSession(false);
      }

      return;
    }

    if (token !== activeToken) {
      startSessionTimer();

      return;
    }

    /*
     * Game page-এ focus/visibility change
     * হলেও auto logout check হবে না।
     */
    if (!isLobbyPage()) {
      return;
    }

    const tokenExpirationTime =
      getTokenExpirationTime(token);

    const lobbyStartedAt = Number(
      sessionStorage.getItem(
        LOBBY_SESSION_STARTED_KEY,
      ),
    );

    const lobbyExpirationTime =
      lobbyStartedAt +
      LOBBY_SESSION_DURATION_MS;

    const sessionExpired =
      !tokenExpirationTime ||
      tokenExpirationTime <= Date.now() ||
      !Number.isFinite(
        lobbyStartedAt,
      ) ||
      lobbyStartedAt <= 0 ||
      lobbyExpirationTime <= Date.now();

    if (sessionExpired) {
      logoutSession(true);
    }
  }


  window.addEventListener(
    "focus",
    verifyCurrentSession,
  );

  window.addEventListener(
    "pageshow",
    verifyCurrentSession,
  );

  document.addEventListener(
    "visibilitychange",
    () => {
      if (!document.hidden) {
        verifyCurrentSession();
      }
    },
  );

  window.addEventListener(
    "storage",
    (event) => {
      if (
        event.key !== ACCESS_TOKEN_KEY
      ) {
        return;
      }

      if (!event.newValue) {
        logoutSession(false);
        return;
      }

      startSessionTimer();
    },
  );

  window.AUTH_SESSION = Object.freeze({
    start: startSessionTimer,

    logout() {
      logoutSession(false);
    },

    getExpirationTime() {
      const token = localStorage.getItem(
        ACCESS_TOKEN_KEY,
      );

      return token
        ? getTokenExpirationTime(token)
        : 0;
    },
  });

  startSessionTimer();
})();