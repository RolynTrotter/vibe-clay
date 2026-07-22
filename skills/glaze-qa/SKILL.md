---
name: glaze-qa
description: Answer glaze-chemistry questions for a potter with real numbers. Use when the user asks about a glaze recipe's chemistry, proposes or substitutes materials, checks UMF / Seger, thermal expansion, silica:alumina, crazing/shivering/durability, limit ranges, colorants, or how a result changes in reduction vs oxidation firing. Always compute with the local engine and flag limit ranges rather than guessing.
---

# Glaze Q&A

Answer a potter's glaze-chemistry questions **with computed numbers**, not
hand-waving. The rule: if a recipe or materials are involved, run the engine.

## Always compute first

Use the CLI — it runs the same engine as the app:

```bash
# From an Insight-Live XML export or app JSON, with limit-flagging:
node tools/analyze.mjs recipe.xml --target cone6-glossy
echo '{"name":"test","lines":[{"material":"EPK","amount":20},{"material":"Silica","amount":30},{"material":"Ferro Frit 3134","amount":30},{"material":"Wollastonite","amount":20}]}' | node tools/analyze.mjs --target cone6-glossy
```

It prints UMF, weight-%, Si:Al, SiB:Al, R₂O:RO, expansion, LOI, and — with
`--target` — which oxides fall outside typical ranges. Material names resolve
through the alias system, so Insight-Live spellings work. Report the actual
numbers back to the user.

Targets live in `data/glaze-limits.json` (`cone6-glossy`, `cone10-glossy`).
These are **heuristics**, not laws — say so. A recipe outside the ranges isn't
"wrong"; it's a flag to think about.

## Reading the numbers

- **SiO₂:Al₂O₃** — the headline. ~5–7 leans matte/silky, ~8–12 glossier/glassier.
  Very high with low alumina → runny and less durable.
- **Al₂O₃** — the backbone. Low (<~0.25) → soft, runny, scratches. High (>~0.5
  with lower silica) → alumina matte.
- **B₂O₃** — a melter that *lowers* thermal expansion; the go-to for fixing
  crazing without piling on high-expansion alkalis.
- **R₂O:RO** — alkali (Na₂O/K₂O/Li₂O) vs alkaline-earth (CaO/MgO/…). Alkali-heavy
  = higher expansion, brighter alkaline colour response, less durable.
- **Expansion** (the engine's number) is a **relative** additive estimate — good
  for comparing two glazes or diagnosing craze/shiver, not an absolute
  dilatometer value. Never present it as a fired COE.

## Fault diagnosis

- **Crazing** (glaze cracks; expansion > body): lower expansion — cut KNaO (Na₂O
  is the worst offender), add SiO₂, add B₂O₃, shift some flux to MgO or Li₂O.
- **Shivering** (glaze flakes off edges; expansion < body): raise expansion —
  more KNaO, less SiO₂/B₂O₃.
- **Running/soft/leaching**: silica and alumina too low — raise both toward the
  upper limit for functional ware.
- **Crawling**: often too much plastic clay (raw kaolin/ball clay) or dust/oil;
  a chemistry-adjacent fix is calcining part of the clay.

## Reduction vs oxidation — important nuance

**The UMF does not change with atmosphere.** Firing atmosphere changes the
oxidation *state* of some oxides and therefore the **colour and surface**, not
the oxide ratios. So the engine's numbers are identical either way; what changes
is qualitative:

| Colorant | Oxidation | Reduction |
|---|---|---|
| Iron (Fe₂O₃) | amber / honey / brown; tan breaking | celadon green (low %), tenmoku/temmoku & saturated iron reds/oil-spot (high %) |
| Copper (CuO) | green / turquoise (esp. alkaline/barium) | **copper red** / oxblood (sang de boeuf) |
| Cobalt | blue | blue (little change — stable) |
| Chrome (Cr₂O₃) | green (pink with tin/Ca; red at low fire) | green, can dull |
| Manganese | brown / purple / plum | similar, can be more metallic |
| Rutile/Ti | cream, crystalline, variegated | stronger blues/streaking over iron/rutile |

Reduction also darkens/speckles iron-bearing clay bodies and can cause carbon
trapping. If asked "what changes in reduction," lead with: same chemistry,
different colour/surface, and name the colorants involved.

## Proposing materials / substitutions

When the user proposes a swap, compute *both* versions and compare UMF side by
side. Watch for hidden effects: e.g. swapping Custer (potash) for Nepheline
Syenite raises Na₂O (expansion up) and alumina; swapping a frit for Gerstley
Borate changes B₂O₃ and adds volatiles/LOI. Material analyses in
`data/materials.json` are **nominal** — flag when precision matters that these
should be checked against a supplier/Digitalfire analysis.

## Related skills

- `draft-recipe` — when the goal shifts from *answering* to *building/adjusting*
  a recipe and getting it into copy-paste form.
