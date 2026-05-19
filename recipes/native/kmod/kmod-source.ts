//! kmod source download.
//!
//! kmod v34 — Linux kernel module management library.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/kmod-project/kmod/archive/refs/tags/v34.tar.gz",
  hash: "592d7a6672e8c2f32679e920c4ce7c69c2e6c351f813706a96ebcebfdbcb1112",
});

export const kmodSourceRecipe = recipe;
