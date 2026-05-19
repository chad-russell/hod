//! cosmic-bg source — fetch from git at epoch-1.0.13 release commit.

import { fetchGit } from "../../../js/src/index.js";

const recipe = await fetchGit({
  url: "https://github.com/pop-os/cosmic-bg.git",
  revision: "b1ca4c180ab29dd185472b777ab0abdb1f96ccaf",
  // Placeholder hash — updated after first build reveals the actual hash
  hash: "b56c1e6f4ac928855fb2a1d3e822e346147622aae95c3449f7a818513c4418b3",
});

export const CosmicBgSourceRecipe = recipe;
