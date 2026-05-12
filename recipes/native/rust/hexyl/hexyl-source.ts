//! hexyl source download.
//!
//! hexyl 0.17.0 — a command-line hex viewer.

import { fetchTarball } from "../../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/sharkdp/hexyl/archive/refs/tags/v0.17.0.tar.gz",
  hash: "5f4e76f1a6608dda1db363a8369833b46924fe878a3742e56e553ee0964bd2af",
});

export const hexylSourceRecipe = recipe;
