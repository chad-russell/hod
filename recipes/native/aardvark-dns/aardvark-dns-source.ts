//! aardvark-dns source download — source code only.
//!
//! aardvark-dns 1.17.1 source from GitHub archive. The vendor tarball is
//! downloaded separately and merged in the build recipe.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/containers/aardvark-dns/archive/refs/tags/v1.17.1.tar.gz",
  hash: "b5f6cc94a38d0e9184c32ead4d36afe3e96bde8e0e31c59d158d6124b02509e4",
});

export const aardvarkDnsSourceRecipe = recipe;
