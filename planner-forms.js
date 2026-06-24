  function openEntity(table, record = null) {
    if (!definitions[table]) table = "tasks";
    state.editing = { table, record };
    const definition = definitions[table];
    els.modalTitle.textContent = `${record ? "Edit" : "Add"} ${definition.title}`;
    els.entityForm.innerHTML = definition.fields.map((spec) => renderField(spec, record)).join("") + renderFormActions(Boolean(record));
    els.entityForm.onsubmit = saveEntity;
    els.entityForm.querySelector("[data-delete]")?.addEventListener("click", deleteEntity);
    els.modal.hidden = false;
    document.body.style.overflow = "hidden";
    window.setTimeout(() => els.entityForm.querySelector("input:not([type=hidden]), select, textarea")?.focus(), 0);
  }

  function renderField(spec, record) {
    let value = record?.[spec.name];
    if (value == null && spec.default !== undefined) value = typeof spec.default === "function" ? spec.default() : spec.default;
    if (spec.type === "datetime-local" && value) value = new Date(value).toISOString().slice(0, 16);
    const full = spec.full ? " full" : "";
    const required = spec.required ? " required" : "";
    if (spec.type === "select") {
      return `<label class="form-label${full}">${escapeHtml(spec.label)}<select name="${spec.name}"${required}>${(spec.options || []).map(([optionValue, optionLabel]) => `<option value="${escapeHtml(optionValue)}"${String(value ?? "") === String(optionValue) ? " selected" : ""}>${escapeHtml(optionLabel)}</option>`).join("")}</select></label>`;
    }
    if (spec.type === "textarea") {
      return `<label class="form-label${full}">${escapeHtml(spec.label)}<textarea name="${spec.name}" placeholder="${escapeHtml(spec.placeholder || "")}"${required}>${escapeHtml(value ?? "")}</textarea></label>`;
    }
    if (spec.type === "checkbox") {
      return `<label class="form-label${full}" style="display:flex;grid-template-columns:auto 1fr;align-items:center;gap:12px;text-transform:none;letter-spacing:0;font-size:13px"><input style="width:20px;height:20px;min-height:0" name="${spec.name}" type="checkbox"${value ? " checked" : ""}>${escapeHtml(spec.label)}</label>`;
    }
    return `<label class="form-label${full}">${escapeHtml(spec.label)}<input name="${spec.name}" type="${spec.type}" value="${escapeHtml(value ?? "")}" placeholder="${escapeHtml(spec.placeholder || "")}"${spec.step ? ` step="${escapeHtml(spec.step)}"` : ""}${required}></label>`;
  }

  function renderFormActions(editing) {
    return `<div class="form-actions">${editing ? '<button class="danger-action" data-delete type="button">Delete</button>' : "<span></span>"}<div style="display:flex;gap:8px"><button class="secondary-action" type="button" onclick="document.getElementById('modal-close').click()">Cancel</button><button class="primary-action" type="submit">Save changes</button></div></div>`;
  }

  async function saveEntity(event) {
    event.preventDefault();
    const { table, record } = state.editing;
    const definition = definitions[table];
    const formData = new FormData(els.entityForm);
    const payload = {};
    definition.fields.forEach((spec) => {
      let value;
      if (spec.type === "checkbox") value = els.entityForm.elements[spec.name].checked;
      else value = formData.get(spec.name);
      if (spec.type === "number") value = value === "" ? null : Number(value);
      else if (spec.type === "datetime-local") value = value ? new Date(value).toISOString() : null;
      else if (typeof value === "string") value = value.trim() || null;
      payload[spec.name] = value;
    });
    if (table === "content_blocks" && !payload.slug) payload.slug = slugify(payload.title);
    if (!record) payload.created_by = state.session.user.id;
    if (table === "content_blocks") payload.updated_by = state.session.user.id;

    setSync("Saving…", true);
    let response;
    if (record) response = await state.client.from(table).update(payload).eq("id", record.id).select().single();
    else response = await state.client.from(table).insert(payload).select().single();
    if (response.error) {
      toast(response.error.message, true);
      setSync("Save failed", false);
      return;
    }
    const index = state.data[table].findIndex((item) => item.id === response.data.id);
    if (index >= 0) state.data[table][index] = response.data;
    else state.data[table].unshift(response.data);
    closeModal();
    renderAll();
    setSync("Securely synced", false);
    toast(`${definitions[table].title} saved.`);
  }

  async function deleteEntity() {
    const { table, record } = state.editing;
    if (!record || !window.confirm(`Delete this ${definitions[table].singular}? This cannot be undone.`)) return;
    setSync("Deleting…", true);
    const { error } = await state.client.from(table).delete().eq("id", record.id);
    if (error) {
      toast(error.message, true);
      setSync("Delete failed", false);
      return;
    }
    state.data[table] = state.data[table].filter((item) => item.id !== record.id);
    closeModal();
    renderAll();
    setSync("Securely synced", false);
    toast(`${definitions[table].title} deleted.`);
  }

  function closeModal() {
    els.modal.hidden = true;
    els.entityForm.innerHTML = "";
    state.editing = null;
    document.body.style.overflow = "";
  }

  function bindRowEditors(selector, table) {
    document.querySelectorAll(selector).forEach((row) => row.addEventListener("click", () => {
      const record = state.data[table].find((item) => item.id === row.dataset.id);
      if (record) openEntity(table, record);
    }));
  }

  function bindTableRows(body, table) {
    body.querySelectorAll("tr[data-id]").forEach((row) => row.addEventListener("click", () => {
      const record = state.data[table].find((item) => item.id === row.dataset.id);
      if (record) openEntity(table, record);
    }));
  }

  function tableForView(view) {
    return ({ budget: "budget_items", guests: "guests", vendors: "vendors", timeline: "timeline_items", publishing: "content_blocks" })[view] || "tasks";
  }

  function countStatuses(rows) {
    return STATUS_OPTIONS.reduce((counts, [status]) => ({ ...counts, [status]: rows.filter((row) => row.status === status).length }), {});
  }

  function statusBadge(status) { return `<span class="status-badge status-${escapeHtml(status || "outstanding")}">${escapeHtml(titleCase(status || "outstanding"))}</span>`; }
  function ownerTag(owner) { return `<span class="mini-tag ${escapeHtml(owner || "shared")}">${escapeHtml(ownerLabel(owner))}</span>`; }
  function ownerLabel(owner) { return owner === "matt" ? "Matt" : owner === "cara" ? "Cara" : "Shared"; }
  function labelCelebration(value) { return value === "spain" ? "Spain" : value === "south_africa" ? "South Africa" : "Shared / both"; }
  function labelCountry(value) { return value === "spain" ? "Spain" : value === "south_africa" ? "South Africa" : "Both weddings"; }
  function labelRsvp(value) { return ({ yes: "Yes", no: "No", tbc: "TBC", no_response: "No response" })[value] || "No response"; }

  function formatMoney(value, currency = "EUR") {
    const amount = Number(value || 0);
    return new Intl.NumberFormat(currency === "ZAR" ? "en-ZA" : "en-IE", { style: "currency", currency, maximumFractionDigits: amount % 1 ? 2 : 0 }).format(amount);
  }
  function formatDate(value, { short = true } = {}) {
    if (!value) return "—";
    const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat("en-GB", short ? { day: "numeric", month: "short", year: "2-digit" } : { weekday: "short", day: "numeric", month: "long", year: "numeric" }).format(date);
  }
  function balance(item) { return Math.max(Number(item.estimated || 0) - Number(item.paid || item.deposit || 0), 0); }
  function daysUntil(value) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(`${value}T00:00:00`);
    return Math.round((target - today) / 86_400_000);
  }
  function priorityRank(value) { return value === "high" ? 3 : value === "normal" ? 2 : 1; }
  function compareDates(a, b) { return (a ? Date.parse(a) : Number.MAX_SAFE_INTEGER) - (b ? Date.parse(b) : Number.MAX_SAFE_INTEGER); }
  function sortByDate(key) { return (a, b) => compareDates(a[key], b[key]); }
  function searchRows(rows, search, fields) {
    const needle = String(search || "").trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => fields.some((key) => String(row[key] || "").toLowerCase().includes(needle)));
  }
  function truncate(value, length) { const textValue = String(value || ""); return textValue.length > length ? `${textValue.slice(0, length - 1)}…` : textValue; }
  function slugify(value) { return String(value || "update").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || `update-${Date.now()}`; }
  function titleCase(value) { return String(value || "").replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase()); }
  function escapeHtml(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
  function text(id, value) { const element = document.getElementById(id); if (element) element.textContent = String(value); }
  function empty(message) { return `<div class="empty-state">${escapeHtml(message)}</div>`; }
  function tableEmpty(cols, message) { return `<tr><td colspan="${cols}">${empty(message)}</td></tr>`; }

  function setAuthStatus(message, isError = false) {
    els.authStatus.textContent = message || "";
    els.authStatus.style.color = isError ? "var(--danger)" : "";
  }
  function setSync(message, busy) {
    if (!els.syncState) return;
    els.syncState.textContent = message;
    els.syncState.style.opacity = busy ? ".65" : "1";
  }
  function toast(message, isError = false) {
    const item = document.createElement("div");
    item.className = `toast${isError ? " error" : ""}`;
    item.textContent = message;
    els.toastRegion.appendChild(item);
    window.setTimeout(() => item.remove(), 4200);
  }

  init().catch((error) => {
    console.error(error);
    setAuthStatus("The planner could not start. Check the setup guide and browser console.", true);
  });
