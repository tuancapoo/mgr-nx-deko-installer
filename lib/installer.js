// Builds the mgr-nx-deko.zip package from the player's own copy of Metal Gear Rising: Revengeance (Xbox 360).
//
// The game comes as the folder its disc was extracted into (default.xex and media/). The zip holds the Switch build
// (mgr.nro) and its licenses, the game's shaders made from its own files (deko3d_glsl.bin: the deko3d renderer's GLSL,
// from the shader containers of media/data000.cpk), the settings file (mgr.toml) and the game folder itself
// (game_root/: the game is 7.5 GB, over the 4 GB a FAT32 file can hold, so it is not packed into one file). The update
// zip holds only the program, its licenses and the shaders.
//
// Adapted from sa2-nx-installer (lib/installer.js); the Xbox Live Arcade package reader and the asset pack are SA2's
// and are not used here.

import { readXexImage } from './xex.js';
import { buildDeko3dPackage, mgrContainers } from './deko3d.js';
import { ZipWriter, zipSize } from './zip.js';
import { t } from './i18n.js';

const CHUNK = 16 * 1024 * 1024;
const ROOT = 'mgr-nx-deko';

async function sha256(bytes) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function* chunksOf(file) {
  for (let offset = 0; offset < file.size; offset += CHUNK) {
    yield await file.read(offset, Math.min(CHUNK, file.size - offset));
  }
}

function baseName(path) {
  return path.slice(path.lastIndexOf('/') + 1);
}

// The LZX step of readXexImage, done by libmspack compiled to WebAssembly.
export function lzxStep(lzx) {
  return async (compressed, bits, size) => {
    lzx.FS.writeFile('/image.lzx', compressed);
    const rc = lzx.callMain(['/image.lzx', '/image.bin', String(bits), String(size)]);
    if (rc) {
      throw new Error(`LZX decompression failed (${rc})`);
    }
    const out = lzx.FS.readFile('/image.bin');
    lzx.FS.unlink('/image.lzx');
    lzx.FS.unlink('/image.bin');
    return out;
  };
}

// Where the program is downloaded from. Its SHA-256 is part of the address, so every version is a different address
// and a copy kept by the browser is never mistaken for a newer one.
export function programPath(build) {
  return `./release/${build.nro}?sha256=${build.nro_sha256}`;
}

// The files of the game the Switch build reads: default.xex and media/ (an extracted disc also holds $SystemUpdate/,
// AvatarAssetPack/ and nxeart/, which the game never opens).
export function isGameFile(path) {
  const p = path.toLowerCase();
  return p === 'default.xex' || p.startsWith('media/');
}

// Sorts out what the player chose: files ([{ path, size, read }]) from the "Folder" button (every file under the
// folder, path relative to it). The shallowest default.xex names the game folder.
// Returns { game, dlc: [], others: [] }: game = { kind: 'folder', name, size, files } or null.
export async function findGame(chosen) {
  const executables = chosen
    .filter((f) => baseName(f.path).toLowerCase() === 'default.xex')
    .sort((a, b) => a.path.split('/').length - b.path.split('/').length);
  if (!executables.length) {
    return { game: null, dlc: [], others: [] };
  }
  const prefix = executables[0].path.slice(0, -'default.xex'.length);
  const files = chosen
    .filter((f) => f.path.startsWith(prefix))
    .map((f) => ({ ...f, path: f.path.slice(prefix.length) }))
    .filter((f) => isGameFile(f.path));
  const game = {
    kind: 'folder',
    name: prefix ? baseName(prefix.slice(0, -1)) : '',
    size: files.reduce((sum, f) => sum + f.size, 0),
    files,
  };
  return { game, dlc: [], others: [] };
}

// Identifies the build of this game: by the SHA-256 of default.xex, or, for an executable another tool rebuilt
// (decrypted or decompressed), by the SHA-256 of its decompressed image.
// Returns { xex, xexHash, build (null when there is none) }.
export async function identifyGame(files, manifest, decompressLzx = null) {
  const xexFile = files.find((f) => f.path.toLowerCase() === 'default.xex');
  if (!xexFile) {
    const error = new Error(t('noGame'));
    error.code = 'noGame';
    throw error;
  }
  const xex = await xexFile.read(0, xexFile.size);
  const xexHash = await sha256(xex);
  let build = manifest.builds.find((b) => b.xex_sha256 === xexHash) || null;
  if (!build && decompressLzx) {
    try {
      const { image } = await readXexImage(xex, decompressLzx);
      const imageHash = await sha256(image);
      build = manifest.builds.find((b) => b.image_sha256 === imageHash) || null;
    } catch {
      // not a readable executable: unsupported
    }
  }
  return { xex, xexHash, build };
}

// The deko3d renderer's shaders: deko3d_glsl.bin, which the NRO reads beside itself, made from the shader containers of
// media/data000.cpk (lib/deko3d.js) and checked against the build's manifest entry ("deko3d": { passes, shaders,
// containers_sha256, package_sha256 }). modules: { renutHlsl, dxc, spirvCross }; renutCommon: Renut's shader_common.h
// of mgr-nx-deko.
export async function makeDeko3dPackage(files, build, modules, renutCommon, log = () => {}, progress = () => {}) {
  const cpk = files.find((f) => f.path.toLowerCase() === 'media/data000.cpk');
  if (!cpk) {
    throw new Error(t('noShaderArchive'));
  }
  log(t('readingShaders'));
  const wanted = new Set(build.deko3d.containers_sha256);
  const containers = [];
  const found = new Set();
  for (const c of await mgrContainers(cpk, progress)) {
    const hash = await sha256(c.bytes);
    if (wanted.has(hash) && !found.has(hash)) {
      found.add(hash);
      containers.push(c);
    }
  }
  if (found.size !== wanted.size) {
    throw new Error(t('deko3dContainers', { found: found.size, wanted: wanted.size }));
  }
  log(t('deko3dShaders', { count: build.deko3d.shaders.length }));
  const { package: pkg } = await buildDeko3dPackage(containers, build.deko3d.shaders, build.deko3d.passes, modules,
    renutCommon);
  const hash = await sha256(pkg);
  if (hash !== build.deko3d.package_sha256) {
    throw new Error(t('deko3dMismatch', { hash }));
  }
  log(t('deko3dReady'));
  return pkg;
}

// chosen: findGame(); release: { manifest, nro: Uint8Array, licenses: Uint8Array (release/LICENSES.txt), settings:
// Uint8Array (release/mgr.toml), renutShaderCommon: Uint8Array }
// modules: { lzx, dxc, renutHlsl, spirvCross } instantiated Emscripten modules
// sink: { write(Uint8Array), close() } receiving the zip file
// onSize(bytes) is called with the exact size of the zip before the first byte is written.
// update: only the program, its licenses and the shaders, for a folder already on the SD card (the settings stay).
export async function createPackage(chosen, release, modules, sink, log = () => {}, progress = () => {},
  onSize = () => {}, { update = false } = {}) {
  const { game } = chosen;
  if (!game) {
    throw new Error(t('noGame'));
  }
  const { xexHash, build } = await identifyGame(game.files, release.manifest, lzxStep(modules.lzx));
  if (!build) {
    throw new Error(t('notSupportedYet', { hash: xexHash }));
  }
  log(t('logBuild', { version: build.version }));
  if (update) {
    log(t('logUpdate'));
  }
  // a folder the game was only partly extracted into would make a package that does not start
  if (!update && game.files.length < build.game_files) {
    throw new Error(t('incompleteError', { count: game.files.length, expected: build.game_files }));
  }

  // The shaders first: they are the step most likely to stop the package, and nothing is written before them.
  const deko3d = await makeDeko3dPackage(game.files, build, modules, release.renutShaderCommon, log,
    (f) => progress(0.05 * f));

  const files = update ? [] : [...game.files].sort((a, b) => (a.path < b.path ? -1 : 1));
  const gameBytes = files.reduce((sum, f) => sum + f.size, 0);
  const total = gameBytes || 1;
  let done = 0;
  const onChunk = (chunk) => {
    done += chunk.length;
    progress(0.05 + 0.95 * (done / total));
  };

  const entries = [
    { path: `${ROOT}/mgr.nro`, size: release.nro.length },
    { path: `${ROOT}/LICENSES.txt`, size: release.licenses.length },
    { path: `${ROOT}/deko3d_glsl.bin`, size: deko3d.length },
    ...(update ? [] : [{ path: `${ROOT}/mgr.toml`, size: release.settings.length }]),
    ...files.map((f) => ({ path: `${ROOT}/game_root/${f.path}`, size: f.size })),
  ];
  onSize(zipSize(entries));
  log(t('packing'));
  const zip = new ZipWriter(sink);
  await zip.addBytes(`${ROOT}/mgr.nro`, release.nro);
  await zip.addBytes(`${ROOT}/LICENSES.txt`, release.licenses);
  await zip.addBytes(`${ROOT}/deko3d_glsl.bin`, deko3d);
  if (!update) {
    await zip.addBytes(`${ROOT}/mgr.toml`, release.settings);
  }
  for (const f of files) {
    await zip.addFile(`${ROOT}/game_root/${f.path}`, f.size, chunksOf(f), onChunk);
  }
  await zip.finish();
  progress(1);
  log(t('done'));
  return { version: build.version, dlc: 0, update };
}
