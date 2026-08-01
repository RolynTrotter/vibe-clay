// Check a computed analysis against the typical UMF ranges for a firing target.
//
// These ranges are heuristics, not rules — a glaze outside them isn't wrong, it's
// a prompt to think about why. The UI and the CLI both render whatever this
// returns, so the wording of that caveat lives with the display, not here.

/**
 * @param {object} analysis  from analyzeRecipe()
 * @param {object} target    one entry from glaze-limits.json `targets`
 * @returns {{label: string, checks: Array<{key,label,value,min,max,status}>, outCount: number}}
 *          status is 'ok' | 'low' | 'high' | 'unknown'
 */
export function checkLimits(analysis, target) {
  if (!target) return null;
  const checks = [];

  for (const [ox, range] of Object.entries(target.oxides || {})) {
    // KNaO is a derived combined-alkali value, not a real oxide row.
    // An oxide that's simply absent is a real 0 and worth flagging as low. An
    // oxide whose UMF is undefined (no fluxes to normalise against) is not — it
    // becomes null, which checkLimits reports as 'unknown' rather than 'low'.
    const value = ox === 'KNaO'
      ? analysis.ratios.KNaO
      : (analysis.oxides[ox] ? analysis.oxides[ox].umf : (analysis.hasFlux ? 0 : null));
    checks.push(makeCheck(ox, formatOxide(ox), value, range));
  }

  for (const [key, range] of Object.entries(target.ratios || {})) {
    checks.push(makeCheck(key, formatRatio(key), analysis.ratios[key], range));
  }

  return {
    label: target.label || '',
    checks,
    outCount: checks.filter(c => c.status === 'low' || c.status === 'high').length,
    // How many could actually be evaluated. Zero means the recipe gave us
    // nothing to check (typically a fluxless one, where the UMF is undefined) —
    // which is not the same as everything passing, and must not be shown as a
    // clean bill of health.
    checkedCount: checks.filter(c => c.status !== 'unknown').length,
  };
}

function makeCheck(key, label, value, [min, max]) {
  let status = 'unknown';
  if (typeof value === 'number' && Number.isFinite(value)) {
    status = value < min ? 'low' : value > max ? 'high' : 'ok';
  }
  return { key, label, value: typeof value === 'number' ? value : null, min, max, status };
}

// "SiO2" -> "SiO₂". Display-only; keys stay ASCII everywhere else.
const SUBSCRIPTS = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉' };
export function formatOxide(ox) {
  return String(ox).replace(/\d/g, d => SUBSCRIPTS[d]);
}

function formatRatio(key) {
  // "SiO2_Al2O3" -> "SiO₂:Al₂O₃"
  return key.split('_').map(formatOxide).join(':');
}
