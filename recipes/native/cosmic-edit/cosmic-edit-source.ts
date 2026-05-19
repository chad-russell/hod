//! cosmic-edit source — fetch from git at epoch-1.0.13 release commit.

import { fetchGit } from "../../../js/src/index.js";

const recipe = await fetchGit({
  url: "https://github.com/pop-os/cosmic-edit.git",
  revision: "7bbe82ec3f2b5ebac7f29599cd5c3e6e6f3ccba1",
  // Placeholder hash — updated after first build reveals the actual hash
  hash: "ee5a26c9fb543ff8339d902b21c05cb7de2b11aa9e5253cfc7180f1b39e6ad20",
});

export const CosmicEditSourceRecipe = recipe;
