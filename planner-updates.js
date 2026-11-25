const plannerUpdates = (() => {
  const toggle = document.getElementById("planner-updates-toggle");
  const panel = document.getElementById("planner-updates-panel");
  const badge = document.getElementById("planner-updates-count");
  let session;
  let records = [];
  let lastLoaded = 0;
  let pending = false;

  function dateKey(date) {
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
  }

  function dueItems() {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7);
    const today = dateKey(now);
    const horizon = dateKey(end);
    const items = [];
    const accepts = celebration => state.celebration === "all" || celebration === "shared" || celebration === state.celebration;
    const add = (title, type, date, view, overdue) => {
      if (!date || date > horizon || (!overdue && date < today)) return;
      items.push({ title, type, date, view, overdue: date < today });
    };

    for (const task of state.data.tasks) {
      if (task.status !== "approved" && accepts(task.celebration)) add(task.title, "Action due", task.due_date, "tasks", true);
    }
    for (const item of state.data.budget_items) {
      if (balance(item) > 0 && accepts(item.celebration)) add(item.title, "Payment due", item.due_date, "budget", true);
    }
    for (const record of records) {
      if (!accepts(record.scope)) continue;
      if (record.kind === "reminder" && !record.data.completed) {
        add(record.title, "Reminder", record.data.date, "workspace-calendar", true);
      }
      if (record.kind === "meeting" || (record.kind === "slot" && record.data.booked)) {
        add(record.title, "Meeting", record.data.date, "workspace-calendar", false);
      }
    }
    return items.sort((first, second) => first.date.localeCompare(second.date) || first.title.localeCompare(second.title));
  }

  function paint() {
    const items = dueItems();
    badge.textContent = String(items.length);
    badge.hidden = items.length === 0;
    if (panel.hidden) return;
    panel.innerHTML = '<h2>Planner updates</h2><p>Overdue and due in the next 7 days</p>' + (items.length
      ? '<ul>' + items.map(item => '<li><button type="button" data-update-view="' + item.view + '">' +
        '<b>' + escapeHtml(item.title) + '</b><small>' + escapeHtml(item.type) + ' &middot; ' +
        escapeHtml(item.overdue ? "Overdue " + formatDate(item.date) : formatDate(item.date)) + '</small></button></li>').join("") + '</ul>'
      : '<p class="planner-updates-empty">Nothing due in the next 7 days.</p>');
  }

  function close() {
    panel.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
  }

  async function refresh(force = false) {
    const token = state.session?.token;
    if (!token) return;
    if (token !== session) {
      session = token;
      records = [];
      lastLoaded = 0;
      pending = false;
    }
    paint();
    if (pending || (!force && Date.now() - lastLoaded < 60000)) return;
    pending = true;
    try {
      const result = await plannerRpc("planner_workspace_load", { p_token: token });
      if (session !== token) return;
      records = Array.isArray(result) ? result : [];
      lastLoaded = Date.now();
      paint();
    } catch (_error) {
      // Core action and payment deadlines remain available when the workspace is offline.
    } finally {
      if (session === token) pending = false;
    }
  }

  toggle.addEventListener("click", () => {
    if (!panel.hidden) {
      close();
      return;
    }
    panel.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
    refresh(true);
  });
  panel.addEventListener("click", event => {
    const link = event.target.closest("[data-update-view]");
    if (!link) return;
    close();
    switchView(link.dataset.updateView);
  });
  document.addEventListener("click", event => {
    if (!panel.hidden && !event.target.closest(".planner-updates")) close();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !panel.hidden) {
      close();
      toggle.focus();
    }
  });

  function reset() {
    session = null;
    records = [];
    lastLoaded = 0;
    pending = false;
    badge.hidden = true;
    panel.replaceChildren();
    close();
  }

  return { refresh, reset };
})();
