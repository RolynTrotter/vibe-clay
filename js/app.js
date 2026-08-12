// vibe-clay app — recipe builder + live glaze analysis. Vanilla ES modules.
import { analyzeRecipe, lineBlend, indexMaterials, displayOrder, OXIDE_GROUP } from './chemistry.js';
import { parseInsightLiveXML, toInsightLiveXML } from './import.js';
import { parseRecipeText } from './paste-import.js';
import { checkLimits } from './limits.js';
import * as store from './store.js';

const state = {
  db: null,
  idx: null,
  limits: null,      // parsed glaze-limits.json
  target: '',        // selected firing target key, '' = none
  library: [],       // recipes imported from an Insight-Live export
  blendPoints: null, // last computed line-blend points (for the Load buttons)
  recipe: {
    name: 'Untitled Recipe',
    lines: [],       // { material, amount, additive }
  },
};

const $ = (sel, root = document) => root.querySelector(sel);

async function boot() {
  const [db, limits] = await Promise.all([
    fetch('./data/materials.json').then(r => r.json()),
    fetch('./data/glaze-limits.json').then(r => r.json()).catch(() => null),
  ]);
  state.db = db;
  state.idx = indexMaterials(state.db);
  state.limits = limits;

  // Pick up where the last session left off; fall back to the sample so a
  // first-time visitor lands on something they can immediately poke at.
  const saved = store.load();
  state.library = saved.library;
  state.target = saved.target;
  if (saved.recipe) state.recipe = saved.recipe; else loadSample();

  renderTargets();
  render();
  renderLibrary();
  renderBlendSources();
  wireGlobalButtons();
  registerServiceWorker();
  if (!store.available()) {
    $('#saveState').textContent =
      'Storage is blocked in this browser (private mode?) — your work will be lost on reload. Export before you close the tab.';
  }
}

// Persist after any change that's worth surviving a tab reload.
function persist() {
  store.save({ library: state.library, recipe: state.recipe, target: state.target });
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // file:// has no SW support and doesn't need one.
  if (location.protocol === 'file:') return;
  navigator.serviceWorker.register('./sw.js').catch(() => { /* offline is a bonus, not a requirement */ });
}

function loadSample() {
  state.recipe = {
    name: 'Leadless Gloss (sample)',
    lines: [
      { material: 'Custer Feldspar (Potash)', amount: 40, additive: false },
      { material: 'Silica (Quartz)', amount: 20, additive: false },
      { material: 'Whiting (Calcium Carbonate)', amount: 20, additive: false },
      { material: 'Kaolin (EPK)', amount: 20, additive: false },
      { material: 'Red Iron Oxide', amount: 2, additive: true },
    ],
  };
}

function materialOptions(selected) {
  return state.db.materials
    .map(m => `<option value="${escapeHtml(m.name)}"${m.name === selected ? ' selected' : ''}>${escapeHtml(m.name)}</option>`)
    .join('');
}

function render() {
  $('#recipeName').value = state.recipe.name;
  renderLines();
  renderAnalysis();
}

function addLine(additive) {
  state.recipe.lines.push({ material: state.db.materials[0].name, amount: 0, additive });
  recipeChanged({ relayout: true });
}

function rowHtml(i) {
  const line = state.recipe.lines[i];
  const togTitle = line.additive ? 'Move up to base recipe' : 'Move down to additions';
  return `<div class="row">
      <select class="mat" data-i="${i}" aria-label="Material">${materialOptions(line.material)}</select>
      <input class="amt" data-i="${i}" type="number" inputmode="decimal" min="0" step="0.1"
             value="${line.amount}" aria-label="Amount in grams" />
      <button class="tog" data-i="${i}" title="${togTitle}" aria-label="${togTitle}">${line.additive ? '▲' : '▼'}</button>
      <button class="del" data-i="${i}" title="Remove" aria-label="Remove line">×</button>
    </div>`;
}

// Every edit path funnels through here so nothing can change the recipe without
// also re-analysing it and writing it back to storage.
function recipeChanged({ relayout = false } = {}) {
  if (relayout) renderLines();
  renderAnalysis();
  persist();
}

function renderLines() {
  const wrap = $('#lines');
  const lines = state.recipe.lines;
  const baseIdx = lines.map((_, i) => i).filter(i => !lines[i].additive);
  const addIdx = lines.map((_, i) => i).filter(i => lines[i].additive);

  wrap.innerHTML = `
    <div class="grp-label">Base recipe</div>
    ${baseIdx.map(rowHtml).join('') || '<div class="grp-empty">No base materials yet</div>'}
    <button class="btn ghost small addbtn" data-add="base">+ material</button>
    <div class="grp-label add">Additions <span>· colorants / on top of base</span></div>
    ${addIdx.map(rowHtml).join('') || '<div class="grp-empty">No additions</div>'}
    <button class="btn ghost small addbtn" data-add="add">+ addition</button>`;

  wrap.querySelectorAll('select.mat').forEach(el =>
    el.addEventListener('change', e => {
      const line = state.recipe.lines[+e.target.dataset.i];
      line.material = e.target.value;
      // The user has overridden the material, so the Insight-Live name no longer
      // describes this line — drop it rather than exporting a stale name.
      delete line.rawMaterial;
      line.matched = true;
      recipeChanged();
    }));
  wrap.querySelectorAll('input.amt').forEach(el =>
    el.addEventListener('input', e => { state.recipe.lines[+e.target.dataset.i].amount = parseFloat(e.target.value) || 0; recipeChanged(); }));
  wrap.querySelectorAll('button.tog').forEach(el =>
    el.addEventListener('click', e => { const l = state.recipe.lines[+e.currentTarget.dataset.i]; l.additive = !l.additive; recipeChanged({ relayout: true }); }));
  wrap.querySelectorAll('button.del').forEach(el =>
    el.addEventListener('click', e => { state.recipe.lines.splice(+e.currentTarget.dataset.i, 1); recipeChanged({ relayout: true }); }));
  wrap.querySelectorAll('button.addbtn').forEach(el =>
    el.addEventListener('click', e => addLine(e.currentTarget.dataset.add === 'add')));
}

function renderAnalysis() {
  const a = analyzeRecipe(state.recipe.lines, state.idx);

  // Stats grid — the ratios Insight-Live reports
  const dash = v => (v == null ? '—' : v);
  const siAl = a.ratios.SiO2_Al2O3;
  const siBAl = a.ratios.SiB_Al2O3;
  const split = a.fluxSplit ? `${a.fluxSplit.R2O.toFixed(1)} : ${a.fluxSplit.RO.toFixed(1)}` : '—';
  const batchLabel = a.additionGrams > 0
    ? `${a.baseGrams} + ${a.additionGrams} g`
    : `${a.batchGrams} g`;
  $('#stats').innerHTML = `
    ${stat('SiO₂ : Al₂O₃', siAl == null ? '—' : siAl + ':1', 'silica : alumina')}
    ${stat('SiB : Al', siBAl == null ? '—' : siBAl + ':1', '(SiO₂+B₂O₃) : Al₂O₃')}
    ${stat('R₂O : RO', split, 'alkali : alkaline-earth')}
    ${stat('Expansion', dash(a.thermalExpansion), 'rel. (compare only)')}
    ${stat('Batch LOI', a.loiPct + '%', 'loss on firing')}
    ${stat('Batch', batchLabel, 'base + additions → ' + a.firedGrams + ' g fired')}`;

  // UMF table — highlight the structural trio (SiO₂ blue, Al₂O₃ red, B₂O₃ yellow)
  const hi = { SiO2: 'hi-si', Al2O3: 'hi-al', B2O3: 'hi-b' };
  const keys = displayOrder(Object.keys(a.oxides));
  const rows = keys.map(ox => {
    const o = a.oxides[ox];
    return `<tr class="g-${o.group}">
      <td>${fmtOxide(ox)}</td>
      <td class="${hi[ox] || ''}">${fmtUmf(o.umf)}</td>
      <td>${o.weightPct.toFixed(2)}</td>
      <td>${o.molePct.toFixed(2)}</td></tr>`;
  }).join('');
  // KNaO combined-alkali line, shown grouped like Insight-Live
  const kNaORow = a.ratios.KNaO != null
    ? `<tr class="knao"><td>(KNaO)</td><td>${a.ratios.KNaO.toFixed(3)}</td><td colspan="2">combined K₂O + Na₂O</td></tr>`
    : '';
  $('#umf').innerHTML = `
    <thead><tr><th>Oxide</th><th>UMF</th><th>Weight %</th><th>Mole %</th></tr></thead>
    <tbody>${rows ? rows + kNaORow : '<tr><td colspan="4" style="text-align:center;color:var(--muted)">Add materials to see analysis</td></tr>'}</tbody>`;

  $('#warn').innerHTML = a.unknownMaterials.length
    ? `<div class="warnbox">Unknown material(s) skipped in chemistry: ${a.unknownMaterials.map(escapeHtml).join(', ')}</div>`
    : '';

  renderLimits(a);
}

// --- Firing-target limit check ------------------------------------------

function renderTargets() {
  const sel = $('#target');
  const targets = (state.limits && state.limits.targets) || {};
  const opts = Object.entries(targets)
    .map(([key, t]) => `<option value="${escapeHtml(key)}"${key === state.target ? ' selected' : ''}>${escapeHtml(t.label || key)}</option>`)
    .join('');
  sel.innerHTML = `<option value="">No target</option>${opts}`;
  sel.value = state.target;
}

function renderLimits(a) {
  const wrap = $('#limits');
  const target = state.limits && state.limits.targets && state.limits.targets[state.target];
  if (!target) { wrap.innerHTML = ''; return; }

  const result = checkLimits(a, target);
  const rows = result.checks.map(c => {
    const val = c.value == null ? '—' : trim(c.value);
    const arrow = c.status === 'low' ? '▼' : c.status === 'high' ? '▲' : '';
    return `<tr class="lim-${c.status}">
      <td>${c.label}</td>
      <td class="lim-val">${val} ${arrow}</td>
      <td class="lim-range">${trim(c.min)}–${trim(c.max)}</td></tr>`;
  }).join('');

  const uncheckable = result.checks.length - result.checkedCount;
  const headline = result.checkedCount === 0
    ? `<span class="lim-summary-out">Nothing could be checked.</span>`
    : result.outCount === 0
      ? `<span class="lim-summary-ok">All ${result.checkedCount} checked values inside the typical range.</span>`
      : `<span class="lim-summary-out">${result.outCount} of ${result.checkedCount} checked outside the typical range.</span>`;
  // Never let a partial check read as a clean bill of health.
  const caveat = uncheckable > 0
    ? ` ${uncheckable} value${uncheckable === 1 ? '' : 's'} couldn't be computed${a.hasFlux ? '' : ' — this recipe has no fluxes, so there\'s no unity formula to normalise against'}.`
    : '';
  const summary = headline + caveat;

  wrap.innerHTML = `
    <table class="limits-table">
      <thead><tr><th>Value</th><th>This glaze</th><th>Typical</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="note">${summary} These ranges are heuristics for functional glossy glazes — outside them isn't wrong,
      it's a prompt to think about why. Matte, crystalline, and art glazes live outside them on purpose.</p>`;
}

// 0.25 not 0.250, 6 not 6.00 — ranges read better without trailing zeros.
const trim = n => String(Number(n));

// UMF is undefined for a fluxless recipe; show that rather than a fake 0.000.
const fmtUmf = v => (v == null ? '—' : v.toFixed(3));

const stat = (k, v, u) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div><div class="u">${u}</div></div>`;
const fmtOxide = ox => ox.replace(/(\d)/g, '<sub>$1</sub>');

function loadFromLibrary(i) {
  const rec = state.library[i];
  if (!rec) return;
  // Carry the whole recipe across, not just name+lines: the Insight-Live id,
  // share key, code and notes are what let it export back as the same recipe.
  state.recipe = { ...rec, lines: rec.lines.map(l => ({ ...l })) };
  render();
  persist();
  document.querySelector('main').scrollIntoView({ behavior: 'smooth' });
}

function importLibrary(xmlText) {
  const recipes = parseInsightLiveXML(xmlText, state.db);
  state.library = recipes;
  renderLibrary();
  renderBlendSources();
  if (recipes.length) loadFromLibrary(0); else persist();
}

// --- Line blend ---------------------------------------------------------

// Sources the blend picker can point at: the recipe in the builder, plus every
// imported library recipe. Selections are preserved across re-renders where
// possible; default A→current, B→first library recipe (or current).
function blendSourceOptions() {
  const opts = [{ value: 'current', label: 'Current recipe' }];
  state.library.forEach((r, i) => opts.push({ value: 'lib:' + i, label: r.name }));
  return opts;
}

function renderBlendSources() {
  const opts = blendSourceOptions();
  const html = sel => opts
    .map(o => `<option value="${o.value}"${o.value === sel ? ' selected' : ''}>${escapeHtml(o.label)}</option>`)
    .join('');
  const a = $('#blendA'), b = $('#blendB');
  const prevA = a.value || 'current';
  const prevB = b.value || (state.library.length ? 'lib:0' : 'current');
  a.innerHTML = html(prevA);
  b.innerHTML = html(prevB);
}

function recipeFromSource(value) {
  if (value === 'current') return { name: state.recipe.name || 'Current recipe', lines: state.recipe.lines };
  const m = /^lib:(\d+)$/.exec(value);
  if (m) { const r = state.library[+m[1]]; if (r) return { name: r.name, lines: r.lines }; }
  return null;
}

function runBlend() {
  const wrap = $('#blendResult');
  const A = recipeFromSource($('#blendA').value);
  const B = recipeFromSource($('#blendB').value);
  const n = Math.max(2, Math.min(21, parseInt($('#blendN').value, 10) || 5));
  if (!A || !B) { wrap.innerHTML = '<div class="warnbox">Pick two glazes to blend.</div>'; return; }
  const hasBase = r => r.lines.some(l => !l.additive && (Number(l.amount) || 0) > 0);
  if (!hasBase(A) || !hasBase(B)) {
    wrap.innerHTML = '<div class="warnbox">Both glazes need at least one base material with a positive amount.</div>';
    return;
  }
  const points = lineBlend(A.lines, B.lines, n, state.idx);
  state.blendPoints = points;
  renderBlendMatrix(A, B, points);
}

function renderBlendMatrix(A, B, points) {
  // Union of oxides across all points, in reading order.
  const oxSet = new Set();
  for (const p of points) for (const ox of Object.keys(p.analysis.oxides)) oxSet.add(ox);
  const oxKeys = displayOrder([...oxSet]);
  const hi = { SiO2: 'hi-si', Al2O3: 'hi-al', B2O3: 'hi-b' };

  const header = `<tr><th class="rowlab">Mix (A:B)</th>${points.map(p =>
    `<th>${p.label}</th>`).join('')}</tr>`;

  const oxRows = oxKeys.map(ox => {
    const group = OXIDE_GROUP[ox] || 'other';
    const cells = points.map(p => {
      const o = p.analysis.oxides[ox];
      const v = o ? fmtUmf(o.umf) : '—';
      return `<td class="${hi[ox] || ''}">${v}</td>`;
    }).join('');
    return `<tr class="g-${group}"><td class="rowlab">${fmtOxide(ox)}</td>${cells}</tr>`;
  }).join('');

  const metricRow = (label, fn) =>
    `<tr class="metric"><td class="rowlab">${label}</td>${points.map(p =>
      `<td>${fn(p.analysis)}</td>`).join('')}</tr>`;
  const dash = v => (v == null ? '—' : v);
  const metrics =
    metricRow('SiO₂:Al₂O₃', a => a.ratios.SiO2_Al2O3 == null ? '—' : a.ratios.SiO2_Al2O3) +
    metricRow('SiB:Al', a => dash(a.ratios.SiB_Al2O3)) +
    metricRow('R₂O:RO', a => a.fluxSplit ? `${a.fluxSplit.R2O.toFixed(2)}:${a.fluxSplit.RO.toFixed(2)}` : '—') +
    metricRow('KNaO', a => dash(a.ratios.KNaO)) +
    metricRow('Expansion', a => dash(a.thermalExpansion)) +
    metricRow('LOI %', a => a.loiPct);

  const loadRow = `<tr class="loadrow"><td class="rowlab"></td>${points.map((p, i) =>
    `<td><button class="btn ghost small blend-load" data-i="${i}">Load</button></td>`).join('')}</tr>`;

  const unmatched = [...new Set(points.flatMap(p => p.analysis.unknownMaterials))];
  const warn = unmatched.length
    ? `<div class="warnbox">Unknown material(s) skipped in chemistry: ${unmatched.map(escapeHtml).join(', ')}</div>`
    : '';

  $('#blendResult').innerHTML = `
    <div class="blend-caption">${escapeHtml(A.name)} → ${escapeHtml(B.name)} · ${points.length} points</div>
    <div class="blend-scroll">
      <table class="blend-table">
        <thead>${header}</thead>
        <tbody>${oxRows}${metrics}${loadRow}</tbody>
      </table>
    </div>
    ${warn}
    <p class="note">Fluxes (blue) sum to 1.0 at each point. “Load” drops that blend point into the recipe builder above so you can tweak or export it.</p>`;

  $('#blendResult').querySelectorAll('.blend-load').forEach(el =>
    el.addEventListener('click', e => loadBlendPoint(+e.currentTarget.dataset.i)));
}

function loadBlendPoint(i) {
  const p = state.blendPoints && state.blendPoints[i];
  if (!p) return;
  state.recipe = {
    name: `Blend ${p.label}`,
    lines: p.lines.map(l => ({ material: l.material, amount: l.amount, additive: l.additive })),
  };
  render();
  persist();
  document.querySelector('main').scrollIntoView({ behavior: 'smooth' });
}

function renderLibrary() {
  const wrap = $('#library');
  const hasLib = state.library.length > 0;
  $('#libExportBtn').hidden = !hasLib;
  $('#libClearBtn').hidden = !hasLib;
  if (!hasLib) { wrap.innerHTML = ''; return; }
  const items = state.library.map((rec, i) => {
    const n = rec.lines.filter(l => l.amount > 0).length;
    const flag = rec.unmatched.length
      ? `<span class="lib-flag" title="Unmatched: ${escapeHtml(rec.unmatched.join(', '))}">${rec.unmatched.length} unmatched</span>`
      : '';
    const meta = [rec.code, rec.date].filter(Boolean).join(' · ');
    return `<button class="lib-item" data-i="${i}">
        <span class="lib-name">${escapeHtml(rec.name)}</span>
        <span class="lib-meta">${escapeHtml(meta)} · ${n} material${n === 1 ? '' : 's'} ${flag}</span>
      </button>`;
  }).join('');
  wrap.innerHTML = `<div class="lib-count">${state.library.length} recipes imported — tap to open</div>${items}`;
  wrap.querySelectorAll('.lib-item').forEach(el =>
    el.addEventListener('click', () => loadFromLibrary(+el.dataset.i)));
}

function wireGlobalButtons() {
  $('#xmlFile').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try { importLibrary(reader.result); }
      catch (err) { alert('Import failed: ' + err.message); }
    };
    reader.readAsText(file);
  });
  $('#recipeName').addEventListener('input', e => { state.recipe.name = e.target.value; persist(); });
  $('#sampleBtn').addEventListener('click', () => { loadSample(); render(); persist(); });
  $('#clearBtn').addEventListener('click', () => { state.recipe = { name: 'Untitled Recipe', lines: [] }; render(); persist(); });

  $('#target').addEventListener('change', e => {
    state.target = e.target.value;
    renderAnalysis();
    persist();
  });

  $('#libExportBtn').addEventListener('click', () =>
    download(toInsightLiveXML(state.library), 'vibe-clay-library.xml'));
  $('#libClearBtn').addEventListener('click', () => {
    if (!confirm('Forget the imported library? The recipe in the builder stays.')) return;
    state.library = [];
    renderLibrary();
    renderBlendSources();
    persist();
  });

  $('#blendBtn').addEventListener('click', runBlend);
  $('#pasteBtn').addEventListener('click', loadPastedRecipe);

  $('#exportBtn').addEventListener('click', () => {
    const a = analyzeRecipe(state.recipe.lines, state.idx);
    setIo(JSON.stringify({ recipe: state.recipe, analysis: a }, null, 2));
  });
  $('#xmlBtn').addEventListener('click', () => setIo(toInsightLiveXML(state.recipe)));
  $('#importBtn').addEventListener('click', () => importFromIo($('#io').value));
  $('#downloadBtn').addEventListener('click', () => {
    const xml = toInsightLiveXML(state.recipe);
    download(xml, filenameFor(state.recipe.name) + '.xml');
  });
  $('#copyBtn').addEventListener('click', async () => {
    const text = $('#io').value;
    if (!text) { flash('#copyBtn', 'Nothing to copy'); return; }
    try {
      await navigator.clipboard.writeText(text);
      flash('#copyBtn', 'Copied');
    } catch {
      // Clipboard API needs a secure context and a permission; selecting the
      // text is the honest fallback rather than claiming a copy happened.
      $('#io').select();
      flash('#copyBtn', 'Selected — press copy');
    }
  });
}

// --- Paste import --------------------------------------------------------

function loadPastedRecipe() {
  const text = $('#paste').value;
  const out = $('#pasteResult');
  if (!text.trim()) { out.innerHTML = '<div class="warnbox">Paste a recipe first.</div>'; return; }

  const parsed = parseRecipeText(text, state.db);
  if (!parsed.lines.length) {
    out.innerHTML = `<div class="warnbox">Couldn't find any “material amount” lines in that.
      Each material needs a number on its line.</div>`;
    return;
  }

  state.recipe = { name: parsed.name, lines: parsed.lines };
  render();
  persist();

  const bits = [`Loaded ${parsed.lines.length} line${parsed.lines.length === 1 ? '' : 's'}.`];
  if (parsed.unmatched.length) {
    bits.push(`Not in the materials database, so they're excluded from the chemistry:
      <strong>${parsed.unmatched.map(escapeHtml).join(', ')}</strong>.`);
  }
  if (parsed.skipped.length) {
    bits.push(`Ignored ${parsed.skipped.length} line${parsed.skipped.length === 1 ? '' : 's'} that didn't read as a material:
      <em>${parsed.skipped.slice(0, 5).map(escapeHtml).join(' · ')}</em>${parsed.skipped.length > 5 ? ' …' : ''}.`);
  }
  const cls = parsed.unmatched.length || parsed.skipped.length ? 'warnbox' : 'okbox';
  out.innerHTML = `<div class="${cls}">${bits.join(' ')}</div>`;
  document.querySelector('main').scrollIntoView({ behavior: 'smooth' });
}

// --- Import / export plumbing -------------------------------------------

function setIo(text) {
  $('#io').value = text;
  $('#io').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// One Import button for both formats — sniff which one it got rather than
// making the user pick from a menu on a phone.
function importFromIo(text) {
  const trimmed = text.trim();
  if (!trimmed) { alert('Paste some JSON or Insight-Live XML first.'); return; }
  try {
    if (trimmed.startsWith('<')) {
      const recipes = parseInsightLiveXML(trimmed, state.db);
      if (!recipes.length) throw new Error('no <recipe> elements found');
      state.library = recipes;
      renderLibrary();
      renderBlendSources();
      loadFromLibrary(0);
      return;
    }
    const parsed = JSON.parse(trimmed);
    const r = parsed.recipe || parsed;
    if (!Array.isArray(r.lines)) throw new Error('missing lines[]');
    state.recipe = { ...r, name: r.name || 'Imported' };
    render();
    persist();
  } catch (err) { alert('Could not import: ' + err.message); }
}

function download(text, filename) {
  const blob = new Blob([text], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a moment to start the download before dropping the blob.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const filenameFor = name =>
  (String(name || 'recipe').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'recipe');

// Momentary button feedback — a phone has no hover state and no status bar.
function flash(sel, msg) {
  const el = $(sel);
  const prev = el.textContent;
  el.textContent = msg;
  el.disabled = true;
  setTimeout(() => { el.textContent = prev; el.disabled = false; }, 1400);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

boot().catch(err => { document.body.innerHTML = '<p style="padding:20px">Failed to load: ' + err.message + '</p>'; });
