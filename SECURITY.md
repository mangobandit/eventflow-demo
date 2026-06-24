# Privacy and security

This is a public website repository. It must contain only application code and information intentionally shared with wedding guests.

Never commit:

- guest names, email addresses or phone numbers
- dietary, transport or accommodation responses
- budgets, supplier contact details or private notes
- Matt or Cara's approved login email addresses
- raw RSVP invitation tokens or invite links
- Supabase service-role keys
- spreadsheet exports or private SQL seed files

The browser may contain the Supabase public anon key. This is expected. Access is enforced by Row Level Security in `supabase/schema.sql` and the SQL files in `supabase/migrations/`.

RSVP links are bearer credentials. The database stores only their SHA-256 hashes, but anyone holding a live link can view and update that one household. Rotate a link immediately if it is shared accidentally. RSVP pages and query-string requests are deliberately excluded from service-worker caching.

Report any accidental private-data exposure by taking the page offline first, rotating any affected keys, removing the data from the repository history and then restoring the public site.
