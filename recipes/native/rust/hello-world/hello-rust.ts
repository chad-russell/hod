//! Test recipe: hello-world Rust binary using cargoBuild.
//!
//! Validates that cargoBuild can compile and run a Rust binary.

import {
  cargoBuild,
  dep,
  importToStore,
} from "../../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../../toolchain/native-toolchain.js";
import { rustRecipe } from "../rust.js";
import { zlibRecipe } from "../../zlib/zlib.js";

const recipe = await cargoBuild({
  name: "hello-rust",
  toolchain: "toolchain",
  rustToolchain: "rust",
  cargoToml: `[package]
name = "hello-rust"
version = "0.1.0"
edition = "2021"
`,
  mainRs: `fn main() {
    println!("hello from hod-built cargo!");
}
`,
  deps: [
    dep("toolchain", nativeToolchainRecipe),
    dep("rust", rustRecipe),
    dep("zlib", zlibRecipe),
  ],
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const helloRustRecipe = recipe;
