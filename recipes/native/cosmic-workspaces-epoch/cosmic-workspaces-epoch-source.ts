//! cosmic-workspaces-epoch source — fetch from git at epoch-1.0.13 release commit.

import { fetchGit } from "../../../js/src/index.js";

const recipe = await fetchGit({
  url: "https://github.com/pop-os/cosmic-workspaces-epoch.git",
  revision: "cd729d045bd24ee6f08f1812087400d6a1883634",
  // Placeholder hash — updated after first build reveals the actual hash
  hash: "1b675eee7207407a8c4694bfcdbfdcfd4a4a89290487bdf538301878f3477d35",
});

export const CosmicWorkspacesEpochSourceRecipe = recipe;
