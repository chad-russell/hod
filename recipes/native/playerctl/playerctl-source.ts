//! playerctl source download.
//!
//! altdesktop/playerctl 2.4.1 — MPRIS media player command-line controller.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/altdesktop/playerctl/archive/refs/tags/v2.4.1.tar.gz",
  hash: "6a8f5b93a25f6127c729822be96f423c645f2bd19c5b3d1570e643bb06f30613",
});

export const playerctlSourceRecipe = recipe;
