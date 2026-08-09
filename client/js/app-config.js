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
  const ACCESS_TOKEN_KEY =
    "access_token";

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
  const MAX_SESSION_CHECK_MS =
    24 * 60 * 60 * 1000;

  let sessionTimer = null;
  let activeToken = null;
  let logoutStarted = false;

  function isPublicAuthPage() {
    const pathname =
      String(
        window.location.pathname,
      ).toLowerCase();

    return (
      pathname.endsWith(
        "/login.html",
      ) ||
      pathname.endsWith(
        "/register.html",
      )
    );
  }

  function getLoginPageUrl() {
    const configScript =
      Array.from(
        document.scripts,
      ).find((script) => {
        const source = String(
          script.getAttribute("src") ||
          "",
        );

        return (
          /(?:^|\/)app-config\.js(?:\?.*)?$/i
            .test(source)
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
    AUTH_STORAGE_KEYS.forEach(
      (key) => {
        localStorage.removeItem(key);
      },
    );

    /*
     * পুরোনো ৩০ মিনিটের Lobby session
     * record থাকলে সেটিও পরিষ্কার হবে।
     */
    sessionStorage.removeItem(
      "pms_lobby_session_started_at",
    );
  }

  function decodeJwtPayload(token) {
    try {
      const tokenParts =
        String(token).split(".");

      if (tokenParts.length !== 3) {
        return null;
      }

      let payload =
        tokenParts[1]
          .replace(/-/g, "+")
          .replace(/_/g, "/");

      while (
        payload.length % 4 !== 0
      ) {
        payload += "=";
      }

      return JSON.parse(
        window.atob(payload),
      );
    } catch (error) {
      console.error(
        "Token decode error:",
        error,
      );

      return null;
    }
  }

  function getTokenExpirationTime(
    token,
  ) {
    const payload =
      decodeJwtPayload(token);

    const expiresAtSeconds =
      Number(payload?.exp);

    if (
      !Number.isFinite(
        expiresAtSeconds,
      ) ||
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

  function clearSessionTimer() {
    if (!sessionTimer) {
      return;
    }

    window.clearTimeout(
      sessionTimer,
    );

    sessionTimer = null;
  }

  function logoutSession(
    showMessage = true,
  ) {
    if (logoutStarted) {
      return;
    }

    logoutStarted = true;

    clearSessionTimer();

    activeToken = null;

    clearAuthStorage();

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
    clearSessionTimer();

    logoutStarted = false;

    const token =
      localStorage.getItem(
        ACCESS_TOKEN_KEY,
      );

    activeToken = token;

    if (!token) {
      return;
    }

    const expirationTime =
      getTokenExpirationTime(token);

    const remainingTime =
      expirationTime - Date.now();

    if (
      !expirationTime ||
      remainingTime <= 0
    ) {
      logoutSession(false);

      return;
    }

    /*
     * Lobby, Wallet এবং Game—সব page-এ
     * শুধু JWT expiration কার্যকর হবে।
     * আলাদা ৩০ মিনিটের logout নেই।
     */
    const nextCheckDelay =
      Math.min(
        remainingTime,
        MAX_SESSION_CHECK_MS,
      );

    sessionTimer =
      window.setTimeout(
        startSessionTimer,
        nextCheckDelay,
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

    const expirationTime =
      getTokenExpirationTime(token);

    if (
      !expirationTime ||
      expirationTime <= Date.now()
    ) {
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

  window.AUTH_SESSION =
    Object.freeze({
       start:
        startSessionTimer,

            async logout() {
        try {
          await notifyServerLogout();
        } finally {
          logoutSession(false);
        }
      },

      getExpirationTime() {
        const token =
          localStorage.getItem(
            ACCESS_TOKEN_KEY,
          );

        return token
          ? getTokenExpirationTime(
              token,
            )
          : 0;
      },
    });

      async function notifyServerLogout() {
    const token =
      localStorage.getItem(
        ACCESS_TOKEN_KEY,
      );

    if (
      !token ||
      !window.APP_CONFIG
    ) {
      return;
    }

    const abortController =
      new AbortController();

    const abortTimer =
      window.setTimeout(
        () => {
          abortController.abort();
        },
        3000,
      );

    try {
      await fetch(
        window.APP_CONFIG.api(
          "/auth/logout",
        ),
        {
          method: "POST",

          headers: {
            Authorization:
              `Bearer ${token}`,
          },

          signal:
            abortController.signal,
        },
      );
    } catch (error) {
      /*
       * Network সমস্যা হলেও local logout
       * অবশ্যই সম্পন্ন হবে।
       */
      console.warn(
        "Server logout request failed:",
        error?.message || error,
      );
    } finally {
      window.clearTimeout(
        abortTimer,
      );
    }
  }

  startSessionTimer();
})();