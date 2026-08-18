"use strict";

(() => {
  const configuredApiOrigin =
    String(
      window.AGENT_API_ORIGIN ||
      window.location.origin
    ).replace(/\/+$/, "");

  const AGENT_CONFIG = {
    SERVER_URL:
      configuredApiOrigin,

    api(path = "") {
      const cleanPath =
        String(path)
          .startsWith("/")
          ? String(path)
          : `/${path}`;

      return (
        `${this.SERVER_URL}` +
        `/api${cleanPath}`
      );
    }
  };

  Object.freeze(
    AGENT_CONFIG
  );

  window.APP_CONFIG =
    AGENT_CONFIG;
})();