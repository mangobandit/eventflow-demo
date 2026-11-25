function renderVenueDesigner(container, context) {
  let record = context.records[0] || null;
  let selected = null;
  let mode = "plan";
  let placeType = null;
  let pointer = null;
  let changed = 0;
  let persisted = 0;
  let pending = false;
  let error = "";
  let queued;

  const options = {
    round: ["Round table", 2.2, 2.2], rectangle: ["Banquet table", 4.6, 1.25],
    dance: ["Dance floor", 5, 4], bar: ["Bar", 3.2, 1.6],
    stage: ["Stage / DJ", 3.8, 2.2], buffet: ["Buffet", 3.1, 1.4]
  };

  const bounded = (number, low, high) => Math.min(high, Math.max(low, number));
  const rounded = number => Math.round(number * 10) / 10;
  const scale = (number, dimension) => `${100 * number / dimension}%`;
  const escape = escapeHtml;
  const raw = record?.data || {};
  const width = bounded(Number(raw.width) || 18, 3, 120);
  const length = bounded(Number(raw.length) || 14, 3, 120);
  const items = Array.isArray(raw.items) ? raw.items
    .filter(item => item && typeof item.id === "string" && Object.hasOwn(options, item.type))
    .slice(0, 200)
    .map(item => ({
      id: item.id, type: item.type, name: String(item.name || options[item.type][0]).slice(0, 120),
      x: Number(item.x) || 0, y: Number(item.y) || 0,
      width: Number(item.width) || 1, height: Number(item.height) || 1,
      rotation: ((Number(item.rotation) || 0) % 360 + 360) % 360,
      source: item.source === "seating" ? "seating" : undefined
    })) : [];
  const layout = { width, length, items };
  layout.items.forEach(clampItem);

  function lookup() {
    return layout.items.find(item => item.id === selected);
  }

  function clampItem(item) {
    item.width = rounded(bounded(item.width, .5, layout.width));
    item.height = rounded(bounded(item.height, .5, layout.length));
    item.x = rounded(bounded(item.x, item.width / 2, layout.width - item.width / 2));
    item.y = rounded(bounded(item.y, item.height / 2, layout.length - item.height / 2));
  }

  function reportChange() {
    changed++;
    error = "";
    draw();
    clearTimeout(queued);
    queued = setTimeout(save, 220);
  }

  async function save() {
    if (pending || changed === persisted) return;
    const savingRevision = changed;
    pending = true;
    if (container.isConnected) status();
    try {
      record = await context.save(record, record?.title || "Venue layout", structuredClone(layout));
      persisted = savingRevision;
      error = "";
    } catch (failure) {
      error = failure.message || "Could not save the venue plan.";
    } finally {
      pending = false;
      if (container.isConnected) status();
      if (!error && changed > persisted) save();
    }
  }

  function itemStyle(item) {
    return `left:${scale(item.x, layout.width)};top:${scale(item.y, layout.length)};width:${scale(item.width, layout.width)};height:${scale(item.height, layout.length)};--venue-rotation:${item.rotation}deg`;
  }

  function status() {
    const state = container.querySelector("[data-venue-status]");
    if (!state) return;
    state.innerHTML = `${escape(error || (pending ? "Saving…" : changed > persisted ? "Unsaved changes" : "Venue plan saved"))}
      ${error ? '<button class="secondary-action" type="button" data-venue="retry">Retry</button>' : ""}`;
  }

  function sizeField(name, caption, value, min, max) {
    return `<label class="form-label">${caption}<input name="${name}" type="number" min="${min}" max="${max}" step=".1" value="${value}" required></label>`;
  }

  function draw() {
    if (!container.isConnected) return;
    const item = lookup();
    container.innerHTML = `<header class="workspace-section-head"><h2>Venue designer</h2>
      <div class="workspace-card-actions venue-controls">
        <button class="secondary-action" type="button" data-venue="mode" data-mode="plan" aria-pressed="${mode === "plan"}">2D edit</button>
        <button class="secondary-action" type="button" data-venue="mode" data-mode="preview" aria-pressed="${mode === "preview"}">3D preview</button>
        <button class="secondary-action" type="button" data-venue="print">Print plan</button>
      </div></header>
      <div class="venue-layout">
        <section class="workspace-card venue-toolbar">
          <header><h3>Room</h3><span>${layout.width} × ${layout.length} m</span></header>
          <form class="workspace-form" data-venue-form="room">
            ${sizeField("width", "Width (m)", layout.width, 3, 120)}
            ${sizeField("length", "Length (m)", layout.length, 3, 120)}
            <div class="workspace-form-actions"><button class="secondary-action" type="submit">Update room</button></div>
          </form>
          <div class="venue-elements">${Object.entries(options).map(([kind, spec]) =>
            `<button class="secondary-action" type="button" data-venue="place" data-kind="${kind}" aria-pressed="${placeType === kind}">+ ${spec[0]}</button>`
          ).join("")}</div>
          ${context.seating.tables.length ? '<button class="secondary-action" type="button" data-venue="import">Use wedding seating tables</button>' : ""}
          ${item ? `<form class="workspace-form" data-venue-form="item">
            <label class="form-label workspace-full">Item name<input name="name" maxlength="120" value="${escape(item.name)}" required></label>
            ${sizeField("width", "Width (m)", item.width, .5, layout.width)}
            ${sizeField("height", "Depth (m)", item.height, .5, layout.length)}
            ${sizeField("rotation", "Rotation (°)", item.rotation, 0, 360)}
            <div class="workspace-form-actions"><button class="secondary-action" type="submit">Update item</button>
              <button class="secondary-action" type="button" data-venue="duplicate">Duplicate</button>
              <button class="danger-action" type="button" data-venue="remove">Remove</button></div>
          </form>` : ""}
        </section>
        <section class="workspace-card venue-preview ${mode === "preview" ? "venue-3d" : ""}">
          <header><div><h3>${mode === "preview" ? "3D preview" : "Venue floor"}</h3>
            ${placeType ? `<p role="status">Click the floor to place ${escape(options[placeType][0].toLowerCase())}.</p>` : ""}
          </div><div data-venue-status role="status"></div></header>
          <div class="venue-stage"><div class="venue-board${placeType ? " is-placing" : ""}" data-venue-board
            aria-label="Venue floor" style="--venue-grid-x:${100 / layout.width}%;--venue-grid-y:${100 / layout.length}%;--venue-aspect:${layout.width / layout.length}">
            ${layout.items.map(entry =>
              `<button class="venue-item venue-item-${entry.type}" type="button" data-venue-item="${escape(entry.id)}"
                aria-pressed="${selected === entry.id}" title="${escape(entry.name)}" style="${itemStyle(entry)}"><span>${escape(entry.name)}</span></button>`
            ).join("")}
          </div></div>
        </section>
      </div>`;
    status();
  }

  function addItem(type, x, y) {
    if (layout.items.length >= 200) { error = "The venue already has 200 items."; status(); return null; }
    const [name, width, height] = options[type];
    const item = { id: crypto.randomUUID(), type, name, x, y, width, height, rotation: 0 };
    clampItem(item);
    layout.items.push(item);
    selected = item.id;
    return item;
  }

  container.addEventListener("click", click => {
    const control = click.target.closest("[data-venue]");
    if (control) {
      const { venue: action, kind, mode: view } = control.dataset;
      if (action === "mode") { mode = view; placeType = null; draw(); return; }
      if (action === "print") { window.print(); return; }
      if (action === "retry") { error = ""; save(); return; }
      if (action === "place") { placeType = kind; mode = "plan"; draw(); return; }
      if (action === "remove" && selected) {
        layout.items = layout.items.filter(item => item.id !== selected);
        selected = null;
      }
      if (action === "duplicate" && lookup()) {
        const source = lookup();
        const copy = { ...source, id: crypto.randomUUID(), name: `${source.name} copy`.slice(0, 120), x: source.x + .8, y: source.y + .8 };
        delete copy.source;
        clampItem(copy);
        layout.items.push(copy);
        selected = copy.id;
      }
      if (action === "import") {
        layout.items = layout.items.filter(item => item.source !== "seating");
        for (const table of context.seating.tables) {
          const type = table.shape === "round" ? "round" : "rectangle";
          const imported = addItem(type, table.x * layout.width / 100, table.y * layout.length / 100);
          if (!imported) break;
          Object.assign(imported, { name: table.name, rotation: table.rotation, source: "seating" });
        }
        mode = "plan";
      }
      reportChange();
      return;
    }
    const board = click.target.closest("[data-venue-board]");
    if (mode !== "plan" || !board || !placeType) return;
    const area = board.getBoundingClientRect();
    if (!addItem(placeType, layout.width * (click.clientX - area.left) / area.width, layout.length * (click.clientY - area.top) / area.height)) return;
    placeType = null;
    reportChange();
  });

  container.addEventListener("submit", submit => {
    const form = submit.target.closest("[data-venue-form]");
    if (!form) return;
    submit.preventDefault();
    const values = new FormData(form);
    const item = lookup();
    if (form.dataset.venueForm === "room") {
      layout.width = Number(values.get("width"));
      layout.length = Number(values.get("length"));
      layout.items.forEach(clampItem);
    } else if (item) {
      item.name = String(values.get("name")).trim() || options[item.type][0];
      item.width = Number(values.get("width"));
      item.height = Number(values.get("height"));
      item.rotation = Number(values.get("rotation")) % 360;
      clampItem(item);
    }
    reportChange();
  });

  container.addEventListener("pointerdown", down => {
    const button = down.target.closest("[data-venue-item]");
    if (!button || placeType || mode !== "plan" || down.button !== 0 || !down.isPrimary) return;
    const item = layout.items.find(entry => entry.id === button.dataset.venueItem);
    if (!item) return;
    const area = container.querySelector("[data-venue-board]").getBoundingClientRect();
    pointer = { id: down.pointerId, button, item, area, x: down.clientX, y: down.clientY, start: { x: item.x, y: item.y }, moved: false };
    button.setPointerCapture(down.pointerId);
  });

  container.addEventListener("pointermove", move => {
    if (!pointer || move.pointerId !== pointer.id) return;
    const { button, item, area, x, y, start } = pointer;
    if (!pointer.moved && Math.hypot(move.clientX - x, move.clientY - y) < 3) return;
    pointer.moved = true;
    item.x = start.x + (move.clientX - x) * layout.width / area.width;
    item.y = start.y + (move.clientY - y) * layout.length / area.height;
    clampItem(item);
    button.style.left = scale(item.x, layout.width);
    button.style.top = scale(item.y, layout.length);
  });

  container.addEventListener("pointerup", up => {
    if (!pointer || up.pointerId !== pointer.id) return;
    selected = pointer.item.id;
    const moved = pointer.moved;
    pointer = null;
    if (moved) reportChange();
    else draw();
  });

  container.addEventListener("pointercancel", cancel => {
    if (!pointer || cancel.pointerId !== pointer.id) return;
    Object.assign(pointer.item, pointer.start);
    pointer = null;
    draw();
  });

  container.addEventListener("keydown", key => {
    const button = key.target.closest("[data-venue-item]");
    if (!button || mode !== "plan") return;
    if (key.key === "Enter" || key.key === " ") {
      key.preventDefault();
      selected = button.dataset.venueItem;
      draw();
    }
    const step = { ArrowUp: [0, -.2], ArrowDown: [0, .2], ArrowLeft: [-.2, 0], ArrowRight: [.2, 0] }[key.key];
    if (!step) return;
    key.preventDefault();
    selected = button.dataset.venueItem;
    const item = lookup();
    item.x += step[0];
    item.y += step[1];
    clampItem(item);
    reportChange();
    container.querySelector(`[data-venue-item="${CSS.escape(selected)}"]`)?.focus();
  });

  draw();
}
