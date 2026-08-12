import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { analyzeRecipe, lintRecipe, fitToBody, indexMaterials } from '../js/chemistry.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const db = JSON.parse(readFileSync(resolve(ROOT, 'data/materials.json'), 'utf8'));
const bodies = JSON.parse(readFileSync(resolve(ROOT, 'data/bodies.json'), 'utf8'));
const idx = indexMaterials(db);

// Same guard the limits tests use: a typo in a material name would silently drop
// the line and quietly invalidate the assertion below it.
function lint(lines) {
  assert.deepEqual(analyzeRecipe(lines, idx).unknownMaterials, [], 'test recipe used a name not in the database');
  return lintRecipe(lines, idx);
}
const codes = findings => findings.map(f => f.code);
const byCode = (findings, code) => findings.find(f => f.code === code);

// --- the point of the whole lint pass ----------------------------------------

test('the raw/calcined split is invisible to the UMF but visible to lint', () => {
  const raw = [
    { material: 'Kaolin (EPK)', amount: 22.9 },
    { material: 'Spodumene', amount: 28 },
    { material: 'Silica (Quartz)', amount: 24 },
    { material: 'Wollastonite', amount: 14 },
  ];
  // Same fired chemistry, split across raw and calcined instead.
  const split = [
    { material: 'Kaolin (EPK)', amount: 13.7 },
    { material: 'Kaolin (Calcined)', amount: 7.9 },
    { material: 'Spodumene', amount: 28 },
    { material: 'Silica (Quartz)', amount: 24 },
    { material: 'Wollastonite', amount: 14 },
  ];

  // The unity formula cannot tell these apart — that is exactly why lint exists.
  const a = analyzeRecipe(raw, idx), b = analyzeRecipe(split, idx);
  assert.equal(a.oxides.Al2O3.umf.toFixed(2), b.oxides.Al2O3.umf.toFixed(2));
  assert.equal(a.ratios.SiO2_Al2O3.toFixed(1), b.ratios.SiO2_Al2O3.toFixed(1));

  const warned = byCode(lint(raw), 'raw-clay-load');
  assert.equal(warned.level, 'warn');
  assert.match(warned.message, /Kaolin \(EPK\)/, 'names the material rather than assuming kaolin');
  assert.match(warned.fix, /60:40/);

  // Applying the fix clears the finding — raw clay is back under the threshold.
  assert.equal(byCode(lint(split), 'raw-clay-load'), undefined);
});

test('still-heavy raw clay with calcined alongside it is a note, not a warning', () => {
  const f = byCode(lint([
    { material: 'Kaolin (EPK)', amount: 25 },
    { material: 'Kaolin (Calcined)', amount: 10 },
    { material: 'Silica (Quartz)', amount: 35 },
    { material: 'Wollastonite', amount: 30 },
  ]), 'raw-clay-load');
  assert.equal(f.level, 'note');
  assert.match(f.fix, /50:50 is usually better than fully calcined/);
});

test('duplicate lines are flagged with their merged total', () => {
  const f = byCode(lint([
    { material: 'Silica (Quartz)', amount: 20 },
    { material: 'Silica (Quartz)', amount: 6 },
    { material: 'Frit 3134 (Ferro)', amount: 30 },
    { material: 'Wollastonite', amount: 14 },
  ]), 'duplicate-line');
  assert.equal(f.level, 'warn');
  assert.match(f.message, /Silica \(Quartz\) appears 2×/);
  assert.match(f.message, /26 g/);
});

test('gas arriving after the melt seals is a timing finding, not an LOI total', () => {
  // Strontium carbonate gasses at 1100-1300 °C. Total LOI here is unremarkable;
  // *when* the gas arrives is the whole problem.
  const findings = lint([
    { material: 'Frit 3134 (Ferro)', amount: 40 },
    { material: 'Silica (Quartz)', amount: 34 },
    { material: 'Strontium Carbonate', amount: 20 },
    { material: 'Kaolin (Calcined)', amount: 6 },
  ]);
  const f = byCode(findings, 'late-gas');
  assert.equal(f.level, 'warn');
  assert.match(f.message, /Strontium Carbonate gasses at 1100-1300 °C/);
  assert.ok(!codes(findings).includes('loi-total'), 'total LOI is not what is wrong here');
});

test('whiting gasses early enough not to be a timing problem', () => {
  const findings = lint([
    { material: 'Whiting (Calcium Carbonate)', amount: 20 },
    { material: 'Custer Feldspar (Potash)', amount: 40 },
    { material: 'Silica (Quartz)', amount: 25 },
    { material: 'Kaolin (Calcined)', amount: 15 },
  ]);
  assert.ok(!codes(findings).includes('late-gas'), 'CaCO3 is done by ~900 °C');
});

test('a material gassing for no chemistry is called out; a useful one is not', () => {
  const gassing = byCode(lint([
    { material: 'Frit 3134 (Ferro)', amount: 40 },
    { material: 'Silica (Quartz)', amount: 40 },
    { material: 'Kaolin (Calcined)', amount: 19 },
    { material: 'Magnesium Carbonate', amount: 0.4 },
  ]), 'gassing-for-nothing');
  assert.equal(gassing.level, 'warn');
  assert.match(gassing.message, /Magnesium Carbonate/);
});

test('heavy iron reads as a dried-layer risk, and 11-14% stays workable', () => {
  const base = [
    { material: 'Wollastonite', amount: 30 },
    { material: 'Silica (Quartz)', amount: 38 },
    { material: 'Custer Feldspar (Potash)', amount: 26 },
    { material: 'Kaolin (EPK)', amount: 6 },
  ];
  const at13 = byCode(lint([...base, { material: 'Red Iron Oxide', amount: 13, additive: true }]), 'non-plastic-load');
  const at20 = byCode(lint([...base, { material: 'Red Iron Oxide', amount: 20, additive: true }]), 'non-plastic-load');
  // 11-14% is the kaki target band — flagging it as a fault would be a false alarm.
  assert.equal(at13.level, 'note');
  assert.equal(at20.level, 'warn');
  assert.match(at20.fix, /DRIED-LAYER failure, not a melt failure/);
});

test("lint's LOI figure matches the analysis, not the declared loi fields", () => {
  const lines = [
    { material: 'Kaolin (EPK)', amount: 30 },
    { material: 'Whiting (Calcium Carbonate)', amount: 25 },
    { material: 'Silica (Quartz)', amount: 45 },
  ];
  const reported = byCode(lint(lines), 'loi-total');
  assert.match(reported.message, new RegExp(`${analyzeRecipe(lines, idx).loiPct}%`));
});

test('a clean recipe produces nothing', () => {
  assert.deepEqual(lint([
    { material: 'Frit 3134 (Ferro)', amount: 27 },
    { material: 'Silica (Quartz)', amount: 30 },
    { material: 'Kaolin (Calcined)', amount: 16 },
    { material: 'Wollastonite', amount: 14 },
    { material: 'Frit 3110 (Ferro)', amount: 13 },
  ]), []);
});

// --- fit against a body -------------------------------------------------------

const frost = bodies.bodies['laguna-frost'];

test('the sign convention: below body is compression, above is tension', () => {
  // Frost is 6.99-7.14. This is the direction people invert.
  assert.equal(fitToBody(7.7, frost).status, 'tension');
  assert.match(fitToBody(7.7, frost).headline, /crazing direction/);

  assert.equal(fitToBody(6.7, frost).status, 'good');
  assert.match(fitToBody(6.7, frost).headline, /compression/);

  const shiver = fitToBody(5.7, frost);
  assert.equal(shiver.status, 'high-compression');
  assert.match(shiver.headline, /shivering direction/);
  // Shivering needs a bigger mismatch than crazing — the advice has to say so.
  assert.match(shiver.detail, /bigger mismatch than crazing/);
});

test('some compression is the target, not a match to the body', () => {
  const [lo, hi] = fitToBody(6.7, frost).targetBand;
  assert.ok(lo < 7 && hi < 7, 'the band sits below the body figure');
  assert.equal(fitToBody(7.05, frost).status, 'slight-compression');
});

test('a body with no published figure refuses to invent one', () => {
  const fit = fitToBody(6.4, bodies.bodies['standard-420']);
  assert.equal(fit.status, 'no-data');
  assert.equal(fit.gap, null);
  assert.equal(fit.compressionPct, null);
});

test('every body carries provenance, and estimates say so', () => {
  for (const [key, b] of Object.entries(bodies.bodies)) {
    assert.ok(b.provenance, `${key} must state where its figure came from`);
    assert.ok(['published', 'estimated', 'unpublished'].includes(b.confidence), `${key} confidence`);
    if (b.confidence !== 'published') {
      assert.equal(fitToBody(6.4, b).confidence, b.confidence, `${key} must carry confidence through to the fit`);
    }
  }
});
