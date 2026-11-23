# GitHub and deployment workflow

The live repository is `mangobandit/eventflow-demo`, and `mxcwedding.com` is connected through the committed `CNAME` file.

## Publishing mxcwedding.com

`.github/workflows/deploy-pages.yml` publishes the repository root to GitHub Pages on every push to `main`. The workflow can only deploy once Pages is enabled on the repository, and **enabling Pages cannot be done from inside Actions**: the automatic `GITHUB_TOKEN` has no `administration` permission scope, so the Pages API answers `Resource not accessible by integration` when a workflow tries to create the Pages site.

Enable it in one of two ways:

1. **Settings UI (one-off).** Settings -> Pages -> Build and deployment -> Source: **GitHub Actions**. Then set Custom domain to `mxcwedding.com`. When the source is GitHub Actions, the custom domain is held in this setting, so set it here even though `CNAME` is committed.
2. **Admin token (no UI visit).** Add a repository secret `PAGES_ADMIN_TOKEN` holding a token with administration rights on the repository. The workflow's `Configure Pages` step then enables Pages itself on the next run.

Private repositories require a paid GitHub plan to serve Pages. On a free plan the repository must be made public before Pages can be enabled at all.

If a deploy fails, the workflow's **Preflight** step names the reason in the run log rather than leaving a bare `Not Found`.

### DNS

DNS is already correct and needs no change. The apex delegates to the four GitHub Pages addresses (`185.199.108-111.153`) and `www` is a `CNAME` to `mangobandit.github.io`.

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
