import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { analyzeRecipe, indexMaterials } from '../js/chemistry.js';
import { checkLimits, formatOxide } from '../js/limits.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const db = JSON.parse(readFileSync(resolve(ROOT, 'data/materials.json'), 'utf8'));
const limits = JSON.parse(readFileSync(resolve(ROOT, 'data/glaze-limits.json'), 'utf8'));
const idx = indexMaterials(db);
const cone6 = limits.targets['cone6-glossy'];

const find = (result, key) => result.checks.find(c => c.key === key);

// analyzeRecipe matches canonical names only — aliases are the importer's job.
// A typo here would silently drop a material and quietly invalidate the test, so
// analyse through this and let it fail loudly instead.
function analyze(lines) {
  const a = analyzeRecipe(lines, idx);
  assert.deepEqual(a.unknownMaterials, [], 'test recipe used a name not in the database');
  return a;
}

test('a balanced cone 6 glossy sits mostly inside the range', () => {
  const r = checkLimits(analyze([
    { material: 'Frit 3134 (Ferro)', amount: 25 },
    { material: 'Custer Feldspar (Potash)', amount: 20 },
    { material: 'Whiting (Calcium Carbonate)', amount: 8 },
    { material: 'Kaolin (EPK)', amount: 20 },
    { material: 'Silica (Quartz)', amount: 27 },
  ]), cone6);
  assert.ok(r.outCount <= 2, `expected a mainstream glaze to mostly fit, ${r.outCount} were out`);
});

test('a silica-starved glaze is flagged low on SiO2', () => {
  const r = checkLimits(analyze([
    { material: 'Custer Feldspar (Potash)', amount: 60 },
    { material: 'Whiting (Calcium Carbonate)', amount: 30 },
    { material: 'Kaolin (EPK)', amount: 10 },
  ]), cone6);
  assert.equal(find(r, 'SiO2').status, 'low');
  assert.ok(r.outCount > 0);
});

test('a silica-heavy glaze is flagged high', () => {
  const r = checkLimits(analyze([
    { material: 'Custer Feldspar (Potash)', amount: 20 },
    { material: 'Whiting (Calcium Carbonate)', amount: 5 },
    { material: 'Silica (Quartz)', amount: 75 },
  ]), cone6);
  assert.equal(find(r, 'SiO2').status, 'high');
});

test('every configured oxide and ratio produces a check', () => {
  const r = checkLimits(analyze([{ material: 'Silica (Quartz)', amount: 100 }]), cone6);
  const expected = Object.keys(cone6.oxides).length + Object.keys(cone6.ratios).length;
  assert.equal(r.checks.length, expected);
  assert.ok(find(r, 'SiO2_Al2O3'), 'the Si:Al ratio should be checked');
  assert.ok(find(r, 'KNaO'), 'combined alkali should be checked');
});

test('an oxide the recipe lacks reads as 0 and is flagged low', () => {
  // This glaze has fluxes but no boron at all, so 0 is a real measurement.
  const r = checkLimits(analyze([
    { material: 'Custer Feldspar (Potash)', amount: 40 },
    { material: 'Whiting (Calcium Carbonate)', amount: 20 },
    { material: 'Kaolin (EPK)', amount: 15 },
    { material: 'Silica (Quartz)', amount: 25 },
  ]), cone6);
  const b = find(r, 'B2O3');
  assert.equal(b.value, 0);
  assert.equal(b.status, 'low');
});

test('a fluxless recipe reports UMF as unknown, not as a row of zeros', () => {
  // Kaolin + silica has no fluxes, so there is no unity to normalise against.
  // Reporting SiO2 as "0, below range" would be the opposite of the truth: it's
  // most of the batch by weight.
  const a = analyze([
    { material: 'Kaolin (EPK)', amount: 40 },
    { material: 'Silica (Quartz)', amount: 60 },
  ]);
  assert.equal(a.hasFlux, false);
  assert.equal(a.oxides.SiO2.umf, null, 'UMF is undefined without fluxes');
  assert.ok(a.oxides.SiO2.weightPct > 50, 'but silica is still most of it by weight');

  const r = checkLimits(a, cone6);
  assert.equal(find(r, 'SiO2').status, 'unknown');
  assert.equal(find(r, 'B2O3').status, 'unknown');
  assert.equal(find(r, 'CaO').status, 'unknown');
  assert.equal(r.outCount, 0, 'no UMF value should be flagged when the UMF is undefined');
});

test('a fluxed recipe still reports hasFlux and real UMF values', () => {
  const a = analyze([
    { material: 'Custer Feldspar (Potash)', amount: 40 },
    { material: 'Whiting (Calcium Carbonate)', amount: 20 },
    { material: 'Silica (Quartz)', amount: 40 },
  ]);
  assert.equal(a.hasFlux, true);
  assert.ok(a.oxides.SiO2.umf > 0);
});

test('a ratio that cannot be computed is "unknown" rather than a false pass', () => {
  // No alumina -> no Si:Al ratio to speak of.
  const r = checkLimits(analyze([
    { material: 'Silica (Quartz)', amount: 80 },
    { material: 'Whiting (Calcium Carbonate)', amount: 20 },
  ]), cone6);
  assert.equal(find(r, 'SiO2_Al2O3').status, 'unknown');
  assert.equal(find(r, 'SiO2_Al2O3').value, null);
});

test('unknown checks are not counted as out-of-range', () => {
  const r = checkLimits(analyze([]), cone6);
  const unknowns = r.checks.filter(c => c.status === 'unknown').length;
  assert.ok(unknowns > 0);
  assert.equal(r.outCount, r.checks.filter(c => c.status === 'low' || c.status === 'high').length);
});

test('each check carries the range it was measured against', () => {
  const r = checkLimits(analyze([{ material: 'Silica (Quartz)', amount: 100 }]), cone6);
  assert.deepEqual([find(r, 'SiO2').min, find(r, 'SiO2').max], cone6.oxides.SiO2);
});

test('no target means no result, not an empty pass', () => {
  assert.equal(checkLimits(analyze([]), null), null);
});

test('both shipped targets are usable', () => {
  const a = analyze([
    { material: 'Custer Feldspar (Potash)', amount: 40 },
    { material: 'Silica (Quartz)', amount: 30 },
    { material: 'Whiting (Calcium Carbonate)', amount: 15 },
    { material: 'Kaolin (EPK)', amount: 15 },
  ]);
  for (const key of Object.keys(limits.targets)) {
    const r = checkLimits(a, limits.targets[key]);
    assert.ok(r.label, `${key} should have a label`);
    assert.ok(r.checks.length > 0, `${key} should produce checks`);
  }
});

test('formatOxide subscripts the digits for display', () => {
  assert.equal(formatOxide('SiO2'), 'SiO₂');
  assert.equal(formatOxide('Al2O3'), 'Al₂O₃');
  assert.equal(formatOxide('CaO'), 'CaO');
});

test('checkedCount separates "nothing to check" from "everything passed"', () => {
  const fluxless = checkLimits(analyze([
    { material: 'Kaolin (EPK)', amount: 40 },
    { material: 'Silica (Quartz)', amount: 60 },
  ]), cone6);
  // Si:Al is a molar ratio and stays computable without fluxes; everything that
  // depends on the unity formula does not.
  assert.equal(fluxless.checkedCount, 1);
  assert.ok(fluxless.checkedCount < fluxless.checks.length,
    'a partial check must be distinguishable from a full pass');

  const real = checkLimits(analyze([
    { material: 'Custer Feldspar (Potash)', amount: 40 },
    { material: 'Whiting (Calcium Carbonate)', amount: 20 },
    { material: 'Silica (Quartz)', amount: 40 },
  ]), cone6);
  assert.ok(real.checkedCount > 0);
});
