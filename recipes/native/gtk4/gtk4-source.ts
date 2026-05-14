//! GTK4 source download.
//!
//! GTK 4.18.6 — the GTK 4 graphical toolkit, required by libadwaita and GNOME apps.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://download.gnome.org/sources/gtk/4.18/gtk-4.18.6.tar.xz",
  hash: "d5f27bcef858ce154121f5c08ac9a6a207d430143e306e20eb036ba1b1e89f19",
});

export const gtk4SourceRecipe = recipe;
