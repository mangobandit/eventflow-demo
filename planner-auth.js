  async function init() {
    const requestedView = location.hash.replace(/^#/, "");
    if (["overview", "tasks", "budget", "guests", "checkin", "vendors", "timeline", "publishing"].includes(requestedView)) state.view = requestedView;
    bindUi();
    if (!configured) {
      els.setupCard.hidden = false;
      els.loginForm.querySelector("button").disabled = true;
      els.authStatus.textContent = "Portal configuration is intentionally incomplete, so no private data can be accessed yet.";
      return;
    }

    state.client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });

    state.client.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => handleSession(session), 0);
    });

    const { data, error } = await state.client.auth.getSession();
    if (error) {
      setAuthStatus(error.message, true);
      return;
    }
    await handleSession(data.session);
  }

  function bindUi() {
    els.loginForm.addEventListener("submit", login);
    document.getElementById("signout-button").addEventListener("click", signOut);
    document.getElementById("mobile-sidebar-toggle").addEventListener("click", () => document.body.classList.toggle("sidebar-open"));
    els.modalClose.addEventListener("click", closeModal);
    els.modal.addEventListener("click", (event) => { if (event.target === els.modal) closeModal(); });
    window.addEventListener("keydown", (event) => { if (event.key === "Escape" && !els.modal.hidden) closeModal(); });

    document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
    document.querySelectorAll("[data-jump]").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.jump)));
    document.querySelectorAll("[data-owner]").forEach((button) => button.addEventListener("click", () => setOwner(button.dataset.owner)));
    document.querySelectorAll("[data-celebration]").forEach((button) => button.addEventListener("click", () => setCelebration(button.dataset.celebration)));
    document.querySelectorAll("[data-add]").forEach((button) => button.addEventListener("click", () => openEntity(button.dataset.add)));
    document.getElementById("global-add").addEventListener("click", () => openEntity(tableForView(state.view)));

    document.querySelectorAll("[data-search-table]").forEach((input) => {
      input.addEventListener("input", () => renderTableBySearch(input.dataset.searchTable, input.value));
    });
  }

  async function login(event) {
    event.preventDefault();
    if (!configured) return;
    const email = els.loginEmail.value.trim().toLowerCase();
    if (!email) return;
    setAuthStatus("Sending your secure sign-in link…");
    const redirectBase = (config.siteUrl || location.origin).replace(/\/$/, "");
    const { error } = await state.client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${redirectBase}/planner.html`, shouldCreateUser: true }
    });
    if (error) return setAuthStatus(error.message, true);
    setAuthStatus("Check your inbox. The link will return you directly to the private planner.");
  }

  async function handleSession(session) {
    if (!session) {
      state.session = null;
      state.identity = null;
      showAuth();
      return;
    }
    if (state.session?.access_token === session.access_token && state.identity) return;
    state.session = session;
    setSync("Checking access…", true);
    const email = session.user.email?.toLowerCase();
    const { data, error } = await state.client
      .from("allowed_users")
      .select("email, planner_person, display_name")
      .eq("email", email)
      .maybeSingle();

    if (error || !data) {
      await state.client.auth.signOut();
      setAuthStatus("This email is not approved for the private wedding planner.", true);
      showAuth();
      return;
    }

    state.identity = data;
    state.owner = data.planner_person === "matt" || data.planner_person === "cara" ? data.planner_person : "shared";
    showPlanner();
    await loadAll();
  }

  function showAuth() {
    els.authScreen.hidden = false;
    els.plannerShell.hidden = true;
  }

  function showPlanner() {
    els.authScreen.hidden = true;
    els.plannerShell.hidden = false;
    els.loading.hidden = false;
    document.querySelectorAll(".planner-view").forEach((panel) => panel.classList.remove("active"));
    els.accountName.textContent = state.identity.display_name || titleCase(state.identity.planner_person || "Planner");
    els.accountEmail.textContent = state.identity.email;
    els.accountAvatar.textContent = (state.identity.display_name || state.identity.planner_person || "P").slice(0, 1).toUpperCase();
    document.querySelectorAll("[data-owner]").forEach((button) => button.classList.toggle("active", button.dataset.owner === state.owner));
  }

  async function signOut() {
    await state.client?.auth.signOut();
    setAuthStatus("Signed out safely.");
    showAuth();
  }

  async function loadAll() {
    setSync("Syncing…", true);
    const tables = Object.keys(state.data);
    const results = await Promise.all(tables.map(async (table) => {
      let query = state.client.from(table).select("*");
      if (table === "timeline_items") query = query.order("item_date", { ascending: true }).order("item_time", { ascending: true, nullsFirst: false });
      else if (table === "content_blocks") query = query.order("sort_order", { ascending: true }).order("updated_at", { ascending: false });
      else query = query.order("updated_at", { ascending: false });
      const response = await query;
      return { table, ...response };
    }));

    const failed = results.find((result) => result.error);
    if (failed) {
      toast(`Could not load ${failed.table}: ${failed.error.message}`, true);
      setSync("Sync problem", false);
      return;
    }
    results.forEach((result) => { state.data[result.table] = result.data || []; });
    els.loading.hidden = true;
    switchView(state.view, false);
    renderAll();
    setSync("Securely synced", false);
  }

  function renderAll() {
    renderOverview();
    renderTasks();
    renderBudget();
    renderGuests();
    renderVendors();
    renderTimeline();
    renderPublishing();
  }

