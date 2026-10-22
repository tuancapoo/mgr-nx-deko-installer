// mgr-nx-deko: makes deko3d_glsl.bin from the game folder in Node with the page's code (lib/deko3d.js), compares each
// shader with mgr-nx-deko's native GLSL (out/mgr-deko-shaders/conversion/glsl) and prints what the build's "deko3d"
// manifest entry needs.
// Usage: node test/mgr_deko3d_node.mjs <game folder> <native glsl folder> [--out <file>] [--json <file>]
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { diskFile, loadModules, root } from './node_files.mjs';
import { buildDeko3dPackage, mgrContainers } from '../lib/deko3d.js';

const args = process.argv.slice(2);
const take = (flag) => {
  const at = args.indexOf(flag);
  return at >= 0 ? args.splice(at, 2)[1] : null;
};
const out = take('--out');
const json = take('--json');
const glslOut = take('--glsl-out');
const [game, reference] = args;
const sha = (b) => createHash('sha256').update(b).digest('hex');
const t0 = Date.now();
const all = await mgrContainers(diskFile(path.join(game, 'media', 'data000.cpk')));
const unique = [];
const seen = new Set();
for (const c of all) {
  const h = sha(c.bytes);
  if (!seen.has(h)) {
    seen.add(h);
    unique.push(c);
  }
}
console.log(`${all.length} containers, ${unique.length} distinct (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
const names = fs.readdirSync(reference).filter((f) => /^(vs|ps)_[0-9A-F]{16}\.glsl$/.test(f)).map((f) => f.slice(0, -5)).sort();
const modules = await loadModules();
const common = fs.readFileSync(path.join(root, 'renut_shader_common.h'));
const { package: pkg, shaders } = await buildDeko3dPackage(unique, names, '', modules, common);
let same = 0;
for (const s of shaders) {
  if (fs.readFileSync(path.join(reference, `${s.name}.glsl`), 'utf8') === s.glsl) {
    same++;
  }
}
console.log(`${shaders.length} shaders, ${same} identical to the native chain's; package ${pkg.length} bytes, SHA-256 ${sha(pkg)}`);
console.log(`total ${((Date.now() - t0) / 1000).toFixed(0)} s`);
if (glslOut) {
  fs.mkdirSync(glslOut, { recursive: true });
  for (const s of shaders) {
    fs.writeFileSync(path.join(glslOut, `${s.name}.glsl`), s.glsl);
  }
}
if (out) {
  fs.writeFileSync(out, pkg);
}
if (json) {
  fs.writeFileSync(json, JSON.stringify({ shaders: names, containers_sha256: [...seen].sort(), package_sha256: sha(pkg) }, null, 2));
}
