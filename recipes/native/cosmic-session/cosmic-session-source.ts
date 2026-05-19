//! cosmic-session source — fetch from git at epoch-1.0.13 release commit.

import { fetchGit } from "../../../js/src/index.js";

const recipe = await fetchGit({
  url: "https://github.com/pop-os/cosmic-session.git",
  revision: "495e591dc65987a0327b9dea646126ebdfe8a1db",
  // Placeholder hash — updated after first build reveals the actual hash
  hash: "a53b01038cd91ff532e0fed2db2046078b7b984be2f3a5961ad470b1a6707bcf",
});

export const CosmicSessionSourceRecipe = recipe;
