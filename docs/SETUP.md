# Secure setup for mxcwedding.com

The repository can stay public because it contains only application code and public guest content. **Guest names, contact details, dietaries, private tasks and budgets must live only in Supabase.** Do not commit the generated secure seed files.

## 1. Create the private database

1. Create a new Supabase project in a region suitable for you.
2. Open **SQL Editor** and run `supabase/schema.sql` in full.
3. Run each SQL file in `supabase/migrations/` in filename order. The latest migration is `20260701_portal_upgrade.sql` (honeymoon persistence, sliding sessions, structured errors, conflict-safe saves). The web client keeps working against the previous schema until it is applied, but apply it before relying on the Honeymoon tab syncing between devices.
4. In a new private SQL query, add the two approved users using their real lowercase email addresses:

```sql
insert into public.allowed_users (email, planner_person, display_name) values
  ('MATT_EMAIL_HERE', 'matt', 'Matt'),
  ('CARA_EMAIL_HERE', 'cara', 'Cara')
on conflict (email) do update
set planner_person = excluded.planner_person,
    display_name = excluded.display_name;
```

Do not put those real emails into GitHub because this repository is public.

## 2. Configure magic-link sign-in

In Supabase **Authentication → URL Configuration**:

- Site URL: `https://mxcwedding.com`
- Additional redirect URL: `https://mxcwedding.com/planner.html`
- During local testing you may also add `http://localhost:8000/planner.html`

Magic links are intentionally used instead of shared passwords. An authenticated account still receives no planner data unless its email is present in `allowed_users`.

## 3. Connect the website

Open `config.js` and paste:

- the Supabase **Project URL**
- the Supabase public **anon key**

The anon key is safe to use in browser code. Row Level Security is what protects the data. Never place the service-role key in this repository or in browser JavaScript.

## 4. Import the spreadsheet safely

Two files are generated outside the repository:

- `MXC_Wedding_Secure_Import.json` — readable backup/import package
- `MXC_Wedding_Supabase_Seed.sql` — SQL inserts for the private tables

Review the SQL, then run it in Supabase SQL Editor. It includes guest data, so keep it private and delete local copies when no longer needed.

## 5. Configure and test RSVP

Follow `docs/RSVP_SETUP.md` to create a test household, submit a response, rotate the link and verify anonymous table access is denied.

## 6. Publish and test

Before merging/deploying:

1. Sign in with Matt's approved email.
2. Confirm Shared, Matt and Cara planner lenses work.
3. Confirm an unapproved email cannot see any table data.
4. Add a draft announcement and verify it does not appear publicly.
5. Publish it and verify it appears on the guest guide.
6. Test the public site in a private browser window without signing in.
7. Confirm old budget/guest/vendor URLs redirect to the authenticated planner and contain no private HTML.
8. Confirm `rsvp.html` removes invitation tokens from the visible URL and is not cached by the service worker.
9. Run `npm test` and confirm the site security contracts pass.

## Privacy model

- Public guest page: wedding dates, venue guidance, travel suggestions, accommodation guidance, things to do, FAQs and deliberately published updates.
- Private couple portal: guest records, invitations, RSVP responses, budgets, supplier contacts, private notes, action board and planning timeline.
- Private RSVP page: a bearer-token view limited to one household; anonymous users never receive table access.
- Publishing is one-way and explicit: only `content_blocks.published = true` is readable anonymously.
