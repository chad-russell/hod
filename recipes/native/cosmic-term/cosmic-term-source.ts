//! cosmic-term source — fetch from git at epoch-1.0.13 release commit.

import { fetchGit } from "../../../js/src/index.js";

const recipe = await fetchGit({
  url: "https://github.com/pop-os/cosmic-term.git",
  revision: "0a7fd0c26bf23ceec8466cb57ccfd97e953692e8",
  // Placeholder hash — updated after first build reveals the actual hash
  hash: "40f77b1c044c8ff9d7920533f8ef0dd64175cc869489ede4818f5d69ba5b3d3d",
});

export const CosmicTermSourceRecipe = recipe;
