//! jq source download.
//!
//! jq 1.8.1 — command-line JSON processor.

import { download, importToStore } from "../../../js/src/index.js";

const recipe = await download({
  url: "https://github.com/jqlang/jq/releases/download/jq-1.8.1/jq-1.8.1.tar.gz",
  hash: "9cd38d1bbee1edf69145fb22032b12eccc49cda2741d3bc8b6c1eb9d7d10ff1e",
});

await importToStore(recipe);
export const jqSourceRecipe = recipe;
