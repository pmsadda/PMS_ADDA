"use strict";

const CACHE_VERSION = "tpl22-app-v3";

const STATIC_FILES = [
  "/manifest.webmanifest",
  "/assets/icons/icon-192.png",
  "/assets/icons/icon-512.png",
  "/assets/logo/logo.png"
];

/* =========================
   INSTALL
========================= */

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(STATIC_FILES))
      .then(() => self.skipWaiting())
  );
});

/* =========================
   ACTIVATE
========================= */

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((cacheName) => {
              return (
                cacheName.startsWith("tpl22-app-") &&
                cacheName !== CACHE_VERSION
              );
            })
            .map((cacheName) => caches.delete(cacheName))
        );
      })
      .then(() => self.clients.claim())
  );
});

/* =========================
   FETCH
========================= */

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(request.url);

  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  /*
   * API, login session এবং user data cache হবে না।
   */
  if (
    requestUrl.pathname.startsWith("/api/") ||
    requestUrl.pathname.startsWith("/socket.io/")
  ) {
    return;
  }

  /*
   * সব page/navigation সরাসরি server থেকে আসবে।
   */
  if (request.mode === "navigate") {
    event.respondWith(fetch(request));
    return;
  }

  /*
   * Static asset: cache আগে, না থাকলে network।
   */
  if (
    requestUrl.pathname.startsWith("/assets/") ||
    requestUrl.pathname.startsWith("/css/") ||
    requestUrl.pathname.startsWith("/js/") ||
    requestUrl.pathname === "/manifest.webmanifest"
  ) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(request).then((networkResponse) => {
          if (!networkResponse || !networkResponse.ok) {
            return networkResponse;
          }

          const responseCopy = networkResponse.clone();

          caches.open(CACHE_VERSION).then((cache) => {
            cache.put(request, responseCopy);
          });

          return networkResponse;
        });
      })
    );
  }
});