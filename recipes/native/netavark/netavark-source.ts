//! netavark source download — source code only.
//!
//! netavark 1.17.2 source from GitHub archive. The vendor tarball is
//! downloaded separately and merged in the build recipe.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/containers/netavark/archive/refs/tags/v1.17.2.tar.gz",
  hash: "0b0726eb64f6d8cbd06d29331cac89b6aa8238b170cbf83f963807b67477debf",
});

export const netavarkSourceRecipe = recipe;
