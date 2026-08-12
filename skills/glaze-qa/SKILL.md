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
# UMF + limit flagging
node tools/analyze.mjs recipe.xml --target cone6-glossy

# fit against a named clay body, and the checks the UMF can't do
node tools/analyze.mjs recipe.json --target cone6-glossy --body laguna-frost --lint

# what targets and bodies exist
node tools/analyze.mjs --list-targets
node tools/analyze.mjs --list-bodies
```

It prints UMF, weight-%, Si:Al, SiB:Al, R₂O:RO, expansion, LOI, and — with
`--target` — which oxides fall outside typical ranges. Material names resolve
through the alias system, so Insight-Live spellings work. Report the actual
numbers back to the user.

## Before you diagnose: restate the input

The most common way to be wrong here is to reason from a number without
checking what produced it — concluding a glaze has SiC in it when it has none,
or calling an effect impossible at an alumina level the recipe has already
moved past. **Say what recipe and what loading you are analysing before you
diagnose it.** If working from a screenshot or a paraphrase, read the actual
lines first.

Three more failure patterns worth knowing you have:

- **Treating the additive expansion model as ground truth.** It is a comparative
  index. See the caveat below — it is least reliable exactly in lithium,
  magnesia and spodumene glazes.
- **Reaching for "your firing schedule" as the default defect explanation.** Ask
  what the schedule actually was first. It is often already right.
- **Asserting mechanism without a source.** Mark the line between what is
  documented and what you are extrapolating. If there is no citable source, say
  that rather than inventing a plausible mechanism.

## Targets: pick the one the glaze is trying to be

`data/glaze-limits.json` carries `cone6-glossy`, `cone10-glossy`,
`cone6-iron-crystal`, `cone6-copper-red` and `cone6-matte`. These are
**heuristics**, not laws.

Checking an outlier glaze against `cone6-glossy` produces a wall of flags that
are the glaze's **signature, not its faults**. A cone 6 soda-ash shino flags
five ways and is working exactly as intended. The families that live outside the
glossy limits by design — shino, iron-crystal (tenmoku/kaki/oil spot),
crystalline, matte, raku — are described in the `families` block of
`glaze-limits.json`, and the CLI names the likely one for you when a recipe
flags heavily. **Interpret the flags; don't recite them.**

## Reading the numbers

- **SiO₂:Al₂O₃** — the headline. ~5–7 leans matte/silky, ~8–12 glossier/glassier.
  Very high with low alumina → runny and less durable.
- **Al₂O₃** — the backbone. Low (<~0.25) → soft, runny, scratches. High (>~0.5
  with lower silica) → alumina matte.
- **B₂O₃** — a melter that *lowers* thermal expansion; the go-to for fixing
  crazing without piling on high-expansion alkalis.
- **R₂O:RO** — see below; it's a meltability-vs-durability dial, not just a ratio.
- **Expansion** (the engine's number) is a **relative** additive estimate — good
  for comparing two glazes or diagnosing craze/shiver, not an absolute
  dilatometer value. Never present it as a fired COE.

### R₂O:RO — why the split matters

The formulas come from charge balance, not from the unity normalisation — two
different things that both involve "1", which is where the confusion usually
sits.

Silica alone is a fully connected network of bridging oxygens: durable, and
unmeltable. Each Na₂O converts one bridging oxygen into two non-bridging ones —
that's the melting-point drop — but those Na⁺ ions are weakly held, mobile and
leachable (sodium silicate is literally water-soluble). Ca²⁺ carries double the
charge in similar space, binds tighter, and bridges two non-bridging oxygens,
partly knitting the network back together. That is exactly why window glass is
soda-lime rather than sodium silicate.

So R₂O:RO is a **meltability-vs-durability balance**. Alkali-heavy melts glossy
but soft, high-expansion and leachy; RO-heavy is durable and low-expansion but
stiff and prone to dryness at cone 6. Roughly **0.3:0.7 to 0.4:0.6, RO-dominant**,
is where durable food-safe glossies live.

### The expansion caveat that matters most

The additive model **overstates** the expansion-lowering effect of MgO and Li₂O.
Spodumene's low-expansion reputation comes from its crystalline beta phase, not
from its behaviour as a dissolved glass oxide. And crystallisation pulls
low-expansion oxides out of the melt, leaving an alkali-enriched residual glass
with **higher** real expansion than the bulk calculation implies.

Consequences:

- Do not tell someone to cut lithium because the calculator says expansion went
  up. Real fired expansion is lower than the model says. Cut the soda or the
  high-boron frit first — lithium is usually a keeper.
- Expect calculated and observed fit to disagree in high-lithium, high-magnesia,
  spodumene-bearing and crystallising glazes. That's the model, not the potter.

**What the number *is* good for:** comparison on the same coefficient set against
an empirically-anchored glaze. If G2926B computes 6.4 and is known to fit the
body, a variant computing 5.0 really is 1.4 lower in a meaningful way. Don't
dismiss that as "just a relative index" — anchored comparison is the whole point.

## Fit: crazing and shivering

**Get the sign convention right — this is the most commonly inverted thing in
the whole subject.**

> Body 7.0, glaze 6.2. The body contracts *more* on cooling, so it squeezes the
> glaze: the **glaze is in compression**. Compression is the shivering and
> edge-chipping direction. Adding soda raises glaze expansion, closes the gap
> and *reduces* compression — right lever, and the mechanism is the opposite of
> what people usually say when they reach for it.

- **Glaze expansion above body → glaze in tension → crazing.**
- **Glaze expansion below body → glaze in compression → shivering,** but only
  well below. Roughly 15% compression is desirable and makes ware stronger.
- There is **no universal threshold number**. Interface development, body
  maturity and form geometry all matter, and shivering needs a bigger mismatch
  than crazing because glazes tolerate compression far better than tension.
- Shivering initiates at **rims, edges and hole margins** — the convex features.
  If those are clean, a computed gap alone is not evidence.

`--body <key>` does this comparison against `data/bodies.json`, which carries
provenance per body: Laguna Frost is published (6.99–7.14), Standard 630 is not
published at all and must be anchored empirically. **Never quote an estimated
figure as a measurement.** For an undocumented body, the honest answer is "fire
a known-good glaze on it first", not a number.

### Testing fit

- **IWCT**: ~3 cycles each way, then flood with India ink, wipe, look for craze
  lines. Boiling→ice stresses toward crazing; ice→boiling toward shivering.
- The freezer-to-boiling shivering test is intrinsically weaker than
  kiln-to-ice for crazing, because of the smaller achievable ΔT.
- **Keep a tile for weeks.** Delayed crazing from moisture expansion is real.
- Test on the **actual form**, not only a flat tile. Flexural stiffness scales
  with the *cube* of thickness, so a ½" tile is ~8× stiffer than a ¼" one and
  cannot relieve stress by warping — it has to craze instead, which is what makes
  it a sensitive detector.
- Hansen's iteration heuristic: crazes straight out of the kiln at 7.0, try 6.5;
  crazes only after stress testing, drop less.
- **For ovenware, dial in modest compression rather than maximum** — shivered
  flakes in food are worse than crazing.

## Fault diagnosis

- **Crazing** (expansion > body): cut KNaO (Na₂O worst), add SiO₂, add B₂O₃,
  shift some flux to MgO or Li₂O.
- **Shivering** (expansion < body): raise expansion — more KNaO, less SiO₂/B₂O₃.
- **Running/soft/leaching**: silica and alumina too low — raise both toward the
  upper limit for functional ware.
- **Crawling** — two opposite causes, and people only know the first:
  - *Too much* plastic clay (raw kaolin/ball clay), or dust/oil on the bisque.
    Fix by calcining part of the clay.
  - *Too little* clay bond, from heavy non-plastic colorant loading. Iron oxide
    at 20% is a filler with high water demand: the raw layer has almost no clay
    bond, cracks on drying and pulls back. That is a **dried-layer failure, not a
    melt failure** — add CMC, apply thinner, drop the loading.
- **Orange peel**: set **at peak**. A low-temperature drop-and-hold affects
  colour but cannot fix surface levelling, because the glaze is already
  stiffening by then. If the schedule is already hot and held, look at the melt
  crossing the **1150–1100 °C smoothing window** too fast, and at chemical
  fluidity (strontium, lithium) and particle size (sieving, ball milling).
- **Pinholes/blisters**: run `--lint`. Total LOI matters, but *timing* matters
  more — barium and strontium carbonate gas at 1100–1300 °C, after the melt has
  sealed.

## What the UMF cannot see — run `--lint`

The unity formula is invariant to a whole class of real faults. `--lint` checks
them:

- **Raw vs calcined clay split.** The sharpest example: chemically identical
  fired, so the UMF cannot distinguish them, but the split decides whether the
  glaze crawls. A refactor that "preserves the unity formula exactly" can
  reintroduce the crawling risk the original split existed to prevent. Roughly
  60:40 raw:calcined by fired contribution; self-calcine on a bisque firing
  (cone 04 is plenty — a kitchen oven tops out near 260 °C and dehydroxylation
  needs 450–600 °C).
- **Duplicate material lines**, from layering corrections onto a recipe.
- **LOI total and its timing.**
- **Materials contributing almost nothing** — especially high-LOI ones gassing
  for no chemistry.
- **Additions vs base.** SiC, tin, copper and stains are *additions*. Compute fit
  and melt on the **base**, and say that's what you're doing.

## Frits: which one, and what it costs

| Frit | Use it to | Cost |
|---|---|---|
| **3110** | Raise expansion efficiently via Na₂O; high soda, low alumina | Adds alkali — the other leaching vector besides boron |
| **3134** | Melt and lower expansion together | Drags B₂O₃ up with it; high boron is a durability question |
| **3249** | Add boron with MgO rather than CaO; very high B₂O₃ | Strongly lowers expansion — easy to overshoot into shivering |

The 3110-vs-3134 decision is the one that recurs: **3110 corrects expansion
without dumping boron in.** Trading 0.11 fewer moles of boron for 0.05 more soda,
while gaining silica, is usually a good deal.

## Matte terminology

- **Dolomite matte** names the *input*; **diopside matte** names the *output*
  crystal (CaMgSi₂O₆). Same phenomenon from two ends — people use them
  interchangeably.
- **Magnesia matte** is genuinely distinct: high MgO, low CaO, usually from talc,
  giving enstatite/forsterite. Drier and more opaque.
- A true matte is **crystallised**, not underfired. Dry and pinholed is a
  different problem with a different fix.

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

At cone 6 in an **electric** kiln the route to copper red is in-glaze reduction
with silicon carbide, not atmosphere — see the `cone6-copper-red` target notes
for dosage (it is size-dependent: 0.25–0.3% at 500 mesh, 0.5–0.75% at 800 mesh)
and for why 2% gives a foamed grey. Carbon that fails to burn out of a refired
piece is limited by **oxidant supply, not time** — a sealed melt gives oxygen no
route in, so a longer soak won't fix it.

## Colorants and stains

- **Stains vs raw oxides.** Variegation, opalescence and phase separation are
  properties of the **base melt**, not the colorant — TCP phosphate opalescence
  and titania/rutile streaking happen identically over a stain, with the fixed
  hue riding underneath. What *cannot* be replicated with a stain are effects
  where the colour **is** the redox or crystallisation chemistry of the ion:
  copper red, tenmoku/oil spot/teadust, true rutile blue.
- Stains are **refractory** — heavy loadings stiffen and matte the surface.
- "Stain" doesn't mean "works in anything": chrome-tin pinks need high calcium
  and hate zinc and boron; manganese-alumina pinks want low-boron high-alumina;
  vanadium-zircon yellows want zircon present.
- Zircon-bearing stains **opacify** (RI ~1.95 against glass at ~1.55) and, since
  zircon has very low expansion, an 8–10% loading measurably pulls COE down.
- Mason publishes three temperature tiers (1080/1180/1260 °C). Cone 6 is ~1222 °C
  at a moderate ramp, so the 1180 tier is already over its limit. It is **heat
  work, not peak temperature**.
- Usage rates: ~5% for zircon spinels, 8–10% for praseodymium yellows and
  encapsulated reds (weak tinting strength).
- Cobalt reading blue rather than lavender is usually **not** concentration: B₂O₃
  stabilises tetrahedral cobalt and Al₂O₃ promotes CoAl₂O₄ spinel, which is
  inherently blue.

### Safety notes

- **Chrome volatilises.** Chrome-tin pink will flash pink onto anything
  tin-bearing elsewhere in the same load.
- **Cr³⁺→Cr⁶⁺** in oxidation with high CaO — hexavalent chrome is the
  carcinogenic one. Avoid chrome in high-calcium oxidation glazes on functional
  surfaces.
- **Copper raises leaching** in any glaze, and matte surfaces leach more than
  glossy ones at the same chemistry.
- A home proxy for leaching: an aquarium copper test kit (~$15) on a 24 h 4%
  acetic acid extract. Not a lab test — a screen.
- Barium is the flux to be most careful with on food surfaces; strontium is the
  usual substitute.

## Proposing materials / substitutions

When the user proposes a swap, compute *both* versions and compare UMF side by
side. Watch for hidden effects: swapping Custer (potash) for Nepheline Syenite
raises Na₂O (expansion up) and alumina; swapping a frit for Gerstley Borate
changes B₂O₃ and adds volatiles/LOI. Red vs black iron oxide is effectively 1:1
at studio batch sizes (0.966 multiplier) — the real difference is particle size
and speckle, not iron delivery.

Material analyses in `data/materials.json` are **nominal** — flag when precision
matters that these should be checked against a supplier/Digitalfire analysis.

## Designing tests

- **Hold the colorant constant, vary one axis.** Mix one oversized stained base
  batch, split it, *then* add the variegator to the splits. Blending a
  variegator-only batch against a stain-only batch dilutes both variables at once.
- Silica cannot be a triaxial corner when it needs to vary independently of the
  fluxes.
- Prefer **talc over dolomite** as a magnesia source in a blend: talc's co-oxide
  is silica, which helps expansion, whereas dolomite's is CaO, a high-expansion
  flux that confounds the Mg axis.
- Fire a whole grid in **one firing** so the cooling curve is a constant, and
  include the deliberately-too-high row — it tells you where "too much" starts.
- Inclusion stains want a fast drop from peak; iron reds want a slow cool through
  1050–900 °C. Fire those in **separate loads**.

## Related skills

- `draft-recipe` — when the goal shifts from *answering* to *building/adjusting*
  a recipe and getting it into copy-paste form.
