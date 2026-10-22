// The GLSL package of the Switch build's Renut renderer on deko3d (peggle2-nx's tools/deko3d_shader_package.py format,
// read by app/src/renut_engine/gpu/banjo_renut_deko3d.cpp), written in the browser: deko3d_glsl.bin, which the NRO
// reads beside itself. Without a dictionary, each shader's GLSL in one zstd frame of raw blocks (zstd's format,
// RFC 8878: a frame any zstd decoder reads; the GLSL is small, so no compressor is needed in the page).
//
//   header (32 bytes): "BDKG", version 1, count, dictionary size (0), table offset, data offset, 0, 0
//   table: per shader (56 bytes, sorted by hash): u64 hash, u32 offset (from the data), compressed size, size, stage
//          (0 vertex, 4 pixel), 8 x u32 bool constant mask (ids 1000-1255 the GLSL defines)
//   data: the frames, each 8-byte aligned

const ZSTD_MAGIC = 0xfd2fb528;
const MAX_RAW_BLOCK = 128 * 1024;

// One zstd frame holding `bytes` in raw blocks: single segment, 4-byte content size, no checksum, no dictionary id.
export function zstdRawFrame(bytes) {
  const blocks = Math.max(1, Math.ceil(bytes.length / MAX_RAW_BLOCK));
  const out = new Uint8Array(4 + 1 + 4 + blocks * 3 + bytes.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, ZSTD_MAGIC, true);
  out[4] = (2 << 6) | (1 << 5);  // frame content size field of 4 bytes, single segment
  view.setUint32(5, bytes.length, true);
  let at = 9;
  for (let b = 0; b < blocks; ++b) {
    const start = b * MAX_RAW_BLOCK;
    const size = Math.min(MAX_RAW_BLOCK, bytes.length - start);
    const last = b === blocks - 1 ? 1 : 0;
    const header = last | (0 << 1) | (size << 3);  // raw block
    out[at] = header & 0xff;
    out[at + 1] = (header >>> 8) & 0xff;
    out[at + 2] = (header >>> 16) & 0xff;
    at += 3;
    out.set(bytes.subarray(start, start + size), at);
    at += size;
  }
  return out;
}

// The bool specialization constants a shader's GLSL defines (deko3d_shader_package.py's mask).
function boolMask(text) {
  const mask = new Uint32Array(8);
  for (const m of text.matchAll(/#define SPIRV_CROSS_CONSTANT_ID_(\d+) /g)) {
    const i = Number(m[1]);
    if (i >= 1000 && i < 1256) mask[(i - 1000) >> 5] |= 1 << ((i - 1000) & 31);
  }
  return mask;
}

// shaders: [{ name: 'ps_558CF34EF8661CAE', glsl: '...' }]. Returns the package (Uint8Array).
export function writeDeko3dPackage(shaders) {
  const encoder = new TextEncoder();
  const entries = shaders.map(({ name, glsl }) => {
    const m = /^(vs|ps)_([0-9A-F]{16})$/.exec(name);
    if (!m) throw new Error(`deko3d package: bad shader name ${name}`);
    const text = encoder.encode(glsl);
    return { hash: BigInt('0x' + m[2]), stage: m[1] === 'ps' ? 4 : 0, text, frame: zstdRawFrame(text), mask: boolMask(glsl) };
  });
  entries.sort((a, b) => (a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0));
  const tableOffset = 32;
  const dataOffset = tableOffset + 56 * entries.length;
  let dataSize = 0;
  for (const e of entries) {
    e.offset = dataSize;
    dataSize += e.frame.length;
    dataSize += (8 - (dataSize % 8)) % 8;
  }
  const out = new Uint8Array(dataOffset + dataSize);
  const view = new DataView(out.buffer);
  out.set(encoder.encode('BDKG'), 0);
  view.setUint32(4, 1, true);
  view.setUint32(8, entries.length, true);
  view.setUint32(12, 0, true);  // no dictionary
  view.setUint32(16, tableOffset, true);
  view.setUint32(20, dataOffset, true);
  entries.forEach((e, i) => {
    const at = tableOffset + 56 * i;
    view.setBigUint64(at, e.hash, true);
    view.setUint32(at + 8, e.offset, true);
    view.setUint32(at + 12, e.frame.length, true);
    view.setUint32(at + 16, e.text.length, true);
    view.setUint32(at + 20, e.stage, true);
    for (let k = 0; k < 8; ++k) view.setUint32(at + 24 + 4 * k, e.mask[k], true);
    out.set(e.frame, dataOffset + e.offset);
  });
  return out;
}
