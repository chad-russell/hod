//! bat native build recipe — a cat(1) clone with wings.
//!
//! Builds bat 0.25.0 from source using the prebuilt Rust toolchain.
//! Dependencies: toolchain (C compiler + glibc), rust (Rust toolchain),
//! zlib (needed by rust-lld/libLLVM), ca-certificates (HTTPS for cargo).
//!
//! ## Build approach
//!
//! Uses `cargoBuild` with the `source` option to extract the upstream
//! source tarball. Network access (`unsafe_flags: 0x01`) is enabled so
//! cargo can download crate dependencies from crates.io.
//!
//! bat's Cargo.toml uses `edition = "2021"` and `rust-version = "1.74"`,
//! both satisfied by Rust 1.95.0.
//!
//! Uses default features including `regex-onig` (oniguruma regex engine).
//! The `onig` Rust crate compiles oniguruma from source via `cc`, which
//! works with the C compiler in the sandbox — no separate oniguruma
//! build recipe needed.
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
//! bat is a dynamically-linked binary that needs the C toolchain's
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
import { batSourceRecipe } from "./bat-source.js";
import { cargoBuild } from "../../../helpers/rust.js";
import { caCertEnv } from "../../../helpers/build-env.js";

const recipe = await cargoBuild({
  name: "bat",
  toolchain: nativeToolchainRecipe,
  rustToolchain: rustRecipe,
  source: "source",
  deps: [
    dep("source", batSourceRecipe),
    dep("zlib", zlibRecipe),
    dep("ca-certs", caCertificatesRecipe),
  ],
  env: caCertEnv(),
  cargoFlags: ["--no-default-features", "--features", "regex-onig,paging"],
  // Default features include `application` → `minimal-application` → `regex-onig`.
  // The `onig` crate compiles oniguruma from source via the `cc` crate,
  // which uses the C compiler from the toolchain dep.
  // Network access required for cargo to download crate dependencies.
  unsafe_flags: 0x01,
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const batRecipe = recipe;
