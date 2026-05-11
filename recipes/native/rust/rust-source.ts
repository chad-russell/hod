//! Rust toolchain source downloads.
//!
//! Downloads and extracts the three official Rust 1.95.0 prebuilt tarballs for
//! x86_64-unknown-linux-gnu:
//!   - rustc (compiler + LLVM)
//!   - cargo (package manager)
//!   - rust-std (standard library)
//!
//! Each tarball is fetched via fetchTarball (Download + Unpack), so the
//! extracted directory tree is available directly as a dep without any
//! extraction boilerplate in the build script.

import { fetchTarball } from "../../../js/src/index.js";

const rustcSourceRecipe = await fetchTarball({
  url: "https://static.rust-lang.org/dist/rustc-1.95.0-x86_64-unknown-linux-gnu.tar.xz",
  hash: "ef32bbf1510229c5d071dba28c2eeadce1b87b39f231ff564a38fdc60eb44b70",
});

const cargoSourceRecipe = await fetchTarball({
  url: "https://static.rust-lang.org/dist/cargo-1.95.0-x86_64-unknown-linux-gnu.tar.xz",
  hash: "24169b4b6d63f482e0289870b8d7dcbde65a5b2242d43e5fed70bd1c3199bf17",
});

const rustStdSourceRecipe = await fetchTarball({
  url: "https://static.rust-lang.org/dist/rust-std-1.95.0-x86_64-unknown-linux-gnu.tar.xz",
  hash: "bcbe45dc74ff3f5d50881a9f1476f9362d385ed179e4ff7db3a0ec5b4d340624",
});

export { rustcSourceRecipe, cargoSourceRecipe, rustStdSourceRecipe };
