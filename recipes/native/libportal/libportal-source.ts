//! libportal source download.
//!
//! libportal 0.9.0 — Flatpak portal library.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/flatpak/libportal/releases/download/0.9.0/libportal-0.9.0.tar.xz",
  hash: "5a4f1e2d5bf60a11b472159a2e0ad74ab33bbcb3287523de8a12f642f55cae20",
});

export const libportalSourceRecipe = recipe;
