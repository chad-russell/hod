//! bison source download.
//!
//! GNU Bison 3.8.2 — parser generator (LALR/YACC replacement).

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://mirrors.kernel.org/gnu/bison/bison-3.8.2.tar.xz",
  hash: "9dd90be8df4d0474b941e2ca14ac76d11b7ccb46edb26344b60d866178bbcc98",
});

export const bisonSourceRecipe = recipe;
