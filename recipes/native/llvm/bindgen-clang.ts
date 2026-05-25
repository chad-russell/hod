//! Source-built minimal LLVM 18 libclang package for Rust bindgen.
//!
//! This replaces the temporary upstream prebuilt path with a hermetic source
//! build driven entirely by Hod-provided tools:
//!   - toolchain
//!   - python
//!   - cmake
//!   - ninja
//!   - pinned LLVM monorepo source
//!
//! Host requirements are intentionally minimal:
//!   - no host clang/llvm
//!   - no host cmake
//!   - no host /usr/include
//!   - no host package-manager libraries
//!
//! We configure LLVM/Clang to the smallest plausible build for bindgen:
//!   - LLVM project: clang
//!   - target: X86 only
//!   - tests/examples/docs/benchmarks/bindings off
//!   - terminfo/libxml/libedit/zlib/zstd/curl/ffi off
//!   - shared libLLVM enabled for libclang
//!
//! The final output is trimmed down to bindgen-relevant runtime pieces:
//!   - lib/libclang.so*
//!   - lib/libLLVM.so*
//!   - lib/clang/18/include/

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { pythonRecipe } from "../python/python.js";
import { cmakeRecipe } from "../cmake/cmake.js";
import { ninjaRecipe } from "../ninja/ninja.js";
import { llvmProject18SourceRecipe } from "./llvm-project-18-source.js";
import { cProfile } from "../../helpers/c.js";

const recipe = await shellBuild({
  ...cProfile({
    python: "python",
    binDeps: ["cmake", "ninja"],
  }),
  script: `
cp -a /deps/source/. /tmp/build
mkdir -p /tmp/llvm-build

cd /tmp/llvm-build

# shellBuild sets CC, but LLVM is a C++ build and needs a matching CXX.
export CXX="/deps/toolchain/bin/g++ --sysroot=/deps/toolchain/sysroot -B/deps/toolchain/bin"
export CFLAGS="-O2"
export CXXFLAGS="-O2"

cmake -G Ninja \
  -S /tmp/build/llvm \
  -B /tmp/llvm-build \
  -DCMAKE_INSTALL_PREFIX=/ \
  -DCMAKE_BUILD_TYPE=Release \
  -DLLVM_ENABLE_PROJECTS=clang \
  -DLLVM_TARGETS_TO_BUILD=X86 \
  -DLLVM_BUILD_LLVM_DYLIB=ON \
  -DLLVM_LINK_LLVM_DYLIB=ON \
  -DLLVM_ENABLE_TERMINFO=OFF \
  -DLLVM_ENABLE_LIBXML2=OFF \
  -DLLVM_ENABLE_LIBEDIT=OFF \
  -DLLVM_ENABLE_ZLIB=OFF \
  -DLLVM_ENABLE_ZSTD=OFF \
  -DLLVM_ENABLE_CURL=OFF \
  -DLLVM_ENABLE_FFI=OFF \
  -DLLVM_ENABLE_BINDINGS=OFF \
  -DLLVM_INCLUDE_TESTS=OFF \
  -DLLVM_BUILD_TESTS=OFF \
  -DLLVM_INCLUDE_BENCHMARKS=OFF \
  -DLLVM_BUILD_BENCHMARKS=OFF \
  -DLLVM_INCLUDE_EXAMPLES=OFF \
  -DLLVM_BUILD_EXAMPLES=OFF \
  -DLLVM_INCLUDE_DOCS=OFF \
  -DLLVM_BUILD_DOCS=OFF \
  -DLLVM_INCLUDE_UTILS=ON \
  -DLLVM_BUILD_UTILS=ON \
  -DLLVM_INCLUDE_TOOLS=ON \
  -DLLVM_BUILD_TOOLS=ON \
  -DLLVM_INSTALL_TOOLCHAIN_ONLY=OFF \
  -DCLANG_INCLUDE_TESTS=OFF \
  -DCLANG_ENABLE_ARCMT=OFF \
  -DCLANG_ENABLE_STATIC_ANALYZER=OFF

ninja -C /tmp/llvm-build
DESTDIR=$OUT ninja -C /tmp/llvm-build install

# Trim the install to the bindgen-relevant runtime surface.
mkdir -p /tmp/bindgen-out/lib
cp -a $OUT/lib/clang /tmp/bindgen-out/lib/
cp -a $OUT/lib/libclang.so* /tmp/bindgen-out/lib/
cp -a $OUT/lib/libLLVM.so* /tmp/bindgen-out/lib/
rm -rf $OUT
mkdir -p $OUT
cp -a /tmp/bindgen-out/. $OUT/

# Validation.
export LD_LIBRARY_PATH=$OUT/lib:/deps/toolchain/lib\${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}

echo "=== bindgen-clang shared libs ==="
ls $OUT/lib/libclang.so* $OUT/lib/libLLVM.so* 2>/dev/null || true
echo "=== bindgen-clang builtin headers ==="
ls $OUT/lib/clang/18/include/stdint.h 2>/dev/null || echo "WARNING: clang builtin headers missing"
echo "=== clang resource dirs ==="
ls -d $OUT/lib/clang/* 2>/dev/null || true

cat > /tmp/check-libclang.c << 'EOF'
#include <dlfcn.h>
#include <stdio.h>

int main(void) {
  void *handle = dlopen("/out/lib/libclang.so", RTLD_NOW);
  if (!handle) {
    fprintf(stderr, "dlopen(libclang.so) failed: %s\\n", dlerror());
    return 1;
  }
  puts("dlopen(libclang.so) ok");
  dlclose(handle);
  return 0;
}
EOF
$CC -o /tmp/check-libclang /tmp/check-libclang.c -ldl
/tmp/check-libclang

echo "=== bindgen-clang source build complete ==="
`,
  deps: [
    dep("source", llvmProject18SourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("python", pythonRecipe),
    dep("cmake", cmakeRecipe),
    dep("ninja", ninjaRecipe),
  ],
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const bindgenClangRecipe = recipe;
