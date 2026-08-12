import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  analyzeRecipe, indexMaterials, buildResolver, lineBlend,
  normalizeToBase, estimateExpansion, displayOrder,
} from '../js/chemistry.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const db = JSON.parse(readFileSync(resolve(ROOT, 'data/materials.json'), 'utf8'));
const idx = indexMaterials(db);

// A plain leadless gloss — feldspar / silica / whiting / kaolin.
const GLOSS = [
  { material: 'Custer Feldspar (Potash)', amount: 40 },
  { material: 'Silica (Quartz)', amount: 20 },
  { material: 'Whiting (Calcium Carbonate)', amount: 20 },
  { material: 'Kaolin (EPK)', amount: 20 },
];

// `umf` is rounded to 3 dp for display, so a sum of several of them can only be
// expected to land within a few thousandths of unity.
const ROUNDING = 0.005;
const fluxSum = analysis => Object.values(analysis.oxides)
  .filter(o => o.group === 'flux')
  .reduce((s, o) => s + o.umf, 0);

test('fluxes sum to 1.0 — that is what makes it a unity formula', () => {
  const sum = fluxSum(analyzeRecipe(GLOSS, idx));
  assert.ok(Math.abs(sum - 1) < ROUNDING, `flux unity was ${sum}, expected 1.0`);
});

test('R2O:RO split sums to 1.0 and matches the flux groups', () => {
  const a = analyzeRecipe(GLOSS, idx);
  assert.ok(Math.abs(a.fluxSplit.R2O + a.fluxSplit.RO - 1) < 0.02);
  // This recipe's flux is mostly whiting, so alkaline earth should dominate.
  assert.ok(a.fluxSplit.RO > a.fluxSplit.R2O);
});

test('SiO2:Al2O3 is the molar ratio of those two oxides', () => {
  const a = analyzeRecipe(GLOSS, idx);
  const expected = a.oxides.SiO2.moles / a.oxides.Al2O3.moles;
  assert.ok(Math.abs(a.ratios.SiO2_Al2O3 - expected) < 0.01);
  // A gloss glaze lands in the usual band rather than somewhere absurd.
  assert.ok(a.ratios.SiO2_Al2O3 > 4 && a.ratios.SiO2_Al2O3 < 15);
});

test('UMF is scale-invariant — doubling the batch changes nothing', () => {
  const single = analyzeRecipe(GLOSS, idx);
  const double = analyzeRecipe(GLOSS.map(l => ({ ...l, amount: l.amount * 2 })), idx);
  assert.equal(double.ratios.SiO2_Al2O3, single.ratios.SiO2_Al2O3);
  for (const ox of Object.keys(single.oxides)) {
    assert.ok(Math.abs(double.oxides[ox].umf - single.oxides[ox].umf) < 1e-9, ox);
  }
  // Absolute batch weights DO scale.
  assert.equal(double.batchGrams, single.batchGrams * 2);
});

test('LOI comes out of the carbonate and is left out of the fired weight', () => {
  // Whiting is CaCO3: it loses CO2 on firing, ~44% of its weight.
  const a = analyzeRecipe([{ material: 'Whiting (Calcium Carbonate)', amount: 100 }], idx);
  assert.ok(a.loiPct > 40 && a.loiPct < 48, `LOI was ${a.loiPct}%`);
  assert.ok(a.firedGrams < a.batchGrams);
});

test('additives are separated in the batch but included in the chemistry', () => {
  const withColorant = analyzeRecipe([...GLOSS, { material: 'Red Iron Oxide', amount: 4, additive: true }], idx);
  assert.equal(withColorant.baseGrams, 100);
  assert.equal(withColorant.additionGrams, 4);
  assert.equal(withColorant.batchGrams, 104);
  assert.ok(withColorant.oxides.Fe2O3.umf > 0, 'iron should appear in the analysis');
});

test('unknown materials are reported, not silently dropped', () => {
  const a = analyzeRecipe([...GLOSS, { material: 'Unobtainium', amount: 10 }], idx);
  assert.deepEqual(a.unknownMaterials, ['Unobtainium']);
});

test('an empty recipe degrades to zeros rather than NaN', () => {
  const a = analyzeRecipe([], idx);
  assert.equal(a.batchGrams, 0);
  assert.equal(a.loiPct, 0);
  assert.equal(a.ratios.SiO2_Al2O3, null);
  assert.equal(a.thermalExpansion, null);
});

test('adding sodium raises the expansion estimate, adding silica lowers it', () => {
  const base = analyzeRecipe(GLOSS, idx);
  const sodic = analyzeRecipe(
    [...GLOSS, { material: 'Nepheline Syenite', amount: 20 }], idx);
  const silicic = analyzeRecipe(
    [...GLOSS, { material: 'Silica (Quartz)', amount: 20 }], idx);
  assert.ok(sodic.thermalExpansion > base.thermalExpansion, 'soda should raise expansion');
  assert.ok(silicic.thermalExpansion < base.thermalExpansion, 'silica should lower expansion');
});

test('material names resolve through aliases, including Insight-Live spellings', () => {
  const resolve = buildResolver(db);
  assert.equal(resolve('Custer Feldspar (Potash)'), 'Custer Feldspar (Potash)');
  // Case, punctuation and spacing are all normalised away.
  assert.equal(resolve('custer feldspar (potash)'), 'Custer Feldspar (Potash)');
  assert.equal(resolve('Not A Real Material'), null);
});

test('normalizeToBase scales the base to 100 and keeps additives proportional', () => {
  const scaled = normalizeToBase([
    { material: 'A', amount: 25 }, { material: 'B', amount: 25 },
    { material: 'C', amount: 5, additive: true },
  ]);
  const base = scaled.filter(l => !l.additive).reduce((s, l) => s + l.amount, 0);
  assert.ok(Math.abs(base - 100) < 1e-9);
  // 5 parts against a 50-part base becomes 10 against 100.
  assert.ok(Math.abs(scaled.find(l => l.additive).amount - 10) < 1e-9);
});

test('a line blend runs endpoint to endpoint and varies monotonically between', () => {
  const matte = [
    { material: 'Custer Feldspar (Potash)', amount: 30 },
    { material: 'Whiting (Calcium Carbonate)', amount: 25 },
    { material: 'Kaolin (EPK)', amount: 30 },
    { material: 'Silica (Quartz)', amount: 15 },
  ];
  const points = lineBlend(GLOSS, matte, 5, idx);
  assert.equal(points.length, 5);
  assert.equal(points[0].label, '100:0');
  assert.equal(points[4].label, '0:100');

  // The endpoints must reproduce the source recipes' chemistry exactly.
  const pureA = analyzeRecipe(GLOSS, idx);
  assert.ok(Math.abs(points[0].analysis.ratios.SiO2_Al2O3 - pureA.ratios.SiO2_Al2O3) < 0.01);

  // Si:Al falls steadily from the glossy end to the matte end.
  const ratios = points.map(p => p.analysis.ratios.SiO2_Al2O3);
  for (let i = 1; i < ratios.length; i++) assert.ok(ratios[i] < ratios[i - 1], `not monotonic at ${i}`);

  // Every point is still a valid unity formula.
  for (const p of points) {
    const sum = fluxSum(p.analysis);
    assert.ok(Math.abs(sum - 1) < ROUNDING, `point ${p.label} flux sum ${sum}`);
  }
});

test('a material present in only one glaze ramps from zero across the blend', () => {
  const a = [{ material: 'Custer Feldspar (Potash)', amount: 100 }];
  const b = [{ material: 'Silica (Quartz)', amount: 100 }];
  const points = lineBlend(a, b, 3, idx);
  const silicaAt = i => (points[i].lines.find(l => l.material === 'Silica (Quartz)') || { amount: 0 }).amount;
  assert.equal(silicaAt(0), 0);
  assert.ok(silicaAt(1) > 0 && silicaAt(1) < 100);
  assert.equal(silicaAt(2), 100);
});

test('estimateExpansion returns null for nothing rather than 0', () => {
  assert.equal(estimateExpansion({}), null);
});

test('displayOrder puts fluxes first and glass-formers after stabilisers', () => {
  const ordered = displayOrder(['SiO2', 'Al2O3', 'CaO', 'B2O3']);
  assert.deepEqual(ordered, ['CaO', 'Al2O3', 'B2O3', 'SiO2']);
});
