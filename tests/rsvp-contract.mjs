import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

assert.match(homepage, /Below you'll find guidance for both of our weddings\./);
assert.match(homepage, /we'll keep adding friendlier, more detailed updates as we get closer to each celebration/);
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
assert.match(homepage, /guest\.js\?v=20260704-timings/);
assert.match(homepage, /style\.css\?v=20260704-no-schedules/);
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
assert.equal((homepage.match(/<div><dt>Bus pick up \(Location TBC\)<\/dt><dd>15:00<\/dd><\/div>/g) || []).length, 2);
assert.equal((homepage.match(/<div><dt>Guest arrival<\/dt><dd>16:15 to 16:40<\/dd><\/div>/g) || []).length, 2);
assert.equal((homepage.match(/<div><dt>Ceremony<\/dt><dd>17:00<\/dd><\/div>/g) || []).length, 2);
assert.equal((homepage.match(/<div><dt>Celebration ends<\/dt><dd>01:00<\/dd><\/div>/g) || []).length, 2);
assert.doesNotMatch(homepage, /event-schedule|Spain day timings|South Africa day timings|Sunset is expected around|Dinner and speeches|Drinks and dancing/);
assert.doesNotMatch(homepage, /<dd>17:30<\/dd>|<dd>18:00<\/dd>|<dd>23:30<\/dd>|<dd>00:00<\/dd>/);
assert.equal((homepage.match(/https:\/\/www\.google\.com\/maps\/search\/\?api=1&amp;query=/g) || []).length, 12);
assert.match(homepage, /Arcos\+de\+la\+Frontera\+Cadiz\+Spain/);
assert.match(homepage, /Midlands\+Meander\+KwaZulu-Natal\+South\+Africa/);
assert.match(guestLayout, /experience-map-link/);
assert.doesNotMatch(homepage, /Save both dates\. South Africa accommodation options are below/);
assert.match(style, /style-core\.css\?v=20260704-mission-house-gallery/);
assert.match(style, /guest-layout\.css\?v=20260704-no-schedules/);
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
assert.match(checkinScript, /Last minute note for Matt & Cara/);
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

console.log("FAQ dedupe and Guest Check In contracts passed.");
