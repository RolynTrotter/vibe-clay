---
name: draft-recipe
description: Build or adjust a glaze recipe with a potter and get it into copy-pasteable form for Insight-Live. Use when the user wants to create a new recipe, tweak an existing one, scale a batch, add colorants/additions, or convert a recipe to/from Insight-Live so they can paste it into the site. Produces Insight-Live XML and shows the live chemistry while drafting.
---

# Draft Recipe

Lower the friction of making a glaze: draft or adjust a recipe interactively,
show its chemistry as you go, and hand back **Insight-Live-importable XML** the
user can paste straight into the site.

## Interchange format: Insight-Live XML

Insight-Live imports/exports the XML documented in
`skills/insight-live-navigator/SKILL.md`:

```xml
<recipes version="1.0" encoding="UTF-8">
  <recipe name="..." codenum="..." date="YYYY-MM-DD">
    <recipelines>
      <recipeline material="Ferro Frit 3134" amount="25.400"/>
      <recipeline material="Red Iron Oxide" amount="2.000" added="true"/>
    </recipelines>
    <notes>...</notes>
  </recipe>
</recipes>
```

`added="true"` = an addition (colorant/opacifier on top of the base). Use the
material names Insight-Live expects (its own spellings) so the paste-back works;
`rawMaterial` is preserved on round-trip.

## Workflow

1. **Gather** materials + amounts (base to ~100 is conventional but any scale
   works — chemistry is scale-invariant) and any additions (colorants), with the
   `added` flag.
2. **Analyse as you draft** with the CLI, so every suggestion is backed by
   numbers and checked against limits:
   ```bash
   echo '{"name":"Alex celadon","lines":[
     {"material":"Custer Feldspar","amount":40},
     {"material":"Silica","amount":25},
     {"material":"Whiting","amount":20},
     {"material":"EPK","amount":15},
     {"material":"Red Iron Oxide","amount":1.5,"additive":true}]}' \
   | node tools/analyze.mjs --target cone6-glossy
   ```
   Reads JSON or Insight-Live XML on stdin/file; material aliases resolve. See
   `glaze-qa` for interpreting UMF, ratios, expansion, and faults.
3. **Adjust** toward the user's goal (glossier, less crazing, matte, cheaper…).
   Recompute after each change and show the before/after UMF. When fixing a
   fault, apply the `glaze-qa` fault guidance (e.g. add SiO₂/B₂O₃ to cut crazing).
4. **Emit copy-paste XML** for Insight-Live:
   ```bash
   echo '<the recipe JSON>' | node tools/analyze.mjs --xml
   ```
   Give the user the XML block and tell them: in Insight-Live, use Import to load
   it. Offer the app's JSON too if they want it for vibe-clay.

## Going the other way (from the site)

If the user pastes a recipe out of Insight-Live (XML) or types one out, feed it
to `node tools/analyze.mjs` (it parses XML directly) to analyse or to reshape,
then `--xml` back out. This is the round-trip that makes the phone app and the
site talk to each other by hand until a live sync path exists.

## Cautions

- Material analyses are **nominal** (`data/materials.json`) — flag when exactness
  matters. Unmatched material names are surfaced by the CLI (`⚠ unmatched`); add
  them to the database with aliases if they recur.
- Don't claim the recipe is saved to Insight-Live — the user still pastes it in.
  Nothing writes to the account yet.

## Related skills

- `glaze-qa` — interpreting the chemistry and diagnosing faults.
- `insight-live-navigator` — the XML schema and material data model.
