# Changelog

Versions cover the whole project — the app, the chemistry engine, and the
packaged skill all ship under one number (`package.json` is the source of
truth). Format loosely follows [Keep a Changelog](https://keepachangelog.com);
versioning is [semver](https://semver.org).

## [1.2.0] — 2026-08-12

Acts on the Q&A corpus harvested from ~14 glaze conversations (#11): three
places where the tool used to invent a number, cry wolf, or stay silent.

Skipping 1.1.0 — PR #10 is open against that number for the app-side work
(persistence, paste import, offline). This release is engine- and skill-side and
doesn't touch those files.

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
