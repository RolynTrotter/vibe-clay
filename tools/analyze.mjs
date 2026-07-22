#!/usr/bin/env node
// vibe-clay recipe analyzer (CLI).
//
// Runs the same chemistry engine the app uses, from the command line, so Claude
// (or anyone) can analyse a recipe without a browser. Accepts an Insight-Live
// XML export, the app's recipe JSON, or reads either from stdin.
//
//   node tools/analyze.mjs recipe.xml
//   node tools/analyze.mjs recipe.json --target cone6-glossy
//   cat recipe.xml | node tools/analyze.mjs --target cone6-glossy
//
// XML with multiple <recipe> elements analyses each. JSON may be a single
// recipe { name, lines:[{material, amount, additive}] } or an array of them.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { analyzeRecipe, indexMaterials, buildResolver, displayOrder } from '../js/chemistry.js';
import { toInsightLiveXML } from '../js/import.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const db = JSON.parse(readFileSync(resolve(ROOT, 'data/materials.json'), 'utf8'));
const limits = JSON.parse(readFileSync(resolve(ROOT, 'data/glaze-limits.json'), 'utf8'));
const idx = indexMaterials(db);
const resolveMat = buildResolver(db);

// --- args ---
const args = process.argv.slice(2);
let target = null, file = null, emitXml = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--target') target = args[++i];
  else if (args[i] === '--xml') emitXml = true;
  else if (!args[i].startsWith('--')) file = args[i];
}
const raw = file ? readFileSync(file, 'utf8') : readFileSync(0, 'utf8');

// --- lightweight Insight-Live XML parse (node has no DOMParser) ---
function parseXML(xml) {
  const recipes = [];
  const recipeRe = /<recipe\b([^>]*)>([\s\S]*?)<\/recipe>/g;
  let m;
  while ((m = recipeRe.exec(xml))) {
    const attrs = attrMap(m[1]);
    const lines = [];
    const lineRe = /<recipeline\b([^/>]*)\/?>/g;
    let lm;
    while ((lm = lineRe.exec(m[2]))) {
      const a = attrMap(lm[1]);
      const rawName = a.material || '';
      const canonical = resolveMat(rawName);
      lines.push({
        material: canonical || rawName,
        rawMaterial: rawName,
        matched: canonical != null,
        amount: parseFloat(a.amount) || 0,
        additive: a.added === 'true',
      });
    }
    recipes.push({ name: attrs.name || 'Untitled', code: attrs.codenum || '', lines });
  }
  return recipes;
}
function attrMap(s) {
  const o = {};
  const re = /(\w+)="([^"]*)"/g;
  let a;
  while ((a = re.exec(s))) o[a[1]] = a[2];
  return o;
}

// --- normalise JSON recipes (resolve material aliases too) ---
function fromJSON(data) {
  const list = Array.isArray(data) ? data : (data.recipe ? [data.recipe] : [data]);
  return list.map(r => ({
    name: r.name || 'Untitled',
    code: r.code || '',
    lines: (r.lines || []).map(l => {
      const canonical = resolveMat(l.material);
      return { material: canonical || l.material, rawMaterial: l.material,
               matched: canonical != null, amount: Number(l.amount) || 0, additive: !!l.additive };
    }),
  }));
}

const trimmed = raw.trim();
const recipes = trimmed.startsWith('<') ? parseXML(trimmed) : fromJSON(JSON.parse(trimmed));

// --xml: emit Insight-Live-importable XML for the recipe(s) and exit. Round-trips
// JSON -> XML so a drafted recipe can be pasted straight into Insight-Live.
if (emitXml) {
  process.stdout.write(toInsightLiveXML(recipes));
  process.exit(0);
}

// --- limit checking ---
function flags(a, targetKey) {
  const t = limits.targets[targetKey];
  if (!t) return [];
  const out = [];
  const check = (name, val, range) => {
    if (val == null || !range) return;
    if (val < range[0]) out.push(`${name} ${val} below ${range[0]} (low)`);
    else if (val > range[1]) out.push(`${name} ${val} above ${range[1]} (high)`);
  };
  for (const [ox, range] of Object.entries(t.oxides || {})) {
    if (ox === 'KNaO') check('KNaO', a.ratios.KNaO, range);
    else check(ox, a.oxides[ox] ? a.oxides[ox].umf : 0, range);
  }
  for (const [r, range] of Object.entries(t.ratios || {})) check(r.replace('_', ':'), a.ratios[r], range);
  return out;
}

// --- report ---
const pad = (s, n) => String(s).padEnd(n);
for (const r of recipes) {
  const a = analyzeRecipe(r.lines, idx);
  console.log(`\n=== ${r.name}${r.code ? ' [' + r.code + ']' : ''} ===`);
  console.log(`Batch ${a.baseGrams}${a.additionGrams ? ' + ' + a.additionGrams : ''} g  ·  fired ${a.firedGrams} g  ·  LOI ${a.loiPct}%`);
  const rr = a.ratios;
  console.log(`Si:Al ${rr.SiO2_Al2O3 ?? '—'}   SiB:Al ${rr.SiB_Al2O3 ?? '—'}   R2O:RO ${a.fluxSplit ? a.fluxSplit.R2O + ':' + a.fluxSplit.RO : '—'}   expansion ${a.thermalExpansion ?? '—'} (rel)`);
  console.log('UMF:');
  for (const ox of displayOrder(Object.keys(a.oxides))) {
    const o = a.oxides[ox];
    console.log(`  ${pad(ox, 6)} ${pad(o.umf.toFixed(3), 8)} ${o.weightPct.toFixed(2)}%`);
  }
  if (rr.KNaO != null) console.log(`  (KNaO) ${rr.KNaO.toFixed(3)}`);
  if (a.unknownMaterials.length) console.log(`⚠ unmatched materials: ${a.unknownMaterials.join(', ')}`);
  if (target) {
    const f = flags(a, target);
    console.log(`\nvs ${limits.targets[target]?.label || target}: ${f.length ? '\n  ⚠ ' + f.join('\n  ⚠ ') : '✓ within typical ranges'}`);
  }
}
