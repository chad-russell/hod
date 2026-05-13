//! gdk-pixbuf source download.
//!
//! gdk-pixbuf 2.42.12 — image loading library for GTK.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://download.gnome.org/sources/gdk-pixbuf/2.42/gdk-pixbuf-2.42.12.tar.xz",
  hash: "edf54b48c7008c0ec52e0224b6a10ea680bbb94c23b71fbe5d19ae8e72706bc6",
});

export const gdkPixbufSourceRecipe = recipe;
