//! pv source download.
//!
//! pv (Pipe Viewer) 1.10.5 — monitor data progress through pipes.

import { download, importToStore } from "../../../js/src/index.js";

const recipe = await download({
  url: "https://www.ivarch.com/programs/sources/pv-1.10.5.tar.gz",
  hash: "35bf05596d3cd0afa42f3d9ebbbad6b83f7256a27b2787c20718845bd193c8e6",
});

await importToStore(recipe);
export const pvSourceRecipe = recipe;
