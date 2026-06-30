(() => {
  "use strict";

  const config = window.MXC_CONFIG || {};
  const TOKEN_KEY = "mxc-rsvp-token";
  const LOOKUP_KEY = "mxc-rsvp-lookup";
  const TOKEN_PATTERN = /^[0-9a-f]{48}$/i;
  const LOOKUP_PATTERN = /^[0-9a-f]{32}$/i;
  const CHECK_IN_WINDOW_COPY = "Use this to confirm your household in the few days before the celebration so we can keep the final head count, transport and food planning accurate.";
  const DEMO_TOKEN = "000000000000000000000000000000000000000000000000";
  const DEMO_LOOKUP_KEY = "11111111111111111111111111111111";
  const DEMO_STORAGE_KEY = "mxc-demo-checkin";
  let client = null;
  let token = "";
  let lookupKey = "";
  let invitation = null;
  let checkinOptions = [];

  const elements = {
    loading: document.getElementById("rsvp-loading"),
    codeState: document.getElementById("rsvp-code-state"),
    errorState: document.getElementById("rsvp-error-state"),
    formState: document.getElementById("rsvp-form-state"),
    successState: document.getElementById("rsvp-success-state"),
    selectForm: document.getElementById("rsvp-select-form"),
    guestSelect: document.getElementById("rsvp-guest-select"),
    selectStatus: document.getElementById("rsvp-select-status"),
    codeForm: document.getElementById("rsvp-code-form"),
    code: document.getElementById("rsvp-code"),
    codeStatus: document.getElementById("rsvp-code-status"),
    errorMessage: document.getElementById("rsvp-error-message"),
    tryAnother: document.getElementById("try-another-code"),
    form: document.getElementById("rsvp-form"),
    people: document.getElementById("rsvp-people"),
    household: document.getElementById("rsvp-household"),
    celebration: document.getElementById("rsvp-celebration"),
    deadline: document.getElementById("rsvp-deadline"),
    email: document.getElementById("rsvp-email"),
    phone: document.getElementById("rsvp-phone"),
    message: document.getElementById("rsvp-message"),
    submit: document.getElementById("rsvp-submit"),
    submitStatus: document.getElementById("rsvp-submit-status"),
    successCopy: document.getElementById("rsvp-success-copy"),
    successSummary: document.getElementById("rsvp-success-summary"),
    edit: document.getElementById("edit-rsvp")
  };

  function show(target) {
    [elements.loading, elements.codeState, elements.errorState, elements.formState, elements.successState]
      .forEach((section) => { section.hidden = section !== target; });
  }

  function readToken() {
    const url = new URL(window.location.href);
    const fragment = new URLSearchParams(url.hash.replace(/^#/, ""));
    const fromUrl = (fragment.get("invite") || url.searchParams.get("invite") || "").trim();
    if (TOKEN_PATTERN.test(fromUrl)) {
      sessionStorage.setItem(TOKEN_KEY, fromUrl.toLowerCase());
      history.replaceState(null, document.title, url.pathname);
      return fromUrl.toLowerCase();
    }
    const stored = (sessionStorage.getItem(TOKEN_KEY) || "").trim();
    return TOKEN_PATTERN.test(stored) ? stored.toLowerCase() : "";
  }

  function readLookupKey() {
    const url = new URL(window.location.href);
    const fragment = new URLSearchParams(url.hash.replace(/^#/, ""));
    const fromUrl = (fragment.get("guest") || url.searchParams.get("guest") || "").trim();
    if (LOOKUP_PATTERN.test(fromUrl)) {
      sessionStorage.setItem(LOOKUP_KEY, fromUrl.toLowerCase());
      history.replaceState(null, document.title, url.pathname);
      return fromUrl.toLowerCase();
    }
    const stored = (sessionStorage.getItem(LOOKUP_KEY) || "").trim();
    return LOOKUP_PATTERN.test(stored) ? stored.toLowerCase() : "";
  }

  async function start() {
    bindEvents();
    await purgeRsvpCaches();
    const demoMode = isLocalDemoEnabled();
    if (demoMode) {
      client = createDemoClient();
    } else if (!config.supabaseUrl || !config.supabaseAnonKey || !window.supabase?.createClient) {
      showError("The check-in service is not connected yet. Please contact Matt or Cara directly for now.");
      return;
    } else {
      client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
      });
    }
    token = readToken();
    lookupKey = readLookupKey();
    if (demoMode) token = DEMO_TOKEN;
    if (!token && !lookupKey) {
      show(elements.codeState);
      await loadGuestOptions();
      return;
    }
    await loadInvitation();
  }

  async function purgeRsvpCaches() {
    if (!("caches" in window)) return;
    try {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(async (cacheName) => {
        const cache = await caches.open(cacheName);
        const requests = await cache.keys();
        await Promise.all(requests.filter((request) => {
          const cachedUrl = new URL(request.url);
          return cachedUrl.pathname.includes("rsvp") || cachedUrl.searchParams.has("invite");
        }).map((request) => cache.delete(request)));
      }));
    } catch (error) {
      console.warn("Could not inspect old check-in cache entries", error);
    }
  }

  function bindEvents() {
    elements.selectForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const value = elements.guestSelect.value.trim().toLowerCase();
      if (!LOOKUP_PATTERN.test(value)) {
        setStatus(elements.selectStatus, "Choose your name or household first.", true);
        return;
      }
      lookupKey = value;
      token = "";
      sessionStorage.setItem(LOOKUP_KEY, lookupKey);
      sessionStorage.removeItem(TOKEN_KEY);
      show(elements.loading);
      await loadInvitation();
    });

    elements.codeForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const value = elements.code.value.trim().toLowerCase();
      if (!TOKEN_PATTERN.test(value)) {
        setStatus(elements.codeStatus, "That code should be 48 letters and numbers.", true);
        return;
      }
      token = value;
      lookupKey = "";
      sessionStorage.setItem(TOKEN_KEY, token);
      sessionStorage.removeItem(LOOKUP_KEY);
      show(elements.loading);
      await loadInvitation();
    });

    elements.tryAnother.addEventListener("click", async () => {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(LOOKUP_KEY);
      token = "";
      lookupKey = "";
      elements.code.value = "";
      elements.guestSelect.value = "";
      setStatus(elements.codeStatus, "");
      setStatus(elements.selectStatus, "");
      show(elements.codeState);
      if (!checkinOptions.length) await loadGuestOptions();
    });

    elements.form.addEventListener("submit", submitRsvp);
    elements.edit.addEventListener("click", () => show(elements.formState));
  }

  async function loadGuestOptions() {
    setStatus(elements.selectStatus, "Loading guest list...");
    elements.guestSelect.disabled = true;
    try {
      const { data, error } = await client.rpc("list_guest_checkin_options");
      if (error) throw error;
      checkinOptions = Array.isArray(data) ? data : [];
      renderGuestOptions();
      setStatus(
        elements.selectStatus,
        checkinOptions.length
          ? "Pick your name, then review each person before sending."
          : "No guest check-ins are available yet. You can still use a code if Matt and Cara sent one."
      );
    } catch (error) {
      console.warn("Guest list could not be loaded", error);
      checkinOptions = [];
      renderGuestOptions();
      setStatus(elements.selectStatus, "We could not load the guest list. You can still paste a check-in code below.", true);
    } finally {
      elements.guestSelect.disabled = false;
    }
  }

  function renderGuestOptions() {
    const placeholder = '<option value="">Select your name or household</option>';
    if (!checkinOptions.length) {
      elements.guestSelect.innerHTML = placeholder;
      return;
    }
    elements.guestSelect.innerHTML = placeholder + checkinOptions.map((option) => {
      const venue = option.celebration === "spain" ? "Spain" : "South Africa";
      const count = Number(option.guest_count || 0);
      const suffix = count > 1 ? ` - ${count} guests` : "";
      return `<option value="${escapeHtml(option.lookup_key)}">${escapeHtml(`${venue} - ${option.label}${suffix}`)}</option>`;
    }).join("");
  }

  async function loadInvitation() {
    try {
      const usingLookup = LOOKUP_PATTERN.test(lookupKey);
      const { data, error } = usingLookup
        ? await client.rpc("get_rsvp_invitation_by_lookup", { p_lookup_key: lookupKey })
        : await client.rpc("get_rsvp_invitation", { p_token: token });
      if (error) throw error;
      if (!data || !Array.isArray(data.people)) throw new Error("Check-in not found");
      invitation = data;
      if (LOOKUP_PATTERN.test(invitation.lookup_key || "")) {
        lookupKey = invitation.lookup_key.toLowerCase();
        sessionStorage.setItem(LOOKUP_KEY, lookupKey);
      }
      renderInvitation();
      show(elements.formState);
    } catch (error) {
      console.warn("Guest check-in could not be opened", error);
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(LOOKUP_KEY);
      token = "";
      lookupKey = "";
      showError("The check-in service is not connected yet. Please contact Matt or Cara directly for now.");
    }
  }

  function renderInvitation() {
    elements.household.textContent = invitation.label || "Your household";
    elements.celebration.textContent = invitation.celebration === "spain" ? "Spain guest check-in" : "South Africa guest check-in";
    elements.deadline.textContent = invitation.deadline
      ? `Please confirm by ${formatDate(invitation.deadline)}. You can reopen this link to update your check-in.`
      : CHECK_IN_WINDOW_COPY;
    elements.people.innerHTML = invitation.people.map(renderPerson).join("");
    elements.email.value = invitation.contact_email || "";
    elements.phone.value = invitation.contact_phone || "";
    elements.message.value = invitation.guest_message || "";
  }

  function renderPerson(person, index) {
    const attending = person.attending;
    const transportValue = person.transport_needed === true ? "yes" : person.transport_needed === false ? "no" : "tbc";
    return `<article class="guest-response" data-person-id="${escapeHtml(person.id)}">
      <div class="guest-response-head">
        <h3>${escapeHtml(person.name)}</h3>
        <div class="attendance-choice" role="radiogroup" aria-label="Attendance for ${escapeHtml(person.name)}">
          <label><input type="radio" name="attendance-${index}" value="yes" ${attending === true ? "checked" : ""} required><span>Checked in — still coming</span></label>
          <label><input type="radio" name="attendance-${index}" value="no" ${attending === false ? "checked" : ""} required><span>Can't make it</span></label>
        </div>
      </div>
      <div class="guest-response-fields">
        <label>Dietary or allergy notes
          <textarea data-field="dietary" maxlength="800" placeholder="Leave blank when none">${escapeHtml(person.dietary || "")}</textarea>
        </label>
        <label>Wedding-day transport
          <select data-field="transport_needed">
            <option value="tbc" ${transportValue === "tbc" ? "selected" : ""}>Not sure yet</option>
            <option value="yes" ${transportValue === "yes" ? "selected" : ""}>Yes, transport needed</option>
            <option value="no" ${transportValue === "no" ? "selected" : ""}>No transport needed</option>
          </select>
        </label>
        <label>Pickup area / accommodation
          <input data-field="transport_location" maxlength="300" value="${escapeHtml(person.transport_location || "")}" placeholder="Town, hotel or area">
        </label>
        <label>Where are you staying?
          <input data-field="accommodation" maxlength="300" value="${escapeHtml(person.accommodation || "")}" placeholder="Optional or TBC">
        </label>
        <label class="full">Last-minute note for Matt & Cara
          <textarea data-field="notes" maxlength="800" placeholder="Arrival timing, transport change, child note, accessibility need or anything useful.">${escapeHtml(person.notes || "")}</textarea>
        </label>
      </div>
    </article>`;
  }

  async function submitRsvp(event) {
    event.preventDefault();
    if (!invitation || (!token && !lookupKey)) return;
    let people;
    try {
      people = [...elements.people.querySelectorAll(".guest-response")].map((card, index) => {
        const attendance = card.querySelector(`input[name="attendance-${index}"]:checked`)?.value;
        if (!attendance) throw new Error("Please choose a check-in answer for every guest.");
        const transport = card.querySelector('[data-field="transport_needed"]').value;
        return {
          id: card.dataset.personId,
          attending: attendance === "yes",
          dietary: value(card, "dietary"),
          transport_needed: transport === "yes" ? true : transport === "no" ? false : null,
          transport_location: value(card, "transport_location"),
          accommodation: value(card, "accommodation"),
          notes: value(card, "notes")
        };
      });
    } catch (error) {
      setStatus(elements.submitStatus, error.message, true);
      return;
    }

    elements.submit.disabled = true;
    setStatus(elements.submitStatus, "Saving your check-in securely…");
    try {
      const payload = {
        p_contact_email: elements.email.value.trim() || null,
        p_contact_phone: elements.phone.value.trim() || null,
        p_guest_message: elements.message.value.trim() || null,
        p_people: people
      };
      const usingLookup = LOOKUP_PATTERN.test(lookupKey);
      const { data, error } = usingLookup
        ? await client.rpc("submit_rsvp_by_lookup", { p_lookup_key: lookupKey, ...payload })
        : await client.rpc("submit_rsvp", { p_token: token, ...payload });
      if (error) throw error;
      invitation = data?.invitation || { ...invitation, people };
      renderSuccess(data?.summary || buildSummary(people));
      show(elements.successState);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      console.error(error);
      setStatus(elements.submitStatus, error.message || "We could not save the check-in. Please try again.", true);
    } finally {
      elements.submit.disabled = false;
    }
  }

  function renderSuccess(summary) {
    const yes = Number(summary?.attending || 0);
    const no = Number(summary?.declined || 0);
    elements.successCopy.textContent = `Your check-in for ${invitation.label || "your household"} has been saved securely.`;
    elements.successSummary.innerHTML = `
      <div><span>Still coming</span><b>${yes}</b></div>
      <div><span>Can't make it</span><b>${no}</b></div>
      <div><span>Celebration</span><b>${invitation.celebration === "spain" ? "Spain" : "South Africa"}</b></div>`;
  }

  function buildSummary(people) {
    return {
      attending: people.filter((person) => person.attending === true).length,
      declined: people.filter((person) => person.attending === false).length
    };
  }

  function isLocalDemoEnabled() {
    const url = new URL(window.location.href);
    const localHost = ["localhost", "127.0.0.1", "::1", "[::1]", ""].includes(window.location.hostname);
    const missingConfig = !config.supabaseUrl || !config.supabaseAnonKey;
    return url.searchParams.get("demo") === "1" && (localHost || window.location.protocol === "file:" || missingConfig);
  }

  function createDemoClient() {
    return {
      async rpc(name, payload = {}) {
        if (name === "list_guest_checkin_options") return getDemoOptions();
        if (name === "get_rsvp_invitation") return getDemoInvitation(payload.p_token);
        if (name === "get_rsvp_invitation_by_lookup") return getDemoInvitationByLookup(payload.p_lookup_key);
        if (name === "submit_rsvp") return submitDemoInvitation(payload);
        if (name === "submit_rsvp_by_lookup") return submitDemoInvitation(payload);
        return { data: null, error: new Error("Unknown local demo action") };
      }
    };
  }

  function getDemoOptions() {
    return {
      data: [{
        lookup_key: DEMO_LOOKUP_KEY,
        label: "Local test household",
        celebration: "spain",
        guest_count: 2
      }],
      error: null
    };
  }

  function getDemoInvitation(rawToken) {
    if (rawToken !== DEMO_TOKEN) return { data: null, error: null };
    return { data: readDemoInvitation(), error: null };
  }

  function getDemoInvitationByLookup(rawLookupKey) {
    if (rawLookupKey !== DEMO_LOOKUP_KEY) return { data: null, error: null };
    return { data: readDemoInvitation(), error: null };
  }

  function submitDemoInvitation(payload) {
    const next = readDemoInvitation();
    const submitted = new Map((payload.p_people || []).map((person) => [person.id, person]));
    next.people = next.people.map((person) => ({ ...person, ...(submitted.get(person.id) || {}) }));
    next.contact_email = payload.p_contact_email || "";
    next.contact_phone = payload.p_contact_phone || "";
    next.guest_message = payload.p_guest_message || "";
    next.submitted_at = new Date().toISOString();
    writeDemoInvitation(next);
    return { data: { ok: true, summary: buildSummary(next.people), invitation: next }, error: null };
  }

  function readDemoInvitation() {
    try {
      const saved = JSON.parse(localStorage.getItem(DEMO_STORAGE_KEY) || "null");
      if (saved?.people?.length) return saved;
    } catch (_error) {
      localStorage.removeItem(DEMO_STORAGE_KEY);
    }
    const fresh = {
      invitation_id: "local-demo",
      lookup_key: DEMO_LOOKUP_KEY,
      label: "Local test household",
      celebration: "spain",
      deadline: null,
      submitted_at: null,
      contact_email: "",
      contact_phone: "",
      guest_message: "",
      people: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          name: "Alex Test Guest",
          attending: null,
          dietary: "",
          transport_needed: null,
          transport_location: "",
          accommodation: "",
          notes: "",
          sort_order: 0
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          name: "Sam Test Guest",
          attending: null,
          dietary: "",
          transport_needed: null,
          transport_location: "",
          accommodation: "",
          notes: "",
          sort_order: 1
        }
      ]
    };
    writeDemoInvitation(fresh);
    return fresh;
  }

  function writeDemoInvitation(next) {
    localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(next));
  }

  function value(card, field) {
    return card.querySelector(`[data-field="${field}"]`)?.value.trim() || null;
  }

  function showError(message) {
    elements.errorMessage.textContent = message;
    show(elements.errorState);
  }

  function setStatus(element, message, isError = false) {
    element.textContent = message || "";
    element.style.color = isError ? "var(--danger)" : "";
  }

  function formatDate(value) {
    const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
    return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(date);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  start().catch((error) => {
    console.error(error);
    showError("The check-in page could not start. Please contact Matt or Cara directly.");
  });
})();
