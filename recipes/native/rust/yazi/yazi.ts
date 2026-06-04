//! yazi native build recipe — blazing fast terminal file manager.
//!
//! Builds yazi 26.5.6 from source using the prebuilt Rust toolchain.
//! Dependencies: toolchain (C compiler + glibc), rust (Rust toolchain),
//! zlib (needed by rust-lld/libLLVM), ca-certificates (HTTPS for cargo).
//!
//! ## Build approach
//!
//! Uses `cargoBuild` with the `source` option to extract the upstream
//! source tarball. Network access (`unsafe_flags: 0x01`) is enabled so
//! cargo can download crate dependencies from crates.io.
//!
//! Yazi is a Cargo workspace with two default members:
//!   - `yazi-fm` → produces the `yazi` binary (TUI file manager)
//!   - `yazi-cli` → produces the `ya` binary (CLI companion)
//!
//! Both binaries are installed via `extraBinaries`.
//!
//! Yazi's Cargo.toml uses `edition = "2024"` and `rust-version = "1.95.0"`,
//! both satisfied by Rust 1.95.0.
//!
//! Default features are used as-is. No feature flags need to be toggled.
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
//! Both yazi and ya are dynamically-linked binaries that need the C
//! toolchain's runtime (libc, libgcc_s, ld-linux). They do NOT need the
//! Rust toolchain at runtime.

import {
  dep,
  importToStore,
} from "../../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../../toolchain/native-toolchain.js";
import { rustRecipe } from "../rust.js";
import { zlibRecipe } from "../../zlib/zlib.js";
import { caCertificatesRecipe } from "../../ca-certificates/ca-certificates.js";
import { yaziSourceRecipe } from "./yazi-source.js";
import { cargoBuild } from "../../../helpers/rust.js";
import { caCertEnv } from "../../../helpers/net.js";

const recipe = await cargoBuild({
  name: "yazi",
  extraBinaries: ["ya"],
  toolchain: nativeToolchainRecipe,
  rustToolchain: rustRecipe,
  source: "source",
  deps: [
    dep("source", yaziSourceRecipe),
    dep("zlib", zlibRecipe),
    dep("ca-certs", caCertificatesRecipe),
  ],
  env: {
    ...caCertEnv(),
    CFLAGS: "-O2 --sysroot=/deps/toolchain/sysroot -I/deps/toolchain/sysroot/include",
  },
  // Network access required for cargo to download crate dependencies.
  unsafe_flags: 0x01,
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const yaziRecipe = recipe;
