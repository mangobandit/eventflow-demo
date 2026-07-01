(() => {
  "use strict";

  stripTrackingParams();

  const config = window.MXC_CONFIG || {};
  const CHECK_IN_ENABLED = true;
  const menuButton = document.querySelector(".menu-button");
  const publicNav = document.querySelector(".public-nav");

  /* index.html is the single source of the built-in guest FAQs. They are read
     from the markup once, then live FAQs published from the couple portal are
     merged in by topic so duplicated questions cannot appear. */
  const STATIC_FAQS = [...document.querySelectorAll("#faq-list details")].map((entry) => ({
    title: entry.querySelector("summary")?.textContent.trim() || "",
    body: entry.querySelector("p")?.textContent.trim() || ""
  }));

  installCheckInLinks();
  installFinalWeekBanner();

  menuButton?.addEventListener("click", () => {
    const open = document.body.classList.toggle("menu-open");
    menuButton.setAttribute("aria-expanded", String(open));
    menuButton.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  });

  publicNav?.addEventListener("click", (event) => {
    if (event.target.closest("a")) {
      document.body.classList.remove("menu-open");
      menuButton?.setAttribute("aria-expanded", "false");
    }
  });

  const updateCountdowns = () => {
    const now = Date.now();
    document.querySelectorAll("[data-countdown]").forEach((card) => {
      const target = Date.parse(card.dataset.countdown || "");
      const valueElement = card.querySelector("[data-days]");
      const labelElement = card.querySelector("small");
      if (!valueElement || Number.isNaN(target)) return;
      const remainingMs = target - now;
      if (remainingMs <= 0) {
        valueElement.textContent = "0";
        labelElement.textContent = "celebration day";
      } else if (remainingMs <= 48 * 3_600_000) {
        const hours = Math.max(Math.ceil(remainingMs / 3_600_000), 1);
        valueElement.textContent = hours.toLocaleString("en-GB");
        labelElement.textContent = hours === 1 ? "hour to go" : "hours to go";
      } else {
        const days = Math.ceil(remainingMs / 86_400_000);
        valueElement.textContent = days.toLocaleString("en-GB");
        labelElement.textContent = "days to go";
      }
    });
  };
  updateCountdowns();
  window.setInterval(() => {
    updateCountdowns();
    installFinalWeekBanner();
  }, 60_000);

  function installFinalWeekBanner() {
    if (document.querySelector(".final-week-banner")) return;
    const now = Date.now();
    const upcoming = [...document.querySelectorAll("[data-countdown]")]
      .map((card) => ({
        label: card.querySelector("span")?.textContent || "The",
        days: Math.ceil((Date.parse(card.dataset.countdown || "") - now) / 86_400_000)
      }))
      .find((wedding) => wedding.days >= 0 && wedding.days <= 7);
    if (!upcoming) return;
    const banner = document.createElement("aside");
    banner.className = "final-week-banner";
    const countdown = upcoming.days === 0 ? "It's today!" : `${upcoming.days} day${upcoming.days === 1 ? "" : "s"} to go.`;
    banner.innerHTML = `<p><b>${escapeHtml(upcoming.label)} wedding week.</b> ${countdown} Please confirm your household and watch Live updates for final transport and timing notes.</p><a class="button button-light" href="${getCheckInHref()}">Open Guest Check-In</a>`;
    document.querySelector(".public-header")?.insertAdjacentElement("afterend", banner);
  }

  const tabButtons = [...document.querySelectorAll("[data-tab]")];
  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const targetId = button.dataset.tab;
      tabButtons.forEach((item) => {
        const active = item === button;
        item.classList.toggle("active", active);
        item.setAttribute("aria-selected", String(active));
      });
      document.querySelectorAll(".experience-panel").forEach((panel) => {
        const active = panel.id === targetId;
        panel.classList.toggle("active", active);
        panel.hidden = !active;
      });
    });
  });

  const renderPublishedContent = (allRows) => {
    /* Row Level Security already hides scheduled rows from the anon client;
       this filter is defence in depth for cached or local data. */
    const now = Date.now();
    const rows = allRows.filter((row) => !row.publish_at || Date.parse(row.publish_at) <= now);
    const announcements = rows.filter((row) => row.section === "announcement");
    const faqs = rows.filter((row) => row.section === "faq");
    const travelNotes = rows.filter((row) => row.section === "travel");
    const stayNotes = rows.filter((row) => row.section === "stay");
    const generalNotes = rows.filter((row) => row.section === "general");

    if (announcements.length) {
      const wrapper = document.getElementById("announcement-list");
      const latest = announcements[0];
      wrapper.innerHTML = `
        <div>
          <span class="announcement-kicker">${escapeHtml(labelAnnouncementCountry(latest.country))}</span>
          <h2 id="updates-title">${escapeHtml(latest.title)}</h2>
        </div>
        <p>${formatBody(latest.body)}</p>`;
    }

    const history = document.getElementById("announcement-history");
    if (history) {
      const earlier = announcements
        .slice(1)
        .sort((a, b) => Date.parse(b.updated_at || 0) - Date.parse(a.updated_at || 0))
        .slice(0, 2);
      history.hidden = earlier.length === 0;
      history.innerHTML = earlier.map((row) => `
        <article>
          <span>${escapeHtml(labelAnnouncementCountry(row.country))} · ${formatShortDate(row.updated_at)}</span>
          <h3>${escapeHtml(row.title)}</h3>
          <p>${formatBody(row.body)}</p>
        </article>`).join("");
    }

    renderFaqList(faqs);
    renderLiveNotes("travel-live-notes", travelNotes);
    renderLiveNotes("stay-live-notes", stayNotes);
    renderLiveNotes("general-live-notes", generalNotes);

    const newest = rows[0]?.updated_at;
    if (newest) {
      const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(new Date(newest));
      const updated = document.getElementById("last-updated");
      if (updated) updated.textContent = `Guest guide · updated ${date}`;
    }
  };

  const loadPublishedContent = async () => {
    if (!config.supabaseUrl || !config.supabaseAnonKey || !window.supabase?.createClient) return;
    try {
      const client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false }
      });
      const { data, error } = await client
        .from("content_blocks")
        .select("slug, section, country, title, body, sort_order, publish_at, updated_at")
        .eq("published", true)
        .order("sort_order", { ascending: true })
        .order("updated_at", { ascending: false });
      if (error) throw error;
      renderPublishedContent(data || []);
    } catch (error) {
      console.warn("Guest updates are using the built-in fallback content.", error.message);
    }
  };

  function renderFaqList(liveFaqs = []) {
    const faqList = document.getElementById("faq-list");
    if (!faqList || !liveFaqs.length) return;
    const seen = new Set();
    const finalFaqs = [];
    [...STATIC_FAQS, ...liveFaqs.map((faq) => ({ title: faq.title, body: faq.body }))].forEach((faq) => {
      const key = normalizeFaqTitle(faq.title);
      if (!faq.title || !faq.body || seen.has(key)) return;
      seen.add(key);
      finalFaqs.push(faq);
    });
    faqList.innerHTML = finalFaqs.map((faq) => `<details><summary>${escapeHtml(faq.title)}</summary><p>${formatBody(faq.body)}</p></details>`).join("");
  }

  function normalizeFaqTitle(title) {
    const normalized = String(title || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();
    if (/child|children|kid|kids|baby|babies|family|families/.test(normalized)) return "children";
    if (/theme|rodeo|western/.test(normalized)) return "theme";
    if (/wear|dress|outfit|boots|denim|leather|hat/.test(normalized)) return "wear";
    if (/timing|times|schedule|start|late|punctual/.test(normalized)) return "timing";
    if (/transport|shuttle|bus|pickup/.test(normalized)) return "transport";
    if (/parking|park/.test(normalized)) return "parking";
    if (/photo|photos|post|online|social|instagram/.test(normalized)) return "photos";
    if (/walls/.test(normalized)) return "walls";
    if (/flight|flights|book/.test(normalized)) return "flights";
    if (/food|bbq|braai|meal|eat/.test(normalized)) return "food";
    if (/gift|cash|eft|bank|registry|present/.test(normalized)) return "gifts";
    if (/same location|one location|same venue|location/.test(normalized)) return "same-location";
    if (/indoor|indoors|outdoor|outdoors|tent|weather|rain/.test(normalized)) return "indoors-outdoors";
    if (/early|arrive|arrival/.test(normalized)) return "arrival";
    if (/expect|happen|games|entertainment/.test(normalized)) return "expect";
    return normalized;
  }

  function installCheckInLinks() {
    if (!CHECK_IN_ENABLED) return;
    if (document.querySelector('[data-checkin-entry]')) return;
    const checkInHref = getCheckInHref();
    const navLink = document.createElement("a");
    navLink.href = checkInHref;
    navLink.textContent = "Guest Check-In";
    navLink.dataset.checkinEntry = "nav";
    const faqLink = publicNav?.querySelector('a[href="#faq"]');
    publicNav?.insertBefore(navLink, faqLink || null);

    const heroActions = document.querySelector(".hero-actions");
    if (heroActions) {
      const heroLink = document.createElement("a");
      heroLink.className = "button button-dark";
      heroLink.href = checkInHref;
      heroLink.textContent = "Guest check-in";
      heroLink.dataset.checkinEntry = "hero";
      heroActions.insertBefore(heroLink, heroActions.firstChild);
    }

    const mobileNav = document.querySelector(".mobile-nav");
    if (mobileNav) {
      const mobileLink = document.createElement("a");
      mobileLink.href = checkInHref;
      mobileLink.textContent = "Check-In";
      mobileLink.dataset.checkinEntry = "mobile";
      const portal = mobileNav.querySelector('a[href="planner.html"]');
      mobileNav.insertBefore(mobileLink, portal || null);
      mobileNav.style.gridTemplateColumns = "repeat(5, 1fr)";
    }

    const footerMeta = document.querySelector(".footer-meta");
    if (footerMeta) {
      const footerLink = document.createElement("a");
      footerLink.href = checkInHref;
      footerLink.textContent = "Guest Check-In";
      footerLink.dataset.checkinEntry = "footer";
      footerMeta.insertBefore(footerLink, footerMeta.firstChild);
    }
  }

  function getCheckInHref() {
    const localHost = ["localhost", "127.0.0.1", "::1", "[::1]", ""].includes(window.location.hostname);
    const canUseLocalDemo = (localHost || window.location.protocol === "file:") && (!config.supabaseUrl || !config.supabaseAnonKey);
    return canUseLocalDemo ? "rsvp.html?demo=1" : "rsvp.html";
  }

  function stripTrackingParams() {
    if (!history.replaceState) return;
    const url = new URL(window.location.href);
    const trackingKeys = [...url.searchParams.keys()].filter((key) => {
      const lower = key.toLowerCase();
      return lower.startsWith("utm_") || ["fbclid", "gclid", "mc_cid", "mc_eid", "igshid", "ref", "source"].includes(lower);
    });
    if (!trackingKeys.length) return;
    trackingKeys.forEach((key) => url.searchParams.delete(key));
    const clean = `${url.pathname}${url.search}${url.hash}`;
    history.replaceState(null, document.title, clean || "/");
  }

  function renderLiveNotes(containerId, notes) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.hidden = notes.length === 0;
    container.innerHTML = notes.map((note) => `
      <article class="live-note-card">
        <span>${escapeHtml(note.country === "south_africa" ? "South Africa" : note.country === "spain" ? "Spain" : "Both weddings")}</span>
        <h3>${escapeHtml(note.title)}</h3>
        <p>${formatBody(note.body)}</p>
      </article>`).join("");
  }

  function labelAnnouncementCountry(country) {
    return country === "south_africa" ? "South Africa" : country === "spain" ? "Spain" : "Planning update";
  }

  function formatShortDate(value) {
    const parsed = Date.parse(value || "");
    if (Number.isNaN(parsed)) return "earlier";
    return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(parsed));
  }

  function escapeHtml(value) {
    return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }

  function formatBody(value) {
    return escapeHtml(value).replaceAll("\n", "<br>");
  }

  loadPublishedContent();
  const refreshMinutes = Math.max(Number(config.guestContentRefreshMinutes) || 15, 5);
  window.setInterval(loadPublishedContent, refreshMinutes * 60_000);

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch((error) => console.warn("Service worker registration skipped", error));
  }
})();
