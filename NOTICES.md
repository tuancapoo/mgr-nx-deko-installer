# Third-party notices

| Component | Where | License |
|---|---|---|
| [sa2-nx-installer](https://github.com/chanseyisthebest/sa2-nx-installer) by ChanseyIsTheBest, the page this one adapts, and [nfsmw-nx-installer](https://github.com/StevensND/nfsmw-nx-installer) by StevensND (commit `e7ec1b65`): the page's structure and style, the service worker (`sw.js`), the worker's download stream, the XEX reader (`lib/xex.js`), the zip writer (`lib/zip.js`), the language picker and its flags | `sw.js`, `worker.js`, `app.js`, `index.html`, `lib/` | GPL-3.0 |
| [DirectXShaderCompiler](https://github.com/microsoft/DirectXShaderCompiler) v2025.1 (commit `75a029d95`), unmodified, with its bundled SPIRV-Tools and SPIRV-Headers, and the `dxc_web.cpp` wrapper, as built by nfsmw-nx-installer | `wasm/dxc_web.*` | University of Illinois/NCSA Open Source License (LLVM); SPIRV-Tools: Apache-2.0; SPIRV-Headers: MIT; the wrapper: GPL-3.0 |
| Renut's shader translator: XenosRecomp as [reNut](https://github.com/masterspike52/reNut) by masterspike52 carries it (reblue-XenosRecomp), through banjo-nx, with the changes of banjo-nx, peggle2-nx, sa2-nx and mgr-nx-deko, and peggle2-nx's `renut_hlsl_frontend.cpp`, built from [mgr-nx-deko](https://github.com/tuancapoo/mgr-nx-deko) (Emscripten 5) | `wasm/renut_hlsl.*`, `renut_shader_common.h` | MIT (XenosRecomp); the front end: GPL-3.0 |
| [SPIRV-Cross](https://github.com/KhronosGroup/SPIRV-Cross) by the Khronos Group (commit `22b22f56`), unmodified, as built by peggle2-nx-installer | `wasm/spirv_cross.*` | Apache-2.0 |
| The deko3d GLSL conversion and passes (sa2-nx's and banjo-nx's `tools/deko3d_glsl.py`, `tools/deko3d_glsl_opt.py`) in JavaScript, and the package writer, from [peggle2-nx-installer](https://github.com/ChanseyIsTheBest/peggle2-nx-installer) | `lib/deko3d_glsl.js`, `lib/deko3d_package.js` | GPL-3.0 |
| [libmspack](https://www.cabextract.org.uk/libmspack/) by Stuart Caie (LZX decoder) | `wasm/lzx.*` | LGPL-2.1 |
| [xxHash](https://github.com/Cyan4973/xxHash) by Yann Collet | `wasm/renut_hlsl.*` | BSD-2-Clause |
| [Emscripten](https://emscripten.org) runtime | `wasm/*.mjs` | MIT and the University of Illinois/NCSA Open Source License |

`wasm/lzx.*` is built from the sa2-nx repository with
`shaders/wasm/build_wasm_tools.sh` (Emscripten 6.0.11). libmspack is covered by the GNU Lesser General Public License
2.1: `wasm/lzx.wasm` is built from the unmodified libmspack sources (`lzxd.c` and `system.c`, at the commit pinned by
ReXGlue SDK v0.10.0, in `sdk/thirdparty/libmspack` of sa2-nx) and `shaders/wasm/sa2_lzx.cpp` of sa2-nx. With those
sources it can be rebuilt and replaced by a modified version.

The licenses of the software in the package (the NRO and its libraries) are in [release/LICENSES.txt](release/LICENSES.txt),
and the source code with its license is at https://github.com/tuancapoo/mgr-nx-deko.

The icons and `icons/cover.jpg` are the game's cover art, © Konami Digital Entertainment, shown to identify the game. `lib/cpk.js` (the CPK reader) is mgr-nx-deko's, GPL-3.0.
