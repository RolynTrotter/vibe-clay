# Changelog

Versions cover the whole project — the app, the chemistry engine, and the
packaged skill all ship under one number (`package.json` is the source of
truth). Format loosely follows [Keep a Changelog](https://keepachangelog.com);
versioning is [semver](https://semver.org).

## [1.1.0] — 2026-08-01

The release that makes the app usable day to day: it remembers your work, takes
a pasted recipe, hands one back in Insight-Live's own format, and runs with no
signal.

### Added

- **Your work persists.** The imported library, the recipe in the builder, and
  the chosen firing target are saved to the device and restored on the next
  visit (`js/store.js`). Nothing leaves the phone. If a browser blocks storage
  (private mode), the app says so instead of quietly losing the recipe.
- **Paste a recipe** (`js/paste-import.js`). Copy a recipe out of Insight-Live,
  a book, or a forum post and paste it in. Handles trailing amounts, leading
  amounts, dot leaders, tabs and colons; an "Additions"/"Colorants" heading or a
  leading `+` marks colorants. Firing notes like "fire to cone 6" are recognised
  as prose and skipped rather than read as a material. Anything it ignored or
  couldn't match is reported back rather than silently dropped.
- **Export to Insight-Live XML** from the app — the current recipe or the whole
  library, as text to copy or a downloaded `.xml` to import into Insight-Live.
  The Import button now takes JSON *or* Insight-Live XML and works out which.
- **Firing-target check in the app** (`js/limits.js`). Pick cone 6 or cone 10
  and every UMF value and ratio outside the typical range is flagged, with the
  range shown next to it. `data/glaze-limits.json` was previously only reachable
  from the CLI.
- **Installable and offline** — web manifest, service worker, and app icons, so
  it can be added to a phone home screen and works in a studio with no signal.
- **Test suite** — 60 tests on the chemistry engine, the paste parser, the
  limits check, and XML round-tripping (`npm test`), run in CI on every push and
  pull request.

### Changed

- **One XML parser instead of two.** `parseInsightLiveXML()` now works in Node as
  well as the browser, and `tools/analyze.mjs` uses it instead of its own copy.
  The CLI consequently keeps recipe `id`, `key`, `date` and notes through a
  round-trip, which its private parser had been dropping.
- Changing a line's material clears the stored Insight-Live name for that line,
  so an export can't hand back a name that no longer matches the material.

### Fixed

- **UMF is no longer reported as `0.000` for a recipe with no fluxes.** Without
  fluxes there is no unity to normalise against, so the UMF is undefined — but
  the engine printed a column of zeros, which reads as "there is none" for an
  oxide that may be most of the glaze by weight (kaolin + silica showed
  `SiO2 0.000` at 83.58 wt%). Those cells now show `—` in the app and the CLI,
  `analysis.hasFlux` says whether the unity formula is meaningful, and the limit
  check reports such values as not-computable instead of flagging them as below
  range. A partial check no longer prints as a clean pass.
- Loading a recipe from the library kept only its name and lines, losing the
  Insight-Live `id`, share `key`, code and notes needed to export it back as the
  same recipe.

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
