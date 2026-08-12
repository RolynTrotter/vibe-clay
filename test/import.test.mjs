import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseInsightLiveXML, toInsightLiveXML } from '../js/import.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const db = JSON.parse(readFileSync(resolve(ROOT, 'data/materials.json'), 'utf8'));

// Shaped exactly like a real Insight-Live export.
const SAMPLE = `<?xml version="1.0"?>
<recipes version="1.0" encoding="UTF-8">
  <recipe name="G2926B" keywords="cone 6 glossy" id="269324" key="advC7niu" date="2026-06-29" codenum="G1">
    <recipelines>
      <recipeline material="Ferro Frit 3134" amount="25.400" tolerance=""/>
      <recipeline material="EP Kaolin" amount="20.000"/>
      <recipeline material="Silica" amount="54.600"/>
      <recipeline material="Red Iron Oxide" amount="10.000" added="true"/>
    </recipelines>
    <notes>A base glossy.</notes>
  </recipe>
</recipes>`;

test('parses recipe attributes, including the share key', () => {
  const [r] = parseInsightLiveXML(SAMPLE, db);
  assert.equal(r.name, 'G2926B');
  assert.equal(r.id, '269324');
  assert.equal(r.key, 'advC7niu');
  assert.equal(r.code, 'G1');
  assert.equal(r.date, '2026-06-29');
  assert.equal(r.keywords, 'cone 6 glossy');
  assert.equal(r.notes, 'A base glossy.');
});

test('parses lines, amounts, and the added="true" additive flag', () => {
  const [r] = parseInsightLiveXML(SAMPLE, db);
  assert.equal(r.lines.length, 4);
  assert.equal(r.lines[0].amount, 25.4);
  assert.equal(r.lines[0].additive, false);
  assert.equal(r.lines[3].rawMaterial, 'Red Iron Oxide');
  assert.equal(r.lines[3].additive, true);
});

test("Insight-Live's own material names resolve to the local database", () => {
  const [r] = parseInsightLiveXML(SAMPLE, db);
  assert.deepEqual(r.unmatched, [], 'expected every sample material to resolve');
  assert.ok(r.lines.every(l => l.matched));
  // The original spelling is preserved so export can hand it back unchanged.
  assert.equal(r.lines[1].rawMaterial, 'EP Kaolin');
});

test('unresolvable materials are flagged rather than dropped', () => {
  const xml = SAMPLE.replace('material="EP Kaolin"', 'material="Weird Local Ash"');
  const [r] = parseInsightLiveXML(xml, db);
  assert.equal(r.lines.length, 4);
  assert.deepEqual(r.unmatched, ['Weird Local Ash']);
});

test('round-trips through export and back with the same values', () => {
  const [original] = parseInsightLiveXML(SAMPLE, db);
  const [again] = parseInsightLiveXML(toInsightLiveXML(original), db);

  assert.equal(again.name, original.name);
  assert.equal(again.key, original.key);
  assert.equal(again.code, original.code);
  assert.equal(again.notes, original.notes);
  assert.equal(again.lines.length, original.lines.length);
  for (let i = 0; i < original.lines.length; i++) {
    assert.equal(again.lines[i].rawMaterial, original.lines[i].rawMaterial, `line ${i} name`);
    assert.equal(again.lines[i].amount, original.lines[i].amount, `line ${i} amount`);
    assert.equal(again.lines[i].additive, original.lines[i].additive, `line ${i} additive`);
  }
});

test('export escapes characters that would otherwise break the XML', () => {
  const xml = toInsightLiveXML({
    name: 'Tom & "Jerry" <test>',
    notes: 'a < b & c',
    lines: [{ material: 'Silica', amount: 10 }],
  });
  assert.ok(!/name="[^"]*"[^/>]*"/.test(xml.split('\n')[1]), 'raw quote leaked into an attribute');
  assert.ok(xml.includes('&amp;') && xml.includes('&lt;') && xml.includes('&quot;'));

  const [back] = parseInsightLiveXML(xml, db);
  assert.equal(back.name, 'Tom & "Jerry" <test>');
  assert.equal(back.notes, 'a < b & c');
});

test('export uses rawMaterial so Insight-Live gets names it recognises', () => {
  const xml = toInsightLiveXML({
    name: 'x',
    lines: [{ material: 'Kaolin (EPK)', rawMaterial: 'EP Kaolin', amount: 20 }],
  });
  assert.ok(xml.includes('material="EP Kaolin"'));
  assert.ok(!xml.includes('Kaolin (EPK)'));
});

test('a recipe with no rawMaterial exports its canonical name', () => {
  const xml = toInsightLiveXML({ name: 'x', lines: [{ material: 'Silica (Quartz)', amount: 20 }] });
  assert.ok(xml.includes('material="Silica (Quartz)"'));
});

test('multiple recipes in one file all come through', () => {
  const two = SAMPLE.replace('</recipes>',
    '<recipe name="Second"><recipelines><recipeline material="Silica" amount="100"/></recipelines></recipe></recipes>');
  const recipes = parseInsightLiveXML(two, db);
  assert.equal(recipes.length, 2);
  assert.equal(recipes[1].name, 'Second');
});

test('a file with no recipes is rejected rather than silently empty', () => {
  assert.throws(() => parseInsightLiveXML('<html><body>Not Logged In</body></html>', db), /no <recipe>/);
});

test('an empty but valid export parses to an empty list', () => {
  assert.deepEqual(parseInsightLiveXML('<recipes version="1.0"></recipes>', db), []);
});
