//! libdisplay-info source download.
//!
//! libdisplay-info 0.3.0 — EDID/DisplayID parsing library.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://gitlab.freedesktop.org/emersion/libdisplay-info/-/archive/0.3.0/libdisplay-info-0.3.0.tar.gz",
  hash: "a93a521ca04cfa28682b8c9dc1f7c8fd13783220782f4fc86556fc8b74b68dd2",
});

export const libdisplayInfoSourceRecipe = recipe;
