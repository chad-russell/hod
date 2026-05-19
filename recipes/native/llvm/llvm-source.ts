//! LLVM source download.
//!
//! Downloads the official LLVM 22.1.5 prebuilt binary tarball for x86_64 Linux.
//! This includes clang, llvm-config, headers, CMake files, and libLLVM.so —
//! everything Mesa needs at build time and runtime.
//!
//! Rust 1.95.0 bundles LLVM 22 internally, so using the same major version
//! keeps our toolchain consistent.

import { fetchTarball } from "../../../js/src/index.js";

export const llvmSourceRecipe = await fetchTarball({
  url: "https://github.com/llvm/llvm-project/releases/download/llvmorg-22.1.5/LLVM-22.1.5-Linux-X64.tar.xz",
  hash: "c855ef298e3b08867f566e69ea863c4809bfa237aa216c77a2ff4fd1addf43f4",
});
