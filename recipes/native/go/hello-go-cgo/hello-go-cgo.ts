//! Test recipe: hello-world Go binary with CGO.
//!
//! Validates that goBuild with cgo: true produces a correctly
//! relocated dynamic binary. The output links against glibc and
//! requires runtime_deps: ["toolchain"].

import { importToStore } from "../../../../js/src/index.js";
import { nativeToolchainRecipe } from "../../../toolchain/native-toolchain.js";
import { goRecipe } from "../go.js";
import { goBuild } from "../../../helpers/go.js";

const recipe = await goBuild({
  name: "hello-go-cgo",
  toolchain: nativeToolchainRecipe,
  goToolchain: goRecipe,
  mainGo: `package main

/*
#include <stdio.h>
void say_hello() {
    printf("hello from C via CGO!\\n");
    fflush(stdout);
}
*/
import "C"

func main() {
    C.say_hello()
}
`,
  deps: [],
  cgo: true,
  // runtime_deps: ["toolchain"] (auto-set when cgo: true)
});

await importToStore(recipe);
export const helloGoCgoRecipe = recipe;
