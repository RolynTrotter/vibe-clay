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
  Na2O: 39.5, K2O: 46.5, Li2O: 27.0,
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
  let batchGrams = 0;        // total raw grams batched
  let cost = 0;
  let haveAnyPrice = false;

  for (const line of recipe) {
    const amount = Number(line.amount) || 0;
    if (amount <= 0) continue;
    batchGrams += amount;

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

  // Headline ratios.
  const siMol = oxideMoles.SiO2 || 0;
  const alMol = oxideMoles.Al2O3 || 0;
  const siAlRatio = alMol ? round(siMol / alMol, 2) : null;

  return {
    batchGrams: round(batchGrams, 2),
    firedGrams: round(totalFiredGrams, 2),
    loiPct: batchGrams ? round(((batchGrams - totalFiredGrams) / batchGrams) * 100, 2) : 0,
    fluxUnityMoles: round(fluxMoles, 5),
    oxides,
    ratios: { SiO2_Al2O3: siAlRatio },
    thermalExpansion: estimateExpansion(oxideMoles),
    cost: haveAnyPrice ? {
      total: round(cost, 2),
      perKgBatch: batchGrams ? round(cost / (batchGrams / 1000), 2) : 0,
    } : null,
    unknownMaterials,
  };
}

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
