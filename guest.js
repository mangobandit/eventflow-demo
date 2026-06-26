(() => {
  "use strict";

  stripTrackingParams();

  const config = window.MXC_CONFIG || {};
  const menuButton = document.querySelector(".menu-button");
  const publicNav = document.querySelector(".public-nav");

  installRodeoTheme();
  installRsvpLinks();

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
      const staticFaqs = [...list.querySelectorAll("details:not([data-live])")];
      list.innerHTML = "";
      staticFaqs.forEach((faq) => list.appendChild(faq));
      faqs.forEach((faq) => {
        const details = document.createElement("details");
        details.dataset.live = "true";
        details.innerHTML = `<summary>${escapeHtml(faq.title)}</summary><p>${formatBody(faq.body)}</p>`;
        list.appendChild(details);
      });
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
    if (faqList && !faqList.querySelector('[data-rodeo-faq="true"]')) {
      const details = document.createElement("details");
      details.dataset.rodeoFaq = "true";
      details.open = true;
      details.innerHTML = "<summary>What is the wedding theme?</summary><p>We're hosting Rodeo-style wedding celebrations built around Western music and great BBQ food. Cowboy boots, hats, leather and denim are welcome, and encouraged.</p>";
      faqList.prepend(details);
    }
  }

  function installRsvpLinks() {
    if (document.querySelector('[data-rsvp-entry]')) return;

    const navLink = document.createElement("a");
    navLink.href = "rsvp.html";
    navLink.textContent = "RSVP";
    navLink.dataset.rsvpEntry = "nav";
    const faqLink = publicNav?.querySelector('a[href="#faq"]');
    publicNav?.insertBefore(navLink, faqLink || null);

    const heroActions = document.querySelector(".hero-actions");
    if (heroActions) {
      const heroLink = document.createElement("a");
      heroLink.className = "button button-dark";
      heroLink.href = "rsvp.html";
      heroLink.textContent = "Open your RSVP";
      heroLink.dataset.rsvpEntry = "hero";
      heroActions.insertBefore(heroLink, heroActions.firstChild);
    }

    const mobileNav = document.querySelector(".mobile-nav");
    if (mobileNav) {
      const mobileLink = document.createElement("a");
      mobileLink.href = "rsvp.html";
      mobileLink.textContent = "RSVP";
      mobileLink.dataset.rsvpEntry = "mobile";
      const portal = mobileNav.querySelector('a[href="planner.html"]');
      mobileNav.insertBefore(mobileLink, portal || null);
      mobileNav.style.gridTemplateColumns = "repeat(5, 1fr)";
    }

    const footerMeta = document.querySelector(".footer-meta");
    if (footerMeta) {
      const footerLink = document.createElement("a");
      footerLink.href = "rsvp.html";
      footerLink.textContent = "Guest RSVP";
      footerLink.dataset.rsvpEntry = "footer";
      footerMeta.insertBefore(footerLink, footerMeta.firstChild);
    }
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
  const refreshMinutes = Math.max(Number(config.guestContentRefreshMinutes) || 15, 5);
  window.setInterval(loadPublishedContent, refreshMinutes * 60_000);

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch((error) => console.warn("Service worker registration skipped", error));
  }
})();
