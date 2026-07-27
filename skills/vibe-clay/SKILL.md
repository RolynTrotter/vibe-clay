---
name: vibe-clay
description: Glaze chemistry for potters, with computed numbers. Computes the UMF/Seger unity formula, oxide weight-%, SiO2:Al2O3, SiB:Al, R2O:RO, KNaO, a relative thermal-expansion estimate, LOI and batch cost from a ceramic glaze recipe; line-blends two glazes into N points; flags cone 6 / cone 10 limit ranges; and reads/writes Insight-Live XML exports. Use when the user asks about a glaze recipe or its chemistry, ceramic materials (feldspar, frits, kaolin, silica, whiting, Gerstley Borate…), crazing, shivering, durability, matte vs glossy, colorants in oxidation vs reduction, substituting one material for another, or wants a recipe drafted, scaled, blended, or converted to or from Insight-Live.
compatibility: Requires Node.js 18+ to run the bundled chemistry engine. No network access needed — everything computes locally.
metadata:
  version: "1.0.0"
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
js/import.js                Insight-Live XML serialisation
data/materials.json         ~30 materials, nominal Digitalfire-style analyses
data/glaze-limits.json      typical ranges: cone6-glossy, cone10-glossy
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

## Output

UMF (fluxes normalised to 1.0) with oxide weight-%, then `Si:Al`, `SiB:Al`,
`R2O:RO`, `KNaO`, relative expansion, LOI, and — with `--target` — every value
outside the typical range for that firing. Report the actual numbers back.

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
  value.
- Limit ranges are heuristics. Outside them isn't "wrong", it's a prompt to
  think.
- Nothing here writes to Insight-Live. XML output is for the user to paste in;
  don't say a recipe was saved to their account.
- Test tiles beat arithmetic. The chemistry narrows the search; it doesn't
  predict a fired surface.
