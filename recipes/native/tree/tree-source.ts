//! tree source download.
//!
//! tree 2.3.2 — recursive directory listing utility.

import { download, importToStore } from "../../../js/src/index.js";

const recipe = await download({
  url: "https://github.com/Old-Man-Programmer/tree/archive/refs/tags/2.3.2.tar.gz",
  hash: "ec86b37ebbe95be0f6499a3857d06542199cc8c798805560e570d3a6a37c30f3",
});

await importToStore(recipe);
export const treeSourceRecipe = recipe;
