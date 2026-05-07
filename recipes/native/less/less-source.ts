//! less source download.
//!
//! less 692 — the standard Unix file pager.

import { download, importToStore } from "../../../js/src/index.js";

const recipe = await download({
  url: "https://www.greenwoodsoftware.com/less/less-692.tar.gz",
  hash: "21dd0ae858ca02990cdccff12be0911fa75f1173eeb3a5d224e68da7da473016",
});

await importToStore(recipe);
export const lessSourceRecipe = recipe;
