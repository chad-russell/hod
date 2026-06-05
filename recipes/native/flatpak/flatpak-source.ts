//! flatpak source download.
//!
//! Flatpak 1.16.6 — Linux application sandboxing and distribution framework.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/flatpak/flatpak/releases/download/1.16.6/flatpak-1.16.6.tar.xz",
  hash: "ed19654b8a1033a2de130d5a019c1ab53f8a4601be1e713f89aa103bee933484",
});

export const flatpakSourceRecipe = recipe;
