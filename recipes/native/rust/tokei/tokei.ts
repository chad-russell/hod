//! tokei native build recipe — count your code, quickly.
//!
//! Builds tokei 14.0.0 from source using the prebuilt Rust toolchain.
//! Dependencies: toolchain (C compiler + glibc), rust (Rust toolchain),
//! zlib (needed by rust-lld/libLLVM), ca-certificates (HTTPS for cargo).
//!
//! ## Build approach
//!
//! Uses `cargoBuild` with the `source` option to extract the upstream
//! source tarball. Network access (`unsafe_flags: 0x01`) is enabled so
//! cargo can download crate dependencies from crates.io.
//!
//! tokei's Cargo.toml uses `edition = "2021"` and `rust-version = "1.71"`,
//! both satisfied by Rust 1.95.0.
//!
//! No special C dependencies required — tokei is a pure Rust application.
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
//! tokei is a dynamically-linked binary that needs the C toolchain's
//! runtime (libc, libgcc_s, ld-linux). It does NOT need the Rust
//! toolchain at runtime.

import {
  cargoBuild,
  dep,
  importToStore,
} from "../../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../../toolchain/native-toolchain.js";
import { rustRecipe } from "../rust.js";
import { zlibRecipe } from "../../zlib/zlib.js";
import { caCertificatesRecipe } from "../../ca-certificates/ca-certificates.js";
import { tokeiSourceRecipe } from "./tokei-source.js";

const recipe = await cargoBuild({
  name: "tokei",
  toolchain: "toolchain",
  rustToolchain: "rust",
  source: "source",
  deps: [
    dep("source", tokeiSourceRecipe),
    dep("toolchain", nativeToolchainRecipe),
    dep("rust", rustRecipe),
    dep("zlib", zlibRecipe),
    dep("ca-certs", caCertificatesRecipe),
  ],
  env: {
    CARGO_HTTP_CAINFO: "/deps/ca-certs/etc/ssl/certs/ca-certificates.crt",
    SSL_CERT_FILE: "/deps/ca-certs/etc/ssl/certs/ca-certificates.crt",
  },
  // Network access required for cargo to download crate dependencies.
  unsafe_flags: 0x01,
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const tokeiRecipe = recipe;
