//! cosmic-idle source — fetch from git at epoch-1.0.13 release commit.

import { fetchGit } from "../../../js/src/index.js";

const recipe = await fetchGit({
  url: "https://github.com/pop-os/cosmic-idle.git",
  revision: "c95d066b5b640509a6369634b669ca60dc50e168",
  // Placeholder hash — updated after first build reveals the actual hash
  hash: "faae706d90d3aff0bb5b80f21208c5b9ecb7593ef3d97a68c26fe42bca3636e6",
});

export const CosmicIdleSourceRecipe = recipe;
