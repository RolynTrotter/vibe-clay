# Changelog

Versions cover the whole project — the app, the chemistry engine, and the
packaged skill all ship under one number (`package.json` is the source of
truth). Format loosely follows [Keep a Changelog](https://keepachangelog.com);
versioning is [semver](https://semver.org).

## [1.3.0] — 2026-09-21

Compact output modes, a named glaze library, and an LP solver for the limit
bands — plus one data bug that had been flagging every copper red it saw.

### Fixed

- **`cone6-copper-red` was arithmetically unsatisfiable.** The profile carried
  `SiO2 [3.0, 3.3]` and `Al2O3 [0.22, 0.28]`, which force Si:Al into
  `[10.71, 15.00]`, alongside a `SiO2_Al2O3` band of `[8, 10]`. No recipe could
  ever satisfy it, so `--target cone6-copper-red` flagged everything it was
  pointed at, correct recipes included. The ratio band is widened to the range
  the oxide bands imply. **This is provisional** — if 8–10 was the trustworthy
  figure, an oxide band is what needs moving instead. See the target's `notes`.
- `--lint` now distinguishes *when* gas arrives rather than lumping everything
  past 1000 °C together, so strontium carbonate (1100–1300, entirely after the
  melt seals) no longer reads the same as talc (900–1000, out before anything
  closes). Talc keeps its finding, as a `note` rather than a `warn`.

### Added

- `--brief`, `--compare`, `--json` and `--vs <ref>` — one line, one column per
  recipe, structured output, and a diff against a baseline. The default output
  is unchanged.
- `data/glazes.json`, a named recipe library, with `--save`, `--list-glazes`,
  and keys usable anywhere a recipe file is. Ships empty by design.
- `--anchor <glaze>` — reports expansion as a distance from a glaze with known
  empirical fit, which is the only way the index is meaningful.
- `gasTiming()` and an ordinal `severity` (0–3) on `late-gas` findings, so gas
  timing can be constrained rather than merely noticed.
- `tools/analyze.mjs --matrix` and `tools/solve.py` — the limit bands solved as
  a linear program instead of searched. Feasibility with `--explain`, a margin
  `t*`, exact per-material `--range`, and `--verify` to round-trip the answer
  back through the engine. Needs numpy and scipy; the JS side stays
  dependency-free.
- `studio-reclaim` in `data/bodies.json`, deliberately with no COE figure.
- A **Corrections** section in the glaze-QA reference, recording six things
  this skill asserted and had to walk back.

## [1.2.0] — 2026-08-12

Acts on the Q&A corpus harvested from ~14 glaze conversations (#11): three
places where the tool used to invent a number, cry wolf, or stay silent.

### Added

- **`data/bodies.json`** — clay-body expansion figures, each carrying its
  **provenance**. Laguna Frost is published (6.99 spec sheet / 7.14 store page);
  Standard 630 publishes nothing and is marked `estimated`; Standard 420 gets no
  figure at all, because a grogged body's thermal behaviour is dominated by grog
  structure rather than bulk expansion. The point of the file is that an
  undocumented body doesn't get a confidently invented number.
- **`--body <key>`** — compares glaze expansion to a body's, gets the sign
  convention right (glaze below body = compression = shivering direction; above =
  tension = crazing), names the target band, and repeats the anchoring caveat
  every time the figure is an estimate.
- **`--lint`** — the checks the unity formula structurally cannot make:
  raw-vs-calcined clay split (chemically identical fired, but it decides whether
  the glaze crawls), duplicate material lines, non-plastic colorant overload,
  total LOI *and its timing* relative to the melt sealing, and materials gassing
  for no chemistry.
- **`gasWindowC`** on materials that have a defined one — so late gas (barium and
  strontium carbonate at 1100–1300 °C, after the melt has sealed) is visible as a
  timing problem rather than hidden inside an LOI total.
- **Three new targets** — `cone6-iron-crystal`, `cone6-copper-red`, `cone6-matte`,
  each with notes explaining why the glossy limits are the wrong ruler for them.
- **A `families` block** in `glaze-limits.json` naming the glaze types that sit
  outside the glossy limits *by design* — shino, iron-crystal, crystalline,
  matte, raku. When a recipe flags heavily against a glossy target, the CLI now
  names the likely family instead of leaving a wall of flags to read as faults.
- **`--list-targets` / `--list-bodies`** — see what's available without guessing.
- `Kaolin (Calcined)` in the materials database, so the lint fix is actionable.

### Changed

- `skills/glaze-qa/SKILL.md` substantially expanded from the corpus: the
  shivering sign convention worked through, the R₂O:RO durability explanation,
  the expansion-model caveat for lithium/magnesia/spodumene, a frit decision
  table (3110 vs 3134 vs 3249), matte terminology, both directions of crawling,
  the orange-peel "set at peak" rule, colorant safety, and test-design rules.
- `skills/vibe-clay/SKILL.md` — new commands, and guardrails against the four
  failure patterns the corpus identified.

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
  pull request, against Node 18, 20 and 22.
- **Release workflow** (`.github/workflows/skill.yml`) — pushing a `v*` tag
  builds the skill zip and attaches it to a GitHub Release, so the file you
  upload is a download rather than a build step. The same workflow builds and
  tests on every push and PR, keeps the zip as an artifact, and fails a tag that
  doesn't match `package.json`.
- `npm run test:skill` — unzips the built artifact somewhere else and runs it
  from there: zip shape (one top-level folder, exactly one `SKILL.md`),
  the frontmatter rules the uploader enforces, and the engine's output for a
  known recipe.

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
