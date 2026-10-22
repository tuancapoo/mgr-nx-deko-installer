#!/usr/bin/env bash
# Builds the installer's modules for the Switch build's second renderer (Renut on deko3d, 2026-10-20):
#   spirv_cross.mjs  SPIRV-Cross's command line program (the source of sa2-nx's out/deko3d_tools/spirv-cross.exe:
#                    KhronosGroup/SPIRV-Cross 22b22f56, the copy in UnleashedRecomp-NX's MoltenVK), called with
#                    tools/deko3d_shaders.py's arguments (--version 460 --vulkan-semantics --relax-nan-checks)
#   renut_hlsl.mjs   Renut's shader translator (sa2-nx's app/thirdparty/reblue-XenosRecomp, RENUT_RECOMP) without
#                    its DXC and packaging: sa2-nx's tools/renut_hlsl_frontend.cpp writes each container's HLSL
#                    (and its numbers, for the check against the NRO's table)
# The page writes the inputs into Emscripten's in-memory file system and calls callMain([...]) with the command line's
# arguments, as for the native renderer's modules (wasm/src/shaders/build_wasm_shaders.sh).
#
#   SA2_NX   the sa2-nx checkout                  (default: ../sa2-nx next to the installer)
#   SPIRV_CROSS  SPIRV-Cross's source tree            (default: C:/devkitPro/UnleashedRecomp-NX/thirdparty/MoltenVK/SPIRV-Cross)
#   EMSDK        an emsdk folder with Emscripten 6.0.11 (used when em++ is not on PATH;
#                default: D:/sonic adventure 2/_tools/emsdk)
#   OUT          output folder                         (default: the installer's wasm/)
#   usage: wasm/src/deko3d/build_wasm_deko3d.sh [spirv_cross] [renut_hlsl]     (default: both)
set -eu
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
INSTALLER=$(cd "$HERE/../../.." && pwd)
SA2_NX=${SA2_NX:-$INSTALLER/../sa2-nx}
SA2_NX=$(cd "$SA2_NX" && pwd)
SPIRV_CROSS=${SPIRV_CROSS:-"C:/devkitPro/UnleashedRecomp-NX/thirdparty/MoltenVK/SPIRV-Cross"}
command -v cygpath >/dev/null 2>&1 && SPIRV_CROSS=$(cygpath -u "$SPIRV_CROSS")
OUT=${OUT:-$INSTALLER/wasm}
mkdir -p "$OUT"
if ! command -v em++ >/dev/null 2>&1; then
  EMSDK=${EMSDK:-"D:/sonic adventure 2/_tools/emsdk"}
  command -v cygpath >/dev/null 2>&1 && EMSDK=$(cygpath -u "$EMSDK")
  [ -f "$EMSDK/.emscripten" ] || { echo "em++ not found and no emsdk at $EMSDK: set EMSDK" >&2; exit 1; }
  export EM_CONFIG="$EMSDK/.emscripten"
  for d in "$EMSDK"/python/*/ "$EMSDK"/node/*/; do PATH="$d:$PATH"; done
  PATH="$EMSDK/upstream/emscripten:$PATH"
fi
echo "em++: $(em++ --version | head -1)"

COMMON=(-sEXPORT_ES6=1 -sMODULARIZE=1 -sINVOKE_RUN=0 -sEXIT_RUNTIME=0 -sALLOW_MEMORY_GROWTH=1
        -sSTACK_SIZE=4MB -sEXPORTED_RUNTIME_METHODS=FS,callMain -sENVIRONMENT=web,worker,node)
targets=${*:-spirv_cross renut_hlsl}

for t in $targets; do
  echo "=== $t"
  case $t in
    spirv_cross)
      # main.cpp and every backend it links (the GLSL one is the one used); exceptions on, as the native build.
      em++ -std=c++11 -O2 -fexceptions -I"$SPIRV_CROSS" "$SPIRV_CROSS"/main.cpp "$SPIRV_CROSS"/spirv_cross.cpp \
        "$SPIRV_CROSS"/spirv_parser.cpp "$SPIRV_CROSS"/spirv_cross_parsed_ir.cpp "$SPIRV_CROSS"/spirv_cfg.cpp \
        "$SPIRV_CROSS"/spirv_glsl.cpp "$SPIRV_CROSS"/spirv_cpp.cpp "$SPIRV_CROSS"/spirv_msl.cpp \
        "$SPIRV_CROSS"/spirv_hlsl.cpp "$SPIRV_CROSS"/spirv_reflect.cpp "$SPIRV_CROSS"/spirv_cross_util.cpp \
        -o "$OUT/spirv_cross.mjs" -sEXPORT_NAME=createSpirvCrossModule -sDISABLE_EXCEPTION_CATCHING=0 \
        "${COMMON[@]}";;
    renut_hlsl)
      XENOS=$SA2_NX/app/thirdparty/reblue-XenosRecomp/XenosRecomp
      XXHASH_DIR=${XXHASH_DIR:-$SA2_NX/sdk/thirdparty/xxHash}
      FMT_DIR=${FMT_DIR:-$SA2_NX/sdk/thirdparty/fmt/include}
      em++ -std=c++20 -O1 -I"$XENOS/.." -I"$XENOS" -I"$FMT_DIR" -I"$XXHASH_DIR" -include "$SA2_NX/tools/renut_hlsl_pch.h" \
        -Wno-null-arithmetic -fms-extensions -DFMT_HEADER_ONLY -DXXH_INLINE_ALL -DRENUT_RECOMP \
        "$SA2_NX/tools/renut_hlsl_frontend.cpp" "$XENOS/shader_recompiler.cpp" -o "$OUT/renut_hlsl.mjs" \
        -sEXPORT_NAME=createRenutHlslModule "${COMMON[@]}";;
    *) echo "unknown target $t" >&2; exit 1;;
  esac
done
echo "done: $OUT"
