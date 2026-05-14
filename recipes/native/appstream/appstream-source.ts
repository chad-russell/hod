//! appstream source download.
//!
//! AppStream 1.1.2 — cross-distribution software metadata format.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://www.freedesktop.org/software/appstream/releases/AppStream-1.1.2.tar.xz",
  hash: "5e4685b2100d861b842665b35f4a84c3f337650cac9c8034b2a7a575ee6ea10a",
  stripComponents: 2,
});

export const appstreamSourceRecipe = recipe;
