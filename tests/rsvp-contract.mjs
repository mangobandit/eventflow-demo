import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (file) => readFileSync(resolve(root, file), "utf8");

const checkinPage = read("rsvp.html");
const guest = read("guest.js");
const checkinScript = read("rsvp.js");
const plannerLoader = read("planner-rsvp.js");
const plannerCheckin = read("planner-checkin.js");
const access = read("planner-access.js");
const sw = read("sw.js");
const checkinSql = read("supabase/migrations/20260626_guest_checkin_fields.sql");
const checkinStatusSql = read("supabase/migrations/20260630_checkin_confirmation_status.sql");
const config = read("config.js");

assert.match(checkinPage, /Matt & Cara · Guest Check-In/);
assert.match(checkinPage, /Confirm your household before the celebration/);
assert.match(checkinPage, /few days before the celebration/);
assert.match(checkinPage, /Are you still<br>joining us\?/);
assert.match(checkinPage, /Send check-in/);
assert.match(checkinPage, /Check-in received/);
assert.doesNotMatch(checkinPage, /Private RSVP|Send RSVP|Open your RSVP|Will you<br>join us\?/);
assert.doesNotMatch(checkinPage, /24 hours before/);

assert.match(checkinScript, /get_rsvp_invitation/);
assert.match(checkinScript, /submit_rsvp/);
assert.match(checkinScript, /DEMO_TOKEN/);
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

expectedFaqs.forEach((title) => assert.match(guest, new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))));
assert.match(guest, /const BUILT_IN_FAQS = \[/);
assert.match(guest, /const CHECK_IN_ENABLED = true;/, "guest check-in must stay visible after RSVP is archived");
assert.match(guest, /if\s*\(\s*!CHECK_IN_ENABLED\s*\)\s*return;/, "check-in visibility must be controlled separately from archived RSVP");
assert.match(guest, /function normalizeFaqTitle/);
assert.match(guest, /renderFaqList\(faqs\)/);
assert.doesNotMatch(guest, /Can children attend/);
assert.match(guest, /Guest Check-In/);
assert.doesNotMatch(guest, /Open your RSVP|Guest RSVP|navLink\.textContent = "RSVP"/);

assert.match(plannerLoader, /hasSupabaseSettings/, "simple couple access must detect configured Supabase settings");
assert.match(plannerLoader, /hasSupabaseSettings\s*\?\s*null\s*:\s*addScript\("planner-access\.js"/, "simple couple access must not override configured Supabase auth");
assert.match(plannerLoader, /planner-checkin\.js/);
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
assert.match(config, /supabaseUrl:\s*""/);
assert.match(config, /supabaseAnonKey:\s*""/);

console.log("FAQ dedupe and Guest Check-In contracts passed.");
