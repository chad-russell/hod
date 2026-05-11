//! Rust toolchain — prebuilt binary installation with store-relative relocation.
//!
//! Installs the official Rust 1.95.0 prebuilt binaries (rustc + cargo + rust-std)
//! and lets Hod's relocation machinery patch ELF RUNPATHs for store-relative
//! library resolution.
//!
//! ## Binary layout
//!
//! The installed output contains:
//!   - bin/rustc, bin/rustdoc  (compiler frontends)
//!   - bin/cargo               (package manager)
//!   - lib/librustc_driver.so  (compiler backend)
//!   - lib/libLLVM.so.*        (LLVM shared library)
//!   - lib/rustlib/...         (standard library, linkers, tools)
//!
//! ## Dynamic dependencies
//!
//! The Rust binaries form a self-contained tree for their own libraries:
//!   rustc → librustc_driver.so → libLLVM.so
//!   rust-lld → libLLVM.so
//!
//! System library dependencies come from runtime_deps:
//!   - toolchain: libc, libdl, librt, libpthread, libgcc_s, ld-linux
//!   - zlib: libz.so.1 (needed by rust-lld and libLLVM)
//!
//! ## RUNPATH patching
//!
//! The prebuilt binaries ship with short RUNPATHs (e.g., `$ORIGIN/../lib`).
//! Hod's relocation pipeline uses the ELF extension path in `patch_runpath_to`
//! to append longer store-relative paths to `.dynstr`, enabling these prebuilt
//! binaries to find libraries in the Hod store without recompilation.

import { shellBuild, dep, importToStore } from "../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../toolchain/native-toolchain.js";
import { zlibRecipe } from "../zlib/zlib.js";
import {
  rustcSourceRecipe,
  cargoSourceRecipe,
  rustStdSourceRecipe,
} from "./rust-source.js";
import { cProfile } from "../../helpers/c.js";

const recipe = await shellBuild({
  ...cProfile(),
  script: `
# === Install each component ===
# Source tarballs are pre-extracted by fetchTarball, so the deps contain
# the extracted directory tree directly (top-level dir stripped).
# Each tarball contains its own install.sh that copies files into the prefix.
# --prefix=/ means files go directly into the target (no /usr/local prefix).
# --ldconfig=0 skips running ldconfig (not available/needed in the sandbox).

cp -r /deps/rustc-source/. /tmp/rustc-source
cd /tmp/rustc-source
/deps/toolchain/bin/bash ./install.sh --prefix=/ --disable-ldconfig --destdir=$OUT

cp -r /deps/cargo-source/. /tmp/cargo-source
cd /tmp/cargo-source
/deps/toolchain/bin/bash ./install.sh --prefix=/ --disable-ldconfig --destdir=$OUT

cp -r /deps/rust-std-source/. /tmp/rust-std-source
cd /tmp/rust-std-source
/deps/toolchain/bin/bash ./install.sh --prefix=/ --disable-ldconfig --destdir=$OUT

# === Strip executables (but NOT shared libraries) ===
# Stripping shared libs can remove symbols that downstream tools need.
find $OUT/bin -type f -exec /deps/toolchain/bin/strip {} + 2>/dev/null || true

# === Clean up docs and man pages ===
rm -rf $OUT/share/doc $OUT/share/man $OUT/share/info 2>/dev/null || true

# === Verification ===
echo "=== Rust toolchain installed ==="
ls -la $OUT/bin/
echo "=== Libraries ==="
ls $OUT/lib/*.so* 2>/dev/null || true
echo "=== rust-std ==="
ls $OUT/lib/rustlib/x86_64-unknown-linux-gnu/lib/*.rlib 2>/dev/null | head -5 || true
echo "=== Rust installation complete ==="
`,
  deps: [
    dep("cargo-source", cargoSourceRecipe),
    dep("rust-std-source", rustStdSourceRecipe),
    dep("rustc-source", rustcSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("zlib", zlibRecipe),
  ],
  runtime_deps: ["toolchain", "zlib"],
});

await importToStore(recipe);
export const rustRecipe = recipe;
