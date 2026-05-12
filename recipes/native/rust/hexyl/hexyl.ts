//! hexyl native build recipe — command-line hex viewer.
//!
//! Builds hexyl 0.17.0 from source using the prebuilt Rust toolchain.
//! Dependencies: toolchain (C compiler + glibc), rust (Rust toolchain),
//! zlib (needed by rust-lld/libLLVM), ca-certificates (HTTPS for cargo).
//!
//! ## Build approach
//!
//! Uses `cargoBuild` with the `source` option to extract the upstream
//! source tarball. Network access (`unsafe_flags: 0x01`) is enabled so
//! cargo can download crate dependencies from crates.io.
//!
//! hexyl uses `edition = "2021"` and `rust-version = "1.88"`, both
//! satisfied by Rust 1.95.0.
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
//! hexyl is a single dynamically-linked binary that needs the C toolchain's
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
import { hexylSourceRecipe } from "./hexyl-source.js";
import { cargoBuild } from "../../../helpers/rust.js";

const recipe = await cargoBuild({
  name: "hexyl",
  toolchain: nativeToolchainRecipe,
  rustToolchain: rustRecipe,
  source: "source",
  deps: [
    dep("source", hexylSourceRecipe),
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
export const hexylRecipe = recipe;
