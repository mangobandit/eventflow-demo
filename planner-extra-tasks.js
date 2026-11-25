(() => {
  "use strict";

  let activeToken;
  let defaultsRequest;

  function reset() {
    activeToken = null;
    defaultsRequest = null;
  }

  function mergeDefaults(defaults) {
    let added = false;
    for (const table of ["tasks", "timeline_items"]) {
      if (!Array.isArray(defaults?.[table])) continue;
      const rows = state.data[table];
      const titles = new Set(rows.map(row => String(row.title || "").toLowerCase()));
      for (const row of defaults[table]) {
        const title = row.title.toLowerCase();
        if (titles.has(title)) continue;
        rows.push({ ...row });
        titles.add(title);
        added = true;
      }
    }
    if (added) renderAll();
  }

  async function refresh() {
    const token = state.session?.token;
    if (!token || state.identity?.planning_scope !== "all" || !els.loading.hidden) {
      reset();
      return;
    }
    if (activeToken !== token) {
      reset();
      activeToken = token;
    }
    if (!defaultsRequest) {
      defaultsRequest = plannerRpc("planner_load_owner_defaults", {
        p_session_token: token,
        p_kind: "checklist"
      });
    }
    try {
      const defaults = await defaultsRequest;
      if (activeToken === token && state.session?.token === token && state.identity?.planning_scope === "all") {
        mergeDefaults(defaults);
      }
    } catch (_error) {
      if (activeToken === token) defaultsRequest = null;
    }
  }

  document.addEventListener("planner-data-loaded", refresh);
  document.addEventListener("planner-session-cleared", reset);
  refresh();
})();
