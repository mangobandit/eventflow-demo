import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (file) => readFileSync(resolve(root, file), "utf8");

const html = read("rsvp.html");
const guest = read("guest.js");
const rsvp = read("rsvp.js");
const admin = read("planner-rsvp.js");
const core = read("planner-core.js");
const sw = read("sw.js");
const sql = read("supabase/migrations/20260624_rsvp_control_centre.sql");
const config = read("config.js");

assert.match(html, /name="referrer" content="no-referrer"/i, "RSVP page must suppress referrers");
assert.match(html, /noindex,nofollow,noarchive,nosnippet/i, "RSVP page must not be indexed");
assert.match(html, /rsvp\.js/, "RSVP page must load its controller");

assert.match(rsvp, /sessionStorage\.setItem/, "token must move into session storage");
assert.match(rsvp, /history\.replaceState/, "token must be scrubbed from the URL");
assert.match(rsvp, /URLSearchParams\(url\.hash/, "new RSVP links must use a fragment that is not sent to the server");
assert.match(rsvp, /purgeRsvpCaches/, "RSVP controller must purge legacy cached invitation requests");
assert.doesNotMatch(rsvp, /localStorage/, "RSVP token must not persist in local storage");
assert.match(rsvp, /rpc\("get_rsvp_invitation"/, "guest lookup must use restricted RPC");
assert.match(rsvp, /rpc\("submit_rsvp"/, "guest submission must use restricted RPC");
assert.match(rsvp, /\^\[0-9a-f\]\{48\}\$/i, "client must validate a 48-character token");

assert.match(guest, /Open your RSVP/, "guest guide must expose the RSVP entry point");
assert.match(core, /planner-rsvp\.js/, "private planner must load the RSVP control centre");
assert.match(admin, /rsvp\.html#invite=/, "planner must generate fragment-based private links");
assert.match(admin, /rotate_rsvp_invitation/, "planner must rotate compromised links");
assert.match(admin, /delete_rsvp_invitation/, "planner must delete synced RSVP records through the safe RPC");
assert.doesNotMatch(admin, /from\("rsvp_invitations"\)\.delete/, "planner must not bypass safe RSVP deletion");

assert.match(sw, /pathname\.includes\("rsvp"\)/, "service worker must bypass RSVP paths");
assert.match(sw, /url\.search/, "service worker must bypass query-string requests");
assert.doesNotMatch(sw, /rsvp\.html.*PUBLIC_ASSETS/s, "RSVP HTML must not be precached");

assert.match(sql, /gen_random_bytes\(24\)/, "tokens must contain 192 bits of randomness");
assert.match(sql, /digest\(v_token, 'sha256'\)/, "raw tokens must be hashed before storage");
assert.match(sql, /token_hash bytea not null unique/, "token hashes must be unique");
assert.doesNotMatch(sql, /\btoken\s+text\s+not null/i, "raw tokens must never be stored in a table column");
assert.match(sql, /alter table public\.rsvp_invitations enable row level security/i);
assert.match(sql, /alter table public\.rsvp_people enable row level security/i);
assert.match(sql, /revoke all on public\.rsvp_invitations from anon/i);
assert.match(sql, /revoke all on public\.rsvp_people from anon/i);
assert.match(sql, /grant execute on function public\.get_rsvp_invitation\(text\) to anon, authenticated/i);
assert.match(sql, /grant execute on function public\.submit_rsvp\(text, jsonb, text, text, text\) to anon, authenticated/i);
assert.doesNotMatch(sql, /grant (select|insert|update|delete).*rsvp_(invitations|people).*anon/i, "anon must never receive table access");
assert.match(sql, /delete from public\.guests where rsvp_invitation_id = p_invitation_id/i, "safe delete must remove synchronized guest rows");

assert.match(config, /supabaseUrl:\s*""/, "repository must not commit a live project URL by default");
assert.match(config, /supabaseAnonKey:\s*""/, "repository must not commit a project key by default");
assert.doesNotMatch([html, guest, rsvp, admin, core, sw, sql].join("\n"), /service_role|eyJ[a-zA-Z0-9_-]{20,}\./, "no service-role or JWT-like secret may be committed");

console.log("RSVP security and integration contracts passed.");
