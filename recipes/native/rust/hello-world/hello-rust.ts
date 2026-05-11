//! Test recipe: hello-world Rust binary using cargoBuild.
//!
//! Validates that cargoBuild can compile and run a Rust binary.

import {
  dep,
  importToStore,
} from "../../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../../toolchain/native-toolchain.js";
import { rustRecipe } from "../rust.js";
import { zlibRecipe } from "../../zlib/zlib.js";
import { cargoBuild } from "../../../helpers/rust.js";

const recipe = await cargoBuild({
  name: "hello-rust",
  toolchain: nativeToolchainRecipe,
  rustToolchain: rustRecipe,
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
    dep("zlib", zlibRecipe),
  ],
  runtime_deps: ["toolchain"],
});

await importToStore(recipe);
export const helloRustRecipe = recipe;
