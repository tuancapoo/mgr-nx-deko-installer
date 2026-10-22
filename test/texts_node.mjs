// Checks the interface texts: every language has every English key, the same {placeholders}, and HTML that opens
// and closes the same tags as the English text.
// Usage: node test/texts_node.mjs
import { LANGUAGES, getLanguage, setLanguage, t } from '../lib/i18n.js';
import fs from 'node:fs';
import path from 'node:path';
import { root } from './node_files.mjs';

const source = fs.readFileSync(path.join(root, 'lib/i18n.js'), 'utf8');
const keys = [...source.slice(source.indexOf('  en: {'), source.indexOf('\n  },', source.indexOf('  en: {')))
  .matchAll(/^ {4}'?([\w.]+)'?:/gm)].map((m) => m[1]);
const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
const tags = (text) => [...text.matchAll(/<\/?(\w+)/g)].map((m) => m[0]).sort().join(',');
let bad = 0;
setLanguage('en');
const english = Object.fromEntries(keys.map((k) => [k, t(k)]));
for (const { code } of LANGUAGES) {
  if (setLanguage(code) !== code || getLanguage() !== code) {
    console.log(`${code}: no texts`);
    bad++;
    continue;
  }
  const block = source.slice(source.indexOf(`  ${code}: {`), source.indexOf('\n  },', source.indexOf(`  ${code}: {`)));
  for (const key of keys) {
    if (!new RegExp(`^ {4}'?${key.replace('.', '\\.')}'?:`, 'm').test(block)) {
      console.log(`${code}: missing ${key}`);
      bad++;
      continue;
    }
    const text = t(key);
    if (placeholders(text) !== placeholders(english[key])) {
      console.log(`${code}: ${key} has {${placeholders(text)}} instead of {${placeholders(english[key])}}`);
      bad++;
    }
    if (tags(text) !== tags(english[key])) {
      console.log(`${code}: ${key} has the tags ${tags(text)} instead of ${tags(english[key])}`);
      bad++;
    }
  }
}
console.log(`${LANGUAGES.length} languages, ${keys.length} keys: ${bad ? `${bad} problems` : 'all complete'}`);
process.exit(bad ? 1 : 0);
