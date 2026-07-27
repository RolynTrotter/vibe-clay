# Changelog

Versions cover the whole project — the app, the chemistry engine, and the
packaged skill all ship under one number (`package.json` is the source of
truth). Format loosely follows [Keep a Changelog](https://keepachangelog.com);
versioning is [semver](https://semver.org).

## Unreleased

### Added

- **Release workflow** (`.github/workflows/skill.yml`) — pushing a `v*` tag
  builds the skill zip and attaches it to a GitHub Release, so the file you
  upload is a download rather than a build step. The same workflow builds and
  tests on every push and PR (Node 20, to catch anything that only works on
  22+), keeps the zip as an artifact, and fails a tag that doesn't match
  `package.json`.
- `npm run test:skill` — unzips the built artifact somewhere else and runs it
  from there: zip shape (one top-level folder, exactly one `SKILL.md`),
  the frontmatter rules the uploader enforces, and the engine's output for a
  known recipe.

## [1.0.0] — 2026-07-27

First versioned release, and the first one packaged as a distributable skill.

### Added

- **Skill packaging** — `npm run build:skill` assembles `dist/vibe-clay/` (the
  chemistry engine, materials data, the analyzer CLI, and the other skills as
  reference docs) and zips it as `dist/vibe-clay-<version>.zip`, ready to upload
  as a custom skill so regular Claude chats can do glaze chemistry.
- `skills/vibe-clay/SKILL.md` — the packaged skill's entry point.
- Version number, shown in the app footer and checked across `package.json`,
  `SKILL.md`, `index.html`, and this file by the build (`npm run check:version`).
- `package.json` with `"type": "module"`, so the analyzer's ES-module imports
  work on Node 18 and 20 as well as 22+.

### Already here at 1.0.0

- Glaze chemistry engine: UMF/Seger, oxide weight-% and mole-%, SiO₂:Al₂O₃,
  SiB:Al, R₂O:RO, KNaO, relative thermal expansion, LOI, batch cost, and base vs
  additions — validated against real Insight-Live output (G2926B Spodumene).
- Line blend: two glazes → N points, full analysis at each, in the app and via
  `--blend N`.
- Insight-Live XML import/export with material alias resolution.
- Mobile-first UI, offline once loaded, deployed to GitHub Pages.
- Analyzer CLI (`tools/analyze.mjs`) with `--target` limit flagging.
- Claude skills: `glaze-qa`, `draft-recipe`, `insight-live-navigator`,
  `make-issue`.
