//! cosmic-osd source — fetch from git at epoch-1.0.13 release commit.

import { fetchGit } from "../../../js/src/index.js";

const recipe = await fetchGit({
  url: "https://github.com/pop-os/cosmic-osd.git",
  revision: "c57df29816e9647bfe85086eae301da9671c21d8",
  // Placeholder hash — updated after first build reveals the actual hash
  hash: "01719be6f4b5be31d5ddbf4df8567c492e1e2be911a15fb500c1e802f8a4f548",
});

export const CosmicOsdSourceRecipe = recipe;
