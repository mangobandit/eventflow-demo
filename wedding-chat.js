(() => {
  "use strict";

  const isPlanner = document.body.classList.contains("planner-site");
  const isGuest = document.body.classList.contains("guest-site");
  const CHAT_ENDPOINT = window.MXC_CONFIG?.chatEndpoint || "";
  const PLANNER_STORE = "mxc-planner-browser-v3";

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
    <div class="chat-head"><div><b>${isPlanner ? "Planning assistant" : "Guest concierge"}</b><small>${isPlanner ? "Tasks · honeymoon · wedding planner" : "Wedding questions · travel · check-in"}</small></div><button class="chat-close" type="button" aria-label="Close chat">×</button></div>
    <div class="chat-log" aria-live="polite"></div>
    <div class="chat-chips"></div>
    <form class="chat-form"><textarea rows="1" placeholder="${isPlanner ? "Try: add task book flights due 2026-08-15" : "Ask about dress code, dates, travel, check-in…"}"></textarea><button type="submit">Send</button></form>
    <div class="chat-note">${isPlanner ? "Works on mobile. Commands save into the secure shared planner." : "Answers are based on the wedding guide. Final updates will appear on this site."}</div>`;

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
      : "Ask me about the dates, dress code, children, parking, open bar, gifts, food, photos, travel, accommodation, RSVP, weather, or things to do.", "bot");
    chips.innerHTML = (isPlanner
      ? ["Add task book flights", "What is outstanding?", "Add honeymoon task", "Show travel tasks"]
      : ["What is the dress code?", "Will there be an open bar?", "Can children come?", "Can I post photos online?"])
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
        // Local fallback below.
      }
    }
    return isPlanner ? plannerReply(text) : guestReply(text);
  }

  function guestReply(text) {
    const q = text.toLowerCase();
    const faq = guestFaqAnswer(q);
    if (faq) return faq;
    if (has(q, ["date", "when", "day"])) return "Spain is Saturday 10 October 2026 at Finca Mesa Jardín near Arcos de la Frontera. South Africa is Saturday 19 December 2026 at Mission House in the KZN Midlands.";
    if (has(q, ["rsvp", "check-in", "check in", "checkin", "confirm", "confirmation", "respond", "invite"])) return "Use the Guest Check-In button on the site. It opens in the few days before each celebration so we can finalise who is still coming, transport, food and any last-minute notes for your household.";
    if (has(q, ["travel", "airport", "flight", "fly"])) return "For Spain: Jerez is closest, Seville is the best all-round option, and Málaga has the most flight choice. For South Africa: fly into Durban/King Shaka (about 1hr 50min from the venue) — from overseas connect via Istanbul or Dubai, or fly to Cape Town and take a domestic flight to Durban (we recommend Safair). Rent a car at Durban Airport; Uber is not available near the venue.";
    if (has(q, ["stay", "hotel", "accommodation", "lodging", "sleep"])) return "For Spain, Arcos is closest to the venue and Jerez is better for restaurants and transport. For South Africa, Howick is practical and the Midlands Meander gives the best country-weekend feel.";
    if (has(q, ["weather", "temperature"])) return "Spain in October should be mild with cooler evenings. South Africa in December is warm summer weather with a real chance of afternoon storms. Final forecasts will be updated closer to each week.";
    if (has(q, ["things", "do", "visit", "activities"])) return "Spain ideas: Arcos, Jerez, Cádiz, Chiclana, Vejer, Grazalema and Seville. South Africa ideas: Midlands Meander, Howick Falls, Mandela Capture Site, Drakensberg, Durban/Umhlanga, safari or Cape Town add-on.";
    if (has(q, ["transport", "bus", "pickup", "shuttle"])) return "Shuttle buses run for both weddings. Spain: Chiclana to the venue at 16:45, returning at midnight, plus venue parking and pre-booked taxis to Arcos or Jerez. South Africa: Durban (via Howick) to the venue at 15:30, returning at 23:00, plus venue parking.";
    return "I can help with dates, locations, Rodeo dress code, children, parking, open bar, gifts, food, photos, RSVP, travel, accommodation, weather, transport and things to do. Ask me one of those and I’ll answer from the wedding guide.";
  }

  function guestFaqAnswer(q) {
    if (has(q, ["child", "children", "kid", "kids", "baby", "babies", "toddler", "toddlers", "family", "families"])) return "Yes, children are very welcome. We’ll provide some things to help keep them entertained, and there will be people nearby to keep a friendly eye on them. Parents and guardians are still responsible for their own children throughout the celebration, so please keep an eye on them as you normally would.";
    if (has(q, ["same location", "one location", "different location", "move venue", "moving venue", "all in one place"])) return "Yes, everything is planned around the same venue. Once you arrive, you can settle in and enjoy the ceremony, food, drinks and celebration without moving between locations.";
    if (has(q, ["parking", "park car", "car park"])) return "Yes, there will be parking available at the venue. We’ll share any final parking or arrival notes closer to the wedding date.";
    if (has(q, ["how early", "arrive early", "early can", "early arrive", "arrival time"])) return "You may arrive up to two hours before the official start time if you need to. The bar will remain closed until the official kick-off time, so early arrival is mainly for settling in and avoiding a rush.";
    if (has(q, ["open bar", "bar", "drinks", "paid bar", "cash bar", "alcohol"])) return "Yes, the bar will be hosted up to a certain time. After that point, any extra drinks will be for guests’ own account. We’ll make the final bar timing clear on the day.";
    if (has(q, ["indoors", "outdoors", "inside", "outside", "tent", "rain", "inclement"])) return "The wedding has a country/Rodeo feel and is planned as an outdoor celebration. If the weather turns, there will be cover under a tent or suitable shelter so the day can keep flowing comfortably.";
    if (has(q, ["gift", "gifts", "cash", "eft", "bank", "banking", "present", "registry"])) return "Your presence is the greatest gift we could ask for. If you would like to give something, a cash or EFT contribution is most helpful and very appreciated — we can accept EUR, ZAR or GBP. Please message Matt or Cara privately for the right banking details.";
    if (has(q, ["timing", "times", "schedule", "late", "start", "ceremony time", "what time"])) return "Spain: arrive 17:30, ceremony 18:00, drinks 18:30, feast 19:30, cake 20:30, dancefloor 21:00, last rounds 23:30, goodbye at midnight. South Africa: arrive 16:30, ceremony 17:30, drinks 18:00, feast 19:00, cake 20:00, dancefloor 20:30, last rounds 23:00, goodbye 23:30. Please arrive promptly.";
    if (has(q, ["food", "eat", "meal", "bbq", "braai", "meat", "vegetarian", "grazer", "grazers"])) return "Expect a Western-inspired feast: BBQ and braai-style meats, with much of the food cooked over open fire. There will be options for lighter grazers as well as those who want something more hearty.";
    if (has(q, ["expect", "what happens", "on the day", "games", "entertainment", "horseshoe", "horse shoe"])) return "Expect food, drinks, laughs and a relaxed Rodeo-style celebration. Depending on which wedding you’re attending, there will be small Western-inspired games and entertainment, such as horseshoe toss and other fun touches to keep the day moving.";
    if (has(q, ["photo", "photos", "picture", "pictures", "post", "instagram", "online", "social", "video", "walls", "walls.io"])) return "You’re welcome to take a few personal photos, but please don’t post the day publicly online without our permission. This is a private, intimate celebration and we’ve invested in a professional photography team. We’ll also use Walls.io, a private wedding social wall where guests can share selected photos and messages into one private feed instead of posting everything publicly.";
    if (has(q, ["dress", "wear", "theme", "cowboy", "boots", "hat", "denim", "leather", "rodeo"])) return "The theme is Rodeo-style: Western music, great BBQ food, cowboy boots, hats, leather and denim are welcome and encouraged. Choose shoes that work on gardens, lawns and a dancefloor.";
    return null;
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

  function plannerOpen() {
    return typeof state !== "undefined" && Boolean(state.session);
  }

  /* Chat-created rows go through the same secure save path as the forms, so
     they persist and sync for both of you (or the browser store in demo mode). */
  async function persistNewRow(table, payload) {
    if (state.session?.token) {
      const saved = await plannerRpc("planner_save_entity", {
        p_session_token: state.session.token,
        p_table: table,
        p_record_id: null,
        p_payload: payload
      });
      state.data[table].unshift(saved);
    } else {
      const now = new Date().toISOString();
      state.data[table].unshift({ id: crypto.randomUUID(), ...payload, created_at: now, updated_at: now });
      try {
        localStorage.setItem(PLANNER_STORE, JSON.stringify(state.data));
      } catch (_error) {
        // Browser storage may be unavailable; the row still renders.
      }
    }
    if (typeof renderAll === "function") renderAll();
  }

  async function addPlannerTask(text) {
    if (!plannerOpen()) return "Open the Couple Portal first, then I can add tasks.";
    const title = cleanCommand(text, ["add task", "new task", "remind me to", "remind me", "todo", "to do"]);
    const due = findDate(text);
    const owner = /\bcara\b/i.test(text) ? "cara" : /\bmatt\b/i.test(text) ? "matt" : "shared";
    const celebration = /south africa|\bsa\b/i.test(text) ? "south_africa" : /spain/i.test(text) ? "spain" : "shared";
    const category = /flight|travel|airport|luggage|passport/i.test(text) ? "Travel" : /dress|suit|boots|outfit/i.test(text) ? "Attire" : /budget|pay|deposit|invoice/i.test(text) ? "Budget" : "General";
    try {
      await persistNewRow("tasks", { title: title || "New task", description: "Added from chat.", owner, celebration, category, priority: /urgent|important|high/i.test(text) ? "high" : "normal", status: "outstanding", due_date: due, notes: "Added from chatbot." });
    } catch (error) {
      return error.message || "Could not save that task.";
    }
    return `Added task: ${title || "New task"}${due ? `, due ${due}` : ""}.`;
  }

  async function addBudget(text) {
    if (!plannerOpen()) return "Open the Couple Portal first, then I can add budget items.";
    const amount = Number((text.match(/(?:€|eur|r|zar)?\s*(\d+(?:\.\d+)?)/i) || [])[1] || 0);
    const currency = /\bzar\b|\br\s*\d/i.test(text) ? "ZAR" : "EUR";
    const title = cleanCommand(text.replace(String(amount), ""), ["add budget", "budget item", "add cost"]);
    try {
      await persistNewRow("budget_items", { title: title || "New budget item", owner: "shared", celebration: /south africa|\bsa\b/i.test(text) ? "south_africa" : /spain/i.test(text) ? "spain" : "shared", category: "Budget", currency, estimated: amount, deposit: 0, paid: 0, due_date: findDate(text), status: "outstanding", notes: "Added from chatbot." });
    } catch (error) {
      return error.message || "Could not save that budget item.";
    }
    return `Added budget item: ${title || "New budget item"} (${currency} ${amount || 0}).`;
  }

  async function addHoneymoonTask(text) {
    if (!plannerOpen()) return "Open the Couple Portal first, then I can add honeymoon tasks.";
    const title = cleanCommand(text, ["add honeymoon task", "honeymoon task", "add japan task", "japan task", "add task"]);
    try {
      await persistNewRow("honeymoon_items", { kind: "task", title: title || "New honeymoon task", notes: "Added from chatbot.", priority: /urgent|important|high/i.test(text) ? "high" : "normal", done: false });
    } catch (error) {
      return error.message || "Could not save that honeymoon task.";
    }
    return `Added honeymoon task: ${title || "New honeymoon task"}. Open the Honeymoon tab to see it.`;
  }

  async function addJapanPlace(text) {
    if (!plannerOpen()) return "Open the Couple Portal first, then I can save Japan places.";
    const raw = cleanCommand(text, ["add japan place", "add place", "save place", "add honeymoon place"]);
    const [area, ...rest] = raw.split(":");
    try {
      await persistNewRow("honeymoon_items", { kind: "place", title: (rest.length ? area : "Japan").trim() || "Japan", notes: (rest.length ? rest.join(":") : raw).trim() || "Saved from chat." });
    } catch (error) {
      return error.message || "Could not save that place.";
    }
    return `Saved Japan place: ${raw || "new place"}. It is in the Honeymoon tab under Saved places.`;
  }

  function summarizePlanner(q) {
    if (!plannerOpen()) return "Open the Couple Portal first and I can read the task list.";
    const rows = state.data.tasks || [];
    const subset = /pending/.test(q) ? rows.filter((t) => t.status === "pending") : rows.filter((t) => t.status === "outstanding");
    const top = subset.slice(0, 6).map((task) => `• ${task.title}${task.due_date ? ` (${task.due_date})` : ""}`).join("\n");
    return subset.length ? `${subset.length} ${/pending/.test(q) ? "pending" : "outstanding"} tasks.\n${top}` : "Nothing matching that status right now.";
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
