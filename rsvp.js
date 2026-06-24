(() => {
  "use strict";

  const config = window.MXC_CONFIG || {};
  const TOKEN_KEY = "mxc-rsvp-token";
  const TOKEN_PATTERN = /^[0-9a-f]{48}$/i;
  let client = null;
  let token = "";
  let invitation = null;

  const elements = {
    loading: document.getElementById("rsvp-loading"),
    codeState: document.getElementById("rsvp-code-state"),
    errorState: document.getElementById("rsvp-error-state"),
    formState: document.getElementById("rsvp-form-state"),
    successState: document.getElementById("rsvp-success-state"),
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

  async function start() {
    bindEvents();
    await purgeRsvpCaches();
    if (!config.supabaseUrl || !config.supabaseAnonKey || !window.supabase?.createClient) {
      showError("The RSVP service is not connected yet. Please contact Matt or Cara directly for now.");
      return;
    }
    client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    token = readToken();
    if (!token) {
      show(elements.codeState);
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
      console.warn("Could not inspect old RSVP cache entries", error);
    }
  }

  function bindEvents() {
    elements.codeForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const value = elements.code.value.trim().toLowerCase();
      if (!TOKEN_PATTERN.test(value)) {
        setStatus(elements.codeStatus, "That code should be 48 letters and numbers.", true);
        return;
      }
      token = value;
      sessionStorage.setItem(TOKEN_KEY, token);
      show(elements.loading);
      await loadInvitation();
    });

    elements.tryAnother.addEventListener("click", () => {
      sessionStorage.removeItem(TOKEN_KEY);
      token = "";
      elements.code.value = "";
      setStatus(elements.codeStatus, "");
      show(elements.codeState);
    });

    elements.form.addEventListener("submit", submitRsvp);
    elements.edit.addEventListener("click", () => show(elements.formState));
  }

  async function loadInvitation() {
    try {
      const { data, error } = await client.rpc("get_rsvp_invitation", { p_token: token });
      if (error) throw error;
      if (!data || !Array.isArray(data.people)) throw new Error("Invitation not found");
      invitation = data;
      renderInvitation();
      show(elements.formState);
    } catch (error) {
      console.warn("RSVP invitation could not be opened", error);
      sessionStorage.removeItem(TOKEN_KEY);
      showError("The invitation may have expired, been revoked or been replaced. Ask Matt or Cara for a fresh private link.");
    }
  }

  function renderInvitation() {
    elements.household.textContent = invitation.label || "Your household";
    elements.celebration.textContent = invitation.celebration === "spain" ? "Spain wedding RSVP" : "South Africa wedding RSVP";
    elements.deadline.textContent = invitation.deadline
      ? `Please respond by ${formatDate(invitation.deadline)}. You can reopen this link to make a change.`
      : "Please respond when you know your plans. You can reopen this link to make a change.";
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
          <label><input type="radio" name="attendance-${index}" value="yes" ${attending === true ? "checked" : ""} required><span>Joyfully yes</span></label>
          <label><input type="radio" name="attendance-${index}" value="no" ${attending === false ? "checked" : ""} required><span>Sadly no</span></label>
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
        <label class="full">Private note for this guest
          <textarea data-field="notes" maxlength="800" placeholder="Accessibility, arrival timing or anything useful">${escapeHtml(person.notes || "")}</textarea>
        </label>
      </div>
    </article>`;
  }

  async function submitRsvp(event) {
    event.preventDefault();
    if (!invitation || !token) return;
    let people;
    try {
      people = [...elements.people.querySelectorAll(".guest-response")].map((card, index) => {
        const attendance = card.querySelector(`input[name="attendance-${index}"]:checked`)?.value;
        if (!attendance) throw new Error("Please choose an attendance answer for every guest.");
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
    setStatus(elements.submitStatus, "Saving your response securely…");
    try {
      const { data, error } = await client.rpc("submit_rsvp", {
        p_token: token,
        p_contact_email: elements.email.value.trim() || null,
        p_contact_phone: elements.phone.value.trim() || null,
        p_guest_message: elements.message.value.trim() || null,
        p_people: people
      });
      if (error) throw error;
      invitation = data?.invitation || { ...invitation, people };
      renderSuccess(data?.summary || buildSummary(people));
      show(elements.successState);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      console.error(error);
      setStatus(elements.submitStatus, error.message || "We could not save the RSVP. Please try again.", true);
    } finally {
      elements.submit.disabled = false;
    }
  }

  function renderSuccess(summary) {
    const yes = Number(summary?.attending || 0);
    const no = Number(summary?.declined || 0);
    elements.successCopy.textContent = `Your response for ${invitation.label || "your household"} has been saved securely.`;
    elements.successSummary.innerHTML = `
      <div><span>Attending</span><b>${yes}</b></div>
      <div><span>Unable to attend</span><b>${no}</b></div>
      <div><span>Celebration</span><b>${invitation.celebration === "spain" ? "Spain" : "South Africa"}</b></div>`;
  }

  function buildSummary(people) {
    return {
      attending: people.filter((person) => person.attending === true).length,
      declined: people.filter((person) => person.attending === false).length
    };
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
    showError("The RSVP page could not start. Please contact Matt or Cara directly.");
  });
})();
