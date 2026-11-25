const plannerWorkspace = (function createPlannerWorkspace() {
  "use strict";

  const root = document.getElementById("plannerWorkspace");
  const tools = [
    ["projects", "Projects"], ["calendar", "Calendar"], ["templates", "Templates"],
    ["notes", "Notes & messages"], ["comparison", "Suppliers & budget"],
    ["venue", "Venue designer"], ["guides", "Client guides"],
    ["site", "Website builder"], ["access", "Client access"]
  ];
  const celebrations = [
    { id: "south_africa", title: "South Africa", date: "2026-12-19", location: "KZN Midlands" },
    { id: "spain", title: "Spain", date: "2026-10-10", location: "Andalusia" }
  ];
  const sections = [
    ["timeline", "Guest-facing timeline"], ["guides", "Shared guides"],
    ["site", "Wedding website"], ["slots", "Available meeting times"]
  ];
  let token;
  let scope;
  let active = "projects";
  let records;
  let seatLayouts = {};
  let links;
  let lastLink;
  let editor;
  let error;
  let loading = false;

  function reset() {
    token = null;
    scope = "south_africa";
    active = "projects";
    records = null;
    seatLayouts = {};
    links = null;
    lastLink = null;
    editor = null;
    error = null;
    loading = false;
    root.replaceChildren();
  }

  function projects() {
    return [...celebrations, ...(records || []).filter(row => row.kind === "project").map(row => ({
      id: row.id, title: row.title, date: row.data.date, location: row.data.location, record: row
    }))];
  }

  function render() {
    const session = state.session?.token;
    if (!session) return;
    if (session !== token) {
      reset();
      token = session;
      if (state.celebration === "spain") scope = "spain";
    }
    paint();
    if (!records && !loading && !error) load();
  }

  async function load() {
    const session = token;
    loading = true;
    error = null;
    paint();
    try {
      const rows = await plannerRpc("planner_workspace_load", { p_token: session });
      if (session === token) records = Array.isArray(rows) ? rows : [];
    } catch (failure) {
      if (session === token) error = failure.message;
    } finally {
      if (session === token) {
        loading = false;
        paint();
      }
    }
  }

  function checkSession(session) {
    if (!session || session !== token) throw new Error("The planner session changed. Sign in again.");
  }

  async function save(kind, record, title, data, scopeOverride) {
    const session = token;
    const saved = await plannerRpc("planner_workspace_save", {
      p_token: session,
      p_scope: scopeOverride || record?.scope || scope,
      p_kind: kind,
      p_id: record?.id || null,
      p_title: title,
      p_data: data,
      p_expected_version: record?.version || 0
    });
    checkSession(session);
    const index = records.findIndex(row => row.id === saved.id);
    if (index < 0) records.unshift(saved);
    else records[index] = saved;
    return saved;
  }

  async function remove(record) {
    const session = token;
    await plannerRpc("planner_workspace_delete", {
      p_token: session, p_id: record.id, p_expected_version: record.version
    });
    checkSession(session);
    records = records.filter(row => row.id !== record.id);
  }

  async function applyTemplate(record, date) {
    const currentScope = scope;
    const session = token;
    const base = date || projects().find(project => project.id === currentScope)?.date || new Date().toLocaleDateString("en-CA");
    const result = await plannerRpc("planner_workspace_apply_template", {
      p_token: session, p_template_id: record.id, p_scope: currentScope, p_base_date: base
    });
    checkSession(session);
    records = await plannerRpc("planner_workspace_load", { p_token: session });
    checkSession(session);
    await loadAll();
    return typeof result === "number" ? result : result?.count || 0;
  }

  function setScope(id) {
    scope = id;
    editor = null;
    lastLink = null;
    paint();
  }

  function formField(name, title, value = "", options = {}) {
    const content = value ?? "";
    const attrs = `${options.required ? " required" : ""}${options.max ? ` maxlength="${options.max}"` : ""}`;
    if (options.type === "checkbox") {
      return `<label class="workspace-check"><input type="checkbox" name="${name}"${value === true ? " checked" : ""}> ${title}</label>`;
    }
    if (options.type === "textarea") {
      return `<label class="form-label workspace-full">${title}<textarea name="${name}"${attrs}>${escapeHtml(content)}</textarea></label>`;
    }
    if (options.choices) {
      return `<label class="form-label">${title}<select name="${name}"${attrs}>${options.choices.map(([id, label]) =>
        `<option value="${escapeHtml(id)}"${id === value ? " selected" : ""}>${escapeHtml(label)}</option>`
      ).join("")}</select></label>`;
    }
    return `<label class="form-label">${title}<input type="${options.type || "text"}" name="${name}" value="${escapeHtml(content)}"${attrs}${options.type === "number" ? ` min="${options.min ?? 0}" step="${options.step || "1"}"${options.limit ? ` max="${options.limit}"` : ""}` : ""}></label>`;
  }

  function form(kind, record, fields, saveLabel = "Save") {
    return `<form class="workspace-form" data-work-form="${kind}" data-record="${escapeHtml(record?.id || "")}">
      ${fields.join("")}
      <div class="workspace-form-actions"><button class="primary-action" type="submit">${saveLabel}</button>
        ${kind === "site" || kind === "message" ? "" : '<button class="secondary-action" type="button" data-work-action="cancel">Cancel</button>'}
      </div>
    </form>`;
  }

  function card(row, subtitle, body, edit = true) {
    return `<article class="workspace-card workspace-record">
      <header><div><h3>${escapeHtml(row.title)}</h3>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}</div>
        ${edit ? `<button class="secondary-action" type="button" data-work-action="edit" data-kind="${row.kind}" data-record="${escapeHtml(row.id)}">Edit</button>` : ""}
      </header>${body ? `<p class="workspace-body">${escapeHtml(body)}</p>` : ""}
    </article>`;
  }

  function heading(title, action = "") {
    return `<header class="workspace-section-head"><h2>${title}</h2>${action}</header>`;
  }

  function add(kind, label) {
    return `<button class="primary-action" type="button" data-work-action="edit" data-kind="${kind}">${label}</button>`;
  }

  function deleteButton(row) {
    return row ? `<button class="danger-action" type="button" data-work-action="delete" data-record="${escapeHtml(row.id)}">Delete</button>` : "";
  }

  function scoped(kind) {
    return records.filter(row => row.kind === kind && row.scope === scope);
  }

  function getEditing(kind) {
    return editor?.kind === kind ? records.find(row => row.id === editor.id) : null;
  }

  function projectsView() {
    const row = getEditing("project");
    const entries = projects().map(project => `<article class="workspace-card workspace-project">
      <header><div><h3>${escapeHtml(project.title)}</h3><p>${escapeHtml([project.date ? formatDate(project.date, { short: false }) : "", project.location].filter(Boolean).join(" · "))}</p></div></header>
      <div class="workspace-card-actions"><button class="secondary-action" type="button" data-work-action="open-project" data-scope="${escapeHtml(project.id)}">${scope === project.id ? "Current project" : "Open project"}</button>
        ${project.record ? `<button class="secondary-action" type="button" data-work-action="edit" data-kind="project" data-record="${escapeHtml(project.id)}">Edit project</button>` : ""}
      </div>
    </article>`).join("");
    const editing = editor?.kind === "project" ? form("project", row, [
      formField("title", "Project name", row?.title, { required: true, max: 160 }),
      formField("date", "Wedding date", row?.data.date, { type: "date" }),
      formField("location", "Venue or city", row?.data.location, { max: 180 }),
      formField("body", "Private project brief", row?.data.body, { type: "textarea", max: 3000 })
    ]) + deleteButton(row) : "";
    const taskRows = scoped("project_task");
    const milestones = scoped("project_timeline");
    return `${heading("Wedding projects", add("project", "+ New project"))}${editing}
      <div class="workspace-grid">${entries}</div>
      ${taskRows.length || milestones.length ? `<div class="workspace-grid workspace-subgrid">
        <section class="workspace-card"><h3>Project actions</h3>${taskRows.map(item => `<div class="workspace-list-row">
          <div><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.data.date || "")}</small></div>
          <button class="secondary-action" type="button" data-work-action="toggle-task" data-record="${escapeHtml(item.id)}">${item.data.completed ? "Reopen" : "Complete"}</button>
        </div>`).join("") || empty("No project actions.")}</section>
        <section class="workspace-card"><h3>Project timeline</h3>${milestones.map(item => `<div class="workspace-list-row"><b>${escapeHtml(item.title)}</b><small>${escapeHtml([item.data.date, item.data.time].filter(Boolean).join(" · "))}</small></div>`).join("") || empty("No project milestones.")}</section>
      </div>` : ""}`;
  }

  function notesView() {
    const row = getEditing("note");
    const noteForm = editor?.kind === "note" ? form("note", row, [
      formField("title", "Title", row?.title, { required: true, max: 160 }),
      formField("pinned", "Pin to top", row?.data.pinned, { type: "checkbox" }),
      formField("body", "Private note", row?.data.body, { type: "textarea", required: true, max: 6000 })
    ]) + deleteButton(row) : "";
    const notes = [...scoped("note")].sort((a, b) => Number(Boolean(b.data.pinned)) - Number(Boolean(a.data.pinned)));
    const messages = scoped("message");
    return `${heading("Notes & messages", add("note", "+ Note"))}${noteForm}
      <div class="workspace-grid workspace-notes">
        <section aria-label="Private notes">${notes.map(item => card(item, item.data.pinned ? "Pinned note" : "", item.data.body)).join("") || empty("No notes for this project.")}</section>
        <section class="workspace-card"><h3>Planner messages</h3>
          <div class="workspace-message-list">${messages.map(item => `<div class="workspace-list-row">
            <div><b>${escapeHtml(item.created_by || "Planner")}</b><small>${escapeHtml(formatDate(item.updated_at?.slice(0, 10)))}</small>
            <p class="workspace-body">${escapeHtml(item.data.body || "")}</p></div>
          </div>`).join("") || empty("No messages for this project.")}</div>
          ${form("message", null, [formField("body", "Message for the other planner", "", { type: "textarea", required: true, max: 3000 })], "Post message")}
        </section>
      </div>`;
  }

  function comparisonView() {
    const copy = getEditing("vendor_score");
    const addQuote = editor?.kind === "vendor_score" ? form("vendor_score", copy, [
      formField("title", "Supplier name", copy?.title, { required: true, max: 160 }),
      formField("category", "Category", copy?.data.category, { max: 120 }),
      formField("amount", "Quote", copy?.data.amount, { type: "number", step: ".01" }),
      formField("deposit", "Deposit paid", copy?.data.deposit, { type: "number", step: ".01" }),
      formField("currency", "Currency", copy?.data.currency || (scope === "south_africa" ? "ZAR" : "EUR"), { choices: [["ZAR", "ZAR"], ["EUR", "EUR"]] }),
      formField("score", "Score from 1 to 5", copy?.data.score, { type: "number", min: 1, limit: 5 }),
      formField("body", "Quote details and questions", copy?.data.body, { type: "textarea", max: 3000 })
    ]) + deleteButton(copy) : "";
    const costs = new Map();
    const weddingScope = celebrations.some(item => item.id === scope);
    const included = item => item.celebration === scope || (weddingScope && item.celebration === "shared");
    for (const item of state.data.budget_items.filter(included)) {
      const category = item.category || "General";
      const key = `${item.currency}:${category}`;
      const total = costs.get(key) || { category, currency: item.currency, estimated: 0, paid: 0 };
      total.estimated += Number(item.estimated || 0);
      total.paid += Number(item.paid || item.deposit || 0);
      costs.set(key, total);
    }
    const quoteRows = scoped("vendor_score").map(row => `
      <tr><th scope="row">${escapeHtml(row.title)}</th><td>${escapeHtml(row.data.category)}</td>
      <td>${row.data.amount == null ? "—" : escapeHtml(formatMoney(row.data.amount, row.data.currency))}</td>
      <td>${row.data.deposit == null ? "—" : escapeHtml(formatMoney(row.data.deposit, row.data.currency))}</td>
      <td>${row.data.score ? `${Number(row.data.score)} / 5` : "—"}</td>
      <td><button class="secondary-action" type="button" data-work-action="edit" data-kind="vendor_score" data-record="${escapeHtml(row.id)}">Edit</button></td></tr>
    `).join("");
    const vendors = state.data.vendors.filter(included).filter(item => item.quote_amount != null);
    return `${heading("Suppliers & budget", add("vendor_score", "+ Add comparison quote"))}${addQuote}
      <section class="workspace-card"><h3>Compare quotes</h3>${quoteRows
        ? `<div class="data-table-wrap"><table class="data-table"><thead><tr><th>Supplier</th><th>Category</th><th>Quote</th><th>Deposit</th><th>Score</th><th>Actions</th></tr></thead><tbody>${quoteRows}</tbody></table></div>`
        : empty("Add quotes to compare supplier prices, deposits and your scores.")}</section>
      <div class="workspace-grid workspace-subgrid">
        <section class="workspace-card"><h3>Budget by category</h3>${Array.from(costs.values()).sort((a, b) => a.currency.localeCompare(b.currency) || b.estimated - a.estimated).map(row => `
          <div class="workspace-budget-row"><header><b>${escapeHtml(row.category)}</b><small>${escapeHtml(formatMoney(row.paid, row.currency))} paid of ${escapeHtml(formatMoney(row.estimated, row.currency))}</small></header>
            <progress value="${Math.min(row.estimated || 1, row.paid)}" max="${row.estimated || 1}" aria-label="${escapeHtml(row.category)} paid"></progress></div>
        `).join("") || empty("No budget costs for this project.")}</section>
        <section class="workspace-card"><h3>Quotes from suppliers</h3>${vendors.map(row => `<div class="workspace-list-row"><b>${escapeHtml(row.name)}</b><span>${escapeHtml(formatMoney(row.quote_amount, row.currency))}</span></div>`).join("") || empty("No supplier quotes recorded.")}</section>
      </div>`;
  }

  function guidesView() {
    const row = getEditing("guide");
    const editing = editor?.kind === "guide" ? form("guide", row, [
      formField("title", "Guide title", row?.title, { required: true, max: 160 }),
      formField("client_visible", "Include in client guide links", row?.data.client_visible, { type: "checkbox" }),
      formField("body", "Questions or instructions", row?.data.body, { type: "textarea", required: true, max: 6000 })
    ]) + deleteButton(row) : "";
    return `${heading("Client guides", add("guide", "+ Guide"))}${editing}
      <div class="workspace-grid">${scoped("guide").map(item => card(item, item.data.client_visible ? "Shared on guide links" : "Private", item.data.body)).join("") || empty("Create a vendor checklist, venue questionnaire or planning guide.")}</div>`;
  }

  function siteView() {
    const row = scoped("site")[0];
    const data = row?.data || {};
    return `${heading("Wedding website")}<div class="workspace-grid">
      <section class="workspace-card"><h3>Page details</h3>${form("site", row, [
        formField("headline", "Page headline", data.headline, { required: true, max: 160 }),
        formField("venue", "Venue", data.venue, { max: 180 }),
        formField("intro", "Welcome message", data.intro, { type: "textarea", max: 3000 }),
        formField("details", "Event details", data.details, { type: "textarea", max: 6000 }),
        formField("client_visible", "Include this page in website links", data.client_visible, { type: "checkbox" })
      ])}</section>
      <article class="workspace-site-preview"><span>Page preview</span><h3>${escapeHtml(data.headline || projects().find(item => item.id === scope)?.title || "Wedding website")}</h3>
        ${data.venue ? `<p>${escapeHtml(data.venue)}</p>` : ""}<div class="workspace-body">${escapeHtml(data.intro || "")}</div>
        <div class="workspace-body">${escapeHtml(data.details || "")}</div>
      </article>
    </div>`;
  }

  function accessView() {
    const date = new Date();
    date.setDate(date.getDate() + 30);
    const expires = date.toISOString().slice(0, 10);
    const selected = Array.isArray(links) ? links.filter(item => item.scope === scope) : null;
    return `${heading("Client access")}<div class="workspace-grid">
      <section class="workspace-card"><h3>Create a private link</h3><p>Choose which information the recipient can open.</p>
        <form class="workspace-form" data-work-form="link">
          ${sections.map(([key, label]) => `<label class="workspace-check"><input type="checkbox" name="sections" value="${key}"> ${label}</label>`).join("")}
          ${formField("expires", "Expires on", expires, { type: "date", required: true })}
          <div class="workspace-form-actions"><button class="primary-action" type="submit">Create link</button></div>
        </form>
        ${lastLink ? `<label class="form-label">New client link<input value="${escapeHtml(lastLink)}" readonly></label>
          <button class="secondary-action" type="button" data-work-action="copy-link">Copy link</button>` : ""}
      </section>
      <section class="workspace-card"><h3>Project links</h3>${selected === null ? '<p role="status">Loading links…</p>' :
        (selected.map(item => `<div class="workspace-list-row"><div><b>${escapeHtml(item.sections.map(key => sections.find(([id]) => id === key)?.[1] || key).join(", "))}</b>
          <small>${item.revoked_at ? "Revoked" : `Expires ${escapeHtml(formatDate(item.expires_at.slice(0, 10)))}`}</small></div>
          ${item.revoked_at ? "" : `<button class="secondary-action" type="button" data-work-action="revoke" data-record="${escapeHtml(item.id)}">Revoke link</button>`}</div>`).join("") || empty("No links for this project."))}
      </section></div>`;
  }

  async function loadLinks() {
    const session = token;
    links = [];
    try {
      links = await plannerRpc("planner_workspace_list_links", { p_token: session });
      checkSession(session);
    } catch (failure) {
      if (session !== token) return;
      error = failure.message;
    }
    if (active === "access") paint();
  }

  async function loadVenueTables() {
    const session = token;
    const project = scope;
    seatLayouts[project] = [];
    if (!celebrations.some(item => item.id === project)) return;
    try {
      const source = await plannerRpc("planner_load_seating", { p_token: session });
      checkSession(session);
      seatLayouts[project] = source?.[project]?.plan?.tables || [];
    } catch (failure) {
      if (session === token) error = failure.message;
    }
    if (session === token && active === "venue" && scope === project) paint();
  }

  function paint() {
    if (!token || state.view !== "workspace") return;
    if (!records) {
      root.innerHTML = `<div class="workspace-shell"><h2>Planning tools</h2><p role="status">${escapeHtml(error || "Opening planning tools…")}</p>
        ${error ? '<button class="secondary-action" type="button" data-work-action="reload">Try again</button>' : ""}</div>`;
      return;
    }

    const lists = { projects: projectsView, notes: notesView, comparison: comparisonView, guides: guidesView, site: siteView, access: accessView };
    root.innerHTML = `<div class="workspace-shell">
      <header class="workspace-heading">
        <nav class="workspace-tools" aria-label="Planning tools">${tools.map(([id, name]) =>
          `<button type="button" data-work-action="tab" data-tool="${id}" aria-pressed="${active === id}">${name}</button>`
        ).join("")}</nav>
        ${formField("workspace-scope", "Wedding project", scope, { choices: [...projects().map(item => [item.id, item.title]), ["shared", "Shared planning"]] })}
      </header>
      ${error ? `<p class="workspace-error" role="alert">${escapeHtml(error)}</p>` : ""}
      <div class="workspace-content" data-workspace-content>${lists[active]?.() || ""}</div>
    </div>`;

    const content = root.querySelector("[data-workspace-content]");
    if (active === "calendar" || active === "templates") {
      renderPlannerOperations(content, {
        tool: active, scope, records: records.filter(row => row.scope === scope || row.scope === "shared"),
        save, remove, applyTemplate
      });
    } else if (active === "venue") {
      renderVenueDesigner(content, {
        scope, records: scoped("venue"), seating: {tables: seatLayouts[scope] || []},
        save: (record, title, data) => save("venue", record, title, data)
      });
      if (!Object.hasOwn(seatLayouts, scope)) loadVenueTables();
    } else if (active === "access" && !links) loadLinks();
  }

  function numberValue(values, name) {
    const value = values.get(name);
    return value ? Number(value) : null;
  }

  root.addEventListener("change", change => {
    if (change.target.name === "workspace-scope") setScope(change.target.value);
  });

  root.addEventListener("click", async click => {
    const button = click.target.closest("[data-work-action]");
    if (!button) return;
    const { workAction, kind, record: id, tool } = button.dataset;
    const record = records?.find(row => row.id === id);
    error = null;
    try {
      if (workAction === "reload") return load();
      if (workAction === "tab") {
        active = tool;
        editor = null;
      } else if (workAction === "open-project") {
        setScope(button.dataset.scope);
        return;
      } else if (workAction === "edit") {
        editor = { kind, id };
      } else if (workAction === "cancel") {
        editor = null;
      } else if (workAction === "delete" && record) {
        if (!window.confirm(`Delete ${record.title}?`)) return;
        await remove(record);
        if (scope === record.id) scope = "south_africa";
        editor = null;
      } else if (workAction === "toggle-task" && record) {
        await save("project_task", record, record.title, { ...record.data, completed: !record.data.completed });
      } else if (workAction === "copy-link" && lastLink) {
        await navigator.clipboard.writeText(lastLink);
        toast("Link copied.");
        return;
      } else if (workAction === "revoke") {
        await plannerRpc("planner_workspace_revoke_link", { p_token: token, p_id: id });
        lastLink = null;
        await loadLinks();
        return;
      }
    } catch (failure) {
      error = failure.message;
    }
    paint();
  });

  root.addEventListener("submit", async submit => {
    const formElement = submit.target.closest("[data-work-form]");
    if (!formElement) return;
    submit.preventDefault();
    const { workForm: kind, record: id } = formElement.dataset;
    const record = records.find(row => row.id === id);
    const values = new FormData(formElement);
    const field = name => String(values.get(name) || "").trim();
    const button = formElement.querySelector("button[type=submit]");
    button.disabled = true;
    error = null;
    try {
      if (kind === "link") {
        const share = values.getAll("sections");
        if (!share.length) throw new Error("Choose at least one section to share.");
        const result = await plannerRpc("planner_workspace_create_link", {
          p_token: token, p_scope: scope, p_sections: share,
          p_expires_at: new Date(`${field("expires")}T23:59:59`).toISOString()
        });
        if (result?.token) {
          const url = new URL("planner-client.html", location.href);
          url.hash = result.token;
          lastLink = url.href;
        }
        await loadLinks();
        return;
      }

      let title = field("title"), data;
      switch (kind) {
        case "project": data = {date: field("date"), location: field("location"), body: field("body")}; break;
        case "note": data = {body: field("body"), pinned: values.has("pinned")}; break;
        case "message": title = "Planner message"; data = {body: field("body")}; break;
        case "guide": data = {body: field("body"), client_visible: values.has("client_visible")}; break;
        case "site": title = field("headline"); data = {
          headline: title, venue: field("venue"), intro: field("intro"), details: field("details"), client_visible: values.has("client_visible")
        }; break;
        case "vendor_score": data = {
          category: field("category"), currency: field("currency"), amount: numberValue(values, "amount"),
          deposit: numberValue(values, "deposit"), score: numberValue(values, "score"), body: field("body")
        }; break;
      }
      if (!data) return;
      await save(kind, record, title, data, kind === "project" ? "shared" : null);
      editor = null;
      toast("Saved.");
    } catch (failure) {
      toast(failure.message || "Could not save this record.", true);
      button.disabled = false;
      return;
    }
    paint();
  });

  return { render, reset };
})();

function renderPlannerWorkspace() { plannerWorkspace.render(); }
function resetPlannerWorkspace() { plannerWorkspace.reset(); }
