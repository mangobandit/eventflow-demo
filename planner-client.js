(function openPlannerClient() {
  "use strict";

  const root = document.getElementById("clientWorkspace");
  const config = window.MXC_CONFIG || {};
  const interested = location.hash.slice(1);
  const tokenKey = "mxc-client-planning-link";
  let token;
  let client;

  function escape(text) {
    return String(text ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  }

  function prettyDate(date) {
    if (!date) return "";
    const value = new Date(`${date.slice(0, 10)}T12:00:00`);
    return Number.isNaN(value.valueOf()) ? "" : new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(value);
  }

  function showError(message) {
    root.innerHTML = `<section class="workspace-card"><h1>Planning link unavailable</h1><p>${escape(message)}</p></section>`;
    root.setAttribute("aria-busy", "false");
  }

  function load() {
    token = interested || sessionStorage.getItem(tokenKey) || "";
    if (interested) {
      history.replaceState(null, "", location.pathname);
      sessionStorage.removeItem(tokenKey);
    }
    if (!/^[0-9a-f]{32,128}$/i.test(token)) return showError("Open the private link your planner sent you.");
    if (!window.supabase?.createClient || !config.supabaseUrl || !config.supabaseAnonKey) {
      return showError("This planning page could not connect.");
    }
    sessionStorage.setItem(tokenKey, token);
    client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    refresh();
  }

  async function refresh(message = "") {
    try {
      const { data, error } = await client.rpc("planner_workspace_open_link", { p_link: token });
      if (error || !data) return showError("This link may have expired or been revoked. Ask your planner for a new one.");
      draw(data, message);
    } catch (_error) {
      showError("Check your connection and open the link again.");
    }
  }

  function draw(data, message) {
    const page = data.site || {};
    const project = data.project || {};
    const title = page.headline || project.title || data.title || "Wedding planning";
    const shown = Array.isArray(data.sections) ? data.sections : [];
    const guideRows = Array.isArray(data.guides) ? data.guides : [];
    const schedule = Array.isArray(data.timeline) ? data.timeline : [];
    const slots = Array.isArray(data.slots) ? data.slots : [];
    root.innerHTML = `<header class="workspace-site-preview workspace-client-cover">
      <h1>${escape(title)}</h1>
      ${page.venue ? `<p>${escape(page.venue)}</p>` : ""}
      ${page.intro ? `<div class="workspace-body">${escape(page.intro)}</div>` : ""}
    </header>
    ${message ? `<p class="workspace-client-message" role="status">${escape(message)}</p>` : ""}
    ${page.details ? `<section class="workspace-card"><h2>Event details</h2><p class="workspace-body">${escape(page.details)}</p></section>` : ""}
    ${shown.includes("timeline") ? `<section class="workspace-card"><h2>Timeline</h2>
      ${schedule.map(item => `<div class="workspace-list-row"><div><b>${escape(item.title)}</b><small>${escape(item.location || "")}</small></div>
        <time>${escape([prettyDate(item.item_date || item.date), (item.item_time || item.time || "").slice(0, 5)].filter(Boolean).join(" · "))}</time>
      </div>`).join("") || "<p>No timeline items have been shared yet.</p>"}
    </section>` : ""}
    ${shown.includes("guides") ? `<section class="workspace-card"><h2>Guides</h2>${guideRows.map(item =>
      `<article class="workspace-client-guide"><h3>${escape(item.title)}</h3><p class="workspace-body">${escape(item.body || item.summary || "")}</p></article>`
    ).join("") || "<p>No guides have been shared yet.</p>"}</section>` : ""}
    ${shown.includes("slots") ? `<section class="workspace-card"><h2>Meeting availability</h2>
      ${slots.map(slot => `<div class="workspace-list-row"><div><b>${escape(slot.title)}</b>
        <small>${escape([prettyDate(slot.date), slot.time, slot.endTime].filter(Boolean).join(" · "))}</small></div>
        <button class="workspace-client-button" type="button" data-book-slot="${escape(slot.id)}" data-slot-name="${escape(slot.title)}">Book</button></div>`).join("") || "<p>No meeting times are available.</p>"}
      <form class="workspace-client-book" id="slotBooking" hidden>
        <h3 id="slotBookingHeading">Book a meeting</h3>
        <label>Your name <input name="name" autocomplete="name" maxlength="120" required></label>
        <label>Notes for your planner <textarea name="notes" maxlength="600"></textarea></label>
        <input name="slot" type="hidden">
        <div><button class="workspace-client-button" type="submit">Confirm booking</button>
          <button class="workspace-client-button" data-cancel-slot type="button">Cancel</button></div>
        <p data-book-status role="status"></p>
      </form>
    </section>` : ""}`;
    root.setAttribute("aria-busy", "false");
  }

  root.addEventListener("click", event => {
    const item = event.target.closest("[data-book-slot]");
    const form = root.querySelector("#slotBooking");
    if (!form) return;
    if (item) {
      form.reset();
      form.querySelector("[data-book-status]").textContent = "";
      form.elements.slot.value = item.dataset.bookSlot;
      root.querySelector("#slotBookingHeading").textContent = `Book ${item.dataset.slotName}`;
      form.hidden = false;
      form.elements.name.focus();
    }
    if (event.target.closest("[data-cancel-slot]")) form.hidden = true;
  });

  root.addEventListener("submit", async event => {
    const form = event.target.closest("#slotBooking");
    if (!form) return;
    event.preventDefault();
    const status = form.querySelector("[data-book-status]");
    const submit = form.querySelector("button[type=submit]");
    submit.disabled = true;
    try {
      const info = new FormData(form);
      const { error } = await client.rpc("planner_workspace_book_slot", {
        p_link: token, p_slot_id: info.get("slot"), p_name: info.get("name"), p_notes: info.get("notes")
      });
      if (error) throw new Error(error.message);
      await refresh("Your meeting is booked.");
    } catch (failure) {
      status.textContent = failure.message || "The meeting could not be booked.";
      submit.disabled = false;
    }
  });

  load();
})();
