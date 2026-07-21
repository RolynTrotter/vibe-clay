// vibe-clay app — recipe builder + live glaze analysis. Vanilla ES modules.
import { analyzeRecipe, indexMaterials, displayOrder, OXIDE_GROUP } from './chemistry.js';
import { parseInsightLiveXML } from './import.js';

const state = {
  db: null,
  idx: null,
  library: [],       // recipes imported from an Insight-Live export
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
  wireGlobalButtons();
}

function loadSample() {
  state.recipe = {
    name: 'Leadless Gloss (sample)',
    lines: [
      { material: 'Custer Feldspar (Potash)', amount: 40 },
      { material: 'Silica (Quartz)', amount: 20 },
      { material: 'Whiting (Calcium Carbonate)', amount: 20 },
      { material: 'Kaolin (EPK)', amount: 20 },
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

function renderLines() {
  const wrap = $('#lines');
  wrap.innerHTML = '';
  state.recipe.lines.forEach((line, i) => {
    const div = document.createElement('div');
    div.className = 'row';
    div.innerHTML = `
      <select class="mat" data-i="${i}" aria-label="Material">${materialOptions(line.material)}</select>
      <input class="amt" data-i="${i}" type="number" inputmode="decimal" min="0" step="0.1"
             value="${line.amount}" aria-label="Amount in grams" />
      <button class="del" data-i="${i}" title="Remove" aria-label="Remove line">×</button>`;
    wrap.appendChild(div);
  });

  wrap.querySelectorAll('select.mat').forEach(el =>
    el.addEventListener('change', e => { state.recipe.lines[+e.target.dataset.i].material = e.target.value; renderAnalysis(); }));
  wrap.querySelectorAll('input.amt').forEach(el =>
    el.addEventListener('input', e => { state.recipe.lines[+e.target.dataset.i].amount = parseFloat(e.target.value) || 0; renderAnalysis(); }));
  wrap.querySelectorAll('button.del').forEach(el =>
    el.addEventListener('click', e => { state.recipe.lines.splice(+e.target.dataset.i, 1); renderLines(); renderAnalysis(); }));
}

function renderAnalysis() {
  const a = analyzeRecipe(state.recipe.lines, state.idx);

  // Stats grid
  const exp = a.thermalExpansion == null ? '—' : a.thermalExpansion;
  const ratio = a.ratios.SiO2_Al2O3 == null ? '—' : a.ratios.SiO2_Al2O3;
  $('#stats').innerHTML = `
    ${stat('SiO₂ : Al₂O₃', ratio, 'molar ratio')}
    ${stat('Expansion', exp, 'rel. (compare only)')}
    ${stat('Batch LOI', a.loiPct + '%', 'loss on firing')}
    ${stat('Batch', a.batchGrams + ' g', 'raw → ' + a.firedGrams + ' g fired')}`;

  // UMF table
  const keys = displayOrder(Object.keys(a.oxides));
  const rows = keys.map(ox => {
    const o = a.oxides[ox];
    return `<tr class="g-${o.group}">
      <td>${fmtOxide(ox)}</td>
      <td>${o.umf.toFixed(3)}</td>
      <td>${o.weightPct.toFixed(2)}</td>
      <td>${o.molePct.toFixed(2)}</td></tr>`;
  }).join('');
  $('#umf').innerHTML = `
    <thead><tr><th>Oxide</th><th>UMF</th><th>Weight %</th><th>Mole %</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="4" style="text-align:center;color:var(--muted)">Add materials to see analysis</td></tr>'}</tbody>`;

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
  if (recipes.length) loadFromLibrary(0);
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
  $('#addLine').addEventListener('click', () => {
    state.recipe.lines.push({ material: state.db.materials[0].name, amount: 0 });
    renderLines(); renderAnalysis();
  });
  $('#sampleBtn').addEventListener('click', () => { loadSample(); render(); });
  $('#clearBtn').addEventListener('click', () => { state.recipe = { name: 'Untitled Recipe', lines: [] }; render(); });

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
