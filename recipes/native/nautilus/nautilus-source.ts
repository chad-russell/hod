//! nautilus source download.
//!
//! Nautilus 48.7 — GNOME Files file manager.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://download.gnome.org/sources/nautilus/48/nautilus-48.7.tar.xz",
  hash: "83b2c5c5f121a124e0c401a4188097148b54e9a9f313a72014f8a6fdeb899e4d",
});

export const nautilusSourceRecipe = recipe;
