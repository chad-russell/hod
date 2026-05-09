//! zoxide source download.
//!
//! zoxide 0.9.7 — smarter cd command.

import { download, importToStore } from "../../../../js/src/index.js";

const recipe = await download({
  url: "https://github.com/ajeetdsouza/zoxide/archive/refs/tags/v0.9.7.tar.gz",
  hash: "2c6a2ae1d2239b9e66862bf02129227945158ee0c7de5214b0cb7eef11e08a0b",
});

await importToStore(recipe);
export const zoxideSourceRecipe = recipe;
