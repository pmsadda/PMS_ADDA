"use strict";

document.addEventListener("DOMContentLoaded", () => {
  /* =====================================================
       CONFIGURATION
    ===================================================== */

  const STORAGE_KEYS = {
    attribution: "tpl22_freeplay_attribution",

    installed: "tpl22_freeplay_installed",

    events: "tpl22_freeplay_events",
  };

  /*
   * Free-play lobby তৈরি হলে এটি "/lobby" করা হবে।
   * আপাতত installed app একই landing page খুলবে।
   */
  const PLAY_URL = "/";

  /* =====================================================
       DOM
    ===================================================== */

  const DOM = {
    installButton: document.getElementById("installAppBtn"),

    bottomInstallButton: document.getElementById("bottomInstallBtn"),

    installButtonText: document.getElementById("installButtonText"),

    installButtonHint: document.getElementById("installButtonHint"),

    installHelpText: document.getElementById("installHelpText"),

    installModal: document.getElementById("installModal"),

    closeInstallModalButton: document.getElementById("closeInstallModalBtn"),

    confirmInstallButton: document.getElementById("confirmInstallBtn"),

    installProgress: document.getElementById("installProgress"),

    installDialogMessage: document.getElementById("installDialogMessage"),

    guideModal: document.getElementById("installGuideModal"),

    closeGuideButton: document.getElementById("closeInstallGuideBtn"),

    closeGuideActionButton: document.getElementById("closeGuideActionBtn"),

    currentYear: document.getElementById("currentYear"),
  };

  /* =====================================================
       STATE
    ===================================================== */

  let deferredInstallPrompt = null;

  let installInProgress = false;

  /* =====================================================
       BASIC HELPERS
    ===================================================== */

  function isStandaloneMode() {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true
    );
  }

  function isIOSDevice() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent);
  }

  function isInAppBrowser() {
    const userAgent = String(navigator.userAgent || "").toLowerCase();

    return (
      userAgent.includes("fban") ||
      userAgent.includes("fbav") ||
      userAgent.includes("instagram") ||
      userAgent.includes("tiktok") ||
      userAgent.includes("musical_ly")
    );
  }

  function openModal(modal) {
    if (!modal) {
      return;
    }

    modal.hidden = false;

    document.body.style.overflow = "hidden";
  }

  function closeModal(modal) {
    if (!modal) {
      return;
    }

    modal.hidden = true;

    const anotherModalOpen = [DOM.installModal, DOM.guideModal].some((item) => {
      return item && item.hidden === false;
    });

    if (!anotherModalOpen) {
      document.body.style.overflow = "";
    }
  }

  function openPlayPage() {
    window.location.href = PLAY_URL;
  }

  /* =====================================================
       LOCAL ANALYTICS
    ===================================================== */

  function recordLocalEvent(eventName, extraData = {}) {
    try {
      const existingEvents = JSON.parse(
        localStorage.getItem(STORAGE_KEYS.events) || "[]",
      );

      const events = Array.isArray(existingEvents) ? existingEvents : [];

      events.push({
        event: String(eventName),

        recordedAt: new Date().toISOString(),

        ...extraData,
      });

      /*
       * Browser storage বড় না হওয়ার জন্য
       * সর্বশেষ 100টি event রাখা হবে।
       */

      localStorage.setItem(
        STORAGE_KEYS.events,
        JSON.stringify(events.slice(-100)),
      );
    } catch (error) {
      console.warn("Local event tracking failed:", error);
    }
  }

  /* =====================================================
       UTM ATTRIBUTION
    ===================================================== */

  function saveMarketingAttribution() {
    const query = new URLSearchParams(window.location.search);

    const campaignKeys = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_content",
      "utm_term",
    ];

    const hasCampaignData = campaignKeys.some((key) => {
      return Boolean(query.get(key));
    });

    if (!hasCampaignData) {
      return;
    }

    const attribution = {
      source: query.get("utm_source"),

      medium: query.get("utm_medium"),

      campaign: query.get("utm_campaign"),

      content: query.get("utm_content"),

      term: query.get("utm_term"),

      landingUrl: window.location.href,

      referrer: document.referrer || null,

      firstCapturedAt: new Date().toISOString(),
    };

    localStorage.setItem(STORAGE_KEYS.attribution, JSON.stringify(attribution));

    recordLocalEvent("landing_visit", {
      source: attribution.source,

      campaign: attribution.campaign,

      content: attribution.content,
    });
  }

  /* =====================================================
       BUTTON STATE
    ===================================================== */

  function setInstalledState() {
    if (DOM.installButtonText) {
      DOM.installButtonText.textContent = "Play Now";
    }

    if (DOM.installButtonHint) {
      DOM.installButtonHint.textContent = "TPL22 Social Games খুলুন";
    }

    if (DOM.bottomInstallButton) {
      DOM.bottomInstallButton.textContent = "Play Now";
    }

    if (DOM.installHelpText) {
      DOM.installHelpText.textContent = "Appটি এই device-এ installed আছে";
    }
  }

  function setReadyToInstallState() {
    if (DOM.installButtonText) {
      DOM.installButtonText.textContent = "Install Free App";
    }

    if (DOM.installButtonHint) {
      DOM.installButtonHint.textContent = "দ্রুত ও নিরাপদ installation";
    }
  }

  function appIsInstalled() {
    return (
      isStandaloneMode() || localStorage.getItem(STORAGE_KEYS.installed) === "1"
    );
  }

  /* =====================================================
       INSTALL MODAL
    ===================================================== */

  function showInstallFlow() {
    if (appIsInstalled()) {
      recordLocalEvent("play_button_clicked");

      openPlayPage();

      return;
    }

    recordLocalEvent("install_button_clicked", {
      promptAvailable: Boolean(deferredInstallPrompt),

      inAppBrowser: isInAppBrowser(),
    });

    /*
     * Facebook/TikTok-এর internal browser
     * installation prompt support না করলে
     * Chrome instruction দেখানো হবে।
     */

    if (isInAppBrowser() && !deferredInstallPrompt) {
      openModal(DOM.guideModal);

      return;
    }

    openModal(DOM.installModal);
  }

  function resetInstallModal() {
    installInProgress = false;

    if (DOM.confirmInstallButton) {
      DOM.confirmInstallButton.disabled = false;

      DOM.confirmInstallButton.textContent = "Install Free App";
    }

    if (DOM.installProgress) {
      DOM.installProgress.hidden = true;
    }

    if (DOM.installDialogMessage) {
      DOM.installDialogMessage.textContent =
        "Browser-এর নিরাপদ installation prompt ব্যবহার করে appটি আপনার ফোনে যোগ হবে।";
    }
  }

  async function requestInstallation() {
    if (installInProgress) {
      return;
    }

    /*
     * beforeinstallprompt পাওয়া না গেলে
     * browser-specific নির্দেশনা দেখানো হবে।
     */

    if (!deferredInstallPrompt) {
      closeModal(DOM.installModal);

      openModal(DOM.guideModal);

      recordLocalEvent("install_prompt_unavailable", {
        ios: isIOSDevice(),

        inAppBrowser: isInAppBrowser(),
      });

      return;
    }

    installInProgress = true;

    DOM.confirmInstallButton.disabled = true;

    DOM.confirmInstallButton.textContent = "Please wait...";

    DOM.installProgress.hidden = false;

    DOM.installDialogMessage.textContent =
      "নিচে আসা browser Install button চাপুন।";

    try {
      deferredInstallPrompt.prompt();

      const choice = await deferredInstallPrompt.userChoice;

      recordLocalEvent("install_prompt_result", {
        outcome: choice.outcome,
      });

      deferredInstallPrompt = null;

      if (choice.outcome === "accepted") {
        DOM.installDialogMessage.textContent =
          "Installation চলছে। সম্পন্ন হলে Play Now দেখাবে।";

        DOM.confirmInstallButton.textContent = "Installing...";
      } else {
        resetInstallModal();

        DOM.installDialogMessage.textContent =
          "Installation বাতিল হয়েছে। চাইলে আবার চেষ্টা করুন।";
      }
    } catch (error) {
      console.error("PWA INSTALL ERROR:", error);

      resetInstallModal();

      DOM.installDialogMessage.textContent =
        "Installation শুরু করা যায়নি। Chrome browser দিয়ে আবার চেষ্টা করুন।";

      recordLocalEvent("install_prompt_error", {
        message: String(error.message || "Unknown error"),
      });
    }
  }

  /* =====================================================
       BROWSER INSTALL EVENTS
    ===================================================== */

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();

    deferredInstallPrompt = event;

    setReadyToInstallState();

    recordLocalEvent("install_prompt_ready");
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;

    localStorage.setItem(STORAGE_KEYS.installed, "1");

    closeModal(DOM.installModal);

    resetInstallModal();

    setInstalledState();

    recordLocalEvent("app_installed");
  });

  /* =====================================================
       SERVICE WORKER
    ===================================================== */

  async function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) {
      console.warn("Service Worker is not supported.");

      return;
    }

    /*
     * HTTPS অথবা localhost-এ Service Worker চলবে।
     */

    try {
      const registration = await navigator.serviceWorker.register(
        "/service-worker.js",
        {
          scope: "/",
        },
      );

      console.log("PWA SERVICE WORKER READY:", registration.scope);
    } catch (error) {
      console.error("SERVICE WORKER REGISTRATION ERROR:", error);
    }
  }

  /* =====================================================
       EVENT LISTENERS
    ===================================================== */

  DOM.installButton?.addEventListener("click", showInstallFlow);

  DOM.bottomInstallButton?.addEventListener("click", showInstallFlow);

  DOM.confirmInstallButton?.addEventListener("click", requestInstallation);

  DOM.closeInstallModalButton?.addEventListener("click", () => {
    closeModal(DOM.installModal);

    resetInstallModal();
  });

  DOM.closeGuideButton?.addEventListener("click", () => {
    closeModal(DOM.guideModal);
  });

  DOM.closeGuideActionButton?.addEventListener("click", () => {
    closeModal(DOM.guideModal);
  });

  document.querySelectorAll("[data-close-install-modal]").forEach((element) => {
    element.addEventListener("click", () => {
      closeModal(DOM.installModal);

      resetInstallModal();
    });
  });

  document.querySelectorAll("[data-close-install-guide]").forEach((element) => {
    element.addEventListener("click", () => {
      closeModal(DOM.guideModal);
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }

    closeModal(DOM.installModal);

    closeModal(DOM.guideModal);

    resetInstallModal();
  });

  /* =====================================================
       INITIALIZE
    ===================================================== */

  if (DOM.currentYear) {
    DOM.currentYear.textContent = String(new Date().getFullYear());
  }

  saveMarketingAttribution();

  if (appIsInstalled()) {
    setInstalledState();
  }

  registerServiceWorker();
});
