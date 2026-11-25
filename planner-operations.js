function renderPlannerOperations(container, context) {
  const now = new Date();
  const dateKey = date => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
  const today = dateKey(now);
  let selectedDate = today;
  let month = new Date(now.getFullYear(), now.getMonth(), 1);
  let records = [...context.records];
  let editing = null;
  let draftKind = "";
  let failure = "";
  let saving = false;
  const kinds = [["meeting", "Meeting"], ["slot", "Availability"], ["reminder", "Reminder"]];
  const label = Object.fromEntries(kinds);
  const escape = escapeHtml;
  const activeScope = context.scope;

  function input(name, caption, value, type = "text", extra = "") {
    return `<label class="form-label">${caption}<input name="${name}" type="${type}" value="${escape(value)}"${extra ? " " + extra : ""}></label>`;
  }

  function controls(allowDelete) {
    return `<div class="workspace-form-actions"><button class="primary-action" type="submit"${saving ? " disabled" : ""}>Save</button>
      <button class="secondary-action" type="button" data-op="cancel">Cancel</button>
      ${allowDelete ? '<button class="danger-action" type="button" data-op="delete">Delete</button>' : ""}
    </div>`;
  }

  function dateLabel(value) {
    return formatDate(value, { short: false });
  }

  function relevant(record) {
    return activeScope === "shared" || record.celebration === activeScope || record.celebration === "shared";
  }

  function entries() {
    const rows = records.filter(item => kinds.some(([kind]) => kind === item.kind))
      .map(item => ({ ...item, day: item.data.date, time: item.data.time, text: item.data.notes || "", record: item }));
    for (const item of state.data.tasks.filter(item => item.due_date && item.status !== "approved" && relevant(item))) {
      rows.push({ title: item.title, day: item.due_date, kind: "task", dateLabel: "Action due" });
    }
    for (const item of state.data.budget_items.filter(item => item.due_date && balance(item) > 0 && relevant(item))) {
      rows.push({ title: item.title, day: item.due_date, kind: "payment", dateLabel: "Payment due" });
    }
    for (const item of state.data.timeline_items.filter(relevant)) {
      rows.push({ title: item.title, day: item.item_date, time: item.item_time?.slice(0, 5), kind: "timeline", text: item.location, dateLabel: "Wedding timeline" });
    }
    for (const item of records.filter(item => ["project_task", "project_timeline"].includes(item.kind))) {
      rows.push({ title: item.title, day: item.data.date, time: item.data.time, kind: item.kind, dateLabel: item.kind === "project_task" ? "Project action" : "Project milestone" });
    }
    return rows.filter(item => item.day).sort((a, b) => a.day.localeCompare(b.day) || (a.time || "").localeCompare(b.time || ""));
  }

  function calendarForm(type, row) {
    if (!type) return "";
    const data = row?.data || {};
    return `<form class="workspace-form" data-operation-form="calendar">
      <label class="form-label">Type<select name="kind"${row ? " disabled" : ""}>${kinds.map(([value, name]) => `<option value="${value}"${type === value ? " selected" : ""}>${name}</option>`).join("")}</select></label>
      ${input("title", "Title", row?.title, "text", 'required maxlength="160"')}
      ${input("date", "Date", data.date || selectedDate, "date", "required")}
      ${input("time", "Starts", data.time, "time")}
      ${input("endTime", "Ends", data.endTime, "time")}
      <label class="form-label workspace-full">Notes<textarea name="notes" maxlength="3000">${escape(data.notes)}</textarea></label>
      ${type === "slot" ? `<label class="workspace-check"><input type="checkbox" name="booked"${data.booked ? " checked" : ""}> Booked</label>` : ""}
      ${type === "reminder" ? `<label class="workspace-check"><input type="checkbox" name="completed"${data.completed ? " checked" : ""}> Complete</label>` : ""}
      ${controls(Boolean(row))}
    </form>`;
  }

  function dayItems(rows) {
    return rows.map(item => `<div class="workspace-list-row"><div>
      <b>${escape(item.title)}</b>
      <small>${escape([item.dateLabel || label[item.kind], item.time, item.data?.booked ? `Booked${item.data.bookedBy ? ` by ${item.data.bookedBy}` : ""}` : ""].filter(Boolean).join(" · "))}</small>
      ${item.text ? `<p class="workspace-body">${escape(item.text)}</p>` : ""}
      ${item.data?.bookingNotes ? `<p class="workspace-body">${escape(item.data.bookingNotes)}</p>` : ""}
      </div>${item.record ? `<button class="secondary-action" type="button" data-op="edit" data-id="${escape(item.id)}">Edit</button>` : ""}
    </div>`).join("");
  }

  function calendar() {
    const all = entries();
    const months = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const firstDay = (month.getDay() + 6) % 7;
    const counts = new Map();
    for (const item of all) counts.set(item.day, (counts.get(item.day) || 0) + 1);
    const cells = Array.from({ length: days }, (_, index) => {
      const day = index + 1;
      const key = dateKey(new Date(month.getFullYear(), month.getMonth(), day));
      const count = counts.get(key) || 0;
      return `<button type="button" class="workspace-calendar-day" data-op="day" data-day="${key}"
        aria-label="${escape(dateLabel(key))}, ${count} items" aria-pressed="${selectedDate === key}"${key === today ? ' aria-current="date"' : ""}>
        <b>${day}</b>${count ? `<span class="workspace-calendar-count">${count}</span>` : ""}
      </button>`;
    }).join("");
    const next = all.filter(item => item.day >= today && item.kind !== "slot" && item.data?.completed !== true).slice(0, 8);
    return `<header class="workspace-section-head"><h2>Calendar & scheduling</h2><div class="workspace-card-actions">
      <button class="secondary-action" type="button" data-op="new" data-kind="slot">+ Availability</button>
      <button class="secondary-action" type="button" data-op="new" data-kind="reminder">+ Reminder</button>
      <button class="primary-action" type="button" data-op="new" data-kind="meeting">+ Meeting</button>
    </div></header>
    ${calendarForm(draftKind, editing)}
    <div class="workspace-calendar-layout">
      <section class="workspace-card">
        <header><h3>${escape(months.format(month))}</h3><div class="workspace-card-actions">
          <button class="secondary-action" type="button" data-op="previous" aria-label="Previous month">‹</button>
          <button class="secondary-action" type="button" data-op="today">Today</button>
          <button class="secondary-action" type="button" data-op="next" aria-label="Next month">›</button></div></header>
        <div class="workspace-calendar-grid" aria-label="Calendar days">
          ${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(day => `<span class="workspace-weekday">${day}</span>`).join("")}
          ${"<span></span>".repeat(firstDay)}${cells}
        </div>
      </section>
      <section class="workspace-card"><h3>${escape(dateLabel(selectedDate))}</h3>${dayItems(all.filter(item => item.day === selectedDate)) || empty("No items for this day.")}</section>
    </div>
    <section class="workspace-card"><h3>Upcoming reminders</h3>${next.map(item => `<div class="workspace-list-row"><div><b>${escape(item.title)}</b>
      <small>${escape(item.dateLabel || label[item.kind] || "Planning item")}</small></div><time>${escape(dateLabel(item.day))}</time></div>`).join("") || empty("No upcoming reminders.")}</section>`;
  }

  function entryLine(item) {
    const offset = item.offset || 0;
    return item.time || offset || item.notes ? [offset, item.time || "", item.title, item.notes || ""].join(" | ") : item.title;
  }

  function templateEditor() {
    if (!draftKind) return "";
    return `<form class="workspace-form" data-operation-form="template">
      ${input("title", "Template name", editing?.title, "text", 'required maxlength="160"')}
      <label class="form-label">Template type<select name="type"><option value="tasks">Actions</option>
        <option value="timeline"${editing?.data.type === "timeline" ? " selected" : ""}>Timeline</option></select></label>
      <label class="workspace-check"><input name="shared" type="checkbox"${editing?.scope === "shared" || !editing ? " checked" : ""}> Available across projects</label>
      <label class="form-label workspace-full">Entries, one per line<textarea name="entries" required maxlength="24000">${escape((editing?.data.entries || []).map(entryLine).join("\n"))}</textarea></label>
      <p class="workspace-full">Enter a title on each line. To include timing, use day offset | time | title | notes.</p>
      ${controls(Boolean(editing))}
    </form>`;
  }

  function templates() {
    const found = records.filter(item => item.kind === "template");
    return `<header class="workspace-section-head"><h2>Reusable templates</h2><button class="primary-action" type="button" data-op="new" data-kind="template">+ New template</button></header>
      ${templateEditor()}
      <div class="workspace-grid">${found.map(row => `<article class="workspace-card"><header><div>
        <h3>${escape(row.title)}</h3><p>${row.data.type === "timeline" ? "Timeline" : "Actions"} · ${Number(row.data.entries?.length || 0)} entries</p></div>
        <button class="secondary-action" type="button" data-op="edit" data-id="${escape(row.id)}">Edit</button></header>
        <form class="workspace-form" data-operation-form="apply" data-id="${escape(row.id)}">
          ${input("base", "Base date", activeScope === "spain" ? "2026-10-10" : activeScope === "south_africa" ? "2026-12-19" : today, "date", "required")}
          <div class="workspace-form-actions"><button class="primary-action" type="submit">Apply to project</button></div></form>
      </article>`).join("") || empty("Save a checklist or run sheet to reuse it across weddings.")}</div>`;
  }

  function paint() {
    if (!container.isConnected) return;
    container.innerHTML = `${failure ? `<p class="workspace-error" role="alert">${escape(failure)}</p>` : ""}${context.tool === "calendar" ? calendar() : templates()}`;
  }

  function storeRow(record) {
    records = [record, ...records.filter(item => item.id !== record.id)];
    editing = null;
    draftKind = "";
  }

  container.addEventListener("click", async event => {
    const control = event.target.closest("[data-op]");
    if (!control || saving) return;
    const { op, day, id, kind } = control.dataset;
    failure = "";
    try {
      if (op === "previous" || op === "next") month = new Date(month.getFullYear(), month.getMonth() + (op === "previous" ? -1 : 1), 1);
      if (op === "today") { month = new Date(now.getFullYear(), now.getMonth(), 1); selectedDate = today; }
      if (op === "day") selectedDate = day;
      if (op === "new") { draftKind = kind; editing = null; }
      if (op === "edit") {
        editing = records.find(item => item.id === id);
        draftKind = editing?.kind || "";
      }
      if (op === "cancel") { editing = null; draftKind = ""; }
      if (op === "delete" && editing && window.confirm(`Delete ${editing.title}?`)) {
        await context.remove(editing);
        records = records.filter(item => item.id !== editing.id);
        editing = null;
        draftKind = "";
      }
    } catch (error) {
      failure = error.message;
    }
    paint();
  });

  container.addEventListener("submit", async event => {
    const target = event.target.closest("[data-operation-form]");
    if (!target || saving) return;
    event.preventDefault();
    const values = new FormData(target);
    const get = key => String(values.get(key) || "").trim();
    saving = true;
    failure = "";
    target.querySelector("button[type=submit]").disabled = true;
    try {
      if (target.dataset.operationForm === "apply") {
        const row = records.find(item => item.id === target.dataset.id);
        const count = await context.applyTemplate(row, get("base"));
        toast(count ? `${count} items added.` : "This template was already applied for those dates.");
      } else if (target.dataset.operationForm === "template") {
        const items = get("entries").split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
          const pieces = line.split("|").map(part => part.trim());
          if (pieces.length === 1) return { title: pieces[0] };
          const [offset, time, title, ...notes] = pieces;
          if (!/^-?\d{1,4}$/.test(offset) || !title || (time && !/^([0-1]\d|2[0-3]):[0-5]\d$/.test(time))) {
            throw new Error("Use a whole day offset, optional 24-hour time and title on each timed line.");
          }
          return { title, offset: Number(offset), time, notes: notes.join(" | ") };
        });
        if (!items.length || items.length > 100 || items.some(item => item.title.length > 160)) throw new Error("Use one to 100 entries, each with a title up to 160 characters.");
        const targetScope = editing?.scope || (values.has("shared") ? "shared" : activeScope);
        storeRow(await context.save("template", editing, get("title"), { type: get("type"), entries: items }, targetScope));
      } else {
        const kind = editing?.kind || get("kind");
        const data = { ...editing?.data, date: get("date"), time: get("time"), endTime: get("endTime"), notes: get("notes") };
        if (kind === "slot" && !data.time) throw new Error("Choose a start time for an availability slot.");
        if (data.time && data.endTime && data.endTime <= data.time) throw new Error("Choose an end time after the start.");
        if (kind === "slot") data.booked = draftKind === "slot" ? values.has("booked") : false;
        if (kind === "reminder") data.completed = values.has("completed");
        storeRow(await context.save(kind, editing, get("title"), data));
      }
    } catch (error) {
      failure = error.message;
    } finally {
      saving = false;
      paint();
    }
  });

  paint();
}
