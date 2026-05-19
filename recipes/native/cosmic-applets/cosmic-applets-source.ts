//! cosmic-applets source — fetch from git at epoch-1.0.13 release commit.

import { fetchGit } from "../../../js/src/index.js";

const recipe = await fetchGit({
  url: "https://github.com/pop-os/cosmic-applets.git",
  revision: "89a149034d06b63343b0e036921f995ff1398bc3",
  // Placeholder hash — updated after first build reveals the actual hash
  hash: "914acdbfe6c5b4d8945b92747e41f9441182116b5eb3f45c61122612c3b6f3ae",
});

export const CosmicAppletsSourceRecipe = recipe;
