//! pop-launcher source — fetch from git at epoch-1.0.13 release commit.

import { fetchGit } from "../../../js/src/index.js";

const recipe = await fetchGit({
  url: "https://github.com/pop-os/launcher.git",
  revision: "5b868510716673b31a650488401489898352e2d9",
  // Placeholder hash — updated after first build reveals the actual hash
  hash: "76760f65d9e909869b0198138db3988e6b55c8f42b081f46e65780d278580fc6",
});

export const PopLauncherSourceRecipe = recipe;
