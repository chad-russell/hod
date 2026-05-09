//! automake source download.
//!
//! GNU Automake 1.18.1 — generates Makefile.in from Makefile.am.
//! Part of the autotools toolchain alongside autoconf.

import { download, importToStore } from "../../../js/src/index.js";

const recipe = await download({
  url: "https://ftpmirror.gnu.org/automake/automake-1.18.1.tar.gz",
  hash: "5304475961797232f240849059bbd5c23056d147905e2afc34d92d84ad8f9c5e",
});

await importToStore(recipe);
export const automakeSourceRecipe = recipe;
