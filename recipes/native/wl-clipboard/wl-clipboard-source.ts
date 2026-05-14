//! wl-clipboard source download.
//!
//! wl-clipboard 2.3.0 — command-line Wayland clipboard utilities (wl-copy, wl-paste).

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/bugaevc/wl-clipboard/archive/refs/tags/v2.3.0.tar.gz",
  hash: "4becb8c6775b0c2e4ddd15b503ffee39d44c0a2ec79a2642fb16ef2f89aea639",
});

export const wlClipboardSourceRecipe = recipe;
