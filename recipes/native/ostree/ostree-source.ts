//! ostree source download.
//!
//! libostree 2025.7 — content-addressed object store and deployment system.
//! Used by flatpak for application storage.

import { fetchTarball } from "../../../js/src/index.js";

const recipe = await fetchTarball({
  url: "https://github.com/ostreedev/ostree/releases/download/v2025.7/libostree-2025.7.tar.xz",
  hash: "ec370196246823b4d1997c910b69032543d7588612c8124bd1e4af5e4830f9e5",
});

export const ostreeSourceRecipe = recipe;
