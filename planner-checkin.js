/* Guest Check-In view. Rendered by renderAll() like every other planner view;
   the nav button and panel live in planner.html. */

  const CHECKIN_COPY_MESSAGE = "Hi, quick wedding check-in for Matt & Cara - please confirm your household here in the few days before the celebration so we can finalise numbers, transport and food: [link]";
  const CHECKIN_VENUES = [
    ["spain", "Spain", "Finca Mesa Jardin"],
    ["south_africa", "South Africa", "Mission House"]
  ];
  const CHECKIN_FILTERS = [
    ["needs_checkin", "Still to check in"],
    ["attending", "Still attending"],
    ["pending", "No response / TBC"],
    ["declined", "Can't make it"],
    ["all", "All guests"]
  ];

  let activeCheckinFilter = "needs_checkin";

  function renderCheckin() {
    const root = document.getElementById("checkin-root");
    if (!root) return;
    const guests = state.data.guests || [];
    const counts = summarizeCheckin(guests);
    const visibleRows = guests.filter(matchesCheckinFilter).sort(sortCheckinGuests);
    const attention = guests.filter((guest) => guestNeedsCheckIn(guest)).sort(sortCheckinGuests).slice(0, 8);

    root.innerHTML = `
      <div class="checkin-kpis">
        ${checkinKpi("Total invited", counts.total, "secure guest rows")}
        ${checkinKpi("Still attending", counts.attending, "RSVP yes or checked in")}
        ${checkinKpi("Can't make it", counts.declined, "declined or updated")}
        ${checkinKpi("Need RSVP/check-in", counts.pending, "no response or TBC")}
        ${checkinKpi("Check-ins received", counts.confirmed, "few-day confirmations")}
        ${checkinKpi("Still to check in", counts.stillToCheckIn, "action list")}
      </div>
      <div class="checkin-grid">
        <article class="panel">
          <div class="panel-head"><h3>Guests by venue</h3><button type="button" data-jump="guests">Open guests</button></div>
          <div class="checkin-venue-grid">${CHECKIN_VENUES.map(([key, label, venue]) => checkinVenueBlock(key, label, venue, summarizeCheckin(guests.filter((guest) => guest.celebration === key)))).join("")}</div>
        </article>
        <article class="panel checkin-copy">
          <div class="panel-head"><h3>Manual check-in nudge</h3></div>
          <textarea readonly>${CHECKIN_COPY_MESSAGE}</textarea>
          <button class="primary-action" id="copy-checkin-message-inline" type="button">Copy message</button>
          <div class="checkin-attention">${attention.length ? attention.map(checkinRow).join("") : '<div class="empty-state">No guests currently need a pre-wedding check-in.</div>'}</div>
        </article>
      </div>
      <article class="panel guest-list-tracker">
        <div class="panel-head">
          <h3>Guest list tracker</h3>
          <div class="checkin-filters">${CHECKIN_FILTERS.map(checkinFilterButton).join("")}</div>
        </div>
        ${checkinGroupedRows(visibleRows)}
      </article>`;

    root.querySelector("#copy-checkin-message-inline")?.addEventListener("click", copyCheckinMessage);
    root.querySelectorAll("[data-jump]").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.jump)));
    root.querySelectorAll("[data-checkin-filter]").forEach((button) => button.addEventListener("click", () => {
      activeCheckinFilter = button.dataset.checkinFilter;
      renderCheckin();
    }));
    root.querySelectorAll(".checkin-row[data-id]").forEach((item) => item.addEventListener("click", () => {
      const record = state.data.guests.find((guest) => guest.id === item.dataset.id);
      if (record) openEntity("guests", record);
    }));
  }

  function summarizeCheckin(guests) {
    return guests.reduce((acc, guest) => {
      const status = attendanceStatus(guest);
      acc.total += 1;
      if (status === "attending") acc.attending += 1;
      else if (status === "declined") acc.declined += 1;
      else acc.pending += 1;
      if (guestConfirmed(guest)) acc.confirmed += 1;
      if (guestNeedsCheckIn(guest)) acc.stillToCheckIn += 1;
      return acc;
    }, { total: 0, attending: 0, declined: 0, pending: 0, confirmed: 0, stillToCheckIn: 0 });
  }

  function attendanceStatus(guest) {
    if (guest.check_in_status === "cant_make_it" || guest.rsvp_status === "no") return "declined";
    if (guest.check_in_status === "checked_in" || guest.rsvp_status === "yes") return "attending";
    if (guest.rsvp_status === "tbc") return "tbc";
    return "no_response";
  }

  function guestConfirmed(guest) {
    return Boolean(guest.checked_in_at || guest.last_confirmed_at || guest.check_in_status === "checked_in" || guest.check_in_status === "cant_make_it");
  }

  function guestNeedsCheckIn(guest) {
    return attendanceStatus(guest) !== "declined" && !guestConfirmed(guest);
  }

  function matchesCheckinFilter(guest) {
    const status = attendanceStatus(guest);
    if (activeCheckinFilter === "all") return true;
    if (activeCheckinFilter === "needs_checkin") return guestNeedsCheckIn(guest);
    if (activeCheckinFilter === "attending") return status === "attending";
    if (activeCheckinFilter === "declined") return status === "declined";
    if (activeCheckinFilter === "pending") return status === "tbc" || status === "no_response";
    return true;
  }

  function checkinVenueBlock(key, label, venue, counts) {
    const progress = counts.total ? Math.round((counts.confirmed / counts.total) * 100) : 0;
    return `<section class="checkin-venue-block">
      <h4>${escapeHtml(label)}</h4>
      <p>${escapeHtml(venue)} - ${counts.total} guest rows</p>
      <div class="checkin-meter" aria-label="${escapeHtml(label)} check-in progress"><i style="width:${progress}%"></i></div>
      <div class="checkin-stat-grid">
        ${checkinStat("Still attending", counts.attending)}
        ${checkinStat("Still to check in", counts.stillToCheckIn)}
        ${checkinStat("No response / TBC", counts.pending)}
        ${checkinStat("Can't make it", counts.declined)}
      </div>
    </section>`;
  }

  function checkinGroupedRows(rows) {
    if (!rows.length) return '<div class="empty-state">No guests match this tracker filter.</div>';
    return CHECKIN_VENUES.map(([key, label]) => {
      const venueRows = rows.filter((guest) => guest.celebration === key);
      if (!venueRows.length) return "";
      return `<section class="checkin-list-section"><h4>${escapeHtml(label)}</h4><div class="checkin-list">${venueRows.map(checkinRow).join("")}</div></section>`;
    }).join("");
  }

  function checkinRow(guest) {
    const attendance = attendanceStatus(guest);
    const confirmed = guestConfirmed(guest);
    const checkinLabel = confirmed ? (guest.check_in_status === "cant_make_it" ? "Confirmed out" : "Checked in") : "Needs check-in";
    const detail = [
      guest.party_name || "No party label",
      guest.transport ? `Transport: ${guest.transport}` : "Transport TBC",
      guest.accommodation ? `Stay: ${guest.accommodation}` : "Stay TBC",
      guest.last_confirmed_at || guest.checked_in_at ? `Confirmed: ${formatCheckinDateTime(guest.last_confirmed_at || guest.checked_in_at)}` : ""
    ].filter(Boolean).join(" - ");
    return `<div class="checkin-row" data-id="${escapeHtml(guest.id)}">
      <div><b>${escapeHtml(guest.name || guest.party_name || "Guest")}</b><small>${escapeHtml(detail)}</small></div>
      <div class="checkin-row-states">${attendancePill(attendance)}${checkinPill(checkinLabel, confirmed ? "good" : "warn")}</div>
    </div>`;
  }

  function attendancePill(status) {
    if (status === "attending") return checkinPill("Still attending", "good");
    if (status === "declined") return checkinPill("Can't make it", "bad");
    if (status === "tbc") return checkinPill("TBC", "warn");
    return checkinPill("No response", "muted");
  }

  function checkinFilterButton([value, label]) {
    return `<button class="checkin-filter ${activeCheckinFilter === value ? "active" : ""}" type="button" data-checkin-filter="${escapeHtml(value)}">${escapeHtml(label)}</button>`;
  }

  function checkinKpi(label, value, note) {
    return `<article class="checkin-kpi"><span>${escapeHtml(label)}</span><b>${Number(value || 0).toLocaleString("en-GB")}</b><small>${escapeHtml(note)}</small></article>`;
  }

  function checkinStat(label, value) {
    return `<div class="checkin-stat"><span>${escapeHtml(label)}</span><b>${Number(value || 0).toLocaleString("en-GB")}</b></div>`;
  }

  function checkinPill(label, tone) {
    return `<span class="checkin-pill ${escapeHtml(tone)}">${escapeHtml(label)}</span>`;
  }

  function sortCheckinGuests(a, b) {
    return String(a.celebration || "").localeCompare(String(b.celebration || "")) ||
      String(a.party_name || "").localeCompare(String(b.party_name || "")) ||
      String(a.name || "").localeCompare(String(b.name || ""));
  }

  function formatCheckinDateTime(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
  }

  async function copyCheckinMessage() {
    try {
      await navigator.clipboard.writeText(CHECKIN_COPY_MESSAGE);
      toast("Check-in message copied.");
    } catch (_error) {
      window.prompt("Copy check-in message", CHECKIN_COPY_MESSAGE);
    }
  }

  document.getElementById("copy-checkin-message")?.addEventListener("click", copyCheckinMessage);
