#!/usr/bin/env node
// Package the vibe-clay skill for distribution.
//
// Assembles dist/vibe-clay/ from the repo (SKILL.md + the chemistry engine, the
// materials data, the CLI, and the other skills as reference docs) and zips it
// into dist/vibe-clay-<version>.zip, ready to upload as a custom skill.
//
//   node tools/build-skill.mjs            build + zip
//   node tools/build-skill.mjs --check    only verify the version is in sync
//   node tools/build-skill.mjs --no-zip   build dist/vibe-clay/ and stop
//
// The bundle keeps the repo's directory layout (js/, data/, tools/) so every
// command in SKILL.md is the same command that works in a clone.

import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKILL_SRC = join(ROOT, 'skills/vibe-clay');
const DIST = join(ROOT, 'dist');
const OUT = join(DIST, 'vibe-clay');

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const noZip = args.includes('--no-zip');

const read = p => readFileSync(join(ROOT, p), 'utf8');
const pkg = JSON.parse(read('package.json'));
const VERSION = pkg.version;

// --- version must be in sync everywhere it's user-visible ---------------------
// package.json is the source of truth; these three carry a copy for people who
// only ever see the skill, the app, or the changelog.
function checkVersion() {
  const problems = [];
  const expect = (label, file, re) => {
    const found = read(file).match(re)?.[1];
    if (found !== VERSION) problems.push(`${label} (${file}): ${found ?? 'not found'} — expected ${VERSION}`);
  };
  expect('skill frontmatter', 'skills/vibe-clay/SKILL.md', /^\s+version:\s*"([^"]+)"/m);
  expect('app footer', 'index.html', /id="version"[^>]*>v([\d][^<\s]*)/);
  expect('changelog', 'CHANGELOG.md', /^##\s*\[?v?([\d][^\]\s]*)/m);

  if (problems.length) {
    console.error(`✗ version out of sync with package.json (${VERSION}):`);
    for (const p of problems) console.error(`  - ${p}`);
    console.error('\nBump every copy, then rebuild.');
    process.exit(1);
  }
  console.log(`✓ version ${VERSION} in sync (package.json, SKILL.md, index.html, CHANGELOG.md)`);
}

checkVersion();
if (checkOnly) process.exit(0);

// --- assemble -----------------------------------------------------------------
rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'references'), { recursive: true });

// The engine, its data, and the CLI, at their repo paths so analyze.mjs resolves
// '../js/chemistry.js' and 'data/materials.json' unchanged.
const FILES = [
  'js/chemistry.js',
  'js/import.js',
  'js/limits.js',
  'js/paste-import.js',
  'data/materials.json',
  'data/glaze-limits.json',
  'tools/analyze.mjs',
];
for (const f of FILES) {
  mkdirSync(join(OUT, dirname(f)), { recursive: true });
  cpSync(join(ROOT, f), join(OUT, f));
}
cpSync(join(SKILL_SRC, 'SKILL.md'), join(OUT, 'SKILL.md'));

// The bundle needs its own package.json: js/*.js are ES modules, and without
// "type": "module" Node < 22 refuses to import them from analyze.mjs.
writeFileSync(join(OUT, 'package.json'), JSON.stringify({
  name: 'vibe-clay-skill',
  version: VERSION,
  type: 'module',
  private: true,
  description: 'Bundled chemistry engine for the vibe-clay skill.',
}, null, 2) + '\n');

// The repo's other skills become the bundle's reference docs. Frontmatter is
// stripped (they're documents here, not separately-installed skills) and
// cross-references to skills/<name>/SKILL.md are rewritten to references/<name>.md.
const REFERENCES = ['glaze-qa', 'draft-recipe', 'insight-live-navigator'];
for (const name of REFERENCES) {
  const src = read(`skills/${name}/SKILL.md`);
  const body = src.replace(/^---\n[\s\S]*?\n---\n/, '').trimStart();
  const rewritten = body
    .replace(/skills\/([a-z-]+)\/SKILL\.md/g, 'references/$1.md')
    .replace(/`(glaze-qa|draft-recipe|insight-live-navigator)`/g, '`references/$1.md`');
  writeFileSync(join(OUT, 'references', `${name}.md`),
    `<!-- Bundled from the vibe-clay repo skill "${name}" (v${VERSION}). -->\n\n${rewritten}`);
}

// --- zip ----------------------------------------------------------------------
// One top-level vibe-clay/ folder inside the zip, which is what skill uploads
// expect. Built with the `zip` CLI; if it's missing, dist/vibe-clay/ is still
// there to compress by hand.
const zipPath = join(DIST, `vibe-clay-${VERSION}.zip`);
if (!noZip) {
  rmSync(zipPath, { force: true });
  try {
    execFileSync('zip', ['-qr', zipPath, 'vibe-clay', '-x', '.*'], { cwd: DIST });
  } catch (err) {
    console.error(`\n⚠ couldn't run \`zip\` (${err.code || err.message}).`);
    console.error(`  ${OUT} is built — compress that folder yourself to get the same result.`);
    process.exit(1);
  }
}

// --- report -------------------------------------------------------------------
const listing = execFileSync('find', [OUT, '-type', 'f'], { encoding: 'utf8' })
  .trim().split('\n').map(p => p.slice(OUT.length + 1)).sort();
console.log(`\nvibe-clay skill v${VERSION}`);
for (const f of listing) console.log(`  ${f}`);
if (!noZip) console.log(`\n→ ${zipPath.slice(ROOT.length + 1)}  (upload this)`);
else console.log(`\n→ ${OUT.slice(ROOT.length + 1)}/  (--no-zip)`);
