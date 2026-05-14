//! grim source download.
//!
//! emersion/grim 1.4.0 — screenshot utility for Wayland compositors.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/emersion/grim/archive/refs/tags/v1.4.0.tar.gz",
  hash: "d0663277bb68a214f877467b72caf35a1120ff2d09c586b2d981548f100e1e6f",
});

export const grimSourceRecipe = recipe;
