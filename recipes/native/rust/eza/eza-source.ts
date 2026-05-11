//! eza source download.
//!
//! eza 0.23.4 — a modern, maintained replacement for ls.

import { fetchTarball } from "../../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/eza-community/eza/archive/refs/tags/v0.23.4.tar.gz",
  hash: "7320e161a48dbd896101bc1bd308c5f92ca8c8cc171344571463c3045b7737da",
});

export const ezaSourceRecipe = recipe;
