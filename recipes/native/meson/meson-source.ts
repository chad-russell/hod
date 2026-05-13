//! Meson source download.
//!
//! Meson 1.8.0 — a high-productivity build system (Python-based).
//! Used by GLib, Pango, HarfBuzz, Cairo, and many other libraries.

import { fetchTarball, importToStore } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/mesonbuild/meson/releases/download/1.8.0/meson-1.8.0.tar.gz",
  hash: "23f156a223e21225f035dcec891c5add5984cdd537eadb62bed5a5ac32745727",
});

await importToStore(recipe);
export const mesonSourceRecipe = recipe;
