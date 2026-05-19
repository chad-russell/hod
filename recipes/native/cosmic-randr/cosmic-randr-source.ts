//! cosmic-randr source — fetch from git at epoch-1.0.13 release commit.

import { fetchGit } from "../../../js/src/index.js";

const recipe = await fetchGit({
  url: "https://github.com/pop-os/cosmic-randr.git",
  revision: "6e8e795970fa06d434af22775e415b517f7552d3",
  // Placeholder hash — updated after first build reveals the actual hash
  hash: "d3fd6efef1a657b5097031cd36ad027c253229f931a4eeeb5df93a47a6a310c1",
});

export const CosmicRandrSourceRecipe = recipe;
