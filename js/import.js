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
 * Parse an Insight-Live export. Works in the browser (via DOMParser) and in Node
 * (via a regex reader) so the app and the CLI agree on exactly one definition of
 * the format.
 *
 * @param {string} xmlString  raw Insight-Live export XML
 * @param {object} db         parsed materials.json (for name resolution)
 * @param {typeof DOMParser} [ParserImpl]  force a specific DOM parser
 * @returns {Array} recipes
 */
export function parseInsightLiveXML(xmlString, db, ParserImpl) {
  const Parser = ParserImpl || (typeof DOMParser !== 'undefined' ? DOMParser : null);
  const resolve = buildResolver(db);
  const raw = Parser ? readWithDOM(xmlString, Parser) : readWithRegex(xmlString);
  return raw.map(r => toRecipe(r, resolve));
}

// Shared shape between the two readers: { attrs, lines: [attrs], notes }.
function toRecipe({ attrs, lines: lineAttrs, notes }, resolve) {
  const lines = lineAttrs.map(a => {
    const raw = a.material || '';
    const canonical = resolve(raw);
    return {
      material: canonical || raw,        // canonical name if matched, else raw
      rawMaterial: raw,                  // what Insight-Live called it
      matched: canonical != null,
      amount: parseFloat(a.amount) || 0,
      additive: a.added === 'true',
      tolerance: a.tolerance || '',
    };
  });

  const unmatched = [...new Set(lines.filter(l => !l.matched && l.amount > 0).map(l => l.rawMaterial))];

  return {
    name: attrs.name || 'Untitled',
    id: attrs.id || '',
    key: attrs.key || '',            // Insight-Live share key
    code: attrs.codenum || '',
    keywords: attrs.keywords || '',
    date: attrs.date || '',
    notes: (notes || '').trim(),
    lines,
    unmatched,
  };
}

function readWithDOM(xmlString, Parser) {
  const doc = new Parser().parseFromString(xmlString, 'application/xml');
  const parseErr = doc.getElementsByTagName('parsererror')[0];
  if (parseErr) throw new Error('Could not parse XML: ' + (parseErr.textContent || '').trim().slice(0, 120));

  return [...doc.getElementsByTagName('recipe')].map(r => ({
    attrs: attrsOf(r, ['name', 'id', 'key', 'codenum', 'keywords', 'date']),
    lines: [...r.getElementsByTagName('recipeline')]
      .map(l => attrsOf(l, ['material', 'amount', 'added', 'tolerance'])),
    notes: textOf(r, 'notes'),
  }));
}

const attrsOf = (el, names) =>
  Object.fromEntries(names.map(n => [n, el.getAttribute(n) || '']));

function textOf(parent, tag) {
  const el = parent.getElementsByTagName(tag)[0];
  return el ? el.textContent : '';
}

// Node has no DOMParser. The export format is flat and machine-generated, so a
// reader over it is honest here — it is NOT a general-purpose XML parser and
// shouldn't be used as one.
function readWithRegex(xmlString) {
  const out = [];
  const recipeRe = /<recipe\b([^>]*)>([\s\S]*?)<\/recipe>/g;
  let m;
  while ((m = recipeRe.exec(xmlString))) {
    const body = m[2];
    const lines = [];
    const lineRe = /<recipeline\b([^>]*?)\/?>/g;
    let lm;
    while ((lm = lineRe.exec(body))) lines.push(attrMap(lm[1]));
    const notes = /<notes\b[^>]*>([\s\S]*?)<\/notes>/.exec(body);
    out.push({ attrs: attrMap(m[1]), lines, notes: notes ? unescapeXml(notes[1]) : '' });
  }
  if (!out.length && !/<recipes\b/.test(xmlString)) {
    throw new Error('Could not parse XML: no <recipe> elements found');
  }
  return out;
}

function attrMap(s) {
  const o = {};
  const re = /([\w:-]+)\s*=\s*"([^"]*)"/g;
  let a;
  while ((a = re.exec(s))) o[a[1]] = unescapeXml(a[2]);
  return o;
}

const unescapeXml = s => String(s)
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&amp;/g, '&');

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
