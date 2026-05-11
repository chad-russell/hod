//! ncdu source download.
//!
//! ncdu 1.22 — NCurses Disk Usage analyzer (C version, LTS).

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://dev.yorhel.nl/download/ncdu-1.22.tar.gz",
  hash: "b7838c03ded7207a328a26c840ec3d62d3be6bbf7269a70ea3430c6cbf065960",
});

export const ncduSourceRecipe = recipe;
