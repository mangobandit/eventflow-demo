(() => {
  "use strict";

  stripTrackingParams();

  const config = window.MXC_CONFIG || {};
  const menuButton = document.querySelector(".menu-button");
  const publicNav = document.querySelector(".public-nav");
  const CANONICAL_FAQS = [
    {
      title: "What is the wedding theme?",
      body: "We are hosting Rodeo-style wedding celebrations built around Western music and great BBQ food. Cowboy boots, hats, leather, denim, belts, bolo ties, fringe, country shirts and country dresses are welcome and encouraged."
    },
    {
      title: "Can children attend?",
      aliases: ["Can children come?", "Are children invited?"],
      body: "Please follow the invitation addressed to your household. Some children may be specifically included, but the headcount has to stay controlled for venue, seating and catering reasons. Message Matt or Cara directly if anything is unclear."
    },
    {
      title: "Can we bring a plus-one?",
      body: "Please only bring the people named on your invitation or check-in link. If something changes, message Matt or Cara before making travel plans around an extra guest."
    },
    {
      title: "When should we book flights?",
      body: "Once your attendance is confirmed, start tracking routes and book when the itinerary and price feel right. Flexible fares are best where possible because regional schedules can change."
    },
    {
      title: "Where should we stay?",
      body: "For Spain, Arcos or Jerez are the easiest bases. For South Africa, Howick or the Midlands Meander area are the most practical. Final pickup points will depend on where guests stay."
    },
    {
      title: "Will there be wedding-day transport?",
      body: "We are planning route groups for Spain and South Africa. Final pickup locations depend on guest accommodation and the final number needing seats, so please answer transport questions in the check-in link."
    },
    {
      title: "What should we wear?",
      body: "Think polished Rodeo Western: boots, hats, denim, leather, belts, bolo ties, fringe, country shirts and dresses that can handle gardens, lawns and a dancefloor. Avoid stilettos or shoes that struggle on grass."
    },
    {
      title: "When will final timings be shared?",
      body: "The core schedule is shown above. Exact transport, arrival, weather and venue notes will be refreshed closer to each wedding week and again around the 24-hour check-in window."
    },
    {
      title: "What happens 24 hours before?",
      body: "We will send a guest check-in link or code so each household can confirm who is still coming, whether transport is needed and whether anything has changed. Think of it like an airline check-in for the wedding headcount."
    },
    {
      title: "What if our plans change?",
      body: "Use your check-in link to update the household response when it is available. For anything urgent, contact Matt or Cara directly so the final headcount, catering and transport list can be corrected."
    }
  ];

  installCanonicalFaqs();
  installRodeoTheme();
  installCheckinLinks();

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
      const dayElement = card.querySelector("[data-days]");
      if (!dayElement || Number.isNaN(target)) return;
      const remaining = Math.ceil((target - now) / 86_400_000);
      dayElement.textContent = remaining > 0 ? remaining.toLocaleString("en-GB") : "0";
      if (remaining <= 0) card.querySelector("small").textContent = "celebration day";
    });
  };
  updateCountdowns();
  window.setInterval(updateCountdowns, 3_600_000);

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

  const renderPublishedContent = (rows) => {
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
          <span class="announcement-kicker">${escapeHtml(latest.country || "Planning update")}</span>
          <h2 id="updates-title">${escapeHtml(latest.title)}</h2>
        </div>
        <p>${formatBody(latest.body)}</p>`;
    }

    if (faqs.length) {
      const list = document.getElementById("faq-list");
      const seenFaqs = installCanonicalFaqs();
      faqs.forEach((faq) => {
        const key = normalizeFaqTitle(faq.title);
        if (!list || !key || seenFaqs.has(key)) return;
        const details = document.createElement("details");
        details.dataset.live = "true";
        details.dataset.faqKey = key;
        details.innerHTML = `<summary>${escapeHtml(faq.title)}</summary><p>${formatBody(faq.body)}</p>`;
        list.appendChild(details);
        seenFaqs.add(key);
      });
      dedupeFaqList(list);
    }

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
        .select("slug, section, country, title, body, sort_order, updated_at")
        .eq("published", true)
        .order("sort_order", { ascending: true })
        .order("updated_at", { ascending: false });
      if (error) throw error;
      renderPublishedContent(data || []);
    } catch (error) {
      console.warn("Guest updates are using the built-in fallback content.", error.message);
    }
  };

  function installRodeoTheme() {
    const heroDeck = document.querySelector(".hero-deck");
    if (heroDeck) {
      heroDeck.textContent = "We're embracing our love of Western music and great BBQ food with Rodeo-style wedding celebrations in Spain and South Africa.";
    }

    const introHeading = document.querySelector(".intro-section h2");
    if (introHeading) introHeading.innerHTML = "Western music, great BBQ,<br>and the people we love.";
    const introCopy = document.querySelector(".intro-copy");
    if (introCopy) introCopy.textContent = "Both celebrations will carry the same Rodeo-style spirit: relaxed Western energy, good food, good music, cowboy boots, hats, leather and denim welcome.";

    const liveUpdates = document.getElementById("live-updates");
    if (liveUpdates && !document.getElementById("rodeo-theme-note")) {
      const theme = document.createElement("div");
      theme.id = "rodeo-theme-note";
      theme.className = "live-note-grid live-note-grid-dark";
      theme.innerHTML = `
        <article class="live-note-card">
          <span>Wedding theme</span>
          <h3>Rodeo-style celebration</h3>
          <p>We're embracing our love of Western music and great BBQ food by hosting Rodeo-style weddings. Cowboy boots, hats, leather and denim are welcome, and encouraged.</p>
        </article>
        <article class="live-note-card">
          <span>What to wear</span>
          <h3>Western, comfortable, celebration-ready</h3>
          <p>Think boots, hats, denim, leather, belts, bolo ties, fringe, country shirts and dresses that can handle gardens, lawns and a dancefloor.</p>
        </article>`;
      liveUpdates.appendChild(theme);
    }

    const eventBlocks = [
      { selector: "#spain", copy: "Spain will bring the Rodeo spirit to the Andalusian countryside: Western music, BBQ food, boots, hats, denim and leather against a finca backdrop." },
      { selector: "#south-africa", copy: "South Africa will carry the same Rodeo-style energy in the KZN Midlands: great BBQ food, Western music, cowboy boots, hats, leather and denim encouraged." }
    ];

    eventBlocks.forEach(({ selector, copy }) => {
      const block = document.querySelector(selector);
      if (!block) return;
      const lead = block.querySelector(".event-lead");
      if (lead) lead.textContent = copy;
      const dress = [...block.querySelectorAll("dt")].find((item) => item.textContent.trim().toLowerCase() === "dress feel");
      if (dress?.nextElementSibling) dress.nextElementSibling.textContent = "Rodeo Western";
      const note = block.querySelector(".note-box");
      if (note) note.innerHTML = "<b>Rodeo-style dress code.</b> Cowboy boots, hats, leather and denim are welcome, and encouraged. Dress for good BBQ, Western music, outdoor spaces and a proper dancefloor.";
    });

    const practicalIntro = document.querySelector(".practical-intro h2");
    if (practicalIntro) practicalIntro.innerHTML = "Pack for the Rodeo,<br>not just the photograph.";
    const practicalCards = [...document.querySelectorAll(".practical-grid article")];
    if (practicalCards[2]) {
      practicalCards[2].querySelector("h3").textContent = "Boots, hats, denim";
      practicalCards[2].querySelector("p").textContent = "Cowboy boots, hats, leather and denim are welcome and encouraged. Choose shoes that work on gardens, lawns and country surfaces.";
    }

    const faqList = document.getElementById("faq-list");
    if (faqList && !hasFaq(faqList, "What is the wedding theme?")) {
      const details = document.createElement("details");
      details.dataset.rodeoFaq = "true";
      details.dataset.faqKey = normalizeFaqTitle("What is the wedding theme?");
      details.innerHTML = "<summary>What is the wedding theme?</summary><p>We're hosting Rodeo-style wedding celebrations built around Western music and great BBQ food. Cowboy boots, hats, leather and denim are welcome, and encouraged.</p>";
      faqList.prepend(details);
    }
    dedupeFaqList(faqList);
  }

  function installCheckinLinks() {
    if (document.querySelector('[data-checkin-entry]')) return;

    const navLink = document.createElement("a");
    navLink.href = "rsvp.html";
    navLink.textContent = "Check-in";
    navLink.dataset.checkinEntry = "nav";
    const faqLink = publicNav?.querySelector('a[href="#faq"]');
    publicNav?.insertBefore(navLink, faqLink || null);

    const heroActions = document.querySelector(".hero-actions");
    if (heroActions) {
      const heroLink = document.createElement("a");
      heroLink.className = "button button-dark";
      heroLink.href = "rsvp.html";
      heroLink.textContent = "Guest check-in";
      heroLink.dataset.checkinEntry = "hero";
      heroActions.insertBefore(heroLink, heroActions.firstChild);
    }

    const mobileNav = document.querySelector(".mobile-nav");
    if (mobileNav) {
      const mobileLink = document.createElement("a");
      mobileLink.href = "rsvp.html";
      mobileLink.textContent = "Check-in";
      mobileLink.dataset.checkinEntry = "mobile";
      const portal = mobileNav.querySelector('a[href="planner.html"]');
      mobileNav.insertBefore(mobileLink, portal || null);
      mobileNav.style.gridTemplateColumns = "repeat(5, 1fr)";
    }

    const footerMeta = document.querySelector(".footer-meta");
    if (footerMeta) {
      const footerLink = document.createElement("a");
      footerLink.href = "rsvp.html";
      footerLink.textContent = "Guest check-in";
      footerLink.dataset.checkinEntry = "footer";
      footerMeta.insertBefore(footerLink, footerMeta.firstChild);
    }
  }

  function installCanonicalFaqs() {
    const list = document.getElementById("faq-list");
    if (!list) return new Set();
    list.innerHTML = "";
    CANONICAL_FAQS.forEach((faq) => {
      const details = document.createElement("details");
      details.dataset.faqKey = normalizeFaqTitle(faq.title);
      details.dataset.canonicalFaq = "true";
      details.innerHTML = `<summary>${escapeHtml(faq.title)}</summary><p>${formatBody(faq.body)}</p>`;
      list.appendChild(details);
    });
    return dedupeFaqList(list);
  }

  function normalizeFaqTitle(value) {
    const aliases = new Map([
      ["can children come", "can children attend"],
      ["are children invited", "can children attend"],
      ["can kids attend", "can children attend"],
      ["can kids come", "can children attend"],
      ["what is wedding theme", "what is the wedding theme"],
      ["what is the theme", "what is the wedding theme"],
      ["rsvp", "what happens 24 hours before"],
      ["guest rsvp", "what happens 24 hours before"],
      ["guest check in", "what happens 24 hours before"],
      ["guest checkin", "what happens 24 hours before"]
    ]);
    const key = String(value || "")
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    return aliases.get(key) || key;
  }

  function getFaqTitle(details) {
    return details?.dataset?.faqKey || details?.querySelector("summary")?.textContent || "";
  }

  function hasFaq(list, title) {
    const key = normalizeFaqTitle(title);
    return [...(list?.querySelectorAll("details") || [])].some((details) => normalizeFaqTitle(getFaqTitle(details)) === key);
  }

  function dedupeFaqList(list) {
    const seen = new Set();
    if (!list) return seen;
    [...list.querySelectorAll("details")].forEach((details) => {
      const key = normalizeFaqTitle(getFaqTitle(details));
      if (!key) return;
      if (seen.has(key)) {
        details.remove();
        return;
      }
      details.dataset.faqKey = key;
      seen.add(key);
    });
    return seen;
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

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatBody(value) {
    return escapeHtml(value).replaceAll("\n", "<br>");
  }

  loadPublishedContent();
})();
