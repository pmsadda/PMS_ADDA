"use strict";

/* ==========================================
   TPL22 CENTRAL CONFIGURATION
========================================== */

(function initializeAppConfig() {
  const currentLocation = window.location;

  const localHosts = new Set(["localhost", "127.0.0.1"]);

  const isLocalFrontendServer =
    localHosts.has(currentLocation.hostname) && currentLocation.port !== "5000";

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
    APP_NAME: "TPL22",

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

  console.log("TPL22 server:", APP_CONFIG.SERVER_URL);
})();

/* ==========================================
   SECURE LOGIN SESSION MANAGER
========================================== */

(function initializeAuthSession() {
  const ACCESS_TOKEN_KEY = "access_token";

  const AUTH_STORAGE_KEYS = [
    "access_token",
    "token",
    "refresh_token",
    "current_user",
    "user",
    "user_id",
  ];

  /*
   * দীর্ঘ JWT session হলে browser-এর
   * setTimeout limit সমস্যা এড়াতে
   * সর্বোচ্চ ২৪ ঘণ্টা পরপর যাচাই হবে।
   */
  const MAX_SESSION_CHECK_MS = 24 * 60 * 60 * 1000;

  let sessionTimer = null;
  let activeToken = null;
  let logoutStarted = false;

  function isPublicAuthPage() {
    const pathname =
      String(window.location.pathname || "/")
        .toLowerCase()
        .replace(/\/+$/, "") || "/";

    return (
      pathname === "/" ||
      pathname === "/lobby" ||
      pathname === "/login" ||
      pathname === "/register" ||
      pathname.endsWith("/login.html") ||
      pathname.endsWith("/register.html")
    );
  }

  function getLoginPageUrl() {
    return `${window.location.origin}/login`;
  }

  function clearAuthStorage() {
    AUTH_STORAGE_KEYS.forEach((key) => {
      localStorage.removeItem(key);
    });

    /*
     * পুরোনো ৩০ মিনিটের Lobby session
     * record থাকলে সেটিও পরিষ্কার হবে।
     */
    sessionStorage.removeItem("pms_lobby_session_started_at");
  }

  function decodeJwtPayload(token) {
    try {
      const tokenParts = String(token).split(".");

      if (tokenParts.length !== 3) {
        return null;
      }

      let payload = tokenParts[1].replace(/-/g, "+").replace(/_/g, "/");

      while (payload.length % 4 !== 0) {
        payload += "=";
      }

      return JSON.parse(window.atob(payload));
    } catch (error) {
      console.error("Token decode error:", error);

      return null;
    }
  }

  function getTokenExpirationTime(token) {
    const payload = decodeJwtPayload(token);

    const expiresAtSeconds = Number(payload?.exp);

    if (!Number.isFinite(expiresAtSeconds) || expiresAtSeconds <= 0) {
      return 0;
    }

    return expiresAtSeconds * 1000;
  }

  function redirectToLogin() {
    if (isPublicAuthPage()) {
      return;
    }

    window.location.replace(getLoginPageUrl());
  }

  function clearSessionTimer() {
    if (!sessionTimer) {
      return;
    }

    window.clearTimeout(sessionTimer);

    sessionTimer = null;
  }

  function logoutSession(showMessage = true) {
    if (logoutStarted) {
      return;
    }

    logoutStarted = true;

    clearSessionTimer();

    activeToken = null;

    clearAuthStorage();

    if (showMessage && !isPublicAuthPage()) {
      window.alert("আপনার login session শেষ হয়েছে। আবার login করুন।");
    }

    redirectToLogin();
  }

  function startSessionTimer() {
    clearSessionTimer();

    logoutStarted = false;

    const token = localStorage.getItem(ACCESS_TOKEN_KEY);

    activeToken = token;

    if (!token) {
      return;
    }

    const expirationTime = getTokenExpirationTime(token);

    const remainingTime = expirationTime - Date.now();

    if (!expirationTime || remainingTime <= 0) {
      logoutSession(false);

      return;
    }

    /*
     * Lobby, Wallet এবং Game—সব page-এ
     * শুধু JWT expiration কার্যকর হবে।
     * আলাদা ৩০ মিনিটের logout নেই।
     */
    const nextCheckDelay = Math.min(remainingTime, MAX_SESSION_CHECK_MS);

    sessionTimer = window.setTimeout(startSessionTimer, nextCheckDelay);
  }

  function verifyCurrentSession() {
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);

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

    const expirationTime = getTokenExpirationTime(token);

    if (!expirationTime || expirationTime <= Date.now()) {
      logoutSession(true);
    }
  }

  window.addEventListener("focus", verifyCurrentSession);

  window.addEventListener("pageshow", verifyCurrentSession);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      verifyCurrentSession();
    }
  });

  window.addEventListener("storage", (event) => {
    if (event.key !== ACCESS_TOKEN_KEY) {
      return;
    }

    if (!event.newValue) {
      logoutSession(false);

      return;
    }

    startSessionTimer();
  });

  window.AUTH_SESSION = Object.freeze({
    start: startSessionTimer,

    async logout() {
      if (logoutStarted) {
        return;
      }

      logoutStarted = true;

      clearSessionTimer();

      try {
        await notifyServerLogout();
      } finally {
        activeToken = null;

        clearAuthStorage();

        window.location.replace("/lobby");
      }
    },

    getExpirationTime() {
      const token = localStorage.getItem(ACCESS_TOKEN_KEY);

      return token ? getTokenExpirationTime(token) : 0;
    },
  });

  async function notifyServerLogout() {
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);

    if (!token || !window.APP_CONFIG) {
      return;
    }

    const abortController = new AbortController();

    const abortTimer = window.setTimeout(() => {
      abortController.abort();
    }, 3000);

    try {
      await fetch(window.APP_CONFIG.api("/auth/logout"), {
        method: "POST",

        headers: {
          Authorization: `Bearer ${token}`,
        },

        signal: abortController.signal,
      });
    } catch (error) {
      /*
       * Network সমস্যা হলেও local logout
       * অবশ্যই সম্পন্ন হবে।
       */
      console.warn("Server logout request failed:", error?.message || error);
    } finally {
      window.clearTimeout(abortTimer);
    }
  }

  startSessionTimer();

})();

/* ==========================================
   MARKETING TRAFFIC TRACKER
========================================== */

(function initializeMarketingTrafficTracker() {
  const VISITOR_ID_KEY =
    "tpl22_visitor_id";

  const SESSION_ID_KEY =
    "tpl22_marketing_session_id";

  const ATTRIBUTION_KEY =
    "tpl22_marketing_attribution";

  function createTrackingId() {
    if (
      window.crypto &&
      typeof window.crypto
        .randomUUID === "function"
    ) {
      return window.crypto
        .randomUUID();
    }

    return (
      Date.now()
        .toString(36) +
      "_" +
      Math.random()
        .toString(36)
        .slice(2) +
      Math.random()
        .toString(36)
        .slice(2)
    );
  }

  function getOrCreateId(
    storage,
    key
  ) {
    let value =
      String(
        storage.getItem(key) ||
        ""
      ).trim();

    if (
      !/^[a-zA-Z0-9_-]{16,64}$/.test(
        value
      )
    ) {
      value =
        createTrackingId();

      storage.setItem(
        key,
        value
      );
    }

    return value;
  }

  function getStoredAttribution() {
    try {
      return JSON.parse(
        localStorage.getItem(
          ATTRIBUTION_KEY
        ) ||
        "null"
      );
    } catch (error) {
      return null;
    }
  }

  function detectReferrerSource(
    referrer
  ) {
    const value =
      String(
        referrer || ""
      ).toLowerCase();

    if (
      value.includes(
        "tiktok"
      )
    ) {
      return "tiktok";
    }

    if (
      value.includes(
        "facebook"
      ) ||
      value.includes(
        "fb.com"
      ) ||
      value.includes(
        "instagram"
      )
    ) {
      return "facebook";
    }

    if (value) {
      return "referral";
    }

    return "direct";
  }

  function isTrackablePage() {
    const path =
      String(
        window.location
          .pathname ||
        "/"
      )
        .toLowerCase()
        .replace(
          /\/+$/,
          ""
        ) ||
      "/";

    return (
      path === "/" ||
      path === "/lobby" ||
      path === "/login" ||
      path === "/register" ||
      path === "/install" ||
      path.endsWith(
        "/lobby.html"
      ) ||
      path.endsWith(
        "/login.html"
      ) ||
      path.endsWith(
        "/register.html"
      )
    );
  }

  if (
    !window.APP_CONFIG ||
    !isTrackablePage()
  ) {
    return;
  }

  const visitorId =
    getOrCreateId(
      localStorage,
      VISITOR_ID_KEY
    );

  const sessionId =
    getOrCreateId(
      sessionStorage,
      SESSION_ID_KEY
    );

  window.TPL22_VISITOR_ID =
    visitorId;

  document.cookie =
    `tpl22_visitor_id=${encodeURIComponent(
      visitorId
    )}; Max-Age=15552000; Path=/; SameSite=Lax; Secure`;

  const query =
    new URLSearchParams(
      window.location.search
    );

  const hasCampaignData =
    Boolean(
      query.get("utm_source") ||
      query.get("utm_medium") ||
      query.get("utm_campaign") ||
      query.get("utm_content") ||
      query.get("utm_term")
    );

  let attribution =
    getStoredAttribution();

  if (
    hasCampaignData ||
    !attribution
  ) {
    attribution = {
      trafficSource:
        query.get(
          "utm_source"
        ) ||
        detectReferrerSource(
          document.referrer
        ),

      trafficMedium:
        query.get(
          "utm_medium"
        ) ||
        null,

      campaign:
        query.get(
          "utm_campaign"
        ) ||
        null,

      contentName:
        query.get(
          "utm_content"
        ) ||
        null,

      termName:
        query.get(
          "utm_term"
        ) ||
        null,

      savedAt:
        Date.now()
    };

    localStorage.setItem(
      ATTRIBUTION_KEY,
      JSON.stringify(
        attribution
      )
    );
  }

  fetch(
    window.APP_CONFIG.api(
      "/marketing-traffic/visit"
    ),
    {
      method:
        "POST",

      headers: {
        Accept:
          "application/json",

        "Content-Type":
          "application/json"
      },

      body:
        JSON.stringify({
          visitorId,
          sessionId,

          trafficSource:
            attribution
              ?.trafficSource ||
            "direct",

          trafficMedium:
            attribution
              ?.trafficMedium ||
            null,

          campaign:
            attribution
              ?.campaign ||
            null,

          contentName:
            attribution
              ?.contentName ||
            null,

          termName:
            attribution
              ?.termName ||
            null,

          landingUrl:
            window.location
              .href,

          referrerUrl:
            document.referrer ||
            null
        }),

      cache:
        "no-store",

      keepalive:
        true
    }
  ).catch((error) => {
    console.warn(
      "Traffic tracking request failed:",
      error?.message ||
      error
    );
  });
})();
(function initializeUserActivityHeartbeat() {
  const HEARTBEAT_INTERVAL_MS =
    60 * 1000;

  let heartbeatTimer =
    null;

  let requestRunning =
    false;

  function getAccessToken() {
    return (
      localStorage.getItem(
        "access_token"
      ) ||
      localStorage.getItem(
        "token"
      ) ||
      ""
    );
  }

  async function sendHeartbeat() {
    const token =
      getAccessToken();

    if (
      !token ||
      !window.APP_CONFIG ||
      requestRunning ||
      document.visibilityState ===
        "hidden"
    ) {
      return;
    }

    requestRunning =
      true;

    const controller =
      new AbortController();

    const timeout =
      window.setTimeout(
        () => {
          controller.abort();
        },
        8000
      );

    try {
      await fetch(
        window.APP_CONFIG.api(
          "/auth/heartbeat"
        ),
        {
          method:
            "POST",

                    headers: {
            Accept:
              "application/json",

            Authorization:
              `Bearer ${token}`,

            "X-Visitor-ID":
              localStorage.getItem(
                "tpl22_visitor_id"
              ) ||
              ""
          },

          cache:
            "no-store",

          signal:
            controller.signal
        }
      );
    } catch (error) {
      /*
       * Temporary network failure হলে
       * পরের interval-এ আবার চেষ্টা হবে।
       */
    } finally {
      window.clearTimeout(
        timeout
      );

      requestRunning =
        false;
    }
  }

  function startHeartbeat() {
    if (heartbeatTimer) {
      window.clearInterval(
        heartbeatTimer
      );
    }

    sendHeartbeat();

    heartbeatTimer =
      window.setInterval(
        sendHeartbeat,
        HEARTBEAT_INTERVAL_MS
      );
  }

  document.addEventListener(
    "visibilitychange",
    () => {
      if (
        document.visibilityState ===
        "visible"
      ) {
        sendHeartbeat();
      }
    }
  );

  window.addEventListener(
    "online",
    sendHeartbeat
  );

  window.addEventListener(
    "pageshow",
    sendHeartbeat
  );

  startHeartbeat();
})();
