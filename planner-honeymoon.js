(() => {
  "use strict";

  const STORE = "mxc-honeymoon-japan-v1";
  let data = null;
  let mountedToken = null;
  let storageKey = null;
  let request = null;

  function ownerToken() {
    return state.identity?.planning_scope === "all" ? state.session?.token : null;
  }

  function reset() {
    data = null;
    mountedToken = null;
    storageKey = null;
    request = null;
    document.querySelector('[data-view="honeymoon"]')?.remove();
    document.querySelector('[data-view-panel="honeymoon"]')?.remove();
  }

  function refresh() {
    const token = ownerToken();
    if (!token) {
      reset();
      return;
    }
    if (mountedToken === token) return;
    reset();
    mountedToken = token;
    storageKey = `${STORE}:${state.identity.username}`;
    addStyles();
    addNav();
    addPanel();
    bind();
    if (state.view === "honeymoon") switchHoneymoon();
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
    const icon = document.createElement("span");
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "\u2708\uFE0E";
    button.append(icon, "Honeymoon");
    const destination = nav.querySelector('[data-nav-items="tools"]') || nav;
    destination.appendChild(button);
  }

  function addPanel() {
    const content = document.querySelector(".planner-content");
    if (!content || content.querySelector('[data-view-panel="honeymoon"]')) return;
    const panel = document.createElement("section");
    panel.className = "planner-view";
    panel.dataset.viewPanel = "honeymoon";
    panel.innerHTML = `
      <div class="honeymoon-hero">
        <p class="eyebrow">Private travel planning</p>
        <h2>Honeymoon</h2>
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
    document.querySelectorAll("[data-hm-tab]").forEach((button) => button.addEventListener("click", () => {
      if (!data || ownerToken() !== mountedToken) return;
      data.tab = button.dataset.hmTab;
      save();
      render();
    }));
  }

  function switchHoneymoon() {
    const token = ownerToken();
    if (!token || mountedToken !== token) return;
    state.view = "honeymoon";
    if (history.replaceState) history.replaceState(null, "", "#honeymoon");
    if (typeof updatePlannerNavigation === "function") updatePlannerNavigation("honeymoon");
    else document.querySelectorAll("[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === "honeymoon"));
    document.querySelectorAll("[data-view-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.viewPanel === "honeymoon"));
    els.topbarTitle.textContent = "Honeymoon";
    els.topbarSubtitle.textContent = "Draft itinerary and booking tracker";
    const addButton = document.getElementById("global-add");
    addButton.textContent = "+ Add honeymoon task";
    addButton.hidden = false;
    document.body.classList.remove("sidebar-open");
    if (data) render();
    else if (!request) request = load(token);
  }

  function isDraft(value) {
    return value && ["tasks", "itinerary", "flights", "places", "budget"].every(key => Array.isArray(value[key]));
  }

  function loadBrowserDraft() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (isDraft(saved)) return saved;
    } catch (_error) {
      // If browser storage is unavailable, load the private server defaults.
    }
    try {
      const legacy = JSON.parse(localStorage.getItem(STORE) || "null");
      if (isDraft(legacy)) {
        localStorage.setItem(storageKey, JSON.stringify(legacy));
        localStorage.removeItem(STORE);
        return legacy;
      }
    } catch (_error) {
      // Leave a legacy draft intact if it could not be migrated.
    }
    return null;
  }

  async function load(token) {
    const root = document.getElementById("honeymoon-root");
    if (!root) return;
    root.textContent = "Loading honeymoon planner…";
    try {
      const draft = await (loadBrowserDraft() || plannerRpc("planner_load_owner_defaults", {
        p_session_token: token,
        p_kind: "honeymoon"
      }));
      if (mountedToken !== token || ownerToken() !== token) return;
      if (!isDraft(draft)) throw new Error("Missing honeymoon defaults");
      data = draft;
      render();
    } catch (_error) {
      if (mountedToken !== token || ownerToken() !== token) return;
      root.textContent = "The honeymoon planner could not load. ";
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "secondary-action";
      retry.textContent = "Try again";
      retry.addEventListener("click", switchHoneymoon);
      root.appendChild(retry);
    } finally {
      if (mountedToken === token) request = null;
    }
  }

  function save() {
    if (!data || !storageKey || ownerToken() !== mountedToken) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(data));
    } catch (_error) {
      toast("This browser could not save your honeymoon changes.", true);
    }
  }

  function item(title, notes, priority) { return { id: crypto.randomUUID(), title, notes, priority, done: false }; }

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
    return `<div class="honeymoon-two"><article class="hm-card"><h3>Flights & transport</h3>${data.flights.map((item) => `<div class="hm-row"><div class="hm-day">${escape(item.label)}</div><div><b>${escape(item.route)}</b><p>${escape(item.notes)}</p></div><span class="hm-tag">${escape(item.status)}</span></div>`).join("")}</article><article class="hm-card"><h3>Booking questions</h3><ul><li>Would you rather arrive and depart from the same city?</li><li>How soon after the wedding do you want to travel?</li><li>Would you prefer a slower trip or more time in cities?</li><li>Which Google Maps places are non-negotiable?</li></ul></article></div>`;
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
    return `<label class="hm-item"><input type="checkbox" data-hm-done="${escape(task.id)}" ${task.done ? "checked" : ""}><span><b>${escape(task.title)}</b><small>${escape(task.notes)}</small></span><span class="hm-tag">${escape(task.priority)}</span></label>`;
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

  document.getElementById("global-add")?.addEventListener("click", (event) => {
    if (state.view !== "honeymoon") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (data && ownerToken() === mountedToken) addDraftTask();
  }, true);
  document.addEventListener("planner-data-loaded", refresh);
  document.addEventListener("planner-session-cleared", reset);
  refresh();
})();
