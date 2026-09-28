#!/usr/bin/env node
// Replaces the visible "Documenso" brand with "Docverse" in UI/email source
// strings and in every Lingui catalogue (msgid + msgstr), so existing
// translations keep matching. Package names (@documenso/*), env vars,
// the X-Documenso-Secret header and code identifiers are left untouched.
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const roots = ['apps/remix/app', 'packages/email', 'packages/ui', 'packages/lib', 'packages/trpc'];

const files = execSync(
  `grep -rla "Documenso" ${roots.join(' ')} --include=*.ts --include=*.tsx --include=*.po`,
  { encoding: 'utf8' },
)
  .split('\n')
  .filter(Boolean)
  .filter((file) => !file.endsWith('.test.ts'));

const rules = [
  [/Documenso, Inc\./g, 'Docverse'],
  // Only whole-word, visible brand: not @documenso/, not DOCUMENSO_, not X-Documenso-, not identifiers like isDocumensoCloud.
  [/(?<![@\w-])Documenso(?![\w-])/g, 'Docverse'],
];

let changed = 0;

for (const file of files) {
  const before = readFileSync(file, 'utf8');
  let after = before;

  for (const [pattern, replacement] of rules) {
    after = after.replace(pattern, replacement);
  }

  if (after !== before) {
    writeFileSync(file, after);
    changed += 1;
    console.log(`rebranded ${file}`);
  }
}

console.log(`${changed} files changed`);
