//! json-glib source download.
//!
//! JSON-GLib 1.10.0 — JSON parser for GLib/GObject.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://download.gnome.org/sources/json-glib/1.10/json-glib-1.10.0.tar.xz",
  hash: "16a238016b1a37c365afe1bb2f63de6b80a944848339c416b926274cb6004b28",
});

export const jsonGlibSourceRecipe = recipe;
