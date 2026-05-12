//! delta source download.
//!
//! delta 0.19.2 — a syntax-highlighting pager for git, diff, and grep output.

import { fetchTarball } from "../../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/dandavison/delta/archive/refs/tags/0.19.2.tar.gz",
  hash: "6503a58d31dda694757bf4cbac8d9322b593da07e03f5d99f184fa31dcbaff40",
});

export const deltaSourceRecipe = recipe;
