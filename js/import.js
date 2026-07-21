// Insight-Live recipe-library importer.
//
// Parses the XML that Insight-Live's "Export" produces:
//
//   <recipes version="1.0">
//     <recipe name="G2926B" id="269324" key="advC7niu" date="2026-06-29" codenum="G1" keywords="...">
//       <recipelines>
//         <recipeline material="Ferro Frit 3134" amount="25.400" tolerance=""/>
//         <recipeline material="Red Iron Oxide" amount="10.000" added="true"/>
//       </recipelines>
//       <notes>...</notes>
//     </recipe>
//   </recipes>
//
// -> array of recipes in vibe-clay's data model. Material names are resolved to
// the local database via buildResolver(); unmatched names are kept verbatim and
// flagged so the UI can tell the user what didn't line up.

import { buildResolver } from './chemistry.js';

/**
 * @param {string} xmlString  raw Insight-Live export XML
 * @param {object} db         parsed materials.json (for name resolution)
 * @param {typeof DOMParser} [ParserImpl]  injectable for non-browser tests
 * @returns {Array} recipes
 */
export function parseInsightLiveXML(xmlString, db, ParserImpl) {
  const Parser = ParserImpl || (typeof DOMParser !== 'undefined' ? DOMParser : null);
  if (!Parser) throw new Error('No XML parser available in this environment');

  const doc = new Parser().parseFromString(xmlString, 'application/xml');
  const parseErr = doc.getElementsByTagName('parsererror')[0];
  if (parseErr) throw new Error('Could not parse XML: ' + (parseErr.textContent || '').trim().slice(0, 120));

  const resolve = buildResolver(db);
  const recipeEls = [...doc.getElementsByTagName('recipe')];

  return recipeEls.map(r => {
    const lineEls = [...r.getElementsByTagName('recipeline')];
    const lines = lineEls.map(l => {
      const raw = l.getAttribute('material') || '';
      const canonical = resolve(raw);
      return {
        material: canonical || raw,        // canonical name if matched, else raw
        rawMaterial: raw,                  // what Insight-Live called it
        matched: canonical != null,
        amount: parseFloat(l.getAttribute('amount')) || 0,
        additive: l.getAttribute('added') === 'true',
        tolerance: l.getAttribute('tolerance') || '',
      };
    });

    const unmatched = [...new Set(lines.filter(l => !l.matched && l.amount > 0).map(l => l.rawMaterial))];

    return {
      name: r.getAttribute('name') || 'Untitled',
      id: r.getAttribute('id') || '',
      key: r.getAttribute('key') || '',        // Insight-Live share key
      code: r.getAttribute('codenum') || '',
      keywords: r.getAttribute('keywords') || '',
      date: r.getAttribute('date') || '',
      notes: (textOf(r, 'notes') || '').trim(),
      lines,
      unmatched,
    };
  });
}

function textOf(parent, tag) {
  const el = parent.getElementsByTagName(tag)[0];
  return el ? el.textContent : '';
}

/**
 * Serialise a vibe-clay recipe back to Insight-Live export XML (single recipe or
 * a list), so a round-trip is possible once a write path exists. Uses rawMaterial
 * where available to preserve the names Insight-Live expects.
 */
export function toInsightLiveXML(recipes) {
  const list = Array.isArray(recipes) ? recipes : [recipes];
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const body = list.map(rec => {
    const attrs = [
      `name="${esc(rec.name || 'Untitled')}"`,
      rec.keywords ? `keywords="${esc(rec.keywords)}"` : '',
      rec.id ? `id="${esc(rec.id)}"` : '',
      rec.key ? `key="${esc(rec.key)}"` : '',
      rec.date ? `date="${esc(rec.date)}"` : '',
      rec.code ? `codenum="${esc(rec.code)}"` : '',
    ].filter(Boolean).join(' ');
    const lines = (rec.lines || []).map(l => {
      const name = l.rawMaterial || l.material;
      const added = l.additive ? ' added="true"' : '';
      return `<recipeline material="${esc(name)}" amount="${Number(l.amount).toFixed(3)}"${added}/>`;
    }).join('\n');
    return `<recipe ${attrs}>\n<recipelines>\n${lines}\n</recipelines>\n<notes>${esc(rec.notes || '')}</notes>\n</recipe>`;
  }).join('\n');
  return `<?xml version="1.0"?>\n<recipes version="1.0" encoding="UTF-8">\n${body}\n</recipes>\n`;
}
