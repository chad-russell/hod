//! Ninja source download.
//!
//! Ninja 1.13.2 — small build system with a focus on speed.
//! Generates build.ninja files consumed by the ninja binary.

import { fetchTarball, importToStore } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/ninja-build/ninja/archive/refs/tags/v1.13.2.tar.gz",
  hash: "b32100cf57fde2a19d3c242f363c308c3d7a7ed3167774eefcbd107baada26e4",
});

await importToStore(recipe);
export const ninjaSourceRecipe = recipe;
