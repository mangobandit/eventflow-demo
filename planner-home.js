const plannerHome = (function createPlannerHome() {
  "use strict";

  const root = document.getElementById("plannerHome");
  const monthFormat = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });
  const fullDateFormat = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const projectDateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const shortcuts = [
    ["tasks", "Wedding actions", "✓"], ["guests", "Guest list", "◎"],
    ["seating", "Seating plan", "⊞"], ["budget", "Budget", "€"],
    ["workspace-venue", "Venue designer", "◫"], ["workspace-calendar", "Schedule a meeting", "◷"]
  ];
  const workspaceKinds = {
    project_task: ["Project action", "projects"],
    project_timeline: ["Project milestone", "projects"],
    meeting: ["Appointment", "calendar"],
    slot: ["Booked appointment", "calendar"],
    reminder: ["Reminder", "calendar"]
  };

  let selected = new Date();
  let projectId = "all";
  let celebrationFilter;

  function dayKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function fromDay(day) {
    return new Date(`${day}T12:00:00`);
  }

  function reset() {
    selected = new Date();
    projectId = "all";
    celebrationFilter = undefined;
    root?.replaceChildren();
  }

  function entries({ projects, records }) {
    const result = [];
    const includes = scope => projectId === "all" || scope === projectId || scope === "shared";
    const append = item => {
      if (includes(item.scope) && /^\d{4}-\d{2}-\d{2}$/.test(item.date || "")) {
        result.push({ ...item, time: typeof item.time === "string" ? item.time.slice(0, 5) : "" });
      }
    };

    for (const row of filtered("tasks", { ignoreCelebration: true })) {
      if (row.status !== "approved") {
        append({ title: row.title, date: row.due_date, scope: row.celebration, label: "Action due", table: "tasks", id: row.id });
      }
    }
    for (const row of filtered("budget_items", { ignoreCelebration: true })) {
      if (balance(row) > 0) {
        append({ title: row.title, date: row.due_date, scope: row.celebration, label: "Payment due", table: "budget_items", id: row.id });
      }
    }
    for (const row of filtered("timeline_items", { ignoreCelebration: true })) {
      append({ title: row.title, date: row.item_date, time: row.item_time, scope: row.celebration, label: "Timeline", table: "timeline_items", id: row.id });
    }
    for (const project of projects) {
      append({ title: project.title, date: project.date, scope: project.id, label: "Wedding date", tool: "projects" });
    }
    for (const row of records) {
      const type = workspaceKinds[row.kind];
      const data = row.data || {};
      if (!type || data.completed === true || (row.kind === "slot" && data.booked !== true)) continue;
      append({ title: row.title, date: data.date, time: data.time, scope: row.scope, label: type[0], tool: type[1], id: row.id });
    }

    const byDate = new Map();
    for (const item of result.sort((a, b) => a.time.localeCompare(b.time) || a.title.localeCompare(b.title))) {
      const day = byDate.get(item.date) || [];
      day.push(item);
      byDate.set(item.date, day);
    }
    return byDate;
  }

  function monthGrid(byDate, today) {
    const year = selected.getFullYear();
    const month = selected.getMonth();
    const first = new Date(year, month, 1, 12);
    const dayCount = new Date(year, month + 1, 0, 12).getDate();
    const offset = (first.getDay() + 6) % 7;
    return `<div class="planner-home-weekdays" aria-hidden="true">${weekdays.map(day => `<span>${day}</span>`).join("")}</div>
      <div class="planner-home-month" role="group" aria-label="${monthFormat.format(first)} calendar">
        ${'<span class="planner-home-date-spacer" aria-hidden="true"></span>'.repeat(offset)}
        ${Array.from({ length: dayCount }, (_, index) => {
          const date = new Date(year, month, index + 1, 12);
          const key = dayKey(date);
          const count = byDate.get(key)?.length || 0;
          const active = dayKey(selected) === key;
          return `<button type="button" class="planner-home-day" data-home-day="${key}" data-home-focus="${key}"
            aria-label="${fullDateFormat.format(date)}, ${count} ${count === 1 ? "item" : "items"}" aria-pressed="${active}"
            tabindex="${active ? 0 : -1}"${key === today ? ' aria-current="date"' : ""}>
            <span>${index + 1}</span>${count ? `<span class="planner-home-day-count" aria-hidden="true">${count}</span>` : ""}
          </button>`;
        }).join("")}
      </div>`;
  }

  function agenda(byDate, projects) {
    const items = byDate.get(dayKey(selected)) || [];
    return `<section class="planner-home-agenda" aria-labelledby="planner-home-selected-date">
      <h3 id="planner-home-selected-date">${fullDateFormat.format(selected)}</h3>
      ${items.length ? `<ul>${items.map(item => {
        const scopeTitle = projects.find(project => project.id === item.scope)?.title || "Shared planning";
        const details = [item.label, scopeTitle, item.time].filter(Boolean).join(" · ");
        return `<li><button type="button" data-home-focus="agenda-${escapeHtml(item.id || `${item.tool}-${item.scope}-${item.title}`)}"
          ${item.table ? `data-home-table="${item.table}" data-home-id="${escapeHtml(item.id)}"` : `data-home-project="${escapeHtml(item.scope)}" data-home-tool="${item.tool}"`}>
          <span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(details)}</small></span><span aria-hidden="true">→</span>
        </button></li>`;
      }).join("")}</ul>` : '<p class="planner-home-empty">No scheduled items for this date.</p>'}
    </section>`;
  }

  function projectList(projects) {
    return `<section class="panel planner-home-card" aria-labelledby="planner-home-projects">
      <header class="planner-home-card-head"><h2 id="planner-home-projects">Projects</h2>
        <button class="secondary-action" type="button" data-home-view="workspace-projects" data-home-focus="projects">Manage projects</button></header>
      <ul class="planner-home-projects">${projects.map(project => {
        const date = fromDay(project.date);
        const details = [Number.isNaN(date.getTime()) ? "" : projectDateFormat.format(date), project.location].filter(Boolean).join(" · ");
        return `<li><button type="button" data-home-project="${escapeHtml(project.id)}" data-home-focus="project-${escapeHtml(project.id)}">
          <span><strong>${escapeHtml(project.title)}</strong>${details ? `<small>${escapeHtml(details)}</small>` : ""}</span>
          <span aria-hidden="true">→</span></button></li>`;
      }).join("")}</ul>
    </section>`;
  }

  function paint(focus) {
    if (!root || state.view !== "overview" || !state.session?.token) return;
    const { projects, records, loading, error } = plannerWorkspace.homeData();
    if (state.celebration !== celebrationFilter) {
      celebrationFilter = state.celebration;
      projectId = celebrationFilter || "all";
    }
    if (projectId !== "all" && !projects.some(project => project.id === projectId)) projectId = "all";
    const byDate = entries({ projects, records });
    const preserveFocus = focus ?? (root.contains(document.activeElement) ? document.activeElement.dataset.homeFocus : null);
    root.innerHTML = `<div class="planner-home-layout">
      <section class="panel planner-home-card" aria-labelledby="planner-home-calendar">
        <header class="planner-home-card-head"><h2 id="planner-home-calendar">Calendar</h2>
          <label class="planner-home-filter" for="planner-home-project-filter">Calendar project
            <select id="planner-home-project-filter" data-home-focus="filter">${plannerIsSouthAfricaOnly() ? "" : '<option value="all">All projects</option>'}${projects.map(project => `<option value="${escapeHtml(project.id)}"${projectId === project.id ? " selected" : ""}>${escapeHtml(project.title)}</option>`).join("")}</select>
          </label></header>
        ${loading ? '<p class="planner-home-empty" role="status">Loading project appointments…</p>' : ""}
        ${error ? '<div class="planner-home-load-error" role="status"><span>Project appointments could not load.</span><button class="secondary-action" type="button" data-home-retry data-home-focus="retry">Retry</button></div>' : ""}
        <div class="planner-home-month-head"><h3>${monthFormat.format(selected)}</h3><div>
          <button class="secondary-action" type="button" aria-label="Previous month" data-home-shift="-1" data-home-focus="previous">‹</button>
          <button class="secondary-action" type="button" data-home-today data-home-focus="today">Today</button>
          <button class="secondary-action" type="button" aria-label="Next month" data-home-shift="1" data-home-focus="next">›</button>
        </div></div>
        ${monthGrid(byDate, dayKey(new Date()))}
        ${agenda(byDate, projects)}
      </section>
      <div class="planner-home-aside">${projectList(projects)}
        <section class="panel planner-home-card" aria-labelledby="planner-home-shortcuts">
          <header class="planner-home-card-head"><h2 id="planner-home-shortcuts">Quick links</h2></header>
          <ul class="planner-home-shortcuts">${shortcuts.map(([view, label, icon]) => `<li><button type="button" data-home-view="${view}" data-home-focus="${view}"><span aria-hidden="true">${icon}</span>${label}</button></li>`).join("")}</ul>
        </section>
      </div>
    </div>`;
    if (preserveFocus) root.querySelector(`[data-home-focus="${CSS.escape(preserveFocus)}"]`)?.focus({ preventScroll: true });
  }

  function render() {
    if (!root || state.view !== "overview" || !state.session?.token) return;
    plannerWorkspace.render();
    paint();
  }

  function changeMonth(amount) {
    const target = new Date(selected.getFullYear(), selected.getMonth() + amount, 1, 12);
    const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(selected.getDate(), lastDay));
    selected = target;
  }

  root?.addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button || !state.session?.token) return;
    const { homeDay, homeShift, homeProject, homeTool, homeView, homeTable, homeId } = button.dataset;
    if (homeProject) {
      plannerWorkspace.openProject(homeProject, homeTool);
    } else if (homeTable) {
      const record = state.data[homeTable].find(row => row.id === homeId);
      if (record) openEntity(homeTable, record);
    } else if (homeView) {
      if (projectId !== "all" && ["workspace-calendar", "workspace-venue"].includes(homeView)) {
        plannerWorkspace.openProject(projectId, plannerWorkspace.toolForView(homeView));
      } else switchView(homeView);
    } else if (button.hasAttribute("data-home-retry")) {
      plannerWorkspace.reloadHome();
      paint();
    } else if (homeDay || homeShift || button.hasAttribute("data-home-today")) {
      if (homeDay) selected = fromDay(homeDay);
      else if (homeShift) changeMonth(Number(homeShift));
      else selected = new Date();
      paint(button.dataset.homeFocus);
    }
  });

  root?.addEventListener("change", event => {
    if (event.target.id === "planner-home-project-filter") {
      projectId = event.target.value;
      paint("filter");
    }
  });

  root?.addEventListener("keydown", event => {
    if (!event.target.dataset.homeDay) return;
    const movement = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
    if (movement) selected.setDate(selected.getDate() + movement);
    else if (event.key === "PageUp" || event.key === "PageDown") changeMonth(event.key === "PageUp" ? -1 : 1);
    else if (event.key === "Home") selected.setDate(1);
    else if (event.key === "End") selected = new Date(selected.getFullYear(), selected.getMonth() + 1, 0, 12);
    else return;
    event.preventDefault();
    paint(dayKey(selected));
  });

  return { render, reset };
})();

function renderPlannerHome() { plannerHome.render(); }
function resetPlannerHome() { plannerHome.reset(); }
