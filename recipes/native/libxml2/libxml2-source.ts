//! libxml2 source download.
//!
//! libxml2 2.13.8 — XML C parser and toolkit.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://download.gnome.org/sources/libxml2/2.13/libxml2-2.13.8.tar.xz",
  hash: "b7229a616aa4d80f0474c69abf4b6a051f8c6badf73d2b7fa33d0606cf445e6e",
});

export const libxml2SourceRecipe = recipe;
