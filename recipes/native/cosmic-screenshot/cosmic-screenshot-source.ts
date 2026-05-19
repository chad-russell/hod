//! cosmic-screenshot source — fetch from git at epoch-1.0.13 release commit.

import { fetchGit } from "../../../js/src/index.js";

const recipe = await fetchGit({
  url: "https://github.com/pop-os/cosmic-screenshot.git",
  revision: "b917c631d155d71374fe2f2c0cbd2f4a33326420",
  // Placeholder hash — updated after first build reveals the actual hash
  hash: "897a324e6374b366d34dc582328b59ee1efd83de70a827a40784683846df4e36",
});

export const CosmicScreenshotSourceRecipe = recipe;
