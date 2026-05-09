//! just source download.
//!
//! just 1.40.0 — a command runner, a more humane alternative to make.

import { download, importToStore } from "../../../../js/src/index.js";

const recipe = await download({
  url: "https://github.com/casey/just/archive/refs/tags/1.40.0.tar.gz",
  hash: "0aa7cb86623223283f2e9440c8d5fcd2cba8ead313602ef175760191a4c9ce50",
});

await importToStore(recipe);
export const justSourceRecipe = recipe;
