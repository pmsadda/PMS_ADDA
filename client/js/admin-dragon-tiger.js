"use strict";

(() => {
  const $ = id => document.getElementById(id);
  const money = value => `৳${Number(value || 0).toFixed(2)}`;

  async function api(path, options = {}) {
    const token =
      localStorage.getItem("access_token") ||
      localStorage.getItem("token") ||
      sessionStorage.getItem("access_token");

    if (!token) {
      location.href = "/login";
      throw new Error("Login প্রয়োজন।");
    }

    const response = await fetch(`/api/admin/dragon-tiger${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      }
    });

    const result = await response.json();

    if (response.status === 401) location.href = "/login";

    if (!response.ok || !result.success) {
      throw new Error(result.message || "Admin request failed.");
    }

    return result.data;
  }

  function render(settings) {
    $("dtEnabled").checked = settings.isEnabled;
    $("dtMaintenance").checked = settings.maintenanceMode;
    $("dtMin").value = settings.minBet;
    $("dtMax").value = settings.maxBet;
    $("dtPayout").value = settings.maxPayoutPerRound;
  }

  $("dtSettings").addEventListener("submit", async event => {
    event.preventDefault();
    $("dtSave").disabled = true;

    try {
      const settings = await api("/settings", {
        method: "PATCH",
        body: JSON.stringify({
          isEnabled: $("dtEnabled").checked,
          maintenanceMode: $("dtMaintenance").checked,
          minBet: $("dtMin").value,
          maxBet: $("dtMax").value,
          maxPayoutPerRound: $("dtPayout").value
        })
      });

      render(settings);
      $("dtAdminMessage").textContent = "Settings saved.";
    } catch (error) {
      $("dtAdminMessage").textContent = error.message;
    } finally {
      $("dtSave").disabled = false;
    }
  });

  async function initialize() {
    try {
      const settings = await api("/settings");
      render(settings);
      $("dtSave").disabled = false;
      $("dtAdminMessage").textContent = "Ready.";

      const report = await api("/report");

      $("dtReport").textContent =
        `Hands: ${report.rounds} · Bet: ${money(report.totalBet)} · ` +
        `Return: ${money(report.totalPayout)} · Admin result: ${money(report.adminResult)}`;
    } catch (error) {
      $("dtAdminMessage").textContent = error.message;
    }
  }

  initialize();
})();