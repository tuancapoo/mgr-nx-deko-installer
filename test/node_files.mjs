// Node helpers of the test scripts: files on disk in the form the page gives them to lib/installer.js, and the
// WebAssembly modules.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import createDxcModule from '../wasm/dxc_web.mjs';
import createLzxModule from '../wasm/lzx.mjs';
import createRenutHlslModule from '../wasm/renut_hlsl.mjs';
import createSpirvCrossModule from '../wasm/spirv_cross.mjs';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// A file on disk as { path, size, read(offset, length) } (path: its name, or `name` when given).
export function diskFile(full, name = path.basename(full)) {
  const size = fs.statSync(full).size;
  return {
    path: name,
    size,
    read: async (offset, length) => {
      const fd = fs.openSync(full, 'r');
      try {
        const buffer = Buffer.alloc(length);
        let done = 0;
        while (done < length) {
          const n = fs.readSync(fd, buffer, done, length - done, offset + done);
          if (!n) {
            throw new Error(`${full}: short read`);
          }
          done += n;
        }
        return new Uint8Array(buffer.buffer, buffer.byteOffset, length);
      } finally {
        fs.closeSync(fd);
      }
    },
  };
}

// What the page's "Package file" button gives: the chosen files. A folder gives every file under it, with its path
// relative to the folder.
export function chosenOnDisk(paths) {
  const files = [];
  const walk = (dir, prefix) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const rel = prefix ? `${prefix}/${name}` : name;
      if (fs.statSync(full).isDirectory()) {
        walk(full, rel);
      } else {
        files.push(diskFile(full, rel));
      }
    }
  };
  for (const p of paths) {
    if (fs.statSync(p).isDirectory()) {
      walk(p, '');
    } else {
      files.push(diskFile(p));
    }
  }
  return files;
}

const quiet = () => ({ print: () => {}, printErr: () => {} });
const loud = (tag) => ({ print: (t) => console.log(`[${tag}] ${t}`), printErr: (t) => console.log(`[${tag}!] ${t}`) });

export async function loadModules(verbose = false) {
  const options = (tag) => (verbose ? loud(tag) : quiet());
  return {
    dxc: await createDxcModule(options('dxc')),
    lzx: await createLzxModule(options('lzx')),
    // the deko3d renderer's chain (lib/deko3d.js)
    renutHlsl: await createRenutHlslModule(options('renut_hlsl')),
    spirvCross: await createSpirvCrossModule(options('spirv_cross')),
  };
}
