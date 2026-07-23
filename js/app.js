// vibe-clay app — recipe builder + live glaze analysis. Vanilla ES modules.
import { analyzeRecipe, lineBlend, indexMaterials, displayOrder, OXIDE_GROUP } from './chemistry.js';
import { parseInsightLiveXML } from './import.js';

const state = {
  db: null,
  idx: null,
  library: [],       // recipes imported from an Insight-Live export
  blendPoints: null, // last computed line-blend points (for the Load buttons)
  recipe: {
    name: 'Untitled Recipe',
    lines: [],       // { material, amount, additive }
  },
};

const $ = (sel, root = document) => root.querySelector(sel);

async function boot() {
  const res = await fetch('./data/materials.json');
  state.db = await res.json();
  state.idx = indexMaterials(state.db);
  loadSample();
  render();
  renderBlendSources();
  wireGlobalButtons();
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
  renderLines();
  renderAnalysis();
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
    el.addEventListener('change', e => { state.recipe.lines[+e.target.dataset.i].material = e.target.value; renderAnalysis(); }));
  wrap.querySelectorAll('input.amt').forEach(el =>
    el.addEventListener('input', e => { state.recipe.lines[+e.target.dataset.i].amount = parseFloat(e.target.value) || 0; renderAnalysis(); }));
  wrap.querySelectorAll('button.tog').forEach(el =>
    el.addEventListener('click', e => { const l = state.recipe.lines[+e.currentTarget.dataset.i]; l.additive = !l.additive; renderLines(); renderAnalysis(); }));
  wrap.querySelectorAll('button.del').forEach(el =>
    el.addEventListener('click', e => { state.recipe.lines.splice(+e.currentTarget.dataset.i, 1); renderLines(); renderAnalysis(); }));
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
      <td class="${hi[ox] || ''}">${o.umf.toFixed(3)}</td>
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
}

const stat = (k, v, u) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div><div class="u">${u}</div></div>`;
const fmtOxide = ox => ox.replace(/(\d)/g, '<sub>$1</sub>');

function loadFromLibrary(i) {
  const rec = state.library[i];
  if (!rec) return;
  state.recipe = {
    name: rec.name,
    lines: rec.lines.map(l => ({ material: l.material, amount: l.amount, additive: l.additive })),
  };
  render();
  document.querySelector('main').scrollIntoView({ behavior: 'smooth' });
}

function importLibrary(xmlText) {
  const recipes = parseInsightLiveXML(xmlText, state.db);
  state.library = recipes;
  renderLibrary();
  renderBlendSources();
  if (recipes.length) loadFromLibrary(0);
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
      const v = o ? o.umf.toFixed(3) : '—';
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
  document.querySelector('main').scrollIntoView({ behavior: 'smooth' });
}

function renderLibrary() {
  const wrap = $('#library');
  if (!state.library.length) { wrap.innerHTML = ''; return; }
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
  $('#recipeName').addEventListener('input', e => { state.recipe.name = e.target.value; });
  $('#sampleBtn').addEventListener('click', () => { loadSample(); render(); });
  $('#clearBtn').addEventListener('click', () => { state.recipe = { name: 'Untitled Recipe', lines: [] }; render(); });

  $('#blendBtn').addEventListener('click', runBlend);

  $('#exportBtn').addEventListener('click', () => {
    const a = analyzeRecipe(state.recipe.lines, state.idx);
    $('#io').value = JSON.stringify({ recipe: state.recipe, analysis: a }, null, 2);
    $('#io').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  $('#importBtn').addEventListener('click', () => {
    try {
      const parsed = JSON.parse($('#io').value);
      const r = parsed.recipe || parsed;
      if (!Array.isArray(r.lines)) throw new Error('missing lines[]');
      state.recipe = { name: r.name || 'Imported', lines: r.lines };
      render();
    } catch (err) { alert('Could not import: ' + err.message); }
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

boot().catch(err => { document.body.innerHTML = '<p style="padding:20px">Failed to load: ' + err.message + '</p>'; });
