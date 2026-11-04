(function () {
  const page = document.querySelector(".click-history-page");
  if (!page) return;
  const rows = document.getElementById("history-rows");
  const status = document.getElementById("history-status");
  const pageLabel = document.getElementById("history-page");
  const previous = document.getElementById("history-previous");
  const next = document.getElementById("history-next");
  const uuid = page.dataset.linkUuid;
  const limit = 50;
  let offset = 0;
  let total = 0;
  const columns = ["created_at", "visitor_type", "country", "device", "browser", "os", "referrer", "utm_campaign"];
  const labels = { human: "Human", crawler: "Crawler" };

  function cell(value) {
    const td = document.createElement("td");
    td.textContent = value == null || value === "" ? "—" : String(value);
    return td;
  }

  function render(result) {
    rows.replaceChildren();
    if (!result.data || !result.data.length) {
      const tr = document.createElement("tr");
      const td = cell("No visits recorded yet.");
      td.colSpan = 8;
      tr.appendChild(td);
      rows.appendChild(tr);
    } else {
      result.data.forEach(item => {
        const tr = document.createElement("tr");
        columns.forEach(key => {
          let value = item[key];
          if (key === "created_at") {
            const date = new Date(value);
            value = Number.isNaN(date.getTime()) ? value : date.toLocaleString();
          }
          if (key === "visitor_type") value = labels[value] || value;
          tr.appendChild(cell(value));
        });
        rows.appendChild(tr);
      });
    }
    total = Number(result.total) || 0;
    const start = total ? offset + 1 : 0;
    const end = Math.min(offset + limit, total);
    status.textContent = `Showing ${start}–${end} of ${total.toLocaleString()} recorded visits`;
    pageLabel.textContent = `Page ${Math.floor(offset / limit) + 1}`;
    previous.disabled = offset === 0;
    next.disabled = offset + limit >= total;
  }

  async function load() {
    status.textContent = "Loading visits…";
    previous.disabled = true;
    next.disabled = true;
    try {
      const response = await fetch(
        "/api/links/" + encodeURIComponent(uuid) + "/click-history?limit=" + limit + "&offset=" + offset,
        { credentials: "same-origin", headers: { Accept: "application/json" } }
      );
      if (!response.ok) throw new Error("Could not load click history.");
      render(await response.json());
    } catch (error) {
      status.textContent = error.message;
      rows.replaceChildren();
    }
  }

  previous.addEventListener("click", function () {
    offset = Math.max(0, offset - limit);
    load();
  });
  next.addEventListener("click", function () {
    if (offset + limit < total) {
      offset += limit;
      load();
    }
  });
  load();
})();
