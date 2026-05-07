//! procps-ng source download.
//!
//! procps-ng 4.0.6 — system process utilities (ps, top, free, kill, etc.).

import { download, importToStore } from "../../../js/src/index.js";

const recipe = await download({
  url: "https://sourceforge.net/projects/procps-ng/files/Production/procps-ng-4.0.6.tar.xz/download",
  hash: "dbc079e37d8cf530b188a7946d3ad1f4f438a581350741773cd51a480fe8079b",
});

await importToStore(recipe);
export const procpsNgSourceRecipe = recipe;
