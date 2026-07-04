(() => {
  "use strict";

  stripTrackingParams();

  const config = window.MXC_CONFIG || {};
  const CHECK_IN_ENABLED = false;
  const menuButton = document.querySelector(".menu-button");
  const publicNav = document.querySelector(".public-nav");

  const BUILT_IN_FAQS = [
    { title: "What is the wedding theme?", body: "Rodeo-style wedding celebrations built around Western music and great BBQ food. Cowboy boots, hats, leather and denim are welcome, and encouraged. Don't have a cowboy hat? We'll provide one for you if you'd like one." },
    { title: "What can I expect on the day?", body: "Food, drinks, laughs and a relaxed Rodeo-style celebration. Depending on which wedding you are attending, there will be small Western-inspired games and entertainment, such as horseshoe toss and other fun touches to keep the day moving." },
    { title: "What kind of food will there be?", body: "Expect a Western-inspired feast: BBQ and braai-style meats, with much of the food cooked over open fire. There will be options for lighter grazers as well as those who want something more hearty." },
    { title: "What should we wear?", body: "The dress feel is Rodeo Western. Cowboy boots, hats, leather, denim, belts, bolo ties, fringe, country shirts and country-style dresses are welcome and encouraged. Choose shoes that work on gardens, lawns and a dancefloor." },
    { title: "Is everything in the same location?", body: "Yes. The ceremony, food, drinks and celebration are all planned around the same venue, so once you arrive you can settle in and enjoy the day without moving between locations." },
    { title: "Is the wedding indoors or outdoors?", body: "The wedding has a country/Rodeo feel and is planned as an outdoor celebration. If the weather turns, there will be cover under a tent or suitable shelter so the day can keep flowing comfortably." },
    { title: "How early can I arrive?", body: "You may arrive up to two hours before the official start time if you need to. Please note that the bar will remain closed until the official kick-off time, so arriving early is mainly for settling in and avoiding a rush." },
    { title: "What are the timings for the day?", body: "We will keep the day running with clear start and stop times, so please arrive promptly and avoid being late. If you want a drink before the ceremony, please grab it before the bar closes for the ceremony start. Final timings will be shared closer to the day." },
    { title: "Will there be wedding-day transport?", body: "We are planning route groups for Spain and South Africa. Final pickup locations depend on where guests stay, so please answer the check-in transport questions promptly when they are sent." },
    { title: "Is there parking at the venue?", body: "Yes, there will be parking available at the venue. We will share any final parking or arrival notes closer to the wedding date." },
    { title: "Can children come?", body: "Children are very welcome. We will provide things to help keep them entertained, and there will be people nearby to keep a friendly eye on them, but parents and guardians remain responsible for their children throughout the celebration." },
    { title: "What gifts should I bring?", body: "Your presence is the main thing. If you would like to give a gift, a cash or EFT contribution is most helpful and very appreciated. We can accept EUR or ZAR; please message Matt or Cara privately for the right banking details." },
    { title: "Can I take photos or post online?", body: "You are welcome to take a few personal photos, but please do not post the day publicly online without our permission. This is a private, intimate celebration and we have invested in a professional photography team. We will also use a private social wall, Walls.io, so guests can share moments in a more controlled and private way." },
    { title: "What is Walls.io?", body: "Walls.io is a private social media wall for the wedding. Instead of everyone posting publicly, guests can share selected photos and messages into one private wedding feed. It lets us collect the fun moments while keeping the day more intimate and controlled. We will share the details closer to the time." },
    { title: "When should we book flights?", body: "Once your attendance is confirmed, begin tracking routes and book when the itinerary and price feel right. Prefer flexible fares where possible because regional routes and timings can change." }
  ];

  installRodeoTheme();
  renderFaqList();
  installCheckInLinks();

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
    if (heroDeck) heroDeck.textContent = "We're embracing our love of Western music and great BBQ food with Rodeo-style wedding celebrations in Spain and South Africa.";
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
        <article class="live-note-card"><span>Wedding theme</span><h3>Rodeo-style celebration</h3><p>We're embracing our love of Western music and great BBQ food by hosting Rodeo-style weddings. Cowboy boots, hats, leather and denim are welcome, and encouraged. If you don't have a cowboy hat, we'll have one for you if you'd like one.</p></article>
        <article class="live-note-card"><span>What to wear</span><h3>Western, comfortable, celebration-ready</h3><p>Think boots, hats, denim, leather, belts, bolo ties, fringe, country shirts and dresses that can handle gardens, lawns and a dancefloor.</p></article>
        <div class="live-note-actions"><a class="button button-light" href="https://za.pinterest.com/carakenny/mxc-wedding-outfit-inspo/" target="_blank" rel="noopener noreferrer">Outfit inspo board</a></div>`;
      liveUpdates.appendChild(theme);
    }

    [
      { selector: "#spain", copy: "Spain will bring the Rodeo spirit to the Andalusian countryside: Western music, BBQ food, boots, hats, denim and leather against a finca backdrop." },
      { selector: "#south-africa", copy: "South Africa will carry the same Rodeo-style energy in the KZN Midlands: great BBQ food, Western music, cowboy boots, hats, leather and denim encouraged." }
    ].forEach(({ selector, copy }) => {
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
      const rodeoCard = practicalCards[2];
      rodeoCard.querySelector("h3").textContent = "Boots, hats, denim";
      rodeoCard.querySelector("p").textContent = "Cowboy boots, hats, leather and denim are welcome and encouraged. Choose shoes that work on gardens, lawns and country surfaces. If you don't have a cowboy hat, we'll have one for you if you'd like one.";
      if (!rodeoCard.querySelector(".practical-outfit-link")) {
        const link = document.createElement("a");
        link.className = "text-link practical-outfit-link";
        link.href = "https://za.pinterest.com/carakenny/mxc-wedding-outfit-inspo/";
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.innerHTML = "Outfit inspo board <span>→</span>";
        rodeoCard.appendChild(link);
      }
    }
  }

  function renderFaqList(liveFaqs = []) {
    const faqList = document.getElementById("faq-list");
    if (!faqList) return;
    const seen = new Set();
    const finalFaqs = [];
    [...BUILT_IN_FAQS, ...liveFaqs.map((faq) => ({ title: faq.title, body: faq.body }))].forEach((faq) => {
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
