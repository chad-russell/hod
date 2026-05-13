//! gtk3 source download.
//!
//! GTK+ 3.24.49 — multi-platform toolkit for creating graphical user interfaces.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://download.gnome.org/sources/gtk/3.24/gtk-3.24.49.tar.xz",
  hash: "aa0b38bd667f70ccbc57405750155f75a75886be93a0a2ab0bcdf021dc798667",
});

export const gtk3SourceRecipe = recipe;
