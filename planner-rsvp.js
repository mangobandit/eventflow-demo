(() => {
  "use strict";

  let invitations = [];
  let loading = false;
  let initialized = false;
  let createdLink = "";

  function initialize() {
    if (initialized) return;
    initialized = true;
    injectNavigation();
    injectView();
    injectModal();
    bindEvents();
    applyRequestedView();
  }

  function injectNavigation() {
    const nav = document.querySelector(".planner-nav");
    if (!nav || nav.querySelector('[data-view="invitations"]')) return;
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.view = "invitations";
    button.innerHTML = "<span>✉</span>Invitations & RSVP";
    const guestsButton = nav.querySelector('[data-view="guests"]');
    guestsButton?.insertAdjacentElement("afterend", button);
  }

  function injectView() {
    const content = document.querySelector(".planner-content");
    if (!content || content.querySelector('[data-view-panel="invitations"]')) return;
    const section = document.createElement("section");
    section.className = "planner-view";
    section.dataset.viewPanel = "invitations";
    section.innerHTML = `
      <div class="view-intro">
        <div><p class="eyebrow">Invitation control centre</p><h2>Private links. Clear responses.</h2><p>Create one secure link per household. Guests can answer for each named person, update their RSVP later, and feed dietaries, transport and accommodation directly into your private guest register.</p></div>
        <div class="view-tools"><a class="filter-button" href="rsvp.html" target="_blank" rel="noopener noreferrer">Preview RSVP page ↗</a><button class="primary-action" id="rsvp-create-invitation" type="button">+ Create invitation</button></div>
      </div>
      <div class="rsvp-admin-kpis">
        <article class="rsvp-admin-kpi"><span>Households</span><strong id="rsvp-kpi-households">0</strong><small>in this planner lens</small></article>
        <article class="rsvp-admin-kpi"><span>Awaiting reply</span><strong id="rsvp-kpi-awaiting">0</strong><small>not submitted yet</small></article>
        <article class="rsvp-admin-kpi"><span>Attending</span><strong id="rsvp-kpi-attending">0</strong><small>individual guests</small></article>
        <article class="rsvp-admin-kpi"><span>Unable to attend</span><strong id="rsvp-kpi-declined">0</strong><small>individual guests</small></article>
      </div>
      <div class="rsvp-admin-panel">
        <div class="rsvp-admin-toolbar"><div><h3>Household invitations</h3><p>Raw invitation tokens are never stored. Generate a fresh link whenever you need to resend one.</p></div><button class="filter-button" id="rsvp-refresh" type="button">Refresh</button></div>
        <div class="rsvp-invitation-list" id="rsvp-invitation-list"><div class="empty-state">Open this view after signing in to load invitations.</div></div>
      </div>
      <div class="rsvp-admin-note"><span aria-hidden="true">◇</span><div><b>No open guest database.</b> Guests can only read and update the household attached to their 192-bit private token. The public website cannot list invitations, names or responses.</div></div>`;
    content.appendChild(section);
  }

  function injectModal() {
    if (document.getElementById("rsvp-admin-modal")) return;
    const modal = document.createElement("div");
    modal.className = "modal-backdrop";
    modal.id = "rsvp-admin-modal";
    modal.hidden = true;
    modal.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="rsvp-modal-title">
        <div class="modal-head"><h3 id="rsvp-modal-title">Create invitation</h3><button class="modal-close" id="rsvp-modal-close" type="button" aria-label="Close">×</button></div>
        <form class="entity-form" id="rsvp-admin-form">
          <label class="form-label full">Household / invitation label<input name="label" type="text" maxlength="120" placeholder="The Smith family" required></label>
          <label class="form-label">Wedding<select name="celebration"><option value="spain">Spain</option><option value="south_africa">South Africa</option></select></label>
          <label class="form-label">Planner owner<select name="owner"><option value="shared">Shared</option><option value="matt">Matt</option><option value="cara">Cara</option></select></label>
          <label class="form-label">RSVP deadline<input name="deadline" type="date"></label>
          <label class="form-label">Contact email<input name="contact_email" type="email" maxlength="200" placeholder="Optional"></label>
          <label class="form-label">Contact phone<input name="contact_phone" type="tel" maxlength="80" placeholder="Optional"></label>
          <label class="form-label full">Invited people<textarea name="people" maxlength="1500" placeholder="One person per line" required></textarea></label>
          <p class="rsvp-form-hint">Use the exact names you want guests to see. The link lets this household answer only for these people.</p>
          <label class="form-label full">Private notes<textarea name="notes" maxlength="2000" placeholder="Invitation context, delivery note or internal reminder"></textarea></label>
          <div class="rsvp-link-result" id="rsvp-link-result" hidden>
            <h4>Private link created</h4><p>Copy it now. For security, the raw token is never stored and cannot be shown again. A fresh link can be generated later.</p>
            <div class="rsvp-link-box"><input id="rsvp-created-link" readonly><button class="primary-action" id="rsvp-copy-created" type="button">Copy link</button></div>
          </div>
          <div class="form-actions"><span></span><div style="display:flex;gap:8px"><button class="secondary-action" id="rsvp-cancel" type="button">Cancel</button><button class="primary-action" id="rsvp-save" type="submit">Create invitation</button></div></div>
        </form>
      </div>`;
    document.body.appendChild(modal);
  }

  function bindEvents() {
    document.querySelector('[data-view="invitations"]')?.addEventListener("click", () => openView());
    document.getElementById("rsvp-create-invitation")?.addEventListener("click", openCreateModal);
    document.getElementById("rsvp-refresh")?.addEventListener("click", () => loadInvitations(true));
    document.getElementById("rsvp-modal-close")?.addEventListener("click", closeModal);
    document.getElementById("rsvp-cancel")?.addEventListener("click", closeModal);
    document.getElementById("rsvp-admin-modal")?.addEventListener("click", (event) => { if (event.target.id === "rsvp-admin-modal") closeModal(); });
    document.getElementById("rsvp-admin-form")?.addEventListener("submit", createInvitation);
    document.getElementById("rsvp-copy-created")?.addEventListener("click", () => copyText(createdLink, "Private RSVP link copied."));
    document.getElementById("rsvp-invitation-list")?.addEventListener("click", handleListAction);

    document.querySelectorAll('[data-owner], [data-celebration], [data-view]').forEach((button) => {
      button.addEventListener("click", () => window.setTimeout(() => {
        if (state.view === "invitations") {
          updateChrome();
          render();
        }
      }, 0));
    });

    const globalAdd = document.getElementById("global-add");
    globalAdd?.addEventListener("click", (event) => {
      if (state.view !== "invitations") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      openCreateModal();
    }, true);
  }

  function applyRequestedView() {
    if (location.hash === "#invitations" && state.session) openView();
  }

  function openView() {
    state.view = "invitations";
    if (history.replaceState) history.replaceState(null, "", "#invitations");
    document.querySelectorAll("[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === "invitations"));
    document.querySelectorAll("[data-view-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.viewPanel === "invitations"));
    document.body.classList.remove("sidebar-open");
    updateChrome();
    loadInvitations();
  }

  function updateChrome() {
    if (state.view !== "invitations") return;
    els.topbarTitle.textContent = "Invitations & RSVP";
    els.topbarSubtitle.textContent = `${ownerLabel(state.owner)} planner · ${state.celebration === "all" ? "Spain and South Africa" : labelCelebration(state.celebration)}`;
    document.getElementById("global-add").textContent = "+ Create invitation";
  }

  async function loadInvitations(force = false) {
    if (!state.client || !state.session || loading || (invitations.length && !force)) {
      render();
      return;
    }
    loading = true;
    const list = document.getElementById("rsvp-invitation-list");
    if (list) list.innerHTML = '<div class="empty-state">Loading secure invitations…</div>';
    try {
      const { data, error } = await state.client
        .from("rsvp_invitations")
        .select("id,label,owner,celebration,status,deadline,token_hint,sent_at,opened_at,submitted_at,revoked_at,expires_at,notes,contact_email,contact_phone,guest_message,created_at,updated_at,rsvp_people(id,name,attending,dietary,transport_needed,transport_location,accommodation,notes,sort_order)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      invitations = data || [];
      render();
    } catch (error) {
      console.error(error);
      list.innerHTML = `<div class="empty-state">The RSVP database is not ready yet. Run the RSVP migration in Supabase, then refresh.<br><small>${escapeHtml(error.message)}</small></div>`;
    } finally {
      loading = false;
    }
  }

  function visibleInvitations() {
    return invitations.filter((item) => {
      const ownerMatch = item.owner === state.owner;
      const celebrationMatch = state.celebration === "all" || item.celebration === state.celebration;
      return ownerMatch && celebrationMatch;
    });
  }

  function render() {
    const rows = visibleInvitations();
    const people = rows.flatMap((row) => row.rsvp_people || []);
    text("rsvp-kpi-households", rows.length);
    text("rsvp-kpi-awaiting", rows.filter((row) => !row.submitted_at && !row.revoked_at).length);
    text("rsvp-kpi-attending", people.filter((person) => person.attending === true).length);
    text("rsvp-kpi-declined", people.filter((person) => person.attending === false).length);
    const list = document.getElementById("rsvp-invitation-list");
    if (!list) return;
    list.innerHTML = rows.length ? rows.map(renderInvitation).join("") : '<div class="empty-state">No household invitations in this planner lens yet.</div>';
  }

  function renderInvitation(item) {
    const people = [...(item.rsvp_people || [])].sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
    const attending = people.filter((person) => person.attending === true).length;
    const declined = people.filter((person) => person.attending === false).length;
    const awaiting = people.filter((person) => person.attending == null).length;
    const status = item.revoked_at ? "revoked" : item.submitted_at ? "responded" : item.opened_at ? "opened" : item.sent_at ? "sent" : "draft";
    return `<article class="rsvp-invitation" data-id="${item.id}">
      <div class="rsvp-invitation-main">
        <div><h4>${escapeHtml(item.label)}</h4><div class="rsvp-invitation-meta"><span class="mini-tag ${item.celebration}">${escapeHtml(labelCelebration(item.celebration))}</span>${ownerTag(item.owner)}${rsvpStatusBadge(status)}<span class="mini-tag">Link ·••${escapeHtml(item.token_hint || "")}</span></div></div>
        <div class="rsvp-response-counts"><div><b>${attending}</b><span>Yes</span></div><div><b>${declined}</b><span>No</span></div><div><b>${awaiting}</b><span>Awaiting</span></div></div>
        <div class="rsvp-deadline-label"><span>Reply deadline</span><b>${item.deadline ? formatDate(item.deadline, { short: false }) : "Not set"}</b></div>
        <div class="rsvp-row-actions">
          ${!item.revoked_at ? '<button class="primary" data-rsvp-action="fresh-link" type="button">Fresh link</button>' : ""}
          ${!item.sent_at && !item.revoked_at ? '<button data-rsvp-action="mark-sent" type="button">Mark sent</button>' : ""}
          ${!item.revoked_at ? '<button class="danger" data-rsvp-action="revoke" type="button">Revoke</button>' : ""}
          <button class="danger" data-rsvp-action="delete" type="button">Delete</button>
        </div>
      </div>
      <div class="rsvp-people-detail">${people.map(renderPersonDetail).join("")}</div>
    </article>`;
  }

  function renderPersonDetail(person) {
    const response = person.attending === true ? "Attending" : person.attending === false ? "Not attending" : "Awaiting response";
    const transport = person.transport_needed === true ? `Transport needed${person.transport_location ? ` · ${person.transport_location}` : ""}` : person.transport_needed === false ? "No transport needed" : "Transport TBC";
    const detail = [person.dietary ? `Dietary: ${person.dietary}` : null, transport, person.accommodation ? `Stay: ${person.accommodation}` : null, person.notes || null].filter(Boolean).join(" · ");
    return `<div class="rsvp-person-detail"><div class="rsvp-person-detail-head"><b>${escapeHtml(person.name)}</b><span class="status-badge ${person.attending === true ? "status-approved" : person.attending === false ? "status-outstanding" : "status-pending"}">${escapeHtml(response)}</span></div><p>${escapeHtml(detail || "No response details yet.")}</p></div>`;
  }

  function openCreateModal() {
    const modal = document.getElementById("rsvp-admin-modal");
    const form = document.getElementById("rsvp-admin-form");
    form.reset();
    form.elements.owner.value = state.owner;
    if (state.celebration === "spain" || state.celebration === "south_africa") form.elements.celebration.value = state.celebration;
    createdLink = "";
    document.getElementById("rsvp-link-result").hidden = true;
    document.getElementById("rsvp-save").hidden = false;
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    form.elements.label.focus();
  }

  function closeModal() {
    document.getElementById("rsvp-admin-modal").hidden = true;
    document.body.style.overflow = "";
  }

  async function createInvitation(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const names = form.elements.people.value.split(/\r?\n/).map((name) => name.trim()).filter(Boolean);
    if (!names.length) return toast("Add at least one invited person.", true);
    const save = document.getElementById("rsvp-save");
    save.disabled = true;
    save.textContent = "Creating…";
    try {
      const { data, error } = await state.client.rpc("create_rsvp_invitation", {
        p_label: form.elements.label.value.trim(),
        p_celebration: form.elements.celebration.value,
        p_people: names.map((name) => ({ name })),
        p_owner: form.elements.owner.value,
        p_deadline: form.elements.deadline.value || null,
        p_contact_email: form.elements.contact_email.value.trim() || null,
        p_contact_phone: form.elements.contact_phone.value.trim() || null,
        p_notes: form.elements.notes.value.trim() || null,
        p_expires_at: null
      });
      if (error) throw error;
      createdLink = buildLink(data.token);
      document.getElementById("rsvp-created-link").value = createdLink;
      document.getElementById("rsvp-link-result").hidden = false;
      save.hidden = true;
      invitations = [];
      await loadInvitations(true);
      toast("Invitation created. Copy the private link now.");
    } catch (error) {
      console.error(error);
      toast(error.message || "Could not create invitation.", true);
    } finally {
      save.disabled = false;
      save.textContent = "Create invitation";
    }
  }

  async function handleListAction(event) {
    const button = event.target.closest("[data-rsvp-action]");
    if (!button) return;
    const card = button.closest("[data-id]");
    const id = card?.dataset.id;
    const item = invitations.find((row) => row.id === id);
    if (!item) return;
    const action = button.dataset.rsvpAction;
    button.disabled = true;
    try {
      if (action === "fresh-link") {
        if (!window.confirm("Generate a fresh link? The previous link will stop working immediately.")) return;
        const { data, error } = await state.client.rpc("rotate_rsvp_invitation", { p_invitation_id: id });
        if (error) throw error;
        const link = buildLink(data.token);
        await copyText(link, "Fresh private link copied. The old link is now invalid.");
      }
      if (action === "mark-sent") {
        const { error } = await state.client.rpc("mark_rsvp_invitation_sent", { p_invitation_id: id });
        if (error) throw error;
        toast("Invitation marked as sent.");
      }
      if (action === "revoke") {
        if (!window.confirm("Revoke this invitation link? Guests will no longer be able to open it.")) return;
        const { error } = await state.client.rpc("revoke_rsvp_invitation", { p_invitation_id: id });
        if (error) throw error;
        toast("Invitation revoked.");
      }
      if (action === "delete") {
        if (!window.confirm(`Delete ${item.label}, its RSVP responses and synced guest rows? This cannot be undone.`)) return;
        const { error } = await state.client.rpc("delete_rsvp_invitation", { p_invitation_id: id });
        if (error) throw error;
        toast("Invitation and synced RSVP guest rows deleted.");
      }
      invitations = [];
      await loadInvitations(true);
    } catch (error) {
      console.error(error);
      toast(error.message || "RSVP action failed.", true);
    } finally {
      button.disabled = false;
    }
  }

  function buildLink(rawToken) {
    const base = (config.siteUrl || location.origin).replace(/\/$/, "");
    return `${base}/rsvp.html#invite=${encodeURIComponent(rawToken)}`;
  }

  async function copyText(value, successMessage) {
    try {
      await navigator.clipboard.writeText(value);
    } catch (_error) {
      const input = document.createElement("textarea");
      input.value = value;
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }
    toast(successMessage);
  }

  function rsvpStatusBadge(status) {
    const cls = status === "responded" ? "status-approved" : status === "revoked" ? "status-outstanding" : "status-pending";
    return `<span class="status-badge ${cls}">${escapeHtml(titleCase(status))}</span>`;
  }

  const waitForPlanner = window.setInterval(() => {
    if (typeof state !== "undefined" && typeof toast === "function" && document.querySelector(".planner-nav")) {
      window.clearInterval(waitForPlanner);
      initialize();
    }
  }, 40);
})();
