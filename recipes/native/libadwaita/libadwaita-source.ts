//! libadwaita source download.
//!
//! libadwaita 1.7.12 — GNOME Adwaita design library for GTK4.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://download.gnome.org/sources/libadwaita/1.7/libadwaita-1.7.12.tar.xz",
  hash: "c11d18bc9de2185dd5f14a7a0eca49fcecdd92683c80d85b26d13a2655b6409a",
});

export const libadwaitaSourceRecipe = recipe;
