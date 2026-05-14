//! yazi source download.
//!
//! Yazi 26.5.6 — blazing fast terminal file manager written in Rust.

import { fetchTarball } from "../../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/sxyazi/yazi/archive/refs/tags/v26.5.6.tar.gz",
  hash: "5d8bfb556ff1e50add1697ffb8fb2523290e8b5ebbb976bebaa3d09025b480cb",
});

export const yaziSourceRecipe = recipe;
