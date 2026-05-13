//! cairo source download.
//!
//! Cairo 1.18.4 — 2D vector graphics library.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://www.cairographics.org/releases/cairo-1.18.4.tar.xz",
  hash: "b9fa14e02f85ec4e72396c62236c98502d04dbbdf8daf01ab9557a1c7aa7106e",
});

export const cairoSourceRecipe = recipe;
