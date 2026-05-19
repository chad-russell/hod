//! cosmic-protocols source — fetch from git at known revision.
//!
//! cosmic-protocols provides Wayland protocol extensions for the COSMIC
//! desktop environment. This fetches at the revision used by cosmic-comp's
//! Cargo.toml (short hash 160b086).

import { fetchGit } from "../../../js/src/index.js";

const recipe = await fetchGit({
  url: "https://github.com/pop-os/cosmic-protocols.git",
  revision: "160b086",
  hash: "9f3986e313cc72ebc480e913fc6b331a81dd806d5cdbba913cee2eb8f7c17329",
});

export const cosmicProtocolsSourceRecipe = recipe;
