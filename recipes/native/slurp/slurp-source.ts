//! slurp source download.
//!
//! emersion/slurp 1.5.0 — screen region selector for Wayland compositors.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/emersion/slurp/archive/refs/tags/v1.5.0.tar.gz",
  hash: "39d4a6e641d8297d1eb54b1d730e628cdd3c314d08e0d6ab943eea2fe015a48d",
});

export const slurpSourceRecipe = recipe;
