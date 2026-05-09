//! ncdu source download.
//!
//! ncdu 1.22 — NCurses Disk Usage analyzer (C version, LTS).

import { download, importToStore } from "../../../js/src/index.js";

const recipe = await download({
  url: "https://dev.yorhel.nl/download/ncdu-1.22.tar.gz",
  hash: "b7838c03ded7207a328a26c840ec3d62d3be6bbf7269a70ea3430c6cbf065960",
});

await importToStore(recipe);
export const ncduSourceRecipe = recipe;
