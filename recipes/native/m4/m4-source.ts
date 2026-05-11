//! m4 source download.
//!
//! GNU m4 1.4.19 — macro processor. Build infrastructure that unblocks
//! autoconf/automake.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://mirrors.kernel.org/gnu/m4/m4-1.4.19.tar.gz",
  hash: "22f5754f80b347b525eb1ad89e8ef84312ec80432b79110c7f0161e2185bdc06",
});

export const m4SourceRecipe = recipe;
