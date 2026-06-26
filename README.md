# Matt & Cara Wedding House

A high-end wedding planning and guest experience for `mxcwedding.com`.

## What is included

- Public guest guide for the Spain and South Africa celebrations
- Travel route recommendations and short/extended itineraries
- Accommodation and things-to-do guidance
- Private magic-link portal for Matt and Cara
- Separate Shared, Matt and Cara planner lenses
- Three-state workflow: Outstanding, Pending and Approved
- Secure budgets, guest register, suppliers and timeline
- Controlled guest publishing for announcements and FAQs
- Guest check-in flow for 24-hour/day-of household head counts
- Secure household links with no guest account required
- Check-in synchronization into the private guest register
- Supabase schema and migrations protected by Row Level Security
- Responsive mobile design and lightweight public PWA support
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
