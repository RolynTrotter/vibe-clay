#!/usr/bin/env node
// Check that the built skill zip is actually uploadable and actually works.
//
//   npm run build:skill && npm run test:skill
//
// Three things go wrong with a skill bundle, and all three are silent until an
// upload is rejected or a chat gives a wrong answer:
//   1. the zip's shape (one top-level folder, exactly one SKILL.md)
//   2. the frontmatter (name/description rules the uploader enforces)
//   3. a file that didn't make it in, so the engine can't run
// So this unzips the real artifact somewhere else and runs it from there.

import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
const ZIP = join(ROOT, 'dist', `vibe-clay-${VERSION}.zip`);

let failed = 0;
const ok = m => console.log(`  ✓ ${m}`);
const bad = m => { console.error(`  ✗ ${m}`); failed++; };
const check = (cond, m, detail) => cond ? ok(m) : bad(detail ? `${m} — ${detail}` : m);

// --- the zip's shape ----------------------------------------------------------
console.log(`\nvibe-clay skill v${VERSION} — packaging`);
let entries;
try {
  entries = execFileSync('unzip', ['-Z1', ZIP], { encoding: 'utf8' })
    .trim().split('\n').filter(Boolean);
} catch {
  console.error(`  ✗ no zip at dist/vibe-clay-${VERSION}.zip — run \`npm run build:skill\` first`);
  process.exit(1);
}
const files = entries.filter(e => !e.endsWith('/'));

// The uploader rejects a zip with more than one SKILL.md, which is what you get
// by zipping the repo instead of building — the other skills come along.
const skillMds = files.filter(f => f.endsWith('SKILL.md'));
check(skillMds.length === 1, 'exactly one SKILL.md', `found ${skillMds.length}: ${skillMds.join(', ')}`);
check(skillMds[0] === 'vibe-clay/SKILL.md', 'SKILL.md sits in a top-level vibe-clay/ folder', skillMds[0]);
const roots = new Set(entries.map(e => e.split('/')[0]));
check(roots.size === 1 && roots.has('vibe-clay'), 'one top-level folder, named for the skill', [...roots].join(', '));
check(!files.some(f => f.split('/').pop().startsWith('.')), 'no dotfiles or macOS junk');

for (const needed of ['vibe-clay/tools/analyze.mjs', 'vibe-clay/js/chemistry.js',
                      'vibe-clay/data/materials.json', 'vibe-clay/data/glaze-limits.json',
                      'vibe-clay/package.json']) {
  check(files.includes(needed), `bundles ${needed.replace('vibe-clay/', '')}`);
}

// --- frontmatter the uploader validates ---------------------------------------
console.log('\nfrontmatter');
const skillMd = execFileSync('unzip', ['-p', ZIP, 'vibe-clay/SKILL.md'], { encoding: 'utf8' });
const fm = skillMd.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? '';
const field = k => fm.match(new RegExp(`^${k}:\\s*(.*)$`, 'm'))?.[1]?.trim() ?? '';
const name = field('name'), description = field('description');

check(/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) && name.length <= 64,
  'name is lowercase, hyphenated, ≤64 chars', name);
check(name === 'vibe-clay', 'name matches the folder name', name);
check(!/anthropic|claude/i.test(name), 'name avoids the reserved words', name);
check(description.length > 0 && description.length <= 1024,
  'description is 1–1024 chars', `${description.length} chars`);
check(!/[<>]/.test(name + description), 'no XML tags in name or description');
check(fm.includes(`version: "${VERSION}"`), `frontmatter carries version ${VERSION}`);

// --- does it run, unpacked, from somewhere else? -------------------------------
console.log('\nengine, run from the unzipped bundle');
const tmp = mkdtempSync(join(tmpdir(), 'vibe-clay-skill-'));
try {
  execFileSync('unzip', ['-q', ZIP, '-d', tmp]);
  const cli = join(tmp, 'vibe-clay/tools/analyze.mjs');
  const run = (args, stdin) =>
    execFileSync('node', [cli, ...args], { input: stdin, encoding: 'utf8', cwd: tmpdir() });

  // A recipe whose numbers we know. If the chemistry ever moves, this fails and
  // someone has to say so out loud in the changelog.
  const recipe = JSON.stringify({ name: 'smoke', lines: [
    { material: 'Custer Feldspar', amount: 40 },
    { material: 'Silica', amount: 25 },
    { material: 'Whiting', amount: 20 },
    { material: 'EPK', amount: 15 },
    { material: 'Red Iron Oxide', amount: 1.5, additive: true },
  ]});

  const analysis = run(['--target', 'cone6-glossy'], recipe);
  check(analysis.includes('Si:Al 8.1'), 'Si:Al 8.1');
  check(analysis.includes('R2O:RO 0.23:0.77'), 'R2O:RO 0.23:0.77');
  check(analysis.includes('expansion 7.73'), 'expansion 7.73');
  check(analysis.includes('Al2O3  0.462'), 'Al2O3 0.462 in the UMF');
  check(analysis.includes('CaO 0.766 above 0.7'), 'flags high CaO against cone6-glossy');
  check(!analysis.includes('unmatched'), 'every material resolved', analysis.match(/⚠ unmatched.*/)?.[0]);

  const xml = run(['--xml'], recipe);
  check(xml.includes('<recipeline material="Custer Feldspar"'), 'emits Insight-Live XML');
  check(xml.includes('added="true"'), 'marks additions in the XML');

  const blend = run(['--blend', '3'], JSON.stringify([
    { name: 'A', lines: [{ material: 'Custer Feldspar', amount: 50 }, { material: 'Silica', amount: 50 }] },
    { name: 'B', lines: [{ material: 'EPK', amount: 40 }, { material: 'Whiting', amount: 60 }] },
  ]));
  check(/100:0\s+50:50\s+0:100/.test(blend), 'line-blends two recipes');
} catch (err) {
  bad(`the bundled CLI threw: ${err.stderr?.toString().trim() || err.message}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log(failed ? `\n✗ ${failed} check${failed > 1 ? 's' : ''} failed` : '\n✓ zip is uploadable and the engine runs');
process.exit(failed ? 1 : 0);
