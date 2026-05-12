//! Test recipe: hello-world Go binary (CGO_ENABLED=0).
//!
//! Validates that goBuild can compile and run a pure Go binary.
//! Output should be a statically-linked ELF with no runtime deps.

import { importToStore } from "../../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../../toolchain/native-toolchain.js";
import { goRecipe } from "../go.js";
import { goBuild } from "../../../helpers/go.js";

const recipe = await goBuild({
  name: "hello-go",
  toolchain: nativeToolchainRecipe,
  goToolchain: goRecipe,
  mainGo: `package main

import "fmt"

func main() {
    fmt.Println("hello from hod-built go!")
}
`,
  deps: [],
  // cgo: false (default)
  // runtime_deps: [] (auto-set)
});

await importToStore(recipe);
export const helloGoRecipe = recipe;
