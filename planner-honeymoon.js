(() => {
  "use strict";

  const STORE = "mxc-honeymoon-japan-v1";
  let data = null;

  function waitForPlanner() {
    if (typeof state === "undefined" || !document.querySelector(".planner-nav") || !state.session) {
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
    data = load();
    render();
  }

  function addStyles() {
    if (document.getElementById("honeymoon-style")) return;
    const style = document.createElement("style");
    style.id = "honeymoon-style";
    style.textContent = `
      .honeymoon-hero{position:relative;overflow:hidden;border:1px solid var(--line);border-radius:var(--radius);padding:30px;background:linear-gradient(135deg,#fffefa,#efe4d8);box-shadow:var(--shadow-sm)}
      .honeymoon-hero:after{content:"";position:absolute;right:-46px;bottom:-46px;width:190px;height:150px;opacity:.08;background:var(--olive-dark);-webkit-mask:url('assets/mxc-logo.svg') center/contain no-repeat;mask:url('assets/mxc-logo.svg') center/contain no-repeat}
      .honeymoon-hero h2{margin:0;font-family:var(--serif);font-size:clamp(40px,5vw,74px);font-weight:400;line-height:.95}.honeymoon-hero p{max-width:760px;color:var(--ink-soft);line-height:1.65}.honeymoon-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0}.honeymoon-tabs button{min-height:38px;border:1px solid var(--line);border-radius:999px;background:#fff;cursor:pointer;padding:0 13px;font-size:9px;font-weight:850;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-soft)}.honeymoon-tabs button.active{background:var(--olive-dark);border-color:var(--olive-dark);color:#fff}.honeymoon-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.honeymoon-two{display:grid;grid-template-columns:1fr 1fr;gap:12px}.hm-card{border:1px solid var(--line);border-radius:var(--radius);background:rgba(255,255,255,.75);box-shadow:var(--shadow-sm);padding:20px}.hm-card h3{margin:0 0 12px;font-family:var(--serif);font-size:25px;font-weight:500}.hm-card p,.hm-card li{color:var(--ink-soft);font-size:12px;line-height:1.65}.hm-list{display:grid;gap:8px}.hm-item{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:start;padding:12px;border:1px solid var(--line);border-radius:12px;background:#fffefa}.hm-item input{margin-top:3px}.hm-item b{display:block;font-family:var(--serif);font-size:17px;font-weight:500}.hm-item small{display:block;margin-top:3px;color:var(--ink-soft);font-size:9px;line-height:1.5}.hm-tag{display:inline-flex;align-items:center;min-height:22px;padding:0 8px;border-radius:999px;background:#edf0e9;color:var(--olive-dark);font-size:7px;font-weight:850;letter-spacing:.08em;text-transform:uppercase}.hm-row{display:grid;grid-template-columns:76px 1fr auto;gap:12px;align-items:center;padding:13px 0;border-bottom:1px solid var(--line)}.hm-row:last-child{border-bottom:0}.hm-day{font-family:var(--serif);font-size:22px;color:var(--clay)}.hm-place-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.hm-place{padding:14px;border:1px solid var(--line);border-radius:12px;background:#fffefa}.hm-place b{font-family:var(--serif);font-size:18px;font-weight:500}.hm-place span{display:block;margin-top:5px;color:var(--ink-soft);font-size:10px;line-height:1.45}.hm-money{font-family:var(--serif);font-size:30px}.hm-note{border-left:3px solid var(--clay);padding:12px 14px;background:#fff8ea;border-radius:10px;color:var(--ink-soft);font-size:11px;line-height:1.6}@media(max-width:900px){.honeymoon-grid,.honeymoon-two,.hm-place-grid{grid-template-columns:1fr}.hm-row{grid-template-columns:1fr}.hm-tag{width:max-content}}`;
    document.head.appendChild(style);
  }

  function addNav() {
    const nav = document.querySelector(".planner-nav");
    if (!nav || nav.querySelector('[data-view="honeymoon"]')) return;
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.view = "honeymoon";
    button.innerHTML = "<span>âœˆ</span>Honeymoon";
    nav.appendChild(button);
  }

  function addPanel() {
    const content = document.querySelector(".planner-content");
    if (!content || content.querySelector('[data-view-panel="honeymoon"]')) return;
    const panel = document.createElement("section");
    panel.className = "planner-view";
    panel.dataset.viewPanel = "honeymoon";
    panel.innerHTML = `
      <div class="honeymoon-hero">
        <p class="eyebrow">Japan honeymoon portal</p>
        <h2>Japan, shaped into a plan.</h2>
        <p>A draft command centre for flights, itinerary, hotels, budget, saved places and booking tasks. Use it as a starting structure, then replace the placeholder cities and places with your Google Maps list.</p>
        <div class="honeymoon-tabs" role="tablist">
          <button class="active" type="button" data-hm-tab="overview">Overview</button>
          <button type="button" data-hm-tab="itinerary">Itinerary</button>
          <button type="button" data-hm-tab="flights">Flights & transport</button>
          <button type="button" data-hm-tab="places">Saved places</button>
          <button type="button" data-hm-tab="budget">Budget</button>
          <button type="button" data-hm-tab="tasks">Tasks</button>
        </div>
      </div>
      <div id="honeymoon-root" style="margin-top:14px"></div>`;
    content.appendChild(panel);
  }

  function bind() {
    document.querySelector('[data-view="honeymoon"]')?.addEventListener("click", () => switchHoneymoon());
    document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => {
      if (button.dataset.view === "honeymoon") switchHoneymoon();
    }));
    document.querySelectorAll("[data-hm-tab]").forEach((button) => button.addEventListener("click", () => {
      data.tab = button.dataset.hmTab;
      save();
      render();
    }));
    const global = document.getElementById("global-add");
    global?.addEventListener("click", (event) => {
      if (state.view !== "honeymoon") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      addDraftTask();
    }, true);
  }

  function switchHoneymoon() {
    state.view = "honeymoon";
    if (history.replaceState) history.replaceState(null, "", "#honeymoon");
    document.querySelectorAll("[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === "honeymoon"));
    document.querySelectorAll("[data-view-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.viewPanel === "honeymoon"));
    els.topbarTitle.textContent = "Honeymoon";
    els.topbarSubtitle.textContent = "Japan planner Â· draft itinerary and booking tracker";
    document.getElementById("global-add").textContent = "+ Add honeymoon task";
    document.body.classList.remove("sidebar-open");
    render();
  }

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) || "null");
      if (saved) return saved;
    } catch (_error) {
      localStorage.removeItem(STORE);
    }
    return seed();
  }

  function save() {
    localStorage.setItem(STORE, JSON.stringify(data));
  }

  function seed() {
    return {
      tab: "overview",
      route: "Spain â†’ Japan â†’ Spain",
      dates: "TBC after South Africa wedding planning is locked",
      nights: "14â€“18 nights draft",
      tasks: [
        item("Decide honeymoon dates", "Choose departure and return windows around wedding recovery, work and family time.", "high"),
        item("Check Spain to Japan flight routes", "Compare MÃ¡laga, Madrid, Seville or Lisbon departures with Tokyo/Osaka arrivals.", "high"),
        item("Book outbound flights", "Decide if arriving Tokyo or Osaka makes the route easier.", "high"),
        item("Book return flights", "Consider open jaw return if route ends in a different city.", "high"),
        item("Passport and travel document check", "Confirm passport validity and any entry requirements before booking.", "high"),
        item("Build Google Maps saved place import list", "Export or manually copy the places already saved on your map into this tab.", "normal"),
        item("Choose hotel areas", "Tokyo, Kyoto and final night airport hotel if needed.", "normal"),
        item("Book first two hotels", "Lock Tokyo and Kyoto bases first; add ryokan or countryside stay after.", "normal"),
        item("Research luggage forwarding", "Decide if large bags should be sent between hotels while moving cities.", "normal"),
        item("Book key restaurants", "Prioritise special meals, BBQ/izakaya, sushi, ramen and any honeymoon dinner.", "normal"),
        item("Book one premium ryokan / onsen stay", "Potential Hakone, Kawaguchiko, Izu or Kyoto countryside option.", "normal"),
        item("Create rainy day alternatives", "Museums, shopping streets, food halls, indoor experiences.", "low")
      ],
      itinerary: [
        day("1â€“4", "Tokyo", "Arrive, recover, food neighbourhoods, Shibuya/Shinjuku, coffee, shopping, one special dinner."),
        day("5", "Hakone or Fuji area", "Ryokan, onsen, mountain views, slower honeymoon reset."),
        day("6â€“9", "Kyoto", "Temples, old streets, tea, gardens, day trip options and a slower romantic base."),
        day("10", "Nara or Uji", "Deer park / temples or matcha-focused day trip."),
        day("11â€“13", "Osaka", "Street food, nightlife, markets, baseball/arcade energy, easy Kyoto access if needed."),
        day("14â€“15", "Hiroshima / Miyajima or Kanazawa", "Choose one deeper culture/nature extension, not both unless the trip is longer."),
        day("Final night", "Tokyo or Osaka airport side", "Easy final shopping, bags packed, low stress departure.")
      ],
      flights: [
        row("Outbound", "Spain to Japan", "TBC", "Compare Madrid/MÃ¡laga/Seville/Lisbon routes; decide Tokyo vs Osaka arrival."),
        row("Return", "Japan to Spain", "TBC", "Check open jaw pricing if route ends away from arrival city."),
        row("Internal rail", "Tokyo Â· Kyoto Â· Osaka", "TBC", "Research whether individual tickets or a pass works better for the final route."),
        row("Luggage", "Hotel to hotel forwarding", "TBC", "Useful if carrying wedding/honeymoon bags across multiple cities.")
      ],
      places: [
        place("Tokyo", "Shibuya, Shinjuku, Ginza, Daikanyama, Nakameguro, TeamLab style digital art, food halls, cocktail bars."),
        place("Kyoto", "Gion, Higashiyama, Arashiyama, Kiyomizu area, Nishiki Market, tea houses, gardens."),
        place("Osaka", "Dotonbori, Namba, Shinsekai, Kuromon Market, food crawl and nightlife."),
        place("Hakone / Fuji", "Ryokan, onsen, lake views, slower romantic reset."),
        place("Nara", "Day trip for deer park, temples and a calmer old-Japan feel."),
        place("Hiroshima / Miyajima", "Culture, history, island shrine and a deeper extension if the trip is long enough."),
        place("Kanazawa", "Gardens, old districts, seafood and design if you want an alternative to Hiroshima.")
      ],
      budget: [
        money("International flights", 1800, "EUR", "Placeholder for two people."),
        money("Hotels / ryokan", 3500, "EUR", "Mix of city hotels and one premium stay."),
        money("Rail and local transport", 900, "EUR", "Placeholder until route is final."),
        money("Food and restaurants", 2200, "EUR", "Daily food plus special honeymoon dinners."),
        money("Experiences and tickets", 800, "EUR", "Museums, digital art, temples, bookings, classes."),
        money("Shopping and gifts", 1000, "EUR", "Flexible personal buffer."),
        money("Contingency", 800, "EUR", "Cushion for route changes and extras.")
      ]
    };
  }

  function item(title, notes, priority) { return { id: crypto.randomUUID(), title, notes, priority, done: false }; }
  function day(day, city, notes) { return { day, city, notes }; }
  function row(label, route, status, notes) { return { label, route, status, notes }; }
  function place(area, notes) { return { area, notes }; }
  function money(label, amount, currency, notes) { return { label, amount, currency, notes }; }

  function render() {
    const root = document.getElementById("honeymoon-root");
    if (!root || !data) return;
    document.querySelectorAll("[data-hm-tab]").forEach((button) => button.classList.toggle("active", button.dataset.hmTab === data.tab));
    const renderers = { overview, itinerary, flights, places, budget, tasks };
    root.innerHTML = renderers[data.tab]?.() || overview();
    root.querySelectorAll("[data-hm-done]").forEach((box) => box.addEventListener("change", () => {
      const task = data.tasks.find((item) => item.id === box.dataset.hmDone);
      if (task) task.done = box.checked;
      save();
      render();
    }));
  }

  function overview() {
    const done = data.tasks.filter((item) => item.done).length;
    const totalBudget = data.budget.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    return `<div class="honeymoon-grid">
      <article class="hm-card"><h3>Route</h3><p>${escape(data.route)}</p><span class="hm-tag">${escape(data.nights)}</span></article>
      <article class="hm-card"><h3>Dates</h3><p>${escape(data.dates)}</p><span class="hm-tag">Needs decision</span></article>
      <article class="hm-card"><h3>Progress</h3><div class="hm-money">${done}/${data.tasks.length}</div><p>honeymoon tasks complete</p></article>
    </div><div class="honeymoon-two" style="margin-top:12px"><article class="hm-card"><h3>Next priorities</h3><div class="hm-list">${data.tasks.filter((task) => !task.done).slice(0, 5).map(taskHtml).join("")}</div></article><article class="hm-card"><h3>Working budget</h3><div class="hm-money">${formatMoney(totalBudget, "EUR")}</div><p>Draft estimate. Replace with real quotes as bookings happen.</p><div class="hm-note">Start with flights and route shape. Once dates are locked, hotels and rail become much easier.</div></article></div>`;
  }

  function itinerary() {
    return `<div class="hm-card"><h3>Draft itinerary</h3>${data.itinerary.map((item) => `<div class="hm-row"><div class="hm-day">${escape(item.day)}</div><div><b>${escape(item.city)}</b><p>${escape(item.notes)}</p></div><span class="hm-tag">Draft</span></div>`).join("")}</div>`;
  }

  function flights() {
    return `<div class="honeymoon-two"><article class="hm-card"><h3>Flights & transport</h3>${data.flights.map((item) => `<div class="hm-row"><div class="hm-day">${escape(item.label)}</div><div><b>${escape(item.route)}</b><p>${escape(item.notes)}</p></div><span class="hm-tag">${escape(item.status)}</span></div>`).join("")}</article><article class="hm-card"><h3>Booking questions</h3><ul><li>Do you want Tokyo in and Osaka out, or return from the same city?</li><li>How soon after the SA wedding do you want to travel?</li><li>Do you want a slow luxury ryokan stop or a faster city-heavy route?</li><li>Which Google Maps places are non-negotiable?</li></ul></article></div>`;
  }

  function places() {
    return `<div class="hm-card"><h3>Saved places draft</h3><p>Use these as buckets for your Google Maps saves. Once you share or export the list, each saved place can be copied into the right area.</p><div class="hm-place-grid">${data.places.map((item) => `<div class="hm-place"><b>${escape(item.area)}</b><span>${escape(item.notes)}</span></div>`).join("")}</div></div>`;
  }

  function budget() {
    return `<div class="hm-card"><h3>Budget draft</h3>${data.budget.map((item) => `<div class="hm-row"><div class="hm-day">${escape(item.currency)}</div><div><b>${escape(item.label)}</b><p>${escape(item.notes)}</p></div><span class="hm-tag">${formatMoney(item.amount, item.currency)}</span></div>`).join("")}</div>`;
  }

  function tasks() {
    return `<div class="hm-card"><h3>Honeymoon tasks</h3><div class="hm-list">${data.tasks.map(taskHtml).join("")}</div></div>`;
  }

  function taskHtml(task) {
    return `<label class="hm-item"><input type="checkbox" data-hm-done="${task.id}" ${task.done ? "checked" : ""}><span><b>${escape(task.title)}</b><small>${escape(task.notes)}</small></span><span class="hm-tag">${escape(task.priority)}</span></label>`;
  }

  function addDraftTask() {
    data.tasks.push(item("New honeymoon task", "Click the checkbox when complete; edit details in the next iteration.", "normal"));
    save();
    data.tab = "tasks";
    render();
  }

  function formatMoney(amount, currency) {
    return new Intl.NumberFormat(currency === "EUR" ? "en-IE" : "en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(amount || 0));
  }

  function escape(value) {
    return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }

  waitForPlanner();
})();
