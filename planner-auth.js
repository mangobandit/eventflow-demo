  const PLANNER_SESSION_KEY = "mxc-planner-session-v1";

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
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });

    await restorePlannerSession();
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

  async function restorePlannerSession() {
    const saved = readStoredSession();
    if (!saved?.token) {
      showAuth();
      return;
    }
    try {
      const session = await plannerRpc("planner_get_session", { p_session_token: saved.token }, { allowExpired: true });
      state.session = { token: saved.token, expires_at: saved.expires_at || null, user: { username: session.identity.username } };
      state.identity = session.identity;
      state.owner = session.identity.planner_person === "matt" || session.identity.planner_person === "cara" ? session.identity.planner_person : "shared";
      showPlanner();
      await loadAll();
    } catch (_error) {
      clearStoredSession();
      showAuth();
    }
  }

  async function login(event) {
    event.preventDefault();
    if (!configured) return;
    const username = els.loginUsername.value.trim().toLowerCase();
    const password = els.loginPassword.value;
    if (!username || !password) return;
    setAuthStatus("Checking planner access...");
    els.loginForm.querySelector("button").disabled = true;
    try {
      const response = await plannerRpc("planner_login", {
        p_username: username,
        p_password: password
      }, { allowExpired: true });
      storePlannerSession(response);
      els.loginPassword.value = "";
      state.session = { token: response.session_token, expires_at: response.expires_at, user: { username: response.identity.username } };
      state.identity = response.identity;
      state.owner = response.identity.planner_person === "matt" || response.identity.planner_person === "cara" ? response.identity.planner_person : "shared";
      showPlanner();
      await loadAll();
    } catch (error) {
      setAuthStatus(error.message || "Could not open the planner.", true);
    } finally {
      els.loginForm.querySelector("button").disabled = false;
    }
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
    els.accountEmail.textContent = state.identity.username;
    els.accountAvatar.textContent = (state.identity.display_name || state.identity.planner_person || "P").slice(0, 1).toUpperCase();
    document.querySelectorAll("[data-owner]").forEach((button) => button.classList.toggle("active", button.dataset.owner === state.owner));
  }

  async function signOut() {
    const token = state.session?.token;
    if (token) {
      try {
        await state.client?.rpc("planner_logout", { p_session_token: token });
      } catch (_error) {
        // Local sign-out should still complete even if the session already expired.
      }
    }
    clearStoredSession();
    state.session = null;
    state.identity = null;
    setAuthStatus("Signed out safely.");
    showAuth();
  }

  async function loadAll() {
    if (!state.session?.token) {
      showAuth();
      return;
    }
    setSync("Syncing...", true);
    try {
      const data = await plannerRpc("planner_load_all", { p_session_token: state.session.token });
      Object.keys(state.data).forEach((table) => {
        state.data[table] = Array.isArray(data?.[table]) ? data[table] : [];
      });
      if (data?.identity) {
        state.identity = data.identity;
        state.owner = data.identity.planner_person === "matt" || data.identity.planner_person === "cara" ? data.identity.planner_person : state.owner;
      }
      els.loading.hidden = true;
      switchView(state.view, false);
      renderAll();
      setSync("Securely synced", false);
    } catch (error) {
      toast(error.message || "Could not load planner data.", true);
      setSync("Sync problem", false);
    }
  }

  async function plannerRpc(name, payload = {}, options = {}) {
    const { data, error } = await state.client.rpc(name, payload);
    if (error) {
      const expired = /session expired|invalid username|password|too many attempts/i.test(error.message || "");
      if (expired && !options.allowExpired) {
        clearStoredSession();
        state.session = null;
        state.identity = null;
        setAuthStatus("Your planner session expired. Please sign in again.", true);
        showAuth();
      }
      throw new Error(error.message || "Planner request failed.");
    }
    return data;
  }

  function storePlannerSession(response) {
    localStorage.setItem(PLANNER_SESSION_KEY, JSON.stringify({
      token: response.session_token,
      expires_at: response.expires_at,
      username: response.identity?.username || ""
    }));
  }

  function readStoredSession() {
    try {
      return JSON.parse(localStorage.getItem(PLANNER_SESSION_KEY) || "null");
    } catch (_error) {
      clearStoredSession();
      return null;
    }
  }

  function clearStoredSession() {
    localStorage.removeItem(PLANNER_SESSION_KEY);
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

