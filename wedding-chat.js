(() => {
  "use strict";

  const isPlanner = document.body.classList.contains("planner-site");
  const isGuest = document.body.classList.contains("guest-site");
  const CHAT_ENDPOINT = window.MXC_CONFIG?.chatEndpoint || "";
  const PLANNER_STORE = "mxc-planner-browser-v3";
  const HONEYMOON_STORE = "mxc-honeymoon-japan-v1";

  if (!isPlanner && !isGuest) return;
  if (document.querySelector(".chat-launcher")) return;

  const launcher = document.createElement("button");
  launcher.className = "chat-launcher";
  launcher.type = "button";
  launcher.setAttribute("aria-label", isPlanner ? "Open planning assistant" : "Open guest assistant");

  const panel = document.createElement("section");
  panel.className = "chat-panel";
  panel.hidden = true;
  panel.innerHTML = `
    <div class="chat-head"><div><b>${isPlanner ? "Planning assistant" : "Guest concierge"}</b><small>${isPlanner ? "Tasks · honeymoon · wedding planner" : "Wedding questions · travel · RSVP"}</small></div><button class="chat-close" type="button" aria-label="Close chat">×</button></div>
    <div class="chat-log" aria-live="polite"></div>
    <div class="chat-chips"></div>
    <form class="chat-form"><textarea rows="1" placeholder="${isPlanner ? "Try: add task book flights due 2026-08-15" : "Ask about dress code, dates, travel, RSVP…"}"></textarea><button type="submit">Send</button></form>
    <div class="chat-note">${isPlanner ? "Works on mobile. Commands save into this browser's planner." : "Answers are based on the wedding guide. Final updates will appear on this site."}</div>`;

  document.body.append(launcher, panel);

  const log = panel.querySelector(".chat-log");
  const form = panel.querySelector("form");
  const input = panel.querySelector("textarea");
  const chips = panel.querySelector(".chat-chips");

  launcher.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden && !log.children.length) greet();
    input.focus();
  });
  panel.querySelector(".chat-close").addEventListener("click", () => { panel.hidden = true; });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    addMessage(text, "user");
    const answer = await respond(text);
    addMessage(answer, "bot");
  });

  function greet() {
    addMessage(isPlanner
      ? "Tell me what to add or ask what is outstanding. I can add wedding tasks, honeymoon tasks, Japan places, and basic budget placeholders."
      : "Ask me about the dates, dress code, Rodeo theme, travel, accommodation, RSVP, weather, or things to do.", "bot");
    chips.innerHTML = (isPlanner
      ? ["Add task book flights", "What is outstanding?", "Add honeymoon task", "Show travel tasks"]
      : ["What is the dress code?", "When are the weddings?", "How do I travel?", "Where should I stay?"])
      .map((label) => `<button class="chat-chip" type="button">${escapeHtml(label)}</button>`).join("");
    chips.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => {
      input.value = button.textContent;
      form.requestSubmit();
    }));
  }

  async function respond(text) {
    if (CHAT_ENDPOINT) {
      try {
        const response = await fetch(CHAT_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: isPlanner ? "planner" : "guest", message: text, context: publicContext() })
        });
        if (response.ok) {
          const data = await response.json();
          if (data?.answer) return data.answer;
        }
      } catch (_error) {
        /* fall back to local assistant */
      }
    }
    return isPlanner ? plannerReply(text) : guestReply(text);
  }

  function guestReply(text) {
    const q = text.toLowerCase();
    if (has(q, ["date", "when", "day"])) return "Spain is Saturday 10 October 2026 at Finca Mesa Jardín near Arcos de la Frontera. South Africa is Saturday 19 December 2026 at Mission House in the KZN Midlands.";
    if (has(q, ["dress", "wear", "theme", "cowboy", "boots", "hat", "denim", "leather", "rodeo"])) return "The theme is Rodeo-style: Western music, great BBQ food, cowboy boots, hats, leather and denim are welcome and encouraged. Choose shoes that work on gardens, lawns and a dancefloor.";
    if (has(q, ["rsvp", "respond", "invite"])) return "Use the RSVP button on the site. If you have a private RSVP link, open it and answer for each person in your household. Final transport and dietaries depend on RSVP answers.";
    if (has(q, ["travel", "airport", "flight", "fly"])) return "For Spain: Jerez is closest, Seville is the best all-round option, and Málaga has the most flight choice. For South Africa: fly into Durban/King Shaka, then transfer or drive to the KZN Midlands.";
    if (has(q, ["stay", "hotel", "accommodation", "where"])) return "For Spain, Arcos is closest to the venue and Jerez is better for restaurants and transport. For South Africa, Howick is practical and the Midlands Meander gives the best country-weekend feel.";
    if (has(q, ["weather", "rain", "temperature"])) return "Spain in October should be mild with cooler evenings. South Africa in December is warm summer weather with a real chance of afternoon storms. Final forecasts will be updated closer to each week.";
    if (has(q, ["things", "do", "visit", "activities"])) return "Spain ideas: Arcos, Jerez, Cádiz, Chiclana, Vejer, Grazalema and Seville. South Africa ideas: Midlands Meander, Howick Falls, Mandela Capture Site, Drakensberg, Durban/Umhlanga, safari or Cape Town add-on.";
    if (has(q, ["transport", "bus", "pickup", "shuttle"])) return "Transport routes are still being grouped. Spain likely needs Chiclana/Jerez-style pickup clusters. South Africa likely needs Durban/Howick/Midlands clusters. Answer RSVP transport questions early.";
    return "I can help with dates, locations, Rodeo dress code, RSVP, travel, accommodation, weather, transport and things to do. Ask me one of those and I’ll answer from the wedding guide.";
  }

  function plannerReply(text) {
    const q = text.toLowerCase();
    if (has(q, ["add honeymoon task", "honeymoon task", "japan task"])) return addHoneymoonTask(text);
    if (has(q, ["add place", "add japan place", "save place"])) return addJapanPlace(text);
    if (has(q, ["add budget", "budget item", "add cost"])) return addBudget(text);
    if (has(q, ["add task", "new task", "remind me", "todo", "to do"])) return addPlannerTask(text);
    if (has(q, ["outstanding", "pending", "what is left", "what's left", "next"])) return summarizePlanner(q);
    if (has(q, ["flight", "south africa", "travel"])) return "Key travel items already tracked: Matt outbound Spain → South Africa, Cara outbound later after family time, Matt return, Cara return, extra luggage, travel insurance, passport/document checks, Matt's SA setup accommodation and car hire. Say: add task [thing] due YYYY-MM-DD if you want another one.";
    if (has(q, ["honeymoon", "japan"])) return "The Honeymoon tab has a Japan draft: route, flights, itinerary, saved-place buckets, budget and tasks. Say: add honeymoon task [thing] or add Japan place Tokyo: [place].";
    return "I can add tasks and budget placeholders. Try: add task Book Matt flights due 2026-08-15 for Matt SA, add budget Extra baggage 300 EUR, add honeymoon task Book ryokan, or add Japan place Tokyo: Golden Gai.";
  }

  function addPlannerTask(text) {
    if (!window.state && typeof state === "undefined") return "Open the Couple Portal first, then I can add tasks.";
    const title = cleanCommand(text, ["add task", "new task", "remind me to", "remind me", "todo", "to do"]);
    const due = findDate(text);
    const owner = /\bcara\b/i.test(text) ? "cara" : /\bmatt\b/i.test(text) ? "matt" : "shared";
    const celebration = /south africa|\bsa\b/i.test(text) ? "south_africa" : /spain/i.test(text) ? "spain" : "shared";
    const category = /flight|travel|airport|luggage|passport/i.test(text) ? "Travel" : /dress|suit|boots|outfit/i.test(text) ? "Attire" : /budget|pay|deposit|invoice/i.test(text) ? "Budget" : "General";
    const now = new Date().toISOString();
    state.data.tasks.unshift({ id: crypto.randomUUID(), title: title || "New task", description: "Added from chat.", owner, celebration, category, priority: /urgent|important|high/i.test(text) ? "high" : "normal", status: "outstanding", due_date: due, notes: "Added from chatbot.", created_at: now, updated_at: now });
    savePlanner();
    return `Added task: ${title || "New task"}${due ? `, due ${due}` : ""}.`;
  }

  function addBudget(text) {
    if (typeof state === "undefined") return "Open the Couple Portal first, then I can add budget items.";
    const amount = Number((text.match(/(?:€|eur|r|zar)?\s*(\d+(?:\.\d+)?)/i) || [])[1] || 0);
    const currency = /\bzar\b|\br\s*\d/i.test(text) ? "ZAR" : "EUR";
    const title = cleanCommand(text.replace(String(amount), ""), ["add budget", "budget item", "add cost"]);
    const now = new Date().toISOString();
    state.data.budget_items.unshift({ id: crypto.randomUUID(), title: title || "New budget item", owner: "shared", celebration: /south africa|\bsa\b/i.test(text) ? "south_africa" : /spain/i.test(text) ? "spain" : "shared", category: "Budget", currency, estimated: amount, deposit: 0, paid: 0, due_date: findDate(text), status: "outstanding", notes: "Added from chatbot.", created_at: now, updated_at: now });
    savePlanner();
    return `Added budget item: ${title || "New budget item"} (${currency} ${amount || 0}).`;
  }

  function addHoneymoonTask(text) {
    const data = loadHoneymoon();
    const title = cleanCommand(text, ["add honeymoon task", "honeymoon task", "add japan task", "japan task", "add task"]);
    data.tasks = data.tasks || [];
    data.tasks.push({ id: crypto.randomUUID(), title: title || "New honeymoon task", notes: "Added from chatbot.", priority: /urgent|important|high/i.test(text) ? "high" : "normal", done: false });
    localStorage.setItem(HONEYMOON_STORE, JSON.stringify(data));
    return `Added honeymoon task: ${title || "New honeymoon task"}. Open the Honeymoon tab to see it.`;
  }

  function addJapanPlace(text) {
    const data = loadHoneymoon();
    const raw = cleanCommand(text, ["add japan place", "add place", "save place", "add honeymoon place"]);
    const [area, ...rest] = raw.split(":");
    data.places = data.places || [];
    data.places.push({ area: (rest.length ? area : "Japan").trim() || "Japan", notes: (rest.length ? rest.join(":") : raw).trim() || "Saved from chat." });
    localStorage.setItem(HONEYMOON_STORE, JSON.stringify(data));
    return `Saved Japan place: ${raw || "new place"}.`;
  }

  function summarizePlanner(q) {
    if (typeof state === "undefined") return "Open the Couple Portal first and I can read the task list.";
    const rows = state.data.tasks || [];
    const subset = /pending/.test(q) ? rows.filter((t) => t.status === "pending") : rows.filter((t) => t.status === "outstanding");
    const top = subset.slice(0, 6).map((task) => `• ${task.title}${task.due_date ? ` (${task.due_date})` : ""}`).join("\n");
    return subset.length ? `${subset.length} ${/pending/.test(q) ? "pending" : "outstanding"} tasks.\n${top}` : "Nothing matching that status right now.";
  }

  function savePlanner() {
    localStorage.setItem(PLANNER_STORE, JSON.stringify(state.data));
    if (typeof renderAll === "function") renderAll();
    if (typeof toast === "function") toast("Chat update saved.");
  }

  function loadHoneymoon() {
    try { return JSON.parse(localStorage.getItem(HONEYMOON_STORE) || "{}") || {}; } catch (_error) { return {}; }
  }

  function cleanCommand(text, commands) {
    let out = text.trim();
    commands.forEach((command) => { out = out.replace(new RegExp(`^${escapeReg(command)}\\s*`, "i"), ""); });
    out = out.replace(/\bdue\s+\d{4}-\d{2}-\d{2}\b/i, "").replace(/\bfor\s+(matt|cara|shared|spain|sa|south africa)\b/ig, "").trim();
    return out.replace(/[.!?]+$/, "");
  }

  function findDate(text) {
    return (text.match(/\b\d{4}-\d{2}-\d{2}\b/) || [null])[0];
  }

  function has(text, words) {
    return words.some((word) => text.includes(word));
  }

  function publicContext() {
    return { site: "mxcwedding.com", theme: "Rodeo-style Western music and BBQ weddings", spain: "10 October 2026, Finca Mesa Jardín, Arcos de la Frontera", southAfrica: "19 December 2026, Mission House, KZN Midlands" };
  }

  function addMessage(text, type) {
    const div = document.createElement("div");
    div.className = `chat-msg ${type}`;
    div.textContent = text;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  function escapeReg(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function escapeHtml(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
})();
