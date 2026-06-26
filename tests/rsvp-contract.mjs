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
const config = read("config.js");

assert.match(checkinPage, /Matt & Cara · Guest Check-In/);
assert.match(checkinPage, /Confirm your household before the celebration/);
assert.match(checkinPage, /Are you still<br>joining us\?/);
assert.match(checkinPage, /Send check-in/);
assert.match(checkinPage, /Check-in received/);
assert.doesNotMatch(checkinPage, /Private RSVP|Send RSVP|Open your RSVP|Will you<br>join us\?/);

assert.match(checkinScript, /get_rsvp_invitation/);
assert.match(checkinScript, /submit_rsvp/);
assert.match(checkinScript, /Checked in — still coming/);
assert.match(checkinScript, /Can't make it/);
assert.match(checkinScript, /Last-minute note for Matt & Cara/);
assert.doesNotMatch(checkinScript, /Joyfully yes|Sadly no|Saving your response|Your RSVP/);

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
assert.match(guest, /function normalizeFaqTitle/);
assert.match(guest, /renderFaqList\(faqs\)/);
assert.doesNotMatch(guest, /Can children attend/);
assert.match(guest, /Guest Check-In/);
assert.doesNotMatch(guest, /Open your RSVP|Guest RSVP|navLink\.textContent = "RSVP"/);

assert.match(plannerLoader, /planner-checkin\.js/);
assert.match(plannerCheckin, /Guest Check-In/);
assert.match(plannerCheckin, /Total invited/);
assert.match(plannerCheckin, /Copy check-in message/);
assert.match(access, /ACCESS_DIGEST/);
assert.match(access, /localStorage\.setItem/);
assert.match(sw, /pathname\.includes\("rsvp"\)/);
assert.match(sw, /url\.search/);
assert.match(checkinSql, /checked_in_at/);
assert.match(checkinSql, /check_in_status/);
assert.match(checkinSql, /last_confirmed_at/);
assert.match(config, /supabaseUrl:\s*""/);
assert.match(config, /supabaseAnonKey:\s*""/);

console.log("FAQ dedupe and Guest Check-In contracts passed.");
