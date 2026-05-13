//! pango source download.
//!
//! Pango 1.56.4 — text layout and rendering library.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://download.gnome.org/sources/pango/1.56/pango-1.56.4.tar.xz",
  hash: "8042a82f08101c1dabcb337a96035167e3a300de395c57678ce1a133b2dba346",
});

export const pangoSourceRecipe = recipe;
