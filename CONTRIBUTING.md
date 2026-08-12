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

## Skills and the packaged zip

`skills/` holds the Claude skills. Four are for working in this repo;
`skills/vibe-clay/` is the one that gets packaged and uploaded so a **regular
Claude chat** can do glaze chemistry.

```bash
npm run build:skill      # → dist/vibe-clay-<version>.zip  (dist/ is gitignored)
npm run test:skill       # then check the artifact is actually uploadable
```

`test:skill` unzips the real artifact into a temp directory and runs it from
there, so a file that didn't make it into the bundle fails here instead of in
someone's chat. It checks the zip's shape (one top-level folder, **exactly one**
`SKILL.md` — zipping the repo by hand gives you five and the upload is
rejected), the frontmatter rules the uploader enforces, and the engine's output
for a known recipe. CI runs both on every push and PR.

The build copies the engine, the data, the CLI, and `glaze-qa`,
`draft-recipe`, and `insight-live-navigator` (as `references/*.md`, frontmatter
stripped, cross-links rewritten) into one folder. So:

- Improving those three skills improves the packaged skill for free — no copy to
  keep in sync.
- Changing what the CLI is called, or which files it reads, means updating the
  `FILES` list in `tools/build-skill.mjs`.
- After changing any of it, rebuild and actually run the result from outside the
  repo — `unzip` somewhere else and run
  `node <there>/vibe-clay/tools/analyze.mjs` — so a missing file shows up here
  and not in someone's chat.

## Releasing / version bumps

One version covers the app, the engine, and the skill. `package.json` is the
source of truth; three files carry a copy:

| File | Where |
|---|---|
| `package.json` | `version` |
| `skills/vibe-clay/SKILL.md` | `metadata.version` |
| `index.html` | the footer's `<span id="version">` |
| `CHANGELOG.md` | the top `## [x.y.z]` heading |

`npm run check:version` fails on drift, and `build:skill` checks before it
packages. Semver: a chemistry result changing for the same input is a **major**
bump — someone's recipe notes depend on those numbers.

Once the bump is merged, tag `main`:

```bash
git tag v1.2.3 && git push origin v1.2.3
```

That publishes a Release with the zip attached. The workflow rejects a tag that
doesn't match `package.json`, so a forgotten bump fails loudly instead of
shipping a mislabelled zip. Uploaded skills don't auto-update — a new zip means
re-uploading it in claude.ai.

## Adding a material

Add an entry to `data/materials.json` with `oxides` (weight-%), `loi`, and
`aliases` (every spelling Insight-Live might export, so imports resolve). See
`skills/insight-live-navigator/SKILL.md` for the data model.
