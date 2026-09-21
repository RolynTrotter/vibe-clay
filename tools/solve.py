#!/usr/bin/env python3
"""
vibe-clay recipe solver — the limit bands as a linear program.

WHY THIS EXISTS
---------------
Finding a recipe that lands inside a set of UMF bands has been done here with
random-restart coordinate descent: tens of thousands of calls to the chemistry
engine, hundreds of restarts, a weighted objective, and local optima to defend
against. That was solving a linear problem the hard way.

Everything the engine reports is linear in the amounts vector x:

    oxide moles = M·x      flux moles = f·x      fired grams = g·x
    batch grams = 1·x      gas grams  = l·x

and everything it *prints* is a ratio of two of those. Clear the denominator and
every band becomes a linear inequality:

    Al2O3 <= 0.26          ->  (M_Al2O3 - 0.26·f)·x <= 0
    Si:Al >= 8.0           ->  (M_SiO2 - 8.0·M_Al2O3)·x >= 0
    expansion <= 6.95      ->  (e·M - 6.95·1·M)·x <= 0
    LOI <= 6%              ->  l·x <= 6          (with 1·x fixed at 100)

So the feasible set is a convex polytope. There are no local optima to escape,
nothing to restart, and the simplex returns a certificate: either a point, or a
proof that no point exists. Three queries then answer what the search was being
asked for:

  1. FEASIBILITY  - is there any recipe in this palette inside all the bands?
                    If not, --explain names which bands are fighting.
  2. MARGIN       - the Chebyshev-style centre: the recipe furthest from every
                    band edge. This is the better notion of "best" here, because
                    the binding uncertainty is nominal-vs-actual material
                    analysis. Max margin = survives a different bag of Custer.
                    (Found by bisection over t: each step is one LP.)
  3. RANGING      - min and max of each material over the whole feasible set.
                    "Spodumene 6-14, strontium 0 always" is an exact bound,
                    not a frequency count over restarts.

WHAT IT DOES NOT DO
-------------------
- It does not know whether the glaze will turn red. It optimises the numbers
  you hand it, which are a proxy chosen by a person.
- The material analyses are still nominal. An exact optimum over approximate
  coefficients is not an exact optimum.
- The expansion model is still the relative additive index, still least
  reliable exactly where this studio works (lithium, magnesia). Solving it to
  three decimals does not make it true. Use --expansion as a band to stay
  inside, not a value to hit.
- A hard cap on the NUMBER of materials is the one genuinely non-linear ask
  (it is a cardinality constraint -> MILP). Not implemented. In practice LP
  vertex solutions are already sparse: nonzeros <= active constraints.
- The palette is still yours. That critique of the old search does not go away
  — but a wide palette now costs nothing, so pass `--palette all` and let
  --range tell you what got excluded, instead of pre-drawing the box.

USAGE
-----
    node tools/analyze.mjs --matrix > /tmp/m.json

    python3 tools/solve.py --matrix /tmp/m.json \
        --target cone6-copper-red \
        --palette "Ferro Frit 3110,Ferro Frit 3249,Silica,Spodumene,Lithium Carbonate,Kaolin (EPK),Wollastonite,Bone Ash" \
        --expansion 6.55 6.95 --max-loi 6 --no-late-gas --range --verify
"""

import argparse
import json
import os
import subprocess
import sys

try:
    import numpy as np
    from scipy.optimize import linprog
except ImportError:
    sys.exit("needs numpy and scipy:  pip install numpy scipy")

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
BATCH = 100.0  # normalise the batch, so x is directly "parts per 100 g"


# --------------------------------------------------------------------------
# linear functionals over the amounts vector
# --------------------------------------------------------------------------
class Space:
    """Per-gram coefficient vectors for the chosen palette."""

    def __init__(self, mats):
        self.mats = mats
        self.names = [m["name"] for m in mats]
        self.n = len(mats)
        self.batch = np.ones(self.n)
        self.flux = np.array([m["fluxMolesPerGram"] for m in mats])
        self.total_moles = np.array([m["totalMolesPerGram"] for m in mats])
        # The engine defines LOI as (batch - fired)/batch where fired is the sum
        # of the oxide analysis — NOT the material's declared `loi` field, which
        # can differ by a few tenths where an analysis does not sum cleanly.
        # Match the engine, or the solver's LOI and the engine's will disagree
        # on the same recipe and neither number will be trustworthy.
        self.fired = np.array([m["firedGramsPerGram"] for m in mats])
        self.loi = 1.0 - self.fired
        # Declared LOI is still the right basis for GAS attribution, because it
        # is what actually leaves at a known temperature. Same split lintRecipe makes.
        self.declared_loi = np.array([m["loiGramsPerGram"] for m in mats])
        self.late_gas = np.array([m["lateGasGramsPerGram"] for m in mats])
        self.price = np.array([(m.get("pricePerKg") or 0.0) / 1000.0 for m in mats])

    def mol(self, ox):
        return np.array([m["molesPerGram"].get(ox, 0.0) for m in self.mats])

    def knao(self):
        return self.mol("K2O") + self.mol("Na2O")

    def expansion_num(self, factors):
        v = np.zeros(self.n)
        for ox, f in factors.items():
            v = v + self.mol(ox) * f
        return v


class Band:
    """A two-sided band on q(x)/d(x), stored so the margin can slide the edges.

    num/den are coefficient vectors; the constraint is
        lo + t*half  <=  num·x / den·x  <=  hi - t*half
    which, multiplied through by den·x (always positive), is linear in x for a
    fixed t. That is why the margin is found by bisection on t rather than as a
    variable: t*x would be bilinear.
    """

    def __init__(self, label, num, den, lo, hi):
        self.label, self.num, self.den, self.lo, self.hi = label, num, den, lo, hi
        self.half = (hi - lo) / 2.0

    def rows(self, t):
        lo = self.lo + t * self.half
        hi = self.hi - t * self.half
        # num - hi*den <= 0  ;  -(num - lo*den) <= 0
        return [(self.num - hi * self.den), -(self.num - lo * self.den)]

    def value(self, x):
        d = float(self.den @ x)
        return float(self.num @ x) / d if d else float("nan")


class Cap:
    """A one-sided hard constraint: num·x <= limit * den·x.

    Caps do NOT participate in the margin. A margin is a distance from the
    middle of a band, and a cap has no middle — 'as little gas as possible' is
    not 'halfway between 0 and 6%'.
    """

    def __init__(self, label, num, den, limit):
        self.label, self.num, self.den, self.limit = label, num, den, limit

    def row(self):
        return self.num - self.limit * self.den

    def value(self, x):
        d = float(self.den @ x)
        return float(self.num @ x) / d if d else float("nan")


# --------------------------------------------------------------------------
# Materials that belong in the ADDITIONS, not the base. Colorants were already
# excluded; opacifiers have to be too, and for a reason worth stating: the
# expansion index is a mole-fraction weighted average, so tin (factor 6.0) and
# zirconium (4.5) sit below a typical glaze's average and pull the number down
# purely by being present. To an objective that maximises band margin that is a
# free knob, and the solver used it — `--palette all` on cone 6 copper red
# returned 60 parts tin oxide, round-tripping through the engine cleanly at
# t* = 0.94. The numbers were right; the recipe was nonsense. Bands describe the
# base glass, so the base glass is what the LP gets to choose.
NOT_BASE_TAGS = ("colorant", "opacifier")


def base_palette(matrix):
    return [m for m in matrix["materials"]
            if not any(t in NOT_BASE_TAGS for t in m.get("tags", []))]


def build(sp, target, args, matrix):
    bands, caps = [], []
    # NOTE: --band overrides are applied by the caller, after the target's own
    # bands are in place, so a user band replaces rather than duplicates.

    for ox, (lo, hi) in (target.get("oxides") or {}).items():
        num = sp.knao() if ox == "KNaO" else sp.mol(ox)
        bands.append(Band(f"{ox} (UMF)", num, sp.flux, float(lo), float(hi)))

    for key, (lo, hi) in (target.get("ratios") or {}).items():
        a, b = key.split("_", 1)
        num = sp.mol("SiO2") + sp.mol("B2O3") if a == "SiB" else sp.mol(a)
        bands.append(Band(key.replace("_", ":"), num, sp.mol(b), float(lo), float(hi)))

    if args.expansion:
        lo, hi = args.expansion
        bands.append(Band("expansion (rel)",
                          sp.expansion_num(matrix["expansionFactor"]),
                          sp.total_moles, float(lo), float(hi)))

    if args.max_loi is not None:
        caps.append(Cap("LOI %", sp.loi * 100.0, sp.batch, float(args.max_loi)))

    if args.no_late_gas:
        caps.append(Cap("gas after melt seal (g/100g)", sp.late_gas * 100.0, sp.batch, 0.0))
    elif args.max_late_gas is not None:
        caps.append(Cap("gas after melt seal (g/100g)", sp.late_gas * 100.0, sp.batch,
                        float(args.max_late_gas)))

    return bands, caps


# Every band is stored as num/den and enforced by clearing the denominator:
#     num - hi*den <= 0      lo*den - num <= 0
# That is equivalent to lo <= num/den <= hi ONLY while den > 0. Nothing in the
# problem forces that, and the failure is not academic: with den = 0 both rows
# collapse to 0 <= 0 and every band is "satisfied" by a recipe that contains no
# flux at all. The first version of this solver returned 100 g of tin oxide
# (flux moles ~2e-15) as a feasible cone 6 copper red, and --check-targets
# therefore passed every profile including one that is arithmetically
# unsatisfiable. The floors below are what make a feasibility result mean
# anything.
DEN_FLOOR = 1e-3


def denominator_floors(sp, bands):
    """One row per distinct band denominator, forcing it strictly positive."""
    rows, seen = [], []
    for b in bands:
        if any(np.allclose(b.den, d) for d in seen):
            continue
        seen.append(b.den)
        rows.append(-b.den)
    return rows


def solve(sp, bands, caps, t, bounds, objective, floor_bands=None):
    """floor_bands: the band set the denominator floors come from. --explain
    drops bands one at a time to find a culprit, and must NOT drop the floor
    along with the band — otherwise a 'relaxation' that merely re-admits the
    degenerate fluxless point gets reported as the conflict."""
    A = [r for b in bands for r in b.rows(t)] + [c.row() for c in caps]
    b_ub = [0.0] * len(A)
    floors = denominator_floors(sp, bands if floor_bands is None else floor_bands)
    A += floors
    b_ub += [-DEN_FLOOR] * len(floors)
    res = linprog(objective, A_ub=np.array(A), b_ub=np.array(b_ub),
                  A_eq=np.array([sp.batch]), b_eq=np.array([BATCH]),
                  bounds=bounds, method="highs")
    return res


def bisect_margin(sp, bands, caps, bounds, objective, iters=26):
    if not solve(sp, bands, caps, 0.0, bounds, objective).success:
        return None, None
    lo, hi = 0.0, 1.0
    best = solve(sp, bands, caps, 0.0, bounds, objective)
    for _ in range(iters):
        mid = (lo + hi) / 2.0
        r = solve(sp, bands, caps, mid, bounds, objective)
        if r.success:
            lo, best = mid, r
        else:
            hi = mid
    return lo, best


def explain(sp, bands, caps, bounds, objective):
    """Infeasible: which single band, dropped, restores feasibility?

    Not a minimal IIS — it is the cheap and readable version: if removing one
    band makes the problem solvable, that band is in every conflict.
    """
    out = []
    for i in range(len(bands)):
        trial = bands[:i] + bands[i + 1:]
        if solve(sp, trial, caps, 0.0, bounds, objective, floor_bands=bands).success:
            out.append(bands[i].label)
    for i in range(len(caps)):
        trial = caps[:i] + caps[i + 1:]
        if solve(sp, bands, trial, 0.0, bounds, objective, floor_bands=bands).success:
            out.append(caps[i].label)
    return out


def main():
    ap = argparse.ArgumentParser(description="Solve a glaze recipe as a linear program.")
    ap.add_argument("--matrix", help="output of `node tools/analyze.mjs --matrix` (default: run it)")
    ap.add_argument("--target")
    ap.add_argument("--check-targets", action="store_true",
                    help="feasibility-check every shipped target against the full material "
                         "database, with no extra constraints. A target that cannot be "
                         "satisfied by ANY recipe is a bug in the limits data, not a hard glaze.")
    ap.add_argument("--palette",
                    help="comma-separated material names, or 'all'")
    ap.add_argument("--expansion", nargs=2, type=float, metavar=("LO", "HI"))
    ap.add_argument("--band", action="append", default=[], metavar="OXIDE=LO:HI",
                    help="add or override a UMF band, e.g. --band MgO=0:0.18. Overriding a "
                         "target band mid-process is a one-line re-solve here, and the new "
                         "margin tells you immediately what it cost.")
    ap.add_argument("--max-loi", type=float)
    ap.add_argument("--no-late-gas", action="store_true",
                    help="forbid any gas arriving at or after the sealing melt")
    ap.add_argument("--max-late-gas", type=float, metavar="G",
                    help="instead of forbidding it, cap g per 100 g batch")
    ap.add_argument("--max-part", type=float, default=60.0,
                    help="cap on any one material, parts per 100 (default 60)")
    ap.add_argument("--fix", action="append", default=[], metavar="NAME=LO:HI",
                    help="pin one material to a range, e.g. --fix 'Bone Ash=2:3'")
    ap.add_argument("--range", action="store_true", help="min/max of each material over the feasible set")
    ap.add_argument("--verify", action="store_true", help="round-trip the answer through analyze.mjs")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    if args.matrix:
        matrix = json.load(open(args.matrix))
    else:
        matrix = json.loads(subprocess.run(
            ["node", os.path.join(HERE, "analyze.mjs"), "--matrix"],
            capture_output=True, text=True, check=True).stdout)

    if args.check_targets:
        pal = base_palette(matrix)
        bad = 0
        for key, tgt in matrix["targets"].items():
            sp_all = Space(pal)
            class _A:  # no expansion band, no caps — bands only
                expansion = None; max_loi = None; no_late_gas = False; max_late_gas = None
            bands, caps = build(sp_all, tgt, _A(), matrix)
            bnds = [(0.0, 100.0)] * sp_all.n
            r = solve(sp_all, bands, caps, 0.0, bnds, sp_all.loi)
            if r.success:
                print(f"  ✓ {key}")
            else:
                bad += 1
                print(f"  ✗ {key} — UNSATISFIABLE by any recipe in the material database")
                for c in explain(sp_all, bands, caps, bnds, sp_all.loi):
                    print(f"      conflict runs through: {c}")
        sys.exit(1 if bad else 0)

    if not args.target or not args.palette:
        sys.exit("--target and --palette are required (or use --check-targets)")
    if args.target not in matrix["targets"]:
        sys.exit(f"unknown target '{args.target}'. Known: {', '.join(matrix['targets'])}")
    target = matrix["targets"][args.target]

    by_name = {m["name"]: m for m in matrix["materials"]}
    if args.palette.strip() == "all":
        chosen = base_palette(matrix)
    else:
        chosen = []
        for want in [w.strip() for w in args.palette.split(",") if w.strip()]:
            w = want.lower()
            hit = (by_name.get(want)
                   or next((m for m in matrix["materials"]
                            if any(w == a.lower() for a in m.get("aliases", []))), None)
                   or next((m for m in matrix["materials"] if w in m["name"].lower()), None))
            if not hit:
                sys.exit(f"no material matching '{want}'")
            if hit not in chosen:
                chosen.append(hit)

    sp = Space(chosen)
    bands, caps = build(sp, target, args, matrix)
    for spec in args.band:
        ox, rng = spec.split("=", 1)
        lo, hi = (float(v) for v in rng.split(":"))
        ox = ox.strip()
        num = sp.knao() if ox == "KNaO" else sp.mol(ox)
        bands = [b for b in bands if b.label != f"{ox} (UMF)"]
        bands.append(Band(f"{ox} (UMF)", num, sp.flux, lo, hi))


    bounds = [(0.0, args.max_part)] * sp.n
    for spec in args.fix:
        name, rng = spec.split("=", 1)
        lo, hi = (float(v) for v in rng.split(":"))
        matches = [i for i, n in enumerate(sp.names) if name.strip().lower() in n.lower()]
        if not matches:
            sys.exit(f"--fix: no material matching '{name}'")
        for i in matches:
            bounds[i] = (lo, hi)

    # Tiebreak among equally-central recipes: least gas. Cost if prices exist.
    objective = sp.price if sp.price.any() else sp.declared_loi

    t, res = bisect_margin(sp, bands, caps, bounds, objective)

    if res is None:
        print(f"INFEASIBLE — no recipe in this palette satisfies {args.target} "
              f"plus the extra constraints.\n")
        culprits = explain(sp, bands, caps, bounds, objective)
        if culprits:
            print("Dropping any ONE of these on its own makes it solvable, so the conflict runs "
                  "through them:")
            for c in culprits:
                print(f"  · {c}")
            print("\nThat is a proof about this palette, not a hunch: widen the palette, or widen "
                  "one of those bands, or accept that the two cannot both hold.")
        else:
            print("No single band relaxation fixes it — the conflict involves three or more at "
                  "once, or the palette simply cannot reach these oxides at all.")
        sys.exit(2)

    x = res.x
    recipe = [(sp.names[i], round(float(x[i]), 2)) for i in range(sp.n) if x[i] > 0.05]

    payload = {
        "target": args.target,
        "margin": round(t, 3),
        "recipe": [{"material": n, "amount": a} for n, a in recipe],
        "bands": [{"label": b.label, "lo": b.lo, "hi": b.hi, "value": round(b.value(x), 4)}
                  for b in bands],
        "caps": [{"label": c.label, "limit": c.limit, "value": round(c.value(x), 4)} for c in caps],
    }

    if args.json:
        print(json.dumps(payload, indent=2))
    else:
        print(f"\nFEASIBLE. margin t* = {t:.3f}")
        print("  t is the fraction of each band's half-width held clear on EVERY two-sided band")
        print("  at once. t=0 means sitting on an edge; t=1 means dead centre of all of them.")
        print(f"\nRecipe (parts per 100 g, {len(recipe)} lines):")
        for n, a in recipe:
            print(f"  {n:<26} {a:>6.2f}")
        print("\nBands:")
        for b in bands:
            v = b.value(x)
            pos = (v - (b.lo + b.hi) / 2) / b.half if b.half else 0
            print(f"  {b.label:<22} [{b.lo:g}, {b.hi:g}]   {v:8.3f}   "
                  f"{'centre' if abs(pos) < .02 else f'{abs(pos)*100:.0f}% toward {chr(104) if pos>0 else chr(108)}' }")
        for c in caps:
            print(f"  {c.label:<22} <= {c.limit:g}        {c.value(x):8.3f}")

    if args.range:
        print("\nRanging over the FULL feasible set (t=0) — exact bounds, not a tally of restarts:")
        print(f"  {'material':<26}{'min':>8}{'max':>8}")
        for i in range(sp.n):
            e = np.zeros(sp.n); e[i] = 1.0
            lo_r = solve(sp, bands, caps, 0.0, bounds, e)
            hi_r = solve(sp, bands, caps, 0.0, bounds, -e)
            if not (lo_r.success and hi_r.success):
                continue
            lo_v, hi_v = lo_r.x[i], hi_r.x[i]
            note = "  never used" if hi_v < 0.05 else ("  always required" if lo_v > 0.05 else "")
            print(f"  {sp.names[i]:<26}{lo_v:8.2f}{hi_v:8.2f}{note}")

    if args.verify:
        js = json.dumps({"name": f"LP t={t:.2f}",
                         "lines": [{"material": n, "amount": a} for n, a in recipe]})
        print("\nRound-tripped through the engine (same numbers, computed the other way):")
        out = subprocess.run(
            ["node", os.path.join(HERE, "analyze.mjs"), "--brief", "--target", args.target],
            input=js, capture_output=True, text=True)
        print("  " + out.stdout.strip())
        if out.stderr.strip():
            print("  " + out.stderr.strip())


if __name__ == "__main__":
    main()
