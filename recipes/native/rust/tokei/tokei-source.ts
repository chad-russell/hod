//! tokei source download.
//!
//! tokei 14.0.0 — count your code, quickly.

import { download, importToStore } from "../../../../js/src/index.js";

const recipe = await download({
  url: "https://github.com/XAMPPRocky/tokei/archive/refs/tags/v14.0.0.tar.gz",
  hash: "14fbfcffabe01d4c602ab4a276e90047bb34a9ff3972996d2a142dcc57ae32c1",
});

await importToStore(recipe);
export const tokeiSourceRecipe = recipe;
