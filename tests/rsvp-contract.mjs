import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";

const root = resolve(import.meta.dirname, "..");
const read = (file) => readFileSync(resolve(root, file), "utf8");

const homepage = read("index.html");
const checkinPage = read("rsvp.html");
const guest = read("guest.js");
const style = read("style.css");
const styleCore = read("style-core.css");
const guestLayout = read("guest-layout.css");
const checkinScript = read("rsvp.js");
const planner = read("planner.html");
const plannerAuth = read("planner-auth.js");
const plannerForms = read("planner-forms.js");
const plannerLoader = read("planner-rsvp.js");
const plannerCheckin = read("planner-checkin.js");
const chat = read("wedding-chat.js");
const familyChat = read("wedding-chat-family.js");
const checkinChat = read("wedding-chat-checkin.js");
const access = read("planner-access.js");
const sw = read("sw.js");
const checkinSql = read("supabase/migrations/20260626_guest_checkin_fields.sql");
const checkinStatusSql = read("supabase/migrations/20260630_checkin_confirmation_status.sql");
const checkinDropdownSql = read("supabase/migrations/20260630_guest_checkin_dropdown.sql");
const checkinDropdownLockdownSql = read("supabase/migrations/20260630_guest_checkin_dropdown_lockdown.sql");
const plannerLoginSql = read("supabase/migrations/20260630_planner_username_login.sql");
const config = read("config.js");

assert.doesNotMatch(homepage, /id="live-updates"/);
assert.doesNotMatch(homepage, /Latest updates/);
assert.doesNotMatch(homepage, /<h3>Transport<\/h3><p>Answer transport questions early/);
assert.match(homepage, /See our suggested Spain travel plan/);
assert.match(homepage, /See our suggested South Africa travel plan/);
assert.match(homepage, /Suggested wedding weekend route/);
assert.match(homepage, /Suggested Andalusian celebration/);
assert.match(homepage, /Suggested KZN celebration/);
assert.match(homepage, /AGP \/ GIB/);
assert.match(homepage, /Málaga or Gibraltar Airport/);
assert.match(homepage, /Málaga\/Gibraltar is best for guests prioritising route choice/);
assert.match(homepage, /https:\/\/www\.midlandsreservations\.co\.za\/za\/lions-river-cottages\//);
assert.match(homepage, /Boots, hats, denim/);
assert.match(homepage, /If you don't have a cowboy hat, we'll have one for you if you'd like one\./);
assert.match(homepage, /https:\/\/za\.pinterest\.com\/carakenny\/mxc-wedding-outfit-inspo\//);
assert.match(homepage, /guest\.js\?v=20260913-guest-details/);
assert.match(homepage, /style\.css\?v=20260913-guest-details/);
assert.match(homepage, /href="#gifts">Gifts/);
assert.match(homepage, /id="gifts"/);
assert.match(homepage, /Your presence is already plenty\./);
assert.match(homepage, /cash or EFT contribution would be most helpful/);
assert.match(homepage, /There is no formal registry and no pressure to bring a physical present/);
assert.match(homepage, /<span>02<\/span><h3>Travelling light<\/h3>[\s\S]*<span>03<\/span><h3>Honeymoon contribution<\/h3>/);
assert.match(homepage, /If you prefer to contribute towards our honeymoon, contributions can be made in either EUR or ZAR/);
assert.match(homepage, /Please message Matt or Cara privately/);
assert.match(homepage, /Mission House reception tables overlooking the KZN Midlands/);
assert.match(homepage, /data-countdown="2026-10-10T17:00:00\+02:00"/);
assert.match(homepage, /data-countdown="2026-12-19T17:00:00\+02:00"/);
assert.doesNotMatch(homepage, /<dt>Bus pick up/i);
assert.equal((homepage.match(/<div><dt>Guest arrival<\/dt><dd>16:15 to 16:40<\/dd><\/div>/g) || []).length, 2);
assert.equal((homepage.match(/<div><dt>Ceremony<\/dt><dd>17:00<\/dd><\/div>/g) || []).length, 2);
assert.equal((homepage.match(/<div><dt>Celebration ends<\/dt><dd>01:00<\/dd><\/div>/g) || []).length, 2);
assert.doesNotMatch(homepage, /event-schedule|Spain day timings|South Africa day timings|Sunset is expected around|Dinner and speeches|Drinks and dancing/);
assert.doesNotMatch(homepage, /<dd>17:30<\/dd>|<dd>18:00<\/dd>|<dd>23:30<\/dd>|<dd>00:00<\/dd>/);
assert.equal((homepage.match(/https:\/\/www\.google\.com\/maps\/search\/\?api=1&amp;query=/g) || []).length, 12);
assert.match(homepage, /Arcos\+de\+la\+Frontera\+Cadiz\+Spain/);
assert.match(homepage, /Midlands\+Meander\+KwaZulu-Natal\+South\+Africa/);
for (const [id, venue, address] of [
  ["spain-directions", "Finca Mesa Jardin", "Carretera Arcos El Bosque km 11"],
  ["sa-directions", "Mission House", "39 Currys Post Road"]
]) {
  const block = homepage.match(new RegExp(`<div[^>]*id="${id}"[^>]*>([\\s\\S]*?)<\\/div>`))?.[1];
  assert.ok(block, `${id}: venue directions must be visible on the page`);
  const href = block.match(/href="(https:\/\/www\.google\.com\/maps\/dir\/[^\"]*)"/)?.[1];
  assert.ok(href, `${id}: guests need a working directions link`);
  const destinationUrl = new URL(href.replaceAll("&amp;", "&"));
  assert.equal(destinationUrl.searchParams.get("api"), "1");
  assert.ok(destinationUrl.searchParams.get("destination")?.includes(venue), `${id}: link must route to this wedding's venue`);
  assert.ok(destinationUrl.searchParams.get("destination")?.includes(address), `${id}: route must include the venue address`);
}
const pageIds = new Set([...homepage.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
for (const [, target] of homepage.matchAll(/href="#([^"]+)"/g)) {
  assert.ok(pageIds.has(target), `in-page link #${target} must have a destination`);
}
assert.match(guestLayout, /experience-map-link/);
assert.doesNotMatch(homepage, /Save both dates\. South Africa accommodation options are below/);
assert.match(style, /style-core\.css\?v=20260704-mission-house-gallery/);
assert.match(style, /guest-layout\.css\?v=20260913-guest-details/);
assert.match(guestLayout, /gift-section/);
assert.doesNotMatch(guestLayout, /event-schedule/);
assert.match(styleCore, /hero-photo-sa[\s\S]*assets\/mission-house-hero\.webp/);
assert.match(styleCore, /mission-main[\s\S]*assets\/mission-house-reception\.webp/);
assert.match(guestLayout, /mission-stay[\s\S]*assets\/mission-house-hero\.webp/);
assert.doesNotMatch(`${styleCore}\n${guestLayout}`, /69847affe9fb3bc0ebce860d_Tab%20Pane%206\.avif/);

assert.match(checkinPage, /Matt & Cara · Guest Check In/);
assert.match(checkinPage, /Confirm your household before the celebration/);
assert.match(checkinPage, /few days before the celebration/);
assert.match(checkinPage, /Are you still<br>joining us\?/);
assert.match(checkinPage, /id="rsvp-select-form"/);
assert.match(checkinPage, /id="rsvp-guest-select"/);
assert.match(checkinPage, /Your name or household/);
assert.match(checkinPage, /Or use a code/);
assert.match(checkinPage, /Send check in/);
assert.match(checkinPage, /Check in received/);
assert.doesNotMatch(checkinPage, /Private RSVP|Send RSVP|Open your RSVP|Will you<br>join us\?/);
assert.doesNotMatch(checkinPage, /Check-In|check-in|Last-minute/);
assert.doesNotMatch(checkinPage, /24 hours before/);

assert.match(checkinScript, /get_rsvp_invitation/);
assert.match(checkinScript, /list_guest_checkin_options/);
assert.match(checkinScript, /get_rsvp_invitation_by_lookup/);
assert.match(checkinScript, /submit_rsvp/);
assert.match(checkinScript, /submit_rsvp_by_lookup/);
assert.match(checkinScript, /DEMO_TOKEN/);
assert.match(checkinScript, /DEMO_LOOKUP_KEY/);
assert.match(checkinScript, /isLocalDemoEnabled/);
assert.match(checkinScript, /createDemoClient/);
assert.match(checkinScript, /few days before the celebration/);
assert.match(checkinScript, /Checked in and still coming/);
assert.match(checkinScript, /Can't make it/);
assert.match(checkinScript, /Access needs or other guest notes/);
assert.doesNotMatch(checkinScript, /Joyfully yes|Sadly no|Saving your response|Your RSVP/);
assert.doesNotMatch(checkinScript, /Check-In|check-in|Wedding-day|Last-minute|—|…/);
assert.doesNotMatch(checkinScript, /24 hours before the celebration/);

const expectedFaqs = [
  "What is the wedding theme?",
  "What can I expect on the day?",
  "What kind of food will there be?",
  "What should we wear?",
  "Is everything in the same location?",
  "Is the wedding indoors or outdoors?",
  "How early can I arrive?",
  "What are the timings for the day?",
  "Will there be wedding day transport?",
  "Is there parking at the venue?",
  "Can children come?",
  "What gifts should I bring?",
  "Can I take photos or post online?",
  "What is Walls.io?",
  "When should we book flights?"
];

expectedFaqs.forEach((title) => assert.match(guest, new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))));
assert.match(guest, /const BUILT_IN_FAQS = \[/);
assert.match(guest, /Don't have a cowboy hat\? We'll provide one for you if you'd like one\./);
assert.match(guest, /If you don't have a cowboy hat, we'll have one for you if you'd like one\./);
assert.match(guest, /https:\/\/za\.pinterest\.com\/carakenny\/mxc-wedding-outfit-inspo\//);
assert.match(guest, /Outfit inspo board/);
assert.match(guest, /Guest arrival is 16:15 to 16:40/);
assert.match(guest, /Drinks reception and canapes run from 17:20 to 18:45/);
assert.match(guest, /the bar opens fully afterwards/);
assert.match(guest, /drinks and dancing continue until 01:00/);
assert.doesNotMatch(guest, /bar will remain closed until the official kick-off time/);
assert.match(guest, /const CHECK_IN_ENABLED = false;/, "homepage guest check-in entry points must stay archived");
assert.match(guest, /if\s*\(\s*!CHECK_IN_ENABLED\s*\)\s*return;/, "check-in visibility must be controlled separately from the live RSVP backend");
assert.match(guest, /function normalizeFaqTitle/);
assert.match(guest, /renderFaqList\(faqs\)/);

// Execute the actual FAQ renderer so a title existing in the source is not enough.
// Similar words (what/hat, weather/eat) must not hide unrelated questions.
const faqList = { innerHTML: "" };
const faqContext = {
  URL, console, history: {}, navigator: {},
  location: new URL("https://example.test/"),
  window: { location: new URL("https://example.test/"), setInterval() {} },
  document: {
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: (id) => id === "faq-list" ? faqList : null,
    createElement: () => ({ dataset: {}, style: {} })
  }
};
runInNewContext(guest.replace(/\}\)\(\);\s*$/, "globalThis.faqApi = { renderFaqList, builtInFaqs: BUILT_IN_FAQS }; })();"), faqContext);
const { renderFaqList, builtInFaqs } = faqContext.faqApi;
const renderedFaqTitles = () => [...faqList.innerHTML.matchAll(/<summary>(.*?)<\/summary>/g)].map((match) => match[1]);
const escapeFaqTitle = (title) => title.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const builtInTitles = Array.from(builtInFaqs, ({ title }) => escapeFaqTitle(title));
assert.deepEqual(renderedFaqTitles(), builtInTitles, "every distinct built-in FAQ must render at startup");

renderFaqList([
  ...builtInFaqs.map(({ title }) => ({ title: `  ${title.toUpperCase()}  `, body: "Stale live duplicate" })),
  ...["Can kids attend?", "What is the dress code?", "What is the full schedule?", "Are shuttle buses provided?", "Where can I park?", "Can I bring a gift?", "How do I use Walls.io?", "What food will we eat?"].map((title) => ({ title, body: "Stale live duplicate" })),
  { title: "Can I book a room at the venue?", body: "A separate accommodation question." },
  { title: "", body: "An incomplete published row." },
  { title: "An incomplete published question" }
]);
assert.deepEqual(renderedFaqTitles(), [...builtInTitles, "Can I book a room at the venue?"], "live duplicate topics stay suppressed while a different booking question remains visible");
assert.doesNotMatch(faqList.innerHTML, /Stale live duplicate|incomplete published/);

// With no built-ins, distinct practical questions still need their own answers.
builtInFaqs.length = 0;
const practicalFaqs = [
  "What kind of food will there be?",
  "What is the deadline for food allergies?",
  "What accessible facilities are available?",
  "What does the cash bar cost?",
  "What gifts should I bring?",
  "What time will guest check in open?",
  "What are the timings for the day?"
].map((title) => ({ title, body: "A distinct practical answer." }));
renderFaqList(practicalFaqs);
assert.deepEqual(renderedFaqTitles(), practicalFaqs.map(({ title }) => title), "dietary, accessibility, bar and check-in questions must not collide with food, gifts or timings");

assert.doesNotMatch(guest, /Can children attend/);
assert.doesNotMatch(guest, /Open your RSVP|Guest RSVP|navLink\.textContent = "RSVP"|Rodeo-style|Western-inspired|braai-style|wedding-day|check-in|Check-In/);

assert.match(chat, /guest check in/);
assert.match(chat, /How do drinks work\?/);
assert.match(chat, /Guest arrival is 16:15 to 16:40/);
assert.match(chat, /Drinks reception and canapes run from 17:20 to 18:45/);
assert.match(chat, /the bar opens fully afterwards/);
assert.doesNotMatch(chat, /Use the RSVP button|Wedding questions .* RSVP|bar will remain closed|kick-off|grab it before the bar closes|Rodeo-style|Western-inspired|braai-style|Jerez-style|all-round|country-weekend|add-on/);
assert.match(familyChat, /How do drinks work\?/);
assert.match(familyChat, /Guest arrival is 16:15 to 16:40/);
assert.match(familyChat, /Drinks reception and canapes run from 17:20 to 18:45/);
assert.doesNotMatch(familyChat, /bar will remain closed|kick-off|grab it before the bar closes|Rodeo-style|Western-inspired|braai-style/);
assert.match(checkinChat, /guest check in/);
assert.doesNotMatch(checkinChat, /Guest Check-In|check-in|last-minute/);

assert.match(plannerLoader, /hasSupabaseSettings/, "simple couple access must detect configured Supabase settings");
assert.match(plannerLoader, /hasSupabaseSettings\s*\?\s*null\s*:\s*addScript\("planner-access\.js"/, "simple couple access must not override configured Supabase auth");
assert.match(plannerLoader, /planner-checkin\.js/);
assert.match(planner, /id="login-username"/);
assert.match(planner, /id="login-password"/);
assert.match(planner, /Enter planner/);
assert.doesNotMatch(planner, /login-email|Send secure link|approved email address/);
assert.match(plannerAuth, /planner_login/);
assert.match(plannerAuth, /planner_get_session/);
assert.match(plannerAuth, /planner_load_all/);
assert.match(plannerAuth, /planner_logout/);
assert.doesNotMatch(plannerAuth, /signInWithOtp|auth\.getSession|allowed_users/);
assert.match(plannerForms, /planner_save_entity/);
assert.match(plannerForms, /planner_delete_entity/);
assert.match(plannerCheckin, /Guest Check In/);
assert.match(plannerCheckin, /Total invited/);
assert.match(plannerCheckin, /Guests by venue/);
assert.match(plannerCheckin, /Still attending/);
assert.match(plannerCheckin, /Still to check in/);
assert.match(plannerCheckin, /few days before/);
assert.doesNotMatch(plannerCheckin, /24-hour|24h/);
assert.match(plannerCheckin, /guest-list-tracker/);
assert.match(plannerCheckin, /Copy check in message/);
assert.doesNotMatch(plannerCheckin, /Guest Check-In|check-in|RSVP yes|Need RSVP|pre-wedding/);
assert.match(access, /ACCESS_DIGEST/);
assert.match(access, /crypto\.subtle\.digest\("SHA-256"/, "the entered code must be hashed in the browser");
assert.match(access, /localStorage\.setItem/);
assert.doesNotMatch(access, /const\s+(?:PIN|PASSWORD)\s*=\s*["']\d{4}["']/i, "the raw entry code must not be committed as a plain constant");
assert.doesNotMatch(access, /estimated:\s*\d{3,}|quote_amount:\s*\d{3,}|title:\s*"Spain venue"|name:\s*"Finca Mesa/i, "browser-mode fallback must not ship private budget or vendor seed data");
assert.match(sw, /pathname\.includes\("rsvp"\)/);
assert.match(sw, /url\.search/);
assert.match(sw, /mxc-guest-v20/);
assert.match(sw, /new Request\(request, \{ cache: "reload" \}\)/);
assert.match(sw, /style\.css\?v=20260913-guest-details/);
assert.match(sw, /guest\.js\?v=20260913-guest-details/);
assert.match(checkinSql, /checked_in_at/);
assert.match(checkinSql, /check_in_status/);
assert.match(checkinSql, /last_confirmed_at/);
assert.match(checkinStatusSql, /set_guest_checkin_from_rsvp/);
assert.match(checkinStatusSql, /checked_in/);
assert.match(checkinStatusSql, /cant_make_it/);
assert.match(checkinDropdownSql, /public_lookup_key/);
assert.match(checkinDropdownSql, /list_guest_checkin_options/);
assert.match(checkinDropdownSql, /get_rsvp_invitation_by_lookup/);
assert.match(checkinDropdownSql, /submit_rsvp_by_lookup/);
assert.match(checkinDropdownSql, /submit_rsvp_for_invitation/);
assert.match(checkinDropdownSql, /grant execute on function public\.list_guest_checkin_options\(\) to anon, authenticated/);
assert.match(checkinDropdownSql, /revoke all on function public\.submit_rsvp_for_invitation\(uuid, jsonb, text, text, text\) from public, anon, authenticated/);
assert.match(checkinDropdownLockdownSql, /revoke all on function public\.rsvp_invitation_payload\(uuid\) from public, anon, authenticated/);
assert.match(checkinDropdownLockdownSql, /grant execute on function public\.submit_rsvp_by_lookup\(text, jsonb, text, text, text\) to anon, authenticated/);
assert.match(plannerLoginSql, /planner_users/);
assert.match(plannerLoginSql, /planner_sessions/);
assert.match(plannerLoginSql, /planner_login/);
assert.match(plannerLoginSql, /planner_save_entity/);
assert.doesNotMatch(plannerLoginSql, /6288/);
assert.match(config, /supabaseUrl:\s*"https:\/\/uwupepywyldwmsktvxdt\.supabase\.co"/);
assert.match(config, /supabaseAnonKey:\s*"sb_publishable_[A-Za-z0-9_-]+"/);
assert.doesNotMatch(config, /service_role|SUPABASE_SERVICE_ROLE|sb_secret_/i);

const transportAnswer = "Transport will not be provided for either wedding. Please arrange your own travel to and from the venue.";
for (const source of [homepage, checkinPage, guest, chat, familyChat, checkinChat]) {
  assert.ok(source.includes(transportAnswer), "guest content must explain that guests arrange their own transport");
  assert.doesNotMatch(source, /bus pick\s*ups? (?:begin|starts?)|pickup locations and route|15:00 to 16:15|pickup locations confirmed/i);
}

// Run the real check-in startup and submission with only the remaining controls.
// Reordered cards also verify legacy values are preserved by guest ID.
for (const mode of ["token", "lookup"]) {
  const people = [
    { id: "one", name: "Alex", transport_needed: true, transport_location: "Saved hotel" },
    { id: "two", name: "Sam", transport_needed: false, transport_location: "" },
    { id: "three", name: "Jo", transport_needed: null, transport_location: null }
  ];
  const nodes = new Map();
  const getNode = (id) => {
    if (!nodes.has(id)) nodes.set(id, {
      value: "", style: {}, handlers: {},
      addEventListener(type, listener) { this.handlers[type] = listener; }
    });
    return nodes.get(id);
  };
  const stored = new Map([[mode === "token" ? "mxc-rsvp-token" : "mxc-rsvp-lookup", mode === "token" ? "a".repeat(48) : "b".repeat(32)]]);
  const calls = [];
  const context = {
    URL, URLSearchParams, console,
    document: { getElementById: getNode },
    sessionStorage: { getItem: (key) => stored.get(key), setItem: (key, value) => stored.set(key, value) },
    window: {
      location: new URL("https://example.test/rsvp.html"), scrollTo() {},
      MXC_CONFIG: { supabaseUrl: "https://example.test", supabaseAnonKey: "test" },
      supabase: { createClient: () => ({
        async rpc(name, payload) {
          calls.push({ name, payload });
          return { data: name.startsWith("get_") ? { celebration: mode === "token" ? "spain" : "south_africa", people } : {} };
        }
      }) }
    }
  };
  runInNewContext(checkinScript.replace("start().catch(", "globalThis.ready = start().catch("), context);
  await context.ready;
  assert.equal(getNode("rsvp-form-state").hidden, false, `${mode}: invitation loads`);
  assert.doesNotMatch(getNode("rsvp-people").innerHTML, /data-field="transport|Need transport|pick.?up/i);
  const cardPeople = [...people].reverse();
  const cards = cardPeople.map((person, index) => ({
    dataset: { personId: person.id },
    querySelector(selector) {
      if (selector === `input[name="attendance-${index}"]:checked`) return { value: index === 1 ? "no" : "yes" };
      const field = selector.match(/^\[data-field="(dietary|accommodation|notes)"\]$/)?.[1];
      assert.ok(field, `submission queried a removed or unexpected control: ${selector}`);
      return { value: `  ${field} ${person.id}  ` };
    }
  }));
  getNode("rsvp-people").querySelectorAll = () => cards;
  await getNode("rsvp-form").handlers.submit({ preventDefault() {} });
  const submission = calls.find(({ name }) => name.startsWith("submit_"));
  assert.ok(submission, `${mode}: check in submits without transport controls`);
  assert.equal(submission.name, mode === "token" ? "submit_rsvp" : "submit_rsvp_by_lookup");
  assert.deepEqual(JSON.parse(JSON.stringify(submission.payload.p_people)), cardPeople.map((person, index) => ({
    id: person.id, attending: index !== 1,
    dietary: `dietary ${person.id}`,
    transport_needed: person.transport_needed, transport_location: person.transport_location,
    accommodation: `accommodation ${person.id}`, notes: `notes ${person.id}`
  })));
  assert.equal(getNode("rsvp-success-state").hidden, false);
}

// Exercise the real routing with and without a configured remote chat endpoint.
const transportQuestions = ["What is the bus pickup time?", "Will there be wedding day transport?", "Is there a shuttle?", "How early is pickup?", "What time is the return bus?", "Can I confirm my pick-up for the children?"];
for (const chatEndpoint of ["", "https://example.test/chat"]) {
  const captures = [];
  const node = {
    dataset: {}, placeholder: "", setAttribute() {},
    addEventListener(type, listener, capture) { if (type === "submit" && capture) captures.push(listener); },
    querySelector() { return node; },
    appendChild(child) { this.lastMessage = child.textContent; }
  };
  let remoteCalls = 0;
  const context = {
    window: { MXC_CONFIG: { chatEndpoint } },
    document: {
      body: { classList: { contains: (name) => name === "guest-site" }, append() {} },
      querySelector: () => null, createElement: () => node
    },
    async fetch(_url, options) {
      remoteCalls++;
      assert.equal(JSON.parse(options.body).context.transport, transportAnswer);
      return { ok: true, json: async () => ({ answer: "Remote answer" }) };
    }
  };
  runInNewContext(chat.replace(/\}\)\(\);\s*$/, "globalThis.reply = respond; })();"), context);
  for (const question of transportQuestions) {
    assert.equal(await context.reply(question), transportAnswer, question);
  }
  assert.equal(remoteCalls, 0, "transport answers must not be overridden by a remote endpoint");
  const ordinaryReply = await context.reply("What are the ceremony times?");
  if (chatEndpoint) assert.equal(ordinaryReply, "Remote answer");
  else {
    assert.match(ordinaryReply, /guest arrival is 16:15 to 16:40/);
    assert.doesNotMatch(ordinaryReply, /bus|pickup|15:00/i);
  }
  // These capture listeners run before the base handler in the browser.
  context.document.querySelector = () => node;
  context.document.createTreeWalker = () => ({ nextNode: () => false });
  context.NodeFilter = { SHOW_TEXT: 4 };
  context.MutationObserver = class { observe() {} };
  runInNewContext(familyChat, context);
  runInNewContext(checkinChat, context);
  assert.equal(captures.length, 2);
  for (const listener of captures) {
    for (const question of transportQuestions) {
      node.value = question;
      node.lastMessage = "";
      let intercepted = false;
      listener({ preventDefault() {}, stopImmediatePropagation() { intercepted = true; } });
      assert.equal(intercepted, true, question);
      assert.equal(node.lastMessage, transportAnswer, question);
    }
  }
}

console.log("FAQ, transport routing and Guest Check In contracts passed.");
