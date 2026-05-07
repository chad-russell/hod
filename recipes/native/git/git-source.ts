//! git source download.
//!
//! Git 2.54.0 — fast distributed version control system.

import { download, importToStore } from "../../../js/src/index.js";

const recipe = await download({
  url: "https://mirrors.edge.kernel.org/pub/software/scm/git/git-2.54.0.tar.gz",
  hash: "7bad8d2c130f35657bc8c0ae6e163369cc88e493abe227ab1723c1f2f1b862b6",
});

await importToStore(recipe);
export const gitSourceRecipe = recipe;
