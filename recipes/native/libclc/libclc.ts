//! libclc 22.1.5 for Mesa's SPIR-V OpenCL builtins.
//!
//! Mesa's iris driver in Mesa 26 requires libclc's `spirv-mesa3d` targets at
//! build time. We build only the two Mesa SPIR-V variants and let Mesa embed
//! them statically with `-Dstatic-libclc=spirv,spirv64` for store portability.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { cProfile } from "../../helpers/c.js";
import { cmakeRecipe } from "../cmake/cmake.js";
import { ninjaRecipe } from "../ninja/ninja.js";
import { llvmRecipe } from "../llvm/llvm.js";
import { spirvToolsRecipe } from "../spirv-tools/spirv-tools.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { zstdRecipe } from "../zstd/zstd.js";
import { libclcSourceRecipe } from "./libclc-source.js";

const recipe = await shellBuild({
  ...cProfile({
    binDeps: ["cmake", "ninja", "spirv-tools"],
    libDeps: ["zlib", "zstd"],
  }),
  script: `
cp -a /deps/source/. /tmp/build
mkdir -p /tmp/libclc-build

# LLVM 22's SPIR-V backend can leave OpenCL C header inline helpers as
# unresolved externals. Make libclc header helpers internal to each translation
# unit so the final SPIR-V link has no dangling references.
sed -i 's|#define _CLC_INLINE inline|#define _CLC_INLINE static inline|' /tmp/build/libclc/clc/include/clc/clcfunc.h

export CXX="/deps/toolchain/bin/g++ --sysroot=/deps/toolchain/sysroot -B/deps/toolchain/bin"
export CFLAGS="-O2"
export CXXFLAGS="-O2"

cmake -G Ninja \
  -S /tmp/build/libclc \
  -B /tmp/libclc-build \
  -DCMAKE_INSTALL_PREFIX=/ \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_TRY_COMPILE_TARGET_TYPE=STATIC_LIBRARY \
  -DLLVM_DIR=/deps/llvm/lib/cmake/llvm \
  -DLLVM_TOOLS_BINARY_DIR=/deps/llvm/bin \
  -DLIBCLC_USE_SPIRV_BACKEND=ON \
  -DLIBCLC_TARGETS_TO_BUILD='spirv-mesa3d-;spirv64-mesa3d-'

ninja -C /tmp/libclc-build
DESTDIR=$OUT ninja -C /tmp/libclc-build install

if [ -d $OUT/usr ]; then
  cp -a $OUT/usr/. $OUT/
  rm -rf $OUT/usr
fi

sed -i 's|^libexecdir=.*|libexecdir=/deps/libclc/share/clc|' $OUT/share/pkgconfig/libclc.pc

echo "=== libclc SPIR-V targets ==="
ls $OUT/share/clc/spirv-mesa3d-.spv $OUT/share/clc/spirv64-mesa3d-.spv
echo "=== libclc pkg-config ==="
cat $OUT/share/pkgconfig/libclc.pc
echo "=== libclc build complete ==="
`,
  deps: [
    dep("source", libclcSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("cmake", cmakeRecipe),
    dep("ninja", ninjaRecipe),
    dep("llvm", llvmRecipe),
    dep("spirv-tools", spirvToolsRecipe),
    dep("zlib", zlibRecipe),
    dep("zstd", zstdRecipe),
  ],
});

await importToStore(recipe);
export const libclcRecipe = recipe;
