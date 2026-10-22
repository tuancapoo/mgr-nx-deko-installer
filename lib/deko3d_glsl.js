// peggle2-nx's tools/deko3d_glsl.py (convert: SPIRV-Cross's Vulkan GLSL -> the GLSL uam takes) and
// tools/deko3d_glsl_opt.py (optimise: its 27 passes) in the browser, byte for byte what the Python tools write.
// Each function names the Python one it mirrors. Python's `re` and `str` semantics are kept by a small compatibility
// layer (rx(): a Python pattern translated to a JS one; strip() & co. with Python's whitespace), so the passes read as
// their Python originals. test/deko3d_glsl_node.mjs compares this file with the Python tools.

// ---------------------------------------------------------------------------------------------------------------------
// Python compatibility

// Python 3's str patterns: \w is Unicode alphanumerics and '_', \d Unicode decimal digits (Nd), \s Unicode whitespace
// (str.isspace: these 29 characters). JS's own \w \d \s \b are ASCII (and \s differs), so they are written out. The
// Unicode classes are slow to compile; on an all-ASCII subject (the shaders are) the ASCII ones match the same.
function escapes(ascii) {
  const word = ascii ? 'A-Za-z0-9_' : '\\p{L}\\p{N}_';
  const space = ascii ? '\\t\\n\\x0b\\x0c\\r\\x1c-\\x1f ' :
    '\\t\\n\\x0b\\x0c\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000';
  const digit = ascii ? '0-9' : '\\p{Nd}';
  return [{
    d: `[${digit}]`, D: `[^${digit}]`, w: `[${word}]`, W: `[^${word}]`, s: `[${space}]`, S: `[^${space}]`,
    b: ascii ? '\\b' : `(?:(?<=[${word}])(?![${word}])|(?<![${word}])(?=[${word}]))`,
    B: ascii ? '\\B' : `(?:(?<=[${word}])(?=[${word}])|(?<![${word}])(?![${word}]))`,
    A: '(?<![\\s\\S])', Z: '(?![\\s\\S])', n: '\\n', t: '\\t', r: '\\r', f: '\\f', v: '\\v', a: '\\x07',
  }, { d: digit, w: word, s: space, n: '\\n', t: '\\t', r: '\\r', f: '\\f', v: '\\v', a: '\\x07', b: '\\x08' }];
}
const ESCAPES = [escapes(false), escapes(true)];
const SYNTAX = '^$\\.*+?()[]{}|/';

// A Python pattern (re module syntax, flags 'M' / 'S') as the source of an equivalent JS 'u' pattern (ascii: for an
// all-ASCII subject only).
function translate(src, multiline, dotall, ascii) {
  const [ESC_OUT, ESC_IN] = ESCAPES[ascii ? 1 : 0];
  let out = '';
  let i = 0;
  const n = src.length;
  const escape = (table, d, inClass) => {
    if (Object.hasOwn(table, d)) {
      return table[d];
    }
    if (/[0-9]/.test(d)) {
      if (inClass || d === '0') {
        throw new Error(`deko3d_glsl: pattern escape \\${d} not handled: ${src}`);
      }
      let k = i;
      while (k < n && k < i + 1 && /[0-9]/.test(src[k])) {
        k++;
      }
      const ref = d + src.slice(i, k);
      i = k;
      return `\\${ref}`;
    }
    if (d === 'x' || d === 'u') {
      const len = d === 'x' ? 2 : 4;
      const hex = src.slice(i, i + len);
      i += len;
      return `\\${d}${hex}`;
    }
    if (/[A-Za-z]/.test(d)) {
      throw new Error(`deko3d_glsl: pattern escape \\${d} not handled: ${src}`);
    }
    if (inClass) {
      return '\\]^-['.includes(d) ? `\\${d}` : d;
    }
    return SYNTAX.includes(d) ? `\\${d}` : d;
  };
  while (i < n) {
    const c = src[i];
    if (c === '\\') {
      const d = src[i + 1];
      i += 2;
      out += escape(ESC_OUT, d, false);
    } else if (c === '[') {
      i++;
      out += '[';
      if (src[i] === '^') {
        out += '^';
        i++;
      }
      if (src[i] === ']') {
        out += '\\]';
        i++;
      }
      while (src[i] !== ']') {
        if (i >= n) {
          throw new Error(`deko3d_glsl: unterminated class: ${src}`);
        }
        const k = src[i];
        if (k === '\\') {
          const d = src[i + 1];
          i += 2;
          if ('DSW'.includes(d)) {
            throw new Error(`deko3d_glsl: \\${d} in a class not handled: ${src}`);
          }
          out += escape(ESC_IN, d, true);
        } else {
          out += k === '[' ? '\\[' : k;
          i++;
        }
      }
      out += ']';
      i++;
    } else if (c === '.') {
      out += dotall ? '[\\s\\S]' : '[^\\n]';
      i++;
    } else if (c === '^') {
      out += multiline ? '(?<![^\\n])' : '^';
      i++;
    } else if (c === '$') {
      // Python: before a newline or at the end (re.M); else at the end or before a newline that ends the string
      out += multiline ? '(?=\\n|(?![\\s\\S]))' : '(?=\\n?(?![\\s\\S]))';
      i++;
    } else if (c === '{') {
      const q = /^\{(\d*)(?:(,)(\d*))?\}/.exec(src.slice(i));
      if (q && (q[1] !== '' || q[2])) {
        out += `{${q[1] || '0'}${q[2] ? `,${q[3]}` : ''}}`;
        i += q[0].length;
      } else {
        out += '\\{';
        i++;
      }
    } else if (c === '}' || c === ']') {
      out += `\\${c}`;
      i++;
    } else if (c === '(' && src.startsWith('(?P<', i)) {
      out += '(?<';
      i += 4;
    } else if (c === '(' && src.startsWith('(?P=', i)) {
      const close = src.indexOf(')', i);
      out += `\\k<${src.slice(i + 4, close)}>`;
      i = close + 1;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

const dRegexps = new Map();

// re.Match
class PyMatch {
  constructor(m, regexp) {
    this.m = m;
    this.regexp = regexp;
    this.indices = null;
  }

  group(k = 0) {
    const v = this.m[k];
    return v === undefined ? null : v;
  }

  groups() {
    return this.m.slice(1).map((v) => (v === undefined ? null : v));
  }

  start(k = 0) {
    return k === 0 ? this.m.index : this.span(k)[0];
  }

  end(k = 0) {
    return k === 0 ? this.m.index + this.m[0].length : this.span(k)[1];
  }

  span(k) {
    if (!this.indices) {
      // the same match again with group indices (the 'd' flag only where they are needed)
      let r = dRegexps.get(this.regexp.source);
      if (!r) {
        r = new RegExp(this.regexp.source, 'dyu');
        dRegexps.set(this.regexp.source, r);
      }
      r.lastIndex = this.m.index;
      this.indices = r.exec(this.m.input).indices;
    }
    return this.indices[k] || [-1, -1];
  }
}

// re.Pattern (only what the tools use). None of their patterns matches the empty string.
class PyPattern {
  constructor(src, flags, ascii) {
    this.js = translate(src, flags.includes('M'), flags.includes('S'), ascii);
    this.rg = null;
    this.ry = null;
    this.rfull = null;
    this.n = -1;
  }

  get g() {
    return this.rg || (this.rg = new RegExp(this.js, 'gu'));
  }

  get y() {
    return this.ry || (this.ry = new RegExp(this.js, 'yu'));
  }

  get full() {
    return this.rfull || (this.rfull = new RegExp(`(?:${this.js})(?![\\s\\S])`, 'yu'));
  }

  get ngroups() {
    if (this.n < 0) {
      this.n = new RegExp(`${this.js}|`, 'u').exec('').length - 1;
    }
    return this.n;
  }

  search(s, pos = 0) {
    this.g.lastIndex = pos;
    const m = this.g.exec(s);
    return m ? new PyMatch(m, this.g) : null;
  }

  match(s, pos = 0) {
    this.y.lastIndex = pos;
    const m = this.y.exec(s);
    return m ? new PyMatch(m, this.y) : null;
  }

  fullmatch(s) {
    this.full.lastIndex = 0;
    const m = this.full.exec(s);
    return m ? new PyMatch(m, this.full) : null;
  }

  // re.finditer, collected (the strings are immutable, so the same matches)
  finditer(s, limit = 0) {
    const out = [];
    const r = this.g;
    r.lastIndex = 0;
    let m;
    while ((m = r.exec(s)) !== null) {
      out.push(new PyMatch(m, r));
      if (m[0].length === 0) {
        r.lastIndex += 1;
      }
      if (limit && out.length >= limit) {
        break;
      }
    }
    return out;
  }

  count(s) {
    const r = this.g;
    r.lastIndex = 0;
    let k = 0;
    let m;
    while ((m = r.exec(s)) !== null) {
      k++;
      if (m[0].length === 0) {
        r.lastIndex += 1;
      }
    }
    return k;
  }

  // re.findall: the matches, group 1, or a tuple of the groups ('' for a group that did not take part)
  findall(s) {
    return this.finditer(s).map((m) => {
      if (this.ngroups === 0) {
        return m.group(0);
      }
      if (this.ngroups === 1) {
        return m.group(1) ?? '';
      }
      return m.groups().map((v) => v ?? '');
    });
  }

  // re.subn; repl a function of the match or a literal string (no template)
  subn(repl, s, count = 0) {
    const matches = this.finditer(s, count);
    let out = '';
    let last = 0;
    for (const m of matches) {
      out += s.slice(last, m.start()) + (typeof repl === 'function' ? repl(m) : repl);
      last = m.end();
    }
    return [out + s.slice(last), matches.length];
  }

  sub(repl, s, count = 0) {
    return this.subn(repl, s, count)[0];
  }
}

const patterns = [new Map(), new Map()]; // Unicode, ASCII: flags -> source -> PyPattern
let asciiSubjects = false; // set by withSubject() while every string matched is ASCII

// re.compile(src, flags), cached as Python caches them
function rx(src, flags = '') {
  const byFlags = patterns[asciiSubjects ? 1 : 0];
  let cache = byFlags.get(flags);
  if (!cache) {
    cache = new Map();
    byFlags.set(flags, cache);
  }
  let p = cache.get(src);
  if (!p) {
    if (cache.size > 4096) {
      cache.clear();
    }
    p = new PyPattern(src, flags, asciiSubjects);
    cache.set(src, p);
  }
  return p;
}

// fn() with the patterns for text's characters: the passes match only substrings of their input and ASCII literals
function withSubject(text, fn) {
  const before = asciiSubjects;
  asciiSubjects = !/[^\x00-\x7f]/.test(text);
  try {
    return fn();
  } finally {
    asciiSubjects = before;
  }
}

// re.escape
const RE_SPECIAL = new Set('()[]{}?*+-|^$\\.&~# \t\n\r\v\f');
function reEscape(s) {
  let out = '';
  for (const ch of s) {
    out += RE_SPECIAL.has(ch) ? `\\${ch}` : ch;
  }
  return out;
}

const PY_SPACE = new Set([0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x1c, 0x1d, 0x1e, 0x1f, 0x20, 0x85, 0xa0, 0x1680, 0x2000,
  0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f,
  0x3000]);
const isSpace = (s, i) => PY_SPACE.has(s.charCodeAt(i));

// str.strip / lstrip / rstrip: Python's whitespace, or the given characters
function lstrip(s, chars) {
  let i = 0;
  while (i < s.length && (chars === undefined ? isSpace(s, i) : chars.includes(s[i]))) {
    i++;
  }
  return s.slice(i);
}

function rstrip(s, chars) {
  let j = s.length;
  while (j > 0 && (chars === undefined ? isSpace(s, j - 1) : chars.includes(s[j - 1]))) {
    j--;
  }
  return s.slice(0, j);
}

const strip = (s, chars) => rstrip(lstrip(s, chars), chars);

// str.find / str.index with Python's negative start
function find(s, sub, start = 0) {
  if (start < 0) {
    start = Math.max(0, s.length + start);
  }
  if (start > s.length) {
    return -1;
  }
  return s.indexOf(sub, start);
}

function index(s, sub, start = 0) {
  const at = find(s, sub, start);
  if (at < 0) {
    throw new Error('ValueError: substring not found');
  }
  return at;
}

// str.replace(a, b) and str.replace(a, b, 1)
const replaceAll = (s, a, b) => s.split(a).join(b);
function replaceFirst(s, a, b) {
  const at = s.indexOf(a);
  return at < 0 ? s : s.slice(0, at) + b + s.slice(at + a.length);
}

// a[k] of a Python list or str: negative from the end, IndexError past it
function at(a, k) {
  const j = k < 0 ? a.length + k : k;
  if (j < 0 || j >= a.length) {
    throw new Error('IndexError: index out of range');
  }
  return a[j];
}

// int() of a run of \d (Unicode decimal digits, each the position in its run of ten), as a BigInt
const ND = /\p{Nd}/u;
function pyInt(digits) {
  if (/^[0-9]+$/.test(digits)) {
    return BigInt(digits);
  }
  let v = 0n;
  for (const ch of digits) {
    const cp = ch.codePointAt(0);
    let zero = cp;
    while (ND.test(String.fromCodePoint(zero - 1))) {
      zero--;
    }
    v = v * 10n + BigInt((cp - zero) % 10);
  }
  return v;
}

// a string as Python's sorted() orders them (code points)
function cmpStr(a, b) {
  const x = Array.from(a);
  const y = Array.from(b);
  for (let k = 0; k < Math.min(x.length, y.length); k++) {
    const d = x[k].codePointAt(0) - y[k].codePointAt(0);
    if (d) {
      return d;
    }
  }
  return x.length - y.length;
}

const cmpNum = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// a file's text as Python's open(path, encoding='utf-8').read() gives it: strict UTF-8, a BOM kept, universal newlines
export function pythonText(input) {
  let text = input;
  if (typeof input !== 'string') {
    const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : input;
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  }
  return text.replace(/\r\n?/g, '\n');
}

// ---------------------------------------------------------------------------------------------------------------------
// tools/deko3d_glsl.py

const PUSH_UBO_BINDING = 5;
const RAW_WINDOW_SET = 15n;
export const DEFAULT_UBO_MAP = new Map([[5n, 0n], [6n, 1n], [7n, 2n]]);

const SAMPLER_OF = new Map(Object.entries({
  texture1D: 'sampler1D', texture2D: 'sampler2D', texture3D: 'sampler3D', textureCube: 'samplerCube',
  texture2DArray: 'sampler2DArray', textureCubeArray: 'samplerCubeArray', texture2DMS: 'sampler2DMS',
  texture2DMSArray: 'sampler2DMSArray', texture1DArray: 'sampler1DArray',
  utexture2D: 'usampler2D', itexture2D: 'isampler2D', utexture3D: 'usampler3D', utexture2DMS: 'usampler2DMS',
}));
const DROPPED_EXTENSIONS = ['GL_EXT_nonuniform_qualifier', 'GL_EXT_samplerless_texture_functions',
  'GL_EXT_spirv_intrinsics', 'GL_EXT_scalar_block_layout'];

// deko3d_glsl.Unsupported: the shader has something convert() does not handle
export class Unsupported extends Error {
  constructor(message) {
    super(message);
    this.name = 'Unsupported';
  }
}

const codePoints = (s) => Array.from(s).length;
const first80 = (s) => Array.from(s).slice(0, 80).join('');

// deko3d_glsl.matching (raises)
function matchingOrRaise(text, openIndex, openCh, closeCh) {
  let depth = 0;
  for (let i = openIndex; i < text.length; i++) {
    const c = i < 0 ? at(text, i) : text[i];
    if (c === openCh) {
      depth += 1;
    } else if (c === closeCh) {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }
  const where = openIndex >= 0 ? codePoints(text.slice(0, openIndex)) : openIndex;
  throw new Unsupported(`unbalanced ${openCh}${closeCh} at ${where}`);
}

// deko3d_glsl.strip_nonuniform
function stripNonuniform(text) {
  const out = [];
  let i = 0;
  const key = 'nonuniformEXT(';
  for (;;) {
    const j = find(text, key, i);
    if (j < 0) {
      out.push(text.slice(i));
      return out.join('');
    }
    out.push(text.slice(i, j));
    const close = matchingOrRaise(text, j + key.length - 1, '(', ')');
    out.push(`(${text.slice(j + key.length, close)})`);
    i = close + 1;
  }
}

// deko3d_glsl.array_index
function arrayIndex(text, nameEnd) {
  let k = nameEnd;
  while (k < text.length && text[k] === ' ') {
    k++;
  }
  if (k >= text.length || text[k] !== '[') {
    return null;
  }
  const close = matchingOrRaise(text, k, '[', ']');
  return [text.slice(k + 1, close), close + 1];
}

// deko3d_glsl.strip_index_mask
function stripIndexMask(expr) {
  let e = strip(expr);
  for (let round = 0; round < 4; round++) {
    while (e.startsWith('(') && matchingOrRaise(e, 0, '(', ')') === e.length - 1) {
      e = strip(e.slice(1, -1));
    }
    const m = rx(String.raw`^(.*?)\s*&\s*67108863u$`, 'S').match(e);
    if (!m) {
      break;
    }
    const left = strip(m.group(1));
    let depth = 0;
    let balanced = true;
    for (const c of left) {
      depth += c === '(' || c === '[' ? 1 : 0;
      depth -= c === ')' || c === ']' ? 1 : 0;
      if (depth < 0) {
        balanced = false;
      }
    }
    if (!balanced || depth !== 0) {
      break;
    }
    e = left;
  }
  return e;
}

// deko3d_glsl.shared_word_offset (a BigInt, or null)
function sharedWordOffset(expr, temps) {
  let e = stripIndexMask(expr);
  for (let round = 0; round < 3; round++) {
    if (temps.has(e)) {
      e = stripIndexMask(temps.get(e));
    } else {
      break;
    }
  }
  const m = rx(String.raw`^g_UboShared\.v\[(\d+)u?\]\.([xyzw])$`).match(e);
  if (!m) {
    return null;
  }
  return pyInt(m.group(1)) * 16n + BigInt('xyzw'.indexOf(m.group(2)) * 4);
}

// {set: binding} from a Map, an object or [set, binding] pairs, as BigInts
function uboMapOf(value) {
  if (value === undefined || value === null) {
    return DEFAULT_UBO_MAP;
  }
  const pairs = value instanceof Map ? [...value] : Array.isArray(value) ? value : Object.entries(value);
  return new Map(pairs.map(([k, v]) => [BigInt(k), BigInt(v)]));
}

// deko3d_glsl.convert(src, stage, ubo_map, sampler_words): [text, notes]; throws Unsupported
export function convert(src, stage, uboMap, samplerWords = 'ids') {
  return withSubject(src, () => convertSubject(src, stage, uboMapOf(uboMap), samplerWords));
}

function convertSubject(src, stage, uboMap, samplerWords) {
  let text = replaceAll(src, '\r\n', '\n');
  const notes = [];
  const bound = samplerWords === 'handle';
  const bindings = new Map(); // (sampler type, texture word, sampler word) -> { stype, t, s, k }
  const temps = new Map();
  for (const m of rx(String.raw`^\s*uint (_\d+) = ([^;]+);`, 'M').finditer(src)) {
    temps.set(m.group(1), strip(m.group(2)));
  }

  const bind = (stype, tOff, sOff) => {
    const key = `${stype}\u0000${tOff}\u0000${sOff === null ? 'None' : sOff}`;
    if (!bindings.has(key)) {
      if (bindings.size >= 32) {
        return null;
      }
      bindings.set(key, { stype, t: tOff, s: sOff, k: bindings.size });
    }
    return `dk_tex_b${bindings.get(key).k}`;
  };

  // ---- texture and sampler tables
  const textures = new Map();
  const samplers = new Set();
  const declRe = rx(String.raw`^layout\(set = (\d+), binding = (\d+)\) uniform (\w+) (\w+)(\[\d*\])?;\n`, 'M');
  text = declRe.sub((m) => {
    const typ = m.group(3);
    const name = m.group(4);
    if (typ === 'sampler') {
      samplers.add(name);
      return '';
    }
    if (SAMPLER_OF.has(typ)) {
      textures.set(name, SAMPLER_OF.get(typ));
      return '';
    }
    if (typ.startsWith('sampler') || typ.startsWith('image')) {
      throw new Unsupported(`combined sampler or image declaration ${typ} ${name}`);
    }
    throw new Unsupported(`unknown uniform declaration ${typ} ${name}`);
  }, text);
  text = stripNonuniform(text);

  if (textures.size) {
    // sampler2D(T[t], S[s]) -> sampler2D(dkh(t, s))
    const ctorRe = rx(String.raw`\b(u|i)?sampler(1D|2D|3D|Cube|2DArray|CubeArray|2DMS|2DMSArray|1DArray)\(`);
    let pos = 0;
    let out = [];
    for (;;) {
      const m = ctorRe.search(text, pos);
      if (!m) {
        out.push(text.slice(pos));
        break;
      }
      const openI = m.end() - 1;
      const closeI = matchingOrRaise(text, openI, '(', ')');
      const inner = text.slice(openI + 1, closeI);
      const tm = rx(String.raw`\s*(\w+)\s*\[`).match(inner);
      if (tm && textures.has(tm.group(1))) {
        const [tExpr, after] = arrayIndex(inner, tm.end(1));
        let rest = lstrip(inner.slice(after));
        if (!rest.startsWith(',')) {
          throw new Unsupported(`sampler constructor without a sampler: ${first80(inner)}`);
        }
        rest = lstrip(rest.slice(1));
        const sm = rx(String.raw`(\w+)\s*\[`).match(rest);
        if (!sm || !samplers.has(sm.group(1))) {
          throw new Unsupported(`sampler constructor with a non-table sampler: ${first80(inner)}`);
        }
        const [sExpr, sAfter] = arrayIndex(rest, sm.end(1));
        if (strip(rest.slice(sAfter))) {
          throw new Unsupported(`unexpected sampler constructor arguments: ${first80(inner)}`);
        }
        out.push(text.slice(pos, m.start()));
        let v = null;
        if (bound) {
          const tOff = sharedWordOffset(tExpr, temps);
          const sOff = sharedWordOffset(sExpr, temps);
          if (tOff !== null && sOff !== null) {
            v = bind(m.group(0).slice(0, -1), tOff, sOff);
          }
        }
        out.push(v || `${m.group(0)}dkh(${tExpr}, ${sExpr}))`);
        pos = closeI + 1;
      } else {
        out.push(text.slice(pos, closeI + 1));
        pos = closeI + 1;
      }
    }
    text = out.join('');

    // T[t] used alone (texelFetch, textureSize, textureQueryLevels) -> sampler2D(uvec2(t, 0u))
    const nameRe = rx(String.raw`\b(` + [...textures.keys()].map(reEscape).join('|') + String.raw`)\b`);
    pos = 0;
    out = [];
    for (;;) {
      const m = nameRe.search(text, pos);
      if (!m) {
        out.push(text.slice(pos));
        break;
      }
      const idx = arrayIndex(text, m.end());
      if (idx === null) {
        throw new Unsupported(`texture table ${m.group(1)} used without an index`);
      }
      const [expr, after] = idx;
      out.push(text.slice(pos, m.start()));
      let v = null;
      if (bound) {
        const tOff = sharedWordOffset(expr, temps);
        if (tOff !== null) {
          v = bind(textures.get(m.group(1)), tOff, null);
        }
      }
      out.push(v || `${textures.get(m.group(1))}(uvec2(uint(${stripIndexMask(expr)}), 0u))`);
      pos = after;
    }
    text = out.join('');
  }
  for (const s of samplers) {
    if (rx(String.raw`\b` + reEscape(s) + String.raw`\b`).search(text)) {
      throw new Unsupported(`sampler table ${s} used outside a sampler constructor`);
    }
  }

  // ---- push constants -> std140 UBO
  let nPush;
  [text, nPush] = rx(String.raw`^layout\(push_constant, std430\) uniform (\w+)`, 'M').subn(
    (m) => `layout(std140, binding = ${PUSH_UBO_BINDING}) uniform ${m.group(1)}`, text);
  if (nPush) {
    const m = rx(String.raw`layout\(std140, binding = ${PUSH_UBO_BINDING}\) uniform \w+\n\{\n(.*?)\n\}`, 'S').search(text);
    if (m) {
      for (const line of m.group(1).split('\n')) {
        const lm = rx(String.raw`\s*(?:layout\(offset = \d+\) )?(\w+) \w+(\[\d+\])?;`).match(line);
        if (!lm) {
          throw new Unsupported(`push constant member not understood: ${strip(line)}`);
        }
        if (lm.group(2) && ['float', 'uint', 'int', 'vec2', 'uvec2', 'ivec2', 'bool'].includes(lm.group(1))) {
          throw new Unsupported(`push constant array with a std430-only stride: ${strip(line)}`);
        }
      }
    }
  }

  // ---- constant buffers
  text = rx(String.raw`layout\(set = (\d+), binding = (\d+), std140\) uniform`).sub((m) => {
    const s = pyInt(m.group(1));
    const b = pyInt(m.group(2));
    if (b !== 0n || !uboMap.has(s)) {
      throw new Unsupported(`constant buffer at set ${s} binding ${b} has no UBO binding (--ubo-map)`);
    }
    return `layout(binding = ${uboMap.get(s)}, std140) uniform`;
  }, text);

  // ---- a constant buffer vector's component chosen at run time
  const vecBlocks = new Map();
  for (const m of rx(String.raw`uniform \w+\n\{\n\s*(u?vec4|ivec4) v\[\d+\];\n\} (\w+);`).finditer(text)) {
    vecBlocks.set(m.group(2), m.group(1));
  }
  const picks = new Set();
  if (vecBlocks.size) {
    const nameRe = rx(String.raw`\b(` + [...vecBlocks.keys()].map(reEscape).join('|') + String.raw`)\.v\[`);
    let pos = 0;
    const out = [];
    for (;;) {
      const m = nameRe.search(text, pos);
      if (!m) {
        out.push(text.slice(pos));
        break;
      }
      const firstOpen = m.end() - 1;
      const firstClose = matchingOrRaise(text, firstOpen, '[', ']');
      const k = firstClose + 1;
      if (k < text.length && text[k] === '[') {
        const secondClose = matchingOrRaise(text, k, '[', ']');
        const comp = strip(text.slice(k + 1, secondClose));
        if (!rx(String.raw`\d+u?`).fullmatch(comp)) {
          const vtype = vecBlocks.get(m.group(1));
          picks.add(vtype);
          out.push(text.slice(pos, m.start()));
          out.push(`dk_pick_${vtype}(${text.slice(m.start(), firstClose + 1)}, uint(${comp}))`);
          pos = secondClose + 1;
          continue;
        }
      }
      out.push(text.slice(pos, firstClose + 1));
      pos = firstClose + 1;
    }
    text = out.join('');
  }
  if (picks.size) {
    const scalar = { vec4: 'float', uvec4: 'uint', ivec4: 'int' };
    const helpers = [...picks].sort(cmpStr).map((t) => `${scalar[t]} dk_pick_${t}(${t} v, uint i) { return v[i]; }\n`)
      .join('');
    const where = text.indexOf('\nvoid main()');
    if (where < 0) {
      throw new Unsupported('no main() for the component pick helpers');
    }
    text = text.slice(0, where + 1) + helpers + text.slice(where + 1);
  }

  // ---- storage buffers
  const ssboRe = rx(String.raw`layout\(set = (\d+), binding = (\d+), std430\) (readonly |writeonly |restrict )*buffer (\w+)\n\{(.*?)\n\} (\w+)(\[(\d+)\])?;`, 'S');
  const ssbos = ssboRe.finditer(text);
  const found = ssbos.map((m) => [pyInt(m.group(1)), pyInt(m.group(2)), m.start()])
    .sort((x, y) => cmpNum(x[0], y[0]) || cmpNum(x[1], y[1]) || cmpNum(x[2], y[2]));
  const slots = new Map();
  let nextSlot = 0n;
  for (const [s, b] of found) {
    if (s === RAW_WINDOW_SET) {
      slots.set(`${s},${b}`, b); // the address window (15) and the memexport buffer (14): fixed bindings
      continue;
    }
    slots.set(`${s},${b}`, nextSlot);
    const m = ssbos.filter((mm) => pyInt(mm.group(1)) === s && pyInt(mm.group(2)) === b)[0];
    nextSlot += m.group(8) ? pyInt(m.group(8)) : 1n;
  }
  if (nextSlot > 15n) {
    throw new Unsupported(`${nextSlot} storage buffers`);
  }
  text = ssboRe.sub((m) => {
    const slot = slots.get(`${pyInt(m.group(1))},${pyInt(m.group(2))}`);
    const quals = m.group(3) || '';
    const arr = m.group(7) || '';
    return `layout(binding = ${slot}, std430) ${quals}buffer ${m.group(4)}\n{${m.group(5)}\n} ${m.group(6)}${arr};`;
  }, text);

  // ---- specialization constants
  text = rx(String.raw`^layout\(constant_id = (\d+)\) const (\w+) (\w+) = ([^;]+);`, 'M').sub((m) => {
    const n = m.group(1);
    return `#ifndef SPIRV_CROSS_CONSTANT_ID_${n}\n#define SPIRV_CROSS_CONSTANT_ID_${n} ${m.group(4)}\n#endif\n` +
      `const ${m.group(2)} ${m.group(3)} = SPIRV_CROSS_CONSTANT_ID_${n};`;
  }, text);

  // ---- builtins
  text = rx(String.raw`\bgl_VertexIndex\b`).sub('gl_VertexID', text);
  text = rx(String.raw`\bgl_InstanceIndex\b`).sub('gl_InstanceID', text);
  for (const bad of ['gl_BaseInstance', 'gl_BaseVertex', 'subpassInput', 'spirv_instruction', 'buffer_reference',
    'push_constant', 'layout(set =', 'GL_EXT_buffer_reference', 'gl_DrawID']) {
    if (text.includes(bad)) {
      throw new Unsupported(`${bad} remains`);
    }
  }

  // ---- vertex inputs: locations 0..15 for uam, renumbered in order (the banjo-dk line's vin)
  let vin = [];
  if (stage === 'vert') {
    const inRe = rx(String.raw`^layout\(location = (\d+)\) in (\w+) (\w+)(\[\d+\])?;`, 'M');
    const decls = inRe.findall(text);
    if (decls.some((d) => d[3])) {
      throw new Unsupported('vertex input array');
    }
    vin = decls.map((d) => pyInt(d[0])).sort(cmpNum);
    if (vin.length > 16) {
      throw new Unsupported(`${vin.length} vertex inputs`);
    }
    const newOf = new Map();
    vin.forEach((old, i) => newOf.set(old, i));
    text = inRe.sub((m) => `layout(location = ${newOf.get(pyInt(m.group(1)))}) in ${m.group(2)} ${m.group(3)};`, text);
  }

  // ---- what the back end binds for this shader (the banjo-dk line)
  let uboMask = 0n;
  for (const m of rx(String.raw`layout\((?:std140, )?binding = (\d+)(?:, std140)?\) uniform`).finditer(text)) {
    uboMask |= 1n << pyInt(m.group(1));
  }
  let ssboMask = 0n;
  for (const m of rx(String.raw`layout\(binding = (\d+), std430\) (?:\w+ )*buffer \w+\n\{.*?\n\} \w+(?:\[(\d+)\])?;`, 'S')
    .finditer(text)) {
    const count = m.group(2) ? pyInt(m.group(2)) : 1n; // int(m.group(2) or 1)
    if (count > 0n) {
      ssboMask |= ((1n << count) - 1n) << pyInt(m.group(1)); // bits binding .. binding + count - 1
    }
  }
  const bindless = textures.size > 0 && (text.includes('dkh(') || text.includes('uvec2(uint('));
  let meta = `// banjo-dk ubo=0x${uboMask.toString(16)} ssbo=0x${ssboMask.toString(16)} tex=${bindless ? 1 : 0}`;
  if (vin.length) {
    meta += ` vin=${vin.join(',')}`;
  }
  if (bindings.size) {
    meta += ` texb=${[...bindings.values()].map((b) => `${b.k}:${b.t}:${b.s === null ? 65535 : b.s}`).join(',')}`;
  }

  // ---- extensions
  const lines = text.split('\n').filter((l) => !DROPPED_EXTENSIONS.some((e) => l.startsWith(`#extension ${e}`)));
  if (!at(lines, 0).startsWith('#version')) {
    throw new Unsupported('no #version line');
  }
  const extra = [meta];
  if (bindless) {
    extra.push('#extension GL_ARB_bindless_texture : require');
    if (samplerWords === 'handle') {
      extra.push('#define dkh(t, s) uvec2((uint(t) & 0xFFFFFu) | (uint(s) & 0xFFF00000u), 0u)');
    } else {
      extra.push('#define dkh(t, s) uvec2(uint(t) | (uint(s) << 20u), 0u)');
    }
  }
  for (const b of bindings.values()) {
    extra.push(`layout(binding = ${b.k}) uniform ${b.stype} dk_tex_b${b.k};`);
  }
  lines.splice(1, 0, ...extra);
  return [lines.join('\n'), notes];
}

// deko3d_glsl.variant_header({constant_id: value}), integer values
export function variantHeader(specValues) {
  const entries = (specValues instanceof Map ? [...specValues] : Object.entries(specValues))
    .map(([k, v]) => [BigInt(k), BigInt(v)]).sort((x, y) => cmpNum(x[0], y[0]));
  return entries.map(([k, v]) => `#define SPIRV_CROSS_CONSTANT_ID_${k} ${v}u\n`).join('');
}

// convert() with deko3d_shaders.py's arguments (the game shaders: DEFAULT_UBO_MAP, sampler words 'handle')
export function convertGlsl(vkText, stage, options = {}) {
  return convert(vkText, stage, options.uboMap ?? DEFAULT_UBO_MAP, options.samplerWords ?? 'handle')[0];
}

// ---------------------------------------------------------------------------------------------------------------------
// tools/deko3d_glsl_opt.py: helpers

// deko3d_glsl_opt.matching (-1 when unbalanced)
function matching(text, openIndex, openCh, closeCh) {
  let depth = 0;
  for (let i = openIndex; i < text.length; i++) {
    const c = i < 0 ? at(text, i) : text[i];
    if (c === openCh) {
      depth += 1;
    } else if (c === closeCh) {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

// main_span: [start, end] of main()'s body, or null
function mainSpan(text) {
  const head = '\nvoid main()\n{';
  const m = text.indexOf(head);
  if (m < 0) {
    return null;
  }
  const openI = m + head.length - 1;
  const closeI = matching(text, openI, '{', '}');
  if (closeI < 0) {
    return null;
  }
  return [openI + 1, closeI];
}

// insert_before_main
function insertBeforeMain(text, code) {
  const where = text.indexOf('\nvoid main()');
  if (where < 0) {
    return text;
  }
  return text.slice(0, where + 1) + code + text.slice(where + 1);
}

// insert_globals: after #version and the banjo-dk / extension / dkh lines
function insertGlobals(text, code) {
  const lines = text.split('\n');
  let k = 1;
  while (k < lines.length && (lines[k].startsWith('//') || lines[k].startsWith('#extension') ||
    lines[k].startsWith('#define dkh'))) {
    k++;
  }
  lines.splice(k, 0, ...rstrip(code, '\n').split('\n'));
  return lines.join('\n');
}

// map_main
function mapMain(text, fn) {
  const span = mainSpan(text);
  if (!span) {
    return text;
  }
  const [a, b] = span;
  return text.slice(0, a) + fn(text.slice(a, b)) + text.slice(b);
}

// _split_args
function splitArgs(text) {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '(' || c === '[') {
      depth++;
    } else if (c === ')' || c === ']') {
      depth--;
    } else if (c === ',' && depth === 0) {
      out.push(text.slice(start, i));
      start = i + 1;
    }
  }
  out.push(text.slice(start));
  return out;
}

// _unparen
function unparen(e) {
  e = strip(e);
  while (e.startsWith('(') && matching(e, 0, '(', ')') === e.length - 1) {
    e = strip(e.slice(1, -1));
  }
  return e;
}

const isWs = (c) => c === ' ' || c === '\t' || c === '\n'; // `c in ' \t\n'`

// ---------------------------------------------------------------------------------------------------------------------
// pass: sel

const SEL_TYPES = [['float', 'mix(b, a, c)'], ['vec2', 'mix(b, a, bvec2(c))'], ['vec3', 'mix(b, a, bvec3(c))'],
  ['vec4', 'mix(b, a, bvec4(c))'], ['int', 'mix(b, a, c)'], ['ivec2', 'mix(b, a, bvec2(c))'],
  ['ivec3', 'mix(b, a, bvec3(c))'], ['ivec4', 'mix(b, a, bvec4(c))'], ['uint', 'mix(b, a, c)'],
  ['uvec2', 'mix(b, a, bvec2(c))'], ['uvec3', 'mix(b, a, bvec3(c))'], ['uvec4', 'mix(b, a, bvec4(c))'],
  ['bool', 'mix(b, a, c)'], ['bvec2', 'mix(b, a, bvec2(c))'], ['bvec3', 'mix(b, a, bvec3(c))'],
  ['bvec4', 'mix(b, a, bvec4(c))']];
const SEL_HELPERS = SEL_TYPES.map(([t, body]) => `${t} dk_sel(bool c, ${t} a, ${t} b) { return ${body}; }\n`).join('');

// _is_assignment
function isAssignment(s, i) {
  if (i + 1 < s.length && s[i + 1] === '=') {
    return false;
  }
  const prev = i > 0 ? s[i - 1] : '';
  if (prev === '=' || prev === '!') {
    return false;
  }
  if (prev === '<' || prev === '>') {
    return i > 1 && s[i - 2] === prev;
  }
  return true;
}

// _ternary_at: [start, colon, end] of the conditional expression of the '?' at q, or null
function ternaryAt(s, q) {
  let depth = 0;
  let i = q - 1;
  while (i >= 0) {
    const c = s[i];
    if (c === ')' || c === ']') {
      depth++;
    } else if (c === '(' || c === '[') {
      if (depth === 0) {
        break;
      }
      depth--;
    } else if (depth === 0) {
      if (',;{}?:'.includes(c)) {
        break;
      }
      if (c === '=' && isAssignment(s, i)) {
        break;
      }
    }
    i--;
  }
  let start = i + 1;
  if (rx(String.raw`\s*return\b`).match(s.slice(start, q))) {
    start = start + index(s.slice(start, q), 'return') + 'return'.length;
  }
  depth = 0;
  let pending = 0;
  let j = q + 1;
  let colon = -1;
  while (j < s.length) {
    const c = s[j];
    if (c === '(' || c === '[') {
      depth++;
    } else if (c === ')' || c === ']') {
      depth--;
      if (depth < 0) {
        return null;
      }
    } else if (depth === 0) {
      if (c === '?') {
        pending++;
      } else if (c === ':') {
        if (pending === 0) {
          colon = j;
          break;
        }
        pending--;
      } else if (c === ',' || c === ';') {
        return null;
      }
    }
    j++;
  }
  if (colon < 0) {
    return null;
  }
  depth = 0;
  pending = 0;
  let k = colon + 1;
  while (k < s.length) {
    const c = s[k];
    if (c === '(' || c === '[') {
      depth++;
    } else if (c === ')' || c === ']') {
      if (depth === 0) {
        break;
      }
      depth--;
    } else if (depth === 0) {
      if (c === ',' || c === ';') {
        break;
      }
      if (c === '?') {
        pending++;
      } else if (c === ':') {
        if (pending === 0) {
          break;
        }
        pending--;
      }
    }
    k++;
  }
  return [start, colon, k];
}

function questionMarks(line) {
  const qs = [];
  for (let k = line.indexOf('?'); k >= 0; k = line.indexOf('?', k + 1)) {
    qs.push(k);
  }
  return qs;
}

// pass_sel
function passSel(text) {
  let count = 0;
  const body = (s) => {
    const lines = s.split('\n');
    for (let n = 0; n < lines.length; n++) {
      let line = lines[n];
      if (!line.includes('?') || lstrip(line).startsWith('#') || lstrip(line).startsWith('//')) {
        continue;
      }
      let guard = 0;
      while (line.includes('?') && guard < 400) {
        guard++;
        let done = false;
        for (const q of questionMarks(line)) {
          const t = ternaryAt(line, q);
          if (t === null) {
            continue;
          }
          const [start, colon, end] = t;
          const cond = line.slice(start, q);
          const a = line.slice(q + 1, colon);
          const b = line.slice(colon + 1, end);
          if (cond.includes('?') || a.includes('?') || b.includes('?')) {
            continue;
          }
          const lead = cond.slice(0, cond.length - lstrip(cond).length);
          const trail = b.slice(rstrip(b).length);
          line = line.slice(0, start) + lead + `dk_sel(${strip(cond)}, ${strip(a)}, ${strip(b)})` + trail +
            line.slice(end);
          count++;
          done = true;
          break;
        }
        if (!done) {
          break;
        }
      }
      lines[n] = line;
    }
    return lines.join('\n');
  };
  let out = mapMain(text, body);
  if (count) {
    out = insertBeforeMain(out, SEL_HELPERS);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// passes: alpha, scale1, fragscale

const ALPHA_WORD = 'g_UboShared.v[34u].w';
const ALPHA_DECL = '#ifndef SPIRV_CROSS_CONSTANT_ID_903\n#define SPIRV_CROSS_CONSTANT_ID_903 0u\n#endif\n' +
  'const uint g_banjoAlphaFunc = SPIRV_CROSS_CONSTANT_ID_903;\n' +
  '#define DK_ALPHA_FUNC ((g_banjoAlphaFunc != 0u) ? (g_banjoAlphaFunc - 1u) : g_UboShared.v[34u].w)\n';

// pass_alpha
function passAlpha(text) {
  if (!text.includes(ALPHA_WORD)) {
    return text;
  }
  const span = mainSpan(text);
  if (!span) {
    return text;
  }
  const [a, b] = span;
  const body = replaceAll(text.slice(a, b), ALPHA_WORD, 'DK_ALPHA_FUNC');
  text = text.slice(0, a) + body + text.slice(b);
  return insertBeforeMain(text, ALPHA_DECL);
}

const SCALE_CHAIN_RE = String.raw`\((\w+) == 1u\) \? 0\.666666686534881591796875 : \(\(\1 == 2u\) \? 1\.5 : \(\(\1 == 3u\) \? 2\.0 : ` +
  String.raw`\(\(\1 == 4u\) \? 3\.0 : \(\(\1 == 5u\) \? 4\.0 : \(\(\1 == 6u\) \? 6\.0 : ` +
  String.raw`\(\(\1 == 7u\) \? 1\.33333337306976318359375 : 1\.0\)\)\)\)\)\)`;
const SCALE_CODE_RE = String.raw`^(\s*uint (_\d+) = )\(([^;]*?) >> 26u\) & 7u;$`;
const ROUND_RE = String.raw`roundEven\((vec[234])\((uvec[234])\(textureSize\(([\w]+, \d+)\)\)\) / vec[234]\(1\.0\)\)`;
const ROUNDTRIP_RE = String.raw`(uvec[234])\((vec[234])\(\1\(textureSize\(([\w]+, \d+)\)\)\)\)`;
const SCALE_WORD = 'uintBitsToFloat(g_UboShared.v[83u].z)';

// pass_scale1
function passScale1(text) {
  text = rx(SCALE_CODE_RE, 'M').sub((m) => `${m.group(1)}0u;`, text);
  text = rx(SCALE_CHAIN_RE).sub('1.0', text);
  text = rx(ROUND_RE).sub((m) => `${m.group(1)}(${m.group(2)}(textureSize(${m.group(3)})))`, text);
  text = rx(ROUNDTRIP_RE).sub((m) => `${m.group(1)}(textureSize(${m.group(3)}))`, text);
  return text;
}

// pass_fragscale
function passFragscale(text) {
  const span = mainSpan(text);
  if (span) {
    const [a, b] = span;
    text = text.slice(0, a) + replaceAll(text.slice(a, b), SCALE_WORD, '1.0') + text.slice(b);
  }
  return text;
}

// ---------------------------------------------------------------------------------------------------------------------
// pass: alphamask

const ALPHA_HEAD = '!(dk_sel((DK_ALPHA_FUNC == 0u), false, (dk_sel((DK_ALPHA_FUNC == 1u), (';
const ALPHA_CMP_RE = String.raw`^\(dk_sel\(\(DK_ALPHA_FUNC == 0u\), false, \(dk_sel\(\(DK_ALPHA_FUNC == 1u\), \((\S+) < (\S+)\), ` +
  String.raw`\(dk_sel\(\(DK_ALPHA_FUNC == 2u\), \(\1 == \2\), \(dk_sel\(\(DK_ALPHA_FUNC == 3u\), \(\1 <= \2\), ` +
  String.raw`\(dk_sel\(\(DK_ALPHA_FUNC == 4u\), \(\1 > \2\), \(dk_sel\(\(DK_ALPHA_FUNC == 5u\), \(\1 != \2\), ` +
  String.raw`\(dk_sel\(\(DK_ALPHA_FUNC == 6u\), \(\1 >= \2\), true\)\)[)]*$`;
const ALPHA_HELPER = 'bool dk_alpha_pass(uint f, float a, float r)\n{\n' +
  '    // D3D compare functions are a mask: 1 less, 2 equal, 4 greater (0 never, 7 always); with a NaN only\n' +
  '    // not-equal (5) and always (7) pass.\n' +
  '    uint m = mix(mix(mix(5u, 2u, a == r), 4u, a > r), 1u, a < r);\n' +
  '    return mix((f & m) != 0u, (f & 5u) == 5u, m == 5u);\n}\n';

// pass_alphamask
function passAlphamask(text) {
  const out = [];
  let pos = 0;
  let n = 0;
  for (;;) {
    const where = find(text, ALPHA_HEAD, pos);
    if (where < 0) {
      out.push(text.slice(pos));
      break;
    }
    const close = matching(text, where + 1, '(', ')');
    const inner = text.slice(where + 1, close + 1);
    const m = rx(ALPHA_CMP_RE).match(inner);
    if (close < 0 || !m) {
      out.push(text.slice(pos, where + 1));
      pos = where + 1;
      continue;
    }
    out.push(text.slice(pos, where));
    out.push(`!((g_banjoAlphaFunc != 0u) ? ${inner} : dk_alpha_pass(g_UboShared.v[34u].w, ${m.group(1)}, ${m.group(2)}))`);
    pos = close + 1;
    n++;
  }
  if (!n) {
    return text;
  }
  return insertBeforeMain(out.join(''), ALPHA_HELPER);
}

// ---------------------------------------------------------------------------------------------------------------------
// pass: pred

// pass_pred
function passPred(text) {
  const span = mainSpan(text);
  if (!span) {
    return text;
  }
  const [a, b] = span;
  const lines = text.slice(a, b).split('\n');
  const bools = new Set(rx(String.raw`^\s*bool (_\d+)\b`, 'M').findall(text.slice(a, b)));
  if (!bools.size) {
    return text;
  }
  const closeOf = new Map();
  const opened = [];
  lines.forEach((line, n) => {
    const st = strip(line);
    if (st === '{') {
      opened.push(n);
    } else if ((st === '}' || st.startsWith('} while')) && opened.length) {
      closeOf.set(opened.pop(), n);
    }
  });
  const assignAt = new Map();
  const assignRe = rx(String.raw`(?<![\w.])(_\d+)\s*=[^=]`);
  lines.forEach((line, n) => {
    for (const m of assignRe.finditer(line)) {
      if (bools.has(m.group(1))) {
        if (!assignAt.has(m.group(1))) {
          assignAt.set(m.group(1), []);
        }
        assignAt.get(m.group(1)).push(n);
      }
    }
  });
  const stable = (v, openLine) => {
    const close = closeOf.has(openLine) ? closeOf.get(openLine) : lines.length;
    return !(assignAt.get(v) || []).some((k) => openLine < k && k < close);
  };

  const ifRe = rx(String.raw`^(\s*)(?:else )?if \((!?)(_\d+)\)$`);
  const useRe = rx(String.raw`(?<![\w.])(_\d+)(?![\w\[])(?!\s*=[^=])`);
  const stack = []; // [indent of the block's braces, var or null, value inside]
  let pending = null; // [indent, var, value] of an if or else whose '{' comes next
  let lastIf = new Map(); // indent -> [var, value] of the if just closed (for its else)
  let changed = 0;
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n];
    const stripped = strip(line);
    const indent = line.length - lstrip(line).length;
    const known = new Map();
    for (const [, v, val] of stack) {
      if (v !== null) {
        known.set(v, val);
      }
    }
    const m = ifRe.match(line);
    if (m && known.has(m.group(3))) {
      const val = known.get(m.group(3)) !== (m.group(2) === '!');
      lines[n] = `${m.group(1)}${stripped.startsWith('else') ? 'else ' : ''}if (${val ? 'true' : 'false'})`;
      changed++;
    }
    if (m && bools.has(m.group(3))) {
      pending = [indent, m.group(3), m.group(2) !== '!'];
      continue;
    }
    if (stripped === 'else' && lastIf.has(indent)) {
      const [v, val] = lastIf.get(indent);
      lastIf.delete(indent);
      pending = [indent, v, !val];
      continue;
    }
    if (stripped === '{') {
      if (pending && pending[0] === indent && stable(pending[1], n)) {
        stack.push(pending);
      } else {
        stack.push([indent, null, null]);
      }
      pending = null;
      continue;
    }
    pending = null;
    if (stripped === '}' || stripped.startsWith('} while')) {
      if (stack.length) {
        const [ind, v, val] = stack.pop();
        if (v !== null && stripped === '}') {
          lastIf.set(ind, [v, val]);
        }
      }
      continue;
    }
    lastIf = new Map([...lastIf].filter(([k]) => k < indent));
    if (known.size) {
      const nw = useRe.sub((mm) => {
        const v = mm.group(1);
        if (known.has(v)) {
          return known.get(v) ? 'true' : 'false';
        }
        return mm.group(0);
      }, line);
      if (nw !== line) {
        lines[n] = nw;
        changed++;
      }
    }
  }
  if (!changed) {
    return text;
  }
  return text.slice(0, a) + lines.join('\n') + text.slice(b);
}

// ---------------------------------------------------------------------------------------------------------------------
// passes: tess, vsout, vszero, pszero

const TESS_WORD = 'g_UboShared.v[65u].x';
const TESS_DECL = '#ifndef SPIRV_CROSS_CONSTANT_ID_904\n#define SPIRV_CROSS_CONSTANT_ID_904 0u\n#endif\n' +
  'const uint g_banjoTessKind = SPIRV_CROSS_CONSTANT_ID_904;\n' +
  '#define DK_TESS_KIND ((g_banjoTessKind != 0u) ? (g_banjoTessKind - 1u) : g_UboShared.v[65u].x)\n';

// pass_tess
function passTess(text) {
  if (!text.includes(TESS_WORD)) {
    return text;
  }
  const span = mainSpan(text);
  if (!span) {
    return text;
  }
  const [a, b] = span;
  text = text.slice(0, a) + replaceAll(text.slice(a, b), TESS_WORD, 'DK_TESS_KIND') + text.slice(b);
  return insertBeforeMain(text, TESS_DECL);
}

const VSOUT_DECL = '#ifndef SPIRV_CROSS_CONSTANT_ID_905\n#define SPIRV_CROSS_CONSTANT_ID_905 4294967295u\n#endif\n' +
  'const uint g_banjoVsOutputs = SPIRV_CROSS_CONSTANT_ID_905;\n';
const VSOUT_RE = String.raw`^layout\(location = (\d+)\) out (\w+) (\w+);$`;

// pass_vsout
function passVsout(text) {
  const outs = rx(VSOUT_RE, 'M').finditer(text).filter((m) => pyInt(m.group(1)) < 32n)
    .map((m) => [pyInt(m.group(1)), m.group(3)]);
  if (!outs.length) {
    return text;
  }
  const span = mainSpan(text);
  if (!span) {
    return text;
  }
  const [a, b] = span;
  let body = text.slice(a, b);
  let wrapped = 0;
  for (const [loc, name] of outs) {
    const e = reEscape(name);
    const uses = rx(String.raw`(?<![\w.])` + e + String.raw`\b`).count(body);
    const writes = rx(String.raw`^\s*` + e + String.raw`(?:\.[xyzw]+)?\s*=[^=][^;]*;$`, 'M').count(body);
    if (!writes || writes !== uses) {
      continue; // read back somewhere, or written in a form not handled: kept
    }
    body = rx(String.raw`^(\s*)(` + e + String.raw`(?:\.[xyzw]+)?\s*=[^=][^;]*;)$`, 'M').sub(
      (m) => `${m.group(1)}if ((g_banjoVsOutputs & ${1n << loc}u) != 0u) { ${m.group(2)} }`, body);
    wrapped++;
  }
  if (!wrapped) {
    return text;
  }
  text = text.slice(0, a) + body + text.slice(b);
  return insertBeforeMain(text, VSOUT_DECL);
}

const ZERO_RE = String.raw`^(?:(?:vec[234])\()?0\.0\)?$`;
const PSIN_RE = String.raw`^layout\(location = (\d+)\) in (\w+) (\w+);$`;
const PSZERO_DECL = '#ifndef SPIRV_CROSS_CONSTANT_ID_906\n#define SPIRV_CROSS_CONSTANT_ID_906 0u\n#endif\n' +
  'const uint g_banjoPsZeroIn = SPIRV_CROSS_CONSTANT_ID_906;\n';

// pass_vszero
function passVszero(text) {
  const span = mainSpan(text);
  if (!span) {
    return text;
  }
  const body = text.slice(span[0], span[1]);
  let mask = 0n;
  for (const m of rx(VSOUT_RE, 'M').finditer(text)) {
    const loc = pyInt(m.group(1));
    const name = m.group(3);
    if (loc >= 32n) {
      continue;
    }
    const e = reEscape(name);
    const uses = rx(String.raw`(?<![\w.])` + e + String.raw`\b`).count(body);
    const writes = rx(String.raw`^\s*` + e + String.raw` = ([^;]*);$`, 'M').findall(body);
    if (uses === 1 && writes.length === 1 && rx(ZERO_RE).match(strip(writes[0]))) {
      mask |= 1n << loc;
    }
  }
  if (!mask) {
    return text;
  }
  const lines = text.split('\n');
  lines.splice(1, 0, `// banjo-vszero=0x${mask.toString(16)}`);
  return lines.join('\n');
}

// pass_pszero
function passPszero(text) {
  const ins = rx(PSIN_RE, 'M').finditer(text).filter((m) => pyInt(m.group(1)) < 32n)
    .map((m) => [pyInt(m.group(1)), m.group(2), m.group(3)]);
  if (!ins.length) {
    return text;
  }
  const span = mainSpan(text);
  if (!span) {
    return text;
  }
  const [a, b] = span;
  let body = text.slice(a, b);
  let macros = '';
  for (const [loc, typ, name] of ins) {
    const nameRe = rx(String.raw`(?<![\w.])` + reEscape(name) + String.raw`\b`);
    if (!nameRe.search(body)) {
      continue;
    }
    body = nameRe.sub(`DK_IN_${name}`, body);
    macros += `#define DK_IN_${name} (((g_banjoPsZeroIn & ${1n << loc}u) != 0u) ? ${typ}(0.0) : ${name})\n`;
  }
  if (!macros) {
    return text;
  }
  text = text.slice(0, a) + body + text.slice(b);
  return insertBeforeMain(text, PSZERO_DECL + macros);
}

// ---------------------------------------------------------------------------------------------------------------------
// passes: bonerow, predmul, sext, bool01

const BONEROW_RE = String.raw`mix\(vec4\(0\.0\), (g_Ubo(?:Vertex|Pixel))\.v\[min\((_\d+), 255u\)\], bvec4\(\2 < 256u\)\)`;

// pass_bonerow
function passBonerow(text) {
  let [out, n] = rx(BONEROW_RE).subn((m) => `${m.group(1)}.v[min(${m.group(2)}, 256u)]`, text);
  if (!n) {
    return text;
  }
  for (const block of new Set(rx(BONEROW_RE).finditer(text).map((m) => m.group(1)))) {
    out = rx(String.raw`(uniform type_ConstantBuffer_RenutUboFloat\n\{\n\s*vec4 v\[)256(\];\n\} ` + block + ';)')
      .sub((m) => `${m.group(1)}257${m.group(2)}`, out);
  }
  return out;
}

const PREDMUL_RE = String.raw`mix\((_\d+(?:\.[xyzw]+)?), \1 \* (_\d+\.([xyzw])\3{1,3}|vec[234]\([0-9.e+-]+\)), ` +
  String.raw`bvec([234])\((_\d+)\)\)`;

// pass_predmul
function passPredmul(text) {
  const rep = (m) => {
    const n = m.group(4);
    return `(${m.group(1)} * mix(vec${n}(1.0), ${m.group(2)}, bvec${n}(${m.group(5)})))`;
  };
  return mapMain(text, (body) => rx(PREDMUL_RE).sub(rep, body));
}

const SEXT_RE = String.raw`int\(\(\((_\d+) >> (\d+)u\) & (\d+)u\) << (\d+)u\) >> (\d+)`;
const bitLength = (v) => (v === 0n ? 0n : BigInt(v.toString(2).length));

// pass_sext
function passSext(text) {
  const rep = (m) => {
    const x = m.group(1);
    const sh = pyInt(m.group(2));
    const mask = pyInt(m.group(3));
    const k1 = pyInt(m.group(4));
    const k2 = pyInt(m.group(5));
    const n = bitLength(mask);
    if (mask !== (1n << n) - 1n || k1 !== k2 || k1 !== 32n - n || sh + n > 32n || n === 0n) {
      return m.group(0);
    }
    return `bitfieldExtract(int(${x}), ${sh}, ${n})`;
  };
  return mapMain(text, (body) => rx(SEXT_RE).sub(rep, body));
}

const BOOL01 = new Map([['1.0\u00000.0', 'float({c})'], ['0.0\u00001.0', 'float(!({c}))'], ['1u\u00000u', 'uint({c})'],
  ['0u\u00001u', 'uint(!({c}))'], ['1\u00000', 'int({c})'], ['0\u00001', 'int(!({c}))'],
  ['true\u0000false', '({c})'], ['false\u0000true', '(!({c}))']]);

// pass_bool01
function passBool01(text) {
  const body = (s) => {
    const lines = s.split('\n');
    for (let n = 0; n < lines.length; n++) {
      let line = lines[n];
      if (!line.includes('?')) {
        continue;
      }
      let guard = 0;
      while (guard < 200) {
        guard++;
        let done = false;
        for (const q of questionMarks(line)) {
          const t = ternaryAt(line, q);
          if (t === null) {
            continue;
          }
          const [start, colon, end] = t;
          const cond = line.slice(start, q);
          const x = strip(line.slice(q + 1, colon));
          const y = strip(line.slice(colon + 1, end));
          const form = x.includes('\u0000') ? undefined : BOOL01.get(`${x}\u0000${y}`);
          if (form === undefined || cond.includes('?')) {
            continue;
          }
          const lead = cond.slice(0, cond.length - lstrip(cond).length);
          const elsePart = line.slice(colon + 1, end);
          const trail = elsePart.slice(rstrip(elsePart).length);
          line = line.slice(0, start) + lead + form.split('{c}').join(strip(cond)) + trail + line.slice(end);
          done = true;
          break;
        }
        if (!done) {
          break;
        }
      }
      lines[n] = line;
    }
    return lines.join('\n');
  };
  return mapMain(text, body);
}

// ---------------------------------------------------------------------------------------------------------------------
// pass: earlyhoist

const EARLY_IF_RE = String.raw`\n([ \t]*)if \(DK_ALPHA_FUNC != 7u\)\n[ \t]*\{`;
const ASSIGNED_RE = String.raw`\b(_\d+)(?:\.[xyzw]+)?\s*(?:[-+*/%&|^]|<<|>>)?=(?!=)`;

// _next_statement: [start, end] of the statement at 'at', or null
function nextStatement(body, at0) {
  const n = body.length;
  let i = at0;
  while (i < n && isWs(body[i])) {
    i++;
  }
  if (i >= n || body[i] === '}') {
    return null;
  }
  if (rx(String.raw`do\s*\{`).match(body.slice(i, i + 8))) {
    const openI = index(body, '{', i);
    const closeI = matching(body, openI, '{', '}');
    if (closeI < 0) {
      return null;
    }
    const m = rx(String.raw`\s*while\s*\(\s*false\s*\)\s*;`).match(body.slice(closeI + 1));
    if (!m) {
      return null;
    }
    return [i, closeI + 1 + m.end()];
  }
  if (rx(String.raw`(if|for|while|switch|return|discard|break|continue|else)\b`).match(body.slice(i)) || body[i] === '{') {
    return null;
  }
  let depth = 0;
  for (let j = i; j < n; j++) {
    const c = body[j];
    if (c === '(' || c === '{' || c === '[') {
      depth++;
    } else if (c === ')' || c === '}' || c === ']') {
      depth--;
      if (depth < 0) {
        return null;
      }
    } else if (c === ';' && depth === 0) {
      return [i, j + 1];
    }
  }
  return null;
}

// pass_earlyhoist
function passEarlyhoist(text) {
  let changed = false;
  const body = (b) => {
    const m = rx(EARLY_IF_RE).search(b);
    if (!m) {
      return b;
    }
    const openI = index(b, '{', m.end() - 1);
    const closeI = matching(b, openI, '{', '}');
    if (closeI < 0) {
      return b;
    }
    const early = b.slice(m.start() + 1, closeI + 1);
    const stmts = [];
    let pos = closeI + 1;
    for (;;) {
      const st = nextStatement(b, pos);
      if (!st) {
        return b;
      }
      stmts.push(st);
      pos = st[1];
      if (b.slice(st[0], st[0] + 2) === 'do') {
        break;
      }
      if (stmts.length > 12) {
        return b;
      }
    }
    const start = stmts[0][0];
    const end = at(stmts, -1)[1];
    const region = b.slice(start, end);
    if (rx(String.raw`\b(discard|return)\b|\bout_var_|gl_FragDepth|\bdFd[xy]|\bfwidth`).search(region)) {
      return b;
    }
    const declaredInEarly = new Set(
      rx(String.raw`\b(?:float|int|uint|bool|[biu]?vec[234]|mat[234])\s+(_\d+)\b`).findall(early));
    const assigned = new Set(rx(ASSIGNED_RE).findall(early).filter((v) => !declaredInEarly.has(v)));
    if (rx(String.raw`\b_\d+\b`).findall(region).some((v) => assigned.has(v))) {
      return b;
    }
    const texRegion = new Set(rx(String.raw`\btexture\w*\((dk_tex_b\d+)`).findall(region));
    const texEarly = new Set(rx(String.raw`\btexture\w*\((dk_tex_b\d+)`).findall(early));
    if (![...texRegion].some((t) => texEarly.has(t))) {
      return b;
    }
    const indent = m.group(1);
    const decls = [];
    const inner = [];
    for (const [a0, a1] of stmts) {
      let st = b.slice(a0, a1);
      const d = rx(String.raw`((?:float|int|uint|bool|[biu]?vec[234]|mat[234])\s+)(_\d+)\s*(=|;)`).match(st);
      if (!d && rx(String.raw`(const\s+)?(float|int|uint|bool|[biu]?vec[234]|mat[234]|[biu]?vec\d|\w+\s+_\d+\s*\[)\b`)
        .match(st)) {
        return b; // a declaration this does not split (const, array): left where it is
      }
      if (d) {
        decls.push(`${d.group(1)}${d.group(2)};`);
        st = d.group(3) === ';' ? '' : st.slice(d.group(1).length);
      }
      if (st) {
        inner.push(st);
      }
    }
    const innerText = inner.map((x) => replaceAll(x, '\n', '\n    ')).join(`\n${indent}    `);
    const place = (cond) => `${indent}if (g_banjoEarlyHoist ${cond} 0u)\n${indent}{\n${indent}    ${innerText}\n${indent}}`;
    changed = true;
    const head = decls.map((d) => `${indent}${d}\n`).join('');
    return b.slice(0, m.start() + 1) + head + place('!=') + '\n' + b.slice(m.start() + 1, closeI + 1) + '\n' +
      place('==') + b.slice(end);
  };
  let out = mapMain(text, body);
  if (changed) {
    out = insertGlobals(out, '#ifndef SPIRV_CROSS_CONSTANT_ID_907\n#define SPIRV_CROSS_CONSTANT_ID_907 1u\n#endif\n' +
      'const uint g_banjoEarlyHoist = SPIRV_CROSS_CONSTANT_ID_907;\n');
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// pass: ifmerge

const IF_VAR_RE = String.raw`\n([ \t]*)if \((!?)(_\d+)\)\n\1\{`;
const DECL_ONLY_RE = String.raw`\n([ \t]*)(?:float|int|uint|bool|[biu]?vec[234]|mat[234]) _\d+;`;

// _if_end: [then body, else body or null, end index], or null
function ifEnd(b, m) {
  const openI = index(b, '{', m.end() - 1);
  const closeI = matching(b, openI, '{', '}');
  if (closeI < 0) {
    return null;
  }
  const thenBody = b.slice(openI + 1, closeI);
  const indent = m.group(1);
  const em = rx(String.raw`\n` + reEscape(indent) + String.raw`else\n` + reEscape(indent) + String.raw`\{`)
    .match(b.slice(closeI + 1));
  if (!em) {
    return [thenBody, null, closeI + 1];
  }
  const eo = closeI + 1 + em.end() - 1;
  const ec = matching(b, eo, '{', '}');
  if (ec < 0) {
    return null;
  }
  return [thenBody, b.slice(eo + 1, ec), ec + 1];
}

// pass_ifmerge
function passIfmerge(text) {
  const body = (b) => {
    let pos = 0;
    for (;;) {
      const m = rx(IF_VAR_RE).search(b, pos);
      if (!m) {
        return b;
      }
      const first = ifEnd(b, m);
      if (!first) {
        pos = m.end();
        continue;
      }
      const [then1, else1, end1] = first;
      const indent = m.group(1);
      const neg = m.group(2);
      const v = m.group(3);
      let pos2 = end1;
      const decls = [];
      for (;;) {
        const dm = rx(DECL_ONLY_RE).match(b, pos2);
        if (!dm || dm.group(1) !== indent) {
          break;
        }
        decls.push(strip(b.slice(pos2 + 1, dm.end())));
        pos2 = dm.end();
      }
      const m2 = rx(IF_VAR_RE).match(b, pos2);
      const assigned = rx(String.raw`\b` + reEscape(v) + String.raw`\s*(?:[-+*/%&|^]|<<|>>)?=(?!=)`);
      if (!m2 || m2.group(1) !== indent || m2.group(2) !== neg || m2.group(3) !== v ||
        assigned.search(then1) || (else1 !== null && assigned.search(else1))) {
        pos = m.end();
        continue;
      }
      const second = ifEnd(b, m2);
      if (!second) {
        pos = m.end();
        continue;
      }
      const [then2, else2, end2] = second;
      let merged = decls.map((d) => `\n${indent}${d}`).join('') +
        `\n${indent}if (${neg}${v})\n${indent}{${rstrip(then1)}${rstrip(then2)}\n${indent}}`;
      if (else1 !== null || else2 !== null) {
        merged += `\n${indent}else\n${indent}{${rstrip(else1 || '')}${rstrip(else2 || '')}\n${indent}}`;
      }
      b = b.slice(0, m.start()) + merged + b.slice(end2);
      pos = m.start(); // a third may follow
    }
  };
  return mapMain(text, body);
}

// ---------------------------------------------------------------------------------------------------------------------
// pass: dowhile

const DO_RE = String.raw`\n([ \t]*)do\n\1\{`;

// _statements: the top-level statements of a block's text as [start, end] spans, or null
function statements(body) {
  const out = [];
  let i = 0;
  const n = body.length;
  for (;;) {
    while (i < n && isWs(body[i])) {
      i++;
    }
    if (i >= n) {
      return out;
    }
    if (body[i] === '{') {
      const j = matching(body, i, '{', '}');
      if (j < 0) {
        return null;
      }
      out.push([i, j + 1]);
      i = j + 1;
      continue;
    }
    const m = rx(String.raw`(if|for|while|switch)\s*\(`).match(body.slice(i));
    if (m) {
      const p0 = i + m.end() - 1;
      const p1 = matching(body, p0, '(', ')');
      if (p1 < 0) {
        return null;
      }
      let k = p1 + 1;
      while (k < n && isWs(body[k])) {
        k++;
      }
      if (k >= n || body[k] !== '{') {
        return null;
      }
      let e = matching(body, k, '{', '}');
      if (e < 0) {
        return null;
      }
      let end = e + 1;
      if (m.group(1) === 'if') {
        let em = rx(String.raw`\s*else\b`).match(body.slice(end));
        while (em) {
          k = end + em.end();
          while (k < n && isWs(body[k])) {
            k++;
          }
          if (body.startsWith('if', k)) { // else if: one more if statement
            const q0 = index(body, '(', k);
            const q1 = matching(body, q0, '(', ')');
            k = q1 + 1;
            while (k < n && isWs(body[k])) {
              k++;
            }
          }
          if (k >= n || body[k] !== '{') {
            return null;
          }
          e = matching(body, k, '{', '}');
          if (e < 0) {
            return null;
          }
          end = e + 1;
          em = rx(String.raw`\s*else\b`).match(body.slice(end));
        }
      }
      out.push([i, end]);
      i = end;
      continue;
    }
    if (body.startsWith('do', i) && rx(String.raw`do\s*\{`).match(body.slice(i))) {
      const k = index(body, '{', i);
      const e = matching(body, k, '{', '}');
      if (e < 0) {
        return null;
      }
      const m2 = rx(String.raw`\s*while\s*\([^;]*\)\s*;`).match(body.slice(e + 1));
      if (!m2) {
        return null;
      }
      out.push([i, e + 1 + m2.end()]);
      i = e + 1 + m2.end();
      continue;
    }
    let depth = 0;
    let j = i;
    while (j < n) {
      const c = body[j];
      if (c === '(' || c === '[') {
        depth++;
      } else if (c === ')' || c === ']') {
        depth--;
      } else if (c === '{') {
        return null;
      } else if (c === ';' && depth === 0) {
        break;
      }
      j++;
    }
    if (j >= n) {
      return null;
    }
    out.push([i, j + 1]);
    i = j + 1;
  }
}

// _breaks_outside_loops: break / continue statements of 'text' not inside a nested loop or switch
function breaksOutsideLoops(text) {
  let found = 0;
  let i = 0;
  for (;;) {
    const m = rx(String.raw`\b(break|continue|do|for|while|switch)\b`).search(text.slice(i));
    if (!m) {
      return found;
    }
    const k = i + m.start();
    const w = m.group(1);
    if (w === 'break' || w === 'continue') {
      found++;
      i = k + w.length;
      continue;
    }
    const b = find(text, '{', k);
    if (b < 0) {
      return found + 1;
    }
    const e = matching(text, b, '{', '}');
    if (e < 0) {
      return found + 1;
    }
    i = e + 1;
    if (w === 'do') {
      const wm = rx(String.raw`\s*while\s*\([^;]*\)\s*;`).match(text.slice(i));
      if (wm) {
        i += wm.end();
      }
    }
  }
}

// pass_dowhile's convert(): the do-while(false) body as if / else, or null
function dowhileConvert(body) {
  const stmts = statements(body);
  if (stmts === null) {
    return null;
  }
  const pieces = [];
  for (let idx = 0; idx < stmts.length; idx++) {
    const [a, b] = stmts[idx];
    const st = body.slice(a, b);
    const ls = (a > 0 ? body.lastIndexOf('\n', a - 1) : -1) + 1; // body.rfind('\n', 0, a) + 1
    const ind = !strip(body.slice(ls, a)) ? body.slice(ls, a) : '';
    const last = idx === stmts.length - 1;
    if (strip(st) === 'break;') {
      if (!last) {
        return null;
      }
      pieces.push(['end', null]);
      continue;
    }
    if (st.startsWith('if')) {
      const p0 = index(st, '(');
      const p1 = matching(st, p0, '(', ')');
      const k = index(st, '{', p1);
      const e = matching(st, k, '{', '}');
      const inner = st.slice(k + 1, e);
      const rest = strip(st.slice(e + 1));
      const istmts = statements(inner);
      if (istmts && istmts.length && strip(inner.slice(at(istmts, -1)[0], at(istmts, -1)[1])) === 'break;' && !rest) {
        const head = inner.slice(0, at(istmts, -1)[0]);
        if (breaksOutsideLoops(head)) {
          return null;
        }
        pieces.push(['exit', [ind, st.slice(0, p1 + 1), head]]);
        continue;
      }
    }
    if (breaksOutsideLoops(st)) {
      return null;
    }
    pieces.push(['stmt', ind + st]);
  }
  if (pieces.slice(0, -1).some(([k]) => k === 'end')) {
    return null;
  }
  let out = '';
  for (const [kind, val] of [...pieces].reverse()) {
    if (kind === 'end') {
      continue;
    }
    if (kind === 'stmt') {
      out = `${val}\n${out}`;
    } else {
      const [ind, cond, head] = val;
      out = `${ind}${cond}\n${ind}{${rstrip(head)}\n${ind}}\n${ind}else\n${ind}{\n${out}${ind}}\n`;
    }
  }
  return out;
}

// pass_dowhile
function passDowhile(text) {
  const body = (b) => {
    let pos = 0;
    for (;;) {
      const m = rx(DO_RE).search(b, pos);
      if (!m) {
        return b;
      }
      const openI = index(b, '{', m.end() - 1);
      const closeI = matching(b, openI, '{', '}');
      if (closeI < 0) {
        return b;
      }
      const wm = rx(String.raw`\s*while\s*\(\s*false\s*\)\s*;`).match(b.slice(closeI + 1));
      if (!wm) {
        pos = m.end();
        continue;
      }
      const inner = b.slice(openI + 1, closeI);
      if (inner.includes('continue') && breaksOutsideLoops(inner) && rx(String.raw`\bcontinue\b`).search(inner)) {
        pos = m.end();
        continue;
      }
      const nw = dowhileConvert(inner);
      if (nw === null) {
        pos = m.end();
        continue;
      }
      const ind = m.group(1);
      b = b.slice(0, m.start()) + `\n${ind}{\n` + nw + `${ind}}` + b.slice(closeI + 1 + wm.end()); // its own block
      pos = m.start();
    }
  };
  return mapMain(text, body);
}

// ---------------------------------------------------------------------------------------------------------------------
// pass: selsame

// pass_selsame
function passSelsame(text) {
  const body = (b) => {
    let changed = true;
    while (changed) {
      changed = false;
      const out = [];
      let pos = 0;
      for (const m of rx(String.raw`\bdk_sel\(`).finditer(b)) {
        if (m.start() < pos) {
          continue;
        }
        const o = m.end() - 1;
        const c = matching(b, o, '(', ')');
        if (c < 0) {
          continue;
        }
        const args = splitArgs(b.slice(o + 1, c));
        if (args.length !== 3) {
          continue;
        }
        const cond = strip(args[0]);
        const nw = [...args];
        for (const [k, keep] of [[1, 1], [2, 2]]) {
          const inner = unparen(args[k]);
          if (inner.startsWith('dk_sel(') && matching(inner, 6, '(', ')') === inner.length - 1) {
            const ia = splitArgs(inner.slice(7, -1));
            if (ia.length === 3 && strip(ia[0]) === cond) {
              nw[k] = ` (${strip(ia[keep])})`;
            }
          }
        }
        if (nw.some((x, k) => x !== args[k])) {
          out.push(b.slice(pos, m.start()));
          out.push(`dk_sel(${nw.join(',')})`);
          pos = c + 1;
          changed = true;
        }
      }
      if (changed) {
        out.push(b.slice(pos));
        b = out.join('');
      }
    }
    return b;
  };
  return mapMain(text, body);
}

// ---------------------------------------------------------------------------------------------------------------------
// pass: txq

const TXQ_RE = String.raw`textureSize\((dk_tex_b(\d+)), 0\)`;
const TXQ_TYPES = new Map([['sampler2D', ['ivec2', 'xy']], ['samplerCube', ['ivec2', 'xy']],
  ['sampler2DArray', ['ivec3', 'xyz']], ['sampler3D', ['ivec3', 'xyz']]]);
const TXQ_DECL = '#ifndef SPIRV_CROSS_CONSTANT_ID_908\n#define SPIRV_CROSS_CONSTANT_ID_908 1u\n#endif\n' +
  'const uint g_banjoTxq = SPIRV_CROSS_CONSTANT_ID_908;\n' +
  'layout(binding = 3, std140) uniform type_DkTexSize\n{\n    uvec4 v[64];\n} g_UboTexSize;\n' +
  'bool g_dkTxqBad = false;\n' +
  'ivec2 dk_txq_check(ivec2 c, ivec2 q) { g_dkTxqBad = g_dkTxqBad || any(notEqual(c, q)); return q; }\n' +
  'ivec3 dk_txq_check(ivec3 c, ivec3 q) { g_dkTxqBad = g_dkTxqBad || any(notEqual(c, q)); return q; }\n';

// pass_txq
function passTxq(text) {
  if (!text.includes('textureSize(') || text.includes('g_banjoTxq')) {
    return text;
  }
  const types = new Map();
  for (const m of rx(String.raw`uniform (\w+) dk_tex_b(\d+);`).finditer(text)) {
    types.set(m.group(2), m.group(1));
  }
  let mask = 0n;
  const repl = (m) => {
    const b = m.group(2);
    const t = TXQ_TYPES.get(types.has(b) ? types.get(b) : '');
    if (!t || pyInt(b) >= 32n) {
      return m.group(0);
    }
    mask |= 1n << pyInt(b);
    const [vec, comps] = t;
    const c = `${vec}(g_UboTexSize.v[${b}u].${comps})`;
    const q = m.group(0);
    return `((g_banjoTxq == 1u) ? ${c} : ((g_banjoTxq == 2u) ? dk_txq_check(${c}, ${q}) : ${q}))`;
  };
  const span = mainSpan(text);
  if (!span) {
    return text;
  }
  const [a, b] = span;
  let body = rx(TXQ_RE).sub(repl, text.slice(a, b));
  if (!mask) {
    return text;
  }
  // The verify variant: magenta where a size differed (before main's closing brace).
  if (text.includes('out_var_SV_Target0')) {
    body = rstrip(body) + '\n    if (g_banjoTxq == 2u && g_dkTxqBad)\n    {\n' +
      '        out_var_SV_Target0 = vec4(1.0, 0.0, 1.0, 1.0);\n    }\n';
  }
  text = text.slice(0, a) + body + text.slice(b);
  text = insertBeforeMain(text, TXQ_DECL);
  const header = (m) => {
    let line = m.group(0);
    const ubo = rx('ubo=0x([0-9a-fA-F]+)').search(line);
    if (ubo) {
      line = replaceAll(line, ubo.group(0), `ubo=0x${(BigInt(`0x${ubo.group(1)}`) | 8n).toString(16)}`);
    }
    return `${line} txq=0x${mask.toString(16)}`;
  };
  return rx(String.raw`^// banjo-dk [^\n]*`, 'M').sub(header, text, 1);
}

// ---------------------------------------------------------------------------------------------------------------------
// passes: earlyz, gpr32

const EARLYZ_DECL = '#ifndef SPIRV_CROSS_CONSTANT_ID_909\n#define SPIRV_CROSS_CONSTANT_ID_909 0u\n#define DK_EARLY_Z 0\n' +
  '#else\n#define DK_EARLY_Z 1\n#endif\n#if DK_EARLY_Z\nlayout(early_fragment_tests) in;\n#endif\n';

// pass_earlyz
function passEarlyz(text) {
  if (!text.includes('discard') || text.includes('gl_FragDepth') || text.includes('SPIRV_CROSS_CONSTANT_ID_909')) {
    return text;
  }
  return insertGlobals(text, EARLYZ_DECL);
}

const GPR32_DECL = '#ifndef SPIRV_CROSS_CONSTANT_ID_910\n#define SPIRV_CROSS_CONSTANT_ID_910 0u\n#endif\n' +
  'const uint g_banjoGpr32 = SPIRV_CROSS_CONSTANT_ID_910;\n';

// pass_gpr32 (tools/gpr32_shaders.txt: lists.gpr32; none, none listed)
function passGpr32(text, name, lists) {
  if (name === null || name === undefined || !lists.gpr32.has(name.toUpperCase()) ||
    text.includes('SPIRV_CROSS_CONSTANT_ID_910')) {
    return text;
  }
  return insertBeforeMain(text, GPR32_DECL);
}

// ---------------------------------------------------------------------------------------------------------------------
// pass: bonesel

const BONESEL_NAMED_RE = String.raw`mix\((_\d+), \((_\d+) \* ([\w.]+)\) \+ \1, (_\d+)\)`;

// pass_bonesel
function passBonesel(text) {
  const span = mainSpan(text);
  if (!span) {
    return text;
  }
  const [a, b] = span;
  let body = text.slice(a, b);
  let count = 0;
  const defs = new Map();
  for (const m of rx(String.raw`^([ \t]*)vec4 (_\d+) = mix\((.*)\);$`, 'M').finditer(body)) {
    const args = splitArgs(m.group(3));
    if (args.length === 3 && rx(String.raw`_\d+`).fullmatch(strip(args[2])) &&
      rx(String.raw`_\d+`).fullmatch(strip(args[0]))) {
      defs.set(m.group(2), [m, strip(args[1]), strip(args[2])]);
    }
  }
  const renamed = new Map();
  body = rx(BONESEL_NAMED_RE).sub((mm) => {
    const [acc, d, w, c] = mm.groups();
    const info = defs.get(d);
    if (!info || info[2] !== c) {
      return mm.group(0);
    }
    renamed.set(d, info);
    count++;
    return `mix(${acc}, (${d}_bl * ${w}) + ${acc}, ${c})`;
  }, body);
  for (const [d, [m, load, c]] of renamed) {
    const line = rx(String.raw`^([ \t]*)vec4 ` + d + String.raw` = mix\(`, 'M').search(body);
    if (!line) {
      return text;
    }
    body = body.slice(0, line.start()) + `${line.group(1)}vec4 ${d}_bl = ${load};\n` + body.slice(line.start());
    // the data select itself reads D_bl (one load, as before)
    body = replaceFirst(body, `vec4 ${d} = mix(${m.group(3)});`,
      `vec4 ${d} = mix(${strip(splitArgs(m.group(3))[0])}, ${d}_bl, ${c});`);
  }
  // Inline: mix(A, (mix(P, L, c) * w) + A, c).
  const out = [];
  let pos = 0;
  for (const mm of rx(String.raw`mix\((_\d+), \(mix\(`).finditer(body)) {
    if (mm.start() < pos) {
      continue;
    }
    const acc = mm.group(1);
    const innerOpen = mm.end() - 1;
    const innerClose = matching(body, innerOpen, '(', ')');
    if (innerClose < 0) {
      continue;
    }
    const iargs = splitArgs(body.slice(innerOpen + 1, innerClose));
    if (iargs.length !== 3) {
      continue;
    }
    const c = strip(iargs[2]);
    if (!rx(String.raw`_\d+`).fullmatch(c)) {
      continue;
    }
    const tail = rx(String.raw` \* ([\w.]+)\) \+ ` + reEscape(acc) + ', ' + reEscape(c) + String.raw`\)`)
      .match(body.slice(innerClose + 1));
    if (!tail) {
      continue;
    }
    out.push(body.slice(pos, mm.start()));
    out.push(`mix(${acc}, (${strip(iargs[1])} * ${tail.group(1)}) + ${acc}, ${c})`);
    pos = innerClose + 1 + tail.end();
    count++;
  }
  if (pos) {
    out.push(body.slice(pos));
    body = out.join('');
  }
  if (!count) {
    return text;
  }
  return text.slice(0, a) + body + text.slice(b);
}

// ---------------------------------------------------------------------------------------------------------------------
// pass: deadcomp

const DC_CTOR = String.raw`^([ \t]*)vec([234]) (_\d+) = vec\2\((.*)\);$`;

// pass_deadcomp
function passDeadcomp(text) {
  const span = mainSpan(text);
  if (!span) {
    return text;
  }
  const [a, b] = span;
  const lines = text.slice(a, b).split('\n');
  let count = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = rx(DC_CTOR).match(lines[i]);
    if (!m) {
      continue;
    }
    const ind = m.group(1);
    const n = Number(m.group(2));
    const x = m.group(3);
    const args = splitArgs(m.group(4));
    if (args.length !== n) {
      continue;
    }
    const nameRe = rx(String.raw`(?<![\w.])` + reEscape(x) + String.raw`\b`);
    let dead = new Set();
    for (let j = i + 1; j < lines.length; j++) {
      const lj = lines[j];
      if (!strip(lj)) {
        continue;
      }
      const after = lj.slice(ind.length, ind.length + 1);
      if (!lj.startsWith(ind) || after === ' ' || after === '\t' || strip(lj) === '{' || strip(lj) === '}') {
        break;
      }
      const w = rx(String.raw`^[ \t]*` + reEscape(x) + String.raw`\.([xyzw]) = (.*);$`).match(lj);
      if (w && !nameRe.search(w.group(2))) {
        const c = 'xyzw'.indexOf(w.group(1));
        if (c < n) {
          dead.add(c);
        }
        continue;
      }
      if (nameRe.search(lj)) {
        break;
      }
    }
    dead = new Set([...dead].filter((c) => strip(args[c]) !== '0.0'));
    if (!dead.size) {
      continue;
    }
    for (const c of dead) {
      args[c] = c ? ' 0.0' : '0.0';
    }
    lines[i] = `${ind}vec${n} ${x} = vec${n}(${args.join(',')});`;
    count += dead.size;
  }
  if (!count) {
    return text;
  }
  return text.slice(0, a) + lines.join('\n') + text.slice(b);
}

// ---------------------------------------------------------------------------------------------------------------------
// pass: guardsel

const GS_VAR = String.raw`(?<![\w.])(_\d+)\b`;
const GS_TYPES = String.raw`(?:[biu]?vec[234]|float|int|uint|bool)`;
const GS_ASSIGN = String.raw`^([ \t]*)(?:` + GS_TYPES + String.raw` )?(_\d+)((?:\.[xyzw]+)?) = (.*);$`;
const GS_DECL = String.raw`^\s*` + GS_TYPES + String.raw` _\d+;$`;

// A guard (condition c, polarity) as a bit: the k-th condition met has its true at bit 2k and its false at 2k + 1; a
// frozenset of guards as a BigInt of their bits (union |, intersection &, equality ===).
class Guards {
  constructor() {
    this.ids = new Map();
    this.bits = [];
    this.even = 0n;
    this.evenFor = 0;
  }

  bit(c, pol) { // the bit of (c, pol)
    let k = this.ids.get(c);
    if (k === undefined) {
      k = this.ids.size;
      this.ids.set(c, k);
      this.bits.push(1n << BigInt(2 * k), 1n << BigInt(2 * k + 1));
    }
    return this.bits[2 * k + (pol ? 0 : 1)];
  }

  number(c, pol) { // the bit's number
    this.bit(c, pol);
    return 2 * this.ids.get(c) + (pol ? 0 : 1);
  }

  has(s, c, pol) { // (c, pol) in s
    const k = this.ids.get(c);
    return k !== undefined && (s & this.bits[2 * k + (pol ? 0 : 1)]) !== 0n;
  }

  contradicts(s) { // any((c, not p) in s for c, p in s)
    if (this.evenFor !== this.ids.size) {
      this.even = this.ids.size ? BigInt(`0b${'01'.repeat(this.ids.size)}`) : 0n;
      this.evenFor = this.ids.size;
    }
    return (s & (s >> 1n) & this.even) !== 0n;
  }

  members(s) { // the bit numbers of s
    const out = [];
    const bin = s.toString(2);
    for (let i = bin.length - 1, n = 0; i >= 0; i--, n++) {
      if (bin[i] === '1') {
        out.push(n);
      }
    }
    return out;
  }
}

// _gs_selects: [condition, true arm span, false arm span, call span] of each select in expr
function gsSelects(expr, booleans) {
  const out = [];
  for (const m of rx(String.raw`(?<![\w.])(dk_sel|mix)\(`).finditer(expr)) {
    const op = m.end() - 1;
    const cl = matching(expr, op, '(', ')');
    if (cl < 0) {
      continue;
    }
    const args = splitArgs(expr.slice(op + 1, cl));
    if (args.length !== 3) {
      continue;
    }
    const spans = [];
    let pos = op + 1;
    for (const x of args) {
      spans.push([pos, pos + x.length]);
      pos += x.length + 1;
    }
    if (m.group(1) === 'dk_sel') {
      out.push([args[0], spans[1], spans[2], [m.start(), cl + 1]]);
      continue;
    }
    const sel = strip(args[2]);
    const mm = rx(String.raw`bvec[234]\((_\d+|true|false)\)`).fullmatch(sel);
    if (mm && (booleans.has(mm.group(1)) || mm.group(1) === 'true' || mm.group(1) === 'false')) {
      out.push([mm.group(1), spans[1], spans[0], [m.start(), cl + 1]]);
    } else if (booleans.has(sel)) {
      out.push([sel, spans[1], spans[0], [m.start(), cl + 1]]);
    }
  }
  return out;
}

const setdefault = (map, k, v) => {
  if (!map.has(k)) {
    map.set(k, v);
  }
  return map.get(k);
};

// _gs_analyse: null, or the main body's lines and what is known about them. The Python's patterns that name a
// variable v are written here with a name group compared to v (the same lines match), compiled once.
function gsAnalyse(text) {
  const span = mainSpan(text);
  if (!span) {
    return null;
  }
  const [a, b] = span;
  const body = text.slice(a, b);
  if (rx(String.raw`\b(for|while|do)\b`).search(body)) {
    return null;
  }
  const lines = body.split('\n');
  const stripped = lines.map((ln) => strip(ln));
  const G = new Guards();
  const booleans = new Set(rx(String.raw`\b(?:bool|bvec[234]) (_\d+)\b`).findall(text));
  const assignRe = rx(GS_ASSIGN);
  const assigns = new Map();
  lines.forEach((ln, i) => {
    const m = assignRe.match(ln);
    if (m) {
      setdefault(assigns, m.group(2), []).push(i);
    }
  });
  const named = (src, line, v) => { // re.match(src with v at its first group, line)
    const m = rx(src).match(line);
    return m && m.group(1) === v ? m : null;
  };
  const alias = new Map();
  for (const [v, idx] of assigns) {
    if (idx.length === 1) {
      const m = named(String.raw`^\s*bvec[234] (_\d+) = bvec[234]\((_\d+|true|false)\);$`, lines[idx[0]], v) ||
        named(String.raw`^\s*bool (_\d+) = (_\d+)(?: && \2)?;$`, lines[idx[0]], v);
      if (m) {
        alias.set(v, m.group(2));
      }
    }
  }

  const norm = (c) => {
    c = unparen(c);
    while (alias.has(c)) {
      c = alias.get(c);
    }
    return c;
  };

  const closeMemo = new Map();
  const blockClose = (k) => { // the line of the } closing the { at line k
    if (closeMemo.has(k)) {
      return closeMemo.get(k);
    }
    let d = 0;
    let r = -1;
    for (let e = k; e < lines.length; e++) {
      const s2 = stripped[e];
      if (s2 === '{') {
        d++;
      } else if (s2 === '}') {
        d--;
        if (d === 0) {
          r = e;
          break;
        }
      }
    }
    closeMemo.set(k, r);
    return r;
  };

  const blockMemo = new Map();
  const blockOf = (i) => { // [open, close] of the innermost block holding line i
    if (blockMemo.has(i)) {
      return blockMemo.get(i);
    }
    let depth = 0;
    let r = null;
    for (let k = i - 1; k >= 0; k--) {
      const s2 = stripped[k];
      if (s2 === '}') {
        depth++;
      } else if (s2 === '{') {
        if (depth === 0) {
          r = [k, blockClose(k)];
          break;
        }
        depth--;
      }
    }
    blockMemo.set(i, r);
    return r;
  };

  const exclusive = (i, j) => { // line i in an if's then-block, line j in its else-block
    const blk = blockOf(i);
    if (!blk || blk[0] < 1 || !stripped[blk[0] - 1].startsWith('if (')) {
      return false;
    }
    const k = blk[1] + 1;
    if (k + 1 >= lines.length || at(stripped, k) !== 'else' || stripped[k + 1] !== '{') {
      return false;
    }
    return k + 1 < j && j < blockClose(k + 1);
  };

  const singleCache = new Map();
  const isVar = (x) => rx(String.raw`_\d+`).fullmatch(x) !== null;
  const single = (c) => {
    if (!isVar(c)) {
      return false;
    }
    if (!singleCache.has(c)) {
      const idx = assigns.get(c) || [];
      singleCache.set(c, idx.length === 1 || (idx.length === 2 && exclusive(idx[0], idx[1])));
    }
    return singleCache.get(c);
  };

  // a float that is a condition's 0 / 1
  const asFloat = new Map();
  for (const [v, idx] of assigns) {
    if (idx.length === 1) {
      const m = named(String.raw`^\s*float (_\d+) = float\((!?)\(?(_\d+)\)?\);$`, lines[idx[0]], v);
      if (m) {
        asFloat.set(v, [m.group(3), !m.group(2)]);
      }
    }
  }

  const ifGuard = (condLine) => { // [c, polarity] or null
    let m = rx(String.raw`\s*if \((!?)\(?(_\d+)\)?\)`).fullmatch(condLine);
    if (m) {
      const c = norm(m.group(2));
      return single(c) ? [c, !m.group(1)] : null;
    }
    m = rx(String.raw`\s*if \((_\d+) == ([01])\.0\)`).fullmatch(condLine);
    if (m && asFloat.has(m.group(1))) {
      let [c, pol] = asFloat.get(m.group(1));
      c = norm(c);
      return single(c) ? [c, pol === (m.group(2) === '1')] : null;
    }
    return null;
  };

  // the if / else blocks around each line
  const blockGuards = [];
  const stack = [];
  let lastClosed = null;
  for (let i = 0; i < lines.length; i++) {
    const s = stripped[i];
    if (s === '{') {
      const prev = i ? stripped[i - 1] : '';
      if (prev.startsWith('if (')) {
        stack.push(ifGuard(lines[i - 1]));
      } else if (prev === 'else' && lastClosed !== null) {
        stack.push([lastClosed[0], !lastClosed[1]]);
      } else {
        stack.push(null);
      }
      lastClosed = null;
    } else if (s === '}') {
      lastClosed = stack.length ? stack.pop() : null;
    } else if (s !== 'else') {
      lastClosed = null;
    }
    let bits = 0n;
    for (const g of stack) {
      if (g !== null) {
        bits |= G.bit(g[0], g[1]);
      }
    }
    blockGuards.push(bits);
  }

  // implications between conditions: guard number -> the guards it implies
  const imp = new Map();
  const addImp = (c, pol, g) => {
    const k = G.number(c, pol);
    imp.set(k, (imp.get(k) ?? 0n) | g);
  };
  const twoArm = new Map();
  for (const [v, idx] of assigns) {
    if (!single(v)) {
      continue;
    }
    if (idx.length === 1) {
      const m = named(String.raw`^\s*bool (_\d+) = (.+);$`, lines[idx[0]], v);
      if (!m) {
        continue;
      }
      const e = unparen(m.group(2));
      let parts = e.includes(' && ') && !e.includes(' || ') ? e.split(' && ').map(unparen) : null;
      if (parts && parts.every(isVar)) {
        for (let x of parts) {
          x = norm(x);
          if (single(x)) {
            addImp(v, true, G.bit(x, true));
          }
        }
        continue;
      }
      parts = e.includes(' || ') && !e.includes(' && ') ? e.split(' || ').map(unparen) : null;
      if (parts && parts.every(isVar)) {
        for (let x of parts) {
          x = norm(x);
          if (single(x)) {
            addImp(v, false, G.bit(x, false));
          }
        }
        continue;
      }
      const m2 = rx(String.raw`!\(?(_\d+)\)?`).fullmatch(e);
      if (m2 && single(norm(m2.group(1)))) {
        const x = norm(m2.group(1));
        addImp(v, true, G.bit(x, false));
        addImp(v, false, G.bit(x, true));
      }
    } else {
      const arms = [];
      for (const i of idx) {
        const m = named(String.raw`^\s*(_\d+) = (.+);$`, lines[i], v);
        arms.push([m ? unparen(m.group(2)) : null, i]);
      }
      if (arms.every(([e]) => e !== null)) {
        twoArm.set(v, arms);
      }
    }
  }

  const closureNow = (s) => {
    let out = s;
    const todo = G.members(s);
    while (todo.length) {
      const h = imp.get(todo.pop());
      if (h !== undefined) {
        const fresh = h & ~out;
        if (fresh) {
          out |= fresh;
          todo.push(...G.members(fresh));
        }
      }
    }
    return out;
  };

  // the two-arm rule needs what the arms imply: to a fixpoint
  let grown = true;
  while (grown) {
    grown = false;
    for (const [v, arms] of twoArm) {
      for (const pol of [true, false]) {
        const sets = []; // null: every guard
        for (const [e, i] of arms) {
          if (e === (pol ? 'false' : 'true')) {
            sets.push(null);
            continue;
          }
          let s = 0n;
          if (isVar(e) && single(norm(e))) {
            s |= closureNow(G.bit(norm(e), pol));
          }
          const blk = blockOf(i);
          if (blk && blk[0] >= 1) {
            s |= closureNow(blockGuards[blk[0]] & ~blockGuards[blk[0] - 1]);
          }
          sets.push(s);
        }
        const real = sets.filter((s) => s !== null);
        const common = real.length ? real.reduce((x, y) => x & y) : 0n;
        if (common) {
          const k = G.number(v, pol);
          const have = imp.get(k) ?? 0n;
          if (common & ~have) {
            imp.set(k, have | common);
            grown = true;
          }
        }
      }
    }
  }

  const closureCache = new Map();
  const closure = (s) => {
    let r = closureCache.get(s);
    if (r === undefined) {
      r = closureNow(s);
      closureCache.set(s, r);
    }
    return r;
  };

  const uses = new Map(); // variable -> [[guards at the read, the variable the read's statement assigns or null]]
  const parsed = [];
  const declRe = rx(GS_DECL);
  const varRe = rx(GS_VAR);
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (declRe.match(ln)) {
      parsed.push(null);
      continue;
    }
    const m = assignRe.match(ln);
    let target = null;
    let start = 0;
    if (m) {
      target = m.group(2);
      start = ln.length - m.group(4).length - 1;
    }
    const expr = m ? ln.slice(start, -1) : ln;
    parsed.push(m ? [target, start] : null);
    const reads = varRe.finditer(expr);
    if (!reads.length) {
      continue;
    }
    const sels = gsSelects(expr, booleans).map(([cond, ts, fs]) => {
      const c = norm(cond);
      return [c, ts, fs, c === 'true' || c === 'false' ? null : single(c)];
    });
    for (const vm of reads) {
      const p = vm.start();
      let g = blockGuards[i];
      let dead = false;
      for (const [c, ts, fs, isSingle] of sels) {
        if (isSingle === null) { // the arm a literal never takes reads nothing
          const arm = c === 'true' ? fs : ts;
          dead = dead || (arm[0] <= p && p < arm[1]);
          continue;
        }
        if (!isSingle) {
          continue;
        }
        if (ts[0] <= p && p < ts[1]) {
          g |= G.bit(c, true);
        } else if (fs[0] <= p && p < fs[1]) {
          g |= G.bit(c, false);
        }
      }
      if (!dead) {
        setdefault(uses, vm.group(1), []).push([g, target]);
      }
    }
  }
  // top: null
  const guard = new Map([...assigns.keys()].map((v) => [v, null]));
  let changed = true;
  while (changed) {
    changed = false;
    for (const v of assigns.keys()) {
      let acc = null;
      for (const [g, target] of uses.get(v) || []) {
        let s;
        if (target !== null && assigns.has(target)) {
          const tg = guard.get(target);
          s = tg === null ? null : closure(g | tg);
        } else {
          s = closure(g);
        }
        if (s === null || G.contradicts(s)) {
          continue; // never read, or read under a contradiction
        }
        acc = acc === null ? s : acc & s;
      }
      if (acc !== guard.get(v)) {
        guard.set(v, acc);
        changed = true;
      }
    }
  }
  return { a, b, lines, parsed, guard, uses, imp, closure, norm, single, booleans, assigns, blockGuards, G };
}

// pass_guardsel
function passGuardsel(text) {
  const an = gsAnalyse(text);
  if (an === null) {
    return text;
  }
  const { a, b, lines, parsed, guard, norm, booleans, G } = an;
  let count = 0;
  for (let i = 0; i < parsed.length; i++) {
    const info = parsed[i];
    if (!info) {
      continue;
    }
    const [target, start] = info;
    const g = guard.get(target);
    if (g === null || g === undefined || g === 0n) {
      continue;
    }
    let expr = lines[i].slice(start, -1);
    for (;;) {
      let replaced = false;
      for (const [cond, ts, fs, [cs, ce]] of gsSelects(expr, booleans)) {
        const c = norm(cond);
        let keep;
        if (G.has(g, c, true)) {
          keep = expr.slice(ts[0], ts[1]);
        } else if (G.has(g, c, false)) {
          keep = expr.slice(fs[0], fs[1]);
        } else {
          continue;
        }
        expr = `${expr.slice(0, cs)}(${strip(keep)})${expr.slice(ce)}`;
        count++;
        replaced = true;
        break;
      }
      if (!replaced) {
        break;
      }
    }
    lines[i] = `${lines[i].slice(0, start)}${expr};`;
  }
  if (!count) {
    return text;
  }
  return text.slice(0, a) + lines.join('\n') + text.slice(b);
}

// ---------------------------------------------------------------------------------------------------------------------
// pass: lightbranch

const LIGHTBRANCH_DECL = '#ifndef SPIRV_CROSS_CONSTANT_ID_911\n#define SPIRV_CROSS_CONSTANT_ID_911 0u\n#endif\n' +
  'const uint g_banjoLightBranch = SPIRV_CROSS_CONSTANT_ID_911;\n';
const LB_FORBIDDEN = String.raw`\b(texture\w*|texelFetch\w*|dFd\w+|fwidth\w*|discard|out_var_\w+|gl_FragDepth|return|` +
  String.raw`imageStore|atomic\w*)\b`;

// pass_lightbranch (tools/lightbranch_shaders.txt: lists.lightbranch; none, none listed)
function passLightbranch(text, name, lists) {
  if (name === null || name === undefined || !lists.lightbranch.has(name.toUpperCase()) ||
    text.includes('SPIRV_CROSS_CONSTANT_ID_911')) {
    return text;
  }
  const an = gsAnalyse(text);
  if (an === null) {
    return text;
  }
  const { lines, guard, closure, norm, single, G } = an;
  const assignRe = rx(GS_ASSIGN);
  const declRe = rx(GS_DECL);
  const varRe = rx(GS_VAR);
  const forbidden = rx(LB_FORBIDDEN);
  const indOf = lines.map((ln) => ln.length - lstrip(ln, ' \t').length);
  const reads = new Map();
  lines.forEach((ln, i) => {
    const m = assignRe.match(ln);
    const expr = m ? ln.slice(ln.length - m.group(4).length - 1, -1) : ln;
    if (declRe.match(ln)) {
      return;
    }
    for (const vm of varRe.finditer(expr)) {
      setdefault(reads, vm.group(1), []).push(i);
    }
  });
  const target = (r) => { // (_GS_ASSIGN.match(lines[r]) or [None, None, None])[2]
    const m = assignRe.match(at(lines, r));
    return m ? m.group(2) : null;
  };
  const edits = [];
  let takenUntil = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = rx(String.raw`^([ \t]*)bool (_\d+) = (.+);$`).match(lines[i]);
    if (!m || i <= takenUntil || !single(m.group(2))) {
      continue;
    }
    const ind = m.group(1);
    const c = m.group(2);
    const ends = [];
    let j = i + 1;
    while (j < lines.length) {
      const s = strip(lines[j]);
      if (!s) {
        j++;
        continue;
      }
      if (indOf[j] < ind.length || (s === '}' && indOf[j] === ind.length)) {
        break;
      }
      if (indOf[j] > ind.length) {
        break; // not expected right after a statement at this level
      }
      let k = j;
      if (s.startsWith('if (') || s === 'else') {
        k = j + 1;
        while (k < lines.length) {
          if (strip(lines[k]) === '{' && indOf[k] === ind.length) {
            let d = 0;
            for (let e = k; e < lines.length; e++) {
              if (strip(lines[e]) === '{') {
                d++;
              } else if (strip(lines[e]) === '}') {
                d--;
                if (d === 0) {
                  k = e;
                  break;
                }
              }
            }
            if (k + 1 < lines.length && strip(lines[k + 1]) === 'else') {
              k += 2;
              continue;
            }
            break;
          }
          k++;
        }
      }
      ends.push(k);
      j = k + 1;
    }
    let best = null;
    for (const e of ends) {
      const region = [];
      for (let r = i + 1; r < e + 1; r++) {
        region.push(r);
      }
      if (region.some((r) => forbidden.search(at(lines, r)))) {
        break;
      }
      let ok = true;
      const hoist = [];
      const elses = [];
      const assigned = new Map();
      for (const r of region) {
        const mm = assignRe.match(at(lines, r));
        const dm = rx(String.raw`^\s*(` + GS_TYPES + String.raw`) (_\d+);$`).match(lines[r]);
        if (mm) {
          setdefault(assigned, mm.group(2), r);
        } else if (dm) {
          setdefault(assigned, dm.group(2), r);
        }
      }
      for (const [v, first] of assigned) {
        const later = (reads.get(v) || []).filter((r) => r > e);
        if (!later.length) {
          continue;
        }
        const g = guard.get(v);
        if (g !== null && g !== undefined && G.has(closure(g), c, true)) {
          const tm = rx(String.raw`^\s*(` + GS_TYPES + String.raw`) ` + v + String.raw`\b`).match(lines[first]);
          hoist.push([tm ? tm.group(1) : null, v]);
          continue;
        }
        // a sum: `T v = mix(P, X, bvecN(f));` assigned once in the region, at its level, with f => c
        const defsOf = region.filter((r) => target(r) === v);
        const sm = defsOf.length === 1 && indOf[defsOf[0]] === ind.length ?
          rx(String.raw`^[ \t]*(vec[234]|float) ` + v + String.raw` = mix\((.*)\);$`).match(lines[defsOf[0]]) : null;
        if (sm) {
          const args = splitArgs(sm.group(2));
          const sel = args.length === 3 ? strip(args[2]) : '';
          const fm = rx(String.raw`bvec[234]\((_\d+)\)`).fullmatch(sel);
          const f = norm(fm ? fm.group(1) : sel);
          let prev = strip(args[0]);
          // a region-local copy of an outside value (`vec3 p = acc.xyz;`, assigned once): its expression
          const pm = rx(String.raw`(_\d+)`).fullmatch(prev);
          if (pm && assigned.has(pm.group(1))) {
            const pdefs = region.filter((r) => target(r) === pm.group(1));
            const pd = pdefs.length === 1 ? assignRe.match(lines[pdefs[0]]) : null;
            if (pd && !pd.group(3)) {
              prev = `(${strip(pd.group(4))})`;
            }
          }
          const prevVars = varRe.findall(prev);
          if (rx(String.raw`_\d+`).fullmatch(f) && single(f) && G.has(closure(G.bit(f, true)), c, true) &&
            prevVars.every((pv) => !assigned.has(pv))) {
            hoist.push([sm.group(1), v]);
            elses.push([v, prev]);
            continue;
          }
        }
        ok = false;
        break;
      }
      if (!ok) {
        continue;
      }
      if (hoist.some(([t]) => t === null)) {
        continue;
      }
      const nStmt = region.filter((r) => assignRe.match(lines[r])).length;
      if (nStmt >= 8) {
        best = [i + 1, e, c, hoist, elses];
      }
    }
    if (best) {
      edits.push([...best, ind]);
      takenUntil = best[1];
    }
  }
  if (!edits.length) {
    return text;
  }
  const out = [...lines];
  for (const [start, end, c, hoist, elses, ind] of [...edits].reverse()) {
    const names = new Set(hoist.map(([, v]) => v));
    const body = [];
    for (let r = start; r < end + 1; r++) {
      let ln = at(out, r);
      const mm = rx(String.raw`^([ \t]*)(` + GS_TYPES + String.raw`) (_\d+)( = .*;|;)$`).match(ln);
      if (mm && names.has(mm.group(3))) {
        if (mm.group(4) === ';') {
          continue; // declared ahead
        }
        ln = `${mm.group(1)}${mm.group(3)}${mm.group(4)}`;
      }
      body.push(strip(ln) ? `    ${ln}` : ln);
    }
    const block = hoist.map(([t, v]) => `${ind}${t} ${v};`);
    block.push(`${ind}if (g_banjoLightBranch == 0u || ${c})`);
    block.push(`${ind}{`);
    block.push(...body);
    block.push(`${ind}}`);
    if (elses.length) {
      block.push(`${ind}else`);
      block.push(`${ind}{`);
      block.push(...elses.map(([v, p]) => `${ind}    ${v} = ${p};`));
      block.push(`${ind}}`);
    }
    out.splice(start, end + 1 - start, ...block);
  }
  text = text.slice(0, an.a) + out.join('\n') + text.slice(an.b);
  return insertBeforeMain(text, LIGHTBRANCH_DECL);
}

// ---------------------------------------------------------------------------------------------------------------------
// pass: nullps

const NULLPS_DECL = '#ifndef SPIRV_CROSS_CONSTANT_ID_912\n#define SPIRV_CROSS_CONSTANT_ID_912 0u\n#endif\n' +
  'const uint g_banjoNullPs = SPIRV_CROSS_CONSTANT_ID_912;\n';

// pass_nullps (tools/nullps_shaders.txt: lists.nullps; none, none listed)
function passNullps(text, name, lists) {
  if (name === null || name === undefined || !lists.nullps.has(name.toUpperCase()) ||
    text.includes('SPIRV_CROSS_CONSTANT_ID_912') || !text.includes('discard')) {
    return text;
  }
  const head = '\nvoid main()\n{\n';
  const m = text.indexOf(head);
  if (m < 0) {
    return text;
  }
  const end = m + head.length;
  text = text.slice(0, end) + '    if (g_banjoNullPs != 0u)\n    {\n        discard;\n    }\n' + text.slice(end);
  return insertBeforeMain(text, NULLPS_DECL);
}

// ---------------------------------------------------------------------------------------------------------------------
// pass: aw4

const AW4_DECL = 'layout(binding = 15, std430) readonly buffer type_ByteAddressBuffer4\n{\n    uvec4 _m0[];\n} ' +
  'g_DkAddressWindow4;\n';
const AW4_INDEX_RE = String.raw`\(g_UboShared\.v\[35u\]\.x \+ (?:min\(\((_\d+) \+ \(uint\((_\d+)(?: \+ (\d+))?\) \* 4u\)\), ` +
  String.raw`(_\d+)\)|\((_\d+) \+ \(uint\((_\d+)(?: \+ (\d+))?\) \* 4u\)\))\) >> 2u`;
const AW4_LOAD_RE = String.raw`g_DkAddressWindow\._m0\[(_\d+)\]`;

// pass_aw4
function passAw4(text) {
  const span = mainSpan(text);
  if (!span || !text.includes('g_DkAddressWindow._m0[') || text.includes('g_DkAddressWindow4')) {
    return text;
  }
  const [a, b] = span;
  const body = text.slice(a, b);
  const lines = body.split('\n');
  const defs = new Map(); // name -> [line index, indentation, expression]
  lines.forEach((ln, i) => {
    const m = rx(String.raw`^([ \t]*)(?:uint|int) (_\d+) = (.+);$`).match(ln);
    if (m) {
      defs.set(m.group(2), [i, m.group(1), m.group(3)]);
    }
  });
  const mult16Int = (name) => {
    const d = defs.get(name);
    if (!d) {
      return false;
    }
    const m = rx(String.raw`int\(floor\([^;]*\)\) \* (\d+)`).fullmatch(d[2]);
    return Boolean(m) && pyInt(m.group(1)) % 4n === 0n;
  };
  const slotBase = (name) => {
    const d = defs.get(name);
    return Boolean(d) && rx(String.raw`g_UboShared\.v\[\d+u\]\.[xyzw] & 4294967292u`).fullmatch(d[2]) !== null;
  };
  const clampBound = (name) => {
    const d = defs.get(name);
    return Boolean(d) && d[2] === 'max(g_UboShared.v[60u].w, 16u) - 16u';
  };
  const loadRe = rx(AW4_LOAD_RE);
  const loadLines = new Map();
  lines.forEach((ln, i) => {
    for (const v of loadRe.findall(ln)) {
      setdefault(loadLines, v, []).push(i);
    }
  });
  const inserts = new Map(); // line index -> lines to insert after it
  const replace = new Map(); // word index variable -> 'Q.x'
  let rows = 0;
  for (const [w, [wi, ind, expr]] of defs) {
    const m = rx(AW4_INDEX_RE).fullmatch(expr);
    if (!m || !loadLines.has(w)) {
      continue;
    }
    let base;
    let iVar;
    let k;
    if (m.group(1)) {
      [base, iVar, k] = [m.group(1), m.group(2), m.group(3)];
      if (!clampBound(m.group(4))) {
        continue;
      }
    } else {
      [base, iVar, k] = [m.group(5), m.group(6), m.group(7)];
    }
    if (!slotBase(base) || !mult16Int(iVar) || (k !== null && pyInt(k) % 4n)) {
      continue;
    }
    const sibs = new Map();
    for (const [s, [si, sind, sexpr]] of defs) {
      const mm = rx(reEscape(w) + String.raw` \+ ([123])u`).fullmatch(sexpr);
      if (mm && sind === ind && loadLines.has(s)) {
        sibs.set(Number(mm.group(1)), [s, si]);
      }
    }
    if (sibs.size !== 3) {
      continue;
    }
    const group = [[w, wi], sibs.get(1), sibs.get(2), sibs.get(3)];
    const last = Math.max(...group.map(([, i]) => i));
    const firstLoad = Math.min(...group.map(([v]) => Math.min(...loadLines.get(v))));
    if (firstLoad <= last) {
      continue;
    }
    // every load at the definitions' level of the same block
    let ok = true;
    const end = Math.max(...group.map(([v]) => Math.max(...loadLines.get(v))));
    for (let j = wi; j < end + 1; j++) {
      const lj = lines[j];
      if (!strip(lj)) {
        continue;
      }
      const lind = lj.length - lstrip(lj, ' \t').length;
      if (lind < ind.length || (lind > ind.length && group.some(([v]) => loadLines.get(v).includes(j)))) {
        ok = false;
        break;
      }
    }
    if (!ok) {
      continue;
    }
    const q = `${w}_q`;
    // the row index straight from the byte offset (uam keeps `(x >> 2u) >> 2u` as two shifts)
    setdefault(inserts, last, []).push(`${ind}uvec4 ${q} = g_DkAddressWindow4._m0[${expr.slice(0, -' >> 2u'.length)} >> 4u];`);
    group.forEach(([v], n) => replace.set(v, `${q}.${'xyzw'[n]}`));
    rows++;
  }
  if (!rows) {
    return text;
  }
  const out = [];
  lines.forEach((ln, i) => {
    if (loadRe.findall(ln).some((v) => replace.has(v))) {
      ln = loadRe.sub((mm) => (replace.has(mm.group(1)) ? replace.get(mm.group(1)) : mm.group(0)), ln);
    }
    out.push(ln);
    out.push(...(inserts.get(i) || []));
  });
  text = text.slice(0, a) + out.join('\n') + text.slice(b);
  const decl = text.indexOf('} g_DkAddressWindow;\n');
  if (decl < 0) {
    return text;
  }
  const end = decl + '} g_DkAddressWindow;\n'.length;
  return `${text.slice(0, end)}\n${AW4_DECL}${text.slice(end)}`;
}

// ---------------------------------------------------------------------------------------------------------------------
// optimise

export const PASSES = [
  ['scale1', passScale1],
  ['fragscale', passFragscale],
  ['alpha', passAlpha],
  ['tess', passTess],
  ['bonerow', passBonerow],
  ['vszero', passVszero],
  ['vsout', passVsout],
  ['pszero', passPszero],
  ['pred', passPred],
  ['predmul', passPredmul],
  ['sext', passSext],
  ['bool01', passBool01],
  ['sel', passSel],
  ['alphamask', passAlphamask],
  ['earlyhoist', passEarlyhoist],
  ['ifmerge', passIfmerge],
  ['dowhile', passDowhile],
  ['selsame', passSelsame],
  ['deadcomp', passDeadcomp],
  ['guardsel', passGuardsel],
  ['lightbranch', passLightbranch],
  ['nullps', passNullps],
  ['txq', passTxq],
  ['earlyz', passEarlyz],
  ['gpr32', passGpr32],
  ['bonesel', passBonesel],
  ['aw4', passAw4],
];
export const DEFAULT_PASSES = PASSES.map(([name]) => name).join(',');
const LISTED = new Set(['gpr32', 'lightbranch', 'nullps']);

// The passes for one stage only.
const STAGE_OF = new Map(Object.entries({
  bonesel: 'vert', aw4: 'vert', lightbranch: 'frag', nullps: 'frag', gpr32: 'frag', earlyz: 'frag', txq: 'frag',
  alpha: 'frag', alphamask: 'frag', earlyhoist: 'frag', tess: 'vert', vsout: 'vert', vszero: 'vert', pszero: 'frag',
}));

// A shader list file (tools/<kind>_shaders.txt) as the set of names it lists, read as deko3d_glsl_opt.py reads it:
// gpr32 its stripped lines not starting with '#', lightbranch / nullps each line up to a '#'; upper case. Text, the
// file's bytes, or an iterable of lines.
export function parseShaderList(kind, list) {
  if (list instanceof Set && list.parsed) {
    return list;
  }
  let lines;
  if (typeof list === 'string' || list instanceof Uint8Array || list instanceof ArrayBuffer) {
    lines = pythonText(list).split('\n');
  } else {
    lines = [...(list || [])];
  }
  const out = new Set();
  for (const ln of lines) {
    if (kind === 'gpr32') {
      const line = strip(ln);
      if (line && !line.startsWith('#')) {
        out.add(line.toUpperCase());
      }
    } else {
      const x = strip(ln.split('#')[0]);
      if (x) {
        out.add(x.toUpperCase());
      }
    }
  }
  out.parsed = true;
  return out;
}

// deko3d_glsl_opt.optimise(text, passes, stage, name); lists: { gpr32, lightbranch, nullps } (parseShaderList's
// inputs), the tools/*_shaders.txt the Python reads (absent from peggle2-nx: those passes change nothing)
export function optimise(text, passes = DEFAULT_PASSES, stage = null, name = null, lists = {}) {
  const names = typeof passes === 'string' ? passes.split(',').filter((p) => p) : [...passes];
  const sets = {
    gpr32: parseShaderList('gpr32', lists.gpr32), lightbranch: parseShaderList('lightbranch', lists.lightbranch),
    nullps: parseShaderList('nullps', lists.nullps),
  };
  return withSubject(text, () => {
    if (stage === null || stage === undefined) {
      stage = rx(String.raw`\bgl_Position\b`).search(text) ? 'vert' : 'frag';
    }
    for (const [pname, fn] of PASSES) {
      if (names.includes(pname) && (STAGE_OF.has(pname) ? STAGE_OF.get(pname) : stage) === stage) {
        text = LISTED.has(pname) ? fn(text, name, sets) : fn(text);
      }
    }
    return text;
  });
}

// optimise() with the default passes (options.passes, options.lists to change them)
export function optimiseGlsl(text, stage, name, options = {}) {
  return optimise(text, options.passes ?? DEFAULT_PASSES, stage, name, options.lists ?? {});
}

// ---------------------------------------------------------------------------------------------------------------------
// the pipeline

const OPT_NAME_RE = /^(vs|ps)_[0-9A-F]{16}$/;

// One game shader as tools/deko3d_shaders.py and tools/deko3d_glsl_opt.py make it: its SPIRV-Cross output (the
// .vk.glsl file's text or bytes) -> { stem, stage, glsl (out/deko3d_shaders/glsl/<stem>.glsl), opt (.../glsl_opt/,
// null for a name the optimiser skips: it takes (vs|ps)_<16 upper-case hex digits> only) }. name: 'ps_<hash>' or
// 'vs_<hash>' (a .vk.glsl / .glsl suffix is dropped). Throws Unsupported where deko3d_shaders.py reports a failure.
// options: uboMap, samplerWords (convert), passes, lists (optimise).
export function deko3dShader(name, vkText, options = {}) {
  const stem = name.replace(/\.vk\.glsl$|\.glsl$/, '');
  const stage = stem.startsWith('ps_') ? 'frag' : 'vert';
  const glsl = convertGlsl(pythonText(vkText), stage, options);
  let opt = null;
  if (OPT_NAME_RE.test(stem)) {
    // written with newline='\n' and read back with universal newlines
    opt = optimiseGlsl(pythonText(glsl), stem.startsWith('ps_') ? 'frag' : 'vert', stem.slice(3, 19), options);
  }
  return { stem, stage, glsl, opt };
}
