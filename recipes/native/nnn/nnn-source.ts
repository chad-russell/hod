//! nnn source download.
//!
//! nnn 5.2 — terminal file manager.

import { download, importToStore } from "../../../js/src/index.js";

const recipe = await download({
  url: "https://github.com/jarun/nnn/archive/refs/tags/v5.2.tar.gz",
  hash: "94f18590c0daa5c15a47959088d23b4a427dc318548982fc07ac222be30fc441",
});

await importToStore(recipe);
export const nnnSourceRecipe = recipe;
