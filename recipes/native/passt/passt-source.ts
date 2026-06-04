//! passt source download.
//!
//! passt/pasta 2026_05_26 — user-mode networking for VMs and containers.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://passt.top/passt/snapshot/passt-2026_05_26.038c51e.tar.gz",
  hash: "725b8fd53fb5cc274ea4e3128243796e5379ebaaee32be85be262c116d21955f",
});

export const passtSourceRecipe = recipe;
