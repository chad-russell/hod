//! fzf source download.
//!
//! junegunn/fzf v0.72.0 — a general-purpose command-line fuzzy finder.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/junegunn/fzf/archive/refs/tags/v0.72.0.tar.gz",
  hash: "33c0d864ea5dd217f4c7be83a912b05ca87a6d29018c4cba8ed0aea099c4ce4b",
});

export const fzfSourceRecipe = recipe;
