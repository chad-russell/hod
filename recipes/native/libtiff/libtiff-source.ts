//! libtiff source download.
//!
//! libtiff 4.7.0 — TIFF image format library.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://download.osgeo.org/libtiff/tiff-4.7.0.tar.xz",
  hash: "c6bd40f905f71eff697812c8fd4f557bdb82f944ae637382cdc687710de8f0ca",
});

export const libtiffSourceRecipe = recipe;
