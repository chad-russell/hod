//! vim source download.
//!
//! Vim 9.2 — the ubiquitous text editor.

import { download, importToStore } from "../../../js/src/index.js";

const recipe = await download({
  url: "https://github.com/vim/vim/archive/refs/tags/v9.2.0000.tar.gz",
  hash: "511f9500d3978b6f570beff5961c29dcdb4d5aeaa3a6e3cd442711bb75b82c25",
});

await importToStore(recipe);
export const vimSourceRecipe = recipe;
