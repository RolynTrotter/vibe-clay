# Contributing to vibe-clay

Small, static, no-build project. The bar to run it is deliberately low.

## Workflow

1. Branch off `main` (don't commit straight to `main` once it's set up).
2. Make your change. Keep it framework-free — plain ES modules, no build step,
   so it stays deployable to GitHub Pages as-is.
3. Test locally:
   ```bash
   python3 -m http.server 8099   # then open http://localhost:8099
   ```
   Check the browser console is clean.
4. Open a **pull request** into `main`. The PR template will prompt you for the
   essentials. Draft PRs are welcome for work in progress.

## Branch protection (recommended repo settings)

To review work and keep `main` clean, in **Settings → Branches → Add rule** for
`main`:

- Require a pull request before merging (1 approval).
- Dismiss stale approvals on new commits.
- Require the **Deploy to GitHub Pages** status check to pass.
- (Optional) Require branches to be up to date before merging.

These are repo settings and can't be committed as code, so set them once in the
GitHub UI. Also set `main` as the **default branch** (Settings → General).

## Chemistry changes

`js/chemistry.js` and `data/materials.json` are the numbers that matter. If you
change them:

- Validate against a **known Insight-Live recipe** — export it, load it here, and
  compare UMF / Si:Al / expansion / LOI. Note the comparison in your PR.
- Material analyses are nominal and approximate. When you tighten one toward a
  supplier's or Digitalfire's real analysis, say so in the commit.

## Adding a material

Add an entry to `data/materials.json` with `oxides` (weight-%), `loi`, and
`aliases` (every spelling Insight-Live might export, so imports resolve). See
`skills/insight-live-navigator/SKILL.md` for the data model.
