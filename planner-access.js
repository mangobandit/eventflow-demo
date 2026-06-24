(() => {
  "use strict";

  const ACCESS_DIGEST = "9be87048f0913385e325dce080fd7684b2a0b29578721a36f0e841c0aee231d5";
  const STORAGE_KEY = "mxc-planner-browser-v1";
  const SESSION_KEY = "mxc-planner-open";
  let bound = false;

  async function start() {
    cleanUrl();
    configureGate();
    bindGate();
    if (sessionStorage.getItem(SESSION_KEY) === "yes") openPlanner();
  }

  function configureGate() {
    const card = document.querySelector(".auth-card");
    const title = card?.querySelector("h2");
    const intro = card?.querySelector("h2 + p");
    const label = els.loginForm.querySelector("label");
    const button = els.loginForm.querySelector("button");

    if (card?.querySelector(".eyebrow")) card.querySelector(".eyebrow").textContent = "Couple access";
    if (title) title.textContent = "Enter the planner";
    if (intro) intro.textContent = "Enter the four-digit PIN to open Matt and Cara's planning dashboard.";
    if (label) label.firstChild.textContent = "PIN code";
    els.loginEmail.type = "password";
    els.loginEmail.inputMode = "numeric";
    els.loginEmail.autocomplete = "current-password";
    els.loginEmail.maxLength = 4;
    els.loginEmail.pattern = "[0-9]{4}";
    els.loginEmail.placeholder = "••••";
    button.disabled = false;
    button.textContent = "Open planner";
    els.setupCard.hidden = true;
    if (card?.querySelector(".auth-footnote")) card.querySelector(".auth-footnote").textContent = "A simple privacy screen. Changes are saved on this browser.";
    setAuthStatus("");
  }

  function bindGate() {
    els.loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const digest = await hash(els.loginEmail.value.trim());
      if (digest !== ACCESS_DIGEST) {
        setAuthStatus("That PIN is not correct.", true);
        els.loginEmail.select();
        return;
      }
      sessionStorage.setItem(SESSION_KEY, "yes");
      openPlanner();
    }, true);
  }

  async function hash(value) {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function openPlanner() {
    state.session = { user: { id: "pin-access" } };
    state.identity = { display_name: "Matt & Cara", planner_person: "shared", email: "PIN access" };
    state.owner = "shared";
    state.celebration = "all";
    loadData();
    bindPlanner();
    saveEntity = saveLocalEntity;
    deleteEntity = deleteLocalEntity;

    els.authScreen.hidden = true;
    els.plannerShell.hidden = false;
    els.loading.hidden = true;
    els.accountName.textContent = "Matt & Cara";
    els.accountEmail.textContent = "PIN access";
    els.accountAvatar.textContent = "M";

    const requested = location.hash.replace(/^#/, "");
    state.view = ["overview", "tasks", "budget", "guests", "vendors", "timeline", "publishing"].includes(requested) ? requested : "overview";
    switchView(state.view, false);
    renderAll();
    setSync("Saved on this browser", false);
  }

  function bindPlanner() {
    if (bound) return;
    bound = true;
    document.getElementById("signout-button")?.addEventListener("click", () => {
      sessionStorage.removeItem(SESSION_KEY);
      els.plannerShell.hidden = true;
      els.authScreen.hidden = false;
      els.loginEmail.value = "";
    });
    document.getElementById("mobile-sidebar-toggle")?.addEventListener("click", () => document.body.classList.toggle("sidebar-open"));
    els.modalClose?.addEventListener("click", closeModal);
    els.modal?.addEventListener("click", (event) => { if (event.target === els.modal) closeModal(); });
    window.addEventListener("keydown", (event) => { if (event.key === "Escape" && !els.modal.hidden) closeModal(); });
    document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
    document.querySelectorAll("[data-jump]").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.jump)));
    document.querySelectorAll("[data-owner]").forEach((button) => button.addEventListener("click", () => setOwner(button.dataset.owner)));
    document.querySelectorAll("[data-celebration]").forEach((button) => button.addEventListener("click", () => setCelebration(button.dataset.celebration)));
    document.querySelectorAll("[data-add]").forEach((button) => button.addEventListener("click", () => openEntity(button.dataset.add)));
    document.getElementById("global-add")?.addEventListener("click", () => openEntity(tableForView(state.view)));
    document.querySelectorAll("[data-search-table]").forEach((input) => input.addEventListener("input", () => renderTableBySearch(input.dataset.searchTable, input.value)));
    new MutationObserver(() => document.querySelector('[data-view="invitations"]')?.setAttribute("hidden", "")).observe(document.querySelector(".planner-nav"), { childList: true });
  }

  async function saveLocalEntity(event) {
    event.preventDefault();
    const { table, record } = state.editing;
    const definition = definitions[table];
    const formData = new FormData(els.entityForm);
    const payload = {};
    definition.fields.forEach((spec) => {
      let value = spec.type === "checkbox" ? els.entityForm.elements[spec.name].checked : formData.get(spec.name);
      if (spec.type === "number") value = value === "" ? null : Number(value);
      else if (spec.type === "datetime-local") value = value ? new Date(value).toISOString() : null;
      else if (typeof value === "string") value = value.trim() || null;
      payload[spec.name] = value;
    });
    if (table === "content_blocks" && !payload.slug) payload.slug = slugify(payload.title);
    const now = new Date().toISOString();
    if (record) {
      const index = state.data[table].findIndex((item) => item.id === record.id);
      state.data[table][index] = { ...record, ...payload, updated_at: now };
    } else {
      state.data[table].unshift({ ...payload, id: crypto.randomUUID(), created_by: "pin-access", created_at: now, updated_at: now });
    }
    persist();
    closeModal();
    renderAll();
    toast(`${definition.title} saved.`);
  }

  async function deleteLocalEntity() {
    const { table, record } = state.editing;
    if (!record || !window.confirm(`Delete this ${definitions[table].singular}?`)) return;
    state.data[table] = state.data[table].filter((item) => item.id !== record.id);
    persist();
    closeModal();
    renderAll();
    toast(`${definitions[table].title} deleted.`);
  }

  function loadData() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (saved) {
        Object.keys(state.data).forEach((table) => { state.data[table] = Array.isArray(saved[table]) ? saved[table] : []; });
        return;
      }
    } catch (_error) {
      localStorage.removeItem(STORAGE_KEY);
    }
    state.data = seedData();
    persist();
  }

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
    setSync("Saved on this browser", false);
  }

  function seedData() {
    const now = new Date().toISOString();
    const id = () => crypto.randomUUID();
    return {
      tasks: [
        { id: id(), title: "Confirm Spain ceremony timing", description: "Lock arrival, ceremony and transport departure windows.", owner: "shared", celebration: "spain", category: "Timeline", priority: "high", status: "outstanding", due_date: "2026-08-15", notes: "", created_at: now, updated_at: now },
        { id: id(), title: "Cara personal planning list", description: "Cara-only decisions stay separate from the shared board.", owner: "cara", celebration: "shared", category: "Personal", priority: "normal", status: "pending", due_date: "2026-07-20", notes: "", created_at: now, updated_at: now },
        { id: id(), title: "Matt speech and MC flow", description: "Draft speech beats, thank-yous and cues.", owner: "matt", celebration: "south_africa", category: "Personal", priority: "normal", status: "outstanding", due_date: "2026-10-30", notes: "", created_at: now, updated_at: now },
        { id: id(), title: "Choose South Africa caterer", description: "Compare menu, quote and dietary options.", owner: "shared", celebration: "south_africa", category: "Vendors", priority: "high", status: "outstanding", due_date: "2026-08-31", notes: "", created_at: now, updated_at: now },
        { id: id(), title: "Spain venue deposit recorded", description: "Deposit recorded in the planner.", owner: "shared", celebration: "spain", category: "Budget", priority: "low", status: "approved", due_date: "2026-05-30", notes: "", created_at: now, updated_at: now }
      ],
      budget_items: [
        { id: id(), title: "Spain venue", owner: "shared", celebration: "spain", category: "Venue", currency: "EUR", estimated: 5082, deposit: 1524.6, paid: 1524.6, due_date: "2026-08-15", status: "pending", notes: "", created_at: now, updated_at: now },
        { id: id(), title: "Spain catering estimate", owner: "shared", celebration: "spain", category: "Catering", currency: "EUR", estimated: 8400, deposit: 0, paid: 0, due_date: "2026-08-31", status: "outstanding", notes: "", created_at: now, updated_at: now },
        { id: id(), title: "Mission House venue", owner: "shared", celebration: "south_africa", category: "Venue", currency: "ZAR", estimated: 80000, deposit: 25000, paid: 25000, due_date: "2026-09-30", status: "pending", notes: "", created_at: now, updated_at: now }
      ],
      guests: [],
      vendors: [
        { id: id(), name: "Finca Mesa Jardín", owner: "shared", celebration: "spain", category: "Venue", contact_name: "Venue team", email: "", phone: "", currency: "EUR", quote_amount: 5082, next_action: "Confirm final timing", due_date: "2026-08-15", status: "pending", notes: "", created_at: now, updated_at: now },
        { id: id(), name: "Mission House", owner: "shared", celebration: "south_africa", category: "Venue", contact_name: "Venue team", email: "", phone: "", currency: "ZAR", quote_amount: 80000, next_action: "Confirm supplier rules", due_date: "2026-09-15", status: "pending", notes: "", created_at: now, updated_at: now }
      ],
      timeline_items: [
        { id: id(), title: "Spain guest arrival", owner: "shared", celebration: "spain", item_date: "2026-10-10", item_time: "17:30", audience: "guest", location: "Finca Mesa Jardín", sort_order: 10, status: "pending", notes: "", created_at: now, updated_at: now },
        { id: id(), title: "Spain ceremony", owner: "shared", celebration: "spain", item_date: "2026-10-10", item_time: "18:00", audience: "guest", location: "Finca Mesa Jardín", sort_order: 20, status: "pending", notes: "", created_at: now, updated_at: now },
        { id: id(), title: "South Africa guest arrival", owner: "shared", celebration: "south_africa", item_date: "2026-12-19", item_time: "16:30", audience: "guest", location: "Mission House", sort_order: 10, status: "pending", notes: "", created_at: now, updated_at: now }
      ],
      content_blocks: []
    };
  }

  function cleanUrl() {
    const url = new URL(location.href);
    const keys = [...url.searchParams.keys()].filter((key) => key.toLowerCase().startsWith("utm_") || ["source", "ref", "fbclid", "gclid"].includes(key.toLowerCase()));
    keys.forEach((key) => url.searchParams.delete(key));
    if (keys.length) history.replaceState(null, document.title, `${url.pathname}${url.search}${url.hash}`);
  }

  start();
})();
