//! tig source download.
//!
//! tig 2.6.0 — ncurses-based text-mode interface for git.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/jonas/tig/archive/refs/tags/tig-2.6.0.tar.gz",
  hash: "777706f4a4d5c2d7355eaba35cdc65630178fb16ee75dbc32d5ad3616895231a",
});

export const tigSourceRecipe = recipe;
