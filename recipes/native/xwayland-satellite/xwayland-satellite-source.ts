//! xwayland-satellite source download.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/Supreeeme/xwayland-satellite/archive/refs/tags/v0.8.1.tar.gz",
  hash: "00516478b15a23d8ab86a72f94c6cc571ccf2f9260c04ecfa098a3b191434e6d",
});

export const xwaylandSatelliteSourceRecipe = recipe;
