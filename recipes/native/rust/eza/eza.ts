//! eza native build recipe — modern replacement for ls.
//!
//! Builds eza 0.23.4 from source using the prebuilt Rust toolchain.
//! Dependencies: toolchain (C compiler + glibc), rust (Rust toolchain),
//! zlib (needed by rust-lld/libLLVM), ca-certificates (HTTPS for cargo).
//!
//! ## Build approach
//!
//! Uses `cargoBuild` with the `source` option to extract the upstream
//! source tarball. Network access (`unsafe_flags: 0x01`) is enabled so
//! cargo can download crate dependencies from crates.io.
//!
//! eza uses `edition = "2021"` and `rust-version = "1.82.0"`, both
//! satisfied by the bundled Rust 1.95.0 toolchain.
//!
//! Default features include `git` (via `git2`, compiled with
//! `default-features = false` so no vendored SSH/HTTPS). The `git2`
//! crate compiles libgit2 from source via the `cc` crate, which works
//! in the sandbox since the C toolchain is available.
//!
//! ## Note on hermeticity
//!
//! This recipe uses `unsafe_flags: 0x01` (network access) for cargo to
//! download crate dependencies at build time. The build is NOT fully
//! hermetic — it depends on crates.io availability and exact crate
//! versions may drift. Future work: pre-vendor dependencies and build
//! offline.
//!
//! ## Runtime dependencies
//!
//! eza is a single dynamically-linked binary that needs the C toolchain's
//! runtime (libc, libgcc_s, ld-linux). It does NOT need the Rust toolchain
//! at runtime.

import {
  dep,
  importToStore,
} from "../../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../../toolchain/native-toolchain.js";
import { rustRecipe } from "../rust.js";
import { zlibRecipe } from "../../zlib/zlib.js";
import { caCertificatesRecipe } from "../../ca-certificates/ca-certificates.js";
import { ezaSourceRecipe } from "./eza-source.js";
import { cargoBuild } from "../../../helpers/rust.js";
import { caCertEnv } from "../../../helpers/net.js";

const recipe = await cargoBuild({
  name: "eza",
  toolchain: nativeToolchainRecipe,
  rustToolchain: rustRecipe,
  source: "source",
  deps: [
    dep("source", ezaSourceRecipe),
    dep("zlib", zlibRecipe),
    dep("ca-certs", caCertificatesRecipe),
  ],
  env: caCertEnv(),
  // Default features include git support (git2/libgit2 compiled from source).
  unsafe_flags: 0x01,
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const ezaRecipe = recipe;
