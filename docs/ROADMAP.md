# Upgrade Roadmap · Guest Guide & Couple Portal

Status: **implemented** (Phases 0–5 delivered on this branch, July 2026).
Remaining follow-ups: apply `supabase/migrations/20260701_portal_upgrade.sql` to the live
project, and the post-Spain gallery/Walls.io embed from Phase 5.
Scope: `index.html` guest guide, `rsvp.html` check-in, `planner.html` couple portal, Supabase schema.

The dates drive the sequencing: **Spain · 10 October 2026** and **South Africa · 19 December 2026**.
Everything guest-facing must be stable well before early October; portal-internal work can land later.
Each phase below is intended to ship as its own small PR, in order. Nothing in any phase may violate
the repository security rule (no guest names, contacts, tokens or private seeds in the public repo).

---

## Phase 0 — Foundations & housekeeping (target: early July)

Low-risk cleanup that makes every later phase smaller and safer.

1. **Bake the Rodeo theme into the HTML.** `installRodeoTheme()` in `guest.js` currently rewrites
   the hero deck, intro copy, event leads, dress-code notes and practical cards at runtime while
   `index.html` still carries the old "elegant finca" copy. Move the Rodeo copy into the markup,
   delete the patch function. Fixes content flash, no-JS correctness and link-preview text.
2. **Single FAQ source in the HTML.** The five `<details>` hardcoded in `index.html` are discarded
   and replaced by the 15 `BUILT_IN_FAQS` in `guest.js` (and they contradict each other on children).
   Render the full list in the HTML; keep JS only for merging live Supabase FAQs via the existing
   `normalizeFaqTitle` dedupe.
3. **Normalize cache-busting.** The manual `?v=...` strings have drifted (`style.css` is versioned in
   `index.html` but not `rsvp.html`/`planner.html`). One shared version string, applied consistently.
4. **Decide the dead code.** `wedding-chat.js`, `wedding-chat-family.js`, `wedding-chat-checkin.js`
   and `guest-children-note.js` are loaded by no page. Either schedule the concierge chat for
   Phase 5 and mark it clearly, or delete it now (recoverable from git history).

*Done when:* `npm test` passes, a JS-disabled load of `index.html` shows correct Rodeo copy and the
full FAQ list, and every stylesheet/script reference carries the same version string.

## Phase 1 — Guest guide quick wins (target: July)

Small features with outsized guest value, all self-contained.

1. **Add-to-calendar.** Static `.ics` files per wedding (venue, arrival time, dress code in the
   description) linked from each date card and event section.
2. **Venue map links.** Google Maps / Apple Maps deep links on the Finca Mesa Jardín and Mission
   House cards — guests will navigate rural Andalusia and the KZN Midlands.
3. **Gifts & Walls.io section.** The FAQs already announce cash/EFT gifting and the private social
   wall, but no section anchors them. Add a short "Gifts & sharing" section (no banking details on
   the public site — "message us privately" only).
4. **Countdown polish.** Switch to hours/minutes inside the final 48 hours; keep the hourly tick
   otherwise.
5. **Announcement history + scheduling.** The live-updates block renders only `announcements[0]`
   and ignores the `publish_at` value the portal already collects. Show the latest 3 announcements,
   and enforce `publish_at <= now()` in the RLS policy (migration) so scheduled posts cannot leak
   early, with a matching client-side filter.

*Done when:* calendar files import cleanly in Apple/Google/Outlook, the publish-scheduling
migration is applied and a future-dated announcement is invisible to the anon client.

## Phase 2 — Portal data & quality-of-life (target: August)

1. **Persist the honeymoon planner.** `planner-honeymoon.js` stores everything in
   `localStorage` (`mxc-honeymoon-japan-v1`), so Matt and Cara hold divergent private copies. Add a
   `honeymoon_items` table under the existing owner RLS pattern, include it in `planner_load_all`,
   migrate the localStorage payload on first load.
2. **Fix extra-tasks persistence.** `planner-extra-tasks.js` pushes seeded tasks into in-memory
   state without writing through; seed via the normal insert path or a one-off migration instead.
3. **Table sorting + CSV export.** Click-to-sort headers on budget/guests/vendors/timeline; CSV
   export for the guest register (caterers, transport) and budget.
4. **Faster task flow.** One-click status cycling on task cards (or drag between kanban columns),
   plus delete/duplicate actions in the edit modal.
5. **Check-in visibility in the Guests view.** Add a "checked in" column joined from the RSVP
   tables and rollup counts ("14 need transport · 3 vegetarian") so the register is the single
   source of truth before each wedding.

*Done when:* honeymoon data survives a browser reset and is identical for both users; guest CSV
round-trips into a spreadsheet; check-in status is visible without leaving the Guests view.

## Phase 3 — Module refactor (target: late August / September)

The structural fix; deliberately after the quick wins so it carries no feature pressure.

1. Convert `planner-core/auth/views/forms` from shared-global concatenated scripts to ES modules.
2. Fold Check-In and Honeymoon into `planner.html` + `planner-views.js` as first-class views —
   removing the `setTimeout(waitForPlanner, 250)` polling loops, injected `<style>` blocks, nav
   injection and `renderAll`/`switchView` monkey-patching in `planner-checkin.js` /
   `planner-honeymoon.js`.
3. Delete the loader chain (`planner-rsvp.js` bootstrap, `planner-access.js` shim) once the views
   are native.

*Done when:* no module polls for planner globals, `planner.html` lists every view in its own
markup, and `npm run check:js` covers the new module layout.

## Phase 4 — Sync & auth hardening (target: September, before Spain)

1. **Freshness between two users.** The portal loads once via `planner_load_all` and never
   refreshes; stale writes silently win. Re-fetch on window focus plus a periodic refresh, and
   compare `updated_at` before overwriting with a "changed since you opened it" prompt.
   (Supabase Realtime is the stretch alternative if the RPC-auth model allows it cleanly.)
2. **Session renewal.** Sliding expiry so the token doesn't die mid-use; a "keep me signed in"
   choice controlling whether the token persists in `localStorage`.
3. **Structured auth errors.** Replace the regex match on error strings in `planner-auth.js`
   with explicit error codes returned by the RPCs.

*Done when:* two simultaneous sessions cannot silently clobber each other and an expired session
degrades to a clean re-login without data loss in an open form.

## Phase 5 — Stretch (post-Spain, before/after South Africa)

- **Guest concierge chat** — wire in the dormant `wedding-chat.js` FAQ-driven assistant (no
  backend required for canned answers).
- **Final-week mode** — guest page banner surfacing transport pickups and day-of timings once
  published; ties into the existing check-in window.
- **Photo gallery / Walls.io embed** — after Spain, share selected photos between the two weddings.
- **PWA polish** — offline copy of the essentials (venue, times, maps) for guests roaming abroad.

---

## Sequencing summary

| Phase | Theme | Ship as | Target |
|---|---|---|---|
| 0 | Foundations & dead code | PR 1 | early July |
| 1 | Guest quick wins | PR 2 (+ RLS migration) | July |
| 2 | Portal data & QoL | PR 3–4 | August |
| 3 | Module refactor | PR 5 | Sept |
| 4 | Sync & auth hardening | PR 6 | Sept (pre-Spain) |
| 5 | Stretch | as capacity allows | Oct–Dec |

Phases 0–1 are prerequisites for nothing but make everything after them smaller; Phase 3 should
not start until Phase 2 has shipped (it moves the same files); Phase 4 depends on Phase 3's module
layout only for convenience, not correctness, and can be pulled earlier if both users start editing
concurrently before then.
