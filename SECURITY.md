# Privacy and security

This is a public website repository. It must contain only application code and information intentionally shared with wedding guests.

Never commit:

- guest names, email addresses or phone numbers
- dietary, transport or accommodation responses
- budgets, supplier contact details or private notes
- Matt or Cara's approved login email addresses
- Supabase service-role keys
- spreadsheet exports or private SQL seed files

The browser may contain the Supabase public anon key. This is expected. Access is enforced by Row Level Security in `supabase/schema.sql`.

Report any accidental private-data exposure by taking the page offline first, rotating any affected keys, removing the data from the repository history and then restoring the public site.
