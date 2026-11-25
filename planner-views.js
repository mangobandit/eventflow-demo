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
      text("kpi-next-due", "Not set");
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
    else nextCard.outerHTML = `<div id="next-event-card" class="action-list"><div class="action-row ${escapeHtml(next.status)}"><i class="action-dot"></i><div><b>${escapeHtml(next.title)}</b><small>${labelCelebration(next.celebration)}${next.location ? ` Â· ${escapeHtml(next.location)}` : ""}</small></div><time>${formatDate(next.item_date, { short: false })}${next.item_time ? ` Â· ${escapeHtml(next.item_time.slice(0, 5))}` : ""}</time></div></div>`;
  }

  const taskStatusSaves = new Set();

  function bindTaskBoard() {
    document.getElementById("task-search").addEventListener("input", renderTasks);
    document.getElementById("task-wedding-filter").addEventListener("change", (event) => setCelebration(event.target.value));
    document.getElementById("task-owner-filter").addEventListener("change", renderTasks);
    const board = document.getElementById("task-board");
    board.addEventListener("click", (event) => {
      if (event.target.closest(".task-status-control")) return;
      const card = event.target.closest(".task-card");
      const task = card && state.data.tasks.find((item) => item.id === card.dataset.id);
      if (task) openEntity("tasks", task);
    });
    board.addEventListener("change", (event) => {
      if (event.target.matches("[data-task-status]")) changeTaskStatus(event.target);
    });
  }

  async function changeTaskStatus(select) {
    const id = select.dataset.taskStatus;
    const task = state.data.tasks.find((item) => item.id === id);
    const token = state.session?.token;
    if (!task || !token || task.status === select.value || taskStatusSaves.has(id)) return;
    taskStatusSaves.add(id);
    select.disabled = true;
    try {
      const saved = await plannerRpc("planner_set_task_status", {
        p_token: token,
        p_task_id: id,
        p_status: select.value,
        p_expected_status: task.status
      });
      if (state.session?.token !== token) return;
      const index = state.data.tasks.findIndex((item) => item.id === id);
      if (index >= 0) state.data.tasks[index] = { ...state.data.tasks[index], status: saved.status };
      toast("Action moved.");
    } catch (error) {
      if (state.session?.token === token) {
        toast(error.message || "The action could not be moved.", true);
        if (/changed elsewhere/i.test(error.message)) await loadAll();
      }
    } finally {
      taskStatusSaves.delete(id);
      if (state.session?.token === token) {
        const restoreFocus = document.activeElement === select || document.activeElement === document.body;
        renderTasks();
        renderOverview();
        if (restoreFocus && state.view === "tasks") {
          document.querySelector(`[data-task-status="${CSS.escape(id)}"]`)?.focus();
        }
      }
    }
  }

  function renderTasks() {
    const owner = document.getElementById("task-owner-filter").value;
    const activeWedding = state.celebration;
    document.getElementById("task-wedding-filter").value = activeWedding;
    const activeOwner = owner === "lens" ? state.owner : owner;
    const rows = state.data.tasks.filter((task) =>
      (activeOwner === "all" || !task.owner || task.owner === activeOwner) &&
      (activeWedding === "all" || task.celebration === activeWedding || task.celebration === "shared")
    );
    const tasks = searchRows(rows, document.getElementById("task-search").value, ["title", "description", "category", "notes"]);
    STATUS_OPTIONS.forEach(([status]) => {
      const rows = tasks.filter((task) => task.status === status).sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority) || compareDates(a.due_date, b.due_date));
      text(`task-count-${status}`, rows.length);
      const container = document.getElementById(`tasks-${status}`);
      container.innerHTML = rows.length ? rows.map(taskCard).join("") : empty(`Nothing ${status} here.`);
    });
  }

  function renderBudget(search = "") {
    let rows = filtered("budget_items");
    rows = searchRows(rows, search, ["title", "category", "notes", "celebration"]);
    const body = document.getElementById("budget-table-body");
    body.innerHTML = rows.length ? rows.map((item) => {
      const total = Number(item.estimated || 0);
      const paid = Number(item.paid || item.deposit || 0);
      return `<tr data-id="${item.id}"><td><b>${escapeHtml(item.title)}</b><br><small>${escapeHtml(item.notes || "")}</small></td><td>${labelCelebration(item.celebration)}</td><td>${escapeHtml(item.category || "Not set")}</td><td class="money">${formatMoney(total, item.currency)}</td><td class="money">${formatMoney(paid, item.currency)}</td><td class="money">${formatMoney(Math.max(total - paid, 0), item.currency)}</td><td>${formatDate(item.due_date)}</td><td>${statusBadge(item.status)}</td></tr>`;
    }).join("") : tableEmpty(8, "No budget items in this planner lens.");
    const all = filtered("budget_items");
    const eur = all.filter((item) => item.currency === "EUR").reduce((sum, item) => sum + Number(item.estimated || 0), 0);
    const zar = all.filter((item) => item.currency === "ZAR").reduce((sum, item) => sum + Number(item.estimated || 0), 0);
    text("budget-summary", `${formatMoney(eur, "EUR")} Â· ${formatMoney(zar, "ZAR")}`);
    bindTableRows(body, "budget_items");
  }

  function renderGuests(search = "") {
    let rows = filtered("guests");
    rows = searchRows(rows, search, ["name", "party_name", "dietary", "transport", "accommodation", "notes"]);
    const body = document.getElementById("guests-table-body");
    body.innerHTML = rows.length ? rows.map((guest) => `<tr data-id="${guest.id}"><td><b>${escapeHtml(guest.name)}</b></td><td>${escapeHtml(guest.party_name || "Not set")}</td><td>${labelCelebration(guest.celebration)}</td><td><span class="status-badge ${guest.rsvp_status === "yes" ? "status-approved" : guest.rsvp_status === "no" ? "status-outstanding" : "status-pending"}">${escapeHtml(labelRsvp(guest.rsvp_status))}</span></td><td>${escapeHtml(guest.dietary || "Not set")}</td><td>${escapeHtml(guest.transport || "Not set")}</td><td>${escapeHtml(guest.accommodation || "Not set")}</td><td><span class="private-chip">${escapeHtml(guest.notes || "Not set")}</span></td></tr>`).join("") : tableEmpty(8, "No guest records in this planner lens.");
    const yes = filtered("guests").filter((guest) => guest.rsvp_status === "yes").length;
    text("guest-summary", `${filtered("guests").length} guests Â· ${yes} yes`);
    bindTableRows(body, "guests");
  }

  function renderVendors(search = "") {
    let rows = filtered("vendors");
    rows = searchRows(rows, search, ["name", "category", "contact_name", "email", "phone", "next_action", "notes"]);
    const body = document.getElementById("vendors-table-body");
    body.innerHTML = rows.length ? rows.map((vendor) => `<tr data-id="${vendor.id}"><td><b>${escapeHtml(vendor.name)}</b></td><td>${labelCelebration(vendor.celebration)}</td><td>${escapeHtml(vendor.category || "Not set")}</td><td>${escapeHtml(vendor.contact_name || "")}${vendor.email ? `<br><small>${escapeHtml(vendor.email)}</small>` : ""}${vendor.phone ? `<br><small>${escapeHtml(vendor.phone)}</small>` : ""}</td><td class="money">${vendor.quote_amount ? formatMoney(vendor.quote_amount, vendor.currency) : "Not set"}</td><td>${escapeHtml(vendor.next_action || "Not set")}</td><td>${formatDate(vendor.due_date)}</td><td>${statusBadge(vendor.status)}</td></tr>`).join("") : tableEmpty(8, "No suppliers in this planner lens.");
    text("vendor-summary", `${filtered("vendors").length} suppliers`);
    bindTableRows(body, "vendors");
  }

  function renderTimeline(search = "") {
    let rows = filtered("timeline_items");
    rows = searchRows(rows, search, ["title", "location", "notes", "audience"]);
    rows.sort((first, second) => compareDates(first.item_date, second.item_date) ||
      (first.sort_order ?? 0) - (second.sort_order ?? 0) || (first.item_time || "").localeCompare(second.item_time || ""));
    const body = document.getElementById("timeline-table-body");
    body.innerHTML = rows.length ? rows.map((item) => `<tr data-id="${item.id}"><td><b>${formatDate(item.item_date, { short: false })}</b></td><td>${escapeHtml(item.item_time?.slice(0, 5) || "Not set")}</td><td><b>${escapeHtml(item.title)}</b><br><small>${escapeHtml(item.notes || "")}</small></td><td>${labelCelebration(item.celebration)}</td><td>${ownerTag(item.owner)}</td><td>${escapeHtml(item.audience === "guest" ? "Guest facing" : "Private")}</td><td>${escapeHtml(item.location || "Not set")}</td><td>${statusBadge(item.status)}</td></tr>`).join("") : tableEmpty(8, "No timeline items in this planner lens.");
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
    const options = STATUS_OPTIONS.map(([value, label]) =>
      `<option value="${value}"${task.status === value ? " selected" : ""}>${label}</option>`
    ).join("");
    const priority = task.priority === "high" ? '<span class="mini-tag" style="background:#f6e0db;color:#8d463b">High priority</span>' : "";
    const title = escapeHtml(task.title);
    return `<article class="task-card" data-id="${escapeHtml(task.id)}">
      <div class="task-card-meta">
        ${ownerTag(task.owner)}
        <span class="mini-tag ${escapeHtml(task.celebration)}">${escapeHtml(labelCelebration(task.celebration))}</span>
        ${priority}
      </div>
      <h4><button type="button">${title}</button></h4>
      ${task.description ? `<p>${escapeHtml(truncate(task.description, 150))}</p>` : ""}
      <div class="task-card-foot">
        <span>${escapeHtml(task.category || "General")}</span>
        <span>${task.due_date ? formatDate(task.due_date) : "No date"}</span>
      </div>
      <label class="task-status-control">Status
        <select data-task-status="${escapeHtml(task.id)}" aria-label="Status for ${title}"${taskStatusSaves.has(task.id) ? " disabled" : ""}>
          ${options}
        </select>
      </label>
    </article>`;
  }

  function actionRow(task) {
    return `<div class="action-row ${escapeHtml(task.status)}"><i class="action-dot"></i><div><b>${escapeHtml(task.title)}</b><small>${ownerLabel(task.owner)} Â· ${labelCelebration(task.celebration)}</small></div><time>${task.due_date ? formatDate(task.due_date) : escapeHtml(titleCase(task.priority || "normal"))}</time></div>`;
  }

  function paymentRow(item) {
    return `<div class="action-row ${escapeHtml(item.status)}"><i class="action-dot"></i><div><b>${escapeHtml(item.title)}</b><small>${labelCelebration(item.celebration)} Â· ${formatMoney(balance(item), item.currency)} balance</small></div><time>${formatDate(item.due_date)}</time></div>`;
  }

  function switchView(view, rerender = true) {
    const tool = plannerWorkspace.toolForView(view);
    if (tool) state.workspaceTool = tool;
    state.view = tool ? "workspace" : view || "overview";
    const destination = state.view === "workspace" ? plannerWorkspace.viewForTool(state.workspaceTool) : state.view;
    if (history.replaceState) history.replaceState(null, "", `#${destination}`);
    updatePlannerNavigation(destination);
    document.querySelectorAll("[data-view-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.viewPanel === state.view));
    const label = { overview: "Overview", tasks: "Tasks", budget: "Budget", guests: "Guests", seating: "Seating", checkin: "Guest Check In", vendors: "Vendors", timeline: "Timeline", workspace: "Planning tools", publishing: "Guest publishing", honeymoon: "Honeymoon" }[state.view] || "Planner";
    els.topbarTitle.textContent = label;
    els.topbarSubtitle.textContent = `${ownerLabel(state.owner)} planner \u00b7 ${state.celebration === "all" ? "Spain and South Africa" : labelCelebration(state.celebration)}`;
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

