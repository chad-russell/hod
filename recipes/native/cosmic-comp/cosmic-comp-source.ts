//! cosmic-comp source — fetch from git at epoch-1.0.13 release tag.
//!
//! cosmic-comp is the Wayland compositor for the COSMIC desktop environment.
//! Built on Smithay + wgpu, it handles display management, window management,
//! and input handling.

import { fetchGit } from "../../../js/src/index.js";

const recipe = await fetchGit({
  url: "https://github.com/pop-os/cosmic-comp.git",
  revision: "epoch-1.0.13",
  // Placeholder hash — updated after first build reveals the actual hash
  hash: "2593ecb394e1c48c563f4d513fdd185e205014eb7be93b10799edf27cc52e972",
});

export const cosmicCompSourceRecipe = recipe;
