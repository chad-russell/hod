//! cosmic-applibrary source — fetch from git at epoch-1.0.13 release commit.

import { fetchGit } from "../../../js/src/index.js";

const recipe = await fetchGit({
  url: "https://github.com/pop-os/cosmic-applibrary.git",
  revision: "29972234789be0c545b8ecc1152259ba856dc253",
  // Placeholder hash — updated after first build reveals the actual hash
  hash: "afd28a2029f2f82fc798e59082127fec1ab4e1ac713bcbb44b30ba429f26c48b",
});

export const CosmicApplibrarySourceRecipe = recipe;
