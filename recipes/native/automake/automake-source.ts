//! automake source download.
//!
//! GNU Automake 1.18.1 — generates Makefile.in from Makefile.am.
//! Part of the autotools toolchain alongside autoconf.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://mirrors.kernel.org/gnu/automake/automake-1.18.1.tar.gz",
  hash: "5304475961797232f240849059bbd5c23056d147905e2afc34d92d84ad8f9c5e",
});

export const automakeSourceRecipe = recipe;
