/**
 * Static RBAC audit — finds frontend permission gates that can NEVER be true.
 *
 * A control gated on a permission key the backend never seeds is dead UI:
 * the button / column / dropdown is invisible for every role (the classic
 * "empty Actions column" bug). This cross-checks every can()/scope()/permission:
 * usage in the frontend against the seeded permission list.
 *
 * Read-only. Run:  node scripts/rbac-audit.js
 */
const fs   = require('fs');
const path = require('path');

const { PERMISSIONS } = require('../src/seeders/permissions.seeder');
const VALID = new Set(PERMISSIONS.map((p) => `${p.module}:${p.action}`));

const FRONTEND = path.resolve(__dirname, '..', '..', 'frontend', 'src');

// ── collect frontend source files ──
const files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) files.push(full);
  }
})(FRONTEND);

// ── extractors ──
const PATTERNS = [
  { kind: 'can',        re: /\bcan\(\s*(['"])([a-z_]+)\1\s*,\s*(['"])([a-z_]+)\3\s*\)/g,        mod: 2, act: 4 },
  { kind: 'scope',      re: /\bscope\(\s*(['"])([a-z_]+)\1\s*,\s*(['"])([a-z_]+)\3\s*\)/g,      mod: 2, act: 4 },
  { kind: 'permission', re: /permission:\s*(['"])([a-z_]+):([a-z_]+)\1/g,                        mod: 2, act: 3 },
];
// non-literal usages we cannot statically verify
const DYNAMIC_RE = /\b(?:can|scope)\(\s*(?!['"])/g;

const invalid = new Map();   // key -> [{file,line}]
const dynamic = [];          // {file,line,snippet}
let validCount = 0;
const usedValid = new Set();

const rel = (f) => path.relative(FRONTEND, f).replace(/\\/g, '/');
const lineOf = (text, idx) => text.slice(0, idx).split('\n').length;

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');

  for (const p of PATTERNS) {
    p.re.lastIndex = 0;
    let m;
    while ((m = p.re.exec(text))) {
      const key = `${m[p.mod]}:${m[p.act]}`;
      if (VALID.has(key)) { validCount++; usedValid.add(key); }
      else {
        if (!invalid.has(key)) invalid.set(key, []);
        invalid.get(key).push({ file: rel(file), line: lineOf(text, m.index) });
      }
    }
  }

  DYNAMIC_RE.lastIndex = 0;
  let d;
  while ((d = DYNAMIC_RE.exec(text))) {
    const line = lineOf(text, d.index);
    const snippet = text.split('\n')[line - 1].trim().slice(0, 80);
    dynamic.push({ file: rel(file), line, snippet });
  }
}

// ── report ──
console.log('\n=== RBAC STATIC AUDIT ===');
console.log(`Seeded permission keys: ${VALID.size}`);
console.log(`Frontend source files scanned: ${files.length}`);
console.log(`Valid permission gates found: ${validCount} (distinct: ${usedValid.size})`);

console.log(`\n❌ INVALID gates (used in frontend, NOT seeded → dead UI): ${invalid.size}`);
if (invalid.size === 0) console.log('   none 🎉');
for (const [key, locs] of [...invalid.entries()].sort()) {
  console.log(`\n  ${key}   (${locs.length} usage${locs.length > 1 ? 's' : ''})`);
  const near = VALID.has(key.split(':')[0] + ':view')
    ? `module '${key.split(':')[0]}' exists — check the action`
    : `module '${key.split(':')[0]}' is NOT a seeded module — likely a typo`;
  console.log(`     hint: ${near}`);
  for (const l of locs.slice(0, 8)) console.log(`     - ${l.file}:${l.line}`);
  if (locs.length > 8) console.log(`     … +${locs.length - 8} more`);
}

console.log(`\n⚠️  DYNAMIC gates (can/scope called with a variable — not statically verifiable): ${dynamic.length}`);
for (const d of dynamic.slice(0, 15)) console.log(`     - ${d.file}:${d.line}   ${d.snippet}`);
if (dynamic.length > 15) console.log(`     … +${dynamic.length - 15} more`);

// seeded-but-never-used (informational)
const unused = [...VALID].filter((k) => !usedValid.has(k)).sort();
console.log(`\nℹ️  Seeded but never gated in frontend: ${unused.length} (informational)`);

console.log('');
process.exit(invalid.size > 0 ? 1 : 0);
