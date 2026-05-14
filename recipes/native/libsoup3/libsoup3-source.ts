//! libsoup3 source download.
//!
//! libsoup 3.6.6 — HTTP client/server library for GNOME.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://download.gnome.org/sources/libsoup/3.6/libsoup-3.6.6.tar.xz",
  hash: "e19ed03b64bbc898aa05a4f1a4dfae423a1bb3dc629e13152b13a777a2e44f35",
});

export const libsoup3SourceRecipe = recipe;
