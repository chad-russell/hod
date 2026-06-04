//! bottom native build recipe — cross-platform system monitor.
//!
//! Builds ClementTsang/bottom 0.12.3 from source using the prebuilt Rust
//! toolchain. Dependencies: toolchain (C compiler + glibc), rust (Rust
//! toolchain), zlib (needed by rust-lld/libLLVM), ca-certificates (HTTPS
//! for cargo).
//!
//! ## Build approach
//!
//! Uses `cargoBuild` with the `source` option to extract the upstream
//! source tarball. Network access (`unsafe_flags: 0x01`) is enabled so
//! cargo can download crate dependencies from crates.io.
//!
//! bottom uses `edition = "2024"` and `rust-version = "1.85"`, both
//! satisfied by Rust 1.95.0.
//!
//! Default features are enabled. The binary name is `btm`.
//!
//! ## Note on hermeticity
//!
//! This recipe uses `unsafe_flags: 0x01` (network access) for cargo to
//! download crate dependencies at build time. This means the build is
//! NOT fully hermetic — it depends on crates.io availability and the
//! exact crate versions may drift if Cargo.toml uses loose version
//! specifiers. Future work: pre-vendor dependencies and build offline.
//!
//! ## Runtime dependencies
//!
//! bottom (btm) is a single dynamically-linked binary that needs the C
//! toolchain's runtime (libc, libgcc_s, ld-linux). It does NOT need the
//! Rust toolchain at runtime.

import {
  dep,
  importToStore,
} from "../../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../../toolchain/native-toolchain.js";
import { rustRecipe } from "../rust.js";
import { zlibRecipe } from "../../zlib/zlib.js";
import { caCertificatesRecipe } from "../../ca-certificates/ca-certificates.js";
import { bottomSourceRecipe } from "./bottom-source.js";
import { cargoBuild } from "../../../helpers/rust.js";
import { caCertEnv } from "../../../helpers/net.js";

const recipe = await cargoBuild({
  name: "btm",
  toolchain: nativeToolchainRecipe,
  rustToolchain: rustRecipe,
  source: "source",
  deps: [
    dep("source", bottomSourceRecipe),
    dep("zlib", zlibRecipe),
    dep("ca-certs", caCertificatesRecipe),
  ],
  env: caCertEnv(),
  // Network access required for cargo to download crate dependencies.
  unsafe_flags: 0x01,
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const bottomRecipe = recipe;
