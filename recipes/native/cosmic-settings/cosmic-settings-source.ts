//! cosmic-settings source — fetch from git at epoch-1.0.13 release commit.

import { fetchGit } from "../../../js/src/index.js";

const recipe = await fetchGit({
  url: "https://github.com/pop-os/cosmic-settings.git",
  revision: "a96987091e3c2d02e61fca697a45b5bb4fc1ab52",
  // Placeholder hash — updated after first build reveals the actual hash
  hash: "7085636cf3171016811800bf08c0f1dee9b2411b319ec6b9619a08ae30fb220a",
});

export const CosmicSettingsSourceRecipe = recipe;
