# GitHub and deployment workflow

The live repository is `mangobandit/eventflow-demo`, and `mxcwedding.com` is connected through the committed `CNAME` file.

## Current structure

- `main` contains the public guest guide and private couple planner.
- RSVP work is developed on a feature branch and merged through a pull request.
- Supabase setup is separate from GitHub deployment. The website can deploy while the private planner and RSVP system remain safely unconfigured.

## Safe update workflow

```powershell
git clone https://github.com/mangobandit/eventflow-demo.git
cd eventflow-demo
git switch main
git pull --ff-only
git switch -c feat/your-change
```

Make the change, then run:

```powershell
npm test
git diff --check
git status --short
git add <only-the-intended-files>
git commit -m "Describe the change"
git push -u origin feat/your-change
```

Open a pull request, review the public/private boundary and merge only after checks pass.

## Never push

- spreadsheet exports or private SQL seeds
- real guest data, dietaries or contact details
- Matt or Cara's allowlisted login emails
- raw RSVP invitation links or tokens
- Supabase service-role keys

The project URL and public anon key may be present in `config.js` when the site is connected, but every private table and function must remain protected by the committed Row Level Security rules.
