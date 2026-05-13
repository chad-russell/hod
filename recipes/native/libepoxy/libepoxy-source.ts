//! libepoxy source download.
//!
//! libepoxy 1.5.10 — OpenGL function pointer management library.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://download.gnome.org/sources/libepoxy/1.5/libepoxy-1.5.10.tar.xz",
  hash: "0ccee9635115fe417cfc4bc33ffd160bf1e2852bd6c03816b4af771d59462f53",
});

export const libepoxySourceRecipe = recipe;
