//! autoconf source download.
//!
//! GNU Autoconf 2.73 — generates configure scripts. Build infrastructure
//! that enables autoreconf for packages that don't ship pre-generated
//! configure scripts.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://mirrors.kernel.org/gnu/autoconf/autoconf-2.73.tar.gz",
  hash: "39437209b53d3634984e772bbeaa1eff4ab9c416d4c4e5f6b5c8cfd8aa724da5",
});

export const autoconfSourceRecipe = recipe;
