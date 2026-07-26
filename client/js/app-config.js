"use strict";

/* ==========================================
   PMS ADDA CENTRAL CONFIGURATION
========================================== */

(function initializeAppConfig() {
  const currentLocation =
    window.location;

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
   * Node server বা Cloudflare link দিয়ে খুললে
   * current HTTPS origin ব্যবহার হবে।
   */
  const serverUrl =
    isLocalFrontendServer
      ? "http://localhost:5000"
      : currentLocation.origin;

  const APP_CONFIG = {
    APP_NAME: "PMS ADDA",

    SERVER_URL:
      serverUrl.replace(/\/+$/, ""),

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
      const cleanPath =
        String(path).startsWith("/")
          ? String(path)
          : `/${path}`;

      return `${this.API_URL}${cleanPath}`;
    },

    server(path = "") {
      const cleanPath =
        String(path).startsWith("/")
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