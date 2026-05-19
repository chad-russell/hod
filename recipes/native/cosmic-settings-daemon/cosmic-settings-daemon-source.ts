//! cosmic-settings-daemon source — fetch from git at epoch-1.0.13 release commit.

import { fetchGit } from "../../../js/src/index.js";

const recipe = await fetchGit({
  url: "https://github.com/pop-os/cosmic-settings-daemon.git",
  revision: "716da6d6af0b252e2f78aba2ad72ee19ae0241e0",
  // Placeholder hash — updated after first build reveals the actual hash
  hash: "d8834ada2a891a7a4306340d27d9c10c958f5e79d251fd479de5050c53b1ee6e",
});

export const CosmicSettingsDaemonSourceRecipe = recipe;
