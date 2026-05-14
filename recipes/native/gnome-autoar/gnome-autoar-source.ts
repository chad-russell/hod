//! gnome-autoar source download.
//!
//! gnome-autoar 0.4.5 — GNOME archive creation/extraction library.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://download.gnome.org/sources/gnome-autoar/0.4/gnome-autoar-0.4.5.tar.xz",
  hash: "71d55fad5525d1307886cb284d8594073d60da11359ac906af10eb9924067c74",
});

export const gnomeAutoarSourceRecipe = recipe;
