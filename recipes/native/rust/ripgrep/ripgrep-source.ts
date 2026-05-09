//! ripgrep source download.
//!
//! ripgrep 15.1.0 — fast line-oriented search tool.

import { download, importToStore } from "../../../../js/src/index.js";

const recipe = await download({
  url: "https://github.com/BurntSushi/ripgrep/archive/refs/tags/15.1.0.tar.gz",
  hash: "09027a7c82bce997ff5a8bff94795e50046bfd4c2f4cd0a81d553a142922ad52",
});

await importToStore(recipe);
export const ripgrepSourceRecipe = recipe;
