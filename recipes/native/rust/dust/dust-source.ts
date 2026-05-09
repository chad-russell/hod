//! dust source download.
//!
//! dust 1.2.0 — visual disk usage analyzer (du with a tree view).

import { download, importToStore } from "../../../../js/src/index.js";

const recipe = await download({
  url: "https://github.com/bootandy/dust/archive/refs/tags/v1.2.0.tar.gz",
  hash: "22c4d106edc5c271747bc4b59b9bbac3b98b68740359fbb58ed755f04d68a4b4",
});

await importToStore(recipe);
export const dustSourceRecipe = recipe;
