(() => {
  "use strict";

  const COPY_MESSAGE = "Hi, quick wedding check-in for Matt & Cara — please confirm your household here so we can finalise numbers, transport and food: [link]";

  function waitForPlanner() {
    if (typeof state === "undefined" || typeof renderAll !== "function" || !state.session || !document.querySelector(".planner-nav")) {
      window.setTimeout(waitForPlanner, 250);
      return;
    }
    install();
  }

  function install() {
    addStyles();
    addNav();
    addPanel();
    bind();
    render();
  }

  function addStyles() {
    if (document.getElementById("checkin-style")) return;
    const style = document.createElement("style");
    style.id = "checkin-style";
    style.textContent = `
      .checkin-kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;margin-bottom:14px}.checkin-kpi{padding:16px;border:1px solid var(--line);border-radius:var(--radius);background:rgba(255,255,255,.74);box-shadow:var(--shadow-sm)}.checkin-kpi span{display:block;color:var(--ink-soft);font-size:8px;font-weight:850;letter-spacing:.11em;text-transform:uppercase}.checkin-kpi b{display:block;margin-top:14px;font-family:var(--serif);font-size:34px;font-weight:500}.checkin-grid{display:grid;grid-template-columns:1.1fr .9fr;gap:14px}.checkin-list{display:grid;gap:8px}.checkin-row{display:grid;grid-template-columns:1fr auto;gap:12px;padding:13px;border:1px solid var(--line);border-radius:12px;background:#fffefa}.checkin-row b{font-family:var(--serif);font-size:18px;font-weight:500}.checkin-row small{display:block;margin-top:4px;color:var(--ink-soft);font-size:9px;line-height:1.5}.checkin-copy textarea{width:100%;min-height:104px;border:1px solid var(--line);border-radius:12px;padding:12px;background:#fff;font-size:12px;line-height:1.5}.checkin-copy button{margin-top:10px}.checkin-celebrations{display:grid;grid-template-columns:1fr 1fr;gap:10px}.checkin-celebrations div{padding:14px;border:1px solid var(--line);border-radius:12px;background:#fffefa}.checkin-celebrations b{display:block;font-family:var(--serif);font-size:22px;font-weight:500}.checkin-celebrations span{display:block;color:var(--ink-soft);font-size:10px;line-height:1.5}@media(max-width:900px){.checkin-kpis{grid-template-columns:repeat(2,1fr)}.checkin-grid,.checkin-celebrations{grid-template-columns:1fr}}`;
    document.head.appendChild(style);
  }

  function addNav() {
    const nav = document.querySelector(".planner-nav");
    if (!nav || nav.querySelector('[data-view="checkin"]')) return;
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.view = "checkin";
    button.innerHTML = "<span>◎</span>Guest Check-In";
    const guests = nav.querySelector('[data-view="guests"]');
    guests?.insertAdjacentElement("afterend", button) || nav.appendChild(button);
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
      <div id="checkin-root"></div>`;
    content.appendChild(panel);
  }

  function bind() {
    document.querySelector('[data-view="checkin"]')?.addEventListener("click", switchToCheckin);
    document.getElementById("copy-checkin-message")?.addEventListener("click", copyMessage);
  }

  function switchToCheckin() {
    state.view = "checkin";
    if (history.replaceState) history.replaceState(null, "", "#checkin");
    document.querySelectorAll("[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === "checkin"));
    document.querySelectorAll("[data-view-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.viewPanel === "checkin"));
    els.topbarTitle.textContent = "Guest Check-In";
    els.topbarSubtitle.textContent = "Private head count · Spain and South Africa";
    document.getElementById("global-add").textContent = "+ Add guest";
    document.body.classList.remove("sidebar-open");
    render();
  }

  function render() {
    const root = document.getElementById("checkin-root");
    if (!root) return;
    const guests = state.data.guests || [];
    const counts = summarize(guests);
    const missing = guests.filter((guest) => !isCheckedIn(guest)).slice(0, 18);
    root.innerHTML = `
      <div class="checkin-kpis">
        ${kpi("Total invited", counts.total)}${kpi("Still coming", counts.yes)}${kpi("Can't make it", counts.no)}${kpi("Not checked in", counts.unknown)}${kpi("Transport needed", counts.transportYes)}${kpi("Unknown transport", counts.transportUnknown)}
      </div>
      <div class="checkin-grid">
        <article class="panel"><div class="panel-head"><h3>Not checked in yet</h3><button type="button" data-jump="guests">Open guests</button></div><div class="checkin-list">${missing.length ? missing.map(row).join("") : '<div class="empty-state">No guest rows waiting for check-in in this browser view.</div>'}</div></article>
        <article class="panel checkin-copy"><div class="panel-head"><h3>Manual message</h3></div><textarea readonly>${COPY_MESSAGE}</textarea><button class="primary-action" id="copy-checkin-message-inline" type="button">Copy message</button><div class="checkin-celebrations" style="margin-top:14px"><div><b>${counts.spain}</b><span>Spain guest rows</span></div><div><b>${counts.south_africa}</b><span>South Africa guest rows</span></div></div></article>
      </div>`;
    root.querySelector("#copy-checkin-message-inline")?.addEventListener("click", copyMessage);
    root.querySelectorAll("[data-jump]").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.jump)));
  }

  function summarize(guests) {
    return guests.reduce((acc, guest) => {
      acc.total += 1;
      acc[guest.celebration] = (acc[guest.celebration] || 0) + 1;
      if (guest.rsvp_status === "yes") acc.yes += 1;
      else if (guest.rsvp_status === "no") acc.no += 1;
      else acc.unknown += 1;
      const transport = String(guest.transport || "").toLowerCase();
      if (transport.includes("required") || transport.includes("yes")) acc.transportYes += 1;
      if (!transport || transport.includes("tbc") || transport.includes("unknown")) acc.transportUnknown += 1;
      return acc;
    }, { total: 0, yes: 0, no: 0, unknown: 0, transportYes: 0, transportUnknown: 0, spain: 0, south_africa: 0 });
  }

  function isCheckedIn(guest) {
    return guest.rsvp_status === "yes" || guest.rsvp_status === "no";
  }

  function kpi(label, value) {
    return `<article class="checkin-kpi"><span>${escapeHtml(label)}</span><b>${Number(value || 0).toLocaleString("en-GB")}</b></article>`;
  }

  function row(guest) {
    return `<div class="checkin-row"><div><b>${escapeHtml(guest.name || guest.party_name || "Guest")}</b><small>${escapeHtml(labelCelebration(guest.celebration))} · ${escapeHtml(guest.party_name || "No party label")} · transport ${escapeHtml(guest.transport || "TBC")}</small></div><span class="status-badge status-pending">Not checked in</span></div>`;
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
