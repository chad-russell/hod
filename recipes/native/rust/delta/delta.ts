//! delta native build recipe — syntax-highlighting pager for git.
//!
//! Builds delta 0.19.2 from source using the prebuilt Rust toolchain.
//! Dependencies: toolchain (C compiler + glibc), rust (Rust toolchain),
//! zlib (needed by rust-lld/libLLVM), ca-certificates (HTTPS for cargo).
//!
//! ## Build approach
//!
//! Uses `cargoBuild` with the `source` option to extract the upstream
//! source tarball. Network access (`unsafe_flags: 0x01`) is enabled so
//! cargo can download crate dependencies from crates.io.
//!
//! delta's Cargo.toml uses `edition = "2018"`, satisfied by Rust 1.95.0.
//!
//! Default features include `git` support via the `git2` crate, which
//! compiles libgit2 from source using the `cc` crate — this works in the
//! sandbox since the C toolchain is available. No separate libgit2 build
//! recipe is needed.
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
//! delta is a single dynamically-linked binary that needs the C toolchain's
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
import { deltaSourceRecipe } from "./delta-source.js";
import { cargoBuild } from "../../../helpers/rust.js";
import { caCertEnv } from "../../../helpers/build-env.js";

const recipe = await cargoBuild({
  name: "delta",
  toolchain: nativeToolchainRecipe,
  rustToolchain: rustRecipe,
  source: "source",
  deps: [
    dep("source", deltaSourceRecipe),
    dep("zlib", zlibRecipe),
    dep("ca-certs", caCertificatesRecipe),
  ],
  env: caCertEnv(),
  // Default features include git support (git2/libgit2 compiled from source).
  // Network access required for cargo to download crate dependencies.
  unsafe_flags: 0x01,
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const deltaRecipe = recipe;
