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
- Supabase schema with Row Level Security
- Responsive mobile design and lightweight public PWA support

## Local preview

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

The guest site works without a database. The private portal stays closed until `config.js` and Supabase are configured. See `docs/SETUP.md`.

## Security rule

Never commit spreadsheet exports, guest names, contact details, dietaries, real approved-user emails, service-role keys or private Supabase seed files to this public repository.
