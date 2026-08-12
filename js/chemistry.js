// glaze-chemistry engine — vanilla ES module, no build step, no dependencies.
//
// Given a recipe (materials + batch amounts) and a materials database (oxide
// weight-% analyses), this computes the things a potter actually reads off
// Insight-Live / Desktop Insight:
//
//   - the fired oxide composition by weight-% and by mole-%
//   - the UMF (Unity Molecular Formula, a.k.a. Seger formula): fluxes summed to
//     1.0, with Al2O3, SiO2, B2O3, etc. expressed relative to that unity
//   - the SiO2:Al2O3 ratio (a headline glaze number)
//   - a linear-additivity estimate of thermal expansion
//   - batch cost, if per-kg prices are supplied
//
// The math is deliberately explicit and commented so it can be audited against
// a known Insight calculation.

// --- Oxide reference data -------------------------------------------------
// Molar mass in g/mol. Used to convert oxide grams -> moles.
export const OXIDE_MOLAR_MASS = {
  SiO2: 60.08, Al2O3: 101.96, B2O3: 69.62,
  Na2O: 61.98, K2O: 94.20, Li2O: 29.88,
  CaO: 56.08, MgO: 40.30, BaO: 153.33, SrO: 103.62, ZnO: 81.38, PbO: 223.20,
  Fe2O3: 159.69, TiO2: 79.87, MnO: 70.94, MnO2: 86.94,
  P2O5: 141.94, ZrO2: 123.22, SnO2: 150.71,
  CuO: 79.55, Cr2O3: 151.99, CoO: 74.93, NiO: 74.69, F: 19.00,
};

// Which UMF column each oxide belongs to. The RO/R2O "flux" group is what gets
// normalised to unity (sum = 1.0). This is the classic Seger grouping; boron is
// reported on its own line (common Insight/Digitalfire convention) rather than
// folded into the flux total.
export const OXIDE_GROUP = {
  // Fluxes (RO + R2O) — the unity group
  Na2O: 'flux', K2O: 'flux', Li2O: 'flux',
  CaO: 'flux', MgO: 'flux', BaO: 'flux', SrO: 'flux', ZnO: 'flux', PbO: 'flux',
  // Stabilisers / amphoteric (R2O3)
  Al2O3: 'stabiliser', Fe2O3: 'stabiliser', Cr2O3: 'stabiliser',
  // Boron — shown separately
  B2O3: 'boron',
  // Glass-formers (RO2)
  SiO2: 'glass', TiO2: 'glass', ZrO2: 'glass', SnO2: 'glass', P2O5: 'glass',
  // Colorant / minor RO oxides — counted in analysis, not in the flux unity
  CuO: 'other', CoO: 'other', NiO: 'other', MnO: 'other', MnO2: 'other', F: 'other',
};

// Relative linear thermal-expansion factors per oxide (×10^-7 /°C per mole
// fraction), English & Turner / Appen-style additive coefficients. This is an
// ESTIMATE model — good for comparing two glazes, not an absolute dilatometer
// reading. Oxides not listed contribute ~0.
export const EXPANSION_FACTOR = {
  SiO2: 3.8, Al2O3: 6.3, B2O3: 0.0,
  Na2O: 39.5, K2O: 46.5, Li2O: 6.7,
  CaO: 16.3, MgO: 4.5, BaO: 20.0, SrO: 15.0, ZnO: 7.0, PbO: 10.6,
  Fe2O3: 13.3, TiO2: 8.5, ZrO2: 4.5, SnO2: 6.0, P2O5: 8.0,
};

const round = (n, dp = 3) => {
  const f = 10 ** dp;
  return Math.round((n + Number.EPSILON) * f) / f;
};

/**
 * Build a fast lookup of a materials database by name.
 * @param {{materials: Array}} db  parsed materials.json
 */
export function indexMaterials(db) {
  const map = new Map();
  for (const m of db.materials) map.set(m.name, m);
  return map;
}

/**
 * Normalise a material name for fuzzy matching: lowercase, drop punctuation and
 * parentheticals, collapse whitespace. So "Ferro Frit 3134", "F3134" and
 * "frit 3134" can all be recognised.
 */
export function normalizeName(s) {
  return String(s).toLowerCase().replace(/[()._\-/]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Build a resolver that maps any incoming material name (canonical, alias, or a
 * near-miss) to the canonical database name, or null if unknown. Used by the
 * Insight-Live importer so exported recipes line up with our materials.
 * @param {{materials: Array}} db
 * @returns {(name: string) => string | null}
 */
export function buildResolver(db) {
  const map = new Map();
  for (const m of db.materials) {
    map.set(normalizeName(m.name), m.name);
    for (const a of m.aliases || []) map.set(normalizeName(a), m.name);
  }
  return name => map.get(normalizeName(name)) || null;
}

/**
 * Core analysis.
 * @param {Array<{material: string, amount: number, additive?: boolean}>} recipe
 *        list of lines; `amount` in grams (batch). `additive:true` marks
 *        colorants/opacifiers added on top of the base 100 — they still count
 *        toward chemistry.
 * @param {Map} materialIndex  from indexMaterials()
 * @param {object} [opts]
 * @param {Object<string,number>} [opts.prices]  material name -> price per kg
 * @returns full analysis object
 */
export function analyzeRecipe(recipe, materialIndex, opts = {}) {
  const oxideGrams = {};     // fired grams of each oxide across the batch
  const unknownMaterials = [];
  let batchGrams = 0;        // total raw grams batched (base + additions)
  let baseGrams = 0;         // base recipe only
  let additionGrams = 0;     // additions ("added on top") only
  let cost = 0;
  let haveAnyPrice = false;

  for (const line of recipe) {
    const amount = Number(line.amount) || 0;
    if (amount <= 0) continue;
    batchGrams += amount;
    if (line.additive) additionGrams += amount; else baseGrams += amount;

    const mat = materialIndex.get(line.material);
    if (!mat) { unknownMaterials.push(line.material); continue; }

    // grams of each oxide = raw grams × (oxide wt% / 100). LOI just doesn't
    // contribute any oxide, so fired oxides fall out naturally.
    for (const [ox, pct] of Object.entries(mat.oxides || {})) {
      oxideGrams[ox] = (oxideGrams[ox] || 0) + amount * (pct / 100);
    }

    if (opts.prices && opts.prices[line.material] != null) {
      haveAnyPrice = true;
      cost += (amount / 1000) * opts.prices[line.material]; // grams -> kg × $/kg
    }
  }

  // Convert to moles.
  const oxideMoles = {};
  let totalFiredGrams = 0;
  for (const [ox, g] of Object.entries(oxideGrams)) {
    totalFiredGrams += g;
    const mm = OXIDE_MOLAR_MASS[ox];
    if (mm) oxideMoles[ox] = g / mm;
  }

  // Flux total (RO + R2O) → this becomes 1.0 in the UMF.
  let fluxMoles = 0;
  for (const [ox, mol] of Object.entries(oxideMoles)) {
    if (OXIDE_GROUP[ox] === 'flux') fluxMoles += mol;
  }

  let totalMoles = 0;
  for (const mol of Object.values(oxideMoles)) totalMoles += mol;

  // Build the per-oxide report.
  const oxides = {};
  for (const ox of Object.keys(oxideMoles)) {
    const mol = oxideMoles[ox];
    oxides[ox] = {
      group: OXIDE_GROUP[ox] || 'other',
      grams: round(oxideGrams[ox], 3),
      moles: round(mol, 5),
      weightPct: totalFiredGrams ? round((oxideGrams[ox] / totalFiredGrams) * 100, 2) : 0,
      molePct: totalMoles ? round((mol / totalMoles) * 100, 2) : 0,
      // UMF value: moles relative to the flux unity. Fluxes sum to 1.0.
      umf: fluxMoles ? round(mol / fluxMoles, 3) : 0,
    };
  }

  // Headline ratios (matching what Insight-Live reports).
  const siMol = oxideMoles.SiO2 || 0;
  const alMol = oxideMoles.Al2O3 || 0;
  const bMol = oxideMoles.B2O3 || 0;
  const siAlRatio = alMol ? round(siMol / alMol, 2) : null;
  const siBAlRatio = alMol ? round((siMol + bMol) / alMol, 2) : null;

  // R2O:RO — split the flux unity into alkali (R2O: Na2O K2O Li2O) vs alkaline
  // earth (RO: CaO MgO BaO SrO ZnO PbO), normalised to sum to 1.0.
  const R2O_SET = new Set(['Na2O', 'K2O', 'Li2O']);
  let r2oMol = 0, roMol = 0;
  for (const [ox, mol] of Object.entries(oxideMoles)) {
    if (OXIDE_GROUP[ox] !== 'flux') continue;
    if (R2O_SET.has(ox)) r2oMol += mol; else roMol += mol;
  }
  const fluxSplit = fluxMoles
    ? { R2O: round(r2oMol / fluxMoles, 2), RO: round(roMol / fluxMoles, 2) }
    : null;
  // KNaO — combined K2O+Na2O flux value (Insight shows this grouped line).
  const kNaO = fluxMoles ? round(((oxideMoles.K2O || 0) + (oxideMoles.Na2O || 0)) / fluxMoles, 2) : null;

  return {
    batchGrams: round(batchGrams, 2),
    baseGrams: round(baseGrams, 2),
    additionGrams: round(additionGrams, 2),
    firedGrams: round(totalFiredGrams, 2),
    loiPct: batchGrams ? round(((batchGrams - totalFiredGrams) / batchGrams) * 100, 2) : 0,
    fluxUnityMoles: round(fluxMoles, 5),
    oxides,
    ratios: { SiO2_Al2O3: siAlRatio, SiB_Al2O3: siBAlRatio, KNaO: kNaO },
    fluxSplit,
    thermalExpansion: estimateExpansion(oxideMoles),
    cost: haveAnyPrice ? {
      total: round(cost, 2),
      perKgBatch: batchGrams ? round(cost / (batchGrams / 1000), 2) : 0,
    } : null,
    unknownMaterials,
  };
}

/**
 * Normalise a recipe so its base (non-additive) materials sum to `targetBase`
 * grams, scaling additives by the same factor so their ratio to the base is
 * preserved. This makes two recipes directly comparable for blending — a line
 * blend mixes equal *proportions* of each glaze, not equal raw grams. If a
 * recipe has no base materials (all additive), it's left unscaled.
 * @param {Array<{material: string, amount: number, additive?: boolean}>} recipe
 * @param {number} [targetBase=100]
 */
export function normalizeToBase(recipe, targetBase = 100) {
  let base = 0;
  for (const l of recipe) {
    const a = Number(l.amount) || 0;
    if (a > 0 && !l.additive) base += a;
  }
  const scale = base > 0 ? targetBase / base : 1;
  return recipe
    .map(l => ({ material: l.material, additive: !!l.additive, amount: (Number(l.amount) || 0) * scale }))
    .filter(l => l.amount > 0);
}

/**
 * Blend two normalised recipes at proportions fA / fB into a single recipe.
 * Materials are unioned by (name, additive-flag); a material present in only one
 * recipe scales from/to zero across the line. Recipe A's material order leads,
 * then B-only materials.
 */
function blendLines(A, B, fA, fB) {
  const map = new Map(); // "name\0additive" -> { material, additive, amount }
  const accumulate = (lines, f) => {
    for (const l of lines) {
      const key = l.material + ' ' + (l.additive ? '1' : '0');
      const cur = map.get(key) || { material: l.material, additive: l.additive, amount: 0 };
      cur.amount += f * l.amount;
      map.set(key, cur);
    }
  };
  accumulate(A, fA);
  accumulate(B, fB);
  return [...map.values()]
    .map(l => ({ material: l.material, additive: l.additive, amount: round(l.amount, 3) }))
    .filter(l => l.amount > 0);
}

/**
 * Line-blend two glazes into `n` evenly spaced points from 100% A → 100% B and
 * (optionally) analyse each. Each recipe is first normalised to a common base so
 * the blend mixes equal proportions of glaze, the way a potter mixes a line blend
 * from two buckets.
 *
 * @param {Array<{material: string, amount: number, additive?: boolean}>} recipeA
 * @param {Array<{material: string, amount: number, additive?: boolean}>} recipeB
 * @param {number} [n=5]  number of points along the line (min 2).
 * @param {Map} [materialIndex]  from indexMaterials(); if given, each point gets
 *        an `.analysis` from analyzeRecipe().
 * @param {object} [opts]  passed through to analyzeRecipe (e.g. { prices }).
 * @returns {Array<{index:number, pctA:number, pctB:number, label:string,
 *                  lines:Array, analysis?:object}>}
 */
export function lineBlend(recipeA, recipeB, n = 5, materialIndex = null, opts = {}) {
  const steps = Math.max(2, Math.floor(n) || 2);
  const A = normalizeToBase(recipeA);
  const B = normalizeToBase(recipeB);
  const points = [];
  for (let i = 0; i < steps; i++) {
    const fB = i / (steps - 1);
    const fA = 1 - fB;
    const pctA = round(fA * 100, 1);
    const pctB = round(fB * 100, 1);
    const lines = blendLines(A, B, fA, fB);
    const point = {
      index: i,
      fracA: round(fA, 4),
      fracB: round(fB, 4),
      pctA,
      pctB,
      // A:B mix label, e.g. "75:25" — whole numbers when they're whole.
      label: `${fmtPct(pctA)}:${fmtPct(pctB)}`,
      lines,
    };
    if (materialIndex) point.analysis = analyzeRecipe(lines, materialIndex, opts);
    points.push(point);
  }
  return points;
}

const fmtPct = n => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/**
 * Linear-additivity thermal expansion estimate.
 * Sum over oxides of (mole fraction × factor). Relative units (×10^-7/°C-ish).
 * Compare two glazes; don't read as an absolute dilatometer value.
 */
export function estimateExpansion(oxideMoles) {
  let total = 0;
  for (const mol of Object.values(oxideMoles)) total += mol;
  if (!total) return null;
  let coe = 0;
  for (const [ox, mol] of Object.entries(oxideMoles)) {
    const f = EXPANSION_FACTOR[ox];
    if (f != null) coe += (mol / total) * f;
  }
  return round(coe, 2);
}

/**
 * Compare a glaze's computed expansion against a clay body's figure.
 *
 * The engine's expansion is a relative additive index, not a dilatometer COE,
 * so this comparison is only meaningful when ANCHORED — see the note in
 * data/bodies.json. What it is genuinely good for: given a glaze already known
 * to fit the body, reading every other glaze against that same gap.
 *
 * Sign convention, which is the thing people invert: a glaze BELOW the body
 * contracts less on cooling than the body does, so the body squeezes it — the
 * glaze is in COMPRESSION. Too much of that is shivering (flakes off rims and
 * edges). A glaze ABOVE the body is in TENSION, which is crazing.
 *
 * @param {number} expansion   from estimateExpansion()
 * @param {object} body        an entry from data/bodies.json `bodies`
 * @returns {{status: string, headline: string, detail: string,
 *            bodyMid: number|null, gap: number|null, compressionPct: number|null,
 *            targetBand: [number, number]|null, confidence: string}}
 */
export function fitToBody(expansion, body) {
  const confidence = body?.confidence || 'unknown';
  const range = body?.coeRange || (body?.coe != null ? [body.coe, body.coe] : null);

  if (expansion == null || !range) {
    return {
      status: 'no-data',
      headline: `No expansion figure for ${body?.label || 'this body'}`,
      detail: body?.provenance || 'No published figure, and no defensible estimate.',
      bodyMid: null, gap: null, compressionPct: null, targetBand: null, confidence,
    };
  }

  const [lo, hi] = range;
  const bodyMid = round((lo + hi) / 2, 3);
  // Some compression is what you want — roughly 3-8% below the body.
  const targetBand = [round(bodyMid * 0.92, 2), round(bodyMid * 0.97, 2)];
  const gap = round(expansion - bodyMid, 2);
  const compressionPct = round(((bodyMid - expansion) / bodyMid) * 100, 1);

  let status, headline, detail;
  if (expansion > hi) {
    status = 'tension';
    headline = `glaze ${expansion} ABOVE body ${fmtRange(range)} → glaze in tension → crazing direction`;
    detail = 'Lower expansion: cut KNaO (Na₂O worst), add SiO₂, add B₂O₃, shift flux to MgO or Li₂O.';
  } else if (expansion >= targetBand[0] && expansion <= targetBand[1]) {
    status = 'good';
    headline = `glaze ${expansion} sits ${compressionPct}% below body ${fmtRange(range)} → compression, in the usual target band`;
    detail = `Target band for this body is ${targetBand[0]}-${targetBand[1]}. Compression is the strong direction; this is where you want to be.`;
  } else if (expansion > targetBand[1]) {
    status = 'slight-compression';
    headline = `glaze ${expansion} sits ${compressionPct}% below body ${fmtRange(range)} → mild compression, just under the body`;
    detail = `Workable, but closer to the crazing edge than the ${targetBand[0]}-${targetBand[1]} target band. Delayed crazing from moisture expansion is the risk — keep a test tile for weeks, not days.`;
  } else {
    status = 'high-compression';
    headline = `glaze ${expansion} sits ${compressionPct}% below body ${fmtRange(range)} → heavy compression → shivering direction`;
    detail = `Target band is ${targetBand[0]}-${targetBand[1]}. Raise expansion (more KNaO, less SiO₂/B₂O₃) — but note shivering needs a bigger mismatch than crazing does, so a gap alone isn't proof. Check the actual symptom: shivering shows at rims, edges and hole margins, the convex features.`;
  }

  return { status, headline, detail, bodyMid, gap, compressionPct, targetBand, confidence };
}

const fmtRange = ([lo, hi]) => (lo === hi ? String(lo) : `${lo}-${hi}`);

/**
 * Lint a recipe for problems the unity formula structurally cannot see.
 *
 * The UMF is invariant to a whole class of real faults: it does not care
 * whether kaolin is raw or calcined, whether a material appears twice, how much
 * total gas the batch gives off, or WHEN that gas arrives relative to the melt
 * sealing. Every check here is something you could not find by reading the UMF,
 * however carefully.
 *
 * @param {Array<{material: string, amount: number, additive?: boolean}>} recipe
 * @param {Map} materialIndex  from indexMaterials()
 * @returns {Array<{level: 'warn'|'note', code: string, message: string, fix?: string}>}
 */
export function lintRecipe(recipe, materialIndex) {
  const findings = [];
  const lines = recipe.filter(l => (Number(l.amount) || 0) > 0);

  let baseGrams = 0, additionGrams = 0;
  for (const l of lines) {
    const a = Number(l.amount) || 0;
    if (l.additive) additionGrams += a; else baseGrams += a;
  }

  // --- duplicate lines ------------------------------------------------------
  // Layering corrections onto a recipe over time is how a glaze ends up with two
  // silica lines and two frit lines. The UMF sums them and looks perfectly fine.
  const seen = new Map();
  for (const l of lines) {
    const key = l.material + ' ' + (l.additive ? '1' : '0');
    const cur = seen.get(key) || { material: l.material, additive: !!l.additive, count: 0, total: 0 };
    cur.count += 1;
    cur.total += Number(l.amount) || 0;
    seen.set(key, cur);
  }
  for (const d of seen.values()) {
    if (d.count > 1) {
      findings.push({
        level: 'warn',
        code: 'duplicate-line',
        message: `${d.material} appears ${d.count}× (totalling ${round(d.total, 2)} g${d.additive ? ', as an addition' : ''}).`,
        fix: `Merge into one ${round(d.total, 2)} g line. The chemistry is unchanged; the recipe becomes readable and stops accumulating further corrections.`,
      });
    }
  }

  // --- raw vs calcined clay -------------------------------------------------
  // The single sharpest example of a UMF blind spot: raw and calcined kaolin are
  // chemically identical once fired, so the unity formula is invariant to the
  // split — but the split decides whether the raw layer cracks on drying and
  // crawls.
  let rawClay = 0, calcinedClay = 0, rawClayLoi = 0;
  const rawClayNames = [];
  for (const l of lines) {
    if (l.additive) continue;
    const mat = materialIndex.get(l.material);
    const tags = mat?.tags || [];
    if (!tags.includes('clay')) continue;
    const a = Number(l.amount) || 0;
    if (tags.includes('calcined')) calcinedClay += a;
    else { rawClay += a; rawClayLoi += a * ((mat.loi || 0) / 100); rawClayNames.push(l.material); }
  }
  const rawClayPct = baseGrams ? round((rawClay / baseGrams) * 100, 1) : 0;
  if (rawClay > 0 && rawClayPct > 20) {
    if (calcinedClay === 0) {
      // Split so ~60% of the FIRED clay contribution stays raw — enough plasticity
      // for suspension and green strength, without the full drying shrinkage.
      const firedClay = rawClay - rawClayLoi;
      const avgLoiFrac = rawClay ? rawClayLoi / rawClay : 0;
      const rawPart = round((firedClay * 0.6) / (1 - avgLoiFrac), 1);
      const calcPart = round((firedClay * 0.4) / 0.995, 1);
      findings.push({
        level: 'warn',
        code: 'raw-clay-load',
        message: `Raw plastic clay (${rawClayNames.join(', ')}) is ${rawClayPct}% of the base with no calcined counterpart to balance it. The UMF cannot see this — it reads raw and calcined as the same oxides.`,
        fix: `Split roughly 60:40 by fired contribution — about ${rawPart} g raw / ${calcPart} g calcined — to cut drying shrinkage and crawling risk. This also drops batch LOI. Calcine it yourself on a bisque firing (cone 04 is plenty; a kitchen oven is not — dehydroxylation needs 450-600 °C) rather than introducing a new supplier variable. Match the material: calcined kaolin for kaolin, roasted Alberta Slip for Alberta Slip.`,
      });
    } else {
      findings.push({
        level: 'note',
        code: 'raw-clay-load',
        message: `Raw plastic clay is ${rawClayPct}% of the base, balanced by ${round(calcinedClay, 1)} g calcined.`,
        fix: 'Reasonable. If it still crawls, shift more of the clay to calcined — 50:50 is usually better than fully calcined, which loses the suspension you need.',
      });
    }
  }

  // --- non-plastic colorant overload ---------------------------------------
  // The opposite crawling case from the familiar one, and the one people miss:
  // too LITTLE clay bond because a heavy non-plastic colorant load has diluted it.
  let nonPlastic = 0;
  for (const l of lines) {
    const mat = materialIndex.get(l.material);
    if ((mat?.tags || []).includes('non-plastic')) nonPlastic += Number(l.amount) || 0;
  }
  const nonPlasticPct = baseGrams ? round((nonPlastic / baseGrams) * 100, 1) : 0;
  const dryLayerFix = 'If it crawls, that is a DRIED-LAYER failure, not a melt failure: iron oxide is a filler with high water demand, so the unfired layer has almost no clay bond, cracks on drying and pulls back. Add CMC and apply thinner before touching the melt chemistry.';
  if (nonPlasticPct >= 15) {
    findings.push({
      level: 'warn',
      code: 'non-plastic-load',
      message: `Non-plastic colorant loading is ${nonPlasticPct}% of the base — past the point where the raw layer reliably holds together.`,
      fix: `${dryLayerFix} For an iron red, 11-14% is the target band; 20% overshoots it and crawls for this reason rather than for any chemistry reason.`,
    });
  } else if (nonPlasticPct >= 10) {
    findings.push({
      level: 'note',
      code: 'non-plastic-load',
      message: `Non-plastic colorant loading is ${nonPlasticPct}% of the base — workable, but at the top of the range.`,
      fix: dryLayerFix,
    });
  }

  // --- what each line actually delivers, fired ------------------------------
  // Derive this the same way analyzeRecipe does — from the oxide analysis, not
  // the declared `loi` field — so the LOI reported here matches the LOI in the
  // main report. (The two differ when a material's oxides don't sum to
  // 100 − loi, which is normal for nominal analyses.)
  let batchGrams = 0, firedTotal = 0;
  const firedByLine = new Map();
  for (const l of lines) {
    const a = Number(l.amount) || 0;
    batchGrams += a;
    const mat = materialIndex.get(l.material);
    if (!mat) continue;
    let fired = 0;
    for (const pct of Object.values(mat.oxides || {})) fired += a * (pct / 100);
    firedTotal += fired;
    firedByLine.set(l, fired);
  }

  // --- LOI total and, more importantly, its timing --------------------------
  // Per-material gas attribution uses the declared `loi`, since that is what
  // actually leaves as gas at a known temperature.
  const lateGas = [];
  for (const l of lines) {
    const mat = materialIndex.get(l.material);
    if (!mat) continue;
    const contributed = (Number(l.amount) || 0) * ((mat.loi || 0) / 100);
    const win = mat.gasWindowC;
    if (win && win[1] >= 1000 && contributed >= 0.15) {
      lateGas.push({ material: l.material, window: win, grams: round(contributed, 2) });
    }
  }
  const loiPct = batchGrams ? round(((batchGrams - firedTotal) / batchGrams) * 100, 2) : 0;
  if (loiPct >= 15) {
    findings.push({
      level: 'warn',
      code: 'loi-total',
      message: `Batch LOI is ${loiPct}% — a lot of gas to get out through a sealing melt.`,
      fix: 'Swap carbonates for their fritted or already-decomposed equivalents where you can: wollastonite for whiting (zero LOI, same CaO), calcined for raw clay, a frit for Gerstley Borate.',
    });
  } else if (loiPct >= 10) {
    findings.push({
      level: 'note',
      code: 'loi-total',
      message: `Batch LOI is ${loiPct}%.`,
      fix: 'Not alarming on its own, but if you are chasing pinholes or blisters this is where the gas is coming from.',
    });
  }
  for (const g of lateGas) {
    findings.push({
      level: 'warn',
      code: 'late-gas',
      message: `${g.material} gasses at ${g.window[0]}-${g.window[1]} °C, contributing ${g.grams} g — that is arriving as the melt seals, not before it.`,
      fix: 'Total LOI is the wrong number to look at here; timing is the problem. Either substitute a material whose gas is out by ~900 °C, or hold below the sealing point to let it clear.',
    });
  }

  // --- materials earning nothing -------------------------------------------
  for (const [l, fired] of firedByLine) {
    const share = firedTotal ? (fired / firedTotal) * 100 : 0;
    const mat = materialIndex.get(l.material);
    const loi = mat?.loi || 0;
    if (loi >= 20 && share < 2) {
      findings.push({
        level: 'warn',
        code: 'gassing-for-nothing',
        message: `${l.material} contributes ${round(share, 2)}% of the fired oxides but is ${loi}% LOI — it is gassing for almost no chemistry.`,
        fix: 'Drop it and source the oxide from something already fired, or raise it to where it actually does something.',
      });
    } else if (share < 0.5) {
      findings.push({
        level: 'note',
        code: 'negligible-material',
        message: `${l.material} contributes ${round(share, 2)}% of the fired oxides.`,
        fix: 'Below the noise floor of the nominal analyses themselves. Dropping it simplifies the recipe without measurably changing it.',
      });
    }
  }

  // --- additions vs base ----------------------------------------------------
  if (additionGrams > 0) {
    const addPct = baseGrams ? round((additionGrams / baseGrams) * 100, 1) : 0;
    findings.push({
      level: 'note',
      code: 'additions-present',
      message: `${round(additionGrams, 2)} g of additions on a ${round(baseGrams, 2)} g base (${addPct}%).`,
      fix: 'Read fit and melt on the BASE. Colorants, opacifiers, tin and SiC are passengers in the unity formula — they shift the numbers without being what makes the glaze melt or fit.',
    });
  }

  // --- unresolved materials -------------------------------------------------
  const unknown = [...new Set(lines.filter(l => !materialIndex.get(l.material)).map(l => l.material))];
  if (unknown.length) {
    findings.push({
      level: 'warn',
      code: 'unknown-material',
      message: `Not in the materials database: ${unknown.join(', ')}.`,
      fix: 'Every number above is computed WITHOUT these. Say so rather than reporting a partial analysis as if it were complete.',
    });
  }

  return findings;
}

/**
 * Order oxides the way potters expect to read them (fluxes, then stabilisers,
 * boron, glass-formers, then the rest), for display.
 */
export function displayOrder(oxideKeys) {
  const rank = { flux: 0, stabiliser: 1, boron: 2, glass: 3, other: 4 };
  return [...oxideKeys].sort((a, b) => {
    const ra = rank[OXIDE_GROUP[a] ?? 'other'];
    const rb = rank[OXIDE_GROUP[b] ?? 'other'];
    return ra - rb || a.localeCompare(b);
  });
}
