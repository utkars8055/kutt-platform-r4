(function () {
  const status = document.getElementById("settings-status");
  const button = document.getElementById("save-ad-settings");
  if (!button) return;

  function setStatus(message, isError) {
    status.textContent = message;
    status.style.color = isError ? "#b91c1c" : "#15803d";
  }

  function readForm() {
    const adPlacements = {};
    document.querySelectorAll(".ad-config").forEach(card => {
      const format = card.dataset.format;
      const item = {
        enabled: card.querySelector(".enabled").checked,
        placement: card.querySelector(".placement")?.value || "middle",
        zone_id: card.querySelector(".zone-id")?.value || "",
        code: card.querySelector(".code")?.value || "",
        destination_url: card.querySelector(".destination-url")?.value || "",
        label: card.querySelector(".label")?.value || "",
      };
      adPlacements[format] = item;
    });
    return {
      countdownSeconds: document.getElementById("countdown-seconds").value.trim() === "" ? null : Number(document.getElementById("countdown-seconds").value),
      countdownMaxSeconds: document.getElementById("countdown-max-seconds").value.trim() === "" ? null : Number(document.getElementById("countdown-max-seconds").value),
      serviceSafetyMessage: document.getElementById("safety-message").value,
      adPlacements,
    };
  }

  function populate(settings) {
    document.getElementById("countdown-seconds").value = settings.countdownSeconds ?? 12;
    document.getElementById("countdown-max-seconds").value = settings.countdownMaxSeconds ?? 30;
    document.getElementById("countdown-seconds").max = settings.countdownMaxSeconds ?? 30;
    document.getElementById("safety-message").value = settings.serviceSafetyMessage || "Always check the destination before proceeding.";
    document.querySelectorAll(".ad-config").forEach(card => {
      const item = settings.adPlacements?.[card.dataset.format] || {};
      card.querySelector(".enabled").checked = !!item.enabled;
      if (card.querySelector(".placement")) card.querySelector(".placement").value = item.placement || "middle";
      if (card.querySelector(".zone-id")) card.querySelector(".zone-id").value = item.zone_id || "";
      if (card.querySelector(".code")) card.querySelector(".code").value = item.code || "";
      if (card.querySelector(".destination-url")) card.querySelector(".destination-url").value = item.destination_url || "";
      if (card.querySelector(".label")) card.querySelector(".label").value = item.label || "";
    });
  }

  fetch("/api/settings/ads", { credentials: "same-origin" })
    .then(response => { if (!response.ok) throw new Error("Could not load settings."); return response.json(); })
    .then(populate)
    .catch(error => setStatus(error.message, true));

  document.getElementById("countdown-max-seconds").addEventListener("change", function () {
    const max = Math.max(0, Math.min(30, Number(this.value) || 0));
    document.getElementById("countdown-seconds").max = String(max);
    if (Number(document.getElementById("countdown-seconds").value) > max) {
      document.getElementById("countdown-seconds").value = String(max);
    }
  });

  button.addEventListener("click", async function () {
    button.disabled = true;
    setStatus("Saving…", false);
    try {
      const response = await fetch("/api/settings/ads", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(readForm()),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save settings.");
      populate(result.settings);
      setStatus("Settings saved successfully.", false);
    } catch (error) {
      setStatus(error.message || "Could not save settings.", true);
    } finally {
      button.disabled = false;
    }
  });
})();
