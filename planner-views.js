  const tableSort = {};

  function applySort(rows, view) {
    const sort = tableSort[view];
    if (!sort) return rows;
    const factor = sort.dir === "desc" ? -1 : 1;
    const valueOf = (row) => (sort.key === "balance" ? balance(row) : row[sort.key]);
    return [...rows].sort((a, b) => {
      const aValue = valueOf(a);
      const bValue = valueOf(b);
      if (sort.type === "number") return factor * ((Number(aValue) || 0) - (Number(bValue) || 0));
      if (sort.type === "date") return factor * compareDates(aValue, bValue);
      return factor * String(aValue ?? "").localeCompare(String(bValue ?? ""), "en", { sensitivity: "base" });
    });
  }

  function currentSearch(view) {
    return document.querySelector(`[data-search-table="${view}"]`)?.value || "";
  }

  function bindSortHeaders() {
    document.querySelectorAll("[data-sort-view] th[data-sort-key]").forEach((header) => {
      header.addEventListener("click", () => {
        const view = header.closest("[data-sort-view]").dataset.sortView;
        const key = header.dataset.sortKey;
        const previous = tableSort[view];
        tableSort[view] = {
          key,
          type: header.dataset.sortType || "text",
          dir: previous?.key === key && previous.dir === "asc" ? "desc" : "asc"
        };
        updateSortIndicators(view);
        renderTableBySearch(view, currentSearch(view));
      });
    });
  }

  function updateSortIndicators(view) {
    document.querySelector(`[data-sort-view="${view}"]`)?.querySelectorAll("th[data-sort-key]").forEach((header) => {
      const active = tableSort[view]?.key === header.dataset.sortKey;
      header.classList.toggle("sorted-asc", active && tableSort[view].dir === "asc");
      header.classList.toggle("sorted-desc", active && tableSort[view].dir === "desc");
    });
  }

  function filtered(table, { ignoreOwner = false, ignoreCelebration = false } = {}) {
    return (state.data[table] || []).filter((row) => {
      const ownerMatch = ignoreOwner || !row.owner || row.owner === state.owner;
      const celebrationMatch = ignoreCelebration || state.celebration === "all" || row.celebration === state.celebration || row.celebration === "shared";
      return ownerMatch && celebrationMatch;
    });
  }

  function renderOverview() {
    const tasks = filtered("tasks");
    const counts = countStatuses(tasks);
    text("kpi-outstanding", counts.outstanding);
    text("kpi-pending", counts.pending);
    text("kpi-approved", counts.approved);
    text("progress-outstanding", counts.outstanding);
    text("progress-pending", counts.pending);
    text("progress-approved", counts.approved);
    const total = tasks.length;
    const percent = total ? Math.round((counts.approved / total) * 100) : 0;
    document.getElementById("progress-fill").style.width = `${percent}%`;

    const dated = tasks.filter((task) => task.status !== "approved" && task.due_date).sort(sortByDate("due_date"));
    if (dated[0]) {
      const days = daysUntil(dated[0].due_date);
      text("kpi-next-due", days < 0 ? `${Math.abs(days)}d` : days === 0 ? "Today" : `${days}d`);
      text("kpi-next-due-label", dated[0].title);
    } else {
      text("kpi-next-due", "—");
      text("kpi-next-due-label", "no dated actions yet");
    }

    const priority = [...tasks]
      .filter((task) => task.status !== "approved")
      .sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority) || compareDates(a.due_date, b.due_date))
      .slice(0, 5);
    document.getElementById("priority-actions").innerHTML = priority.length ? priority.map(actionRow).join("") : empty("No outstanding or pending tasks in this lens.");

    const payments = filtered("budget_items")
      .filter((item) => item.due_date && balance(item) > 0)
      .sort(sortByDate("due_date"))
      .slice(0, 5);
    document.getElementById("payment-actions").innerHTML = payments.length ? payments.map(paymentRow).join("") : empty("No dated payments recorded.");

    const now = new Date();
    const timeline = filtered("timeline_items").filter((item) => item.item_date && new Date(`${item.item_date}T23:59:59`) >= now).sort(sortByDate("item_date"));
    const next = timeline[0];
    const nextCard = document.getElementById("next-event-card");
    if (!next) nextCard.outerHTML = `<div id="next-event-card" class="empty-state">Add dated timeline items to see the next milestone.</div>`;
    else nextCard.outerHTML = `<div id="next-event-card" class="action-list"><div class="action-row ${escapeHtml(next.status)}"><i class="action-dot"></i><div><b>${escapeHtml(next.title)}</b><small>${labelCelebration(next.celebration)}${next.location ? ` · ${escapeHtml(next.location)}` : ""}</small></div><time>${formatDate(next.item_date, { short: false })}${next.item_time ? ` · ${escapeHtml(next.item_time.slice(0, 5))}` : ""}</time></div></div>`;
  }

  function renderTasks() {
    const tasks = filtered("tasks");
    STATUS_OPTIONS.forEach(([status]) => {
      const rows = tasks.filter((task) => task.status === status).sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority) || compareDates(a.due_date, b.due_date));
      text(`task-count-${status}`, rows.length);
      const container = document.getElementById(`tasks-${status}`);
      container.innerHTML = rows.length ? rows.map(taskCard).join("") : empty(`Nothing ${status} here.`);
    });
    bindRowEditors(".task-card[data-id]", "tasks");
    document.querySelectorAll(".task-quick button[data-quick-status]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const record = state.data.tasks.find((task) => task.id === button.closest("[data-id]").dataset.id);
        if (record) savePatch("tasks", record, { status: button.dataset.quickStatus });
      });
    });
  }

  const QUICK_STATUS_ACTIONS = {
    outstanding: [["pending", "→ Pending"], ["approved", "✓ Approve"]],
    pending: [["outstanding", "↩ Reopen"], ["approved", "✓ Approve"]],
    approved: [["outstanding", "↩ Reopen"]]
  };

  function quickStatusButtons(task) {
    const actions = QUICK_STATUS_ACTIONS[task.status] || [];
    return `<div class="task-quick">${actions.map(([status, label]) => `<button type="button" data-quick-status="${escapeHtml(status)}">${escapeHtml(label)}</button>`).join("")}</div>`;
  }

  function renderBudget(search = "") {
    let rows = filtered("budget_items");
    rows = searchRows(rows, search, ["title", "category", "notes", "celebration"]);
    rows = applySort(rows, "budget");
    const body = document.getElementById("budget-table-body");
    body.innerHTML = rows.length ? rows.map((item) => {
      const total = Number(item.estimated || 0);
      const paid = Number(item.paid || item.deposit || 0);
      return `<tr data-id="${item.id}"><td><b>${escapeHtml(item.title)}</b><br><small>${escapeHtml(item.notes || "")}</small></td><td>${labelCelebration(item.celebration)}</td><td>${escapeHtml(item.category || "—")}</td><td class="money">${formatMoney(total, item.currency)}</td><td class="money">${formatMoney(paid, item.currency)}</td><td class="money">${formatMoney(Math.max(total - paid, 0), item.currency)}</td><td>${formatDate(item.due_date)}</td><td>${statusBadge(item.status)}</td></tr>`;
    }).join("") : tableEmpty(8, "No budget items in this planner lens.");
    const all = filtered("budget_items");
    const eur = all.filter((item) => item.currency === "EUR").reduce((sum, item) => sum + Number(item.estimated || 0), 0);
    const zar = all.filter((item) => item.currency === "ZAR").reduce((sum, item) => sum + Number(item.estimated || 0), 0);
    text("budget-summary", `${formatMoney(eur, "EUR")} · ${formatMoney(zar, "ZAR")}`);
    bindTableRows(body, "budget_items");
  }

  function renderGuests(search = "") {
    let rows = filtered("guests");
    rows = searchRows(rows, search, ["name", "party_name", "dietary", "transport", "accommodation", "notes"]);
    rows = applySort(rows, "guests");
    const body = document.getElementById("guests-table-body");
    body.innerHTML = rows.length ? rows.map((guest) => `<tr data-id="${guest.id}"><td><b>${escapeHtml(guest.name)}</b></td><td>${escapeHtml(guest.party_name || "—")}</td><td>${labelCelebration(guest.celebration)}</td><td><span class="status-badge ${guest.rsvp_status === "yes" ? "status-approved" : guest.rsvp_status === "no" ? "status-outstanding" : "status-pending"}">${escapeHtml(labelRsvp(guest.rsvp_status))}</span></td><td>${checkinBadge(guest)}</td><td>${escapeHtml(guest.dietary || "—")}</td><td>${escapeHtml(guest.transport || "—")}</td><td>${escapeHtml(guest.accommodation || "—")}</td><td><span class="private-chip">${escapeHtml(guest.notes || "—")}</span></td></tr>`).join("") : tableEmpty(9, "No guest records in this planner lens.");
    const all = filtered("guests");
    const yes = all.filter((guest) => guest.rsvp_status === "yes").length;
    const checkedIn = all.filter((guest) => guest.check_in_status === "checked_in").length;
    const dietary = all.filter((guest) => guest.dietary).length;
    const transport = all.filter((guest) => guest.transport).length;
    text("guest-summary", `${all.length} guests · ${yes} yes · ${checkedIn} checked in · ${dietary} dietary · ${transport} transport`);
    bindTableRows(body, "guests");
  }

  function checkinBadge(guest) {
    if (guest.check_in_status === "checked_in") return '<span class="status-badge status-approved">Checked in</span>';
    if (guest.check_in_status === "cant_make_it") return '<span class="status-badge status-outstanding">Can&#039;t make it</span>';
    return '<span class="status-badge status-pending">Not yet</span>';
  }

  function renderVendors(search = "") {
    let rows = filtered("vendors");
    rows = searchRows(rows, search, ["name", "category", "contact_name", "email", "phone", "next_action", "notes"]);
    rows = applySort(rows, "vendors");
    const body = document.getElementById("vendors-table-body");
    body.innerHTML = rows.length ? rows.map((vendor) => `<tr data-id="${vendor.id}"><td><b>${escapeHtml(vendor.name)}</b></td><td>${labelCelebration(vendor.celebration)}</td><td>${escapeHtml(vendor.category || "—")}</td><td>${escapeHtml(vendor.contact_name || "")}${vendor.email ? `<br><small>${escapeHtml(vendor.email)}</small>` : ""}${vendor.phone ? `<br><small>${escapeHtml(vendor.phone)}</small>` : ""}</td><td class="money">${vendor.quote_amount ? formatMoney(vendor.quote_amount, vendor.currency) : "—"}</td><td>${escapeHtml(vendor.next_action || "—")}</td><td>${formatDate(vendor.due_date)}</td><td>${statusBadge(vendor.status)}</td></tr>`).join("") : tableEmpty(8, "No suppliers in this planner lens.");
    text("vendor-summary", `${filtered("vendors").length} suppliers`);
    bindTableRows(body, "vendors");
  }

  function renderTimeline(search = "") {
    let rows = filtered("timeline_items");
    rows = searchRows(rows, search, ["title", "location", "notes", "audience"]);
    rows.sort(sortByDate("item_date"));
    rows = applySort(rows, "timeline");
    const body = document.getElementById("timeline-table-body");
    body.innerHTML = rows.length ? rows.map((item) => `<tr data-id="${item.id}"><td><b>${formatDate(item.item_date, { short: false })}</b></td><td>${escapeHtml(item.item_time?.slice(0, 5) || "—")}</td><td><b>${escapeHtml(item.title)}</b><br><small>${escapeHtml(item.notes || "")}</small></td><td>${labelCelebration(item.celebration)}</td><td>${ownerTag(item.owner)}</td><td>${escapeHtml(item.audience === "guest" ? "Guest-facing" : "Private")}</td><td>${escapeHtml(item.location || "—")}</td><td>${statusBadge(item.status)}</td></tr>`).join("") : tableEmpty(8, "No timeline items in this planner lens.");
    text("timeline-summary", `${filtered("timeline_items").length} milestones`);
    bindTableRows(body, "timeline_items");
  }

  function renderPublishing() {
    const rows = filtered("content_blocks", { ignoreCelebration: true });
    const list = document.getElementById("publish-list");
    list.innerHTML = rows.length ? rows.map((block) => `<article class="publish-card" data-id="${block.id}"><div><h4>${escapeHtml(block.title)}</h4><p>${escapeHtml(truncate(block.body, 150))}</p><div class="task-card-meta" style="margin-top:10px"><span class="mini-tag">${escapeHtml(block.section)}</span><span class="mini-tag ${block.country === "south_africa" ? "south_africa" : block.country}">${escapeHtml(labelCountry(block.country))}</span></div></div><div class="publish-state">${block.published ? '<span class="status-badge status-approved">Published</span>' : '<span class="status-badge status-pending">Draft</span>'}</div></article>`).join("") : empty("No guest updates yet. Add an announcement or FAQ when information is ready.");
    bindRowEditors(".publish-card[data-id]", "content_blocks");
    const published = rows.find((row) => row.published);
    text("preview-update-title", published?.title || "No published updates yet.");
  }

  function taskCard(task) {
    return `<article class="task-card" data-id="${task.id}"><div class="task-card-meta">${ownerTag(task.owner)}<span class="mini-tag ${task.celebration}">${escapeHtml(labelCelebration(task.celebration))}</span>${task.priority === "high" ? '<span class="mini-tag" style="background:#f6e0db;color:#8d463b">High priority</span>' : ""}</div><h4>${escapeHtml(task.title)}</h4>${task.description ? `<p>${escapeHtml(truncate(task.description, 150))}</p>` : ""}<div class="task-card-foot"><span>${escapeHtml(task.category || "General")}</span><span>${task.due_date ? formatDate(task.due_date) : "No date"}</span></div>${quickStatusButtons(task)}</article>`;
  }

  function actionRow(task) {
    return `<div class="action-row ${escapeHtml(task.status)}"><i class="action-dot"></i><div><b>${escapeHtml(task.title)}</b><small>${ownerLabel(task.owner)} · ${labelCelebration(task.celebration)}</small></div><time>${task.due_date ? formatDate(task.due_date) : escapeHtml(titleCase(task.priority || "normal"))}</time></div>`;
  }

  function paymentRow(item) {
    return `<div class="action-row ${escapeHtml(item.status)}"><i class="action-dot"></i><div><b>${escapeHtml(item.title)}</b><small>${labelCelebration(item.celebration)} · ${formatMoney(balance(item), item.currency)} balance</small></div><time>${formatDate(item.due_date)}</time></div>`;
  }

  function switchView(view, rerender = true) {
    state.view = view || "overview";
    if (history.replaceState) history.replaceState(null, "", `#${state.view}`);
    document.querySelectorAll("[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === state.view));
    document.querySelectorAll("[data-view-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.viewPanel === state.view));
    const label = { overview: "Overview", tasks: "Tasks", budget: "Budget", guests: "Guests", checkin: "Guest Check-In", vendors: "Vendors", timeline: "Timeline", publishing: "Guest publishing", honeymoon: "Honeymoon" }[state.view] || "Planner";
    els.topbarTitle.textContent = label;
    els.topbarSubtitle.textContent = `${ownerLabel(state.owner)} planner · ${state.celebration === "all" ? "Spain and South Africa" : labelCelebration(state.celebration)}`;
    const addButton = document.getElementById("global-add");
    addButton.textContent = state.view === "publishing" ? "+ Add update" : state.view === "overview" ? "+ Add task" : `+ Add ${definitions[tableForView(state.view)]?.singular || "item"}`;
    document.body.classList.remove("sidebar-open");
    if (rerender) renderAll();
  }

  function setOwner(owner) {
    state.owner = owner;
    document.querySelectorAll("[data-owner]").forEach((button) => button.classList.toggle("active", button.dataset.owner === owner));
    switchView(state.view);
  }

  function setCelebration(celebration) {
    state.celebration = celebration;
    document.querySelectorAll("[data-celebration]").forEach((button) => button.classList.toggle("active", button.dataset.celebration === celebration));
    switchView(state.view);
  }

  function renderTableBySearch(key, value) {
    if (key === "budget") renderBudget(value);
    if (key === "guests") renderGuests(value);
    if (key === "vendors") renderVendors(value);
    if (key === "timeline") renderTimeline(value);
  }

  const CSV_EXPORTS = {
    budget_items: { view: "budget", file: "budget", columns: ["title", "celebration", "category", "currency", "estimated", "deposit", "paid", "balance", "due_date", "status", "notes"] },
    guests: { view: "guests", file: "guest-register", columns: ["name", "party_name", "celebration", "rsvp_status", "check_in_status", "checked_in_at", "dietary", "transport", "accommodation", "contact", "notes"] },
    vendors: { view: "vendors", file: "suppliers", columns: ["name", "celebration", "category", "contact_name", "email", "phone", "currency", "quote_amount", "next_action", "due_date", "status", "notes"] },
    timeline_items: { view: "timeline", file: "timeline", columns: ["item_date", "item_time", "title", "celebration", "owner", "audience", "location", "sort_order", "status", "notes"] }
  };

  function exportCsv(table) {
    const spec = CSV_EXPORTS[table];
    if (!spec) return;
    const rows = applySort(filtered(table), spec.view);
    const cell = (value) => {
      let text = String(value ?? "");
      // Free-text fields come from guest check-ins; neutralise formula prefixes.
      if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
      return `"${text.replaceAll('"', '""')}"`;
    };
    const lines = [
      spec.columns.map(cell).join(","),
      ...rows.map((row) => spec.columns.map((column) => cell(column === "balance" ? balance(row) : row[column])).join(","))
    ];
    const blob = new Blob([`﻿${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `mxc-${spec.file}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
    toast(`${rows.length} rows exported. Keep this file private.`);
  }

  /* Static header/toolbar controls exist in planner.html before any script
     runs (all scripts are deferred), so they are bound once at load. */
  document.querySelectorAll("[data-export-csv]").forEach((button) => {
    button.addEventListener("click", () => exportCsv(button.dataset.exportCsv));
  });
  bindSortHeaders();

