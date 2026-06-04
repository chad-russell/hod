//! Bindgen smoke test 3: external dependency headers (zlib).
//!
//! Builds a tiny Rust crate whose `build.rs` runs bindgen over `<zlib.h>`.
//! Validates that bindgen can find headers from a mounted hod dependency
//! (not just the toolchain sysroot). This is the pattern real `-sys` crates
//! use with pkg-config or explicit include paths.

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
import { caCertEnv } from "../../../helpers/build-env.js";

const recipe = await cargoBuild({
  name: "bindgen-test-zlib",
  toolchain: nativeToolchainRecipe,
  rustToolchain: rustRecipe,
  bindgen: true,
  cargoToml: `[package]
name = "bindgen-test-zlib"
version = "0.1.0"
edition = "2021"

[build-dependencies]
bindgen = "0.72.1"
`,
  mainRs: `include!(concat!(env!("OUT_DIR"), "/bindings.rs"));

fn main() {
    println!("ZLIB_VERSION = {}", unsafe {
        std::ffi::CStr::from_ptr(zlibVersion())
            .to_string_lossy()
    });
}
`,
  extraFiles: {
    "build.rs": `use std::env;
use std::path::PathBuf;

fn main() {
    println!("cargo:rerun-if-changed=wrapper.h");
    println!("cargo:rustc-link-search=native=/deps/zlib/lib");
    println!("cargo:rustc-link-lib=z");

    let bindings = bindgen::builder()
        .header("wrapper.h")
        .clang_arg("-I/deps/zlib/include")
        .allowlist_function("zlibVersion")
        .allowlist_function("compress")
        .allowlist_function("uncompress")
        .size_t_is_usize(true)
        .generate()
        .expect("bindgen failed to generate bindings for <zlib.h>");

    let out_path = PathBuf::from(env::var("OUT_DIR").unwrap());
    bindings
        .write_to_file(out_path.join("bindings.rs"))
        .expect("couldn't write bindings!");
}
`,
    "wrapper.h": `#include <zlib.h>
`,
  },
  deps: [
    dep("ca-certs", caCertificatesRecipe),
    dep("bindgen-clang", bindgenClangRecipe),
    dep("zlib", zlibRecipe),
  ],
  env: caCertEnv(),
  unsafe_flags: 0x01,
  runtime_deps: ["toolchain", "zlib"],
});

await importToStore(recipe);
export const bindgenTestZlibRecipe = recipe;
