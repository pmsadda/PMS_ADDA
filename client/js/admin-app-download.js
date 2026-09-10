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

          downloadHistorySearch:
      document.getElementById("downloadHistorySearch"),

    downloadHistorySearchButton:
      document.getElementById("downloadHistorySearchBtn"),

    downloadHistoryRefreshButton:
      document.getElementById("downloadHistoryRefreshBtn"),

    downloadHistoryBody:
      document.getElementById("downloadHistoryBody"),

    downloadHistoryPreviousButton:
      document.getElementById("downloadHistoryPreviousBtn"),

    downloadHistoryNextButton:
      document.getElementById("downloadHistoryNextBtn"),

    downloadHistoryPageInfo:
      document.getElementById("downloadHistoryPageInfo"),

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

          trafficUniqueVisitors:
      document.getElementById("trafficUniqueVisitors"),

    trafficTotalVisits:
      document.getElementById("trafficTotalVisits"),

    trafficTotalSessions:
      document.getElementById("trafficTotalSessions"),

    trafficTotalSignups:
      document.getElementById("trafficTotalSignups"),

    trafficTotalDownloads:
      document.getElementById("trafficTotalDownloads"),

    trafficSourceSummary:
      document.getElementById("trafficSourceSummary"),

    trafficSourceFilter:
      document.getElementById("trafficSourceFilter"),

    trafficHistorySearch:
      document.getElementById("trafficHistorySearch"),

    trafficHistorySearchButton:
      document.getElementById("trafficHistorySearchBtn"),

    trafficHistoryRefreshButton:
      document.getElementById("trafficHistoryRefreshBtn"),

    trafficHistoryBody:
      document.getElementById("trafficHistoryBody"),

    trafficPreviousButton:
      document.getElementById("trafficPreviousBtn"),

    trafficNextButton:
      document.getElementById("trafficNextBtn"),

    trafficPageInfo:
      document.getElementById("trafficPageInfo"),
  };


  let currentSettings = null;
  let toastTimer = null;
    const downloadHistoryState = {
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 1,
    search: "",
    loading: false,
  };

    const trafficHistoryState = {
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 1,
    source: "",
    search: "",
    loading: false
  };


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
     DOWNLOAD HISTORY
  ========================================================= */

  function getDeviceDetails(
    userAgent
  ) {
    const ua =
      String(
        userAgent || ""
      );

    if (!ua) {
      return {
        device: "Unknown device",
        browser: "Unknown browser"
      };
    }

    let device =
      "Desktop";

    if (/Android/i.test(ua)) {
      const modelMatch =
        ua.match(
          /Android[^;]*;\s*([^;)]+?)(?:\s+Build\/[^;)]+)?[;)]/i
        );

      const model =
        String(
          modelMatch?.[1] || ""
        )
          .replace(
            /\s+wv$/i,
            ""
          )
          .trim();

      device =
        model
          ? `Android — ${model}`
          : "Android";
    } else if (
      /iPhone/i.test(ua)
    ) {
      device = "iPhone";
    } else if (
      /iPad/i.test(ua)
    ) {
      device = "iPad";
    } else if (
      /Windows/i.test(ua)
    ) {
      device = "Windows PC";
    } else if (
      /Macintosh|Mac OS X/i.test(ua)
    ) {
      device = "Mac";
    } else if (
      /Linux/i.test(ua)
    ) {
      device = "Linux";
    }

    let browser =
      "Unknown browser";

    if (/Edg\//i.test(ua)) {
      browser = "Microsoft Edge";
    } else if (
      /SamsungBrowser\//i.test(ua)
    ) {
      browser = "Samsung Internet";
    } else if (
      /OPR\//i.test(ua)
    ) {
      browser = "Opera";
    } else if (
      /Chrome\//i.test(ua)
    ) {
      browser = "Google Chrome";
    } else if (
      /Firefox\//i.test(ua)
    ) {
      browser = "Mozilla Firefox";
    } else if (
      /Safari\//i.test(ua)
    ) {
      browser = "Safari";
    }

    return {
      device,
      browser
    };
  }


  function createHistoryCell(
    text
  ) {
    const cell =
      document.createElement(
        "td"
      );

    cell.textContent =
      text === null ||
      text === undefined ||
      text === ""
        ? "-"
        : String(text);

    return cell;
  }


  function renderDownloadHistory(
    items
  ) {
    if (
      !DOM.downloadHistoryBody
    ) {
      return;
    }

    DOM.downloadHistoryBody
      .replaceChildren();

    if (
      !Array.isArray(items) ||
      items.length === 0
    ) {
      const row =
        document.createElement(
          "tr"
        );

      const cell =
        document.createElement(
          "td"
        );

      cell.colSpan = 7;
      cell.className =
        "history-empty-cell";

      cell.textContent =
        "No download history found.";

      row.appendChild(cell);

      DOM.downloadHistoryBody
        .appendChild(row);

      return;
    }

    const fragment =
      document.createDocumentFragment();

    items.forEach((item) => {
      const row =
        document.createElement(
          "tr"
        );

      const userCell =
        document.createElement(
          "td"
        );

      const username =
        document.createElement(
          "span"
        );

      username.className =
        "history-user-name";

      username.textContent =
        item.username ||
        "Guest";

      const visitorType =
        document.createElement(
          "span"
        );

      visitorType.className =
        "history-user-type";

      visitorType.textContent =
        item.visitorType ===
        "user"
          ? `User ID: ${
              item.userId || "-"
            }`
          : "Guest download";

      userCell.append(
        username,
        visitorType
      );

      row.appendChild(
        userCell
      );

      row.appendChild(
        createHistoryCell(
          item.userUid
        )
      );

      row.appendChild(
        createHistoryCell(
          item.ipAddress
        )
      );

      const deviceInfo =
        getDeviceDetails(
          item.userAgent
        );

      const deviceCell =
        document.createElement(
          "td"
        );

      const deviceName =
        document.createElement(
          "span"
        );

      deviceName.className =
        "history-user-name";

      deviceName.textContent =
        deviceInfo.device;

      const browserName =
        document.createElement(
          "span"
        );

      browserName.className =
        "history-device-details";

      browserName.textContent =
        deviceInfo.browser;

      deviceCell.title =
        item.userAgent || "";

      deviceCell.append(
        deviceName,
        browserName
      );

      row.appendChild(
        deviceCell
      );

      row.appendChild(
        createHistoryCell(
          item.appVersion
        )
      );

      const statusCell =
        document.createElement(
          "td"
        );

      const status =
        [
          "started",
          "completed",
          "failed"
        ].includes(
          item.downloadStatus
        )
          ? item.downloadStatus
          : "failed";

      const statusBadge =
        document.createElement(
          "span"
        );

      statusBadge.className =
        `history-status ${status}`;

      statusBadge.textContent =
        status;

      statusCell.appendChild(
        statusBadge
      );

      row.appendChild(
        statusCell
      );

      row.appendChild(
        createHistoryCell(
          formatDate(
            item.downloadedAt
          )
        )
      );

      fragment.appendChild(
        row
      );
    });

    DOM.downloadHistoryBody
      .appendChild(fragment);
  }


  function renderHistoryPagination() {
    const currentPage =
      downloadHistoryState.page;

    const totalPages =
      downloadHistoryState.totalPages;

    if (
      DOM.downloadHistoryPageInfo
    ) {
      DOM.downloadHistoryPageInfo
        .textContent =
          `Page ${currentPage} of ${totalPages} • ${downloadHistoryState.total} records`;
    }

    if (
      DOM.downloadHistoryPreviousButton
    ) {
      DOM.downloadHistoryPreviousButton
        .disabled =
          downloadHistoryState.loading ||
          currentPage <= 1;
    }

    if (
      DOM.downloadHistoryNextButton
    ) {
      DOM.downloadHistoryNextButton
        .disabled =
          downloadHistoryState.loading ||
          currentPage >= totalPages;
    }
  }


  async function loadDownloadHistory(
    showError = true
  ) {
    if (
      downloadHistoryState.loading
    ) {
      return;
    }

    downloadHistoryState.loading =
      true;

    renderHistoryPagination();

    try {
      const query =
        new URLSearchParams({
          page:
            String(
              downloadHistoryState.page
            ),

          limit:
            String(
              downloadHistoryState.limit
            )
        });

      if (
        downloadHistoryState.search
      ) {
        query.set(
          "search",
          downloadHistoryState.search
        );
      }

      const result =
        await requestAPI(
          `/app-download/admin/history?${query.toString()}`
        );

      const history =
        Array.isArray(
          result?.data?.history
        )
          ? result.data.history
          : [];

      const pagination =
        result?.data?.pagination ||
        {};

      downloadHistoryState.page =
        Number(
          pagination.page || 1
        );

      downloadHistoryState.total =
        Number(
          pagination.total || 0
        );

      downloadHistoryState.totalPages =
        Math.max(
          1,
          Number(
            pagination.totalPages ||
            1
          )
        );

      renderDownloadHistory(
        history
      );
    } catch (error) {
      console.error(
        "LOAD DOWNLOAD HISTORY ERROR:",
        error
      );

      if (showError) {
        showToast(
          error.message ||
            "Download history load করা যায়নি.",
          "error"
        );
      }
    } finally {
      downloadHistoryState.loading =
        false;

      renderHistoryPagination();
    }
  }

    DOM.downloadHistorySearchButton
    ?.addEventListener(
      "click",
      () => {
        downloadHistoryState.search =
          String(
            DOM.downloadHistorySearch
              ?.value || ""
          ).trim();

        downloadHistoryState.page =
          1;

        loadDownloadHistory();
      }
    );


  DOM.downloadHistorySearch
    ?.addEventListener(
      "keydown",
      (event) => {
        if (
          event.key !== "Enter"
        ) {
          return;
        }

        event.preventDefault();

        downloadHistoryState.search =
          String(
            DOM.downloadHistorySearch
              ?.value || ""
          ).trim();

        downloadHistoryState.page =
          1;

        loadDownloadHistory();
      }
    );


  DOM.downloadHistoryRefreshButton
    ?.addEventListener(
      "click",
      () => {
        loadDownloadHistory();
      }
    );


  DOM.downloadHistoryPreviousButton
    ?.addEventListener(
      "click",
      () => {
        if (
          downloadHistoryState.page <= 1 ||
          downloadHistoryState.loading
        ) {
          return;
        }

        downloadHistoryState.page -=
          1;

        loadDownloadHistory();
      }
    );


  DOM.downloadHistoryNextButton
    ?.addEventListener(
      "click",
      () => {
        if (
          downloadHistoryState.page >=
            downloadHistoryState.totalPages ||
          downloadHistoryState.loading
        ) {
          return;
        }

        downloadHistoryState.page +=
          1;

        loadDownloadHistory();
      }
    );

      /* =========================================================
     MARKETING TRAFFIC HISTORY
  ========================================================= */

  function renderTrafficSummary(
    summary,
    sources
  ) {
    const values = {
      uniqueVisitors:
        Number(
          summary?.uniqueVisitors ||
          0
        ),

      totalVisits:
        Number(
          summary?.totalVisits ||
          0
        ),

      totalSessions:
        Number(
          summary?.totalSessions ||
          0
        ),

      totalSignups:
        Number(
          summary?.totalSignups ||
          0
        ),

      totalDownloads:
        Number(
          summary?.totalDownloads ||
          0
        )
    };

    if (
      DOM.trafficUniqueVisitors
    ) {
      DOM.trafficUniqueVisitors
        .textContent =
          values.uniqueVisitors
            .toLocaleString(
              "en-BD"
            );
    }

    if (
      DOM.trafficTotalVisits
    ) {
      DOM.trafficTotalVisits
        .textContent =
          values.totalVisits
            .toLocaleString(
              "en-BD"
            );
    }

    if (
      DOM.trafficTotalSessions
    ) {
      DOM.trafficTotalSessions
        .textContent =
          values.totalSessions
            .toLocaleString(
              "en-BD"
            );
    }

    if (
      DOM.trafficTotalSignups
    ) {
      DOM.trafficTotalSignups
        .textContent =
          values.totalSignups
            .toLocaleString(
              "en-BD"
            );
    }

    if (
      DOM.trafficTotalDownloads
    ) {
      DOM.trafficTotalDownloads
        .textContent =
          values.totalDownloads
            .toLocaleString(
              "en-BD"
            );
    }

    if (
      !DOM.trafficSourceSummary
    ) {
      return;
    }

    DOM.trafficSourceSummary
      .replaceChildren();

    const sourceList =
      Array.isArray(sources)
        ? sources
        : [];

    sourceList.forEach(
      (item) => {
        const chip =
          document.createElement(
            "span"
          );

        chip.className =
          "traffic-source-chip";

        const label =
          document.createElement(
            "span"
          );

        label.textContent =
          String(
            item.source ||
            "direct"
          );

        const count =
          document.createElement(
            "strong"
          );

        count.textContent =
          `${Number(
            item.uniqueVisitors ||
            0
          )} visitors • ${Number(
            item.totalSignups ||
            0
          )} signup • ${Number(
            item.totalDownloads ||
            0
          )} download`;

        chip.append(
          label,
          count
        );

        DOM.trafficSourceSummary
          .appendChild(chip);
      }
    );
  }


  function renderTrafficHistory(
    visits
  ) {
    if (
      !DOM.trafficHistoryBody
    ) {
      return;
    }

    DOM.trafficHistoryBody
      .replaceChildren();

    if (
      !Array.isArray(visits) ||
      visits.length === 0
    ) {
      const row =
        document.createElement(
          "tr"
        );

      const cell =
        document.createElement(
          "td"
        );

      cell.colSpan = 9;
      cell.className =
        "history-empty-cell";

      cell.textContent =
        "No marketing traffic found.";

      row.appendChild(cell);

      DOM.trafficHistoryBody
        .appendChild(row);

      return;
    }

    const fragment =
      document.createDocumentFragment();

    visits.forEach(
      (item) => {
        const row =
          document.createElement(
            "tr"
          );

        const sourceCell =
          document.createElement(
            "td"
          );

        const source =
          String(
            item.trafficSource ||
            "direct"
          )
            .toLowerCase();

        const sourceBadge =
          document.createElement(
            "span"
          );

        sourceBadge.className =
          `traffic-source-badge ${
            [
              "facebook",
              "tiktok",
              "direct"
            ].includes(source)
              ? source
              : ""
          }`;

        sourceBadge.textContent =
          source;

        sourceCell.appendChild(
          sourceBadge
        );

        row.appendChild(
          sourceCell
        );

        const campaignCell =
          document.createElement(
            "td"
          );

        const campaignName =
          document.createElement(
            "span"
          );

        campaignName.className =
          "history-user-name";

        campaignName.textContent =
          item.campaign ||
          "-";

        const contentName =
          document.createElement(
            "span"
          );

        contentName.className =
          "history-device-details";

        contentName.textContent =
          item.contentName ||
          item.trafficMedium ||
          "-";

        campaignCell.append(
          campaignName,
          contentName
        );

        row.appendChild(
          campaignCell
        );

        const userCell =
          document.createElement(
            "td"
          );

        const username =
          document.createElement(
            "span"
          );

        username.className =
          "history-user-name";

        username.textContent =
          item.username ||
          "Guest";

        const uid =
          document.createElement(
            "span"
          );

        uid.className =
          "history-user-type";

        uid.textContent =
          item.userUid ||
          "Not logged in";

        userCell.append(
          username,
          uid
        );

        row.appendChild(
          userCell
        );

        row.appendChild(
          createHistoryCell(
            item.ipAddress
          )
        );

        const deviceInfo =
          getDeviceDetails(
            item.userAgent
          );

        const deviceCell =
          document.createElement(
            "td"
          );

        const deviceName =
          document.createElement(
            "span"
          );

        deviceName.className =
          "history-user-name";

        deviceName.textContent =
          deviceInfo.device;

        const browserName =
          document.createElement(
            "span"
          );

        browserName.className =
          "history-device-details";

        browserName.textContent =
          deviceInfo.browser;

        deviceCell.append(
          deviceName,
          browserName
        );

        row.appendChild(
          deviceCell
        );

        row.appendChild(
          createHistoryCell(
            Number(
              item.visitCount ||
              0
            )
          )
        );

        const signupCell =
          document.createElement(
            "td"
          );

        signupCell.className =
          item.signupCompleted
            ? "traffic-conversion-yes"
            : "traffic-conversion-no";

        signupCell.textContent =
          item.signupCompleted
            ? "Yes"
            : "No";

        row.appendChild(
          signupCell
        );

        row.appendChild(
          createHistoryCell(
            Number(
              item.appDownloadCount ||
              0
            )
          )
        );

        row.appendChild(
          createHistoryCell(
            formatDate(
              item.lastVisitedAt
            )
          )
        );

        fragment.appendChild(
          row
        );
      }
    );

    DOM.trafficHistoryBody
      .appendChild(fragment);
  }


  function renderTrafficPagination() {
    if (
      DOM.trafficPageInfo
    ) {
      DOM.trafficPageInfo
        .textContent =
          `Page ${trafficHistoryState.page} of ${trafficHistoryState.totalPages} • ${trafficHistoryState.total} records`;
    }

    if (
      DOM.trafficPreviousButton
    ) {
      DOM.trafficPreviousButton
        .disabled =
          trafficHistoryState.loading ||
          trafficHistoryState.page <=
            1;
    }

    if (
      DOM.trafficNextButton
    ) {
      DOM.trafficNextButton
        .disabled =
          trafficHistoryState.loading ||
          trafficHistoryState.page >=
            trafficHistoryState.totalPages;
    }
  }


  async function loadTrafficHistory(
    showError = true
  ) {
    if (
      trafficHistoryState.loading
    ) {
      return;
    }

    trafficHistoryState.loading =
      true;

    renderTrafficPagination();

    try {
      const query =
        new URLSearchParams({
          page:
            String(
              trafficHistoryState.page
            ),

          limit:
            String(
              trafficHistoryState.limit
            )
        });

      if (
        trafficHistoryState.source
      ) {
        query.set(
          "source",
          trafficHistoryState.source
        );
      }

      if (
        trafficHistoryState.search
      ) {
        query.set(
          "search",
          trafficHistoryState.search
        );
      }

      const result =
        await requestAPI(
          `/marketing-traffic/admin/history?${query.toString()}`
        );

      const data =
        result?.data ||
        {};

      const pagination =
        data.pagination ||
        {};

      trafficHistoryState.page =
        Number(
          pagination.page ||
          1
        );

      trafficHistoryState.total =
        Number(
          pagination.total ||
          0
        );

      trafficHistoryState.totalPages =
        Math.max(
          1,
          Number(
            pagination.totalPages ||
            1
          )
        );

      renderTrafficSummary(
        data.summary,
        data.sources
      );

      renderTrafficHistory(
        data.visits
      );
    } catch (error) {
      console.error(
        "LOAD MARKETING TRAFFIC ERROR:",
        error
      );

      if (showError) {
        showToast(
          error.message ||
            "Marketing traffic load করা যায়নি.",
          "error"
        );
      }
    } finally {
      trafficHistoryState.loading =
        false;

      renderTrafficPagination();
    }
  }
    DOM.trafficSourceFilter
    ?.addEventListener(
      "change",
      () => {
        trafficHistoryState.source =
          String(
            DOM.trafficSourceFilter
              ?.value || ""
          ).trim();

        trafficHistoryState.page =
          1;

        loadTrafficHistory();
      }
    );


  DOM.trafficHistorySearchButton
    ?.addEventListener(
      "click",
      () => {
        trafficHistoryState.search =
          String(
            DOM.trafficHistorySearch
              ?.value || ""
          ).trim();

        trafficHistoryState.page =
          1;

        loadTrafficHistory();
      }
    );


  DOM.trafficHistorySearch
    ?.addEventListener(
      "keydown",
      (event) => {
        if (
          event.key !== "Enter"
        ) {
          return;
        }

        event.preventDefault();

        trafficHistoryState.search =
          String(
            DOM.trafficHistorySearch
              ?.value || ""
          ).trim();

        trafficHistoryState.page =
          1;

        loadTrafficHistory();
      }
    );


  DOM.trafficHistoryRefreshButton
    ?.addEventListener(
      "click",
      () => {
        loadTrafficHistory();
      }
    );


  DOM.trafficPreviousButton
    ?.addEventListener(
      "click",
      () => {
        if (
          trafficHistoryState.loading ||
          trafficHistoryState.page <= 1
        ) {
          return;
        }

        trafficHistoryState.page -=
          1;

        loadTrafficHistory();
      }
    );


  DOM.trafficNextButton
    ?.addEventListener(
      "click",
      () => {
        if (
          trafficHistoryState.loading ||
          trafficHistoryState.page >=
            trafficHistoryState.totalPages
        ) {
          return;
        }

        trafficHistoryState.page +=
          1;

        loadTrafficHistory();
      }
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

    await loadDownloadHistory(
      false
    );
        await loadTrafficHistory(
      false
    );
  }


  initialize();
});