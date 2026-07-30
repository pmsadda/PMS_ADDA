"use strict";

(() => {
  const MOBILE_MAX_SIZE = 950;

  const state = {
    locking: false,
    locked: false,
    interactionBound: false
  };

  function isMobileGameDevice() {
    const shortestScreenSide =
      Math.min(
        Number(
          window.screen?.width ||
          window.innerWidth
        ),
        Number(
          window.screen?.height ||
          window.innerHeight
        )
      );

    const coarsePointer =
      window.matchMedia?.(
        "(pointer: coarse)"
      ).matches === true;

    return (
      coarsePointer &&
      shortestScreenSide <=
        MOBILE_MAX_SIZE
    );
  }

  function isLandscape() {
    const orientationType =
      window.screen?.orientation
        ?.type || "";

    return (
      orientationType.startsWith(
        "landscape"
      ) ||
      window.innerWidth >
        window.innerHeight
    );
  }

  function supportsOrientationLock() {
    return (
      window.screen?.orientation &&
      typeof window.screen.orientation
        .lock === "function"
    );
  }

  async function requestGameFullscreen() {
    if (
      document.fullscreenElement ||
      document.webkitFullscreenElement
    ) {
      return true;
    }

    const root =
      document.documentElement;

    try {
      if (
        typeof root.requestFullscreen ===
        "function"
      ) {
        await root.requestFullscreen({
          navigationUI: "hide"
        });

        return true;
      }

      if (
        typeof root.webkitRequestFullscreen ===
        "function"
      ) {
        root.webkitRequestFullscreen();

        return true;
      }
    } catch (error) {
      console.info(
        "Game fullscreen permission was not granted.",
        error
      );
    }

    return false;
  }

  function markOrientationState(
    value
  ) {
    document.documentElement.dataset
      .gameOrientation = value;
  }

  async function lockGameLandscape({
    requestFullscreen = false
  } = {}) {
    if (
      state.locking ||
      !isMobileGameDevice()
    ) {
      return state.locked;
    }

    if (!supportsOrientationLock()) {
      markOrientationState(
        "manual"
      );

      return false;
    }

    state.locking = true;

    try {
      if (requestFullscreen) {
        await requestGameFullscreen();
      }

      await window.screen.orientation
        .lock("landscape");

      state.locked = true;

      markOrientationState(
        "locked"
      );

      removeInteractionRetry();

      window.dispatchEvent(
        new CustomEvent(
          "gameorientationlocked"
        )
      );

      return true;
    } catch (error) {
      state.locked = false;

      markOrientationState(
        "waiting"
      );

      console.info(
        "Landscape lock is waiting for a user interaction.",
        error
      );

      return false;
    } finally {
      state.locking = false;
    }
  }

  async function handleGameInteraction() {
    if (
      state.locked ||
      !isMobileGameDevice()
    ) {
      return;
    }

    await lockGameLandscape({
      requestFullscreen: true
    });
  }

  function bindInteractionRetry() {
    if (
      state.interactionBound ||
      !isMobileGameDevice()
    ) {
      return;
    }

    state.interactionBound = true;

    document.addEventListener(
      "pointerdown",
      handleGameInteraction,
      {
        capture: true,
        passive: true
      }
    );

    document.addEventListener(
      "touchend",
      handleGameInteraction,
      {
        capture: true,
        passive: true
      }
    );
  }

  function removeInteractionRetry() {
    if (!state.interactionBound) {
      return;
    }

    state.interactionBound = false;

    document.removeEventListener(
      "pointerdown",
      handleGameInteraction,
      true
    );

    document.removeEventListener(
      "touchend",
      handleGameInteraction,
      true
    );
  }

  async function initializeGameOrientation() {
    if (!isMobileGameDevice()) {
      markOrientationState(
        "desktop"
      );

      return;
    }

    markOrientationState(
      isLandscape()
        ? "landscape"
        : "waiting"
    );

    bindInteractionRetry();

    /*
     * Installed PWA অথবা permission পাওয়া
     * browser-এ page load থেকেই কাজ করতে পারে।
     */
    await lockGameLandscape({
      requestFullscreen: false
    });
  }

  window.addEventListener(
    "orientationchange",
    () => {
      window.setTimeout(
        () => {
          if (
            !isLandscape() &&
            !state.locked
          ) {
            bindInteractionRetry();

            lockGameLandscape({
              requestFullscreen: false
            });
          }
        },
        250
      );
    }
  );

  document.addEventListener(
    "visibilitychange",
    () => {
      if (
        document.visibilityState ===
          "visible" &&
        isMobileGameDevice() &&
        !isLandscape()
      ) {
        state.locked = false;

        bindInteractionRetry();

        lockGameLandscape({
          requestFullscreen: false
        });
      }
    }
  );

  window.addEventListener(
    "pagehide",
    () => {
      removeInteractionRetry();

      if (
        state.locked &&
        typeof window.screen
          ?.orientation?.unlock ===
          "function"
      ) {
        window.screen.orientation
          .unlock();
      }

      state.locked = false;
    }
  );

  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      initializeGameOrientation,
      {
        once: true
      }
    );
  } else {
    initializeGameOrientation();
  }

  window.PMS_GAME_ORIENTATION =
    Object.freeze({
      lockLandscape:
        () =>
          lockGameLandscape({
            requestFullscreen: true
          }),

      isLandscape
    });
})();