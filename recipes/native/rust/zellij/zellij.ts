//! zellij native build recipe — modern terminal multiplexer.
//!
//! Builds zellij 0.44.3 from source using the prebuilt Rust toolchain.
//! Dependencies: toolchain (C compiler + glibc), rust (Rust toolchain),
//! zlib (needed by rust-lld/libLLVM), ca-certificates (HTTPS for cargo),
//! perl (needed by openssl-sys vendored build).
//!
//! ## Build approach
//!
//! Uses `cargoBuild` with the `source` option to extract the upstream
//! source tarball. Network access (`unsafe_flags: 0x01`) is enabled so
//! cargo can download crate dependencies from crates.io.
//!
//! Default features are used, which include `vendored_curl` (builds curl
//! + OpenSSL from source via openssl-sys/vendored) and
//! `web_server_capability` (built-in web server for session sharing).
//!
//! zellij's Cargo.toml uses `edition = "2021"` and `rust-version = "1.92"`,
//! both satisfied by Rust 1.95.0.
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
//! zellij is a single dynamically-linked binary that needs the C
//! toolchain's runtime (libc, libgcc_s, ld-linux). It does NOT need the
//! Rust toolchain at runtime. The vendored curl and OpenSSL are linked
//! statically into the binary.

import {
  dep,
  importToStore,
} from "../../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../../toolchain/native-toolchain.js";
import { rustRecipe } from "../rust.js";
import { zlibRecipe } from "../../zlib/zlib.js";
import { caCertificatesRecipe } from "../../ca-certificates/ca-certificates.js";
import { perlRecipe } from "../../perl/perl.js";
import { zellijSourceRecipe } from "./zellij-source.js";
import { cargoBuild } from "../../../helpers/rust.js";

const recipe = await cargoBuild({
  name: "zellij",
  toolchain: nativeToolchainRecipe,
  rustToolchain: rustRecipe,
  source: "source",
  deps: [
    dep("source", zellijSourceRecipe),
    dep("zlib", zlibRecipe),
    dep("ca-certs", caCertificatesRecipe),
    dep("perl", perlRecipe),
  ],
  env: {
    // Add perl bin to PATH for openssl-sys vendored build.
    // Add --sysroot to CFLAGS so vendored build scripts (aws-lc-sys, openssl-sys)
    // that invoke the compiler directly (not via CC) can still find system headers.
    // Set PERL5LIB so perl can find its standard modules (strict.pm etc.) which
    // are needed by OpenSSL's Configure script.
    PATH: "/deps/toolchain/bin:/deps/rust/bin:/deps/perl/bin",
    CFLAGS: "-O2 --sysroot=/deps/toolchain/sysroot -I/deps/toolchain/sysroot/include",
    PERL5LIB: "/deps/perl/lib/perl5/5.40.0:/deps/perl/lib/perl5/5.40.0/x86_64-linux:/deps/perl/lib/perl5/site_perl/5.40.0:/deps/perl/lib/perl5/site_perl/5.40.0/x86_64-linux",
    CARGO_HTTP_CAINFO: "/deps/ca-certs/etc/ssl/certs/ca-certificates.crt",
    SSL_CERT_FILE: "/deps/ca-certs/etc/ssl/certs/ca-certificates.crt",
  },
  // Network access required for cargo to download crate dependencies.
  unsafe_flags: 0x01,
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const zellijRecipe = recipe;
