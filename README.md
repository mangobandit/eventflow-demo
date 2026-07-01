# Matt & Cara Wedding House

A high-end wedding planning and guest experience for `mxcwedding.com`.

## What is included

- Public guest guide for the Spain and South Africa celebrations
- Add-to-calendar files and venue map links for both weddings
- Travel route recommendations and short/extended itineraries
- Accommodation, gifts/sharing and things-to-do guidance
- Guest concierge chat answering wedding questions from the guide
- Wedding-week banner with a direct Guest Check-In call to action
- Private username/password portal for Matt and Cara
- Separate Shared, Matt and Cara planner lenses
- Three-state workflow: Outstanding, Pending and Approved
- Secure budgets, guest register, suppliers and timeline
- Sortable tables and private CSV exports for every data view
- Guest Check-In tracker and synced Honeymoon planner as native views
- Controlled guest publishing with scheduling and update history
- Guest check-in flow for few-day/day-of household head counts
- Secure household links with no guest account required
- Check-in synchronization into the private guest register
- Conflict-safe saves, sliding sessions and focus refresh for two editors
- Supabase schema and migrations protected by Row Level Security
- Responsive mobile design and lightweight public PWA support with offline essentials
- Automated JavaScript and privacy-contract checks in GitHub Actions

## Local preview

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

The guest guide works without a database. The private planner and guest check-in system stay closed until `config.js` and Supabase are configured.

- Base setup: `docs/SETUP.md`
- Guest check-in setup and acceptance checks: `docs/RSVP_SETUP.md`
- Existing GitHub deployment notes: `docs/GIT_DEPLOY.md`

Run the repository checks with:

```bash
npm test
```

## Security rule

Never commit spreadsheet exports, guest names, contact details, dietaries, real approved-user emails, raw invitation/check-in tokens, service-role keys or private Supabase seed files to this public repository.
