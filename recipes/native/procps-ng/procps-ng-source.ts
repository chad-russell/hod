//! procps-ng source download.
//!
//! procps-ng 4.0.6 — system process utilities (ps, top, free, kill, etc.).

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://sourceforge.net/projects/procps-ng/files/Production/procps-ng-4.0.6.tar.xz/download",
  hash: "dbc079e37d8cf530b188a7946d3ad1f4f438a581350741773cd51a480fe8079b",
  format: "tar_xz",
});

export const procpsNgSourceRecipe = recipe;
