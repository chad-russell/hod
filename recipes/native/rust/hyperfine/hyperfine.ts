//! hyperfine native build recipe — command-line benchmarking tool.
//!
//! Builds hyperfine 1.19.0 from source using the prebuilt Rust toolchain.
//! Dependencies: toolchain (C compiler + glibc), rust (Rust toolchain),
//! zlib (needed by rust-lld/libLLVM), ca-certificates (HTTPS for cargo).
//!
//! ## Build approach
//!
//! Uses `cargoBuild` with the `source` option to extract the upstream
//! source tarball. Network access (`unsafe_flags: 0x01`) is enabled so
//! cargo can download crate dependencies from crates.io.
//!
//! hyperfine's Cargo.toml uses `edition = "2018"` and `rust-version = "1.76.0"`,
//! both satisfied by Rust 1.95.0.
//!
//! No special C dependencies required — hyperfine is a pure Rust application.
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
//! hyperfine is a dynamically-linked binary that needs the C toolchain's
//! runtime (libc, libgcc_s, ld-linux). It does NOT need the Rust
//! toolchain at runtime.

import {
  dep,
  importToStore,
} from "../../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../../toolchain/native-toolchain.js";
import { rustRecipe } from "../rust.js";
import { zlibRecipe } from "../../zlib/zlib.js";
import { caCertificatesRecipe } from "../../ca-certificates/ca-certificates.js";
import { hyperfineSourceRecipe } from "./hyperfine-source.js";
import { cargoBuild } from "../../../helpers/rust.js";

const recipe = await cargoBuild({
  name: "hyperfine",
  toolchain: nativeToolchainRecipe,
  rustToolchain: rustRecipe,
  source: "source",
  deps: [
    dep("source", hyperfineSourceRecipe),
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
export const hyperfineRecipe = recipe;
