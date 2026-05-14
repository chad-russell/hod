//! gnome-desktop source download.
//!
//! gnome-desktop 44.5 — GNOME desktop utility library.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://download.gnome.org/sources/gnome-desktop/44/gnome-desktop-44.5.tar.xz",
  hash: "6d45202e38616fd6ce5f097efe94265be12a9f3b028f20c637e2a4d91bdf7fd2",
});

export const gnomeDesktopSourceRecipe = recipe;
