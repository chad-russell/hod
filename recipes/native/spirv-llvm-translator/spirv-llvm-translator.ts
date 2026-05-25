//! SPIRV-LLVM-Translator 22.1.0.
//!
//! Provides LLVMSPIRVLib, required by Mesa's internal CLC compiler when
//! building Intel iris support with LLVM 22.1.x.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { cProfile } from "../../helpers/c.js";
import { cmakeRecipe } from "../cmake/cmake.js";
import { ninjaRecipe } from "../ninja/ninja.js";
import { llvmRecipe } from "../llvm/llvm.js";
import { spirvHeadersLlvmTranslatorRecipe } from "../spirv-headers/spirv-headers-llvm-translator.js";
import { spirvToolsRecipe } from "../spirv-tools/spirv-tools.js";
import { libxml2Recipe } from "../libxml2/libxml2.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { zstdRecipe } from "../zstd/zstd.js";
import { spirvLlvmTranslatorSourceRecipe } from "./spirv-llvm-translator-source.js";

const recipe = await shellBuild({
  ...cProfile({
    binDeps: ["cmake", "ninja"],
    pkgConfigDeps: ["spirv-tools", "zlib", "zstd", "libxml2"],
  }),
  script: `
cp -a /deps/source/. /tmp/build

export CXX="/deps/toolchain/bin/g++ --sysroot=/deps/toolchain/sysroot -B/deps/toolchain/bin"
export CFLAGS="-O2"
export CXXFLAGS="-O2"

mkdir -p /tmp/cmake-bin
cat > /tmp/cmake-bin/cc << 'EOF'
#!/bin/sh
exec /deps/toolchain/bin/gcc --sysroot=/deps/toolchain/sysroot -B/deps/toolchain/bin "$@"
EOF
cat > /tmp/cmake-bin/cxx << 'EOF'
#!/bin/sh
exec /deps/toolchain/bin/g++ --sysroot=/deps/toolchain/sysroot -B/deps/toolchain/bin "$@"
EOF
chmod +x /tmp/cmake-bin/cc /tmp/cmake-bin/cxx

cat > /tmp/llvm-imports.cmake << 'EOF'
if(NOT TARGET zstd::libzstd_static)
  add_library(zstd::libzstd_static STATIC IMPORTED)
  set_target_properties(zstd::libzstd_static PROPERTIES
    IMPORTED_LOCATION "/deps/zstd/lib/libzstd.a"
    INTERFACE_INCLUDE_DIRECTORIES "/deps/zstd/include")
endif()
EOF

cmake -G Ninja \
  -S /tmp/build \
  -B /tmp/build-dir \
  -DCMAKE_INSTALL_PREFIX=/ \
  -DCMAKE_INSTALL_BINDIR=bin \
  -DCMAKE_INSTALL_INCLUDEDIR=include \
  -DCMAKE_INSTALL_LIBDIR=lib \
  -DCMAKE_INSTALL_DATADIR=share \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_C_COMPILER=/tmp/cmake-bin/cc \
  -DCMAKE_CXX_COMPILER=/tmp/cmake-bin/cxx \
  -DCMAKE_PROJECT_LLVM_SPIRV_INCLUDE=/tmp/llvm-imports.cmake \
  -DZLIB_LIBRARY=/deps/zlib/lib/libz.so \
  -DZLIB_INCLUDE_DIR=/deps/zlib/include \
  -Dzstd_LIBRARY=/deps/zstd/lib/libzstd.so \
  -Dzstd_INCLUDE_DIR=/deps/zstd/include \
  -DLIBXML2_LIBRARY=/deps/libxml2/lib/libxml2.so \
  -DLIBXML2_INCLUDE_DIR=/deps/libxml2/include/libxml2 \
  -DLLVM_DIR=/deps/llvm/lib/cmake/llvm \
  -DLLVM_TOOLS_BINARY_DIR=/deps/llvm/bin \
  -DLLVM_EXTERNAL_SPIRV_HEADERS_SOURCE_DIR=/deps/spirv-headers \
  -DLLVM_SPIRV_INCLUDE_TESTS=OFF \
  -DLLVM_SPIRV_ENABLE_LIBSPIRV_DIS=OFF \
  -DCMAKE_PREFIX_PATH='/deps/spirv-tools;/deps/spirv-headers'

ninja -C /tmp/build-dir LLVMSPIRVLib llvm-spirv

mkdir -p $OUT/bin $OUT/include/LLVMSPIRVLib $OUT/lib/pkgconfig
cp -a /tmp/build-dir/lib/SPIRV/libLLVMSPIRVLib.a $OUT/lib/
cp -a /tmp/build-dir/tools/llvm-spirv/llvm-spirv $OUT/bin/
cp -a /tmp/build/include/LLVMSPIRVLib.h $OUT/include/LLVMSPIRVLib/
cp -a /tmp/build/include/LLVMSPIRVOpts.h $OUT/include/LLVMSPIRVLib/
cp -a /tmp/build/include/LLVMSPIRVExtensions.inc $OUT/include/LLVMSPIRVLib/
cp -a /tmp/build-dir/LLVMSPIRVLib.pc $OUT/lib/pkgconfig/

sed -i 's|^prefix=.*|prefix=/deps/spirv-llvm-translator|' $OUT/lib/pkgconfig/LLVMSPIRVLib.pc

echo "=== SPIRV-LLVM-Translator install ==="
ls $OUT/lib/libLLVMSPIRVLib.a
cat $OUT/lib/pkgconfig/LLVMSPIRVLib.pc
echo "=== SPIRV-LLVM-Translator complete ==="
`,
  deps: [
    dep("source", spirvLlvmTranslatorSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("cmake", cmakeRecipe),
    dep("ninja", ninjaRecipe),
    dep("llvm", llvmRecipe),
    dep("spirv-headers", spirvHeadersLlvmTranslatorRecipe),
    dep("spirv-tools", spirvToolsRecipe),
    dep("libxml2", libxml2Recipe),
    dep("zlib", zlibRecipe),
    dep("zstd", zstdRecipe),
  ],
  runtime_deps: ["toolchain", "zlib", "zstd"],
});

await importToStore(recipe);
export const spirvLlvmTranslatorRecipe = recipe;
