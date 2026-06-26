(() => {
  "use strict";

  const ACCESS_DIGEST = "9be87048f0913385e325dce080fd7684b2a0b29578721a36f0e841c0aee231d5";
  const STORAGE_KEY = "mxc-planner-browser-v3";
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
    if (card?.querySelector(".auth-footnote")) card.querySelector(".auth-footnote").textContent = "Simple PIN access. Planner changes are saved on this browser.";
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
    const status = (value) => {
      const text = String(value || "").toLowerCase();
      if (text.includes("paid") || text.includes("purchased") || text.includes("booked")) return "approved";
      if (text.includes("enquir") || text.includes("sent") || text.includes("deposit")) return "pending";
      return "outstanding";
    };
    const task = (title, owner, celebration, category, priority, stateText, notes = "", due = null) => ({ id: id(), title, description: notes, owner, celebration, category, priority, status: status(stateText), due_date: due, notes: `Spreadsheet status: ${stateText || "TBC"}`, created_at: now, updated_at: now });
    const budget = (title, owner, celebration, category, currency, total, deposit, paid, due, stateText, notes = "") => ({ id: id(), title, owner, celebration, category, currency, estimated: Number(total || 0), deposit: Number(deposit || 0), paid: Number(paid ?? deposit ?? 0), due_date: due, status: status(stateText), notes: [notes, `Spreadsheet status: ${stateText || "TBC"}`].filter(Boolean).join(" · "), created_at: now, updated_at: now });
    const vendor = (name, celebration, category, quote, currency, stateText, action, notes = "") => ({ id: id(), name, owner: "shared", celebration, category, contact_name: "", email: "", phone: "", currency, quote_amount: Number(quote || 0), next_action: action, due_date: null, status: status(stateText), notes: [notes, `Spreadsheet status: ${stateText || "TBC"}`].filter(Boolean).join(" · "), created_at: now, updated_at: now });
    const timeline = (title, celebration, date, time, location, stateText, notes = "") => ({ id: id(), title, owner: "shared", celebration, item_date: date, item_time: time, audience: "guest", location, sort_order: 0, status: status(stateText), notes, created_at: now, updated_at: now });

    const tasks = [
      task("Reply to Labola", "shared", "south_africa", "Vendors", "normal", "Booked and paid", "To Do sheet item completed."),
      task("Reply to Spanish Photographer", "shared", "spain", "Vendors", "normal", "Booked and paid", "To Do sheet item completed."),
      task("Reply to Hamblins Catering", "shared", "spain", "Catering", "normal", "Booked and paid", "To Do sheet item completed."),
      task("Fill in Gibraltar forms", "shared", "shared", "Legal", "high", "To be booked", "Civil ceremony paperwork still outstanding."),
      task("Civil Ceremony", "shared", "shared", "Legal", "high", "To be booked", "Misc Items total cost: 500."),
      task("Wedding Ring Matt", "matt", "shared", "Rings", "normal", "To be booked", "Track choice, sizing, order and collection."),
      task("Matt Outfit CC", "matt", "shared", "Attire", "normal", "To be bought", "Civil ceremony outfit."),
      task("Matt Suit Spain", "matt", "spain", "Attire", "high", "To be bought", "Spain groom outfit / Rodeo Western styling."),
      task("Matt Suit SA", "matt", "south_africa", "Attire", "high", "To be bought", "South Africa groom outfit / Rodeo Western styling."),
      task("Wedding Ring Cara", "cara", "shared", "Rings", "normal", "To be bought", "Track choice, sizing, order and collection."),
      task("Cara Outfit CC", "cara", "shared", "Attire", "normal", "Booked & paid", "Civil ceremony outfit. Cost in spreadsheet: 120."),
      task("Cara Dress Spain", "cara", "spain", "Attire", "high", "Purchased & deposit paid", "Spain dress purchased / deposit paid."),
      task("Cara Dress SA", "cara", "south_africa", "Attire", "high", "Purchased & deposit paid", "South Africa dress purchased / deposit paid."),
      task("Bridesmaid Dresses Spain", "cara", "spain", "Attire", "normal", "To be bought", "x 4/5 dresses. Spreadsheet total: 500."),
      task("Bridesmaid Dresses SA", "cara", "south_africa", "Attire", "normal", "To be bought", "x 1 dress."),
      task("Flowergirl Dresses", "cara", "shared", "Attire", "normal", "To be bought", "x 1 or 2 dresses. Spreadsheet total: 70."),
      task("Groomsmen Suits Spain", "matt", "spain", "Attire", "normal", "To be bought", "x 2 suits."),
      task("Groomsmen Suits SA", "matt", "south_africa", "Attire", "normal", "To be bought", "x 4 suits."),
      task("Mac Bow Tie", "matt", "shared", "Attire", "low", "To be bought", "Spreadsheet note: handsome man."),
      task("Spain catering follow-up", "shared", "spain", "Catering", "high", "Enquiries sent", "Western BBQ catering: 140pp for 60 people."),
      task("Spain cake and desserts", "shared", "spain", "Catering", "normal", "Enquiries sent", "Wedding cake and desserts."),
      task("Spain photographer/videographer", "shared", "spain", "Vendors", "high", "Enquiries sent", "White & Wild."),
      task("Spain decoration, brand, prints and tokens", "shared", "spain", "Decor", "normal", "To be booked", "Spreadsheet total: 1000."),
      task("Spain AV and lighting", "shared", "spain", "Production", "normal", "To be booked", "Spreadsheet total: 1000."),
      task("Spain transport", "shared", "spain", "Transport", "high", "To be booked", "Build Chiclana/Jerez route groups."),
      task("Spain hair", "cara", "spain", "Beauty", "normal", "Enquiries sent", "Spreadsheet total: 500."),
      task("Spain make up", "cara", "spain", "Beauty", "normal", "Enquiries sent", "Spreadsheet total: 500."),
      task("Spain DJ / entertainment", "shared", "spain", "Music", "normal", "To be booked", "Rodeo Western music brief. Spreadsheet total: 750."),
      task("SA catering", "shared", "south_africa", "Catering", "high", "To be booked", "Spreadsheet remaining/total: R40,000."),
      task("SA drinks / bar", "shared", "south_africa", "Bar", "high", "To be booked", "Spreadsheet remaining/total: R20,000."),
      task("SA transport", "shared", "south_africa", "Transport", "high", "To be booked", "Durban/Howick routing. Spreadsheet total: R10,000."),
      task("SA DJ / entertainment", "shared", "south_africa", "Music", "normal", "To be booked", "Rodeo Western music brief. Spreadsheet total: R10,000."),
      task("SA hair and make up", "cara", "south_africa", "Beauty", "normal", "To be booked", "Spreadsheet total: R10,000."),
      task("SA wedding cake", "shared", "south_africa", "Catering", "normal", "To be booked", "Cost still missing in spreadsheet."),
      task("Spain guest list follow-up", "shared", "spain", "Guests", "high", "Enquiries sent", "90 guest rows; 89 invited; 56 yes; 4 no; 22 transport yes; 8 transport TBC; 8 dietary flags. Names are not committed to the public repo."),
      task("SA guest list follow-up", "shared", "south_africa", "Guests", "high", "Enquiries sent", "69 guest rows; 68 invited; 58 yes; 3 TBC; 10 transport yes; 37 transport TBC; 5 dietary flags. Names are not committed to the public repo."),
      task("Rodeo Western theme applied to both weddings", "shared", "shared", "Theme", "normal", "Booked & paid", "Western music, great BBQ food, cowboy boots, hats, leather and denim encouraged.")
    ];

    const budgetItems = [
      budget("Civil Ceremony", "shared", "shared", "Legal", "EUR", 500, 0, 0, null, "To be booked"),
      budget("Cara Outfit CC", "cara", "shared", "Attire", "EUR", 120, 120, 120, null, "Booked & paid"),
      budget("Cara Dress Spain", "cara", "spain", "Attire", "EUR", 0, 0, 0, null, "Purchased & deposit paid"),
      budget("Cara Dress SA", "cara", "south_africa", "Attire", "EUR", 0, 0, 0, null, "Purchased & deposit paid"),
      budget("Bridesmaid Dresses Spain", "cara", "spain", "Attire", "EUR", 500, 0, 0, null, "To be bought", "x 4/5 dresses"),
      budget("Bridesmaid Dresses SA", "cara", "south_africa", "Attire", "EUR", 0, 0, 0, null, "To be bought", "x 1 dress"),
      budget("Flowergirl Dresses", "cara", "shared", "Attire", "EUR", 70, 0, 0, null, "To be bought", "x 1 or 2 dresses"),
      budget("Spain Venue", "shared", "spain", "Venue", "EUR", 5082, 1524.6, 1524.6, null, "Booked & paid", "Remaining in spreadsheet: 3557.40"),
      budget("Spain Accommodation", "shared", "spain", "Accommodation", "EUR", 1000, 0, 0, null, "Booked & paid", "Remaining in spreadsheet: 1000"),
      budget("Spain Catering", "shared", "spain", "Catering", "EUR", 8400, 0, 0, null, "Enquiries sent", "140pp for 60 people"),
      budget("Spain Cake & desserts", "shared", "spain", "Catering", "EUR", 500, 0, 0, null, "Enquiries sent", "Wedding cake, desserts"),
      budget("Spain Drinks / Bar Costs", "shared", "spain", "Bar", "EUR", 0, 0, 0, null, "To be booked", "Included in catering costs"),
      budget("Spain Photographer / Videographer", "shared", "spain", "Photo / video", "EUR", 4200, 0, 0, null, "Enquiries sent", "White & Wild"),
      budget("Spain Decoration, brand, prints & tokens", "shared", "spain", "Decor", "EUR", 1000, 0, 0, null, "To be booked"),
      budget("Spain AV & lighting", "shared", "spain", "Production", "EUR", 1000, 0, 0, null, "To be booked"),
      budget("Spain Furniture hire", "shared", "spain", "Furniture", "EUR", 1000, 0, 0, null, "To be booked", "Included in catering costs"),
      budget("Spain Transport", "shared", "spain", "Transport", "EUR", 1000, 0, 0, null, "To be booked"),
      budget("Spain Hair", "cara", "spain", "Beauty", "EUR", 500, 0, 0, null, "Enquiries sent"),
      budget("Spain Make Up", "cara", "spain", "Beauty", "EUR", 500, 0, 0, null, "Enquiries sent"),
      budget("Spain DJ / Entertainment", "shared", "spain", "Music", "EUR", 750, 0, 0, null, "To be booked", "TBC"),
      budget("SA Venue & Accommodation", "shared", "south_africa", "Venue", "ZAR", 80000, 25000, 25000, null, "Booked and paid", "Remaining in spreadsheet: R55,000"),
      budget("SA Venue breakages deposit", "shared", "south_africa", "Venue", "ZAR", 2000, 2000, 2000, null, "Booked and paid", "Refundable"),
      budget("SA Photographer / Videographer", "shared", "south_africa", "Photo / video", "ZAR", 25800, 25800, 25800, null, "Booked and paid"),
      budget("SA Decoration", "shared", "south_africa", "Decor", "ZAR", 0, 0, 0, null, "To be booked", "Included / N/A in spreadsheet"),
      budget("SA Florals", "shared", "south_africa", "Florals", "ZAR", 0, 0, 0, null, "To be booked", "Included / N/A in spreadsheet"),
      budget("SA Catering", "shared", "south_africa", "Catering", "ZAR", 40000, 0, 0, null, "To be booked"),
      budget("SA Drinks / Bar Costs", "shared", "south_africa", "Bar", "ZAR", 20000, 0, 0, null, "To be booked"),
      budget("SA Transport", "shared", "south_africa", "Transport", "ZAR", 10000, 0, 0, null, "To be booked"),
      budget("SA DJ / Entertainment", "shared", "south_africa", "Music", "ZAR", 10000, 0, 0, null, "To be booked"),
      budget("SA Hair & Make Up", "cara", "south_africa", "Beauty", "ZAR", 10000, 0, 0, null, "To be booked"),
      budget("SA Wedding Cake", "shared", "south_africa", "Catering", "ZAR", 0, 0, 0, null, "To be booked", "Cost still missing in spreadsheet")
    ];

    return {
      tasks,
      budget_items: budgetItems,
      guests: [],
      vendors: [
        vendor("Finca Mesa Jardín", "spain", "Venue", 5082, "EUR", "Booked & paid", "Confirm final timing and venue rules"),
        vendor("Spain BBQ catering", "spain", "Catering", 8400, "EUR", "Enquiries sent", "Confirm Western BBQ menu, service style and dietaries"),
        vendor("Spain cake & desserts", "spain", "Catering", 500, "EUR", "Enquiries sent", "Confirm cake, desserts and delivery"),
        vendor("White & Wild", "spain", "Photo / video", 4200, "EUR", "Enquiries sent", "Confirm package and availability"),
        vendor("Spain transport supplier", "spain", "Transport", 1000, "EUR", "To be booked", "Quote Chiclana and Jerez routes"),
        vendor("Spain DJ / entertainment", "spain", "Music", 750, "EUR", "To be booked", "Build Rodeo Western music brief"),
        vendor("Mission House", "south_africa", "Venue", 80000, "ZAR", "Booked and paid", "Confirm rooms, rules and supplier list"),
        vendor("SA photographer / videographer", "south_africa", "Photo / video", 25800, "ZAR", "Booked and paid", "Confirm shot list and timeline"),
        vendor("Labola SA", "south_africa", "Decor", 0, "ZAR", "To be booked", "Confirm decor, tables, chairs and florals"),
        vendor("SA catering", "south_africa", "Catering", 40000, "ZAR", "To be booked", "Choose supplier and BBQ menu"),
        vendor("SA bar service", "south_africa", "Bar", 20000, "ZAR", "To be booked", "Confirm bar package, ice, staffing and cut-off"),
        vendor("SA transport supplier", "south_africa", "Transport", 10000, "ZAR", "To be booked", "Quote Durban and Howick routes"),
        vendor("SA DJ / entertainment", "south_africa", "Music", 10000, "ZAR", "To be booked", "Build Rodeo Western music brief")
      ],
      timeline_items: [
        timeline("Spain guest arrival", "spain", "2026-10-10", "17:30", "Finca Mesa Jardín", "Enquiries sent", "Provisional from planner."),
        timeline("Spain ceremony", "spain", "2026-10-10", "18:00", "Finca Mesa Jardín", "Enquiries sent", "Provisional from planner."),
        timeline("Spain celebration cut-off", "spain", "2026-10-11", "00:00", "Finca Mesa Jardín", "To be booked", "Transport departure / goodbye window."),
        timeline("South Africa guest arrival", "south_africa", "2026-12-19", "16:30", "Mission House", "Enquiries sent", "Provisional from planner."),
        timeline("South Africa ceremony", "south_africa", "2026-12-19", "17:30", "Mission House", "Enquiries sent", "Provisional from planner."),
        timeline("South Africa celebration cut-off", "south_africa", "2026-12-19", "23:30", "Mission House", "To be booked", "Transport departure / goodbye window.")
      ],
      content_blocks: [
        { id: id(), slug: "rodeo-western-theme", section: "announcement", country: "both", title: "Rodeo-style wedding theme", body: "We're embracing our love of Western music and great BBQ food by hosting Rodeo-style weddings. Cowboy boots, hats, leather and denim are welcome, and encouraged!", owner: "shared", sort_order: 1, published: false, publish_at: null, created_at: now, updated_at: now }
      ]
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
