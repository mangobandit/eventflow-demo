function createSeatingViewport(room, { isEditing }) {
  const minZoom = .5;
  const maxZoom = 3;
  const zoomStep = 1.2;
  const moveStep = 36;
  const furniture = "[data-seat-table], [data-seat-chair], [data-seat-resize], [data-seat-rotate]";
  const views = new Map();
  const pointers = new Map();
  const suppressedClicks = new Map();
  let floor;
  let map;
  let controls;
  let view;
  let navigated = false;

  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
  const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(paint) : null;

  function paint() {
    if (!floor?.isConnected || !view) return;
    const { clientWidth: width, clientHeight: height } = floor;
    if (!width || !height) return;
    const constrain = (offset, size) => {
      const extent = size * view.scale;
      const visible = Math.min(size, extent) / 4;
      return clamp(offset, visible - extent, size - visible);
    };
    view.x = constrain(view.x, width);
    view.y = constrain(view.y, height);
    map.style.setProperty("--seat-view-x", `${view.x}px`);
    map.style.setProperty("--seat-view-y", `${view.y}px`);
    map.style.setProperty("--seat-view-scale", view.scale);
    const percentage = `${Math.round(view.scale * 100)}%`;
    if (controls.level && controls.level.textContent !== percentage) controls.level.textContent = percentage;
    controls.in?.setAttribute("aria-disabled", String(view.scale >= maxZoom));
    controls.out?.setAttribute("aria-disabled", String(view.scale <= minZoom));
  }

  function clearPointers() {
    const activePointers = [...pointers.keys()];
    pointers.clear();
    navigated = false;
    floor?.classList.remove("is-panning");
    for (const id of activePointers) {
      if (floor?.hasPointerCapture(id)) floor.releasePointerCapture(id);
    }
  }

  function draw(event) {
    const nextFloor = room.querySelector("[data-seating-floor]");
    const nextMap = nextFloor?.querySelector("[data-seating-map]");
    clearPointers();
    resizeObserver?.disconnect();
    floor = nextMap ? nextFloor : null;
    map = nextMap;
    if (!floor) return;
    if (!views.has(event)) views.set(event, { x: 0, y: 0, scale: 1 });
    view = views.get(event);
    controls = {
      level: room.querySelector("[data-seat-zoom-level]"),
      in: room.querySelector('[data-seat-view="in"]'),
      out: room.querySelector('[data-seat-view="out"]')
    };
    paint();
    resizeObserver?.observe(floor);
  }

  function reset() {
    clearPointers();
    resizeObserver?.disconnect();
    views.clear();
    suppressedClicks.clear();
    floor = map = controls = view = null;
  }

  function moveBy(x, y) {
    view.x += x;
    view.y += y;
    paint();
  }

  // Keep the map point beneath the cursor or pinch midpoint under that anchor.
  function zoomBy(factor, anchor, nextAnchor = anchor) {
    const nextScale = clamp(view.scale * factor, minZoom, maxZoom);
    const ratio = nextScale / view.scale;
    view.x = nextAnchor.x - (anchor.x - view.x) * ratio;
    view.y = nextAnchor.y - (anchor.y - view.y) * ratio;
    view.scale = nextScale;
    paint();
  }

  function changeView(action) {
    if (!floor?.isConnected || pointers.size || isEditing()) return;
    if (action === "reset") {
      Object.assign(view, { x: 0, y: 0, scale: 1 });
      paint();
      return;
    }
    if (action === "in" || action === "out") {
      zoomBy(action === "in" ? zoomStep : 1 / zoomStep, { x: floor.clientWidth / 2, y: floor.clientHeight / 2 });
    }
  }

  function relativePoint(event) {
    const rect = floor.getBoundingClientRect();
    return { x: event.clientX - rect.left - floor.clientLeft, y: event.clientY - rect.top - floor.clientTop };
  }

  function pinch() {
    const [first, second] = pointers.values();
    return {
      x: (first.x + second.x) / 2,
      y: (first.y + second.y) / 2,
      gap: Math.hypot(second.x - first.x, second.y - first.y)
    };
  }

  function beginNavigation() {
    navigated = true;
    floor.classList.add("is-panning");
  }

  room.addEventListener("pointerdown", down => {
    for (const [id, ended] of suppressedClicks) {
      if (id === down.pointerId || down.timeStamp - ended > 500) suppressedClicks.delete(id);
    }
    if (!floor?.contains(down.target) || down.button !== 0 || isEditing() || pointers.size >= 2) return;
    const first = pointers.values().next().value;
    if (first && (first.type !== "touch" || down.pointerType !== "touch")) return;
    if (!first && (!down.isPrimary || down.target.closest(furniture) || down.target.closest("button, a, input, select, textarea"))) return;
    pointers.set(down.pointerId, { ...relativePoint(down), type: down.pointerType });
    floor.setPointerCapture(down.pointerId);
    if (first) beginNavigation();
    else floor.focus({ preventScroll: true });
    down.preventDefault();
  });

  room.addEventListener("pointermove", move => {
    const previous = pointers.get(move.pointerId);
    if (!previous) return;
    const next = { ...relativePoint(move), type: previous.type };
    if (pointers.size === 2) {
      const before = pinch();
      pointers.set(move.pointerId, next);
      const after = pinch();
      zoomBy(before.gap > 1 && after.gap > 1 ? after.gap / before.gap : 1, before, after);
      return;
    }
    const x = next.x - previous.x;
    const y = next.y - previous.y;
    if (!navigated && Math.hypot(x, y) < 4) return;
    if (!navigated) beginNavigation();
    pointers.set(move.pointerId, next);
    moveBy(x, y);
  });

  function endPointer(end) {
    if (!pointers.delete(end.pointerId)) return;
    if (navigated) suppressedClicks.set(end.pointerId, end.timeStamp);
    if (!pointers.size) clearPointers();
  }
  room.addEventListener("pointerup", endPointer);
  room.addEventListener("pointercancel", endPointer);
  room.addEventListener("lostpointercapture", endPointer);

  room.addEventListener("click", click => {
    if (floor?.contains(click.target) && suppressedClicks.has(click.pointerId) && click.timeStamp - suppressedClicks.get(click.pointerId) <= 500) {
      click.preventDefault();
      click.stopImmediatePropagation();
      suppressedClicks.delete(click.pointerId);
    }
  }, true);

  room.addEventListener("click", click => {
    const button = click.target.closest("[data-seat-view]");
    if (button) changeView(button.dataset.seatView);
  });

  room.addEventListener("wheel", wheel => {
    if (!floor?.contains(wheel.target) || !wheel.deltaY || pointers.size || isEditing()) return;
    const unit = wheel.deltaMode === 1 ? 16 : wheel.deltaMode === 2 ? floor.clientHeight : 1;
    const amount = clamp(wheel.deltaY * unit, -360, 360);
    if ((amount > 0 && view.scale <= minZoom) || (amount < 0 && view.scale >= maxZoom)) {
      if (wheel.ctrlKey) wheel.preventDefault();
      return;
    }
    wheel.preventDefault();
    zoomBy(Math.exp(-amount / 400), relativePoint(wheel));
  }, { passive: false });

  room.addEventListener("focusin", focus => {
    if (!floor?.contains(focus.target) || !focus.target.matches(furniture) ||
      !focus.target.matches(":focus-visible") || pointers.size || isEditing()) return;
    const frame = floor.getBoundingClientRect();
    const control = focus.target.getBoundingClientRect();
    const offset = (start, end, minimum, maximum) => {
      if (end - start >= maximum - minimum) return (minimum + maximum - start - end) / 2;
      if (start < minimum) return minimum - start;
      return end > maximum ? maximum - end : 0;
    };
    const x = offset(control.left, control.right, frame.left + 8, frame.right - 8);
    const y = offset(control.top, control.bottom, frame.top + 8, frame.bottom - 8);
    if (x || y) moveBy(x, y);
  });

  const steps = { ArrowLeft: [moveStep, 0], ArrowRight: [-moveStep, 0], ArrowUp: [0, moveStep], ArrowDown: [0, -moveStep] };
  const shortcuts = { "+": "in", "=": "in", "-": "out", Home: "reset", "0": "reset" };
  room.addEventListener("keydown", key => {
    if (key.target !== floor || key.ctrlKey || key.altKey || key.metaKey || pointers.size || isEditing()) return;
    if (Object.hasOwn(steps, key.key)) {
      key.preventDefault();
      moveBy(...steps[key.key]);
    } else if (Object.hasOwn(shortcuts, key.key)) {
      key.preventDefault();
      changeView(shortcuts[key.key]);
    }
  });

  return { draw, reset, isNavigating: () => pointers.size > 0 };
}
