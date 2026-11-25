const seatingWorkspace = (function createSeatingWorkspace() {
  "use strict";

  const room = document.getElementById("seatingPlanner");
  const events = [["south_africa", "South Africa"], ["spain", "Spain"]];
  const shapes = [["round", "Round"], ["rectangle", "Banquet"], ["square", "Square"]];
  const eventLabel = Object.fromEntries(events);
  const minTableScale = .65;
  const maxTableScale = 1.8;
  const tableHandles = "[data-seat-table], [data-seat-resize], [data-seat-rotate]";
  let event = "south_africa";
  let cache = {};
  let token;
  let loadError = "";
  let loading = false;
  let selected;
  let selectedChair = null;
  let pickedGuest = null;
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
    selectedChair = null;
    pickedGuest = null;
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
    loadMealColours();
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
          plan: reconcileSeats(record?.plan || { tables: [], assignments: {} }),
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
    const focused = document.activeElement?.dataset;
    const focusedHandle = focused?.seatRotate ? `[data-seat-rotate="${CSS.escape(focused.seatRotate)}"]` :
      focused?.seatResize ? `[data-seat-resize="${CSS.escape(focused.seatResize)}"]` : null;
    drag = null;
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
    const filled = new Map(tables.map(item => [item.id, chairsAt(item, current.plan, roster)]));
    const table = tables.find(item => item.id === selected) || tables[0];
    if (!table || selected !== table.id || selectedChair > table.capacity) selectedChair = null;
    selected = table?.id || null;
    const assigned = roster.filter(person => Object.hasOwn(assignments, person.id));
    const pool = roster.filter(person => person.rsvp_status !== "no" && !Object.hasOwn(assignments, person.id));
    const picking = roster.find(person => person.id === pickedGuest);
    const statusText = loading ? "Refreshing…" : current.saving ? "Saving…" : current.message || (current.unsaved ? "Unsaved changes" : "All changes saved");
    const unavailable = loading || current.saving || current.unsaved;
    const disabled = unavailable ? " disabled" : "";
    const availableSeats = tables.reduce((total, item) => total + item.capacity, 0) - Object.keys(assignments).length;
    const canAutoSeat = !unavailable && pool.length > 0 && availableSeats > 0;
    const retry = current.unsaved && !current.saving && !loading
      ? `<button type="button" class="secondary-action" data-seat-action="${current.conflict ? "reload" : "retry"}">${current.conflict ? "Reload plan" : "Retry save"}</button>` : "";
    const oldList = room.querySelector(".seating-chair-list");
    const chairScroll = oldList?.dataset.listTable === selected ? oldList.scrollTop : 0;
    const poolScroll = room.querySelector("[data-seat-pool]")?.scrollTop || 0;
    room.innerHTML = `${heading}
      <div class="seating-toolbar">
        <div class="seating-tools" aria-label="Floor plan tools">
          <button class="secondary-action" type="button" data-seat-action="add-round"${disabled}>+ Round table</button>
          <button class="secondary-action" type="button" data-seat-action="add-rectangle"${disabled}>+ Banquet table</button>
          <button class="secondary-action" type="button" data-seat-action="quick-setup"${disabled}>Quick setup</button>
          <button class="secondary-action" type="button" data-seat-action="auto-seat"${canAutoSeat ? "" : " disabled"}>Auto seat</button>
          <button class="secondary-action" type="button" data-seat-action="undo"${unavailable || !current.history.length ? " disabled" : ""}>Undo</button>
        </div>
        <div class="seating-save" role="status">${escapeHtml(statusText)} ${retry}</div>
      </div>
      <div class="seating-colour-tools">
        <div data-seat-colour-legend></div>
        <button type="button" class="secondary-action" data-seat-action="refresh-meals">Refresh meals</button>
        <p data-seat-meal-status role="status"></p>
      </div>
      ${editing === "quick-setup" ? `<form class="seating-card seating-quick-setup" data-seat-form="quick-setup">
        <label class="seating-label">Tables<input name="count" type="number" min="1" max="20" value="4" required></label>
        <label class="seating-label">Chairs per table<input name="capacity" type="number" min="1" max="200" value="8" required></label>
        <label class="seating-label">Shape<select name="shape">${shapes.map(([value, name]) => `<option value="${value}">${name}</option>`).join("")}</select></label>
        <button class="primary-action" type="submit"${disabled}>Add tables</button>
        <button class="secondary-action" type="button" data-seat-action="quick-setup">Cancel</button>
      </form>` : ""}
      ${picking ? `<div class="seating-pick-status" role="status"><span>Choose a chair for <b>${escapeHtml(picking.name)}</b>.</span>
        <button class="secondary-action" type="button" data-seat-action="cancel-pick">Cancel</button></div>` : ""}
      <div class="seating-workspace">
        <div class="seating-floor" data-seating-floor>
          ${tables.map(item => floorTable(item, filled.get(item.id), unavailable)).join("")}
          ${tables.length ? "" : '<p class="seating-empty-floor">Add a table to start arranging the room.</p>'}
          <div class="seating-floor-help" id="seating-floor-help">Drag guests onto chairs. Select a table to resize or rotate with its handles or the arrow keys.</div>
        </div>
        <aside class="seating-side" aria-label="Guests and table settings">
          <section class="seating-card">
            ${table ? inspector(table, roster, pool, current, filled.get(table.id), unavailable) : "<h3>Table details</h3><p>Select a table to edit its seats and guests.</p>"}
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
    const list = room.querySelector(".seating-chair-list");
    if (list) list.scrollTop = chairScroll;
    room.querySelector("[data-seat-pool]").scrollTop = poolScroll;
    decorateSeats();
    if (focusedHandle) room.querySelector(focusedHandle)?.focus({ preventScroll: true });
  }

  function loadMealColours(refresh = false) {
    const session = token;
    const button = room.querySelector('[data-seat-action="refresh-meals"]');
    if (refresh && button) button.disabled = true;
    plannerRegisters.loadMeals(session, refresh).then(() => {
      if (session === token) decorateSeats();
      if (button?.isConnected) button.disabled = false;
    });
  }

  function decorateSeats() {
    const legend = room.querySelector("[data-seat-colour-legend]");
    if (state.view !== "seating" || !legend) return;
    const people = new Map(guests().map(person => [person.id, person]));
    const assigned = Object.keys(entry().plan.assignments).map(id => people.get(id)).filter(Boolean);
    const { rows, error } = plannerRegisters.getMeals(token);
    const colours = plannerSeatColours.build(assigned, rows);
    legend.innerHTML = colours.legend;
    room.querySelector("[data-seat-meal-status]").textContent = error
      ? "Could not load the latest meal choices. Use Refresh meals to try again."
      : rows ? "" : "Loading meal choices…";

    for (const chair of room.querySelectorAll("[data-seat-chair][data-seat-guest]")) {
      const person = people.get(chair.dataset.seatGuest);
      if (!person) continue;
      const info = colours.seat(person);
      const mealLabel = info.preference ? `${info.label} preference` : info.label || (rows ? "No meal recorded" : "");
      const details = [mealLabel, info.child ? "Child guest" : "", info.dietary ? "Dietary note" : ""].filter(Boolean);
      const label = [chair.dataset.seatLabel, ...details].join(", ");
      chair.dataset.seatMeal = info.colour;
      chair.setAttribute("aria-label", label);
      chair.title = label;
      const badges = chair.querySelector("[data-seat-flags]");
      if (badges) badges.innerHTML = `${info.child ? '<span class="seating-chair-badge is-child">C</span>' : ""}${info.dietary ? '<span class="seating-chair-badge is-dietary">D</span>' : ""}`;
      const description = chair.querySelector("[data-seat-food-description]");
      if (description) description.textContent = details.join(" · ");
    }

    const form = room.querySelector("[data-seat-meal-form]");
    if (!form) return;
    const input = form.elements.meal;
    const saved = rows?.get(form.dataset.seatMealForm)?.choice || "";
    if (input.disabled || input.value === input.defaultValue) input.value = saved;
    input.defaultValue = saved;
    input.disabled = !rows;
    form.querySelector('[type="submit"]').disabled = !rows || input.readOnly || input.value.trim() === saved;
  }

  function reconcileSeats(plan) {
    const seats = {};
    const original = plan.seats || {};
    const names = new Map(state.data.guests.map(guest => [guest.id, guest.name]));
    for (const table of plan.tables) {
      const people = Object.keys(plan.assignments).filter(id => plan.assignments[id] === table.id);
      people.sort((left, right) => {
        const byChair = (original[left] || Infinity) - (original[right] || Infinity);
        return byChair || (names.get(left) || left).localeCompare(names.get(right) || right) || left.localeCompare(right);
      });
      const used = new Set();
      const overflow = [];
      for (const id of people) {
        const chair = original[id];
        if (Number.isInteger(chair) && chair > 0 && chair <= table.capacity && !used.has(chair)) {
          seats[id] = chair;
          used.add(chair);
        } else {
          overflow.push(id);
        }
      }
      let chair = 1;
      for (const id of overflow) {
        while (used.has(chair)) chair++;
        if (chair > table.capacity) break;
        seats[id] = chair++;
      }
    }
    plan.seats = seats;
    return plan;
  }

  function chairsAt(table, plan, roster) {
    const occupants = new Map();
    for (const person of roster) {
      if (plan.assignments[person.id] === table.id) {
        occupants.set(plan.seats[person.id], person);
      }
    }
    return occupants;
  }

  function chairAttributes(table, number, person, unavailable) {
    const label = `${table.name}, chair ${number}, ${person?.name || "empty"}`;
    const controls = `data-seat-chair="${number}" data-chair-table="${escapeHtml(table.id)}"
      aria-pressed="${selected === table.id && selectedChair === number}"
      aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"`;
    const draggable = person ? ` data-seat-guest="${escapeHtml(person.id)}" data-seat-label="${escapeHtml(label)}" draggable="${!unavailable}"` : "";
    return controls + draggable;
  }

  function chairPositions(shape, capacity, sideBySide) {
    if (sideBySide) return [[68, -9, "top"], [32, -9, "top"]];
    const count = Math.min(capacity, 36);
    if (shape === "round") {
      return Array.from({ length: count }, (_, index) => {
        const angle = index * 2 * Math.PI / count - Math.PI / 2;
        return [50 + 58 * Math.cos(angle), 50 + 58 * Math.sin(angle), "ring"];
      });
    }
    const endChair = shape === "rectangle" && count > 2 && count % 2 === 1;
    const rowCount = count - Number(endChair);
    const topCount = Math.ceil(rowCount / 2);
    const rows = Array.from({ length: rowCount }, (_, index) => {
      const top = index < topCount;
      const rowIndex = top ? index : index - topCount;
      const length = top ? topCount : rowCount - topCount;
      return [100 * (rowIndex + 1) / (length + 1), top ? -9 : 109, top ? "top" : "bottom"];
    });
    return endChair ? [[-4, 50, "end"], ...rows] : rows;
  }

  function floorTable(table, occupants, unavailable) {
    const shape = shapes.some(([value]) => value === table.shape) ? table.shape : "round";
    const width = shape === "rectangle" ? Math.min(314, 116 + table.capacity * 7.5) : Math.min(150, 100 + table.capacity * 1.7);
    const size = tableSize(table);
    const sizeText = shape === "rectangle"
      ? `${Math.round(size.width * 100)}% width, ${Math.round(size.depth * 100)}% depth`
      : `${Math.round(size.width * 100)}% size`;
    const sideBySide = shape === "rectangle" && table.capacity === 2 && table.chairLayout === "side-by-side";
    const chairs = chairPositions(shape, table.capacity, sideBySide).map(([x, y, edge], index) => {
      const person = occupants.get(index + 1);
      const initials = person ? person.name.trim().split(/\s+/).filter(Boolean).slice(0, sideBySide ? 3 : 2).map(name => Array.from(name)[0]).join("").toUpperCase() : "";
      return `<button type="button" class="seating-chair${person ? " is-filled" : ""}" ${chairAttributes(table, index + 1, person, unavailable)}
        data-chair-edge="${edge}" style="left:${x}%;top:${y}%">
        <span class="seating-chair-initials" aria-hidden="true">${escapeHtml(initials)}</span>
        <span class="seating-chair-name" aria-hidden="true">${escapeHtml(person?.name || "")}</span>
        ${person ? '<span class="seating-chair-flags" data-seat-flags aria-hidden="true"></span>' : ""}
      </button>`;
    }).join("");

    return `<div class="seating-table seating-table--${shape}${selected === table.id ? " is-selected" : ""}" data-seat-group="${escapeHtml(table.id)}"
    data-chair-labels="${sideBySide ? "pair" : shape === "rectangle" && table.rotation === 0 && table.capacity >= 10 ? "row" : "compact"}"
      style="left:${table.x}%;top:${table.y}%;--table-width:${width}px;--table-rotation:${table.rotation}deg;--table-width-scale:${size.width};--table-depth-scale:${size.depth}">
      <button type="button" class="seating-table-handle" data-seat-table="${escapeHtml(table.id)}"
        aria-pressed="${selected === table.id}" aria-label="${escapeHtml(table.name)}, ${occupants.size} of ${table.capacity} seats filled">
        <span class="seating-table-shape" aria-hidden="true"></span>
        <span class="seating-table-label"><b>${escapeHtml(table.name)}</b><small>${occupants.size} / ${table.capacity}</small></span>
      </button>
      ${chairs}
      ${selected === table.id ? `<button type="button" class="seating-table-rotate" data-seat-rotate="${escapeHtml(table.id)}"
        aria-disabled="${unavailable}" aria-label="${escapeHtml(`Rotate ${table.name}, ${normalizeRotation(table.rotation)}°`)}" aria-describedby="seating-floor-help"
        aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown" title="Drag to rotate. Hold Shift to snap to 15° increments.">
        <span aria-hidden="true">&#8635;</span><span class="seating-rotation-angle" data-seat-angle aria-hidden="true">${normalizeRotation(table.rotation)}°</span></button>
      <button type="button" class="seating-table-resize" data-seat-resize="${escapeHtml(table.id)}"
        aria-disabled="${unavailable}" aria-label="${escapeHtml(`Resize ${table.name}, ${sizeText}`)}" aria-describedby="seating-floor-help"
        aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown" title="Drag to resize"><span aria-hidden="true">&#8600;</span></button>` : ""}
    </div>`;
  }

  function chairList(table, occupants, unavailable) {
    return Array.from({ length: table.capacity }, (_, index) => {
      const number = index + 1;
      const person = occupants.get(number);
      return `<li class="seating-chair-row">
        <button type="button" class="seating-chair-choice" ${chairAttributes(table, number, person, unavailable)}>
          <span class="seating-chair-number">${number}</span>
          <span class="seating-chair-person">${escapeHtml(person?.name || "Empty chair")}${person ? '<small data-seat-food-description></small>' : ""}</span>
        </button>
        ${person ? `<button type="button" class="seating-unseat" aria-label="Unseat ${escapeHtml(person.name)}" data-seat-action="unseat"
          data-unseat-guest="${escapeHtml(person.id)}"${unavailable ? " disabled" : ""}>×</button>` : ""}
      </li>`;
    }).join("");
  }

  function focusChair(table, number, floor) {
    const kind = floor ? ".seating-chair" : ".seating-chair-choice";
    room.querySelector(`${kind}[data-chair-table="${CSS.escape(table)}"][data-seat-chair="${CSS.escape(String(number))}"]`)?.focus();
  }

  function inspector(table, roster, pool, current, occupants, unavailable) {
    const { tables } = current.plan;
    const disabled = unavailable ? " disabled" : "";
    const members = Array.from(occupants.values());
    const options = shapes.map(([value, title]) =>
      `<option value="${value}"${table.shape === value ? " selected" : ""}>${title}</option>`
    ).join("");
    const otherTables = tables.filter(item => item.id !== table.id);
    const occupant = selectedChair ? occupants.get(selectedChair) : null;
    const candidates = selectedChair
      ? roster.filter(person => person.id !== occupant?.id && person.rsvp_status !== "no")
      : pool;
    const peopleDisabled = unavailable || !candidates.length || (!selectedChair && members.length >= table.capacity);
    const guestOptions = candidates.map(person => `<option value="${escapeHtml(person.id)}">${escapeHtml(person.name)}</option>`).join("");
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
      ${occupant ? `<button class="secondary-action seating-move-current" type="button" data-seat-action="pick" data-pick-guest="${escapeHtml(occupant.id)}"${disabled}>Move ${escapeHtml(occupant.name)}</button>` : ""}
      ${occupant ? `<form class="seating-seat-meal" data-seat-meal-form="${escapeHtml(occupant.id)}">
        <label class="seating-label">Meal choice for ${escapeHtml(occupant.name)}<input name="meal" maxlength="120" type="text" placeholder="e.g. Chicken, vegetarian, kids' meal" disabled></label>
        <button class="secondary-action" type="submit" disabled>Save meal</button>
        <button class="secondary-action" type="button" data-seat-action="edit-guest">Edit guest</button>
        <p data-seat-meal-feedback role="status"></p>
      </form>` : ""}
      <form class="seating-add-guest" data-seat-form="assign">
        <label class="seating-label">${selectedChair ? `Guest for chair ${selectedChair}` : "Add a guest"}
          <select name="guest" required${peopleDisabled ? " disabled" : ""}>
            <option value="">Choose a guest</option>${guestOptions}
          </select>
        </label>
        <button class="secondary-action" type="submit"${peopleDisabled ? " disabled" : ""}>${occupant ? "Move here" : "Seat"}</button>
      </form>
      <ul class="seating-members seating-chair-list" data-list-table="${escapeHtml(table.id)}" aria-label="Chairs at ${escapeHtml(table.name)}">${chairList(table, occupants, unavailable)}</ul>`;
  }

  function poolRows(pool, canAssign, disabled) {
    const term = query.trim().toLowerCase();
    const shown = pool.filter(person => person.name.toLowerCase().includes(term));
    if (!shown.length) return `<li>${term ? "No matching names." : "All guests are seated."}</li>`;
    return shown.map(person =>
      `<li data-seat-guest="${escapeHtml(person.id)}" draggable="${disabled ? "false" : "true"}">
        <button class="seating-guest-pick" type="button" data-seat-action="pick" aria-pressed="${pickedGuest === person.id}"${disabled}>${escapeHtml(person.name)}</button>
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
    current.plan = reconcileSeats(next);
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
          const focused = document.activeElement;
          const focusedTable = focused?.dataset.seatTable;
          const focusedChair = focused?.dataset.seatChair;
          const chairTable = focused?.dataset.chairTable;
          const wasFloorChair = focused?.classList.contains("seating-chair");
          draw();
          if (focusedChair && chairTable && state.view === "seating") focusChair(chairTable, focusedChair, wasFloorChair);
          if (focusedTable && state.view === "seating") {
            room.querySelector(`[data-seat-table="${CSS.escape(focusedTable)}"]`)?.focus();
          }
        }
      }
    }
  }

  function position(tables) {
    if (!tables.length) return { x: 32, y: 28 };
    const positions = [24, 41, 58, 75].flatMap(y => [19, 40, 60, 81].map(x => [x, y]));
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

  function clearSeat(plan, guest) {
    delete plan.assignments[guest];
    delete plan.seats[guest];
  }

  function seat(person, id, chair) {
    edit(plan => {
      const table = plan.tables.find(item => item.id === id);
      if (!table || !guests().some(guest => guest.id === person)) return;

      const fromTable = plan.assignments[person];
      const fromChair = plan.seats[person];
      const taken = new Map(Object.keys(plan.assignments)
        .filter(guest => plan.assignments[guest] === id)
        .map(guest => [plan.seats[guest], guest]));
      let destination = chair;
      if (destination == null) {
        if (fromTable === id) return;
        destination = Array.from({ length: table.capacity }, (_, index) => index + 1).find(number => !taken.has(number));
        if (!destination) return notify(`${table.name} is full. Choose a chair to swap seats.`);
      }
      if (!Number.isInteger(destination) || destination < 1 || destination > table.capacity) return;

      const occupant = taken.get(destination);
      if (occupant === person) return;
      if (occupant && fromTable && fromChair) {
        plan.assignments[occupant] = fromTable;
        plan.seats[occupant] = fromChair;
      } else if (occupant) {
        clearSeat(plan, occupant);
      }

      plan.assignments[person] = id;
      plan.seats[person] = destination;
      if (selected !== id) editing = "";
      selected = id;
      selectedChair = destination;
      pickedGuest = null;
      return plan;
    });
  }

  room.addEventListener("click", click => {
    const tab = click.target.closest("[data-seat-event]");
    if (tab) {
      event = tab.dataset.seatEvent;
      selected = null;
      selectedChair = null;
      pickedGuest = null;
      editing = "";
      query = "";
      draw();
      return;
    }
    const chair = click.target.closest("[data-seat-chair]");
    if (chair) {
      if (pickedGuest) {
        seat(pickedGuest, chair.dataset.chairTable, Number(chair.dataset.seatChair));
        return;
      }
      if (selected !== chair.dataset.chairTable) editing = "";
      selected = chair.dataset.chairTable;
      selectedChair = Number(chair.dataset.seatChair);
      draw();
      focusChair(selected, selectedChair, chair.classList.contains("seating-chair"));
      return;
    }
    const button = click.target.closest("[data-seat-action]");
    const tableButton = click.target.closest("[data-seat-table]");
    const current = entry();
    if (tableButton && !button && performance.now() - lastDrag > 180) {
      selected = tableButton.dataset.seatTable;
      selectedChair = null;
      editing = "";
      draw();
      room.querySelector(`[data-seat-table="${CSS.escape(selected)}"]`)?.focus();
    }
    if (!button) return;
    const action = button.dataset.seatAction;
    if (action === "reload") {
      if (current?.unsaved && !window.confirm("Discard the unsaved seating change and load the latest plan?")) return;
      load(current ? event : undefined);
    } else if (action === "refresh-meals") {
      loadMealColours(true);
    } else if (action === "edit-guest") {
      const person = guests().find(item => item.id === button.closest("[data-seat-meal-form]").dataset.seatMealForm);
      if (person) openEntity("guests", person, null, () => {
        if (state.view === "seating") room.querySelector('[data-seat-action="edit-guest"]')?.focus();
      });
    } else if (action === "retry") {
      save();
    } else if (action === "undo" && current?.history.length) {
      edit(() => current.history.pop(), true);
    } else if (action === "pick") {
      const id = button.dataset.pickGuest || button.closest("[data-seat-guest]").dataset.seatGuest;
      pickedGuest = pickedGuest === id ? null : id;
      draw();
      if (pickedGuest && matchMedia("(pointer: coarse)").matches) {
        room.querySelector("[data-seating-floor]")?.scrollIntoView({ block: "nearest" });
      }
    } else if (action === "cancel-pick") {
      pickedGuest = null;
      draw();
    } else if (action === "seat") {
      seat(button.closest("[data-seat-guest]").dataset.seatGuest, selected);
    } else if (action === "quick-setup") {
      editing = editing === "quick-setup" ? "" : "quick-setup";
      draw();
    } else if (action === "auto-seat") {
      edit(plan => {
        const remaining = guests().filter(person => person.rsvp_status !== "no" && !Object.hasOwn(plan.assignments, person.id));
        for (const table of plan.tables) {
          const taken = new Set(Object.keys(plan.assignments).filter(id => plan.assignments[id] === table.id).map(id => plan.seats[id]));
          for (let chair = 1; chair <= table.capacity && remaining.length; chair++) {
            if (taken.has(chair)) continue;
            const person = remaining.shift();
            plan.assignments[person.id] = table.id;
            plan.seats[person.id] = chair;
          }
        }
        return plan;
      });
    } else if (action === "split" || action === "merge") {
      editing = editing === action ? "" : action;
      draw();
    } else if (action.startsWith("add-")) {
      edit(plan => {
        if (plan.tables.length >= 160) return notify("The plan already has 160 tables.");
        const table = newTable(plan, action.slice(4));
        plan.tables.push(table);
        selected = table.id;
        selectedChair = null;
        editing = "";
        return plan;
      });
    } else if (action === "rotate") {
      const table = current?.plan.tables.find(item => item.id === selected);
      if (table) rotateTable(table.id, table.rotation + 15);
    } else if (action === "remove") {
      const table = current?.plan.tables.find(item => item.id === selected);
      if (table && window.confirm(`Remove ${table.name} from the floor plan? Its guests will become unseated.`)) {
        edit(plan => {
          plan.tables = plan.tables.filter(item => item.id !== selected);
          for (const [id, value] of Object.entries(plan.assignments)) {
            if (value === selected) clearSeat(plan, id);
          }
          selected = null;
          selectedChair = null;
          editing = "";
          return plan;
        });
      }
    } else if (action === "unseat") {
      edit(plan => {
        clearSeat(plan, button.dataset.unseatGuest);
        return plan;
      });
    }
  });

  room.addEventListener("input", input => {
    const mealForm = input.target.closest("[data-seat-meal-form]");
    if (mealForm) {
      const field = mealForm.elements.meal;
      mealForm.querySelector('[type="submit"]').disabled = field.readOnly || field.value.trim() === field.defaultValue;
      mealForm.querySelector("[data-seat-meal-feedback]").textContent = "";
      return;
    }
    if (!input.target.matches("[data-seat-search]")) return;
    query = input.target.value;
    const current = entry();
    const pool = guests().filter(person => person.rsvp_status !== "no" && !Object.hasOwn(current.plan.assignments, person.id));
    room.querySelector("[data-seat-pool]").innerHTML = poolRows(pool, Boolean(selected), current.saving || current.unsaved);
  });

  room.addEventListener("submit", submit => {
    const form = submit.target;
    if (form.matches("[data-seat-meal-form]")) {
      submit.preventDefault();
      saveSeatMeal(form);
      return;
    }
    if (!form.dataset.seatForm) return;
    submit.preventDefault();
    const values = new FormData(form);
    if (form.dataset.seatForm === "quick-setup") {
      edit(plan => {
        const count = Number(values.get("count"));
        const capacity = Number(values.get("capacity"));
        const shape = values.get("shape");
        if (!Number.isInteger(count) || count < 1 || count > 20 || plan.tables.length + count > 160 ||
          !Number.isInteger(capacity) || capacity < 1 || capacity > 200 || !shapes.some(([value]) => value === shape)) {
          return notify("Choose up to 20 tables and between 1 and 200 seats per table.");
        }
        for (let index = 0; index < count; index++) {
          const table = newTable(plan, shape);
          table.capacity = capacity;
          plan.tables.push(table);
          if (index === 0) selected = table.id;
        }
        selectedChair = null;
        editing = "";
        return plan;
      });
      return;
    }
    if (form.dataset.seatForm === "assign") {
      seat(values.get("guest"), selected, selectedChair);
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
        selectedChair = null;
        editing = "";
      } else if (form.dataset.seatForm === "merge") {
        const target = plan.tables.find(item => item.id === values.get("target"));
        if (!target || target.id === table.id) return;
        if (target.capacity + table.capacity > 200) return notify("The combined table would have more than 200 seats.");
        const offset = target.capacity;
        target.capacity += table.capacity;
        for (const [id, value] of Object.entries(plan.assignments)) {
          if (value !== table.id) continue;
          plan.assignments[id] = target.id;
          plan.seats[id] += offset;
        }
        plan.tables = plan.tables.filter(item => item.id !== table.id);
        selected = target.id;
        selectedChair = null;
        editing = "";
      }
      return plan;
    });
  });

  async function saveSeatMeal(form) {
    const input = form.elements.meal;
    const button = form.querySelector('[type="submit"]');
    const feedback = form.querySelector("[data-seat-meal-feedback]");
    if (button.disabled) return;
    input.readOnly = true;
    button.disabled = true;
    feedback.textContent = "Saving meal…";
    try {
      const row = await plannerRegisters.saveMeal(token, form.dataset.seatMealForm, input.value.trim());
      if (!row) return;
      input.value = row.choice || "";
      feedback.textContent = "Meal choice saved.";
    } catch (error) {
      feedback.textContent = error.message || "Could not save this meal choice.";
    } finally {
      input.readOnly = false;
      decorateSeats();
    }
  }

  function bounds(x, y, button) {
    const frame = room.querySelector("[data-seating-floor]").getBoundingClientRect();
    const table = button.getBoundingClientRect();
    const horizontalPadding = Math.max(8, 100 * (table.width / 2 + 12) / frame.width);
    const verticalPadding = Math.max(11, 100 * (table.height / 2 + 12) / frame.height);
    const clamp = (value, min, max) => Math.round(Math.max(min, Math.min(max, value)) * 10) / 10;
    return { x: clamp(x, horizontalPadding, 100 - horizontalPadding),
      y: clamp(y, verticalPadding, Math.min(87, 100 - verticalPadding)) };
  }

  function clampTableScale(value) {
    return Math.max(minTableScale, Math.min(maxTableScale, value));
  }

  function tableSize(table) {
    const width = Number.isFinite(table.widthScale) ? clampTableScale(table.widthScale) : 1;
    const depth = table.shape !== "rectangle" ? width :
      Number.isFinite(table.depthScale) ? clampTableScale(table.depthScale) : 1;
    return { width, depth };
  }

  function resizeGeometry(table, group, floor) {
    const start = tableSize(table);
    const style = getComputedStyle(group);
    const baseWidth = Math.max(1, parseFloat(style.width) / start.width);
    const baseDepth = Math.max(1, parseFloat(style.height) / start.depth);
    const angle = table.rotation * Math.PI / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const chairRoom = table.shape === "round" ? [.58, .58] : [.54, .59];
    const extents = size => {
      const halfWidth = baseWidth * size.width * chairRoom[0];
      const halfDepth = baseDepth * size.depth * chairRoom[1];
      return [Math.abs(cos) * halfWidth + Math.abs(sin) * halfDepth,
        Math.abs(sin) * halfWidth + Math.abs(cos) * halfDepth];
    };
    const before = extents(start);
    const roomLimits = [Math.min(group.offsetLeft, floor.clientWidth - group.offsetLeft) - 12,
      Math.min(group.offsetTop, floor.clientHeight - group.offsetTop) - 12];
    // Legacy tables can already be close to an edge. Let them shrink without moving their centre.
    const limits = before.map((value, axis) => Math.max(value, roomLimits[axis]));
    return { start, baseWidth, baseDepth, cos, sin, extents, before, limits, locked: table.shape !== "rectangle" };
  }

  function fitTableSize(geometry, proposed) {
    const { start, extents, before, limits, locked } = geometry;
    const width = clampTableScale(proposed.width);
    const target = { width, depth: locked ? width : clampTableScale(proposed.depth) };
    const fraction = Math.min(1, ...extents(target).map((value, axis) =>
      value > limits[axis] ? (limits[axis] - before[axis]) / (value - before[axis]) : 1));
    const blend = axis => Math.round((start[axis] + (target[axis] - start[axis]) * fraction) * 1000) / 1000;
    return { width: blend("width"), depth: blend("depth") };
  }

  function pointerTableSize(geometry, dx, dy) {
    const { start, baseWidth, baseDepth, cos, sin, locked } = geometry;
    const widthDelta = 2 * (dx * cos + dy * sin) / baseWidth;
    const depthDelta = 2 * (dy * cos - dx * sin) / baseDepth;
    return fitTableSize(geometry, {
      width: start.width + (locked ? (widthDelta + depthDelta) / 2 : widthDelta),
      depth: start.depth + depthDelta
    });
  }

  function resizeTable(table, size) {
    const original = tableSize(table);
    if (original.width === size.width && original.depth === size.depth) return;
    edit(plan => {
      const target = plan.tables.find(item => item.id === table.id);
      if (!target) return;
      target.widthScale = size.width;
      target.depthScale = size.depth;
      return plan;
    });
  }

  function normalizeRotation(angle) {
    return ((angle % 360) + 360) % 360;
  }

  function rotateTable(id, angle) {
    const rotation = normalizeRotation(angle);
    edit(plan => {
      const table = plan.tables.find(item => item.id === id);
      if (!table || normalizeRotation(table.rotation) === rotation) return;
      table.rotation = rotation;
      return plan;
    });
  }

  function rotationPivot(group, down) {
    const { left, top, width, height } = group.getBoundingClientRect();
    const x = left + width / 2;
    const y = top + height / 2;
    const startAngle = Math.atan2(down.clientY - y, down.clientX - x);
    return { x, y, startAngle, label: group.querySelector("[data-seat-angle]") };
  }

  function moveTable(id, x, y) {
    edit(plan => {
      const table = plan.tables.find(item => item.id === id);
      if (!table) return;
      const group = room.querySelector(`[data-seat-group="${CSS.escape(id)}"]`);
      Object.assign(table, bounds(x, y, group));
      if (selected !== id) selectedChair = null;
      selected = id;
      return plan;
    });
  }

  room.addEventListener("pointerdown", down => {
    const button = down.target.closest(tableHandles);
    const current = entry();
    if (!button || !current || !down.isPrimary || down.button !== 0 || loading || current.saving || current.unsaved) return;
    const { seatRotate, seatResize, seatTable } = button.dataset;
    const table = current.plan.tables.find(item => item.id === (seatRotate || seatResize || seatTable));
    const floor = room.querySelector("[data-seating-floor]");
    const group = button.closest("[data-seat-group]");
    drag = { button: group, table, frame: floor.getBoundingClientRect(), pointer: down.pointerId, x0: down.clientX, y0: down.clientY,
      geometry: seatResize ? resizeGeometry(table, group, floor) : null,
      pivot: seatRotate ? rotationPivot(group, down) : null };
    button.setPointerCapture(down.pointerId);
  });

  room.addEventListener("pointermove", move => {
    if (!drag || drag.pointer !== move.pointerId) return;
    const dx = move.clientX - drag.x0;
    const dy = move.clientY - drag.y0;
    if (!drag.position && !drag.size && drag.rotation == null && Math.hypot(dx, dy) < 4) return;
    if (drag.pivot) {
      const { x, y, startAngle, label } = drag.pivot;
      const localX = move.clientX - x;
      const localY = move.clientY - y;
      if (Math.hypot(localX, localY) < 8) return;
      const angle = drag.table.rotation + (Math.atan2(localY, localX) - startAngle) * 180 / Math.PI;
      const step = move.shiftKey ? 15 : 1;
      drag.rotation = normalizeRotation(Math.round(angle / step) * step);
      drag.button.style.setProperty("--table-rotation", `${drag.rotation}deg`);
      drag.button.classList.add("is-rotating");
      label.textContent = `${drag.rotation}°`;
      return;
    }
    if (drag.geometry) {
      drag.size = pointerTableSize(drag.geometry, dx, dy);
      drag.button.classList.add("is-resizing");
      drag.button.style.setProperty("--table-width-scale", drag.size.width);
      drag.button.style.setProperty("--table-depth-scale", drag.size.depth);
      return;
    }
    drag.position = bounds(drag.table.x + dx * 100 / drag.frame.width, drag.table.y + dy * 100 / drag.frame.height, drag.button);
    drag.button.classList.add("is-dragging");
    drag.button.style.left = `${drag.position.x}%`;
    drag.button.style.top = `${drag.position.y}%`;
  });

  room.addEventListener("pointerup", up => {
    if (!drag || drag.pointer !== up.pointerId) return;
    const { button, position: destination, table, rotation, size } = drag;
    drag = null;
    button.classList.remove("is-dragging", "is-resizing", "is-rotating");
    if (rotation != null) rotateTable(table.id, rotation);
    else if (size) resizeTable(table, size);
    else if (destination) {
      lastDrag = performance.now();
      moveTable(table.id, destination.x, destination.y);
    }
  });

  function cancelTableDrag(cancel) {
    if (drag?.pointer !== cancel.pointerId) return;
    drag = null;
    draw();
  }
  room.addEventListener("pointercancel", cancelTableDrag);
  room.addEventListener("lostpointercapture", cancelTableDrag);

  room.addEventListener("keydown", key => {
    const button = key.target.closest(tableHandles);
    const deltas = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (key.key === "Escape" && drag) {
      key.preventDefault();
      draw();
      return;
    }
    if (!button || !Object.hasOwn(deltas, key.key)) return;
    key.preventDefault();
    const [dx, dy] = deltas[key.key];
    if (button.dataset.seatRotate) {
      if (button.getAttribute("aria-disabled") === "true") return;
      const table = entry().plan.tables.find(item => item.id === button.dataset.seatRotate);
      rotateTable(table.id, table.rotation + (dx || dy) * (key.shiftKey ? 15 : 1));
      return;
    }
    if (button.dataset.seatResize) {
      if (button.getAttribute("aria-disabled") === "true") return;
      const table = entry().plan.tables.find(item => item.id === button.dataset.seatResize);
      const geometry = resizeGeometry(table, button.closest("[data-seat-group]"), room.querySelector("[data-seating-floor]"));
      const step = key.shiftKey ? .15 : .05;
      resizeTable(table, fitTableSize(geometry, {
        width: geometry.start.width + (geometry.locked ? dx || dy : dx) * step,
        depth: geometry.start.depth + dy * step
      }));
      return;
    }
    const id = button.dataset.seatTable;
    const table = entry().plan.tables.find(item => item.id === id);
    const scale = key.shiftKey ? 6 : 2;
    moveTable(id, table.x + dx * scale, table.y + dy * scale);
    room.querySelector(`[data-seat-table="${CSS.escape(id)}"]`)?.focus();
  });

  const guestDragType = "application/x-mxc-guest-id";

  function dropTarget(element) {
    return element?.closest?.("[data-seat-chair]") || element?.closest?.("[data-seat-table]")?.closest("[data-seat-group]");
  }

  room.addEventListener("dragstart", start => {
    const item = start.target.closest("[data-seat-guest]");
    if (!item || !start.dataTransfer || entry()?.unsaved || loading) return;
    start.dataTransfer.effectAllowed = "move";
    start.dataTransfer.setData(guestDragType, item.dataset.seatGuest);
  });

  room.addEventListener("dragover", over => {
    const target = dropTarget(over.target);
    if (!target || !over.dataTransfer?.types.includes(guestDragType) || entry()?.unsaved || loading) return;
    over.preventDefault();
    target.classList.add("is-drop-target");
    over.dataTransfer.dropEffect = "move";
  });

  room.addEventListener("dragleave", leave => {
    const target = dropTarget(leave.target);
    if (target !== dropTarget(leave.relatedTarget)) target?.classList.remove("is-drop-target");
  });

  room.addEventListener("dragend", () => {
    room.querySelectorAll(".is-drop-target").forEach(target => target.classList.remove("is-drop-target"));
  });

  room.addEventListener("drop", drop => {
    const target = dropTarget(drop.target);
    const person = drop.dataTransfer?.getData(guestDragType);
    if (!target || !person) return;
    drop.preventDefault();
    target.classList.remove("is-drop-target");
    if (target.dataset.seatChair) {
      seat(person, target.dataset.chairTable, Number(target.dataset.seatChair));
    } else {
      seat(person, target.dataset.seatGroup);
    }
  });

  return { render, reset };
})();

function renderSeatingPlanner() { seatingWorkspace.render(); }
function resetSeatingPlanner() { seatingWorkspace.reset(); }
