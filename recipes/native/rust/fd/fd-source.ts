//! fd source download.
//!
//! fd 10.2.0 — fast, user-friendly find replacement.

import { fetchTarball } from "../../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/sharkdp/fd/archive/refs/tags/v10.2.0.tar.gz",
  hash: "8b777bebb9e156c6ec1bc835b54e1368119a6038b94ee49dd58d87a7bf29cd16",
});

export const fdSourceRecipe = recipe;
