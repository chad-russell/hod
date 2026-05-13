//! pixman source download.
//!
//! Pixman 0.46.4 — low-level pixel manipulation library used by Cairo.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://xorg.freedesktop.org/releases/individual/lib/pixman-0.46.4.tar.xz",
  hash: "da5c9b8ced71dce29fb5a1e393564cf32b8882368997d6705442f8e72524bf28",
});

export const pixmanSourceRecipe = recipe;
