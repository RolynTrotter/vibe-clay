// Paste-import: free-text recipe -> vibe-clay data model.
//
// Potters copy recipes out of Insight-Live, out of a book, off a forum post, or
// out of their own notes app. The formats vary wildly but they're all the same
// idea: a material name and an amount, one per line, sometimes with a colorant
// section underneath. This parses the shapes that actually show up:
//
//   Custer Feldspar 40          trailing amount (most common)
//   40 Custer Feldspar          leading amount
//   Custer Feldspar .... 40.0   dot leaders (Insight-Live print view)
//   Silica<TAB>20               tab/multi-space separated
//   EPK: 20                     colon separated
//   + Red Iron Oxide 2          leading "+" marks an addition
//
// A line reading "Additions", "Colorants", "Added" (etc.) switches everything
// after it to additive. "Total 100" lines are dropped. The first line with no
// amount, before any material, is taken as the recipe name.
//
// Nothing here throws on a weird line — unparseable lines come back in
// `.skipped` so the UI can show the user exactly what it ignored rather than
// silently losing part of their recipe.

import { buildResolver } from './chemistry.js';

// Lines that flip us into the additions section.
const ADDITION_HEADING = /^[\s*_-]*(additions?|addition\s*s?|colou?rants?|colou?ring\s+oxides?|added|add\b|opacifiers?|stains?)\b[\s:_-]*$/i;
// Lines that are totals/subtotals, not materials.
const TOTAL_LINE = /^[\s*_-]*(sub\s*)?totals?\b/i;
// Lines that are a base-recipe heading, not a material.
const BASE_HEADING = /^[\s*_-]*(base|base\s+recipe|recipe|materials?|batch)\b[\s:_-]*$/i;

/**
 * Parse pasted recipe text.
 *
 * @param {string} text  whatever the user pasted
 * @param {object} db    parsed materials.json, for name resolution
 * @returns {{name: string, lines: Array, unmatched: string[], skipped: string[]}}
 */
export function parseRecipeText(text, db) {
  const resolve = buildResolver(db);
  const rawLines = String(text || '').split(/\r?\n/);

  let name = '';
  let additive = false;
  let sawMaterial = false;
  const lines = [];
  const skipped = [];

  for (const raw of rawLines) {
    const line = raw.trim();
    if (!line) continue;

    if (ADDITION_HEADING.test(line)) { additive = true; continue; }
    if (BASE_HEADING.test(line)) { additive = false; continue; }
    if (TOTAL_LINE.test(line)) continue;

    // A leading "+" is an explicit per-line addition marker.
    let body = line;
    let lineAdditive = additive;
    if (/^\+\s*/.test(body)) { lineAdditive = true; body = body.replace(/^\+\s*/, ''); }

    const parsed = parseLine(body);
    if (!parsed) {
      // No amount found. If nothing has been parsed yet this is the title.
      if (!sawMaterial && !name) { name = stripDecoration(body); continue; }
      skipped.push(line);
      continue;
    }

    const canonical = resolve(parsed.material);
    // "fire to cone 6" parses as material "fire to cone", amount 6. A line that
    // both fails to resolve AND reads like prose is a note, not a material.
    if (!canonical && looksLikeProse(parsed.material)) { skipped.push(line); continue; }

    lines.push({
      material: canonical || parsed.material,
      rawMaterial: parsed.material,
      matched: canonical != null,
      amount: parsed.amount,
      additive: lineAdditive,
    });
    sawMaterial = true;
  }

  const unmatched = [...new Set(lines.filter(l => !l.matched && l.amount > 0).map(l => l.rawMaterial))];
  return { name: name || 'Pasted Recipe', lines, unmatched, skipped };
}

/**
 * Pull a (material, amount) pair out of one line, or null if there isn't one.
 * Tries trailing-amount first since that's overwhelmingly the common form; falls
 * back to leading-amount.
 */
function parseLine(body) {
  // Trailing amount: "Custer Feldspar .... 40.0" / "Silica  20" / "EPK: 20%"
  let m = /^(.*?)[\s.:·—–-]*(\d+(?:[.,]\d+)?)\s*%?\s*$/.exec(body);
  if (m && m[1].trim()) {
    const material = stripDecoration(m[1]);
    if (material) return { material, amount: toNumber(m[2]) };
  }

  // Leading amount: "40 Custer Feldspar" / "40.0  Silica"
  m = /^(\d+(?:[.,]\d+)?)\s*%?[\s.:·—–-]+(.+?)\s*$/.exec(body);
  if (m && m[2].trim()) {
    const material = stripDecoration(m[2]);
    if (material) return { material, amount: toNumber(m[1]) };
  }

  return null;
}

// Strip dot leaders, trailing/leading punctuation and bullet characters that
// come along with copied text, without touching names like "Frit 3134" or
// "Alberta Slip 1000F".
function stripDecoration(s) {
  return String(s)
    .replace(/^[\s*•·—–>-]+/, '')
    .replace(/[\s.:·—–-]+$/, '')
    .replace(/\.{2,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const toNumber = s => parseFloat(String(s).replace(',', '.')) || 0;

// Words that open a firing/process note rather than name a material. Only
// consulted for names that didn't resolve in the database, so a real material
// that happens to start with one of these still wins.
const PROSE_OPENERS = new Set([
  'fire', 'fired', 'firing', 'hold', 'held', 'soak', 'ramp', 'cool', 'cooled',
  'heat', 'bisque', 'glaze', 'glazed', 'dip', 'dipped', 'spray', 'sprayed',
  'brush', 'brushed', 'apply', 'applied', 'mix', 'mixed', 'sieve', 'sieved',
  'add', 'added', 'use', 'used', 'see', 'note', 'notes', 'test', 'tested',
  'reduction', 'oxidation', 'cone', 'temp', 'temperature', 'thickness',
  'to', 'at', 'for', 'from', 'with', 'in', 'on', 'then', 'and', 'or', 'this',
  'water', 'specific',
]);

/**
 * True if an unresolved name reads like a sentence rather than a material.
 * Deliberately conservative: an unknown two-word name is far more likely to be a
 * local material we don't stock ("Mystery Ash") than a note, and flagging it as
 * unmatched tells the user something useful. Prose gets skipped instead.
 */
function looksLikeProse(nameText) {
  const words = String(nameText).trim().split(/\s+/);
  if (!words.length) return true;
  if (PROSE_OPENERS.has(words[0].toLowerCase())) return true;
  // Four-plus words with no capitalised word at all reads as a sentence.
  return words.length >= 4 && !words.some(w => /^[A-Z]/.test(w));
}
