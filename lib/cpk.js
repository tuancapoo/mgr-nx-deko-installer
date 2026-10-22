// CRI CPK archives (media/data000.cpk of Metal Gear Rising), read in place: the table of contents (@UTF tables, masked
// or not) and each entry's bytes, CRILAYLA-decompressed when they are. mgr-nx-deko's tools/installer_probe/cpk_toc.py and
// cpk_shader_scan.cpp, which found the game's 1,202 shader containers this way.

function be16(b, o) {
  return (b[o] << 8) | b[o + 1];
}

function be32(b, o) {
  return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
}

function le32(b, o) {
  return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
}

// The tables of many CPKs are masked with this generator.
function unmask(bytes) {
  const out = new Uint8Array(bytes);
  let m = 0x655f;
  for (let i = 0; i < out.length; i++) {
    out[i] ^= m & 0xff;
    m = (m * 0x4115) & 0xffff;
  }
  return out;
}

// An @UTF table: [{ column: value }] (strings, numbers; 64-bit numbers as Number, exact below 2^53).
export function readUtf(bytes) {
  let b = bytes;
  if (!(b[0] === 0x40 && b[1] === 0x55 && b[2] === 0x54 && b[3] === 0x46)) {
    b = unmask(bytes);
  }
  if (!(b[0] === 0x40 && b[1] === 0x55 && b[2] === 0x54 && b[3] === 0x46)) {
    throw new Error('CPK: no @UTF table');
  }
  const base = 8;
  const rowsOffset = be32(b, 8);
  const stringsOffset = be32(b, 12);
  const columns = be16(b, 24);
  const rowLength = be16(b, 26);
  const rows = be32(b, 28);
  const text = new TextDecoder();
  const string = (o) => {
    const start = base + stringsOffset + o;
    let end = start;
    while (b[end]) {
      end++;
    }
    return text.decode(b.subarray(start, end));
  };
  const sizes = { 0: 1, 1: 1, 2: 2, 3: 2, 4: 4, 5: 4, 6: 8, 7: 8, 8: 4, 0xa: 4, 0xb: 8 };
  const read = (type, o) => {
    switch (type) {
      case 0: return b[o];
      case 1: return (b[o] << 24) >> 24;
      case 2: return be16(b, o);
      case 3: return (be16(b, o) << 16) >> 16;
      case 4: return be32(b, o);
      case 5: return be32(b, o) | 0;
      case 6:
      case 7: return be32(b, o) * 4294967296 + be32(b, o + 4);
      case 8: return new DataView(b.buffer, b.byteOffset + o, 4).getFloat32(0);
      case 0xa: return string(be32(b, o));
      case 0xb: return [be32(b, o), be32(b, o + 4)];
      default: throw new Error(`CPK: column type ${type}`);
    }
  };
  const cols = [];
  let p = 32;
  for (let i = 0; i < columns; i++) {
    const flags = b[p];
    const name = string(be32(b, p + 1));
    p += 5;
    const storage = flags & 0xf0;
    const type = flags & 0x0f;
    let constant = null;
    if (storage === 0x30) {
      constant = read(type, p);
      p += sizes[type];
    }
    cols.push({ name, storage, type, constant });
  }
  const out = [];
  for (let r = 0; r < rows; r++) {
    let q = base + rowsOffset + r * rowLength;
    const row = {};
    for (const c of cols) {
      if (c.storage === 0x50) {
        row[c.name] = read(c.type, q);
        q += sizes[c.type];
      } else if (c.storage === 0x30) {
        row[c.name] = c.constant;
      } else {
        row[c.name] = null;
      }
    }
    out.push(row);
  }
  return out;
}

// file: { size, read(offset, length) -> Promise<Uint8Array> }. Returns [{ name, offset, size, extractSize }].
export async function cpkEntries(file) {
  const head = await file.read(0, 0x800);
  if (!(head[0] === 0x43 && head[1] === 0x50 && head[2] === 0x4b && head[3] === 0x20)) {
    throw new Error('CPK: not a CPK archive');
  }
  const [header] = readUtf(head.subarray(16, 16 + le32(head, 8)));
  const toc = header.TocOffset;
  if (!toc) {
    throw new Error('CPK: no table of contents');
  }
  const tocHead = await file.read(toc, 16);
  const rows = readUtf(await file.read(toc + 16, le32(tocHead, 8)));
  return rows.map((r) => ({
    name: `${r.DirName ? r.DirName + '/' : ''}${r.FileName}`,
    offset: toc + r.FileOffset,
    size: r.FileSize,
    extractSize: r.ExtractSize,
  }));
}

// CRILAYLA: the data read backwards bit by bit (literals and back references), then the 0x100-byte header kept apart.
export function crilayla(input) {
  const usize = le32(input, 8);
  const headerOffset = le32(input, 12);
  const out = new Uint8Array(usize + 0x100);
  out.set(input.subarray(headerOffset + 0x10, headerOffset + 0x10 + 0x100), 0);
  let ip = input.length - 0x100 - 1;
  const outEnd = 0x100 + usize - 1;
  let pool = 0;
  let left = 0;
  let done = 0;
  const bits = (n) => {
    let v = 0;
    let got = 0;
    while (got < n) {
      if (!left) {
        pool = input[ip--];
        left = 8;
      }
      const take = Math.min(left, n - got);
      v = (v << take) | ((pool >> (left - take)) & ((1 << take) - 1));
      left -= take;
      got += take;
    }
    return v;
  };
  const vle = [2, 3, 5, 8];
  while (done < usize) {
    if (bits(1)) {
      let back = outEnd - done + bits(13) + 3;
      let length = 3;
      let level = 0;
      for (; level < 4; level++) {
        const v = bits(vle[level]);
        length += v;
        if (v !== (1 << vle[level]) - 1) {
          break;
        }
      }
      if (level === 4) {
        let v;
        do {
          v = bits(8);
          length += v;
        } while (v === 255);
      }
      for (let i = 0; i < length && done < usize; i++) {
        out[outEnd - done] = out[back--];
        done++;
      }
    } else {
      out[outEnd - done] = bits(8);
      done++;
    }
  }
  return out;
}

// An entry's bytes as the game reads them.
export async function readEntry(file, entry) {
  if (!entry.size) {
    return new Uint8Array(0);
  }
  const data = await file.read(entry.offset, entry.size);
  const isLayla = data.length > 16 && String.fromCharCode(...data.subarray(0, 8)) === 'CRILAYLA';
  return isLayla ? crilayla(data) : data;
}
