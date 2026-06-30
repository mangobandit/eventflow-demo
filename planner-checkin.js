(() => {
  "use strict";

  const COPY_MESSAGE = "Hi, quick wedding check-in for Matt & Cara - please confirm your household here so we can finalise numbers, transport and food: [link]";
  const VENUES = [
    ["spain", "Spain", "Finca Mesa Jardin"],
    ["south_africa", "South Africa", "Mission House"]
  ];
  const FILTERS = [
    ["needs_checkin", "Still to check in"],
    ["attending", "Still attending"],
    ["pending", "No response / TBC"],
    ["declined", "Can't make it"],
    ["all", "All guests"]
  ];

  let installed = false;
  let activeFilter = "needs_checkin";
  let originalRenderAll = null;
  let originalSwitchView = null;

  function waitForPlanner() {
    if (typeof state === "undefined" || typeof renderAll !== "function" || !state.session || !document.querySelector(".planner-nav")) {
      window.setTimeout(waitForPlanner, 250);
      return;
    }
    install();
  }

  function install() {
    if (installed) return;
    installed = true;
    addStyles();
    addNav();
    addPanel();
    patchCoreRendering();
    bind();
    if (state.view === "checkin" || location.hash === "#checkin") switchView("checkin", false);
    render();
  }

  function patchCoreRendering() {
    if (!originalRenderAll && typeof renderAll === "function") {
      originalRenderAll = renderAll;
      renderAll = function patchedRenderAll() {
        originalRenderAll();
        render();
      };
    }

    if (!originalSwitchView && typeof switchView === "function") {
      originalSwitchView = switchView;
      switchView = function patchedSwitchView(view, rerender = true) {
        if (view === "checkin") {
          switchToCheckin(rerender);
          return;
        }
        originalSwitchView(view, rerender);
      };
    }
  }

  function addStyles() {
    if (document.getElementById("checkin-style")) return;
    const style = document.createElement("style");
    style.id = "checkin-style";
    style.textContent = `
      .checkin-kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;margin-bottom:14px}.checkin-kpi{padding:16px;border:1px solid var(--line);border-radius:var(--radius);background:rgba(255,255,255,.74);box-shadow:var(--shadow-sm)}.checkin-kpi span{display:block;color:var(--ink-soft);font-size:8px;font-weight:850;letter-spacing:.11em;text-transform:uppercase}.checkin-kpi b{display:block;margin-top:12px;font-family:var(--serif);font-size:31px;font-weight:500;line-height:1}.checkin-kpi small{display:block;margin-top:8px;color:var(--ink-soft);font-size:9px;line-height:1.4}.checkin-grid{display:grid;grid-template-columns:1.2fr .8fr;gap:14px;margin-bottom:14px}.checkin-venue-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.checkin-venue-block{padding:15px;border:1px solid var(--line);border-radius:14px;background:#fffefa}.checkin-venue-block h4{margin:0;font-family:var(--serif);font-size:24px;font-weight:500}.checkin-venue-block p{margin:5px 0 14px;color:var(--ink-soft);font-size:10px}.checkin-meter{height:8px;overflow:hidden;border-radius:999px;background:#eee5d8}.checkin-meter i{display:block;height:100%;background:var(--olive);border-radius:inherit}.checkin-stat-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}.checkin-stat{padding:10px;border:1px solid rgba(48,54,44,.11);border-radius:10px;background:rgba(255,255,255,.64)}.checkin-stat span{display:block;color:var(--ink-soft);font-size:7px;font-weight:850;letter-spacing:.1em;text-transform:uppercase}.checkin-stat b{display:block;margin-top:5px;font-size:17px}.checkin-copy textarea{width:100%;min-height:112px;border:1px solid var(--line);border-radius:12px;padding:12px;background:#fff;font-size:12px;line-height:1.5}.checkin-copy button{margin-top:10px}.checkin-attention{display:grid;gap:8px;margin-top:14px}.guest-list-tracker{overflow:hidden}.guest-list-tracker .panel-head{align-items:flex-start;gap:14px}.checkin-filters{display:flex;flex-wrap:wrap;gap:7px;justify-content:flex-end}.checkin-filter{min-height:30px;padding:0 10px;border:1px solid var(--line);border-radius:999px;background:transparent;cursor:pointer;color:var(--ink);font-size:8px;font-weight:850;letter-spacing:.07em;text-transform:uppercase}.checkin-filter.active{color:#fff;background:var(--olive-dark);border-color:var(--olive-dark)}.checkin-list-section{padding:0 18px 18px}.checkin-list-section h4{margin:4px 0 10px;color:var(--ink-soft);font-size:8px;font-weight:850;letter-spacing:.13em;text-transform:uppercase}.checkin-list{display:grid;gap:8px}.checkin-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;padding:13px;border:1px solid var(--line);border-radius:12px;background:#fffefa;cursor:pointer;transition:transform .16s ease,box-shadow .16s ease}.checkin-row:hover{transform:translateY(-1px);box-shadow:var(--shadow-sm)}.checkin-row b{display:block;font-family:var(--serif);font-size:18px;font-weight:500}.checkin-row small{display:block;margin-top:4px;color:var(--ink-soft);font-size:9px;line-height:1.5}.checkin-row-states{display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end}.checkin-pill{display:inline-flex;min-height:24px;align-items:center;padding:0 8px;border-radius:999px;font-size:7px;font-weight:850;letter-spacing:.08em;text-transform:uppercase}.checkin-pill.good{color:#376047;background:#e0eee5}.checkin-pill.warn{color:#815d28;background:#f6ecd6}.checkin-pill.bad{color:#8b493e;background:#f7e5e1}.checkin-pill.muted{color:#5e6658;background:#edf0e9}@media(max-width:1180px){.checkin-kpis{grid-template-columns:repeat(3,1fr)}.checkin-grid,.checkin-venue-grid{grid-template-columns:1fr}}@media(max-width:720px){.checkin-kpis{grid-template-columns:repeat(2,1fr)}.guest-list-tracker .panel-head,.checkin-row{grid-template-columns:1fr}.checkin-filters,.checkin-row-states{justify-content:flex-start}}`;
    document.head.appendChild(style);
  }

  function addNav() {
    const nav = document.querySelector(".planner-nav");
    if (!nav || nav.querySelector('[data-view="checkin"]')) return;
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.view = "checkin";
    button.innerHTML = "<span>&#9675;</span>Guest Check-In";
    const guests = nav.querySelector('[data-view="guests"]');
    if (guests) guests.insertAdjacentElement("afterend", button);
    else nav.appendChild(button);
  }

  function addPanel() {
    const content = document.querySelector(".planner-content");
    if (!content || content.querySelector('[data-view-panel="checkin"]')) return;
    const panel = document.createElement("section");
    panel.className = "planner-view";
    panel.dataset.viewPanel = "checkin";
    panel.innerHTML = `
      <div class="view-intro">
        <div><p class="eyebrow">Private head count</p><h2>Guest Check-In.</h2><p>Use this as the day-before / 24-hour confirmation view for final head count, transport and food planning.</p></div>
        <div class="view-tools"><button class="primary-action" id="copy-checkin-message" type="button">Copy check-in message</button></div>
      </div>
      <div id="checkin-root" class="guest-list-tracker"></div>`;
    content.appendChild(panel);
  }

  function bind() {
    document.querySelector('[data-view="checkin"]')?.addEventListener("click", () => switchView("checkin"));
    document.getElementById("copy-checkin-message")?.addEventListener("click", copyMessage);
  }

  function switchToCheckin(rerender = true) {
    state.view = "checkin";
    if (history.replaceState) history.replaceState(null, "", "#checkin");
    document.querySelectorAll("[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === "checkin"));
    document.querySelectorAll("[data-view-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.viewPanel === "checkin"));
    els.topbarTitle.textContent = "Guest Check-In";
    els.topbarSubtitle.textContent = "Private guest tracker - Spain and South Africa";
    document.getElementById("global-add").textContent = "+ Add guest";
    document.body.classList.remove("sidebar-open");
    if (rerender && originalRenderAll) originalRenderAll();
    render();
  }

  function render() {
    const root = document.getElementById("checkin-root");
    if (!root) return;
    const guests = state.data.guests || [];
    const counts = summarize(guests);
    const visibleRows = guests.filter(matchesActiveFilter).sort(sortGuests);
    const attention = guests.filter((guest) => guestNeedsCheckIn(guest)).sort(sortGuests).slice(0, 8);

    root.innerHTML = `
      <div class="checkin-kpis">
        ${kpi("Total invited", counts.total, "secure guest rows")}
        ${kpi("Still attending", counts.attending, "RSVP yes or checked in")}
        ${kpi("Can't make it", counts.declined, "declined or updated")}
        ${kpi("Need RSVP/check-in", counts.pending, "no response or TBC")}
        ${kpi("Check-ins received", counts.confirmed, "24h confirmations")}
        ${kpi("Still to check in", counts.stillToCheckIn, "action list")}
      </div>
      <div class="checkin-grid">
        <article class="panel">
          <div class="panel-head"><h3>Guests by venue</h3><button type="button" data-jump="guests">Open guests</button></div>
          <div class="checkin-venue-grid">${VENUES.map(([key, label, venue]) => venueBlock(key, label, venue, summarize(guests.filter((guest) => guest.celebration === key)))).join("")}</div>
        </article>
        <article class="panel checkin-copy">
          <div class="panel-head"><h3>Manual check-in nudge</h3></div>
          <textarea readonly>${COPY_MESSAGE}</textarea>
          <button class="primary-action" id="copy-checkin-message-inline" type="button">Copy message</button>
          <div class="checkin-attention">${attention.length ? attention.map(row).join("") : '<div class="empty-state">No guests currently need a 24-hour check-in.</div>'}</div>
        </article>
      </div>
      <article class="panel guest-list-tracker">
        <div class="panel-head">
          <h3>Guest list tracker</h3>
          <div class="checkin-filters">${FILTERS.map(filterButton).join("")}</div>
        </div>
        ${groupedRows(visibleRows)}
      </article>`;

    root.querySelector("#copy-checkin-message-inline")?.addEventListener("click", copyMessage);
    root.querySelectorAll("[data-jump]").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.jump)));
    root.querySelectorAll("[data-checkin-filter]").forEach((button) => button.addEventListener("click", () => {
      activeFilter = button.dataset.checkinFilter;
      render();
    }));
    root.querySelectorAll(".checkin-row[data-id]").forEach((item) => item.addEventListener("click", () => {
      const record = state.data.guests.find((guest) => guest.id === item.dataset.id);
      if (record) openEntity("guests", record);
    }));
  }

  function summarize(guests) {
    return guests.reduce((acc, guest) => {
      const status = attendanceStatus(guest);
      acc.total += 1;
      if (status === "attending") acc.attending += 1;
      else if (status === "declined") acc.declined += 1;
      else acc.pending += 1;
      if (guestConfirmed(guest)) acc.confirmed += 1;
      if (guestNeedsCheckIn(guest)) acc.stillToCheckIn += 1;
      return acc;
    }, { total: 0, attending: 0, declined: 0, pending: 0, confirmed: 0, stillToCheckIn: 0 });
  }

  function attendanceStatus(guest) {
    if (guest.check_in_status === "cant_make_it" || guest.rsvp_status === "no") return "declined";
    if (guest.check_in_status === "checked_in" || guest.rsvp_status === "yes") return "attending";
    if (guest.rsvp_status === "tbc") return "tbc";
    return "no_response";
  }

  function guestConfirmed(guest) {
    return Boolean(guest.checked_in_at || guest.last_confirmed_at || guest.check_in_status === "checked_in" || guest.check_in_status === "cant_make_it");
  }

  function guestNeedsCheckIn(guest) {
    return attendanceStatus(guest) !== "declined" && !guestConfirmed(guest);
  }

  function matchesActiveFilter(guest) {
    const status = attendanceStatus(guest);
    if (activeFilter === "all") return true;
    if (activeFilter === "needs_checkin") return guestNeedsCheckIn(guest);
    if (activeFilter === "attending") return status === "attending";
    if (activeFilter === "declined") return status === "declined";
    if (activeFilter === "pending") return status === "tbc" || status === "no_response";
    return true;
  }

  function venueBlock(key, label, venue, counts) {
    const progress = counts.total ? Math.round((counts.confirmed / counts.total) * 100) : 0;
    return `<section class="checkin-venue-block">
      <h4>${escapeHtml(label)}</h4>
      <p>${escapeHtml(venue)} - ${counts.total} guest rows</p>
      <div class="checkin-meter" aria-label="${escapeHtml(label)} check-in progress"><i style="width:${progress}%"></i></div>
      <div class="checkin-stat-grid">
        ${stat("Still attending", counts.attending)}
        ${stat("Still to check in", counts.stillToCheckIn)}
        ${stat("No response / TBC", counts.pending)}
        ${stat("Can't make it", counts.declined)}
      </div>
    </section>`;
  }

  function groupedRows(rows) {
    if (!rows.length) return '<div class="empty-state">No guests match this tracker filter.</div>';
    return VENUES.map(([key, label]) => {
      const venueRows = rows.filter((guest) => guest.celebration === key);
      if (!venueRows.length) return "";
      return `<section class="checkin-list-section"><h4>${escapeHtml(label)}</h4><div class="checkin-list">${venueRows.map(row).join("")}</div></section>`;
    }).join("");
  }

  function row(guest) {
    const attendance = attendanceStatus(guest);
    const confirmed = guestConfirmed(guest);
    const checkinLabel = confirmed ? (guest.check_in_status === "cant_make_it" ? "Confirmed out" : "Checked in") : "Needs check-in";
    const detail = [
      guest.party_name || "No party label",
      guest.transport ? `Transport: ${guest.transport}` : "Transport TBC",
      guest.accommodation ? `Stay: ${guest.accommodation}` : "Stay TBC",
      guest.last_confirmed_at || guest.checked_in_at ? `Confirmed: ${formatDateTime(guest.last_confirmed_at || guest.checked_in_at)}` : ""
    ].filter(Boolean).join(" - ");
    return `<div class="checkin-row" data-id="${escapeHtml(guest.id)}">
      <div><b>${escapeHtml(guest.name || guest.party_name || "Guest")}</b><small>${escapeHtml(detail)}</small></div>
      <div class="checkin-row-states">${attendancePill(attendance)}${pill(checkinLabel, confirmed ? "good" : "warn")}</div>
    </div>`;
  }

  function attendancePill(status) {
    if (status === "attending") return pill("Still attending", "good");
    if (status === "declined") return pill("Can't make it", "bad");
    if (status === "tbc") return pill("TBC", "warn");
    return pill("No response", "muted");
  }

  function filterButton([value, label]) {
    return `<button class="checkin-filter ${activeFilter === value ? "active" : ""}" type="button" data-checkin-filter="${escapeHtml(value)}">${escapeHtml(label)}</button>`;
  }

  function kpi(label, value, note) {
    return `<article class="checkin-kpi"><span>${escapeHtml(label)}</span><b>${Number(value || 0).toLocaleString("en-GB")}</b><small>${escapeHtml(note)}</small></article>`;
  }

  function stat(label, value) {
    return `<div class="checkin-stat"><span>${escapeHtml(label)}</span><b>${Number(value || 0).toLocaleString("en-GB")}</b></div>`;
  }

  function pill(label, tone) {
    return `<span class="checkin-pill ${escapeHtml(tone)}">${escapeHtml(label)}</span>`;
  }

  function sortGuests(a, b) {
    return String(a.celebration || "").localeCompare(String(b.celebration || "")) ||
      String(a.party_name || "").localeCompare(String(b.party_name || "")) ||
      String(a.name || "").localeCompare(String(b.name || ""));
  }

  function formatDateTime(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
  }

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(COPY_MESSAGE);
      if (typeof toast === "function") toast("Check-in message copied.");
    } catch (_error) {
      window.prompt("Copy check-in message", COPY_MESSAGE);
    }
  }

  function escapeHtml(value) {
    return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }

  waitForPlanner();
})();
