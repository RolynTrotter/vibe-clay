#!/usr/bin/env node
// vibe-clay recipe analyzer (CLI).
//
// Runs the same chemistry engine the app uses, from the command line, so Claude
// (or anyone) can analyse a recipe without a browser. Accepts an Insight-Live
// XML export, the app's recipe JSON, or reads either from stdin.
//
//   node tools/analyze.mjs recipe.xml
//   node tools/analyze.mjs recipe.json --target cone6-glossy
//   cat recipe.xml | node tools/analyze.mjs --target cone6-glossy --body laguna-frost
//   node tools/analyze.mjs recipe.json --lint
//   node tools/analyze.mjs --list-targets
//
// XML with multiple <recipe> elements analyses each. JSON may be a single
// recipe { name, lines:[{material, amount, additive}] } or an array of them.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { analyzeRecipe, lineBlend, lintRecipe, fitToBody, indexMaterials, buildResolver, displayOrder,
         OXIDE_MOLAR_MASS, OXIDE_GROUP, EXPANSION_FACTOR, gasTiming, MELT_SEAL_C } from '../js/chemistry.js';
import { parseInsightLiveXML, toInsightLiveXML } from '../js/import.js';
import { checkLimits } from '../js/limits.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const db = JSON.parse(readFileSync(resolve(ROOT, 'data/materials.json'), 'utf8'));
const limits = JSON.parse(readFileSync(resolve(ROOT, 'data/glaze-limits.json'), 'utf8'));
const bodies = JSON.parse(readFileSync(resolve(ROOT, 'data/bodies.json'), 'utf8'));
const GLAZES_PATH = resolve(ROOT, 'data/glazes.json');
// Fail soft. The library is optional, it ships empty, and an installed skill
// directory is not always readable/writable — none of that should stop the
// analyser, which is what everything else here runs through.
const EMPTY_GLAZES = {
  _meta: { populate: 'Save one with: node tools/analyze.mjs <recipe> --save <key>' },
  glazes: {},
};
let glazes = EMPTY_GLAZES;
try {
  glazes = JSON.parse(readFileSync(GLAZES_PATH, 'utf8'));
  glazes.glazes ||= {};
  glazes._meta ||= EMPTY_GLAZES._meta;
} catch { /* no library yet, or not readable — carry on without one */ }
const idx = indexMaterials(db);
const resolveMat = buildResolver(db);

// --- args ---
const args = process.argv.slice(2);
let target = null, files = [], emitXml = false, blend = null, lint = false, bodyKey = null;
let brief = false, asJson = false, compare = false, vsRef = null, saveKey = null, anchorKey = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--target') target = args[++i];
  else if (args[i] === '--body') bodyKey = args[++i];
  else if (args[i] === '--lint') lint = true;
  else if (args[i] === '--xml') emitXml = true;
  else if (args[i] === '--blend') blend = parseInt(args[++i], 10) || 5;
  else if (args[i] === '--brief') brief = true;
  else if (args[i] === '--json') asJson = true;
  else if (args[i] === '--compare') compare = true;
  else if (args[i] === '--vs') vsRef = args[++i];
  else if (args[i] === '--save') saveKey = args[++i];
  else if (args[i] === '--anchor') anchorKey = args[++i];
  else if (!args[i].startsWith('--')) files.push(args[i]);
}

// --- catalogue listings (no recipe needed) ---
if (args.includes('--list-targets')) {
  console.log('\nFiring targets (--target <key>):\n');
  for (const [key, t] of Object.entries(limits.targets)) console.log(`  ${key.padEnd(20)} ${t.label}`);
  console.log('\nGlaze families that sit outside the glossy limits BY DESIGN:\n');
  for (const [key, f] of Object.entries(limits.families)) {
    if (key.startsWith('_')) continue;
    console.log(`  ${key}\n    signature: ${f.signature}\n    ${f.reading}\n`);
  }
  process.exit(0);
}
// --matrix: dump the linear algebra behind every number this tool prints, so a
// solver can work on the SAME coefficients rather than re-deriving them.
//
// Every quantity here is linear in the amounts vector x:
//   oxide moles  = M·x          flux moles = f·x        fired grams = g·x
// and every quantity the tool REPORTS is a ratio of two of those, which means
// every limit band is a linear inequality once the denominator is cleared.
// That is the whole justification for solving a recipe instead of searching
// for one. See tools/solve.py.
if (args.includes('--matrix')) {
  const out = {
    _meta: {
      description: 'Per-gram linear coefficients for every material, plus the limit bands. Consumed by tools/solve.py.',
      note: 'molesPerGram is oxide moles contributed per gram AS BATCHED (LOI already accounted, since the oxide analysis excludes it). UMF value of an oxide = (molesPerGram·x) / (fluxMolesPerGram·x).',
      meltSealC: MELT_SEAL_C,
      generated: 'node tools/analyze.mjs --matrix',
    },
    oxideGroup: OXIDE_GROUP,
    expansionFactor: EXPANSION_FACTOR,
    targets: limits.targets,
    materials: db.materials.map(m => {
      const molesPerGram = {};
      let fluxMolesPerGram = 0, totalMolesPerGram = 0, firedGramsPerGram = 0;
      for (const [ox, pct] of Object.entries(m.oxides || {})) {
        const mm = OXIDE_MOLAR_MASS[ox];
        firedGramsPerGram += pct / 100;
        if (!mm) continue;
        const mol = (pct / 100) / mm;
        molesPerGram[ox] = mol;
        totalMolesPerGram += mol;
        if (OXIDE_GROUP[ox] === 'flux') fluxMolesPerGram += mol;
      }
      const timing = gasTiming(m.gasWindowC);
      return {
        name: m.name,
        // Aliases travel with the matrix so a solver can accept the names
        // recipes are actually written in ("Ferro Frit 3110") without
        // reimplementing the resolver.
        aliases: m.aliases || [],
        tags: m.tags || [],
        molesPerGram, fluxMolesPerGram, totalMolesPerGram, firedGramsPerGram,
        loiGramsPerGram: (m.loi || 0) / 100,
        gasWindowC: m.gasWindowC || null,
        gasPhase: timing.phase,
        gasSeverity: timing.severity,
        // Gas that arrives at or after the sealing melt, per gram of material.
        lateGasGramsPerGram: timing.severity >= 2 ? (m.loi || 0) / 100 : 0,
        pricePerKg: m.pricePerKg ?? null,
      };
    }),
  };
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  process.exit(0);
}

if (args.includes('--list-glazes')) {
  const entries = Object.entries(glazes.glazes);
  console.log('\nNamed glazes (usable anywhere a recipe file is):\n');
  if (!entries.length) {
    console.log('  (library is empty)\n');
    console.log('  ' + glazes._meta.populate + '\n');
    process.exit(0);
  }
  for (const [key, g] of entries) {
    console.log(`  ${key.padEnd(14)} ${g.label || g.recipe?.name || ''}`);
    if (g.fitsBody) console.log(`  ${''.padEnd(14)} fires without craze/shiver on: ${g.fitsBody}  → usable as --anchor`);
    console.log(`  ${''.padEnd(14)} ${g.provenance || '⚠ no provenance recorded'}\n`);
  }
  process.exit(0);
}
if (args.includes('--list-bodies')) {
  console.log('\nClay bodies (--body <key>):\n');
  for (const [key, b] of Object.entries(bodies.bodies)) {
    const range = b.coeRange ? (b.coeRange[0] === b.coeRange[1] ? String(b.coeRange[0]) : b.coeRange.join('-')) : 'no figure';
    console.log(`  ${key.padEnd(16)} ${b.label}`);
    console.log(`  ${''.padEnd(16)} expansion ${range}  [${b.confidence}]`);
    console.log(`  ${''.padEnd(16)} ${b.provenance}\n`);
  }
  console.log(bodies._meta.units + '\n');
  process.exit(0);
}

// --anchor <glaze>: the guardrails already say the expansion index is only
// meaningful as a distance from a glaze with known empirical fit. This makes
// that the output rather than a caveat under an absolute number.
let anchor = null;
if (anchorKey) {
  const g = glazes.glazes[anchorKey];
  if (!g) {
    console.error(`Unknown glaze '${anchorKey}'. Try --list-glazes.`);
    process.exit(1);
  }
  anchor = g;
}

const body = bodyKey ? bodies.bodies[bodyKey] : null;
if (bodyKey && !body) {
  console.error(`Unknown body '${bodyKey}'. Try --list-bodies.`);
  process.exit(1);
}
if (target && !limits.targets[target]) {
  console.error(`Unknown target '${target}'. Try --list-targets.`);
  process.exit(1);
}
// Blend needs two recipes; accept them as two files, one file with two recipes,
// or stdin. Everything else reads a single source (file or stdin).
// A recipe reference is either a key in the named-glaze library or a path. The
// library wins, so `--vs g2926b` needs no file on disk and no retyping.
function readRef(ref) {
  const g = glazes.glazes[ref];
  if (g) return JSON.stringify(g.recipe);
  return readFileSync(ref, 'utf8');
}
const raw = files.length ? files.map(readRef) : [readFileSync(0, 'utf8')];

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

function parseSource(text) {
  const trimmed = text.trim();
  return trimmed.startsWith('<')
    ? parseInsightLiveXML(trimmed, db)
    : fromJSON(JSON.parse(trimmed));
}
const recipes = raw.flatMap(parseSource);

const pad = (s, n) => String(s).padEnd(n);
// UMF is undefined for a fluxless recipe; print a dash, not a misleading 0.000.
const fmtUmf = v => (v == null ? '—' : v.toFixed(3));

// --xml: emit Insight-Live-importable XML for the recipe(s) and exit. Round-trips
// JSON -> XML so a drafted recipe can be pasted straight into Insight-Live.
if (emitXml) {
  process.stdout.write(toInsightLiveXML(recipes));
  process.exit(0);
}

// --blend N: line-blend the first two recipes into N points and print a matrix
// of the UMF + key ratios along the line. Needs two recipes (two files, or one
// source containing two).
if (blend != null) {
  if (recipes.length < 2) {
    console.error('--blend needs two recipes (pass two files, or one source with two recipes).');
    process.exit(1);
  }
  const [A, B] = recipes;
  const points = lineBlend(A.lines, B.lines, blend, idx);
  console.log(`\n=== Line blend: ${A.name} → ${B.name}  (${points.length} points) ===`);
  // Column headers: A:B mix for each point.
  const colw = 10;
  const cell = s => String(s).padStart(colw);
  console.log(pad('', 8) + points.map(p => cell(p.label)).join(''));
  // One row per oxide (union across all points), in reading order.
  const oxKeys = new Set();
  for (const p of points) for (const ox of Object.keys(p.analysis.oxides)) oxKeys.add(ox);
  console.log('UMF:');
  for (const ox of displayOrder([...oxKeys])) {
    const row = points.map(p => cell(fmtUmf(p.analysis.oxides[ox]?.umf)));
    console.log(pad('  ' + ox, 8) + row.join(''));
  }
  // Key ratios / metrics along the line.
  const metric = (label, fn) => console.log(pad(label, 8) + points.map(p => cell(fn(p.analysis))).join(''));
  console.log('Ratios:');
  metric('  Si:Al', a => a.ratios.SiO2_Al2O3 ?? '—');
  metric('  SiB:Al', a => a.ratios.SiB_Al2O3 ?? '—');
  metric('  R2O:RO', a => a.fluxSplit ? `${a.fluxSplit.R2O}:${a.fluxSplit.RO}` : '—');
  metric('  KNaO', a => a.ratios.KNaO ?? '—');
  metric('  Expan', a => a.thermalExpansion ?? '—');
  metric('  LOI%', a => a.loiPct);
  const anyUnmatched = [...new Set(points.flatMap(p => p.analysis.unknownMaterials))];
  if (anyUnmatched.length) console.log(`\n⚠ unmatched materials: ${anyUnmatched.join(', ')}`);
  if (target) {
    console.log(`\nvs ${limits.targets[target]?.label || target}:`);
    for (const p of points) {
      const f = flags(p.analysis, target);
      console.log(`  ${pad(p.label, 8)} ${f.length ? '⚠ ' + f.join('; ') : '✓ within typical ranges'}`);
    }
  }
  process.exit(0);
}

// --- limit checking ---
// Shares js/limits.js with the app so both flag exactly the same values; this
// only renders the result as terminal text.
function flags(a, targetKey) {
  const result = checkLimits(a, limits.targets[targetKey]);
  if (!result) return [];
  const out = result.checks
    .filter(c => c.status === 'low' || c.status === 'high')
    // c.label is subscripted for the web UI; the terminal uses plain ASCII to
    // match the UMF table printed above it.
    .map(c => `${c.key.replace('_', ':')} ${c.value} ${c.status === 'low' ? `below ${c.min} (low)` : `above ${c.max} (high)`}`);

  // A partial check must never print as a clean pass.
  const uncheckable = result.checks.length - result.checkedCount;
  if (uncheckable > 0) {
    out.push(`${uncheckable} value(s) not computable${a.hasFlux ? '' : ' (no fluxes — UMF undefined)'}`);
  }
  return out;
}

// Which by-design outlier family does this chemistry look like? Used to stop a
// wall of flags against the glossy limits from reading as a wall of faults —
// for a shino or a tenmoku, those flags ARE the glaze.
function detectFamilies(a) {
  const al = a.oxides.Al2O3?.umf ?? 0;
  const siAl = a.ratios.SiO2_Al2O3 ?? 0;
  const kNaO = a.ratios.KNaO ?? 0;
  const b2o3 = a.oxides.B2O3?.umf ?? 0;
  const mgo = a.oxides.MgO?.umf ?? 0;
  const hits = [];
  if (al > 0.6 && kNaO > 0.5 && siAl && siAl < 5) hits.push('shino');
  if (kNaO > 0.5 && al > 0 && al < 0.25) hits.push('raku');
  if (al > 0 && al < 0.15 && siAl > 12) hits.push('crystalline');
  if (!hits.includes('crystalline') && al > 0 && al < 0.3 && siAl > 9 && b2o3 < 0.08 && mgo < 0.08) hits.push('iron-crystal');
  // Low Si:Al with decent alumina reads as matte — but a shino or a raku hits
  // that test too, and both are the more specific answer. Don't list all three.
  if (!hits.length && al >= 0.3 && siAl && siAl < 6.5) hits.push('matte');
  return hits;
}

function printFlags(a, targetKey) {
  const t = limits.targets[targetKey];
  const f = flags(a, targetKey);
  console.log(`\nvs ${t?.label || targetKey}: ${f.length ? '\n  ⚠ ' + f.join('\n  ⚠ ') : '✓ within typical ranges'}`);
  // Only nudge toward the families when checking against a GLOSSY target — that
  // is the one people reach for by default and the one that misreads outliers.
  if (f.length >= 3 && targetKey.endsWith('-glossy')) {
    const hits = detectFamilies(a);
    if (hits.length) {
      console.log('\n  ℹ These flags may be a signature rather than faults. This chemistry looks like:');
      for (const key of hits) {
        const fam = limits.families[key];
        if (!fam) continue;
        console.log(`     ${key} — ${fam.signature}`);
        console.log(`       ${fam.reading}`);
      }
      console.log('     See --list-targets for a target that matches what the glaze is trying to be.');
    }
  }
  if (t?.notes?.length) {
    console.log(`\n  Notes on ${targetKey}:`);
    for (const n of t.notes) console.log(`   · ${n}`);
  }
}

function printLint(recipeLines) {
  const findings = lintRecipe(recipeLines, idx);
  console.log('\nLint (things the UMF cannot see):');
  if (!findings.length) {
    console.log('  ✓ nothing flagged');
    return;
  }
  for (const f of findings) {
    console.log(`  ${f.level === 'warn' ? '⚠' : '·'} [${f.code}] ${f.message}`);
    if (f.fix) console.log(`      → ${f.fix}`);
  }
}

function printAnchor(a) {
  const anchorA = analyzeRecipe(
    (anchor.recipe.lines || []).map(l => {
      const canonical = resolveMat(l.material);
      return { material: canonical || l.material, amount: Number(l.amount) || 0, additive: !!l.additive };
    }), idx);
  const mine = a.thermalExpansion, ref = anchorA.thermalExpansion;
  console.log(`\nAnchored against ${anchor.label || anchorKey}:`);
  if (mine == null || ref == null) {
    console.log('  ℹ expansion not computable for one of the two — nothing to anchor.');
    return;
  }
  const delta = Math.round((mine - ref) * 100) / 100;
  const dir = delta > 0 ? 'ABOVE the anchor → toward crazing' : delta < 0 ? 'BELOW the anchor → toward compression/shivering' : 'identical to the anchor';
  console.log(`  anchor  ${ref} (rel)   this glaze  ${mine} (rel)   Δ ${delta > 0 ? '+' : ''}${delta} — ${dir}`);
  if (anchor.fitsBody) {
    console.log(`  ${anchor.label || anchorKey} is recorded as firing without craze or shiver on ${anchor.fitsBody}.`);
  } else {
    console.log(`  ⚠ no fitsBody recorded for this anchor, so "fits" is an assumption. An anchor with no observed fit is just another glaze.`);
  }
  console.log('  Read the Δ, not the absolutes. Both figures come from the same additive model, so');
  console.log('  their DIFFERENCE is the trustworthy part; the absolute index can disagree with a');
  console.log('  dilatometer or with Insight-Live, most of all when lithium or magnesia is high.');
}

function printFit(a) {
  const fit = fitToBody(a.thermalExpansion, body);
  const mark = fit.status === 'good' ? '✓' : fit.status === 'no-data' ? 'ℹ' : '⚠';
  console.log(`\nFit vs ${body.label} [${fit.confidence}]:`);
  console.log(`  ${mark} ${fit.headline}`);
  console.log(`      ${fit.detail}`);
  if (fit.status === 'no-data') return;
  // An estimated body figure is a prompt to test, not a number to design against
  // — say so every time, or the estimate quietly becomes a fact.
  if (fit.confidence !== 'published') console.log(`      ⚠ ${body.provenance}`);
  console.log('      Only meaningful when anchored: read this gap against a glaze you KNOW fits this body,');
  console.log('      not as an absolute stress prediction. See data/bodies.json → _meta.units.');
}

// --- compact renderers ----------------------------------------------------
// The full UMF block is the right default for a single recipe read on its own.
// It is the wrong output when eight candidates are being weighed against each
// other, or when a script is consuming the numbers: --brief, --compare and
// --json exist so an iteration costs one line instead of twenty.
const HEADLINE = [
  ['Al2O3', a => fmtUmf(a.oxides.Al2O3?.umf)],
  ['SiO2', a => fmtUmf(a.oxides.SiO2?.umf)],
  ['B2O3', a => fmtUmf(a.oxides.B2O3?.umf)],
  ['KNaO', a => (a.ratios.KNaO == null ? '—' : a.ratios.KNaO.toFixed(3))],
  ['Li2O', a => fmtUmf(a.oxides.Li2O?.umf)],
  ['MgO', a => fmtUmf(a.oxides.MgO?.umf)],
  ['CaO', a => fmtUmf(a.oxides.CaO?.umf)],
  ['Si:Al', a => a.ratios.SiO2_Al2O3 ?? '—'],
  ['R2O:RO', a => (a.fluxSplit ? `${a.fluxSplit.R2O}:${a.fluxSplit.RO}` : '—')],
  ['expan', a => a.thermalExpansion ?? '—'],
  ['LOI%', a => a.loiPct],
];

function briefLine(r, a) {
  const f = target ? flags(a, target) : [];
  const cells = HEADLINE.map(([k, fn]) => `${k} ${fn(a)}`).join('  ');
  const mark = !target ? '' : (f.length ? `  ⚠${f.length}` : '  ✓');
  return `${pad(r.name.slice(0, 22), 23)}${cells}${mark}`;
}

function printCompare(rows) {
  const colw = Math.max(10, ...rows.map(x => x.r.name.length + 2));
  const cell = s2 => String(s2).padStart(colw);
  console.log();
  console.log(pad('', 9) + rows.map(x => cell(x.r.name.slice(0, colw - 1))).join(''));
  for (const [k, fn] of HEADLINE) {
    console.log(pad('  ' + k, 9) + rows.map(x => cell(fn(x.a))).join(''));
  }
  if (target) {
    console.log(pad('  flags', 9) + rows.map(x => {
      const n = flags(x.a, target).length;
      return cell(n ? '⚠ ' + n : '✓');
    }).join(''));
    console.log(`\n(flags vs ${limits.targets[target]?.label || target} — rerun without --compare for the detail)`);
  }
}

// --vs: only what moved. Almost every recipe here is a derivative of an earlier
// one; printing twelve unchanged oxide rows buries the two that changed.
function printVs(refName, refA, rows) {
  for (const { r, a } of rows) {
    console.log(`\n=== ${r.name}  vs  ${refName} ===`);
    let any = false;
    for (const [k, fn] of HEADLINE) {
      const now = fn(a), was = fn(refA);
      if (String(now) === String(was)) continue;
      any = true;
      // Only subtract when BOTH sides are numbers. '—' (undefined) and the
      // '0.23:0.77' ratio string are legitimate values here; Number() turns
      // them into NaN and a NaN delta reads as a computed result, not a gap.
      const nn = Number(now), nw = Number(was);
      const numeric = Number.isFinite(nn) && Number.isFinite(nw);
      const delta = numeric ? nn - nw : null;
      const arrow = delta == null ? '' : (delta > 0 ? ' ▲' : ' ▼');
      const shown = delta == null
        ? `${was} → ${now}`
        : `${was} → ${now}  (${delta > 0 ? '+' : ''}${Number(delta.toFixed(3))})`;
      console.log(`  ${pad(k, 8)} ${shown}${arrow}`);
    }
    if (!any) console.log('  (no change in any headline value)');
    if (target) {
      const fNow = flags(a, target), fWas = flags(refA, target);
      const fixed = fWas.filter(x => !fNow.includes(x));
      const added = fNow.filter(x => !fWas.includes(x));
      if (fixed.length) console.log(`  resolved: ${fixed.join('; ')}`);
      if (added.length) console.log(`  new:      ${added.join('; ')}`);
      if (!fixed.length && !added.length) console.log(`  flags unchanged (${fNow.length})`);
    }
  }
}

// --- report ---
const analysed = recipes.map(r => ({ r, a: analyzeRecipe(r.lines, idx) }));

// --save <key>: put the recipe just analysed into the named library, so the
// next session reads it by name instead of re-transcribing it. Refuses to
// clobber an existing key — a glaze code is supposed to name one chemistry.
if (saveKey != null) {
  if (analysed.length !== 1) {
    console.error(`--save takes exactly one recipe; got ${analysed.length}. Pass a single recipe, or split the file.`);
    process.exit(1);
  }
  if (glazes.glazes[saveKey]) {
    console.error(`'${saveKey}' already exists (${glazes.glazes[saveKey].label}). Pick a new key — a code should name one chemistry, not a moving target.`);
    process.exit(1);
  }
  const { r, a } = analysed[0];
  if (a.unknownMaterials.length) {
    console.error(`Refusing to save: unmatched materials (${a.unknownMaterials.join(', ')}). The stored recipe would not be the recipe.`);
    process.exit(1);
  }
  glazes.glazes[saveKey] = {
    label: r.name,
    provenance: process.env.VIBE_CLAY_PROVENANCE || 'TODO — record where these numbers came from (Insight-Live export, published source, studio notebook).',
    recipe: { name: r.name, lines: r.lines.map(l => ({ material: l.material, amount: l.amount, additive: !!l.additive })) },
  };
  writeFileSync(GLAZES_PATH, JSON.stringify(glazes, null, 2) + '\n');
  console.log(`Saved '${saveKey}' → ${r.name} (${r.lines.length} lines).`);
  if (!process.env.VIBE_CLAY_PROVENANCE) {
    console.log(`⚠ provenance not set. Edit data/glazes.json, or re-run with VIBE_CLAY_PROVENANCE="…".`);
  }
  console.log(`  Now usable as: --vs ${saveKey}   --anchor ${saveKey}   analyze.mjs ${saveKey}`);
  process.exit(0);
}

if (asJson) {
  process.stdout.write(JSON.stringify(analysed.map(({ r, a }) => ({
    name: r.name,
    code: r.code || null,
    lines: r.lines,
    analysis: a,
    flags: target ? flags(a, target) : null,
    lint: lint ? lintRecipe(r.lines, idx) : null,
    fit: body ? fitToBody(a.thermalExpansion, body) : null,
  })), null, 2) + '\n');
  process.exit(0);
}

if (vsRef != null) {
  const refRecipes = parseSource(readRef(vsRef));
  const ref = refRecipes[0];
  printVs(ref.name, analyzeRecipe(ref.lines, idx), analysed);
  process.exit(0);
}

if (compare) {
  printCompare(analysed);
  process.exit(0);
}

if (brief) {
  for (const { r, a } of analysed) console.log(briefLine(r, a));
  process.exit(0);
}

for (const r of recipes) {
  const a = analyzeRecipe(r.lines, idx);
  console.log(`\n=== ${r.name}${r.code ? ' [' + r.code + ']' : ''} ===`);
  console.log(`Batch ${a.baseGrams}${a.additionGrams ? ' + ' + a.additionGrams : ''} g  ·  fired ${a.firedGrams} g  ·  LOI ${a.loiPct}%`);
  const rr = a.ratios;
  console.log(`Si:Al ${rr.SiO2_Al2O3 ?? '—'}   SiB:Al ${rr.SiB_Al2O3 ?? '—'}   R2O:RO ${a.fluxSplit ? a.fluxSplit.R2O + ':' + a.fluxSplit.RO : '—'}   expansion ${a.thermalExpansion ?? '—'} (rel)`);
  console.log('UMF:');
  for (const ox of displayOrder(Object.keys(a.oxides))) {
    const o = a.oxides[ox];
    console.log(`  ${pad(ox, 6)} ${pad(fmtUmf(o.umf), 8)} ${o.weightPct.toFixed(2)}%`);
  }
  if (rr.KNaO != null) console.log(`  (KNaO) ${rr.KNaO.toFixed(3)}`);
  if (a.unknownMaterials.length) console.log(`⚠ unmatched materials: ${a.unknownMaterials.join(', ')}`);
  if (target) printFlags(a, target);
  if (anchor) printAnchor(a);
  if (body) printFit(a);
  if (lint) printLint(r.lines);
}
