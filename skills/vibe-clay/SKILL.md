---
name: vibe-clay
description: Glaze chemistry for potters, with computed numbers. Computes the UMF/Seger unity formula, oxide weight-%, SiO2:Al2O3, SiB:Al, R2O:RO, KNaO, a relative thermal-expansion estimate, LOI and batch cost from a ceramic glaze recipe; line-blends two glazes into N points; checks glaze fit against a named clay body; lints for faults the unity formula cannot see (raw vs calcined clay, duplicate lines, late-arriving gas); flags limit ranges for glossy, matte, iron-crystal and copper-red targets; and reads/writes Insight-Live XML exports. Use when the user asks about a glaze recipe or its chemistry, ceramic materials (feldspar, frits, kaolin, silica, whiting, Gerstley Borate…), crazing, shivering, durability, matte vs glossy, tenmoku/kaki/shino, copper red, colorants in oxidation vs reduction, substituting one material for another, or wants a recipe drafted, scaled, blended, or converted to or from Insight-Live.
compatibility: Requires Node.js 18+ to run the bundled chemistry engine. No network access needed — everything computes locally.
metadata:
  version: "1.2.0"
  source: "https://github.com/RolynTrotter/vibe-clay"
---

# vibe-clay — glaze chemistry

Answer glaze questions with **computed numbers**, never estimated ones. If a
recipe or a set of materials is involved, run the engine before saying anything
about the chemistry.

## What's bundled

```
tools/analyze.mjs           the CLI — everything runs through it
js/chemistry.js             the engine (UMF, ratios, expansion, LOI, blends)
js/import.js                Insight-Live XML parse + serialise (browser and Node)
js/paste-import.js          free-text recipe -> data model
js/limits.js                firing-target limit checks (shared with the CLI)
data/materials.json         ~40 materials, nominal Digitalfire-style analyses
data/glaze-limits.json      target ranges + the outlier families that break them
data/bodies.json            clay-body expansion figures, each with its provenance
references/glaze-qa.md              interpreting numbers, fault diagnosis, reduction vs oxidation
references/draft-recipe.md          building/adjusting a recipe, emitting Insight-Live XML
references/insight-live-navigator.md  Insight-Live/Digitalfire, XML schema, data model
```

Paths are relative to this skill's directory. Run commands from there, or give
`node` the full path to `tools/analyze.mjs` — it locates its own data files
either way.

## Run it

```bash
# a recipe as JSON on stdin, checked against a firing target
echo '{"name":"Alex celadon","lines":[
  {"material":"Custer Feldspar","amount":40},
  {"material":"Silica","amount":25},
  {"material":"Whiting","amount":20},
  {"material":"EPK","amount":15},
  {"material":"Red Iron Oxide","amount":1.5,"additive":true}]}' \
| node tools/analyze.mjs --target cone6-glossy

# an Insight-Live XML export (one file, any number of recipes)
node tools/analyze.mjs library.xml --target cone10-glossy

# line blend: two glazes → N points, full UMF + analysis at each
node tools/analyze.mjs glossy.json matte.json --blend 5
node tools/analyze.mjs library.xml --blend 5      # blends the first two recipes

# fit against a clay body, plus the checks the UMF can't do
node tools/analyze.mjs recipe.json --body laguna-frost --lint

# what targets and bodies exist
node tools/analyze.mjs --list-targets
node tools/analyze.mjs --list-bodies

# emit Insight-Live-importable XML (round-trip out)
echo '<recipe JSON>' | node tools/analyze.mjs --xml
```

Input is Insight-Live XML **or** app JSON, from a file or stdin — the CLI
sniffs which. JSON shape:

```json
{ "name": "…", "lines": [ { "material": "EPK", "amount": 20, "additive": false } ] }
```

`additive: true` marks a colorant/opacifier added on top of the base; base and
additions get separate batch totals but one shared unity chemistry. Amounts can
be on any scale — UMF is scale-invariant.

Material names resolve through an alias system, so Insight-Live spellings
(`Ferro Frit 3134`, `EP Kaolin`, `lithium carbonate`) work. Anything unresolved
is printed as `⚠ unmatched` — say so rather than quietly analysing a partial
recipe.

**When the user pastes a recipe as plain text**, don't hand-transcribe it into
JSON. Run it through the parser, which handles the formats recipes actually
arrive in and tells you what it couldn't use:

```js
import { parseRecipeText } from './js/paste-import.js';
const { name, lines, unmatched, skipped } = parseRecipeText(pasted, db);
```

Trailing or leading amounts, dot leaders, tabs and colons all work; an
"Additions"/"Colorants" heading or a leading `+` marks colorants; firing notes
("fire to cone 6") land in `skipped` instead of becoming a material. Report
`unmatched` and `skipped` to the user — both mean the analysis isn't the whole
recipe.

## Output

UMF (fluxes normalised to 1.0) with oxide weight-%, then `Si:Al`, `SiB:Al`,
`R2O:RO`, `KNaO`, relative expansion, LOI, and — with `--target` — every value
outside the typical range for that firing. Report the actual numbers back.

A UMF cell printed as `—` means **undefined, not zero**: the recipe has no
fluxes, so there is no unity to normalise against (a slip, an engobe, or a
half-entered recipe). Weight-% is still valid there. Never read a `—` as "none
of this oxide" — check the weight-% column before saying anything about it.

`--target` takes `cone6-glossy`, `cone10-glossy`, `cone6-iron-crystal`,
`cone6-copper-red` or `cone6-matte`. **Pick the one the glaze is trying to be.**
A shino or a tenmoku checked against `cone6-glossy` flags five or six ways, and
every one of those flags is its signature rather than a fault — when that
happens the CLI names the likely family. Interpret the flags; don't recite them.

`--body` compares the glaze's expansion to a clay body's. The sign convention is
the thing people invert: **glaze below body = glaze in compression = shivering
direction; glaze above body = tension = crazing.** Some compression is what you
want. Each body carries a confidence — `published` means the maker states a
figure, `estimated` means nobody does and it must be anchored empirically
against a glaze known to fit. Never quote an estimated figure as a measurement.

`--lint` catches what the unity formula structurally cannot see: the raw vs
calcined clay split (invisible to UMF, decides whether the glaze crawls),
duplicate material lines, total LOI *and its timing* relative to the melt
sealing, and materials gassing for no chemistry.

## Then read the right reference

- Interpreting the numbers, diagnosing a fault (crazing, shivering, running,
  crawling), or explaining what reduction changes → `references/glaze-qa.md`.
- Building or adjusting a recipe and handing back pasteable XML →
  `references/draft-recipe.md`.
- Insight-Live's export format, share links, the data model, or adding a
  material → `references/insight-live-navigator.md`.

Load one when the task calls for it, not up front.

## Guardrails

- Material analyses are **nominal**, not supplier assays. Flag that when
  precision matters (durability, food safety, a commercial glaze).
- Thermal expansion is a **relative additive estimate** for comparing glazes and
  diagnosing craze vs shiver — never present it as a fired COE or dilatometer
  value. It is least reliable in high-lithium, high-magnesia, spodumene-bearing
  and crystallising glazes: the model overstates how much MgO and Li₂O lower
  expansion. Don't tell someone to cut lithium because the calculator says so.
  It *is* good for comparison against an empirically-anchored glaze.
- Limit ranges are heuristics. Outside them isn't "wrong", it's a prompt to
  think — and for shino, tenmoku, crystalline, matte and raku, outside them is
  the point. If the output says some values weren't computable, say so — a
  partial check is not a pass.
- Restate the recipe and the loadings you're analysing **before** diagnosing.
  Over-inferring from a number without checking the input is the most common way
  to be confidently wrong here.
- Additions (colorants, opacifiers, tin, SiC) ride along in the unity formula but
  aren't what makes the glaze melt or fit. Read those on the base, and say so.
- Nothing here writes to Insight-Live. XML output is for the user to paste in;
  don't say a recipe was saved to their account.
- Test tiles beat arithmetic. The chemistry narrows the search; it doesn't
  predict a fired surface.
