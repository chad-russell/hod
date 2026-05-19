//! cosmic-icons source — fetch from git at epoch-1.0.13 release commit.

import { fetchGit } from "../../../js/src/index.js";

const recipe = await fetchGit({
  url: "https://github.com/pop-os/cosmic-icons.git",
  revision: "2c697e8e97cfd619107a872b28c31317281184ff",
  // Placeholder hash — updated after first build reveals the actual hash
  hash: "c8c781a291253c3f17d3a601e0a7b97af7fb63c93099792db073e5f516573b3a",
});

export const CosmicIconsSourceRecipe = recipe;
