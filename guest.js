(() => {
  "use strict";

  const config = window.MXC_CONFIG || {};
  const menuButton = document.querySelector(".menu-button");
  const publicNav = document.querySelector(".public-nav");

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
