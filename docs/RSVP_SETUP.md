# Secure RSVP control centre

The RSVP system uses private, one-time-generated household links. It does **not** expose the guest list to the public website and it does not require guests to create accounts.

## Install

1. Complete the base setup in `docs/SETUP.md` and run `supabase/schema.sql`.
2. Run `supabase/migrations/20260624_rsvp_control_centre.sql` in the same Supabase project.
3. Confirm `config.js` contains the Supabase project URL and public anon key.
4. Sign in to `planner.html` with an allowlisted Matt or Cara email.
5. Open **Invitations & RSVP** in the planner sidebar.

## Create and send an invitation

1. Select the correct planner lens: Shared, Matt or Cara.
2. Select Spain or South Africa when useful.
3. Create a household invitation and enter one guest name per line.
4. Copy the private link immediately. The raw token is returned once and is never stored in the database.
5. Send the link privately by email or WhatsApp.
6. Mark the invitation as sent in the planner.

A fresh link can be generated later. Generating one immediately invalidates the previous link.

## Guest flow

The guest opens `rsvp.html#invite=...`. The token is placed in the URL fragment, so it is not sent to the web server in the HTTP request. The browser:

- moves the token into session storage, removes it from the visible URL and purges any old RSVP cache entries
- calls a restricted Supabase RPC to retrieve only that household
- lets the guest answer for every named person
- saves dietary, transport, accommodation and contact information
- synchronizes the response into the existing private `guests` table

The service worker deliberately refuses to cache RSVP pages, query-string requests or `config.js`.

## Security model

- Tokens contain 192 bits of cryptographic randomness.
- The database stores only a SHA-256 token hash and a six-character hint.
- Anonymous users cannot select, insert, update or delete either RSVP table.
- Anonymous execution is granted only to `get_rsvp_invitation(text)` and `submit_rsvp(...)`.
- All planner creation, rotation, sent, revoke and delete operations require an authenticated email in `allowed_users`.
- RSVP deletion also removes the guest rows synchronized from that invitation, avoiding stale private records.
- Tokens are bearer credentials. Send them privately and generate a fresh link if one is accidentally shared.

## Acceptance checks

Before sending real invitations:

1. Create a test household with two people.
2. Open its link in a private browser window.
3. Confirm the URL is scrubbed after the page loads.
4. Submit one yes and one no response.
5. Confirm both people appear in the private guest register with the correct dietary and transport details.
6. Reopen the same link and update the answers.
7. Generate a fresh link and confirm the previous link stops working.
8. Revoke the invitation and confirm the latest link stops working.
9. Confirm an anonymous Supabase table query for `rsvp_invitations` and `rsvp_people` is denied.
10. Run `npm test` locally or check the GitHub Actions **Site security contracts** workflow.

## Deliberate limitations

- This phase does not send email or WhatsApp messages automatically.
- It does not provide identity proof beyond possession of the private household token.
- It does not rate-limit at the web edge. The token entropy makes guessing impractical; stricter abuse controls can later be added with a Supabase Edge Function or WAF.
