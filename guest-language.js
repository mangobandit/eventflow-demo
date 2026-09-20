(() => {
  "use strict";

  const translations = window.MXC_GUEST_ES || {};
  const storageKey = "mxc-guest-language";
  const buttons = [...document.querySelectorAll("[data-language]")];
  const textOriginals = new WeakMap();
  const attributeOriginals = new WeakMap();
  const excluded = "script, style, noscript, [translate='no'], input, textarea";
  let language = "en";

  function translate(value) {
    if (language !== "es") return value;
    const key = value.trim();
    let translated = translations[key];
    // Published update dates are dynamic; format them in the selected locale.
    const updated = key.match(/^Guest guide · updated (.+)$/);
    if (!translated && updated) {
      const date = new Date(updated[1]);
      translated = `Guía para invitados · actualizada ${Number.isNaN(date.getTime()) ? updated[1] : new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric" }).format(date)}`;
    }
    return translated ? value.replace(key, () => translated) : value;
  }

  function originalValue(records, target, current) {
    let record = records.get(target);
    // A fresh write by guest.js replaces the source, including refreshed FAQs.
    if (!record || current !== record.rendered) record = { source: current, rendered: current };
    record.rendered = translate(record.source);
    records.set(target, record);
    return record.rendered;
  }

  const observer = new MutationObserver(refresh);
  function refresh() {
    observer.disconnect();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.nodeValue.trim() || node.parentElement?.closest(excluded)) continue;
      const next = originalValue(textOriginals, node, node.nodeValue);
      if (node.nodeValue !== next) node.nodeValue = next;
    }
    document.querySelectorAll("[aria-label], [title], [alt], [placeholder]").forEach((element) => {
      if (element.closest(excluded)) return;
      let records = attributeOriginals.get(element);
      if (!records) { records = new Map(); attributeOriginals.set(element, records); }
      ["aria-label", "title", "alt", "placeholder"].forEach((name) => {
        if (!element.hasAttribute(name)) return;
        const current = element.getAttribute(name);
        const next = originalValue(records, name, current);
        if (current !== next) element.setAttribute(name, next);
      });
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["aria-label", "title", "alt", "placeholder"] });
  }

  function setLanguage(next, announce = false) {
    if (next !== "en" && next !== "es") return;
    language = next;
    document.documentElement.lang = language;
    document.title = language === "es" ? "Matt & Cara · Guía para invitados" : "Matt & Cara · Wedding Guest Guide";
    document.querySelector('meta[name="description"]')?.setAttribute("content", language === "es"
      ? "Guía para los invitados a las bodas de Matt y Cara en España y Sudáfrica en 2026."
      : "Matt and Cara's guest guide for their Spain and South Africa wedding celebrations in 2026.");
    buttons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.language === language)));
    refresh();
    try { localStorage.setItem(storageKey, language); } catch (_) { /* Private browsing may disable storage. */ }
    if (announce) {
      const url = new URL(location.href);
      url.searchParams.set("lang", language);
      try { history.replaceState(history.state, "", url); } catch (_) { /* The switch still works without history access. */ }
      const status = document.querySelector(".language-status");
      status.lang = language;
      status.textContent = language === "es" ? "Idioma cambiado a español." : "Language changed to English.";
    }
  }

  buttons.forEach((button) => button.addEventListener("click", () => setLanguage(button.dataset.language, true)));
  let saved;
  try { saved = localStorage.getItem(storageKey); } catch (_) { /* English remains available. */ }
  const requested = new URL(location.href).searchParams.get("lang");
  setLanguage(["en", "es"].includes(requested) ? requested : saved === "es" ? "es" : "en");

  // Keep the sticky navigation below the language bar when text is enlarged.
  const bar = document.querySelector(".language-bar");
  if (bar && "ResizeObserver" in window) {
    new ResizeObserver(() => document.documentElement.style.setProperty("--language-bar-height", `${bar.getBoundingClientRect().height}px`)).observe(bar);
  }
})();
