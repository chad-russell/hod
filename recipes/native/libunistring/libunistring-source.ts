//! libunistring source download.
//!
//! libunistring 1.3 — Unicode string library for C.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://ftp.gnu.org/gnu/libunistring/libunistring-1.3.tar.xz",
  hash: "d3ad1c54e87fafb4533cf04929bdc10952fd8d691a2d9c1643440b7daa6cc71b",
});

export const libunistringSourceRecipe = recipe;
