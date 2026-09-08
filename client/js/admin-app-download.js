"use strict";

document.addEventListener("DOMContentLoaded", () => {
  /* =========================================================
     AUTH
  ========================================================= */

  const token =
    localStorage.getItem("access_token") ||
    localStorage.getItem("token") ||
    "";

  const LOGIN_PAGE =
    "../pages/login.html";


  /* =========================================================
     DOM
  ========================================================= */

  const DOM = {
    statusBadge:
      document.getElementById("appStatusBadge"),

    currentVersion:
      document.getElementById("currentVersion"),

    currentApkSize:
      document.getElementById("currentApkSize"),

    totalDownloads:
      document.getElementById("totalDownloads"),

    lastUploadedAt:
      document.getElementById("lastUploadedAt"),

    appName:
      document.getElementById("appName"),

    apkFileName:
      document.getElementById("apkFileName"),

    appVersion:
      document.getElementById("appVersion"),

    appAvailability:
      document.getElementById("appAvailability"),

    appVersionInput:
      document.getElementById("appVersionInput"),

    apkFileInput:
      document.getElementById("apkFileInput"),

    selectedApkName:
      document.getElementById("selectedApkName"),

    selectedApkSize:
      document.getElementById("selectedApkSize"),

    uploadForm:
      document.getElementById("apkUploadForm"),

    uploadButton:
      document.getElementById("uploadApkBtn"),

    progressContainer:
      document.getElementById("uploadProgressContainer"),

    progressBar:
      document.getElementById("uploadProgressBar"),

    progressText:
      document.getElementById("uploadProgressText"),

    downloadEnabled:
      document.getElementById("downloadEnabledInput"),

    saveSettingsButton:
      document.getElementById("saveDownloadSettingsBtn"),

    testDownloadButton:
      document.getElementById("testDownloadBtn"),

    backDashboardButton:
      document.getElementById("backDashboardBtn"),

    loader:
      document.getElementById("adminAppLoader"),

    toast:
      document.getElementById("adminAppToast"),

    toastIcon:
      document.getElementById("adminAppToastIcon"),

    toastMessage:
      document.getElementById("adminAppToastMessage"),
  };


  let currentSettings = null;
  let toastTimer = null;


  /* =========================================================
     BASIC HELPERS
  ========================================================= */

  function redirectToLogin() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("token");
    localStorage.removeItem("current_user");

    window.location.replace(
      LOGIN_PAGE,
    );
  }


  function showLoader() {
    if (DOM.loader) {
      DOM.loader.style.display =
        "flex";
    }
  }


  function hideLoader() {
    if (DOM.loader) {
      DOM.loader.style.display =
        "none";
    }
  }


  function showToast(
    message,
    type = "info",
  ) {
    if (
      !DOM.toast ||
      !DOM.toastMessage
    ) {
      console.log(message);
      return;
    }

    window.clearTimeout(
      toastTimer,
    );

    DOM.toast.hidden = false;

    DOM.toast.classList.remove(
      "success",
      "error",
    );

    if (
      type === "success" ||
      type === "error"
    ) {
      DOM.toast.classList.add(
        type,
      );
    }

    DOM.toastMessage.textContent =
      String(message || "");


    if (DOM.toastIcon) {
      if (type === "success") {
        DOM.toastIcon.className =
          "fa-solid fa-circle-check";
      } else if (
        type === "error"
      ) {
        DOM.toastIcon.className =
          "fa-solid fa-circle-exclamation";
      } else {
        DOM.toastIcon.className =
          "fa-solid fa-circle-info";
      }
    }


    toastTimer =
      window.setTimeout(() => {
        DOM.toast.hidden = true;
      }, 3000);
  }


  function formatFileSize(
    bytes,
  ) {
    const size =
      Number(bytes || 0);

    if (
      !Number.isFinite(size) ||
      size <= 0
    ) {
      return "-";
    }

    if (
      size >=
      1024 * 1024 * 1024
    ) {
      return (
        size /
        (1024 * 1024 * 1024)
      ).toFixed(2) + " GB";
    }

    if (
      size >=
      1024 * 1024
    ) {
      return (
        size /
        (1024 * 1024)
      ).toFixed(2) + " MB";
    }

    if (size >= 1024) {
      return (
        size /
        1024
      ).toFixed(2) + " KB";
    }

    return `${size} Bytes`;
  }


  function formatDate(
    value,
  ) {
    if (!value) {
      return "-";
    }

    const date =
      new Date(value);

    if (
      Number.isNaN(
        date.getTime(),
      )
    ) {
      return "-";
    }

    return date.toLocaleString(
      "en-BD",
      {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      },
    );
  }


  /* =========================================================
     API REQUEST
  ========================================================= */

  async function requestAPI(
    path,
    options = {},
  ) {
    const headers = {
      Accept:
        "application/json",

      Authorization:
        `Bearer ${token}`,

      ...(options.headers || {}),
    };


    if (
      options.body &&
      !(options.body instanceof FormData)
    ) {
      headers["Content-Type"] =
        "application/json";
    }


    const response =
      await fetch(
        window.APP_CONFIG.api(
          path,
        ),
        {
          ...options,
          headers,
          cache:
            "no-store",
        },
      );


    let result = null;

    try {
      result =
        await response.json();
    } catch (_error) {
      result = null;
    }


    if (
      response.status === 401
    ) {
      redirectToLogin();

      throw new Error(
        "Login session expired.",
      );
    }


    if (
      response.status === 403
    ) {
      throw new Error(
        result?.message ||
        "Admin access required.",
      );
    }


    if (!response.ok) {
      const error =
        new Error(
          result?.message ||
          "Request failed.",
        );

      error.statusCode =
        response.status;

      error.code =
        result?.code ||
        "APP_ADMIN_ERROR";

      throw error;
    }


    return result;
  }


  /* =========================================================
     SETTINGS NORMALIZATION
  ========================================================= */

  function extractSettings(
    result,
  ) {
    return (
      result?.data?.settings ||
      result?.settings ||
      null
    );
  }


  /* =========================================================
     RENDER
  ========================================================= */

  function renderSettings(
    settings,
  ) {
    currentSettings =
      settings || {};


    const hasApk =
      Boolean(
        currentSettings.hasApk,
      );


    const enabled =
      Boolean(
        currentSettings.downloadEnabled,
      );


    if (DOM.currentVersion) {
      DOM.currentVersion.textContent =
        currentSettings.appVersion ||
        "Not uploaded";
    }


    if (DOM.currentApkSize) {
      DOM.currentApkSize.textContent =
        formatFileSize(
          currentSettings.apkSize,
        );
    }


    if (DOM.totalDownloads) {
      DOM.totalDownloads.textContent =
        Number(
          currentSettings.downloadCount ||
          0,
        ).toLocaleString(
          "en-BD",
        );
    }


    if (DOM.lastUploadedAt) {
      DOM.lastUploadedAt.textContent =
        formatDate(
          currentSettings.uploadedAt,
        );
    }


    if (DOM.appName) {
      DOM.appName.textContent =
        currentSettings.appName ||
        "TPL22";
    }


    if (DOM.apkFileName) {
      DOM.apkFileName.textContent =
        currentSettings.apkFileName ||
        "No APK uploaded";
    }


    if (DOM.appVersion) {
      DOM.appVersion.textContent =
        currentSettings.appVersion ||
        "-";
    }


    if (DOM.appAvailability) {
      if (
        enabled &&
        hasApk
      ) {
        DOM.appAvailability.textContent =
          "Available for download";
      } else if (
        !hasApk
      ) {
        DOM.appAvailability.textContent =
          "APK not uploaded";
      } else {
        DOM.appAvailability.textContent =
          "Download disabled";
      }
    }


    if (DOM.downloadEnabled) {
      DOM.downloadEnabled.checked =
        enabled;
    }


    if (DOM.statusBadge) {
      DOM.statusBadge.classList.remove(
        "is-active",
        "is-disabled",
      );


      if (
        enabled &&
        hasApk
      ) {
        DOM.statusBadge.textContent =
          "DOWNLOAD ACTIVE";

        DOM.statusBadge.classList.add(
          "is-active",
        );
      } else {
        DOM.statusBadge.textContent =
          hasApk
            ? "DOWNLOAD DISABLED"
            : "NO APK";

        DOM.statusBadge.classList.add(
          "is-disabled",
        );
      }
    }


    if (
      DOM.testDownloadButton
    ) {
      DOM.testDownloadButton.disabled =
        !enabled ||
        !hasApk;
    }
  }


  /* =========================================================
     LOAD ADMIN SETTINGS
  ========================================================= */

  async function loadSettings(
    showFullLoader = true,
  ) {
    if (showFullLoader) {
      showLoader();
    }

    try {
      const result =
        await requestAPI(
          "/app-download/admin/settings",
        );

      renderSettings(
        extractSettings(result),
      );

    } catch (error) {
      console.error(
        "APP SETTINGS LOAD ERROR:",
        error,
      );

      showToast(
        error.message ||
        "App settings load failed.",
        "error",
      );

    } finally {
      hideLoader();
    }
  }


  /* =========================================================
     APK FILE SELECTION
  ========================================================= */

  DOM.apkFileInput
    ?.addEventListener(
      "change",
      () => {
        const file =
          DOM.apkFileInput
            ?.files?.[0];

        if (!file) {
          DOM.selectedApkName.textContent =
            "Choose APK File";

          DOM.selectedApkSize.textContent =
            "Maximum file size: 100 MB";

          return;
        }


        if (
          !file.name
            .toLowerCase()
            .endsWith(".apk")
        ) {
          DOM.apkFileInput.value =
            "";

          showToast(
            "Only APK files are allowed.",
            "error",
          );

          return;
        }


        const maxSize =
          100 *
          1024 *
          1024;


        if (
          file.size >
          maxSize
        ) {
          DOM.apkFileInput.value =
            "";

          showToast(
            "APK cannot exceed 100 MB.",
            "error",
          );

          return;
        }


        DOM.selectedApkName.textContent =
          file.name;

        DOM.selectedApkSize.textContent =
          formatFileSize(
            file.size,
          );
      },
    );


  /* =========================================================
     RESET PROGRESS
  ========================================================= */

  function resetUploadProgress() {
    if (
      DOM.progressContainer
    ) {
      DOM.progressContainer.hidden =
        true;
    }

    if (DOM.progressBar) {
      DOM.progressBar.style.width =
        "0%";
    }

    if (DOM.progressText) {
      DOM.progressText.textContent =
        "0%";
    }
  }


  /* =========================================================
     UPLOAD USING XHR
     Gives actual upload progress
  ========================================================= */

  function uploadApkWithProgress(
    formData,
  ) {
    return new Promise(
      (
        resolve,
        reject,
      ) => {
        const xhr =
          new XMLHttpRequest();


        xhr.open(
          "POST",
          window.APP_CONFIG.api(
            "/app-download/admin/upload",
          ),
          true,
        );


        xhr.setRequestHeader(
          "Authorization",
          `Bearer ${token}`,
        );


        xhr.setRequestHeader(
          "Accept",
          "application/json",
        );


        xhr.upload
          .addEventListener(
            "progress",
            (event) => {
              if (
                !event.lengthComputable
              ) {
                return;
              }

              const percent =
                Math.min(
                  100,
                  Math.round(
                    (
                      event.loaded /
                      event.total
                    ) *
                    100,
                  ),
                );


              if (
                DOM.progressContainer
              ) {
                DOM.progressContainer.hidden =
                  false;
              }


              if (
                DOM.progressBar
              ) {
                DOM.progressBar.style.width =
                  `${percent}%`;
              }


              if (
                DOM.progressText
              ) {
                DOM.progressText.textContent =
                  `${percent}%`;
              }
            },
          );


        xhr.addEventListener(
          "load",
          () => {
            let result = null;

            try {
              result =
                JSON.parse(
                  xhr.responseText ||
                  "{}",
                );
            } catch (_error) {
              result = null;
            }


            if (
              xhr.status === 401
            ) {
              redirectToLogin();

              reject(
                new Error(
                  "Login session expired.",
                ),
              );

              return;
            }


            if (
              xhr.status >= 200 &&
              xhr.status < 300
            ) {
              resolve(result);

              return;
            }


            const error =
              new Error(
                result?.message ||
                "APK upload failed.",
              );

            error.statusCode =
              xhr.status;

            reject(error);
          },
        );


        xhr.addEventListener(
          "error",
          () => {
            reject(
              new Error(
                "Network error during APK upload.",
              ),
            );
          },
        );


        xhr.addEventListener(
          "abort",
          () => {
            reject(
              new Error(
                "APK upload cancelled.",
              ),
            );
          },
        );


        xhr.send(
          formData,
        );
      },
    );
  }


  /* =========================================================
     UPLOAD FORM
  ========================================================= */

  DOM.uploadForm
    ?.addEventListener(
      "submit",
      async (event) => {
        event.preventDefault();


        const version =
          String(
            DOM.appVersionInput
              ?.value ||
            "",
          ).trim();


        const file =
          DOM.apkFileInput
            ?.files?.[0];


        if (!version) {
          showToast(
            "App version লিখুন.",
            "error",
          );

          DOM.appVersionInput
            ?.focus();

          return;
        }


        if (!file) {
          showToast(
            "APK file select করুন.",
            "error",
          );

          return;
        }


        const formData =
          new FormData();

        formData.append(
          "appVersion",
          version,
        );

        formData.append(
          "apk",
          file,
        );


        if (DOM.uploadButton) {
          DOM.uploadButton.disabled =
            true;

          DOM.uploadButton.innerHTML =
            `
              <i class="fa-solid fa-spinner fa-spin"></i>
              Uploading...
            `;
        }


        resetUploadProgress();

        if (
          DOM.progressContainer
        ) {
          DOM.progressContainer.hidden =
            false;
        }


        try {
          const result =
            await uploadApkWithProgress(
              formData,
            );


          const settings =
            extractSettings(
              result,
            );


          if (settings) {
            renderSettings(
              settings,
            );
          } else {
            await loadSettings(
              false,
            );
          }


          DOM.appVersionInput.value =
            "";

          DOM.apkFileInput.value =
            "";

          DOM.selectedApkName.textContent =
            "Choose APK File";

          DOM.selectedApkSize.textContent =
            "Maximum file size: 100 MB";


          if (
            DOM.progressBar
          ) {
            DOM.progressBar.style.width =
              "100%";
          }


          if (
            DOM.progressText
          ) {
            DOM.progressText.textContent =
              "100%";
          }


          showToast(
            "APK uploaded successfully.",
            "success",
          );


        } catch (error) {
          console.error(
            "APK UPLOAD ERROR:",
            error,
          );

          showToast(
            error.message ||
            "APK upload failed.",
            "error",
          );


        } finally {
          if (
            DOM.uploadButton
          ) {
            DOM.uploadButton.disabled =
              false;

            DOM.uploadButton.innerHTML =
              `
                <i class="fa-solid fa-cloud-arrow-up"></i>
                Upload New Version
              `;
          }
        }
      },
    );


  /* =========================================================
     ENABLE / DISABLE
  ========================================================= */

  DOM.saveSettingsButton
    ?.addEventListener(
      "click",
      async () => {
        DOM.saveSettingsButton.disabled =
          true;

        try {
          const result =
            await requestAPI(
              "/app-download/admin/settings",
              {
                method: "PUT",

                body: JSON.stringify({
                  downloadEnabled:
                    Boolean(
                      DOM.downloadEnabled
                        ?.checked,
                    ),
                }),
              },
            );


          const settings =
            extractSettings(
              result,
            );


          renderSettings(
            settings,
          );


          showToast(
            settings
              ?.downloadEnabled
              ? "App download enabled."
              : "App download disabled.",
            "success",
          );


        } catch (error) {
          console.error(
            "APP SETTINGS SAVE ERROR:",
            error,
          );

          showToast(
            error.message ||
            "Settings save failed.",
            "error",
          );


          if (
            currentSettings
          ) {
            renderSettings(
              currentSettings,
            );
          }


        } finally {
          DOM.saveSettingsButton.disabled =
            false;
        }
      },
    );


  /* =========================================================
     TEST DOWNLOAD
  ========================================================= */

  DOM.testDownloadButton
    ?.addEventListener(
      "click",
      () => {
        if (
          !currentSettings
            ?.hasApk
        ) {
          showToast(
            "APK এখনো upload করা হয়নি.",
            "error",
          );

          return;
        }


        if (
          !currentSettings
            ?.downloadEnabled
        ) {
          showToast(
            "App download বর্তমানে disabled.",
            "error",
          );

          return;
        }


        const link =
          document.createElement(
            "a",
          );

        link.href =
          window.APP_CONFIG.api(
            "/app-download/download",
          );

        link.download =
          currentSettings
            .apkFileName ||
          "TPL22.apk";

        document.body
          .appendChild(link);

        link.click();

        link.remove();


        window.setTimeout(
          () => {
            loadSettings(
              false,
            );
          },
          1500,
        );
      },
    );


  /* =========================================================
     BACK
  ========================================================= */

  DOM.backDashboardButton
    ?.addEventListener(
      "click",
      () => {
        window.location.href =
          "./dashboard.html";
      },
    );


  /* =========================================================
     INITIALIZE
  ========================================================= */

  async function initialize() {
    if (!window.APP_CONFIG) {
      hideLoader();

      showToast(
        "APP_CONFIG পাওয়া যায়নি.",
        "error",
      );

      return;
    }


    if (!token) {
      redirectToLogin();
      return;
    }


    resetUploadProgress();

    await loadSettings(
      true,
    );
  }


  initialize();
});