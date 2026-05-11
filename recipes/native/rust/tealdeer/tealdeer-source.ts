//! tealdeer source download.
//!
//! tealdeer 1.7.1 — fast tldr pages client.

import { fetchTarball } from "../../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/tealdeer-rs/tealdeer/archive/refs/tags/v1.7.1.tar.gz",
  hash: "7f7a1d63c3b93da7411d5e4ac52752ee0c68202b0e7fb7dc92236da03c63f39b",
});

export const tealdeerSourceRecipe = recipe;
