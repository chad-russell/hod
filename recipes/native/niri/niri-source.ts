//! niri source download.
//!
//! niri 26.04 — scrollable-tiling Wayland compositor.

import { fetchTarball } from "../../../js/src/index.js";

export const niriSourceRecipe = await fetchTarball({
  url: "https://github.com/niri-wm/niri/archive/refs/tags/v26.04.tar.gz",
  hash: "1f5418f97c7a0642c7c1e1ad6da0175444dba3189f7c80f6ba63d1ef50597d4e",
});
