---
name: insight-live-navigator
description: Navigate Insight-Live and Digitalfire for a potter. Use when working with Insight-Live recipes, glaze chemistry (UMF/Seger, thermal expansion, LOI), the Digitalfire reference database or API, or when helping port Insight-Live features into the vibe-clay app. Covers the site's login/URL model, what is and isn't reachable, how to extract recipe data, and how to run the local chemistry engine.
---

# Insight-Live Navigator

Helps Claude work effectively with Insight-Live (insight-live.com), Digitalfire
(digitalfire.com), and the vibe-clay app that ports their tools to the phone.

## What these sites are

- **Insight-Live** — subscription webapp by Tony Hansen for storing/organising
  glaze & clay-body recipes, running chemistry, tracking firings and photos.
  Web 1.0 style, `*.php` pages.
- **Digitalfire** — the free reference side: materials database, oxides,
  glossary, and Tony's notes. This is the knowledge base Insight-Live weaves in.
- **vibe-clay** (this repo) — a static, phone-first companion that reimplements
  the offline-computable tools (chemistry) and bridges to Insight-Live data.

## Reachability — read before trying to fetch

- Recipe/account pages (`insight-live.com/insight/*.php`, including share links
  like `recipes.php?rz=TOKEN`) require a **logged-in session cookie**. Fetching
  them unauthenticated returns a "Not Logged In" HTML page. `WebFetch` cannot log
  in — it will only ever see that page.
- **There is no open public API yet.** Digitalfire's API
  (<https://digitalfire.com/glossary/digitalfire+api>) is REST/JSON, built since
  2022, but "operational for subsets" internally and **not exposed for
  subscription**. Don't promise live sync as if the API were available.
- Digitalfire **reference** pages (materials, oxides, glossary) are public and
  fetchable, e.g. `digitalfire.com/material/<name>` and
  `digitalfire.com/oxide/<name>`. Good source for material analyses.

## Getting recipe data (in order of preference)

1. **Ask the user to paste** the recipe (text) or the recipe page HTML. Parse it
   into the vibe-clay data model (see below). Zero risk, works today.
2. **Screenshots** of a recipe — read the batch (material + amount to 100),
   additives/colorants, firing schedule, notes.
3. **Authenticated automation** only if the user has explicitly set
   `INSIGHT_LIVE_USER` / `INSIGHT_LIVE_PASS` and accepted the ToS implications.
   Then a session-cookie login + HTML parse is possible from a server context
   (never from the static browser app — CORS blocks that).

## Insight-Live export format (confirmed from a real export)

Insight-Live's **Export** produces XML. Confirmed shape:

```xml
<recipes version="1.0" encoding="UTF-8">
  <recipe name="G2926B" keywords="..." id="269324" key="advC7niu" date="2026-06-29" codenum="G1">
    <recipelines>
      <recipeline material="Ferro Frit 3134" amount="25.400" tolerance=""/>
      <recipeline material="Red Iron Oxide" amount="10.000" added="true"/>
    </recipelines>
    <notes>free text</notes>
  </recipe>
</recipes>
```

- `added="true"` on a `<recipeline>` = an **additive** (colorant/opacifier on top
  of the base). Everything else is the base batch.
- `amount` scale varies between recipes — some are fractions summing to 1.0,
  others percentages summing to ~100+. UMF is scale-invariant so chemistry is
  unaffected; only display-normalisation cares.
- `key` is the Insight-Live **share key** (same token as `recipes.php?rz=KEY`).
- Material names are Insight-Live's own ("EP Kaolin", "F3134", "Alberta Slip
  1000F Roasted", "lithium carbonate") — they do **not** match our canonical DB
  names directly.

`js/import.js` → `parseInsightLiveXML(xml, db)` parses this into our model and
resolves material names via `buildResolver()` (aliases + normalised matching).
`toInsightLiveXML(recipes)` serialises back. Unmatched names are kept verbatim
and flagged (`recipe.unmatched`), so nothing is silently dropped.

## vibe-clay recipe data model

```json
{
  "name": "string", "code": "string", "key": "share-token", "date": "YYYY-MM-DD",
  "keywords": "string", "notes": "string",
  "lines": [ { "material": "Frit 3134 (Ferro)", "rawMaterial": "Ferro Frit 3134",
              "matched": true, "amount": 25.4, "additive": false } ],
  "firing": [ { "ramp": 150, "target": 1222, "hold": 15 } ],
  "unmatched": ["names that didn't resolve"]
}
```

- `material` is the canonical DB name (used for chemistry); `rawMaterial`
  preserves Insight-Live's name for round-trip export.
- To add coverage for an unmatched material: add it to `data/materials.json`
  with `oxides` + `loi`, and list the Insight-Live spelling in `aliases`.

## Glaze chemistry, quickly

The engine lives in `js/chemistry.js` (framework-free ES module):

```js
import { analyzeRecipe, indexMaterials } from './js/chemistry.js';
const idx = indexMaterials(JSON.parse(fs.readFileSync('data/materials.json')));
const a = analyzeRecipe([{material:'Whiting (Calcium Carbonate)', amount:100}], idx);
// a.oxides, a.ratios.SiO2_Al2O3, a.thermalExpansion, a.loiPct, a.cost
```

Key concepts to get right:
- **UMF / Seger**: fluxes (Na₂O K₂O Li₂O CaO MgO BaO SrO ZnO PbO) are normalised
  so their moles sum to **1.0**; Al₂O₃, B₂O₃, SiO₂ etc. are expressed relative to
  that. B₂O₃ is shown on its own line (Insight convention), not in the flux total.
- **SiO₂:Al₂O₃ ratio** is a headline number (roughly ~5–8 glossy, higher = more
  glassy/less matte, depends on flux).
- **LOI**: volatiles (CO₂, chemical water) that leave on firing. Grams of oxide =
  raw grams × (oxide wt% / 100); LOI just contributes no oxide.
- **Thermal expansion** here is a linear additive ESTIMATE (relative units), for
  comparing two glazes / diagnosing crazing vs shivering — not an absolute
  dilatometer value. Say so.

## Materials database

`data/materials.json` holds nominal, Digitalfire-style oxide analyses (weight-%
as-batched; remainder to 100 is LOI). They're approximate — for real work, pull a
supplier's actual analysis (Digitalfire material pages, or Insight's own DB) and
add/override entries. When adding a material, include `oxides` (wt%) and `loi`.

## Guardrails

- Don't claim a recipe is synced/saved to Insight-Live — nothing writes there yet.
- Flag chemistry as an estimate when the material analyses are the nominal ones.
- Respect Insight-Live's ToS before any automated login/scraping.
