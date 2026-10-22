// node test/cpk_node.mjs <game folder>: the shader containers lib/cpk.js and lib/deko3d.js find in media/data000.cpk.
import crypto from 'node:crypto';
import path from 'node:path';
import { diskFile } from './node_files.mjs';
import { cpkEntries, readEntry } from '../lib/cpk.js';
import { findContainers } from '../lib/deko3d.js';

const file = diskFile(path.join(process.argv[2], 'media', 'data000.cpk'));
const t0 = Date.now();
const entries = await cpkEntries(file);
const seen = new Set();
let total = 0;
for (const e of entries) {
  for (const c of findContainers(await readEntry(file, e))) {
    total++;
    seen.add(crypto.createHash('sha256').update(c.bytes).digest('hex'));
  }
}
console.log(`${entries.length} entries, ${total} containers, ${seen.size} unique, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
console.log(JSON.stringify([...seen].sort()));
