//! github-cli source download.
//!
//! cli/cli v2.92.0 — GitHub's official command line tool (`gh`).

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/cli/cli/archive/refs/tags/v2.92.0.tar.gz",
  hash: "e67a2d5de72b16dfe332c3667f05badead615220826988a6a8c7084b033f6bee",
});

export const githubCliSourceRecipe = recipe;
