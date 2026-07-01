/* Honeymoon view. Items live in the honeymoon_items planner table (or the
   browser store in demo mode) so Matt and Cara always see the same plan.
   The nav button and panel live in planner.html. */

  const LEGACY_HONEYMOON_STORE = "mxc-honeymoon-japan-v1";
  let activeHoneymoonTab = "overview";
  let honeymoonSeedStarted = false;

  function honeymoonRows(kind) {
    return (state.data.honeymoon_items || [])
      .filter((row) => row.kind === kind)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || String(a.created_at || "").localeCompare(String(b.created_at || "")));
  }

  function honeymoonSetting(key, fallback) {
    return honeymoonRows("setting").find((row) => row.title === key)?.notes || fallback;
  }

  function renderHoneymoon() {
    const root = document.getElementById("honeymoon-root");
    if (!root) return;
    document.querySelectorAll("[data-hm-tab]").forEach((button) => button.classList.toggle("active", button.dataset.hmTab === activeHoneymoonTab));
    const renderers = {
      overview: honeymoonOverview,
      itinerary: honeymoonItinerary,
      flights: honeymoonFlights,
      places: honeymoonPlaces,
      budget: honeymoonBudget,
      tasks: honeymoonTasks
    };
    root.innerHTML = (renderers[activeHoneymoonTab] || honeymoonOverview)();
    root.querySelectorAll("[data-hm-done]").forEach((box) => box.addEventListener("change", (event) => {
      event.stopPropagation();
      const record = state.data.honeymoon_items.find((row) => row.id === box.dataset.hmDone);
      if (record) savePatch("honeymoon_items", record, { done: box.checked });
    }));
    root.querySelectorAll("[data-hm-edit]").forEach((element) => element.addEventListener("click", (event) => {
      if (event.target.matches("input[type=checkbox]")) return;
      const record = state.data.honeymoon_items.find((row) => row.id === element.dataset.hmEdit);
      if (record) openEntity("honeymoon_items", record);
    }));
  }

  function honeymoonOverview() {
    const tasks = honeymoonRows("task");
    const done = tasks.filter((row) => row.done).length;
    const totalBudget = honeymoonRows("budget").reduce((sum, row) => sum + Number(row.amount || 0), 0);
    return `<div class="honeymoon-grid">
      <article class="hm-card"><h3>Route</h3><p>${escapeHtml(honeymoonSetting("route", "Spain → Japan → Spain"))}</p><span class="hm-tag">${escapeHtml(honeymoonSetting("nights", "14–18 nights draft"))}</span></article>
      <article class="hm-card"><h3>Dates</h3><p>${escapeHtml(honeymoonSetting("dates", "TBC after South Africa wedding planning is locked"))}</p><span class="hm-tag">Needs decision</span></article>
      <article class="hm-card"><h3>Progress</h3><div class="hm-money">${done}/${tasks.length}</div><p>honeymoon tasks complete</p></article>
    </div>
    <div class="honeymoon-two" style="margin-top:12px">
      <article class="hm-card"><h3>Next priorities</h3><div class="hm-list">${tasks.filter((row) => !row.done).slice(0, 5).map(honeymoonTaskHtml).join("") || '<div class="empty-state">All honeymoon tasks are done.</div>'}</div></article>
      <article class="hm-card"><h3>Working budget</h3><div class="hm-money">${formatMoney(totalBudget, "EUR")}</div><p>Draft estimate. Replace with real quotes as bookings happen.</p><div class="hm-note">Start with flights and route shape. Once dates are locked, hotels and rail become much easier.</div></article>
    </div>`;
  }

  function honeymoonItinerary() {
    const rows = honeymoonRows("itinerary");
    return `<div class="hm-card"><h3>Draft itinerary</h3>${rows.map((row) => `<div class="hm-row" data-hm-edit="${escapeHtml(row.id)}"><div class="hm-day">${escapeHtml(row.detail || "—")}</div><div><b>${escapeHtml(row.title)}</b><p>${escapeHtml(row.notes || "")}</p></div><span class="hm-tag">${escapeHtml(row.status || "Draft")}</span></div>`).join("") || '<div class="empty-state">No itinerary stops yet. Use + Add honeymoon item.</div>'}</div>`;
  }

  function honeymoonFlights() {
    const rows = honeymoonRows("flight");
    return `<div class="honeymoon-two">
      <article class="hm-card"><h3>Flights & transport</h3>${rows.map((row) => `<div class="hm-row" data-hm-edit="${escapeHtml(row.id)}"><div class="hm-day">${escapeHtml(row.title)}</div><div><b>${escapeHtml(row.detail || "")}</b><p>${escapeHtml(row.notes || "")}</p></div><span class="hm-tag">${escapeHtml(row.status || "TBC")}</span></div>`).join("") || '<div class="empty-state">No flight legs tracked yet.</div>'}</article>
      <article class="hm-card"><h3>Booking questions</h3><ul><li>Do you want Tokyo in and Osaka out, or return from the same city?</li><li>How soon after the SA wedding do you want to travel?</li><li>Do you want a slow luxury ryokan stop or a faster city-heavy route?</li><li>Which Google Maps places are non-negotiable?</li></ul></article>
    </div>`;
  }

  function honeymoonPlaces() {
    const rows = honeymoonRows("place");
    return `<div class="hm-card"><h3>Saved places</h3><p>Buckets for your Google Maps saves. Click a place to edit it, or use + Add honeymoon item for a new one.</p><div class="hm-place-grid">${rows.map((row) => `<div class="hm-place" data-hm-edit="${escapeHtml(row.id)}"><b>${escapeHtml(row.title)}</b><span>${escapeHtml(row.notes || "")}</span></div>`).join("") || '<div class="empty-state">No saved places yet.</div>'}</div></div>`;
  }

  function honeymoonBudget() {
    const rows = honeymoonRows("budget");
    return `<div class="hm-card"><h3>Budget draft</h3>${rows.map((row) => `<div class="hm-row" data-hm-edit="${escapeHtml(row.id)}"><div class="hm-day">${escapeHtml(row.currency || "EUR")}</div><div><b>${escapeHtml(row.title)}</b><p>${escapeHtml(row.notes || "")}</p></div><span class="hm-tag">${formatMoney(row.amount, row.currency || "EUR")}</span></div>`).join("") || '<div class="empty-state">No budget lines yet.</div>'}</div>`;
  }

  function honeymoonTasks() {
    const rows = honeymoonRows("task");
    return `<div class="hm-card"><h3>Honeymoon tasks</h3><div class="hm-list">${rows.map(honeymoonTaskHtml).join("") || '<div class="empty-state">No honeymoon tasks yet.</div>'}</div></div>`;
  }

  function honeymoonTaskHtml(task) {
    return `<div class="hm-item" data-hm-edit="${escapeHtml(task.id)}"><input type="checkbox" aria-label="Mark done" data-hm-done="${escapeHtml(task.id)}" ${task.done ? "checked" : ""}><span><b>${escapeHtml(task.title)}</b><small>${escapeHtml(task.notes || "")}</small></span><span class="hm-tag">${escapeHtml(task.priority || "normal")}</span></div>`;
  }

  /* One-time seeding: convert a legacy browser-local honeymoon plan into the
     shared table, or create the default Japan draft on first ever open. */
  async function ensureHoneymoonSeed() {
    if (honeymoonSeedStarted || (state.data.honeymoon_items || []).length) return;
    honeymoonSeedStarted = true;
    const legacy = readLegacyHoneymoon();
    const payloads = legacy ? legacyHoneymoonPayloads(legacy) : defaultHoneymoonPayloads();
    try {
      for (const payload of payloads) await createHoneymoonRow(payload);
      if (legacy) {
        localStorage.setItem(`${LEGACY_HONEYMOON_STORE}-migrated`, localStorage.getItem(LEGACY_HONEYMOON_STORE) || "");
        localStorage.removeItem(LEGACY_HONEYMOON_STORE);
        toast("Honeymoon plan moved from this browser into the secure planner.");
      }
      renderHoneymoon();
    } catch (error) {
      honeymoonSeedStarted = false;
      toast(error.message || "Could not prepare the honeymoon planner.", true);
    }
  }

  function readLegacyHoneymoon() {
    try {
      const saved = JSON.parse(localStorage.getItem(LEGACY_HONEYMOON_STORE) || "null");
      return saved && typeof saved === "object" ? saved : null;
    } catch (_error) {
      return null;
    }
  }

  async function createHoneymoonRow(payload) {
    if (state.session?.token) {
      const saved = await plannerRpc("planner_save_entity", {
        p_session_token: state.session.token,
        p_table: "honeymoon_items",
        p_record_id: null,
        p_payload: payload
      });
      state.data.honeymoon_items.push(saved);
    } else {
      const now = new Date().toISOString();
      state.data.honeymoon_items.push({ id: crypto.randomUUID(), done: false, currency: "EUR", priority: "normal", sort_order: 0, ...payload, created_at: now, updated_at: now });
      try {
        localStorage.setItem("mxc-planner-browser-v3", JSON.stringify(state.data));
      } catch (_error) {
        // Browser storage can be unavailable; the in-memory plan still works.
      }
    }
  }

  function legacyHoneymoonPayloads(legacy) {
    const payloads = [
      { kind: "setting", title: "route", notes: legacy.route || "Spain → Japan → Spain" },
      { kind: "setting", title: "dates", notes: legacy.dates || "TBC after South Africa wedding planning is locked" },
      { kind: "setting", title: "nights", notes: legacy.nights || "14–18 nights draft" }
    ];
    (legacy.tasks || []).forEach((row, index) => payloads.push({ kind: "task", title: row.title || "Honeymoon task", notes: row.notes || "", priority: row.priority || "normal", done: Boolean(row.done), sort_order: index }));
    (legacy.itinerary || []).forEach((row, index) => payloads.push({ kind: "itinerary", title: row.city || "Stop", detail: row.day || "", notes: row.notes || "", sort_order: index }));
    (legacy.flights || []).forEach((row, index) => payloads.push({ kind: "flight", title: row.label || "Leg", detail: row.route || "", status: row.status || "TBC", notes: row.notes || "", sort_order: index }));
    (legacy.places || []).forEach((row, index) => payloads.push({ kind: "place", title: row.area || "Japan", notes: row.notes || "", sort_order: index }));
    (legacy.budget || []).forEach((row, index) => payloads.push({ kind: "budget", title: row.label || "Budget line", amount: Number(row.amount || 0), currency: row.currency || "EUR", notes: row.notes || "", sort_order: index }));
    return payloads;
  }

  function defaultHoneymoonPayloads() {
    const task = (index, title, notes, priority) => ({ kind: "task", title, notes, priority, sort_order: index });
    const stop = (index, detail, title, notes) => ({ kind: "itinerary", detail, title, notes, sort_order: index });
    const leg = (index, title, detail, notes) => ({ kind: "flight", title, detail, status: "TBC", notes, sort_order: index });
    const spot = (index, title, notes) => ({ kind: "place", title, notes, sort_order: index });
    const line = (index, title, amount, notes) => ({ kind: "budget", title, amount, currency: "EUR", notes, sort_order: index });
    return [
      { kind: "setting", title: "route", notes: "Spain → Japan → Spain" },
      { kind: "setting", title: "dates", notes: "TBC after South Africa wedding planning is locked" },
      { kind: "setting", title: "nights", notes: "14–18 nights draft" },
      task(0, "Decide honeymoon dates", "Choose departure and return windows around wedding recovery, work and family time.", "high"),
      task(1, "Check Spain to Japan flight routes", "Compare Málaga, Madrid, Seville or Lisbon departures with Tokyo/Osaka arrivals.", "high"),
      task(2, "Book outbound flights", "Decide if arriving Tokyo or Osaka makes the route easier.", "high"),
      task(3, "Book return flights", "Consider open-jaw return if route ends in a different city.", "high"),
      task(4, "Passport and travel document check", "Confirm passport validity and any entry requirements before booking.", "high"),
      task(5, "Build Google Maps saved-place import list", "Export or manually copy the places already saved on your map into this tab.", "normal"),
      task(6, "Choose hotel areas", "Tokyo, Kyoto and final-night airport hotel if needed.", "normal"),
      task(7, "Book first two hotels", "Lock Tokyo and Kyoto bases first; add ryokan or countryside stay after.", "normal"),
      task(8, "Research luggage forwarding", "Decide if large bags should be sent between hotels while moving cities.", "normal"),
      task(9, "Book key restaurants", "Prioritise special meals, BBQ/izakaya, sushi, ramen and any honeymoon dinner.", "normal"),
      task(10, "Book one premium ryokan / onsen stay", "Potential Hakone, Kawaguchiko, Izu or Kyoto countryside option.", "normal"),
      task(11, "Create rainy-day alternatives", "Museums, shopping streets, food halls, indoor experiences.", "low"),
      stop(0, "1–4", "Tokyo", "Arrive, recover, food neighbourhoods, Shibuya/Shinjuku, coffee, shopping, one special dinner."),
      stop(1, "5", "Hakone or Fuji area", "Ryokan, onsen, mountain views, slower honeymoon reset."),
      stop(2, "6–9", "Kyoto", "Temples, old streets, tea, gardens, day trip options and a slower romantic base."),
      stop(3, "10", "Nara or Uji", "Deer park / temples or matcha-focused day trip."),
      stop(4, "11–13", "Osaka", "Street food, nightlife, markets, baseball/arcade energy, easy Kyoto access if needed."),
      stop(5, "14–15", "Hiroshima / Miyajima or Kanazawa", "Choose one deeper culture/nature extension, not both unless the trip is longer."),
      stop(6, "Final night", "Tokyo or Osaka airport side", "Easy final shopping, bags packed, low-stress departure."),
      leg(0, "Outbound", "Spain to Japan", "Compare Madrid/Málaga/Seville/Lisbon routes; decide Tokyo vs Osaka arrival."),
      leg(1, "Return", "Japan to Spain", "Check open-jaw pricing if route ends away from arrival city."),
      leg(2, "Internal rail", "Tokyo · Kyoto · Osaka", "Research whether individual tickets or a pass works better for the final route."),
      leg(3, "Luggage", "Hotel-to-hotel forwarding", "Useful if carrying wedding/honeymoon bags across multiple cities."),
      spot(0, "Tokyo", "Shibuya, Shinjuku, Ginza, Daikanyama, Nakameguro, TeamLab-style digital art, food halls, cocktail bars."),
      spot(1, "Kyoto", "Gion, Higashiyama, Arashiyama, Kiyomizu area, Nishiki Market, tea houses, gardens."),
      spot(2, "Osaka", "Dotonbori, Namba, Shinsekai, Kuromon Market, food crawl and nightlife."),
      spot(3, "Hakone / Fuji", "Ryokan, onsen, lake views, slower romantic reset."),
      spot(4, "Nara", "Day trip for deer park, temples and a calmer old-Japan feel."),
      spot(5, "Hiroshima / Miyajima", "Culture, history, island shrine and a deeper extension if the trip is long enough."),
      spot(6, "Kanazawa", "Gardens, old districts, seafood and design if you want an alternative to Hiroshima."),
      line(0, "International flights", 1800, "Placeholder for two people."),
      line(1, "Hotels / ryokan", 3500, "Mix of city hotels and one premium stay."),
      line(2, "Rail and local transport", 900, "Placeholder until route is final."),
      line(3, "Food and restaurants", 2200, "Daily food plus special honeymoon dinners."),
      line(4, "Experiences and tickets", 800, "Museums, digital art, temples, bookings, classes."),
      line(5, "Shopping and gifts", 1000, "Flexible personal buffer."),
      line(6, "Contingency", 800, "Cushion for route changes and extras.")
    ];
  }

  document.querySelectorAll("[data-hm-tab]").forEach((button) => button.addEventListener("click", () => {
    activeHoneymoonTab = button.dataset.hmTab;
    renderHoneymoon();
  }));

  document.addEventListener("mxc:planner-ready", ensureHoneymoonSeed);
