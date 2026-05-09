//! fd native build recipe — fast, user-friendly find replacement.
//!
//! Builds fd 10.2.0 from source using the prebuilt Rust toolchain.
//! Dependencies: toolchain (C compiler + glibc), rust (Rust toolchain),
//! zlib (needed by rust-lld/libLLVM), ca-certificates (HTTPS for cargo).
//!
//! ## Build approach
//!
//! Uses `cargoBuild` with the `source` option to extract the upstream
//! source tarball. Network access (`unsafe_flags: 0x01`) is enabled so
//! cargo can download crate dependencies from crates.io.
//!
//! fd's Cargo.toml uses `edition = "2021"` and `rust-version = "1.77.2"`,
//! both satisfied by Rust 1.95.0.
//!
//! Default features are disabled to skip jemalloc. This keeps the recipe
//! simpler and avoids extra allocator build/configure surface area while still
//! preserving the `completions` feature for shell tab completion.
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
//! fd is a single dynamically-linked binary that needs the C toolchain's
//! runtime (libc, libgcc_s, ld-linux). It does NOT need the Rust toolchain
//! at runtime.

import {
  cargoBuild,
  dep,
  importToStore,
} from "../../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../../toolchain/native-toolchain.js";
import { rustRecipe } from "../rust.js";
import { zlibRecipe } from "../../zlib/zlib.js";
import { caCertificatesRecipe } from "../../ca-certificates/ca-certificates.js";
import { fdSourceRecipe } from "./fd-source.js";

const recipe = await cargoBuild({
  name: "fd",
  toolchain: "toolchain",
  rustToolchain: "rust",
  source: "source",
  deps: [
    dep("source", fdSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("rust", rustRecipe),
    dep("zlib", zlibRecipe),
    dep("ca-certs", caCertificatesRecipe),
  ],
  env: {
    CARGO_HTTP_CAINFO: "/deps/ca-certs/etc/ssl/certs/ca-certificates.crt",
    SSL_CERT_FILE: "/deps/ca-certs/etc/ssl/certs/ca-certificates.crt",
  },
  // Disable default features to skip jemalloc and keep the recipe surface
  // smaller. Keep completions feature for shell tab completion support.
  cargoFlags: ["--no-default-features", "--features", "completions"],
  // Network access required for cargo to download crate dependencies.
  unsafe_flags: 0x01,
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const fdRecipe = recipe;
