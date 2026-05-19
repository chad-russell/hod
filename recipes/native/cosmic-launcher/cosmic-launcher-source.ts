//! cosmic-launcher source — fetch from git at epoch-1.0.13 release commit.

import { fetchGit } from "../../../js/src/index.js";

const recipe = await fetchGit({
  url: "https://github.com/pop-os/cosmic-launcher.git",
  revision: "1e57708e5af99a500fa66c2703acac6e1d2c8848",
  // Placeholder hash — updated after first build reveals the actual hash
  hash: "cdcb284f1e32c0b4d53c31f3eef0166bc34dbc0e9fea5ebd6d2dc5dbd99b128d",
});

export const CosmicLauncherSourceRecipe = recipe;
