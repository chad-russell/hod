//! Bindgen smoke test 1: C stdlib headers.
//!
//! Builds a tiny Rust crate whose `build.rs` runs bindgen over `<stdlib.h>`.
//! Validates that libclang loads inside the sandbox and can find the C
//! standard library headers (stdint.h, stdlib.h, etc.) through the toolchain
//! sysroot.

import {
  dep,
  importToStore,
} from "../../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../../toolchain/native-toolchain.js";
import { rustRecipe } from "../rust.js";
import { bindgenClangRecipe } from "../../llvm/bindgen-clang.js";
import { caCertificatesRecipe } from "../../ca-certificates/ca-certificates.js";
import { zlibRecipe } from "../../zlib/zlib.js";
import { cargoBuild } from "../../../helpers/rust.js";

const recipe = await cargoBuild({
  name: "bindgen-test-stdlib",
  toolchain: nativeToolchainRecipe,
  rustToolchain: rustRecipe,
  bindgen: true,
  cargoToml: `[package]
name = "bindgen-test-stdlib"
version = "0.1.0"
edition = "2021"

[build-dependencies]
bindgen = "0.72.1"
`,
  mainRs: `include!(concat!(env!("OUT_DIR"), "/bindings.rs"));

fn main() {
    println!("bindgen stdlib ok");
}
`,
  extraFiles: {
    "build.rs": `use std::env;
use std::path::PathBuf;

fn main() {
    println!("cargo:rerun-if-changed=wrapper.h");

    let bindings = bindgen::builder()
        .header("wrapper.h")
        .allowlist_type("c_int")
        .allowlist_type("c_uint")
        .allowlist_type("c_long")
        .allowlist_type("size_t")
        .size_t_is_usize(true)
        .generate()
        .expect("bindgen failed to generate bindings for <stdlib.h>");

    let out_path = PathBuf::from(env::var("OUT_DIR").unwrap());
    bindings
        .write_to_file(out_path.join("bindings.rs"))
        .expect("couldn't write bindings!");
}
`,
    "wrapper.h": `#include <stdint.h>
#include <stdlib.h>
`,
  },
  deps: [
    dep("ca-certs", caCertificatesRecipe),
    dep("bindgen-clang", bindgenClangRecipe),
    dep("zlib", zlibRecipe),
  ],
  env: {
    CARGO_HTTP_CAINFO: "/deps/ca-certs/etc/ssl/certs/ca-certificates.crt",
    SSL_CERT_FILE: "/deps/ca-certs/etc/ssl/certs/ca-certificates.crt",
  },
  unsafe_flags: 0x01,
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const bindgenTestStdlibRecipe = recipe;
