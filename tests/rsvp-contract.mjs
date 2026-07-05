import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (file) => readFileSync(resolve(root, file), "utf8");

const checkinPage = read("rsvp.html");
const guestPage = read("index.html");
const guest = read("guest.js");
const checkinScript = read("rsvp.js");
const planner = read("planner.html");
const plannerCore = read("planner-core.js");
const plannerAuth = read("planner-auth.js");
const plannerForms = read("planner-forms.js");
const plannerCheckin = read("planner-checkin.js");
const plannerHoneymoon = read("planner-honeymoon.js");
const plannerExtras = read("planner-extra-tasks.js");
const access = read("planner-access.js");
const sw = read("sw.js");
const checkinSql = read("supabase/migrations/20260626_guest_checkin_fields.sql");
const checkinStatusSql = read("supabase/migrations/20260630_checkin_confirmation_status.sql");
const checkinDropdownSql = read("supabase/migrations/20260630_guest_checkin_dropdown.sql");
const checkinDropdownLockdownSql = read("supabase/migrations/20260630_guest_checkin_dropdown_lockdown.sql");
const plannerLoginSql = read("supabase/migrations/20260630_planner_username_login.sql");
const config = read("config.js");

assert.match(checkinPage, /Matt & Cara · Guest Check-In/);
assert.match(checkinPage, /Confirm your household before the celebration/);
assert.match(checkinPage, /few days before the celebration/);
assert.match(checkinPage, /Are you still<br>joining us\?/);
assert.match(checkinPage, /id="rsvp-select-form"/);
assert.match(checkinPage, /id="rsvp-guest-select"/);
assert.match(checkinPage, /Your name or household/);
assert.match(checkinPage, /Or use a code/);
assert.match(checkinPage, /Send check-in/);
assert.match(checkinPage, /Check-in received/);
assert.doesNotMatch(checkinPage, /Private RSVP|Send RSVP|Open your RSVP|Will you<br>join us\?/);
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
assert.match(checkinScript, /Checked in — still coming/);
assert.match(checkinScript, /Can't make it/);
assert.match(checkinScript, /Last-minute note for Matt & Cara/);
assert.doesNotMatch(checkinScript, /Joyfully yes|Sadly no|Saving your response|Your RSVP/);
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
  "Will there be wedding-day transport?",
  "Is there parking at the venue?",
  "Can children come?",
  "What gifts should I bring?",
  "Can I take photos or post online?",
  "What is Walls.io?",
  "When should we book flights?"
];

// Content cross-checked against the original mxcwedding.squarespace.com
// pages (July 2026): run sheets and shuttle details must keep matching what
// guests were originally told. Gifts wording was updated by the couple on
// 2026-07-05: contributions welcome in EUR, ZAR or GBP, presence-first tone,
// and never any banking details on the public site.
assert.match(guestPage, /Your presence is the greatest gift we could ask for\. If you would like to give something/);
assert.match(guestPage, /we can accept EUR, ZAR or GBP/);
assert.doesNotMatch(guestPage, /IBAN|account number|sort code|branch code|swift/i, "banking details must never appear on the public site");
assert.match(guestPage, /Join us for our first celebration in this Spanish finca surrounded by gardens with views over Sierra de Grazalema\./);
assert.match(guestPage, /Join us for our second celebration in the Midlands Meander of KwaZulu-Natal\./);
["17:30", "18:00", "18:30", "19:30", "20:30", "21:00", "23:30"].forEach((time) => assert.match(guestPage, new RegExp(`<li><b>${time}</b>`)));
["16:30", "19:00", "20:00", "23:00"].forEach((time) => assert.match(guestPage, new RegExp(`<li><b>${time}</b>`)));
assert.match(guestPage, /shuttle bus runs from Chiclana to the venue \(departing 16:45\)/i);
assert.match(guestPage, /Durban \(via Howick\) to the venue departing 15:30/);
assert.match(guestPage, /Istanbul \(Turkish Airlines\) or Dubai \(Emirates\)/);
assert.match(guestPage, /we recommend Safair/);
assert.match(guestPage, /uMhlanga and Ballito/);

// index.html is the single source of built-in FAQ and Rodeo theme copy.
expectedFaqs.forEach((title) => assert.match(guestPage, new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))));
assert.match(guestPage, /Don't have a cowboy hat\? We'll provide one for you\./);
assert.match(guestPage, /Rodeo Western/, "the Rodeo dress feel must be baked into the markup, not patched by JS");
assert.doesNotMatch(guestPage, /Elegant finca|Country summer|Can children attend/, "stale pre-Rodeo copy must not reappear in the markup");
assert.match(guest, /const STATIC_FAQS = /, "guest.js must read built-in FAQs from the markup");
assert.doesNotMatch(guest, /BUILT_IN_FAQS|installRodeoTheme/, "the runtime theme/FAQ patch layer must stay deleted");
assert.match(guest, /const CHECK_IN_ENABLED = true;/, "guest check-in must stay visible after RSVP is archived");
assert.match(guest, /if\s*\(\s*!CHECK_IN_ENABLED\s*\)\s*return;/, "check-in visibility must be controlled separately from archived RSVP");
assert.match(guest, /function normalizeFaqTitle/);
assert.match(guest, /renderFaqList\(faqs\)/);
assert.match(guest, /Guest Check-In/);
assert.doesNotMatch(guest, /Open your RSVP|Guest RSVP|navLink\.textContent = "RSVP"/);

// The demo PIN gate may only ever load when Supabase is unconfigured.
assert.match(plannerCore, /if \(!config\.supabaseUrl && !config\.supabaseAnonKey\) \{/, "simple couple access must not override configured Supabase auth");
assert.match(plannerCore, /planner-access\.js/);
// Check-In and Honeymoon are first-class planner views: static nav + panels,
// no runtime nav injection or render monkey-patching.
assert.match(planner, /data-view="checkin"/);
assert.match(planner, /data-view-panel="checkin"/);
assert.match(planner, /data-view="honeymoon"/);
assert.match(planner, /data-view-panel="honeymoon"/);
assert.match(planner, /planner-checkin\.js/);
assert.match(planner, /planner-honeymoon\.js/);
assert.doesNotMatch(plannerCheckin, /waitForPlanner|setTimeout\(waitForPlanner|originalRenderAll/, "check-in must stay a native view, not a polling patch");
assert.doesNotMatch(plannerHoneymoon, /waitForPlanner|localStorage\.setItem\(LEGACY_HONEYMOON_STORE,/, "honeymoon data must live in the planner store, not browser-only storage");
assert.match(plannerHoneymoon, /honeymoon_items/);
assert.match(plannerHoneymoon, /mxc:planner-ready/);
assert.match(plannerExtras, /mxc:planner-ready/);
assert.match(plannerExtras, /planner_save_entity/, "the starter checklist must persist through the secure save path");
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
assert.match(plannerCheckin, /Guest Check-In/);
assert.match(plannerCheckin, /Total invited/);
assert.match(plannerCheckin, /Guests by venue/);
assert.match(plannerCheckin, /Still attending/);
assert.match(plannerCheckin, /Still to check in/);
assert.match(plannerCheckin, /few days before/);
assert.doesNotMatch(plannerCheckin, /24-hour|24h/);
assert.match(plannerCheckin, /guest-list-tracker/);
assert.match(plannerCheckin, /Copy check-in message/);
assert.match(access, /ACCESS_DIGEST/);
assert.match(access, /crypto\.subtle\.digest\("SHA-256"/, "the entered code must be hashed in the browser");
assert.match(access, /localStorage\.setItem/);
assert.doesNotMatch(access, /const\s+(?:PIN|PASSWORD)\s*=\s*["']\d{4}["']/i, "the raw entry code must not be committed as a plain constant");
assert.doesNotMatch(access, /estimated:\s*\d{3,}|quote_amount:\s*\d{3,}|title:\s*"Spain venue"|name:\s*"Finca Mesa/i, "browser-mode fallback must not ship private budget or vendor seed data");
assert.match(sw, /pathname\.includes\("rsvp"\)/);
assert.match(sw, /url\.search/);
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

const portalUpgradeSql = read("supabase/migrations/20260701_portal_upgrade.sql");
assert.match(portalUpgradeSql, /create table if not exists public\.honeymoon_items/);
assert.match(portalUpgradeSql, /p_expected_updated_at timestamptz default null/, "saves must support optimistic concurrency");
assert.match(portalUpgradeSql, /PLANNER_CONFLICT/);
assert.match(portalUpgradeSql, /PLANNER_SESSION_EXPIRED/);
assert.match(portalUpgradeSql, /greatest\(expires_at, now\(\) \+ interval '12 hours'\)/, "sessions must renew on use");
assert.match(portalUpgradeSql, /revoke all on public\.honeymoon_items from public, anon/);
assert.match(config, /supabaseUrl:\s*"https:\/\/uwupepywyldwmsktvxdt\.supabase\.co"/);
assert.match(config, /supabaseAnonKey:\s*"sb_publishable_[A-Za-z0-9_-]+"/);
assert.doesNotMatch(config, /service_role|SUPABASE_SERVICE_ROLE|sb_secret_/i);

console.log("FAQ dedupe and Guest Check-In contracts passed.");
