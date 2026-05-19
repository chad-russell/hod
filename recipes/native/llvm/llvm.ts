//! LLVM 22.1.5 — prebuilt binary installation with store-relative relocation.
//!
//! Installs the official LLVM 22.1.5 prebuilt binaries for x86_64 Linux.
//! This provides everything Mesa needs at build time:
//!   - bin/llvm-config     — build configuration tool
//!   - bin/clang, lld, etc — C compiler and linker (build-time tools)
//!   - include/llvm/...    — C/C++ headers for LLVM API
//!   - lib/libLLVM*.a      — 220 static LLVM component libraries
//!   - lib/cmake/llvm/     — CMake finder modules
//!
//! ## Note: no libLLVM.so
//!
//! The official LLVM prebuilt tarball does NOT include a shared libLLVM.so.
//! Instead, it provides 220+ individual static archives. Mesa's meson build
//! can link against these static libraries using the "binary wrap" approach
//! (a custom subprojects/llvm/meson.build that declares the dependency with
//! explicit paths to the .a files). This actually simplifies runtime_deps
//! since there's no libLLVM.so to ship at runtime.
//!
//! ## Binary layout
//!
//! The LLVM prebuilt tarball extracts into a single top-level directory
//! (LLVM-22.1.5-Linux-X64/) containing bin/, lib/, include/, share/, etc.
//! We copy the entire tree into $OUT.
//!
//! ## Dynamic dependencies
//!
//! LLVM binaries and shared libraries (libclang, libLTO, etc.) depend on:
//!   - toolchain: libc, libm, libdl, librt, libpthread, libgcc_s, ld-linux
//!   - zlib: libz.so.1
//!   - zstd: libzstd.so.1
//!
//! ## RUNPATH patching
//!
//! The prebuilt binaries ship with short RUNPATHs (e.g., `$ORIGIN/../lib`).
//! Hod's relocation pipeline patches RUNPATHs to append store-relative paths,
//! enabling these binaries to find libraries in the Hod store.
//!
//! ## Why prebuilt?
//!
//! LLVM is ~10M lines of C++. Building from source takes 30+ minutes on good
//! hardware. We use the same prebuilt-binary approach as our Rust toolchain.
//! Building from source is a future trust-reduction milestone.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { zlibRecipe } from "../zlib/zlib.js";
import { zstdRecipe } from "../zstd/zstd.js";
import { llvmSourceRecipe } from "./llvm-source.js";
import { cProfile } from "../../helpers/c.js";

const recipe = await shellBuild({
  ...cProfile(),
  script: `
# === Install LLVM prebuilt binaries ===
# The fetchTarball extracts and strips the top-level directory, so
# /deps/llvm-source/ contains the full LLVM installation tree directly.

cp -r /deps/llvm-source/. $OUT

# === Strip executables (but NOT shared libraries) ===
# Stripping shared libs can remove symbols that downstream tools (Mesa, rustc) need.
find $OUT/bin -type f -exec /deps/toolchain/bin/strip {} + 2>/dev/null || true

# === Clean up unnecessary files ===
rm -rf $OUT/share/doc 2>/dev/null || true
rm -rf $OUT/share/man 2>/dev/null || true
rm -rf $OUT/share/info 2>/dev/null || true

# === Verification ===
echo "=== LLVM binaries ==="
ls $OUT/bin/llvm-config $OUT/bin/clang $OUT/bin/lld 2>/dev/null || echo "WARNING: expected binaries missing"
echo "=== LLVM shared libraries ==="
ls $OUT/lib/libclang-cpp.so* $OUT/lib/libclang.so* $OUT/lib/libLTO.so* 2>/dev/null || true
echo "=== LLVM static libraries ==="
ls $OUT/lib/libLLVMCore.a $OUT/lib/libLLVMX86CodeGen.a $OUT/lib/libLLVMSupport.a 2>/dev/null || echo "WARNING: key static libs missing"
echo "=== LLVM headers ==="
ls $OUT/include/llvm/Config/llvm-config.h 2>/dev/null || echo "WARNING: headers missing"
echo "=== LLVM cmake ==="
ls $OUT/lib/cmake/llvm/LLVMConfig.cmake 2>/dev/null || echo "WARNING: cmake files missing"
echo "=== llvm-config version ==="
$OUT/bin/llvm-config --version 2>/dev/null || true
echo "=== LLVM installation complete ==="
`,
  deps: [
    dep("llvm-source", llvmSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("zlib", zlibRecipe),
    dep("zstd", zstdRecipe),
  ],
  runtime_deps: ["toolchain", "zlib", "zstd"],
});

await importToStore(recipe);
export const llvmRecipe = recipe;
