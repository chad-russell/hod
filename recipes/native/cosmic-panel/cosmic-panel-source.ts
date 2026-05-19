//! cosmic-panel source — fetch from git at epoch-1.0.13 release commit.

import { fetchGit } from "../../../js/src/index.js";

const recipe = await fetchGit({
  url: "https://github.com/pop-os/cosmic-panel.git",
  revision: "2358f0473bf68b79f54a0906994a218de211de34",
  // Placeholder hash — updated after first build reveals the actual hash
  hash: "13c61f9c20048274f8173ea6dbfc124077775fa9bfe7ea5002dd1e662d3965e1",
});

export const CosmicPanelSourceRecipe = recipe;
