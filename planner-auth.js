  const PLANNER_SESSION_KEY = "mxc-planner-session-v1";
  const REFRESH_MIN_INTERVAL_MS = 60_000;
  const REFRESH_PERIOD_MS = 5 * 60_000;
  let lastLoadedAt = 0;

  /* The database raises structured PLANNER_* codes (20260701 migration); the
     legacy message strings are still matched so either side can deploy first. */
  const PLANNER_ERROR_COPY = {
    PLANNER_SESSION_EXPIRED: "Your planner session expired. Please sign in again.",
    PLANNER_INVALID_CREDENTIALS: "That username or password is not right.",
    PLANNER_LOCKED: "Too many attempts. Try again in a few minutes.",
    PLANNER_CONFLICT: "This record changed since you opened it. The planner has refreshed — please re-apply your edit.",
    PLANNER_RECORD_NOT_FOUND: "That record no longer exists.",
    PLANNER_UNSUPPORTED_TABLE: "That planner section is not supported yet."
  };

  function plannerErrorCode(error) {
    return (error?.message || "").match(/^PLANNER_[A-Z_]+/)?.[0] || null;
  }

  async function init() {
    const requestedView = location.hash.replace(/^#/, "");
    if (PLANNER_VIEWS.includes(requestedView)) state.view = requestedView;
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

    bindFreshness();
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
      storePlannerSession(response, document.getElementById("login-remember")?.checked ?? true);
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
      lastLoadedAt = Date.now();
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
      announcePlannerReady();
    } catch (error) {
      toast(error.message || "Could not load planner data.", true);
      setSync("Sync problem", false);
    }
  }

  async function plannerRpc(name, payload = {}, options = {}) {
    const { data, error } = await state.client.rpc(name, payload);
    if (error) {
      const code = plannerErrorCode(error);
      const expired = code === "PLANNER_SESSION_EXPIRED"
        || (!code && /session expired|invalid username|password|too many attempts/i.test(error.message || ""));
      if (expired && !options.allowExpired) {
        clearStoredSession();
        state.session = null;
        state.identity = null;
        setAuthStatus(PLANNER_ERROR_COPY.PLANNER_SESSION_EXPIRED, true);
        showAuth();
      }
      const friendly = new Error(PLANNER_ERROR_COPY[code] || error.message || "Planner request failed.");
      friendly.plannerCode = code;
      friendly.rawMessage = error.message || "";
      throw friendly;
    }
    return data;
  }

  /* Two people share this planner. Re-fetch when the window regains focus and
     on a slow heartbeat so neither of them works from stale records. */
  async function refreshPlanner() {
    if (!state.session?.token || document.hidden || state.editing) return;
    if (Date.now() - lastLoadedAt < REFRESH_MIN_INTERVAL_MS) return;
    await loadAll();
  }

  function bindFreshness() {
    window.addEventListener("focus", () => { refreshPlanner(); });
    document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshPlanner(); });
    window.setInterval(() => { refreshPlanner(); }, REFRESH_PERIOD_MS);
  }

  /* "Keep me signed in" controls which storage holds the token: localStorage
     survives closing the browser, sessionStorage ends with the tab. Sessions
     also renew server-side on every authenticated call. */
  function storePlannerSession(response, remember = true) {
    const record = JSON.stringify({
      token: response.session_token,
      expires_at: response.expires_at,
      username: response.identity?.username || ""
    });
    clearStoredSession();
    (remember ? localStorage : sessionStorage).setItem(PLANNER_SESSION_KEY, record);
  }

  function readStoredSession() {
    try {
      return JSON.parse(localStorage.getItem(PLANNER_SESSION_KEY) || sessionStorage.getItem(PLANNER_SESSION_KEY) || "null");
    } catch (_error) {
      clearStoredSession();
      return null;
    }
  }

  function clearStoredSession() {
    localStorage.removeItem(PLANNER_SESSION_KEY);
    sessionStorage.removeItem(PLANNER_SESSION_KEY);
  }

  function renderAll() {
    renderOverview();
    renderTasks();
    renderBudget();
    renderGuests();
    renderCheckin();
    renderVendors();
    renderTimeline();
    renderPublishing();
    renderHoneymoon();
  }

