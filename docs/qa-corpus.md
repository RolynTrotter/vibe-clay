# vibe-clay: Q&A corpus from conversation history

Harvested from ~14 glaze conversations (June–August 2026). Organized by theme.
Each entry gives the **question as actually asked**, the **answer that landed**,
and a **skill note** — what `references/glaze-qa.md` or `SKILL.md` should encode
so the answer comes out right without rediscovery.

The most valuable section is the last one: **Corrections**. Those are places
where the first answer was wrong and got fixed mid-conversation. They're the
highest-signal eval cases, because they're the failure modes that actually occur.

---

## 1. Fit: crazing, shivering, and expansion

**Q. "At what gap in expansion between clay body and glaze does shivering become a risk? My glaze computes 6.2 vs 6.4, body is Laguna Frost near 7. Edges are chipping. I think I need more soda."**

A. There is no universal threshold number — interface development, body maturity,
and form geometry all matter, and shivering needs a bigger mismatch than crazing
because glazes tolerate compression better than tension. Roughly 15% compression
is desirable and makes ware stronger. Direction of reasoning: body 7.0 > glaze
6.2 means the body contracts more on cooling, so the **glaze is in compression** —
the shivering/edge-chipping direction, which matches the symptom. Adding soda
raises glaze expansion, closes the gap, and *reduces* compression. Right lever,
inverted mechanism. Target ~6.5–6.7, not a match at 7.0.

**Skill note:** encode the sign convention explicitly with a worked example.
"Glaze expansion below body = glaze in compression = shivering/chipping at rims
and edges." The QA reference currently states the rule but not the direction of
the mental error people make.

---

**Q. "Verify Laguna Frost's expansion."**

A. Laguna lists Frost (WC-437) at COE 6.99 ×10⁻⁶ on the spec sheet; their store
page says 7.14.

**Skill note:** worth a small `data/bodies.json` with known body COEs — Frost
6.99–7.14, Standard 630 unpublished (fireclay + added mullite, empirically low,
estimated 5.5–6.5). Standard doesn't publish figures, so the honest answer is
"anchor empirically against a known-good glaze on that body," not a number.

---

**Q. "The 25/75 blend didn't craze but the pure variant did — that's backwards, the variant has the lower calculated COE."**

A. Two mechanisms. (1) The additive calculator overstates expansion reduction
from MgO and Li₂O; spodumene's low-expansion reputation comes from its
**crystalline beta phase**, not its behavior as a dissolved glass oxide. (2)
Crystallization pulls low-expansion oxides out of the melt, leaving an
alkali-enriched residual glass with higher real expansion than the bulk
calculation implies.

**Skill note:** this is the single most important caveat in the whole corpus.
The engine's expansion number is least trustworthy exactly where Alex works —
high-lithium, high-magnesia, spodumene-bearing, crystallizing glazes. Flag it.

---

**Q. "Why didn't the variant shiver on Frost at a computed 2-point gap?"**

A. A 1.4-point compression gap corresponds to roughly 40–60 MPa compressive
stress — well-fitted rather than shiver-prone. The variant's stiff, low-boron,
high-LOI melt may also produce a poorer interface, which lowers the shivering
threshold independently of the number.

---

**Q. "Does tile flatness matter for the bar bending test? And why ½" tiles instead of ¼"?"**

A. Flexural stiffness scales with the **cube** of thickness, so a ½" tile is ~8×
stiffer and can't relieve stress by warping — it must craze instead. Quench
orientation is irrelevant if fully immersed; what matters is glazed edges and
hole rims, the convex features where shivering initiates. The bar test doesn't
need a flat tile — a twin-bar or self-control method subtracts body warp as
systematic error. Thin bars, 4–5 mm × 100–125 mm, for sensitivity.
Two tile types: rolled/textured for appearance and pooling, flat 1"×3"×½"
single-face-glazed strips for fit diagnostics.

**Skill note:** the freezer-to-boiling shivering test is intrinsically weaker
than kiln-to-ice for crazing, because of the smaller achievable ΔT. Worth saying.

---

**Q. "Ramekins from Standard 630 for oven use — how do I lower G2926B's expansion to fit?"**

A. Progression: 325 mesh silica → G2926S → G2926J → line blend with G2934 matte
(start 80:20). G2926J at 5.6 may still not be low enough if 630 is near 5, but
body COE guesses from marketing copy are unreliable — fire straight G2926B on
630 first. Mullite content raises craze resistance in ways a single COE number
doesn't capture. Test with IWCT: ~3 cycles each way, then flood with India ink,
wipe, look for craze lines. Boiling→ice stresses toward crazing; ice→boiling
toward shivering. Keep a tile for weeks — delayed crazing from moisture
expansion is real. Hansen's iteration heuristic: crazes straight out of the kiln
at 7.0, try 6.5; crazes only after stress testing, drop less. Test on the actual
form, not a flat tile. For ovenware specifically, shivered flakes in food are
worse than crazing, so dial in *modest* compression rather than maximum.

---

## 2. Reading the numbers

**Q. "Run the vibe-clay skill on Custer Feldspar 40, Silica 25, Whiting 20, EPK 15, cone 6."**

A. Two flags — B₂O₃ 0 and CaO 0.766. This is the classic 4-part Leach base, a
cone 10 glaze wearing a cone 6 hat. At cone 6 there isn't enough energy to melt
it, and high CaO won't rescue it: calcia is refractory until it gets hot. Expect
dry, semi-opaque, underfired. Fix: substitute 15–20 of the whiting/feldspar for
Frit 3134 or 3110 to get B₂O₃ into 0.2–0.35 and pull CaO under 0.7.

**Skill note:** good canonical eval. The right answer is a *diagnosis with a
name* ("Leach base at the wrong cone"), not a list of flags.

---

**Q. "Explain R₂O vs RO. I thought alkalis took the RO form and alkaline earths RO₂ — but lime is CaO. And how does the ratio bear on stability and leaching?"**

A. The formulas come from charge balance, not the unity normalization — two
different things that both involve "1." Structurally: silica alone is a fully
connected network of bridging oxygens, durable but unmeltable. Each Na₂O
converts a bridging oxygen into two non-bridging ones — that's the melting-point
drop, but those Na⁺ ions are weakly held, mobile, and leachable (sodium silicate
is literally water-soluble). Ca²⁺ carries double charge in similar space, binds
tighter, and bridges two non-bridging oxygens, partly knitting the network back.
That's exactly why window glass is soda-lime rather than sodium silicate. So
R₂O:RO is a **meltability-vs-durability balance**: alkali-heavy melts glossy but
soft, high-expansion, leachy; RO-heavy is durable and low-expansion but stiff
and prone to dryness at cone 6. Roughly 0.3:0.7 to 0.4:0.6, RO-dominant, is
where durable food-safe glossies live.

**Skill note:** this explanation is reusable verbatim-ish and the skill currently
has only one line on R₂O:RO. Worth expanding into the reference.

---

**Q. "Assess this variant for stability — I changed frits and expansion improved without boron rising as much."**

A. Al₂O₃ 0.35→0.38, SiO₂ 3.90→4.32, Si:Al 11.1→11.4; B₂O₃ 0.38→0.27, now below
base G2926B's 0.33. That's the point of 3110 — it corrects expansion via Na₂O
rather than by dumping boron. Cost: Na₂O 0.28→0.33, R₂O:RO 0.3:0.7→0.4:0.6, and
alkali is the other leaching vector besides boron. Net clearly better: 0.11 fewer
moles boron for 0.05 more soda, with 0.42 more silica in the bargain.

**Skill note:** encode the **3110-vs-3134 decision rule**. 3110 = high soda, low
alumina, raises expansion efficiently. 3134 = raises expansion but drags boron
up with it. This comes up in at least four separate conversations.

---

## 3. Copper red and in-glaze SiC reduction

**Q. "Cone 6 copper red in an electric kiln."**

A. A truly glassy oxblood is cone 9–10 reduction; at cone 6 electric the route is
**in-glaze reduction with silicon carbide**, not atmosphere. Targets vs. a
typical starting point: Al₂O₃ ~0.22–0.28 (high alumina keeps Cu ionic/green);
B₂O₃ ~0.15–0.20 (excess boron fights red and raises expansion); KNaO ~0.30,
soda-dominant; SiO₂ ~3.0–3.3, Si:Al 8–10:1; CuO 0.3–0.5%; SnO₂ ~1% to nucleate
colloidal copper; SiC 0.25–0.5% fine. Prefer a known-style recipe that has
actually produced red in someone's electric kiln over a theoretically perfect
computed one — tune expansion after you have a tile that reds up.

---

**Q. "Should I add 2% SiC plus lithium and strontium?"**

A. Three problems. 2% SiC is 4–8× the published in-glaze range and gives a foamed
gray. Total LOI more than doubles (2.97%→6.74%) with gas arriving late, when the
melt is sealing. Expansion drops 6.87→6.56, reversing a correction previously
made for fit. Counter-proposal: trade strontium *for* lithium rather than adding
both, bracket SiC at 0.5–0.75 given 800-mesh material. 800 mesh is preferable to
500 — faster complete oxidation, earlier gas release, no lizard-skin texture.

**Skill note:** the SiC dosage rule is size-dependent. 500 mesh → 0.25–0.3%;
800 mesh → 0.5–0.75%. And SiC/tin/copper are **additions, not part of the
chemistry that drives fit and melt** — the UMF should be read on the base.

---

**Q. "Carbon didn't burn out of the refired mug. Why won't a longer soak fix it?"**

A. The limiting factor is oxidant supply, not time — a sealed melt has no route
for oxygen to reach trapped carbon. The partial carbon loss that did occur went
through internal reduction of CuO, not atmospheric oxidation.

---

**Q. "Blue-white specks in the copper red."**

A. Likely calcium borate devitrification nucleated by SnO₂, with Rayleigh
scattering producing the blue cast over a dark ground.

---

**Q. "What about the saggar — more charcoal for heavier reduction?"**

A. No. Uncontrolled heavy reduction in a packed saggar drives copper past red
into metallic/liver. A moderate charcoal load beats maximum packing for copper
red specifically. (In a prior firing, excess charcoal produced carbon-trap grays
instead of red, and ash alkali pickup stacked with an added Frit 3134 to cause
crazing inside the saggar only.)

---

## 4. Iron: kaki, tenmoku, oil spot

**Q. "How do I get kaki? I tried 20% iron and it crawled like crazy."**

A. Kaki is hematite precipitating out of an iron-supersaturated melt on cooling.
Requirements: iron past saturation at **11–14%** (20% overshot); **low alumina**
(0.2–0.3, Si:Al 10–14:1) — alumina raises viscosity and suppresses nucleation;
a slow cool in the **1050–900 °C** window, not just below peak at 1150–1200 °C,
which is why the effect kept not appearing; and phosphorus as a nucleating aid,
2–6% bone ash, driving liquid-liquid phase separation that seeds the hematite.
The 20% crawl was a **dried-layer failure, not a melt failure** — iron oxide is a
non-plastic filler with high water demand, so the raw layer has almost no clay
bond, cracks on drying, and pulls back. Drop to 12–14%, add CMC, apply thinner.

**Skill note:** "crawling" in the current reference is attributed to too much
plastic clay. Add the opposite case: too *little* clay bond from heavy
non-plastic colorant loading.

---

**Q. "15% black iron oxide in my 630 base gave black with almost no crystallization. Why?"**

A. Three axes set against it at once: Al₂O₃ 0.45 raises viscosity and stabilizes
Fe³⁺ in the network; B₂O₃ 0.11 suppresses iron devitrification; and MgO 0.41 is
the killer — Fe²⁺ and Mg²⁺ substitute nearly freely (same charge, near-identical
radius, both octahedral), so iron dissolves into the Mg-silicate structure rather
than precipitating its own phase. The dry metallic matte on the lid *is*
crystallization, just microcrystalline rather than showy plates.

---

**Q. "Can I get kaki/tenmoku while keeping expansion very low?"**

A. Yes — the expansion problem in classic tenmoku comes from feldspar-driven
KNaO, not from low alumina. A wollastonite–spodumene–silica base reaches
expansion ~6.4–6.6 while being boron-free and nearly magnesium-free, which are
the two conditions iron crystallization requires.

**Skill note:** worth encoding as a named target profile, e.g. `cone6-iron-crystal`:
Al₂O₃ 0.2–0.3, Si:Al 10–14, B₂O₃ ~0, MgO ~0, CaO-dominant.

---

**Q. "Red iron oxide vs black iron oxide — conversion?"**

A. Effectively 1:1 at studio batch sizes (0.966 multiplier). The meaningful
practical difference is particle size and speckle behavior, not iron delivery.

---

## 5. Colorants and stains

**Q. "Why is 0.25% cobalt still reading blue rather than lavender?"**

A. Not concentration. B₂O₃ stabilizes tetrahedral cobalt, and Al₂O₃ 0.461
promotes CoAl₂O₄ spinel, which is inherently blue.

---

**Q. "Why is 8% grass green Mason stain so opaque?"**

A. Zircon content in the stain. At 8% you're plausibly adding 3–5% zircon; RI
~1.95 against a glass at ~1.55 is squarely opacifying. Victoria green (Ca-Cr
garnet) is the zircon-free route but is fussy about zinc and tin.

**Bonus lever:** zircon has very low thermal expansion, so 8–10% of a zircon
stain functions as a zircon opacifier addition and should pull COE down
measurably — headroom to push the G2926B fraction up for stained pots
specifically.

---

**Q. "Go through the temperature limits on my Mason stains vs. cone 6 and a slow cool."**

A. Mason publishes three tiers: 1080, 1180, 1260 °C. Cone 6 is ~1222 °C at a
moderate ramp, so the 1180 tier is already over its limit at cone 6 and the 1260
tier has 20–40 °C of margin. It's **heat work, not peak temperature** — firing to
2200 °F slowly does the same work as 2300 °F quickly. Usage rates: ~5% default
for zircon spinels, 8–10% for praseodymium yellows and encapsulated reds (weak
tinting strength). Avoid chrome-tin pinks in a magnesia base. Real conflict:
inclusion stains want a fast drop from peak, kaki iron red wants a slow cool
through 1050–900 °C — fire those glaze types in separate loads.

---

**Q. "Stains are flat. Can I get variegation with them instead of raw oxides?"**

A. Mostly yes. Variegation, opalescence, and phase separation are properties of
the **base melt**, not the colorant — TCP phosphate opalescence and titania/rutile
streaking happen identically over a stain, and the fixed hue rides underneath,
gaining depth. What can't be replicated are effects where the color *is* the
redox or crystallization chemistry of the ion: copper red (a stain can't be
reduced to colloidal metal), tenmoku/oil spot/teadust (iron crystallizing out of
solution), true rutile blue (an iron-titania melt interaction). Those are exactly
the saggar-program effects. Clean division: stains + reactive base for the
durable functional palette; interesting ions reserved for atmospheric work.

**Also:** stains are refractory — heavy loadings stiffen and matte the surface.
And "stain" doesn't mean "works in anything": chrome-tin pinks need high calcium
and hate zinc and boron; manganese-alumina pinks want low-boron high-alumina;
vanadium-zircon yellows want zircon present.

---

**Q. "TCP and titania as variegators — what rates?"**

A. TCP is ~46% P₂O₅ / 54% CaO by weight, so a 5% addition delivers ~2.3% P₂O₅ —
within the phase-separation opalescence range; 4% and 8% are better screening
points. Titania 3–5%; the green cast previously seen with cobalt at 5% is cobalt
titanate formation plus melt chemistry shift, not a general titania problem.
TCP needs a fluid base to express.

---

## 6. Surface and melt defects

**Q. "Orange peel persists despite a hot cone 7, 45-minute drop, and a 2–4 hour hold."**

A. Those details rule out the standard diagnoses. The likely cause is the melt
dropping through the **1150–1100 °C smoothing window too fast** in that 45 minutes,
before the soak begins. On a manual kiln, use elements at a low setting to slow
the descent through that band. Separately: orange peel is set **at peak** — a
low-temperature drop-and-hold helps color but cannot fix surface leveling,
because by then the glaze is already stiffening. A peak hold would smooth the
surface but burns out copper and reoxidizes the reduction. That tension is real,
which is the argument for solving orange peel **chemically** — strontium and
lithium for fluidity, finer particle size via sieving or milling.

**Skill note:** "orange peel is set at peak; cooling holds affect color, not
surface" is a crisp rule worth stating outright.

---

**Q. "Would a ball mill help?"**

A. Yes — orange peel and copper mottling are both partly particle-size and
homogeneity problems. Milling gives finer uniform particle size, better colorant
dispersion, and reproducibility. Practical constraints: ~⅓ media, ⅓ charge, ⅓
empty by volume, so a 500 g dry batch wants a 1.5–2 L jar; high-alumina or
porcelain media **only** — never steel, which contaminates copper red with iron;
1–6 hours typical, over-milling causes crawling and suspension problems. Treat a
newly milled batch as a **new glaze** — finer particles mean more complete melt,
shifted expansion, and more SiC reduction.

---

## 7. Recipe hygiene and materials

**Q. "I refactored the blend from ten ingredients to six while preserving the unity formula."**

A. One significant problem: EPK nearly doubled to 22.9% with calcined kaolin
removed entirely, reintroducing the drying-shrinkage and crawling risk the
original formulation existed to avoid. Split it back to ~12.8% raw / 8.6%
calcined — which also drops LOI from 4.1 to ~2.7. Use self-calcined EPK from
bisque firings to avoid introducing a new supplier variable.

**Skill note:** the unity formula is invariant to the raw/calcined split, so the
engine cannot see this problem. That's a case for a **non-UMF lint pass**: flag
high raw-clay fraction, high LOI, and duplicate material lines.

---

**Q. [Recipe with duplicate silica and frit lines from layering corrections onto G2926B]**

A. Consolidated thirteen lines to eight: merged the duplicate silica and frit
entries, eliminated talc (negligible MgO contribution while gassing at ~900 °C),
raised wollastonite 6.9→14 as a zero-LOI calcium flux, dropped strontium
carbonate. Cutting silica 40→36 improved melt fluidity and expansion
simultaneously.

**Skill note:** a `--lint` mode would earn its keep: duplicate materials,
materials contributing <0.5% of any oxide, and carbonates whose gassing window
overlaps the sealing melt.

---

**Q. "My supplier doesn't stock calcined clay. Can I do it in the oven, or on a cone 04 firing?"**

A. Not the oven — dehydroxylation needs 450–600 °C and a kitchen oven tops out
near 260 °C. Cone 04 works and piggybacking on a bisque is standard practice.
Raw-to-calcined substitution goes by LOI. For crawling or shrinkage problems a
50:50 raw/calcined blend is usually better than fully calcined.

---

**Q. "Standard 630 or Standard 420 for saggars? Extra grog?"**

A. 420, and it isn't close — Standard's most heavily grogged sculpture body.
Grog arrests crack propagation, opens the structure against thermal gradients,
and cuts shrinkage to ~8% at cone 6 versus 12%+ for a fine throwing body. 630 is
a dense vitrifying whiteware; a saggar from it is a thermal-shock bomb. 420 is
rated cone 2–6 and sits at 8% absorption at cone 2 — and a saggar *wants* to be
underfired and porous. For saggar duty generally, stop optimizing for a named
low-expansion body and use the groggiest dark stoneware available, wedged with
extra coarse grog. The saggar is sacrificial.

---

**Q. "Cite a source on saggar wadding for a large lid gap at cone 6."**

A. Digitalfire for the standard 50:50 alumina hydrate and EPK. EPK is there as a
plasticizer, not a refractory. For a large gap, go higher-alumina — closer to
4:1 alumina:EPK — to minimize shrinkage and hold the seal.

---

**Q. "Frits that source lithium or strontium?"**

A. Fusion F-493 (~11% Li₂O) and F-581 (~39% SrO) are appropriate but unlikely to
be available at retail quantities; contact Brackers or Tucker's directly.

---

## 8. Experiment design

**Q. "A triaxial of silica, lithia, and strontia."**

A. Silica can't be a triaxial corner when it needs to vary independently of the
fluxes. Revised to a 10-tile triaxial with Li₂CO₃, SrCO₃, and magnesia at the
corners at a constant 0.10 mol flux addition per 100 g base, holding GA6-C as the
fixed background. **Talc over dolomite** as the magnesia source — talc's co-oxide
is silica, which helps expansion, whereas dolomite's is CaO, a high-expansion
flux that confounds the Mg axis. That swap improved the Mg-corner expansion
7.04→6.83.

---

**Q. [Designing an afternoon's mixing session to fill one shelf]**

A. Per stain: mix one oversized stained base batch (base + 8% stain), split it,
*then* add variegator to the splits — so the blend varies only the variegator
while stain concentration stays constant. Blending a variegator-only batch
against a stain-only batch dilutes both variables at once.

**Skill note:** "hold the colorant constant, vary one axis" is a generalizable
rule the skill should apply whenever it proposes a blend.

---

**Q. [9-tile copper red grid]**

A. Vary SiC (0.25/0.30/0.50) against copper carbonate (0.4/0.6/0.8), all nine in
**one firing** so the cooling curve is a constant. Include the too-high SiC row
deliberately — it tells you where "too much" starts. Label tiles on the back with
underglaze pencil before glazing.

---

## 9. When the flags are the point

**Q. [Cone 6 soda-ash shino for saggar carbon trapping]**

A. Analysis flagged five things against cone-6-glossy: Al₂O₃ 0.87 vs 0.5, KNaO
0.67 vs 0.35, Si:Al 4.30 vs 6, CaO low, B₂O₃ low. **All five flags are the shino
signature, not errors.** For comparison, the classic Malcolm Davis cone 10 shino
computes to Si:Al 3.49, Al₂O₃ 1.093, KNaO 0.77 — further outside still.

**Skill note:** the highest-value behavior in the whole corpus. The skill already
says limits are heuristics; it should go further and name the **glaze families
that live outside them by design** — shino, tenmoku/kaki, crystalline, matte,
raku — so flags get interpreted rather than recited.

---

## 10. Corrections — the highest-signal eval cases

These are places where the first answer was wrong and had to be revised. Each one
is a good regression test.

| # | Wrong first answer | Correct answer | Trigger |
|---|---|---|---|
| 1 | Lithium raises thermal expansion, cut it first if crazing | Additive calculation **overstates** lithium's contribution; real fired expansion is lower (Hansen/Digitalfire). Cut the 3134/soda first. Lithium is a keeper. | Alex pushed back citing Hansen |
| 2 | Diagnosed orange peel as a firing schedule problem | Schedule was already right (hot cone 7, 45-min drop, 2–4 hr hold); real cause was the melt crossing 1150–1100 °C too fast *before* the soak | Alex supplied schedule details |
| 3 | Cobalt reads blue because concentration is too high | Concentration was 0.25%; cause is B₂O₃ stabilizing tetrahedral Co plus Al₂O₃ 0.461 forming CoAl₂O₄ spinel | Alex stated the loading |
| 4 | Kaki won't work, alumina is 0.54 | Blend had reached Al₂O₃ 0.44, Si:Al 8.0:1 — genuinely iron-red territory | Alex sent the screenshot |
| 5 | Misidentified the recipe as the low-alumina lithium-carbonate version, raised spurious durability concerns | It was the spodumene/talc/silica variant with meaningfully higher alumina | Alex corrected |
| 6 | Skeptical about comparing computed expansion numbers across glazes | Comparing on the **same coefficient set** against an empirically-anchored known-good glaze is valid — G2926B at 6.4 fits Frost, so the variant at 5.0 is a meaningful 1.4 below | Alex made the argument |
| 7 | Claimed lithium affects iron speckling | No citable source; walked back to what is supported (fluxes generally affect iron crystal behavior) | Alex asked for a citation |
| 8 | Assumed a screenshot recipe contained SiC | It contained none — prior carbon trapping came from saggar charcoal, making the next firing the first true SiC attempt | Reading the recipe carefully |

**Patterns across all eight:**

1. **Over-inferring from a number without checking the input.** #3, #4, #5, #8.
   The fix is to restate the recipe or loading being analyzed before diagnosing.
2. **Treating the additive expansion model as ground truth.** #1, #6. It's a
   comparative index, unreliable for Li/Mg/spodumene, and *most* useful when
   anchored to a glaze with known empirical fit on that body.
3. **Reaching for the firing schedule as a default explanation.** #2. Ask what
   the schedule actually was first.
4. **Asserting mechanism without a source.** #7. Alex checks citations. Mark the
   line between documented and extrapolated.

---

## 11. Coverage gaps worth adding

- **Body COE data file** — Frost, 630, 420, with a note that Standard publishes
  nothing and 630 must be anchored empirically.
- **Named target profiles beyond glossy** — `cone6-iron-crystal`,
  `cone6-copper-red`, `cone6-matte`, and a shino/outlier note.
- **A `--lint` pass independent of UMF** — duplicate lines, raw-vs-calcined clay
  split, LOI total and *timing*, negligible-contribution materials.
- **Frit decision table** — 3110 vs 3134 vs 3249, expansion effect vs boron cost.
- **Matte terminology** — dolomite matte names the input, diopside matte names the
  output crystal (CaMgSi₂O₆); same phenomenon from two angles. Magnesia matte
  (high MgO, low CaO, usually talc) gives enstatite/forsterite and is a genuinely
  distinct category.
- **Additions vs base** — SiC, tin, copper, stains are additions; compute fit and
  melt on the base and say so.
- **Colorant safety notes** — chrome volatility (chrome-tin pink flashing on
  anything tin-bearing in the same load), Cr³⁺→Cr⁶⁺ risk in oxidation with high
  CaO, copper leaching, and the aquarium copper test kit as a ~$15 home proxy on
  a 24 h 4% acetic acid extract.
