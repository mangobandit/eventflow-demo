const seatingWorkspace = (function createSeatingWorkspace() {
  "use strict";

  const room = document.getElementById("seatingPlanner");
  const events = [["south_africa", "South Africa"], ["spain", "Spain"]];
  const shapes = [["round", "Round"], ["rectangle", "Banquet"], ["square", "Square"]];
  const eventLabel = Object.fromEntries(events);
  let event = "south_africa";
  let cache = {};
  let token;
  let loadError = "";
  let loading = false;
  let selected;
  let editing = "";
  let query = "";
  let drag;
  let lastDrag = 0;

  function reset() {
    token = null;
    cache = {};
    loadError = "";
    loading = false;
    selected = null;
    editing = "";
    query = "";
    drag = null;
    room.replaceChildren();
  }

  function entry() {
    return cache[event];
  }

  function guests() {
    return state.data.guests
      .filter(guest => guest.celebration === event)
      .sort((first, second) => first.name.localeCompare(second.name));
  }

  function render() {
    const session = state.session?.token;
    if (!session) return;
    if (session !== token) {
      reset();
      token = session;
      event = state.celebration === "spain" ? "spain" : "south_africa";
    }
    draw();
    if (!entry() && !loading && !loadError) load();
  }

  async function load(onlyEvent) {
    if (loading) return;
    const session = token;
    loading = true;
    loadError = "";
    draw();
    try {
      const response = await plannerRpc("planner_load_seating", { p_token: session });
      if (session !== token) return;
      for (const [key] of events) {
        if (onlyEvent && key !== onlyEvent) continue;
        const record = response?.[key];
        cache[key] = {
          plan: record?.plan || { tables: [], assignments: {} },
          version: record?.version || 0,
          history: [],
          saving: false,
          unsaved: false,
          conflict: false,
          message: ""
        };
      }
    } catch (error) {
      if (session === token) loadError = error.message || "Could not load seating.";
    } finally {
      if (session === token) {
        loading = false;
        draw();
      }
    }
  }

  function draw() {
    if (state.view !== "seating" || !token) return;
    const current = entry();
    const tabs = events.map(([value, label]) =>
      `<button type="button" data-seat-event="${value}" aria-pressed="${event === value}">${label}</button>`
    ).join("");
    const heading = `<header class="seating-header"><div><h2>Reception floor plan</h2><p>${eventLabel[event]}</p></div><div class="seating-events" role="group" aria-label="Wedding">${tabs}</div></header>`;
    if (!current) {
      room.innerHTML = `${heading}<div class="seating-feedback" role="status">${escapeHtml(loadError || "Opening your floor plan…")}${loadError ? ' <button type="button" class="secondary-action" data-seat-action="reload">Try again</button>' : ""}</div>`;
      return;
    }

    const roster = guests();
    const { tables, assignments } = current.plan;
    const table = tables.find(item => item.id === selected) || tables[0];
    selected = table?.id || null;
    const assigned = roster.filter(person => Object.hasOwn(assignments, person.id));
    const pool = roster.filter(person => person.rsvp_status !== "no" && !Object.hasOwn(assignments, person.id));
    const statusText = loading ? "Refreshing…" : current.saving ? "Saving…" : current.message || (current.unsaved ? "Unsaved changes" : "All changes saved");
    const unavailable = loading || current.saving || current.unsaved;
    const disabled = unavailable ? " disabled" : "";
    const retry = current.unsaved && !current.saving && !loading
      ? `<button type="button" class="secondary-action" data-seat-action="${current.conflict ? "reload" : "retry"}">${current.conflict ? "Reload plan" : "Retry save"}</button>` : "";
    room.innerHTML = `${heading}
      <div class="seating-toolbar">
        <div class="seating-tools" aria-label="Floor plan tools">
          <button class="secondary-action" type="button" data-seat-action="add-round"${disabled}>+ Round table</button>
          <button class="secondary-action" type="button" data-seat-action="add-rectangle"${disabled}>+ Banquet table</button>
          <button class="secondary-action" type="button" data-seat-action="undo"${unavailable || !current.history.length ? " disabled" : ""}>Undo</button>
        </div>
        <div class="seating-save" role="status">${escapeHtml(statusText)} ${retry}</div>
      </div>
      <div class="seating-workspace">
        <div class="seating-floor" data-seating-floor>
          ${tables.map(item => floorTable(item, assigned.filter(person => assignments[person.id] === item.id).length)).join("")}
          ${tables.length ? "" : '<p class="seating-empty-floor">Add a table to start arranging the room.</p>'}
          <div class="seating-floor-help">Drag tables to move them. Use arrow keys when a table is focused.</div>
        </div>
        <aside class="seating-side" aria-label="Guests and table settings">
          <section class="seating-card">
            ${table ? inspector(table, roster, pool, current, disabled) : "<h3>Table details</h3><p>Select a table to edit its seats and guests.</p>"}
          </section>
          <section class="seating-card seating-pool">
            <header><h3>Unseated guests</h3><span>${pool.length}</span></header>
            <p>${assigned.length} seated · ${tables.reduce((total, item) => total + item.capacity, 0)} seats</p>
            <label class="seating-label">Find an unseated guest
              <input type="search" data-seat-search value="${escapeHtml(query)}" placeholder="Search names">
            </label>
            <ul data-seat-pool aria-label="Unseated guests">${poolRows(pool, Boolean(table), disabled)}</ul>
          </section>
        </aside>
      </div>`;
  }

  function floorTable(table, occupied) {
    const shape = shapes.some(([value]) => value === table.shape) ? table.shape : "round";
    const width = shape === "rectangle" ? Math.min(274, 116 + table.capacity * 5.8) : Math.min(145, 100 + table.capacity * 1.6);
    const markers = Math.min(table.capacity, 36);
    const top = Math.ceil(markers / 2);
    const positions = Array.from({ length: markers }, (_, index) => {
      if (shape === "round") {
        const angle = index * 2 * Math.PI / markers - Math.PI / 2;
        return [50 + 56 * Math.cos(angle), 50 + 56 * Math.sin(angle)];
      }
      const firstRow = index < top;
      return [100 * ((firstRow ? index : index - top) + 1) / ((firstRow ? top : markers - top) + 1), firstRow ? -8 : 108];
    });
    const chairs = positions.map(([x, y], index) =>
      `<i class="seating-chair${index < occupied ? " is-filled" : ""}" style="left:${x}%;top:${y}%"></i>`
    ).join("");

    return `<button type="button" class="seating-table seating-table--${shape}" data-seat-table="${escapeHtml(table.id)}"
      aria-pressed="${selected === table.id}" aria-label="${escapeHtml(table.name)}, ${occupied} of ${table.capacity} seats filled"
      style="left:${table.x}%;top:${table.y}%;--table-width:${width}px;--table-rotation:${table.rotation}deg">
      <span class="seating-table-shape" aria-hidden="true">${chairs}</span>
      <span class="seating-table-label"><b>${escapeHtml(table.name)}</b><small>${occupied} / ${table.capacity}</small></span>
    </button>`;
  }

  function inspector(table, roster, pool, current, disabled) {
    const { tables, assignments } = current.plan;
    const members = roster.filter(person => assignments[person.id] === table.id);
    const options = shapes.map(([value, title]) =>
      `<option value="${value}"${table.shape === value ? " selected" : ""}>${title}</option>`
    ).join("");
    const otherTables = tables.filter(item => item.id !== table.id);
    const guestOptions = pool.map(person => `<option value="${escapeHtml(person.id)}">${escapeHtml(person.name)}</option>`).join("");
    const memberList = members.map(person =>
      `<li draggable="${disabled ? "false" : "true"}" data-seat-guest="${escapeHtml(person.id)}">
        <span>${escapeHtml(person.name)}${person.dietary ? '<small> Dietary note</small>' : ""}</span>
        <button type="button" aria-label="Unseat ${escapeHtml(person.name)}" data-seat-action="unseat"${disabled}>×</button>
      </li>`
    ).join("");

    let extra = "";
    if (editing === "split") {
      extra = `<form class="seating-inline" data-seat-form="split">
        <p>Choose the guests who should move to the new table.</p>
        <fieldset${disabled}>${members.map(person => `<label class="seating-check"><input type="checkbox" name="guest" value="${escapeHtml(person.id)}"> ${escapeHtml(person.name)}</label>`).join("")}
          <button type="submit" class="primary-action">Split table</button>
        </fieldset>
      </form>`;
    }
    if (editing === "merge") {
      extra = `<form class="seating-inline" data-seat-form="merge">
        <label class="seating-label">Move this table’s guests to<select name="target" required>${otherTables.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join("")}</select></label>
        <button type="submit" class="primary-action"${disabled}>Merge tables</button>
      </form>`;
    }

    return `<header><h3>${escapeHtml(table.name)}</h3><span>${members.length}/${table.capacity}</span></header>
      <form class="seating-table-settings" data-seat-form="details">
        <fieldset${disabled}>
          <label class="seating-label seating-full">Table name<input name="name" maxlength="120" value="${escapeHtml(table.name)}" required></label>
          <label class="seating-label">Shape<select name="shape">${options}</select></label>
          <label class="seating-label">Seats<input name="capacity" type="number" value="${table.capacity}" min="${Math.max(1, members.length)}" max="200" required></label>
          <button class="secondary-action" type="submit">Save details</button>
          <button class="secondary-action" type="button" data-seat-action="rotate">Rotate ↻</button>
        </fieldset>
      </form>
      <div class="seating-tools seating-table-tools">
        <button class="secondary-action" type="button" data-seat-action="split" aria-expanded="${editing === "split"}"${disabled}>Split</button>
        <button class="secondary-action" type="button" data-seat-action="merge" aria-expanded="${editing === "merge"}"${disabled || (!otherTables.length ? " disabled" : "")}>Merge</button>
        <button class="secondary-action" type="button" data-seat-action="remove"${disabled}>Remove</button>
      </div>
      ${extra}
      <form class="seating-add-guest" data-seat-form="assign">
        <label class="seating-label">Add a guest
          <select name="guest" aria-label="Unseated guest to add" required${disabled || (!pool.length || members.length >= table.capacity ? " disabled" : "")}>
            <option value="">Choose a guest</option>${guestOptions}
          </select>
        </label>
        <button class="secondary-action" type="submit"${disabled || (!pool.length || members.length >= table.capacity ? " disabled" : "")}>Seat</button>
      </form>
      <ul class="seating-members" aria-label="Guests at ${escapeHtml(table.name)}">${memberList || "<li>No guests at this table.</li>"}</ul>`;
  }

  function poolRows(pool, canAssign, disabled) {
    const term = query.trim().toLowerCase();
    const shown = pool.filter(person => person.name.toLowerCase().includes(term));
    if (!shown.length) return `<li>${term ? "No matching names." : "All guests are seated."}</li>`;
    return shown.map(person =>
      `<li data-seat-guest="${escapeHtml(person.id)}" draggable="${disabled ? "false" : "true"}">
        <span>${escapeHtml(person.name)}</span>
        ${canAssign ? `<button class="seating-pool-add" type="button" title="Seat at selected table" aria-label="Seat ${escapeHtml(person.name)} at selected table" data-seat-action="seat"${disabled}>+</button>` : ""}
      </li>`
    ).join("");
  }

  function notify(message) {
    toast(message, true);
  }

  function edit(change, undo = false) {
    const current = entry();
    if (!current || loading || current.saving || current.unsaved) return;
    const draft = structuredClone(current.plan);
    const next = change(draft);
    if (!next) return;
    if (!undo) {
      current.history.push(current.plan);
      if (current.history.length > 20) current.history.shift();
    }
    current.plan = next;
    current.unsaved = true;
    save();
  }

  async function save() {
    const current = entry();
    if (!current || current.saving) return;
    const celebration = event;
    const session = token;
    current.saving = true;
    current.message = "";
    draw();
    try {
      const response = await plannerRpc("planner_save_seating", {
        p_token: session,
        p_event: celebration,
        p_plan: current.plan,
        p_expected_version: current.version
      });
      if (session !== token) return;
      current.plan = response.plan;
      current.version = response.version;
      current.unsaved = false;
    } catch (error) {
      if (session !== token) return;
      current.conflict = /changed elsewhere/i.test(error.message);
      current.message = error.message || "The seating change could not be saved.";
    } finally {
      if (session === token) {
        current.saving = false;
        if (event === celebration) {
          const focusedTable = document.activeElement?.dataset.seatTable;
          draw();
          if (focusedTable && state.view === "seating") {
            room.querySelector(`[data-seat-table="${CSS.escape(focusedTable)}"]`)?.focus();
          }
        }
      }
    }
  }

  function position(tables) {
    if (!tables.length) return { x: 32, y: 28 };
    const positions = [[32, 28], [70, 28], [32, 70], [70, 70], [50, 48], [52, 20], [50, 82]];
    const distance = ([x, y]) => Math.min(...tables.map(table => (x - table.x) ** 2 + (y - table.y) ** 2));
    positions.sort((first, second) => distance(second) - distance(first));
    const [x, y] = positions[0];
    return { x, y };
  }

  function newTable(plan, shape) {
    const names = new Set(plan.tables.map(table => table.name));
    let number = plan.tables.length + 1;
    while (names.has(`Table ${number}`)) number++;
    return { id: crypto.randomUUID(), name: `Table ${number}`, shape,
      capacity: shape === "rectangle" ? 12 : 8, rotation: 0, ...position(plan.tables) };
  }

  function seat(person, id) {
    edit(plan => {
      const table = plan.tables.find(item => item.id === id);
      if (!table || !guests().some(guest => guest.id === person) || plan.assignments[person] === id) return;
      if (Object.values(plan.assignments).filter(value => value === id).length >= table.capacity) {
        notify(`${table.name} is full. Increase its seats or choose another table.`);
        return;
      }
      plan.assignments[person] = id;
      selected = id;
      return plan;
    });
  }

  room.addEventListener("click", click => {
    const tab = click.target.closest("[data-seat-event]");
    if (tab) {
      event = tab.dataset.seatEvent;
      selected = null;
      editing = "";
      query = "";
      draw();
      return;
    }
    const button = click.target.closest("[data-seat-action]");
    const tableButton = click.target.closest("[data-seat-table]");
    const current = entry();
    if (tableButton && !button && performance.now() - lastDrag > 180) {
      selected = tableButton.dataset.seatTable;
      editing = "";
      draw();
      room.querySelector(`[data-seat-table="${CSS.escape(selected)}"]`)?.focus();
    }
    if (!button) return;
    const action = button.dataset.seatAction;
    if (action === "reload") {
      if (current?.unsaved && !window.confirm("Discard the unsaved seating change and load the latest plan?")) return;
      load(current ? event : undefined);
    } else if (action === "retry") {
      save();
    } else if (action === "undo" && current?.history.length) {
      edit(() => current.history.pop(), true);
    } else if (action === "seat") {
      seat(button.closest("[data-seat-guest]").dataset.seatGuest, selected);
    } else if (action === "split" || action === "merge") {
      editing = editing === action ? "" : action;
      draw();
    } else if (action.startsWith("add-")) {
      edit(plan => {
        if (plan.tables.length >= 160) return notify("The plan already has 160 tables.");
        const table = newTable(plan, action.slice(4));
        plan.tables.push(table);
        selected = table.id;
        editing = "";
        return plan;
      });
    } else if (action === "rotate") {
      edit(plan => {
        const table = plan.tables.find(item => item.id === selected);
        table.rotation = (table.rotation + 15) % 360;
        return plan;
      });
    } else if (action === "remove") {
      const table = current?.plan.tables.find(item => item.id === selected);
      if (table && window.confirm(`Remove ${table.name} from the floor plan? Its guests will become unseated.`)) {
        edit(plan => {
          plan.tables = plan.tables.filter(item => item.id !== selected);
          for (const [id, value] of Object.entries(plan.assignments)) {
            if (value === selected) delete plan.assignments[id];
          }
          selected = null;
          editing = "";
          return plan;
        });
      }
    } else if (action === "unseat") {
      edit(plan => {
        delete plan.assignments[button.closest("[data-seat-guest]").dataset.seatGuest];
        return plan;
      });
    }
  });

  room.addEventListener("input", input => {
    if (!input.target.matches("[data-seat-search]")) return;
    query = input.target.value;
    const current = entry();
    const pool = guests().filter(person => person.rsvp_status !== "no" && !Object.hasOwn(current.plan.assignments, person.id));
    room.querySelector("[data-seat-pool]").innerHTML = poolRows(pool, Boolean(selected), current.saving || current.unsaved);
  });

  room.addEventListener("submit", submit => {
    const form = submit.target;
    if (!form.dataset.seatForm) return;
    submit.preventDefault();
    const values = new FormData(form);
    if (form.dataset.seatForm === "assign") {
      seat(values.get("guest"), selected);
      return;
    }
    edit(plan => {
      const table = plan.tables.find(item => item.id === selected);
      const count = Object.values(plan.assignments).filter(id => id === table.id).length;
      if (form.dataset.seatForm === "details") {
        const name = values.get("name").trim();
        const capacity = Number(values.get("capacity"));
        if (!name || !Number.isInteger(capacity) || capacity < Math.max(1, count) || capacity > 200) {
          return notify("Enter a table name and enough seats for everyone at it.");
        }
        Object.assign(table, { name, capacity, shape: values.get("shape") });
      } else if (form.dataset.seatForm === "split") {
        if (plan.tables.length >= 160) return notify("The plan already has 160 tables.");
        const moving = values.getAll("guest");
        const maximum = table.capacity - Math.max(1, count - moving.length);
        const newCapacity = Math.min(maximum, Math.max(1, Math.floor(table.capacity / 2), moving.length));
        if (newCapacity < 1 || moving.length > newCapacity) {
          return notify("Select guests to move and leave at least one seat at each table.");
        }
        const second = newTable(plan, table.shape);
        second.capacity = newCapacity;
        second.rotation = table.rotation;
        table.capacity -= newCapacity;
        for (const id of moving) plan.assignments[id] = second.id;
        plan.tables.push(second);
        selected = second.id;
        editing = "";
      } else if (form.dataset.seatForm === "merge") {
        const target = plan.tables.find(item => item.id === values.get("target"));
        if (!target || target.id === table.id) return;
        if (target.capacity + table.capacity > 200) return notify("The combined table would have more than 200 seats.");
        target.capacity += table.capacity;
        for (const [id, value] of Object.entries(plan.assignments)) {
          if (value === table.id) plan.assignments[id] = target.id;
        }
        plan.tables = plan.tables.filter(item => item.id !== table.id);
        selected = target.id;
        editing = "";
      }
      return plan;
    });
  });

  function bounds(x, y, button) {
    const frame = room.querySelector("[data-seating-floor]").getBoundingClientRect();
    const table = button.getBoundingClientRect();
    const horizontalPadding = Math.max(8, 100 * (table.width / 2 + 12) / frame.width);
    const verticalPadding = Math.max(11, 100 * (table.height / 2 + 12) / frame.height);
    const clamp = (value, min, max) => Math.round(Math.max(min, Math.min(max, value)) * 10) / 10;
    return { x: clamp(x, horizontalPadding, 100 - horizontalPadding),
      y: clamp(y, verticalPadding, Math.min(87, 100 - verticalPadding)) };
  }

  function moveTable(id, x, y) {
    edit(plan => {
      const table = plan.tables.find(item => item.id === id);
      if (!table) return;
      const button = room.querySelector(`[data-seat-table="${CSS.escape(id)}"]`);
      Object.assign(table, bounds(x, y, button));
      selected = id;
      return plan;
    });
  }

  room.addEventListener("pointerdown", down => {
    const button = down.target.closest("[data-seat-table]");
    const current = entry();
    if (!button || !down.isPrimary || down.button !== 0 || loading || current?.saving || current?.unsaved) return;
    const table = current.plan.tables.find(item => item.id === button.dataset.seatTable);
    const frame = room.querySelector("[data-seating-floor]").getBoundingClientRect();
    drag = { button, table, frame, pointer: down.pointerId, x0: down.clientX, y0: down.clientY };
    button.setPointerCapture(down.pointerId);
  });

  room.addEventListener("pointermove", move => {
    if (!drag || drag.pointer !== move.pointerId) return;
    const dx = move.clientX - drag.x0;
    const dy = move.clientY - drag.y0;
    if (!drag.position && Math.hypot(dx, dy) < 4) return;
    drag.position = bounds(drag.table.x + dx * 100 / drag.frame.width, drag.table.y + dy * 100 / drag.frame.height, drag.button);
    drag.button.classList.add("is-dragging");
    drag.button.style.left = `${drag.position.x}%`;
    drag.button.style.top = `${drag.position.y}%`;
  });

  room.addEventListener("pointerup", up => {
    if (!drag || drag.pointer !== up.pointerId) return;
    const { button, position: destination, table } = drag;
    drag = null;
    button.classList.remove("is-dragging");
    if (destination) {
      lastDrag = performance.now();
      moveTable(table.id, destination.x, destination.y);
    }
  });

  room.addEventListener("pointercancel", cancel => {
    if (drag?.pointer !== cancel.pointerId) return;
    drag = null;
    draw();
  });

  room.addEventListener("keydown", key => {
    const button = key.target.closest("[data-seat-table]");
    const deltas = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (!button || !Object.hasOwn(deltas, key.key)) return;
    key.preventDefault();
    const id = button.dataset.seatTable;
    const table = entry().plan.tables.find(item => item.id === id);
    const [dx, dy] = deltas[key.key];
    const scale = key.shiftKey ? 6 : 2;
    moveTable(id, table.x + dx * scale, table.y + dy * scale);
    room.querySelector(`[data-seat-table="${CSS.escape(id)}"]`)?.focus();
  });

  room.addEventListener("dragstart", start => {
    const item = start.target.closest("[data-seat-guest]");
    if (!item || !start.dataTransfer || entry()?.unsaved) return;
    start.dataTransfer.effectAllowed = "move";
    start.dataTransfer.setData("application/x-mxc-guest-id", item.dataset.seatGuest);
  });

  room.addEventListener("dragover", over => {
    const table = over.target.closest("[data-seat-table]");
    if (!table || !over.dataTransfer?.types.includes("application/x-mxc-guest-id")) return;
    over.preventDefault();
    table.classList.add("is-drop-target");
    over.dataTransfer.dropEffect = "move";
  });

  room.addEventListener("dragleave", leave => leave.target.closest("[data-seat-table]")?.classList.remove("is-drop-target"));
  room.addEventListener("drop", drop => {
    const button = drop.target.closest("[data-seat-table]");
    const person = drop.dataTransfer?.getData("application/x-mxc-guest-id");
    if (!button || !person) return;
    drop.preventDefault();
    button.classList.remove("is-drop-target");
    seat(person, button.dataset.seatTable);
  });

  return { render, reset };
})();

function renderSeatingPlanner() { seatingWorkspace.render(); }
function resetSeatingPlanner() { seatingWorkspace.reset(); }
