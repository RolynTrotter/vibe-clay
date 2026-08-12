import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseRecipeText } from '../js/paste-import.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const db = JSON.parse(readFileSync(resolve(ROOT, 'data/materials.json'), 'utf8'));

const amountOf = (r, name) => (r.lines.find(l => l.rawMaterial === name) || {}).amount;

test('trailing amounts — the common form', () => {
  const r = parseRecipeText(`
    Custer Feldspar 40
    Silica 20
    Whiting 20
    EPK 20
  `, db);
  assert.equal(r.lines.length, 4);
  assert.equal(amountOf(r, 'Custer Feldspar'), 40);
  assert.equal(amountOf(r, 'EPK'), 20);
  assert.ok(r.lines.every(l => !l.additive));
});

test('leading amounts', () => {
  const r = parseRecipeText('40 Custer Feldspar\n20 Silica', db);
  assert.equal(amountOf(r, 'Custer Feldspar'), 40);
  assert.equal(amountOf(r, 'Silica'), 20);
});

test('dot leaders, tabs and colons all survive', () => {
  const r = parseRecipeText([
    'Custer Feldspar ....... 40.0',
    'Silica\t20',
    'EPK: 20',
    'Whiting — 20',
  ].join('\n'), db);
  assert.equal(r.lines.length, 4);
  assert.equal(amountOf(r, 'Custer Feldspar'), 40);
  assert.equal(amountOf(r, 'Silica'), 20);
  assert.equal(amountOf(r, 'EPK'), 20);
  assert.equal(amountOf(r, 'Whiting'), 20);
});

test('an "Additions" heading moves everything below it into additions', () => {
  const r = parseRecipeText(`
    Custer Feldspar 40
    Silica 20

    Additions
    Red Iron Oxide 2
    Cobalt Carbonate 0.5
  `, db);
  assert.equal(r.lines.filter(l => l.additive).length, 2);
  assert.equal(amountOf(r, 'Red Iron Oxide'), 2);
  assert.equal(amountOf(r, 'Cobalt Carbonate'), 0.5);
  assert.ok(!r.lines.find(l => l.rawMaterial === 'Silica').additive);
});

test('"Colorants" and "Stains" work as headings too', () => {
  for (const heading of ['Colorants:', 'COLOURANTS', 'Stains', 'Added']) {
    const r = parseRecipeText(`Silica 20\n${heading}\nRed Iron Oxide 2`, db);
    assert.equal(r.lines.find(l => l.rawMaterial === 'Red Iron Oxide').additive, true, heading);
  }
});

test('a leading + marks a single line as an addition', () => {
  const r = parseRecipeText('Custer Feldspar 40\n+ Red Iron Oxide 2\nSilica 20', db);
  assert.equal(r.lines.find(l => l.rawMaterial === 'Red Iron Oxide').additive, true);
  // The + is per-line: it doesn't flip the rest of the recipe.
  assert.equal(r.lines.find(l => l.rawMaterial === 'Silica').additive, false);
});

test('a "Base" heading switches back out of the additions section', () => {
  const r = parseRecipeText('Additions\nRed Iron Oxide 2\nBase\nSilica 20', db);
  assert.equal(r.lines.find(l => l.rawMaterial === 'Silica').additive, false);
});

test('total lines are dropped, not read as a material', () => {
  const r = parseRecipeText('Custer Feldspar 40\nSilica 60\nTotal 100', db);
  assert.equal(r.lines.length, 2);
  assert.ok(!r.lines.some(l => /total/i.test(l.rawMaterial)));
});

test('a leading title line becomes the recipe name', () => {
  const r = parseRecipeText("Alex's Celadon\nCuster Feldspar 40\nSilica 20", db);
  assert.equal(r.name, "Alex's Celadon");
  assert.equal(r.lines.length, 2);
});

test('with no title line the name falls back rather than eating a material', () => {
  const r = parseRecipeText('Custer Feldspar 40\nSilica 20', db);
  assert.equal(r.name, 'Pasted Recipe');
  assert.equal(r.lines.length, 2);
});

test('unresolvable names are kept and reported, not dropped', () => {
  const r = parseRecipeText('Custer Feldspar 40\nMystery Ash 12', db);
  assert.equal(r.lines.length, 2);
  assert.deepEqual(r.unmatched, ['Mystery Ash']);
  assert.equal(r.lines[1].matched, false);
  assert.equal(r.lines[1].material, 'Mystery Ash');
});

test('lines with no amount are reported in skipped', () => {
  const r = parseRecipeText('Custer Feldspar 40\nfire to cone 6 oxidation\nSilica 20', db);
  assert.equal(r.lines.length, 2);
  assert.deepEqual(r.skipped, ['fire to cone 6 oxidation']);
});

test('decimal commas and percent signs are handled', () => {
  const r = parseRecipeText('Custer Feldspar 40,5%\nSilica 20%', db);
  assert.equal(amountOf(r, 'Custer Feldspar'), 40.5);
  assert.equal(amountOf(r, 'Silica'), 20);
});

test('material names containing digits are not mistaken for amounts', () => {
  const r = parseRecipeText('Ferro Frit 3134 25.4\nAlberta Slip 1000F Roasted 10', db);
  assert.equal(amountOf(r, 'Ferro Frit 3134'), 25.4);
  assert.equal(amountOf(r, 'Alberta Slip 1000F Roasted'), 10);
});

test('empty input is a no-op, not a crash', () => {
  const r = parseRecipeText('', db);
  assert.deepEqual(r.lines, []);
  assert.deepEqual(r.unmatched, []);
  assert.deepEqual(r.skipped, []);
});

test('Insight-Live spellings resolve to the local database', () => {
  const r = parseRecipeText('EP Kaolin 20\nFerro Frit 3134 25', db);
  assert.ok(r.lines.every(l => l.matched), 'expected both to resolve: ' + JSON.stringify(r.unmatched));
  // rawMaterial keeps Insight-Live's spelling for round-trip export.
  assert.equal(r.lines[0].rawMaterial, 'EP Kaolin');
  assert.notEqual(r.lines[0].material, 'EP Kaolin');
});

test('firing notes with a trailing number are skipped, not read as materials', () => {
  const r = parseRecipeText([
    'Custer Feldspar 40',
    'Silica 20',
    'fire to cone 6',
    'hold 15 min at top',
    'cool to 1000 C',
  ].join('\n'), db);
  assert.equal(r.lines.length, 2, 'only the two real materials should load');
  assert.equal(r.skipped.length, 3);
  assert.deepEqual(r.unmatched, []);
});

test('an unknown material is still kept — only prose is dropped', () => {
  const r = parseRecipeText('Custer Feldspar 40\nMystery Wood Ash 12\nfire to cone 10', db);
  assert.equal(r.lines.length, 2);
  assert.deepEqual(r.unmatched, ['Mystery Wood Ash']);
  assert.deepEqual(r.skipped, ['fire to cone 10']);
});

test('a bare prose opener with a number is skipped', () => {
  const r = parseRecipeText('Silica 20\nAdd 10', db);
  assert.equal(r.lines.length, 1);
  assert.deepEqual(r.skipped, ['Add 10']);
});

test('resolution beats the prose rule — a known material always wins', () => {
  // "Talc" is in the database, so it loads even though the prose check exists.
  // The rule only ever applies to names that failed to resolve.
  const r = parseRecipeText('Talc 10\nDolomite 15', db);
  assert.equal(r.lines.length, 2);
  assert.ok(r.lines.every(l => l.matched));
  assert.deepEqual(r.skipped, []);
});
