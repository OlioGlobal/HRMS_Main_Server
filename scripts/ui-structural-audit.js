/**
 * Structural UI audit — heuristics for two "renders empty" bug classes:
 *
 *  A) Empty action column: a static "Actions" header that is NOT guarded at the
 *     column level, while every row action is wrapped in can(...). For a role
 *     lacking those permissions the column header shows with no buttons under it
 *     (the Holidays bug).
 *
 *  B) Blank dropdown: a <select> whose only children come from {x.map(...)} with
 *     no static placeholder <option> — renders empty when the list is empty.
 *
 * These are HEURISTICS → review candidates, not confirmed bugs. Read-only.
 * Run:  node scripts/ui-structural-audit.js
 */
const fs   = require('fs');
const path = require('path');

const FRONTEND = path.resolve(__dirname, '..', '..', 'frontend', 'src');
const rel = (f) => path.relative(FRONTEND, f).replace(/\\/g, '/');
const lineOf = (text, idx) => text.slice(0, idx).split('\n').length;

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.next') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else if (/\.(tsx|jsx)$/.test(e.name)) files.push(full);
  }
})(FRONTEND);

// A guard identifier means the author already toggles the column/section.
const GUARD_ID = /\b(show|has|any|can|is)[A-Za-z]*(Actions?|Col|Manage|Menu|Ops|Row)\b/i;
const ACTION_HEADER = />\s*(Actions?|Manage)\s*<\/(span|th|TableHead|div|p)>|<TableHead[^>]*>\s*Actions?\s*</gi;

const colCandidates = [];
const dropdownCandidates = [];

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const hasCan = /\bcan\(/.test(text);
  const hasGuard = GUARD_ID.test(text);

  // ── A) action-column headers ──
  let m;
  ACTION_HEADER.lastIndex = 0;
  while ((m = ACTION_HEADER.exec(text))) {
    const line = lineOf(text, m.index);
    const lineText = text.split('\n')[line - 1];
    // header rendered conditionally on the same line → considered safe
    const conditionallyRendered = /\{[^}]*&&/.test(lineText) || /\?\s*[\(<]/.test(lineText);
    if (conditionallyRendered) continue;
    // risky only if the row actions are permission-gated AND no column guard exists
    if (hasCan && !hasGuard) {
      colCandidates.push({ file: rel(file), line, header: lineText.trim().slice(0, 70) });
    }
  }

  // ── B) <select> fed only by .map with no placeholder <option> ──
  const selectRe = /<select\b[\s\S]*?<\/select>/g;
  let s;
  while ((s = selectRe.exec(text))) {
    const block = s[0];
    if (!/\.map\(/.test(block)) continue;             // not data-driven
    if (/<option[^>]*value=(["'])\1/.test(block)) continue; // has empty placeholder → shows something
    if (/<option[^>]*value=["']["']/.test(block)) continue;
    if (/<option(?![^>]*\{)/.test(block)) continue;   // has at least one static <option ...>text
    dropdownCandidates.push({ file: rel(file), line: lineOf(text, s.index) });
  }
}

console.log('\n=== UI STRUCTURAL AUDIT (heuristic — review candidates) ===');
console.log(`Files scanned (tsx/jsx): ${files.length}`);

console.log(`\n🟠 A) Unguarded "Actions" columns with permission-gated rows: ${colCandidates.length}`);
console.log('   (header always renders; buttons are can()-gated → empty column for roles without the permission)');
for (const c of colCandidates) console.log(`     - ${c.file}:${c.line}   ${c.header}`);
if (!colCandidates.length) console.log('     none 🎉');

console.log(`\n🟡 B) Dropdowns fed by .map() with no placeholder <option>: ${dropdownCandidates.length}`);
console.log('   (renders blank when the source list is empty)');
for (const c of dropdownCandidates) console.log(`     - ${c.file}:${c.line}`);
if (!dropdownCandidates.length) console.log('     none 🎉');

console.log('');
